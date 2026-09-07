import { describe, expect, it } from 'vitest'
import { createSystemGraphPublisher } from './system-graph-publish'
import { createSceneStore } from './scene-store'
import type { SceneStore } from './scene-store'
import type { BranchCompareEntriesGateway } from './branch-compare-entries-fetch'
import type { BranchCompare, SystemGraphSnapshot } from './ports/runtime-gateway'
import { emptyWorktreeGraph } from '../domain/worktree-graph/types'
import type { WorktreeNode } from '../domain/worktree-graph/types'
import { inertActivity } from '../domain/worktree-graph/node-activity'

/** Flushes chained promises so a cache's background fetch settles (mirrors system-file-diff-cache.test.ts). */
const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** One router, one endpoint — enough to exercise the file-diff join without extra fixtures. */
const realisticSnapshot: SystemGraphSnapshot = {
  nodes: [
    { id: 'router:src/routes/users.ts', kind: 'router', label: 'src/routes/users.ts', diff: null },
    {
      id: 'endpoint:src/routes/users.ts#0',
      kind: 'endpoint',
      label: 'GET /users',
      method: 'GET',
      path: '/users',
      diff: null
    }
  ],
  edges: [
    { from: 'router:src/routes/users.ts', to: 'endpoint:src/routes/users.ts#0', kind: 'normal' }
  ]
}

const readyCompare = (overrides: Partial<BranchCompare> = {}): BranchCompare => ({
  changedFiles: 1,
  commitsAhead: 1,
  commitsBehind: 0,
  baseRef: 'refs/heads/main',
  headOid: 'head-oid',
  mergeBase: 'merge-base',
  status: 'ready',
  entries: [{ path: 'src/routes/users.ts', status: 'modified', added: 34, removed: 8 }],
  ...overrides
})

const worktreeNode = (overrides: Partial<WorktreeNode> = {}): WorktreeNode => ({
  id: '/wt/alpha',
  repoId: 'repo',
  branch: 'refs/heads/feature',
  path: '/wt/alpha',
  status: 'in-progress',
  isMain: false,
  kind: 'worktree',
  parentId: null,
  childIds: [],
  activity: inertActivity(),
  baseRef: 'refs/heads/main',
  ...overrides
})

type FakeGateway = BranchCompareEntriesGateway & {
  calls: number
  impl?: (worktree: string, baseRef: string) => Promise<BranchCompare>
}

function createFakeGateway(): FakeGateway {
  const gw: FakeGateway = {
    calls: 0,
    gitBranchCompare: async (worktree, baseRef) => {
      gw.calls += 1
      if (gw.impl) return gw.impl(worktree, baseRef)
      return readyCompare()
    }
  }
  return gw
}

/** A single-node graph the diff cache can resolve a base ref against, with the view open. */
function setup(): { store: SceneStore } {
  const store = createSceneStore()
  const node = worktreeNode()
  store.update({ graph: { ...emptyWorktreeGraph(), nodes: new Map([[node.id, node]]) } })
  store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
  return { store }
}

function graphOf(store: SceneStore) {
  const slice = store.get().systemView
  if (slice.view !== 'open') throw new Error('expected systemView to be open')
  return slice.graph
}

