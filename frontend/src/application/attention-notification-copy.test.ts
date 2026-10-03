import { afterEach, describe, expect, it } from 'vitest'
import { localizeAttentionNotification } from './attention-notification-copy'
import { setActiveLanguage } from './i18n/translate'
import type { AttentionNotification } from './ports/attention-notification-port'

afterEach(() => setActiveLanguage('es'))

const note = (overrides: Partial<AttentionNotification>): AttentionNotification => ({
  notificationId: 'agent:1',
  seq: 1,
  title: 'feature-x - Claude finished',
  body: 'Claude finished.',
  worktreeId: 'r::/feature-x',
  agentState: 'done',
  ...overrides
})

describe('localizeAttentionNotification', () => {
  it('localizes a done title from agentState, keeping worktree and agent name', () => {
    setActiveLanguage('es')
    expect(localizeAttentionNotification(note({})).title).toBe('feature-x - Claude terminó')
    setActiveLanguage('en')
    expect(localizeAttentionNotification(note({})).title).toBe('feature-x - Claude finished')
  })

  it('localizes blocked and waiting as needing input', () => {
    for (const agentState of ['blocked', 'waiting'] as const) {
      const input = note({ agentState, title: 'feature-x - Codex needs input' })
      setActiveLanguage('es')
      expect(localizeAttentionNotification(input).title).toBe(
        'feature-x - Codex necesita tu respuesta'
      )
      setActiveLanguage('en')
      expect(localizeAttentionNotification(input).title).toBe('feature-x - Codex needs your input')
    }
  })

  it('leaves the engine body and every other field untouched', () => {
    setActiveLanguage('es')
    const input = note({ body: 'Refactored the parser.' })
    expect(localizeAttentionNotification(input)).toEqual({
      ...input,
      title: 'feature-x - Claude terminó'
    })
  })

  it('keeps a title it cannot parse, and a working or unknown state', () => {
    setActiveLanguage('es')
    expect(localizeAttentionNotification(note({ title: 'Something else' })).title).toBe(
      'Something else'
    )
    expect(localizeAttentionNotification(note({ agentState: 'working' })).title).toBe(
      'feature-x - Claude finished'
    )
    expect(localizeAttentionNotification(note({ agentState: null })).title).toBe(
      'feature-x - Claude finished'
    )
  })

  it('handles an agent label that contains " - " in the worktree name', () => {
    setActiveLanguage('es')
    const input = note({ title: 'my - wt - Claude finished' })
    expect(localizeAttentionNotification(input).title).toBe('my - wt - Claude terminó')
  })
})
