import { cubeNameFor, fanOutObjectiveText, reduceFanOut } from './fan-out-model'
import type { FanOutAction, FanOutSlice } from './fan-out-model'
import type { RuntimeGateway } from './ports/runtime-gateway'

/** listRepos/createWorktree + the 3 lease verbs — everything the lease submit loop calls. */
export type FanOutLeaseGatewayPort = Pick<
  RuntimeGateway,
  | 'createWorktree'
  | 'orchestrationRunCreate'
  | 'orchestrationTaskCreate'
  | 'orchestrationWorkerStart'
>

export type FanOutLeaseSubmitDeps = {
  gateway: FanOutLeaseGatewayPort
  dispatch: (action: FanOutAction) => void
}

export type FanOutLeaseSubmitResult = {
  localSlice: FanOutSlice
  /** `orchestration.runCreate` itself threw — caller falls back to the v1 worktree-only loop. */
  runCreateFailed: boolean
}

/**
 * Lease-run submit planner (Change B): one `orchestration.runCreate`, then per child
 * `worktree.create` (no startup agent — `workerStart` launches it from the task spec) ->
 * `orchestration.taskCreate` -> `orchestration.workerStart`. Continue-on-error per child
 * (v1 parity): a worktree or worker failure marks that child failed and moves on. A
 * `runCreate` failure aborts before any child work — the whole batch falls back to v1.
 */
export async function runCamadaLeaseSubmit(
  slice: FanOutSlice,
  repoSelector: string,
  mutationIds: readonly string[],
  deps: FanOutLeaseSubmitDeps
): Promise<FanOutLeaseSubmitResult> {
  if (slice.view !== 'form') return { localSlice: slice, runCreateFailed: false }

  let localSlice = reduceFanOut(slice, { type: 'submit', mutationIds })
  const objective = fanOutObjectiveText(slice.fields)

  let runId: string
  try {
    const run = await deps.gateway.orchestrationRunCreate({ objective })
    runId = run.runId
  } catch {
    return { localSlice, runCreateFailed: true }
  }
  localSlice = apply(localSlice, deps, { type: 'run-created', runId })

  for (const mutationId of mutationIds) {
    const cubeName = cubeNameFor(mutationId)
    let worktreeId: string
    try {
      const worktree = await deps.gateway.createWorktree({
        repo: repoSelector,
        parentWorktree: slice.parentId,
        clientMutationId: mutationId,
        name: cubeName,
        nameWasGenerated: true
      })
      worktreeId = worktree.worktreeId
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      localSlice = apply(localSlice, deps, { type: 'child-failed', mutationId, message })
      continue
    }
    localSlice = apply(localSlice, deps, { type: 'child-created', mutationId, worktreeId })

    try {
      const task = await deps.gateway.orchestrationTaskCreate({
        spec: objective,
        run: runId,
        displayName: cubeName
      })
      const worker = await deps.gateway.orchestrationWorkerStart({
        task: task.taskId,
        run: runId,
        worktree: worktreeId,
        displayName: cubeName,
        ...(slice.fields.agent !== 'none' ? { agent: slice.fields.agent } : {})
      })
      localSlice = apply(localSlice, deps, {
        type: 'child-dispatched',
        mutationId,
        dispatchId: worker.dispatchId,
        taskId: task.taskId
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      localSlice = apply(localSlice, deps, { type: 'child-failed', mutationId, message })
    }
  }

  return { localSlice, runCreateFailed: false }
}

/** Keeps the local mirror and the dispatched action in lockstep — same shape as the
 *  controller's own local-reduce mirror for the v1 loop (fan-out-controller.ts). */
function apply(slice: FanOutSlice, deps: FanOutLeaseSubmitDeps, action: FanOutAction): FanOutSlice {
  deps.dispatch(action)
  return reduceFanOut(slice, action)
}
