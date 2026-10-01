import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOrcadAgentAttentionNotifier,
  type AttentionStatusEvent
} from './orcad-agent-attention-notifier'

const PANE = 'tab-1:leaf-1'
const WORKTREE = 'repo-1::/home/dev/projects/cubito-feature'

function event(
  state: 'working' | 'blocked' | 'waiting' | 'done',
  extra: Partial<AttentionStatusEvent> & { lastAssistantMessage?: string } = {}
): AttentionStatusEvent {
  const { lastAssistantMessage, ...rest } = extra
  return {
    paneKey: PANE,
    worktreeId: WORKTREE,
    stateStartedAt: 1000,
    payload: { state, agentType: 'claude', lastAssistantMessage },
    ...rest
  }
}

describe('orcad agent attention notifier', () => {
  const dispatch = vi.fn()
  let settings: { enabled?: boolean; agentTaskComplete?: boolean } = {}

  const create = () =>
    createOrcadAgentAttentionNotifier({
      dispatch,
      getNotificationSettings: () => settings,
      now: () => 5000
    })

  beforeEach(() => {
    vi.useFakeTimers()
    dispatch.mockClear()
    settings = {}
  })
  afterEach(() => vi.useRealTimers())

  it('notifies a blocked agent immediately with an agent-notification id', () => {
    const notifier = create()
    notifier.observe(event('working', { stateStartedAt: 900 }))
    notifier.observe(event('blocked', { stateStartedAt: 1000 }))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]![0]).toMatchObject({
      type: 'notification',
      source: 'agent-task-complete',
      agentState: 'blocked',
      worktreeId: WORKTREE,
      notificationId: `agent:${encodeURIComponent(WORKTREE)}:${encodeURIComponent(PANE)}:1000`,
      emittedAt: 5000,
      title: 'cubito-feature - Claude needs input'
    })
  })

  it('treats waiting like blocked', () => {
    const notifier = create()
    notifier.observe(event('waiting'))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]![0].agentState).toBe('waiting')
  })

  it('dedupes a re-observed state with the same stateStartedAt', () => {
    const notifier = create()
    notifier.observe(event('blocked'))
    notifier.observe(event('blocked'))
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('waits the quiet window before notifying done without detail', () => {
    const notifier = create()
    notifier.observe(event('working', { stateStartedAt: 900 }))
    notifier.observe(event('done'))
    vi.advanceTimersByTime(1499)
    expect(dispatch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]![0]).toMatchObject({
      agentState: 'done',
      title: 'cubito-feature - Claude finished'
    })
  })

  it('notifies done after the short grace when the assistant message is known', () => {
    const notifier = create()
    notifier.observe(event('working', { stateStartedAt: 900 }))
    notifier.observe(event('done', { lastAssistantMessage: 'All green.' }))
    vi.advanceTimersByTime(250)
    expect(dispatch.mock.calls[0]![0].body).toBe('All green.')
  })

  it('shortens the wait when detail arrives on a later done update', () => {
    const notifier = create()
    notifier.observe(event('working', { stateStartedAt: 900 }))
    notifier.observe(event('done'))
    vi.advanceTimersByTime(100)
    notifier.observe(event('done', { lastAssistantMessage: 'Shipped.' }))
    vi.advanceTimersByTime(250)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]![0].body).toBe('Shipped.')
  })

  it('cancels a pending done when work resumes', () => {
    const notifier = create()
    notifier.observe(event('working', { stateStartedAt: 900 }))
    notifier.observe(event('done'))
    notifier.observe(event('working', { stateStartedAt: 1200 }))
    vi.advanceTimersByTime(5000)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('never notifies done for a pane it did not see working', () => {
    const notifier = create()
    notifier.observe(event('done'))
    vi.advanceTimersByTime(5000)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ignores replays and session-identity-only rows', () => {
    const notifier = create()
    notifier.observe(event('blocked', { isReplay: true }))
    notifier.observe(event('blocked', { providerSessionOnly: true, stateStartedAt: 2 }))
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('honors the profile notification settings', () => {
    const notifier = create()
    settings = { enabled: false }
    notifier.observe(event('blocked'))
    settings = { agentTaskComplete: false }
    notifier.observe(event('blocked', { stateStartedAt: 2000 }))
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('dispose drops pending timers', () => {
    const notifier = create()
    notifier.observe(event('working', { stateStartedAt: 900 }))
    notifier.observe(event('done'))
    notifier.dispose()
    vi.advanceTimersByTime(5000)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
