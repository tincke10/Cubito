import { describe, expect, it, vi } from 'vitest'
import { createFanOutController } from './fan-out-controller'
import type { FanOutControllerDeps } from './fan-out-controller'
import { emptyFanOutSlice } from '../../application/fan-out-model'
import type { FanOutAction, FanOutSlice } from '../../application/fan-out-model'
import type {
  CreateWorktreeInput,
  CreateWorktreeResult,
  RepoSummary,
  WorktreePsRow
} from '../../application/ports/runtime-gateway'
import type { FanOutFormHandle } from './fan-out-element'
import { emptyWorktreeGraph } from '../../domain/worktree-graph/types'
import type { WorktreeId } from '../../domain/worktree-graph/types'

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

type FakeForm = FanOutFormHandle & {
  disposed: boolean
  emitCountChange(count: number): void
  emitAgentChange(agent: 'none' | 'claude'): void
  emitPromptChange(prompt: string): void
  emitSubmit(): void
  emitCancel(): void
}

const createFakeForm = (): FakeForm => {
  let countCb: ((count: number) => void) | null = null
  let agentCb: ((agent: 'none' | 'claude') => void) | null = null
  let promptCb: ((prompt: string) => void) | null = null
  let submitCb: (() => void) | null = null
  let cancelCb: (() => void) | null = null
  const form: FakeForm = {
    element: {} as HTMLElement,
    disposed: false,
    apply: vi.fn(),
    onCountChange(cb) {
      countCb = cb
      return () => (countCb = null)
    },
    onAgentChange(cb) {
      agentCb = cb
      return () => (agentCb = null)
    },
    onPromptChange(cb) {
      promptCb = cb
      return () => (promptCb = null)
    },
    onSubmit(cb) {
      submitCb = cb
      return () => (submitCb = null)
    },
    onCancel(cb) {
      cancelCb = cb
      return () => (cancelCb = null)
    },
    focusFirstField: vi.fn(),
    dispose: vi.fn(() => (form.disposed = true)),
    emitCountChange(count) {
      countCb?.(count)
    },
    emitAgentChange(agent) {
      agentCb?.(agent)
    },
    emitPromptChange(prompt) {
      promptCb?.(prompt)
    },
    emitSubmit() {
      submitCb?.()
    },
    emitCancel() {
      cancelCb?.()
    }
  }
  return form
}

const createFakeGateway = () => ({
  listRepos: vi.fn<() => Promise<readonly RepoSummary[]>>(async () => [
    { id: 'repo-1', path: '/repo-1', displayName: 'Repo One', kind: 'git' }
  ]),
  createWorktree: vi.fn<(input: CreateWorktreeInput) => Promise<CreateWorktreeResult>>(
    async () => ({ worktreeId: 'wt-1' })
  ),
  listWorktreePs: vi.fn<() => Promise<readonly WorktreePsRow[]>>(async () => [])
})

const createFakePoll = () => ({
  start: vi.fn(),
  stop: vi.fn(),
  rebindGateway: vi.fn()
})

const setup = () => {
  const gateway = createFakeGateway()
  const forms: FakeForm[] = []
  const hud = { appendChild: vi.fn() }
  const dispatch = vi.fn<(action: FanOutAction) => void>()
  const refetch = vi.fn(async () => {})
  const focusLitter = vi.fn<(memberIds: readonly WorktreeId[]) => void>()
  const memberPoll = createFakePoll()
  let mutationCounter = 0
  const deps: FanOutControllerDeps = {
    gateway,
    createElement: () => {
      const f = createFakeForm()
      forms.push(f)
      return f
    },
    hud,
    dispatch,
    focusLitter,
    memberPoll,
    refetch,
    generateMutationId: () => `mutation-${++mutationCounter}`
  }
  const controller = createFanOutController(deps)
  return { controller, gateway, forms, hud, dispatch, refetch, focusLitter, memberPoll, deps }
}

const formSlice = (
  overrides: Partial<Extract<FanOutSlice, { view: 'form' }>> = {}
): FanOutSlice => ({
  view: 'form',
  parentId: 'w1',
  fields: { count: 3, agent: 'none', prompt: '' },
  repoSelector: null,
  ...overrides
})

