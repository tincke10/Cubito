// Headless orcad has no Electron main to hand the runtime its hook-status readers, so
// worktree.ps reported `active` + no agents while a hook-driven agent was working.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { fromId: vi.fn(() => null) },
  webContents: { fromId: vi.fn(() => null) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp'), isPackaged: false }
}))

vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({ getCohortAtEmit: vi.fn(() => ({})) }))

const listWorktreesStrictMock = vi.hoisted(() => vi.fn())
vi.mock('../git/worktree', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listWorktreesStrict: listWorktreesStrictMock
}))

import { AgentHookServer, _internals } from '../agent-hooks/server'
import { buildBody, postHookEvent, PANE } from '../agent-hooks/server.test-fixtures'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { createOrcadAgentStatusDeps } from './orcad-agent-status-deps'

const REPO_ID = 'repo-1'
const REPO_PATH = '/workspaces/demo'
const WORKTREE_PATH = '/workspaces/demo/probe'
const WORKTREE_ID = `${REPO_ID}::${WORKTREE_PATH}`

function makeMeta(displayName: string) {
  return {
    displayName,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
}

function makeStore() {
  const metaById = {
    [WORKTREE_ID]: makeMeta('probe'),
    [`${REPO_ID}::${REPO_PATH}`]: makeMeta('main')
  }
  const store = {
    getRepo: (id: string) => store.getRepos().find((repo) => repo.id === id),
    getRepos: () => [
      { id: REPO_ID, path: REPO_PATH, displayName: 'demo', badgeColor: 'blue', addedAt: 1 }
    ],
    getAllWorktreeMeta: () => metaById,
    getWorktreeMeta: (id: string) => (metaById as Record<string, unknown>)[id],
    setWorktreeMeta: (id: string, meta: Record<string, unknown>) => {
      const next = { ...makeMeta(id), ...meta }
      ;(metaById as Record<string, unknown>)[id] = next
      return next
    },
    removeWorktreeMeta: () => {},
    removeWorktreeLineage: () => {},
    removeWorkspaceLineage: () => {},
    getAllWorktreeLineage: () => ({}),
    getAllWorkspaceLineage: () => ({}),
    getGitHubCache: () => undefined as never,
    getWorkspaceSession: () => ({
      tabsByWorktree: {
        [WORKTREE_ID]: [{ id: 'tab-1', ptyId: null, worktreeId: WORKTREE_ID, title: 'Claude' }]
      },
      terminalLayoutsByTabId: {}
    }),
    getSettings: () => ({
      workspaceDir: '/tmp/workspaces',
      nestWorkspaces: false,
      refreshLocalBaseRefOnWorktreeCreate: false,
      branchPrefix: 'none',
      branchPrefixCustom: ''
    }),
    getProjects: () => []
  }
  return store
}

describe('orcad agent hook status reaches worktree.ps', () => {
  let server: AgentHookServer

  beforeEach(async () => {
    _internals.resetCachesForTests()
    listWorktreesStrictMock.mockResolvedValue([
      { path: REPO_PATH, head: 'abc', branch: 'main', isBare: false, isMainWorktree: true },
      { path: WORKTREE_PATH, head: 'def', branch: 'probe', isBare: false, isMainWorktree: false }
    ])
    server = new AgentHookServer()
    await server.start({ env: 'production' })
  })

  afterEach(() => {
    server.stop()
  })

  async function psSummary() {
    const runtime = new OrcaRuntimeService(makeStore() as never, undefined, {
      ...createOrcadAgentStatusDeps(server)
    })
    const { worktrees } = await runtime.getWorktreePs()
    return worktrees.find((worktree) => worktree.worktreeId === WORKTREE_ID)
  }

  function hook(payload: Record<string, unknown>) {
    return postHookEvent(server, buildBody(payload, { paneKey: PANE, worktreeId: WORKTREE_ID }))
  }

  it('reports working with an agent row while a hook says the agent is working', async () => {
    await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'do the thing' })

    expect(await psSummary()).toMatchObject({
      status: 'working',
      hasHostSidebarActivity: true,
      agents: [expect.objectContaining({ agentType: 'claude', state: 'working' })]
    })
  })

  it('reports permission when the agent is blocked on a permission prompt', async () => {
    await hook({
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
      tool_input: { command: 'ls' }
    })

    expect(await psSummary()).toMatchObject({
      status: 'permission',
      agents: [expect.objectContaining({ state: 'waiting' })]
    })
  })

  it('stops reporting working once the agent turn ends', async () => {
    await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'do the thing' })
    await hook({ hook_event_name: 'Stop' })

    const summary = await psSummary()

    expect(summary?.status).not.toBe('working')
    expect(summary?.status).not.toBe('permission')
  })
})
