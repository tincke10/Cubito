import { describe, expect, it } from 'vitest'
import { agentActivityToFeedRow } from './agent-activity-to-feed'
import type { AgentActivityEvent } from './ports/runtime-gateway'

const pad = (n: number): string => n.toString().padStart(2, '0')

/** Builds the expected HH:MM:SS from the SAME local Date the mapper uses — TZ-independent. */
function expectedTime(at: number): string {
  const date = new Date(at)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const AT = 1_700_000_000_123

const baseEvent = (overrides: Partial<AgentActivityEvent> = {}): AgentActivityEvent => ({
  seq: 7,
  at: AT,
  kind: 'read',
  tool: 'Read',
  target: 'src/routes/auth.ts',
  ...overrides
})

describe('agentActivityToFeedRow', () => {
  it('maps a read event', () => {
    const row = agentActivityToFeedRow(baseEvent({ kind: 'read', target: 'src/routes/auth.ts' }))
    expect(row).toEqual({
      id: 'activity-7',
      time: expectedTime(AT),
      kind: 'read',
      text: 'leyó src/routes/auth.ts'
    })
  })

  it('maps an edit event', () => {
    const row = agentActivityToFeedRow(baseEvent({ kind: 'edit', target: 'POST /auth/retry' }))
    expect(row.text).toBe('editando POST /auth/retry')
    expect(row.kind).toBe('edit')
  })

  it('maps a create event', () => {
    const row = agentActivityToFeedRow(baseEvent({ kind: 'create', target: 'POST /auth/refresh' }))
    expect(row.text).toBe('nuevo POST /auth/refresh')
    expect(row.kind).toBe('create')
  })

  it('maps a run event', () => {
    const row = agentActivityToFeedRow(baseEvent({ kind: 'run', target: 'pnpm test auth.retry' }))
    expect(row.text).toBe('corrió pnpm test auth.retry')
    expect(row.kind).toBe('run')
  })

  it('ids the row from seq and never sets detail/highlighted', () => {
    const row = agentActivityToFeedRow(baseEvent({ seq: 42 }))
    expect(row.id).toBe('activity-42')
    expect('detail' in row).toBe(false)
    expect('highlighted' in row).toBe(false)
  })

  it('zero-pads HH:MM:SS from the epoch', () => {
    const midnightish = new Date(2026, 0, 1, 1, 2, 3).getTime()
    const row = agentActivityToFeedRow(baseEvent({ at: midnightish }))
    expect(row.time).toBe('01:02:03')
  })
})