describe('createFanOutController', () => {
  it('does nothing when the slice is closed', () => {
    const { controller, forms } = setup()
    controller.sync(emptyFanOutSlice(), emptyWorktreeGraph())
    expect(forms).toHaveLength(0)
  })

  it('mounts the element into the hud and applies the view model on open', () => {
    const { controller, forms, hud } = setup()
    controller.sync(formSlice(), emptyWorktreeGraph())
    expect(forms).toHaveLength(1)
    expect(hud.appendChild).toHaveBeenCalledWith(forms[0]!.element)
    expect(forms[0]!.apply).toHaveBeenCalled()
  })

  it('focuses the first field on the closed -> form transition', () => {
    const { controller, forms } = setup()
    controller.sync(emptyFanOutSlice(), emptyWorktreeGraph())
    controller.sync(formSlice(), emptyWorktreeGraph())
    expect(forms[0]!.focusFirstField).toHaveBeenCalledOnce()
  })

  it('fetches repos exactly once on first open and resolves the repo selector, preferring activeRepoId', async () => {
    const gateway = createFakeGateway()
    gateway.listRepos.mockResolvedValueOnce([
      { id: 'repo-1', path: '/repo-1', displayName: 'Repo One', kind: 'git' },
      { id: 'repo-2', path: '/repo-2', displayName: 'Repo Two', kind: 'git' }
    ])
    const dispatch = vi.fn<(action: FanOutAction) => void>()
    const controller = createFanOutController({
      gateway,
      createElement: () => createFakeForm(),
      hud: { appendChild: vi.fn() },
      dispatch,
      focusLitter: vi.fn(),
      memberPoll: createFakePoll(),
      refetch: vi.fn(async () => {}),
      activeRepoId: () => 'repo-2'
    })
    controller.sync(formSlice(), emptyWorktreeGraph())
    await flush()
    expect(gateway.listRepos).toHaveBeenCalledOnce()
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-repo-selector', repoSelector: 'id:repo-2' })
  })

  it('falls back to the first listed repo when activeRepoId is not provided', async () => {
    const { controller, dispatch } = setup()
    controller.sync(formSlice(), emptyWorktreeGraph())
    await flush()
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-repo-selector', repoSelector: 'id:repo-1' })
  })

  it('does not refetch repos once the slice already carries a resolved repoSelector', async () => {
    const { controller, gateway } = setup()
    controller.sync(formSlice({ repoSelector: 'id:repo-1' }), emptyWorktreeGraph())
    await flush()
    expect(gateway.listRepos).not.toHaveBeenCalled()
  })

  it('wires count/agent/prompt field changes to their dispatch actions', () => {
    const { controller, forms, dispatch } = setup()
    controller.sync(formSlice(), emptyWorktreeGraph())
    forms[0]!.emitCountChange(5)
    expect(dispatch).toHaveBeenCalledWith({ type: 'update-count', count: 5 })
    forms[0]!.emitAgentChange('claude')
    expect(dispatch).toHaveBeenCalledWith({ type: 'update-agent', agent: 'claude' })
    forms[0]!.emitPromptChange('hola')
    expect(dispatch).toHaveBeenCalledWith({ type: 'update-prompt', prompt: 'hola' })
  })

  it('wires cancel from the element to a cancel dispatch', () => {
    const { controller, forms, dispatch } = setup()
    controller.sync(formSlice(), emptyWorktreeGraph())
    forms[0]!.emitCancel()
    expect(dispatch).toHaveBeenCalledWith({ type: 'cancel' })
  })

  it('repo-unresolved guard: dispatches form-error and makes zero createWorktree calls', async () => {
    const { controller, gateway, forms, dispatch } = setup()
    controller.sync(formSlice({ repoSelector: null }), emptyWorktreeGraph())
    forms[0]!.emitSubmit()
    await flush()
    expect(gateway.createWorktree).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'form-error', message: expect.any(String) })
  })

  it('submit: generates N distinct mutation ids and dispatches submit first', async () => {
    const { controller, forms, dispatch } = setup()
    controller.sync(
      formSlice({ repoSelector: 'id:repo-1', fields: { count: 3, agent: 'none', prompt: '' } }),
      emptyWorktreeGraph()
    )
    forms[0]!.emitSubmit()
    expect(dispatch).toHaveBeenCalledWith({
      type: 'submit',
      mutationIds: ['mutation-1', 'mutation-2', 'mutation-3']
    })
    await flush()
  })

  it('submit: calls createWorktree sequentially (not in parallel), in mutation-id order', async () => {
    const { controller, gateway, forms } = setup()
    const order: string[] = []
    gateway.createWorktree.mockImplementation(async (input) => {
      order.push(`start:${input.clientMutationId}`)
      await Promise.resolve()
      order.push(`end:${input.clientMutationId}`)
      return { worktreeId: `wt-${input.clientMutationId}` }
    })
    controller.sync(
      formSlice({ repoSelector: 'id:repo-1', fields: { count: 3, agent: 'none', prompt: '' } }),
      emptyWorktreeGraph()
    )
    forms[0]!.emitSubmit()
    await flush()
    expect(order).toEqual([
      'start:mutation-1',
      'end:mutation-1',
      'start:mutation-2',
      'end:mutation-2',
      'start:mutation-3',
      'end:mutation-3'
    ])
  })

  it('submit: dispatches child-created on success', async () => {
    const { controller, gateway, forms, dispatch } = setup()
    gateway.createWorktree.mockResolvedValueOnce({ worktreeId: 'wt-1' })
    controller.sync(
      formSlice({ repoSelector: 'id:repo-1', fields: { count: 1, agent: 'none', prompt: '' } }),
      emptyWorktreeGraph()
    )
    forms[0]!.emitSubmit()
    await flush()
    expect(dispatch).toHaveBeenCalledWith({
      type: 'child-created',
      mutationId: 'mutation-1',
      worktreeId: 'wt-1'
    })
  })

  it('submit: continue-on-error — a rejection dispatches child-failed and the loop continues', async () => {
    const { controller, gateway, forms, dispatch } = setup()
    gateway.createWorktree
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ worktreeId: 'wt-2' })
    controller.sync(
      formSlice({ repoSelector: 'id:repo-1', fields: { count: 2, agent: 'none', prompt: '' } }),
      emptyWorktreeGraph()
    )
    forms[0]!.emitSubmit()
    await flush()
    expect(gateway.createWorktree).toHaveBeenCalledTimes(2)
    expect(dispatch).toHaveBeenCalledWith({ type: 'child-failed', mutationId: 'mutation-1' })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'child-created',
      mutationId: 'mutation-2',
      worktreeId: 'wt-2'
    })
  })

  it('submit: after the loop, frames the camera on the litter and starts the member poll', async () => {
    const { controller, gateway, forms, focusLitter, memberPoll, refetch } = setup()
    gateway.createWorktree
      .mockResolvedValueOnce({ worktreeId: 'wt-a' })
      .mockRejectedValueOnce(new Error('boom'))
    controller.sync(
      formSlice({
        parentId: 'parent-1',
        repoSelector: 'id:repo-1',
        fields: { count: 2, agent: 'none', prompt: '' }
      }),
      emptyWorktreeGraph()
    )
    forms[0]!.emitSubmit()
    await flush()
    expect(focusLitter).toHaveBeenCalledWith(['parent-1', 'wt-a'])
    expect(memberPoll.start).toHaveBeenCalledOnce()
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('close/cancel: stops the member poll and unmounts the element', () => {
    const { controller, forms, memberPoll } = setup()
    controller.sync(formSlice(), emptyWorktreeGraph())
    controller.sync(emptyFanOutSlice(), emptyWorktreeGraph())
    expect(memberPoll.stop).toHaveBeenCalled()
    expect(forms[0]!.disposed).toBe(true)
  })

  it('rebindGateway rebinds both the controller gateway and the member poll gateway', async () => {
    const { controller, forms, memberPoll } = setup()
    const newGateway = createFakeGateway()
    controller.rebindGateway(newGateway)
    expect(memberPoll.rebindGateway).toHaveBeenCalledWith(newGateway)

    controller.sync(
      formSlice({ repoSelector: 'id:repo-1', fields: { count: 1, agent: 'none', prompt: '' } }),
      emptyWorktreeGraph()
    )
    forms[0]!.emitSubmit()
    await flush()
    expect(newGateway.createWorktree).toHaveBeenCalledOnce()
  })

  it('dispose unmounts the element and stops the member poll', () => {
    const { controller, forms, memberPoll } = setup()
    controller.sync(formSlice(), emptyWorktreeGraph())
    controller.dispose()
    expect(forms[0]!.disposed).toBe(true)
    expect(memberPoll.stop).toHaveBeenCalled()
  })
})
