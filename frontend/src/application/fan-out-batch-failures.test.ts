import { describe, expect, it } from 'vitest'
import { reduceFanOut } from './fan-out-model'
import type { FanOutBatchEntry, FanOutSlice } from './fan-out-model'
import { fanOutBatchFailures } from './fan-out-batch-failures'

const runningSliceWithBatch = (batch: readonly FanOutBatchEntry[]): FanOutSlice => ({
  view: 'running',
  parentId: 'w1',
  fields: { count: batch.length, agent: 'claude', prompt: '' },
  repoSelector: 'id:repo-a',
  batch,
  memberStatus: {},
  runId: null
})

describe('reduceFanOut — child-failed carries an error message', () => {
  it('sets errorMessage on the matching entry when the action carries a non-empty message', () => {
    const slice = runningSliceWithBatch([
      { mutationId: 'm1', worktreeId: null, failed: false, dispatchId: null, taskId: null }
    ])
    const next = reduceFanOut(slice, {
      type: 'child-failed',
      mutationId: 'm1',
      message: 'network unreachable'
    })
    expect((next as { batch: readonly FanOutBatchEntry[] }).batch).toEqual([
      {
        mutationId: 'm1',
        worktreeId: null,
        failed: true,
        dispatchId: null,
        taskId: null,
        errorMessage: 'network unreachable'
      }
    ])
  })

  it('omits errorMessage when the action carries no message', () => {
    const slice = runningSliceWithBatch([
      { mutationId: 'm1', worktreeId: null, failed: false, dispatchId: null, taskId: null }
    ])
    const next = reduceFanOut(slice, { type: 'child-failed', mutationId: 'm1' })
    expect((next as { batch: readonly FanOutBatchEntry[] }).batch).toEqual([
      { mutationId: 'm1', worktreeId: null, failed: true, dispatchId: null, taskId: null }
    ])
  })

  it('omits errorMessage when the action carries an empty-string message', () => {
    const slice = runningSliceWithBatch([
      { mutationId: 'm1', worktreeId: null, failed: false, dispatchId: null, taskId: null }
    ])
    const next = reduceFanOut(slice, { type: 'child-failed', mutationId: 'm1', message: '' })
    expect((next as { batch: readonly FanOutBatchEntry[] }).batch).toEqual([
      { mutationId: 'm1', worktreeId: null, failed: true, dispatchId: null, taskId: null }
    ])
  })
})

describe('fanOutBatchFailures', () => {
  it('returns [] when the slice is not running', () => {
    expect(fanOutBatchFailures({ view: 'closed', repoSelector: null })).toEqual([])
  })

  it('returns [] when no entry has failed', () => {
    const slice = runningSliceWithBatch([
      { mutationId: 'm1', worktreeId: 'w2', failed: false, dispatchId: null, taskId: null }
    ])
    expect(fanOutBatchFailures(slice)).toEqual([])
  })

  it('returns one row per failed entry, in batch order, with a generated label and its message', () => {
    const slice = runningSliceWithBatch([
      {
        mutationId: 'm1',
        worktreeId: null,
        failed: true,
        dispatchId: null,
        taskId: null,
        errorMessage: 'boom'
      },
      { mutationId: 'm2', worktreeId: 'w2', failed: false, dispatchId: null, taskId: null },
      {
        mutationId: 'm3',
        worktreeId: null,
        failed: true,
        dispatchId: null,
        taskId: null,
        errorMessage: 'timeout'
      }
    ])
    expect(fanOutBatchFailures(slice)).toEqual([
      { mutationId: 'm1', label: 'camada-m1', message: 'boom' },
      { mutationId: 'm3', label: 'camada-m3', message: 'timeout' }
    ])
  })

  it('falls back to a generic message when a failed entry has no errorMessage', () => {
    const slice = runningSliceWithBatch([
      { mutationId: 'm1', worktreeId: null, failed: true, dispatchId: null, taskId: null }
    ])
    expect(fanOutBatchFailures(slice)).toEqual([
      { mutationId: 'm1', label: 'camada-m1', message: 'no se pudo crear el cubo' }
    ])
  })
})
