import type { WorktreeGraph, WorktreeId } from '../../domain/worktree-graph/types'
import {
  emptyFanOutSlice,
  fanOutMemberIds,
  reduceFanOut,
  toFanOutInputs
} from '../../application/fan-out-model'
import type { FanOutAction, FanOutSlice } from '../../application/fan-out-model'
import type { RuntimeGateway } from '../../application/ports/runtime-gateway'
import type { CamadaMemberPoll } from '../../application/camada-member-poll'
import type { FanOutFormHandle } from './fan-out-element'
import { fanOutViewModel } from './fan-out-view-model'

/** listRepos/createWorktree for the controller, listWorktreePs for the member poll it owns —
 *  one port satisfies both, so rebindGateway can hand the same object to each. */
export type FanOutGatewayPort = Pick<
  RuntimeGateway,
  'listRepos' | 'createWorktree' | 'listWorktreePs'
>

export type FanOutControllerDeps = {
  gateway: FanOutGatewayPort
  createElement: () => FanOutFormHandle
  hud: { appendChild(element: unknown): void }
  dispatch: (action: FanOutAction) => void
  /** Frames the camera on the litter (parent + created children) — mirrors focusIsland. */
  focusLitter: (memberIds: readonly WorktreeId[]) => void
  /** Started after a successful (or partially successful) submit, stopped on close/cancel. */
  memberPoll: CamadaMemberPoll
  /** Fired after the batch settles — snappier than waiting for the live-sync poll. */
  refetch: () => Promise<void>
  /** Injectable for deterministic tests; defaults to the real UUID generator. */
  generateMutationId?: () => string
  /** Repos slice's active repo (mirrors spawn-menu-controller) — preferred over `repos[0]`. */
  activeRepoId?: () => string | null
}

export type FanOutController = {
  sync(fanOut: FanOutSlice, graph: WorktreeGraph): void
  rebindGateway(gateway: FanOutGatewayPort): void
  dispose(): void
}

/**
 * Owns the fan-out form/running lifecycle, mirroring spawn-menu-controller.ts: mounts the HUD
 * element as `fanOut.view` moves away from 'closed', resolves the repo selector once per open,
 * and drives the sequential `createWorktree` batch on submit.
 */
export function createFanOutController(deps: FanOutControllerDeps): FanOutController {
  let gateway = deps.gateway
  let element: FanOutFormHandle | null = null
  let currentSlice: FanOutSlice = emptyFanOutSlice()
  let previousView: FanOutSlice['view'] = 'closed'
  let repoFetchInFlight = false

  const generateMutationId = deps.generateMutationId ?? (() => crypto.randomUUID())
  const activeRepoId = deps.activeRepoId ?? (() => null)

  const unmount = (): void => {
    if (!element) return
    element.dispose()
    element = null
  }

  const mount = (): FanOutFormHandle => {
    if (!element) {
      const created = deps.createElement()
      created.onCountChange((count) => deps.dispatch({ type: 'update-count', count }))
      created.onAgentChange((agent) => deps.dispatch({ type: 'update-agent', agent }))
      created.onPromptChange((prompt) => deps.dispatch({ type: 'update-prompt', prompt }))
      created.onSubmit(() => void handleSubmit())
      created.onCancel(() => deps.dispatch({ type: 'cancel' }))
      deps.hud.appendChild(created.element)
      element = created
    }
    return element
  }

  const maybeFetchRepoSelector = (slice: FanOutSlice): void => {
    if (slice.view === 'closed' || slice.repoSelector !== null || repoFetchInFlight) return
    repoFetchInFlight = true
    void gateway
      .listRepos()
      .then((repos) => {
        const id = activeRepoId() ?? repos[0]?.id
        if (id) deps.dispatch({ type: 'set-repo-selector', repoSelector: `id:${id}` })
      })
      .finally(() => {
        repoFetchInFlight = false
      })
  }

  const handleSubmit = async (): Promise<void> => {
    const slice = currentSlice
    if (slice.view !== 'form') return
    if (slice.repoSelector === null) {
      deps.dispatch({ type: 'form-error', message: 'repositorio aún no resuelto' })
      return
    }
    const repoSelector = slice.repoSelector
    const mutationIds = Array.from({ length: slice.fields.count }, () => generateMutationId())
    deps.dispatch({ type: 'submit', mutationIds })

    // Local mirror of the reducer transition — lets the loop compute member ids for the camera
    // and poll start without depending on the store round-tripping through sync() mid-flight.
    let localSlice = reduceFanOut(slice, { type: 'submit', mutationIds })
    const inputs = toFanOutInputs(slice, repoSelector, mutationIds)

    for (let i = 0; i < mutationIds.length; i++) {
      const mutationId = mutationIds[i]!
      try {
        const result = await gateway.createWorktree(inputs[i]!)
        localSlice = reduceFanOut(localSlice, {
          type: 'child-created',
          mutationId,
          worktreeId: result.worktreeId
        })
        deps.dispatch({ type: 'child-created', mutationId, worktreeId: result.worktreeId })
      } catch {
        localSlice = reduceFanOut(localSlice, { type: 'child-failed', mutationId })
        deps.dispatch({ type: 'child-failed', mutationId })
      }
    }

    deps.focusLitter(fanOutMemberIds(localSlice))
    deps.memberPoll.start()
    await deps.refetch()
  }

  return {
    // `graph` kept in the signature to mirror spawn/project-selector's sync(slice, graph)
    // shape, though fanOutViewModel needs only the slice (no parent-branch title here).
    sync(fanOut: FanOutSlice, _graph: WorktreeGraph): void {
      currentSlice = fanOut
      maybeFetchRepoSelector(fanOut)
      if (fanOut.view === 'closed') {
        unmount()
        deps.memberPoll.stop()
        previousView = 'closed'
        return
      }
      const model = fanOutViewModel(fanOut)
      const mounted = mount()
      if (model !== null) mounted.apply(model)
      // display:none force-blurs a focused descendant, mirroring project-selector's focusPath()
      // and spawn-form's focusFirstField() fix on the closed -> form transition.
      if (previousView === 'closed' && fanOut.view === 'form') mounted.focusFirstField()
      previousView = fanOut.view
    },
    rebindGateway(newGateway: FanOutGatewayPort): void {
      gateway = newGateway
      deps.memberPoll.rebindGateway(newGateway)
    },
    dispose(): void {
      unmount()
      deps.memberPoll.stop()
    }
  }
}
