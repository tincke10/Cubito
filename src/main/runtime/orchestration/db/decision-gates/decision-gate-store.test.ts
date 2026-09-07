import { afterEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from '../orchestration-db'

describe('decision-gate-store: resolveGate pending guard', () => {
  let db: OrchestrationDb | undefined

  afterEach(() => db?.close())

  function createDb(): OrchestrationDb {
    db = new OrchestrationDb(':memory:')
    return db
  }

  it('resolves a pending gate', () => {
    const d = createDb()
    const task = d.createTask({ spec: 'work' })
    const gate = d.createGate({ taskId: task.id, question: 'ok?' })

    const resolved = d.resolveGate(gate.id, 'yes')

    expect(resolved?.status).toBe('resolved')
    expect(resolved?.resolution).toBe('yes')
  })

  it('throws gate_not_pending when resolving an already-resolved gate', () => {
    const d = createDb()
    const task = d.createTask({ spec: 'work' })
    const gate = d.createGate({ taskId: task.id, question: 'ok?' })
    d.resolveGate(gate.id, 'yes')

    expect(() => d.resolveGate(gate.id, 'no')).toThrow(
      expect.objectContaining({ code: 'gate_not_pending' })
    )
  })
})
