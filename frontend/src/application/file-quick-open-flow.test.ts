import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFileQuickOpenFlow } from './file-quick-open-flow'
import type { FileQuickOpenView } from './file-quick-open-flow'

const match = (relativePath: string, binary = false) => ({
  relativePath,
  basename: relativePath.split('/').pop() ?? relativePath,
  binary
})

function setup(
  search: (worktree: string, query: string, limit?: number) => Promise<unknown> = async () => ({
    files: [match('src/a.ts'), match('src/b.ts')],
    truncated: false
  })
) {
  const gateway = { filesSearchPaths: vi.fn(search) as never }
  const onPick = vi.fn()
  const flow = createFileQuickOpenFlow({ gateway, onPick, debounceMs: 100 })
  return { flow, gateway: gateway.filesSearchPaths as ReturnType<typeof vi.fn>, onPick }
}

const open = (view: FileQuickOpenView) => {
  if (view.phase !== 'open') throw new Error(`expected open, got ${view.phase}`)
  return view
}

describe('file quick-open flow', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('opens empty without hitting the host', () => {
    const { flow, gateway } = setup()
    flow.open('r::/w')
    expect(open(flow.view())).toMatchObject({ nodeId: 'r::/w', query: '', rows: [] })
    expect(gateway).not.toHaveBeenCalled()
  })

  it('debounces typing into a single search with the node as selector', async () => {
    const { flow, gateway } = setup()
    flow.open('r::/w')
    flow.setQuery('a')
    flow.setQuery('ab')
    await vi.advanceTimersByTimeAsync(99)
    expect(gateway).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(gateway).toHaveBeenCalledTimes(1)
    expect(gateway).toHaveBeenCalledWith('r::/w', 'ab', 20)
    expect(open(flow.view()).rows.map((row) => row.relativePath)).toEqual(['src/a.ts', 'src/b.ts'])
    expect(open(flow.view()).searching).toBe(false)
  })

  it('marks searching while a request is pending', async () => {
    const resolvers: Array<(value: unknown) => void> = []
    const { flow } = setup(() => new Promise((resolve) => resolvers.push(resolve)))
    flow.open('w')
    flow.setQuery('x')
    await vi.advanceTimersByTimeAsync(100)
    expect(open(flow.view()).searching).toBe(true)
    resolvers[0]!({ files: [], truncated: false })
    await vi.advanceTimersByTimeAsync(0)
    expect(open(flow.view()).searching).toBe(false)
  })

  it('drops a stale reply that lands after a newer query', async () => {
    const resolvers: Array<(value: unknown) => void> = []
    const { flow } = setup(() => new Promise((resolve) => resolvers.push(resolve)))
    flow.open('w')
    flow.setQuery('a')
    await vi.advanceTimersByTimeAsync(100)
    flow.setQuery('ab')
    await vi.advanceTimersByTimeAsync(100)
    resolvers[1]!({ files: [match('new.ts')], truncated: false })
    await vi.advanceTimersByTimeAsync(0)
    resolvers[0]!({ files: [match('old.ts')], truncated: false })
    await vi.advanceTimersByTimeAsync(0)
    expect(open(flow.view()).rows.map((row) => row.relativePath)).toEqual(['new.ts'])
  })

  it('clearing the query empties the rows without a request', async () => {
    const { flow, gateway } = setup()
    flow.open('w')
    flow.setQuery('a')
    await vi.advanceTimersByTimeAsync(100)
    flow.setQuery('  ')
    await vi.advanceTimersByTimeAsync(200)
    expect(gateway).toHaveBeenCalledTimes(1)
    expect(open(flow.view()).rows).toEqual([])
  })

  it('surfaces a readable error, e.g. the bundled ripgrep failing to start', async () => {
    const { flow } = setup(async () => {
      throw new Error("Orca's bundled search tool (ripgrep) could not start.")
    })
    flow.open('w')
    flow.setQuery('a')
    await vi.advanceTimersByTimeAsync(100)
    expect(open(flow.view()).error).toEqual({
      lead: 'falló la búsqueda',
      detail: "Orca's bundled search tool (ripgrep) could not start."
    })
    expect(open(flow.view()).searching).toBe(false)
  })

  it('wraps the highlight in both directions and resets it on a new result set', async () => {
    const { flow } = setup()
    flow.open('w')
    flow.setQuery('a')
    await vi.advanceTimersByTimeAsync(100)
    flow.moveHighlight(-1)
    expect(open(flow.view()).highlighted).toBe(1)
    flow.moveHighlight(1)
    expect(open(flow.view()).highlighted).toBe(0)
  })

  it('activates the highlighted row, closing the picker and reporting the pick', async () => {
    const { flow, onPick } = setup()
    flow.open('r::/w')
    flow.setQuery('a')
    await vi.advanceTimersByTimeAsync(100)
    flow.moveHighlight(1)
    flow.activate()
    expect(onPick).toHaveBeenCalledWith('r::/w', 'src/b.ts')
    expect(flow.view()).toEqual({ phase: 'closed' })
  })

  it('activates a clicked row by index regardless of the highlight', async () => {
    const { flow, onPick } = setup()
    flow.open('w')
    flow.setQuery('a')
    await vi.advanceTimersByTimeAsync(100)
    flow.activate(1)
    expect(onPick).toHaveBeenCalledWith('w', 'src/b.ts')
  })

  it('ignores activate with no rows, and close cancels a pending search', async () => {
    const { flow, onPick, gateway } = setup()
    flow.open('w')
    flow.activate()
    expect(onPick).not.toHaveBeenCalled()
    flow.setQuery('a')
    expect(flow.close()).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(gateway).not.toHaveBeenCalled()
    expect(flow.close()).toBe(false)
  })

  it('rebinding the gateway affects the next search', async () => {
    const { flow, gateway } = setup()
    const next = vi.fn(async () => ({ files: [match('z.ts')], truncated: false }))
    flow.rebindGateway({ filesSearchPaths: next })
    flow.open('w')
    flow.setQuery('z')
    await vi.advanceTimersByTimeAsync(100)
    expect(next).toHaveBeenCalled()
    expect(gateway).not.toHaveBeenCalled()
  })
})
