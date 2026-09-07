import { describe, expect, it } from 'vitest'
import { pendingGatesViewModel, pendingQuestionsViewModel } from './fan-out-decision-view-model'
import type { DecisionVisibility } from '../../application/fan-out-decision-visibility'
import type { LeaseGateRow, LeaseQuestionRow } from '../../application/ports/runtime-gateway'

const gate = (overrides: Partial<LeaseGateRow> = {}): LeaseGateRow => ({
  id: 'gate-1',
  runId: 'run-1',
  taskId: 'task-1',
  question: 'Which approach?',
  options: '["a","b"]',
  status: 'pending',
  resolution: null,
  createdAt: '2026-01-01T00:00:00Z',
  resolvedAt: null,
  ...overrides
})

const question = (overrides: Partial<LeaseQuestionRow> = {}): LeaseQuestionRow => ({
  messageId: 'msg-1',
  runId: 'run-1',
  dispatchId: 'dispatch-1',
  askerHandle: 'worker-1',
  status: 'pending',
  answerMessageId: null,
  answerBody: null,
  answeredByGeneration: null,
  createdAt: '2026-01-01T00:00:00Z',
  answeredAt: null,
  closedAt: null,
  ...overrides
})

describe('pendingGatesViewModel', () => {
  it('projects a pending gate to {gateId, taskId, question, options}', () => {
    const visibility: DecisionVisibility = {
      gatesByTaskId: { 'task-1': [gate()] },
      questionsByDispatchId: {}
    }
    expect(pendingGatesViewModel(visibility)).toEqual([
      { gateId: 'gate-1', taskId: 'task-1', question: 'Which approach?', options: ['a', 'b'] }
    ])
  })

  it('filters out resolved/timeout gates', () => {
    const visibility: DecisionVisibility = {
      gatesByTaskId: {
        'task-1': [gate({ id: 'gate-1', status: 'resolved' }), gate({ id: 'gate-2' })],
        'task-2': [gate({ id: 'gate-3', status: 'timeout' })]
      },
      questionsByDispatchId: {}
    }
    expect(pendingGatesViewModel(visibility).map((g) => g.gateId)).toEqual(['gate-2'])
  })

  it('parses malformed options JSON to an empty array instead of throwing', () => {
    const visibility: DecisionVisibility = {
      gatesByTaskId: { 'task-1': [gate({ options: 'not json' })] },
      questionsByDispatchId: {}
    }
    expect(pendingGatesViewModel(visibility)[0]?.options).toEqual([])
  })

  it('parses a non-array JSON payload to an empty array', () => {
    const visibility: DecisionVisibility = {
      gatesByTaskId: { 'task-1': [gate({ options: '{"a":1}' })] },
      questionsByDispatchId: {}
    }
    expect(pendingGatesViewModel(visibility)[0]?.options).toEqual([])
  })

  it('returns an empty list when there are no gates', () => {
    expect(pendingGatesViewModel({ gatesByTaskId: {}, questionsByDispatchId: {} })).toEqual([])
  })
})

describe('pendingQuestionsViewModel', () => {
  it('projects a pending question to {messageId, dispatchId, askerHandle, question}', () => {
    const visibility: DecisionVisibility = {
      gatesByTaskId: {},
      questionsByDispatchId: {
        'dispatch-1': [question({ question: 'Which branch should we merge?' })]
      }
    }
    expect(pendingQuestionsViewModel(visibility)).toEqual([
      {
        messageId: 'msg-1',
        dispatchId: 'dispatch-1',
        askerHandle: 'worker-1',
        question: 'Which branch should we merge?'
      }
    ])
  })

  it('omits `question` (never an undefined key) when the row has no question text', () => {
    const visibility: DecisionVisibility = {
      gatesByTaskId: {},
      questionsByDispatchId: { 'dispatch-1': [question()] }
    }
    const [projected] = pendingQuestionsViewModel(visibility)
    expect('question' in (projected as object)).toBe(false)
  })

  it('filters out answered/closed questions', () => {
    const visibility: DecisionVisibility = {
      gatesByTaskId: {},
      questionsByDispatchId: {
        'dispatch-1': [
          question({ messageId: 'msg-1', status: 'answered' }),
          question({ messageId: 'msg-2', status: 'pending' })
        ],
        'dispatch-2': [question({ messageId: 'msg-3', status: 'closed' })]
      }
    }
    expect(pendingQuestionsViewModel(visibility).map((q) => q.messageId)).toEqual(['msg-2'])
  })

  it('returns an empty list when there are no questions', () => {
    expect(pendingQuestionsViewModel({ gatesByTaskId: {}, questionsByDispatchId: {} })).toEqual([])
  })
})
