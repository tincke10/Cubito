import { afterEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from '../orchestration-db'
import { createRootDispatch } from '../root-dispatch-test-fixture'

describe('OrchestrationDb.listQuestionsForRun', () => {
  let db: OrchestrationDb | undefined

  afterEach(() => db?.close())

  function createDb(): OrchestrationDb {
    db = new OrchestrationDb(':memory:')
    return db
  }

  function createRunWithQuestion(
    d: OrchestrationDb,
    objective: string,
    coordinatorHandle: string,
    coordinatorPaneKey: string
  ) {
    const run = d.createRun({ objective, coordinatorHandle, coordinatorPaneKey })
    const task = d.createTask({ spec: objective, runId: run.id })
    const dispatch = createRootDispatch(d, task.id, coordinatorHandle)
    return { run, dispatch }
  }

  it("returns only the queried Run's questions", () => {
    const d = createDb()
    const { run: runA, dispatch: dispatchA } = createRunWithQuestion(
      d,
      'Run A',
      'term_a',
      'tab_coord:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
    const { run: runB, dispatch: dispatchB } = createRunWithQuestion(
      d,
      'Run B',
      'term_b',
      'tab_coord:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    )
    d.createQuestion({
      runId: runA.id,
      dispatchId: dispatchA.id,
      askerHandle: 'term_a',
      question: 'A?'
    })
    d.createQuestion({
      runId: runB.id,
      dispatchId: dispatchB.id,
      askerHandle: 'term_b',
      question: 'B?'
    })

    const questionsForA = d.listQuestionsForRun(runA.id)

    expect(questionsForA).toHaveLength(1)
    expect(questionsForA[0].run_id).toBe(runA.id)
  })

  it('filters by status', () => {
    const d = createDb()
    const { run, dispatch } = createRunWithQuestion(
      d,
      'Run status',
      'term_coord',
      'tab_coord:cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    )
    const pending = d.createQuestion({
      runId: run.id,
      dispatchId: dispatch.id,
      askerHandle: 'term_coord',
      question: 'Pending?'
    })
    const answered = d.createQuestion({
      runId: run.id,
      dispatchId: dispatch.id,
      askerHandle: 'term_coord',
      question: 'Answered?'
    })
    d.answerQuestion({
      messageId: answered.question.message_id,
      runId: run.id,
      consumerGeneration: run.consumer_generation,
      body: 'done'
    })

    const pendingOnly = d.listQuestionsForRun(run.id, 'pending')
    const answeredOnly = d.listQuestionsForRun(run.id, 'answered')

    expect(pendingOnly.map((q) => q.message_id)).toEqual([pending.question.message_id])
    expect(answeredOnly.map((q) => q.message_id)).toEqual([answered.question.message_id])
  })

  it('projects the question prompt text from the source message', () => {
    const d = createDb()
    const { run, dispatch } = createRunWithQuestion(
      d,
      'Run prompt text',
      'term_prompt',
      'tab_coord:dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    )
    d.createQuestion({
      runId: run.id,
      dispatchId: dispatch.id,
      askerHandle: 'term_prompt',
      question: 'Deploy to prod?'
    })

    const [row] = d.listQuestionsForRun(run.id)

    expect(row.question).toBe('Deploy to prod?')
  })
})