describe('createSystemGraphPublisher', () => {
  it('maps the snapshot and dispatches replace-graph with base (idle/null) state synchronously', () => {
    const gateway = createFakeGateway()
    const { store } = setup()
    const publisher = createSystemGraphPublisher({ store, gateway })

    publisher.publish('/wt/alpha', realisticSnapshot)

    expect(graphOf(store).nodes.get('router:src/routes/users.ts')).toMatchObject({
      state: 'idle',
      diff: null
    })
    publisher.stop()
  })

  it('re-publishes the last snapshot once the diff cache lands fresh entries', async () => {
    const gateway = createFakeGateway()
    const { store } = setup()
    const publisher = createSystemGraphPublisher({ store, gateway })

    publisher.publish('/wt/alpha', realisticSnapshot)
    await flush()
    await flush()

    expect(graphOf(store).nodes.get('router:src/routes/users.ts')).toMatchObject({
      state: 'dirty',
      diff: { added: 34, removed: 8 }
    })
    publisher.stop()
  })

  it('base graph stays idle/null when the compare resolves but is not ready', async () => {
    const gateway = createFakeGateway()
    gateway.impl = async () => readyCompare({ status: 'invalid-base', entries: [] })
    const { store } = setup()
    const publisher = createSystemGraphPublisher({ store, gateway })

    publisher.publish('/wt/alpha', realisticSnapshot)
    await flush()
    await flush()

    expect(graphOf(store).nodes.get('router:src/routes/users.ts')).toMatchObject({
      state: 'idle',
      diff: null
    })
    publisher.stop()
  })

  it('does not re-publish while the view is closed', async () => {
    const gateway = createFakeGateway()
    const gate = deferred<BranchCompare>()
    gateway.impl = () => gate.promise
    const { store } = setup()
    const publisher = createSystemGraphPublisher({ store, gateway })

    publisher.publish('/wt/alpha', realisticSnapshot)
    store.dispatchSystemView({ type: 'close' })
    gate.resolve(readyCompare())
    await flush()
    await flush()

    expect(store.get().systemView).toEqual({ view: 'closed' })
    publisher.stop()
  })

  it('publishes nothing further after stop()', async () => {
    const gateway = createFakeGateway()
    const gate = deferred<BranchCompare>()
    gateway.impl = () => gate.promise
    const { store } = setup()
    const publisher = createSystemGraphPublisher({ store, gateway })

    publisher.publish('/wt/alpha', realisticSnapshot)
    publisher.stop()
    const before = graphOf(store)

    gate.resolve(readyCompare())
    await flush()
    await flush()

    expect(graphOf(store)).toEqual(before)
  })

  it('ignores a re-publish for a superseded worktree', async () => {
    const gateway = createFakeGateway()
    const lateAlpha = deferred<BranchCompare>()
    gateway.impl = () => lateAlpha.promise
    const store = createSceneStore()
    store.update({
      graph: {
        ...emptyWorktreeGraph(),
        nodes: new Map([
          ['/wt/alpha', worktreeNode({ id: '/wt/alpha' })],
          ['/wt/beta', worktreeNode({ id: '/wt/beta', branch: 'refs/heads/beta' })]
        ])
      }
    })
    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    const publisher = createSystemGraphPublisher({ store, gateway })

    publisher.publish('/wt/alpha', realisticSnapshot) // kicks alpha's fetch, which hangs on `lateAlpha`
    gateway.impl = async () =>
      readyCompare({
        entries: [{ path: 'src/routes/users.ts', status: 'modified', added: 99, removed: 1 }]
      })
    publisher.publish('/wt/beta', realisticSnapshot) // switch — supersedes alpha's in-flight fetch
    await flush()
    await flush()

    lateAlpha.resolve(
      readyCompare({
        entries: [{ path: 'src/routes/users.ts', status: 'modified', added: 1, removed: 1 }]
      })
    )
    await flush()
    await flush()

    expect(graphOf(store).nodes.get('router:src/routes/users.ts')).toMatchObject({
      diff: { added: 99, removed: 1 }
    })
    publisher.stop()
  })

  it('publish() after stop() resumes the re-publish-on-fresh-entries behavior (Wave F3 worktree switch)', async () => {
    const gateway = createFakeGateway()
    const { store } = setup()
    const publisher = createSystemGraphPublisher({ store, gateway })

    publisher.publish('/wt/alpha', realisticSnapshot)
    publisher.stop()
    publisher.publish('/wt/alpha', realisticSnapshot) // e.g. a poll re-entering after a switch
    await flush()
    await flush()

    expect(graphOf(store).nodes.get('router:src/routes/users.ts')).toMatchObject({
      state: 'dirty',
      diff: { added: 34, removed: 8 }
    })
    publisher.stop()
  })

  it('rebindGateway forwards to the cache', async () => {
    const gatewayA = createFakeGateway()
    const gatewayB = createFakeGateway()
    const { store } = setup()
    const publisher = createSystemGraphPublisher({ store, gateway: gatewayA })

    publisher.rebindGateway(gatewayB)
    publisher.publish('/wt/alpha', realisticSnapshot)
    await flush()
    await flush()

    expect(gatewayA.calls).toBe(0)
    expect(gatewayB.calls).toBe(1)
    publisher.stop()
  })
})
