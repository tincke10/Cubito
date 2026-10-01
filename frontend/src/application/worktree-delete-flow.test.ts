import { describe, expect, it, vi } from 'vitest'
import { createWorktreeDeleteFlow } from './worktree-delete-flow'
import type { WorktreeDeleteFlowDeps, WorktreeDeleteView } from './worktree-delete-flow'
import { createSceneStore } from './scene-store'
import { buildWorktreeGraph } from '../domain/worktree-graph/build-graph'
import type { RawWorktreeRecord } from '../domain/worktree-graph/build-graph'

const record = (
  id: string,
  over: Partial<RawWorktreeRecord> & { main?: boolean } = {}
): RawWorktreeRecord => ({
  id,
  repoId: 'r',
  branch: `refs/heads/${id.split('/').pop()}`,
  parentWorktreeId: null,
  childWorktreeIds: [],
  workspaceStatus: 'in-progress',
  git: { path: `/${id}`, isMainWorktree: over.main === true },
  ...over
})

const records = [
  record('r::/main', { main: true, childWorktreeIds: ['r::/a'] }),
  record('r::/a', {
    parentWorktreeId: 'r::/main',
    childWorktreeIds: ['r::/b'],
    agentStatus: 'working'
  }),
  record('r::/b', { parentWorktreeId: 'r::/a' })
]

function setup(over: Partial<WorktreeDeleteFlowDeps['gateway']> = {}) {
  const store = createSceneStore()
  store.update({ graph: buildWorktreeGraph(records) })
  store.select('r::/a')
  const gateway = {
    worktreeRemove: vi.fn(async () => ({ removed: true as const })),
    gitStatus: vi.fn(async () => ({
      entries: [
        { path: 'x', status: 'modified', added: 1, removed: 0 },
        { path: 'y', status: 'untracked', added: 1, removed: 0 }
      ],
      branch: 'a',
      branchLineTotal: 2
    })),
    ...over
  }
  const refreshGraph = vi.fn(async () => undefined)
  const afterRemoved = vi.fn()
  const flow = createWorktreeDeleteFlow({ store, gateway, refreshGraph, afterRemoved })
  const views: WorktreeDeleteView[] = []
  flow.subscribe((view) => views.push(view))
  return { store, gateway, refreshGraph, afterRemoved, flow, views }
}

const open = (view: WorktreeDeleteView) => {
  if (view.phase !== 'open') throw new Error(`expected open, got ${view.phase}`)
  return view
}

describe('worktree delete flow', () => {
  it('blocks the primary worktree without touching the gateway', () => {
    const { flow, gateway } = setup()
    flow.request('r::/main')
    expect(open(flow.view()).blocked).toBe(true)
    flow.confirm()
    expect(gateway.worktreeRemove).not.toHaveBeenCalled()
  })

  it('summarises dirty files, children and agent state; counts live terminals', async () => {
    const { flow, store } = setup()
    store.dispatchTerminal({ type: 'open-terminal-for-node', nodeId: 'r::/a' })
    flow.request('r::/a')
    expect(open(flow.view()).dirtyFiles).toBe('loading')
    await vi.waitFor(() => expect(open(flow.view()).dirtyFiles).toBe(2))
    const view = open(flow.view())
    expect(view.children).toEqual(['b'])
    expect(view.agentStatus).toBe('working')
    expect(view.liveTerminals).toBe(1)
  })

  it('degrades the dirty count to unknown when git.status fails', async () => {
    const { flow } = setup({
      gitStatus: vi.fn(async () => {
        throw new Error('boom')
      })
    })
    flow.request('r::/a')
    await vi.waitFor(() => expect(open(flow.view()).dirtyFiles).toBe('unknown'))
  })

  it('removes without force first, then cleans graph, selection and terminals', async () => {
    const { flow, gateway, store, refreshGraph, afterRemoved } = setup()
    store.dispatchTerminal({ type: 'open-terminal-for-node', nodeId: 'r::/a' })
    flow.request('r::/a')
    await flow.confirm()
    expect(gateway.worktreeRemove).toHaveBeenCalledWith('r::/a', {})
    expect(store.get().terminals.byNode.get('r::/a') ?? []).toHaveLength(0)
    expect(store.get().selection.selectedId).toBe('r::/main')
    expect(refreshGraph).toHaveBeenCalled()
    expect(afterRemoved).toHaveBeenCalledWith('r::/main')
    expect(flow.view().phase).toBe('idle')
  })

  it('sends hostId when the node has one', async () => {
    const { flow, gateway, store } = setup()
    store.update({
      graph: buildWorktreeGraph(
        records.map((r) => (r.id === 'r::/a' ? { ...r, hostId: 'ssh:box' } : r))
      )
    })
    flow.request('r::/a')
    await flow.confirm()
    expect(gateway.worktreeRemove).toHaveBeenCalledWith('r::/a', { hostId: 'ssh:box' })
  })

  it('keeps the panel open on failure and offers force; the retry sends force', async () => {
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new Error('contains modified files'))
      .mockResolvedValueOnce({ removed: true })
    const { flow } = setup({ worktreeRemove: remove })
    flow.request('r::/a')
    await flow.confirm()
    const failed = open(flow.view())
    expect(failed.error).toBe('contains modified files')
    expect(failed.forceOffered).toBe(true)
    expect(failed.removing).toBe(false)
    await flow.confirm()
    expect(remove).toHaveBeenLastCalledWith('r::/a', { force: true })
    expect(flow.view().phase).toBe('idle')
  })

  it('ignores a second confirm while a removal is in flight', async () => {
    const gate: { release: () => void } = { release: () => undefined }
    const remove = vi.fn(
      () =>
        new Promise<{ removed: true }>((resolve) => {
          gate.release = () => resolve({ removed: true })
        })
    )
    const { flow } = setup({ worktreeRemove: remove })
    flow.request('r::/a')
    const first = flow.confirm()
    void flow.confirm()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(open(flow.view()).removing).toBe(true)
    gate.release()
    await first
  })

  it('cancel closes the panel unless a removal is running', () => {
    const { flow } = setup()
    flow.request('r::/a')
    expect(flow.cancel()).toBe(true)
    expect(flow.view().phase).toBe('idle')
    expect(flow.cancel()).toBe(false)
  })

  it('does nothing for an unknown node', () => {
    const { flow } = setup()
    flow.request('r::/nope')
    expect(flow.view().phase).toBe('idle')
  })
})
