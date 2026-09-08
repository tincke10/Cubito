import { describe, expect, it } from 'vitest'
import { reduceFanOut } from './fan-out-model'
import type { FanOutBatchEntry, FanOutSlice } from './fan-out-model'
import { fanOutBatchFailures, summarizeChildFailure } from './fan-out-batch-failures'

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

  it('summarizes a raw multi-line stderr message down to its fatal line', () => {
    const raw =
      'Command failed: git worktree add --no-track -b camada-abc123 /Users/dev/repo/camada-abc123 refs/heads/master\n' +
      "Preparing worktree (new branch 'camada-abc123')\n" +
      "fatal: could not create leading directories of '/Users/dev/repo/camada-abc123/.git': Permission denied\n"
    const slice = runningSliceWithBatch([
      {
        mutationId: 'm1',
        worktreeId: null,
        failed: true,
        dispatchId: null,
        taskId: null,
        errorMessage: raw
      }
    ])
    expect(fanOutBatchFailures(slice)).toEqual([
      {
        mutationId: 'm1',
        label: 'camada-m1',
        message:
          "fatal: could not create leading directories of '/Users/dev/repo/camada-abc123/.git': Permission denied"
      }
    ])
  })
})

describe('summarizeChildFailure', () => {
  it('picks the last fatal:/error: line, keeping its prefix, from raw git stderr', () => {
    const raw =
      'Command failed: git worktree add --no-track -b camada-abc123 /Users/dev/repo/camada-abc123 refs/heads/master\n' +
      "Preparing worktree (new branch 'camada-abc123')\n" +
      "fatal: could not create leading directories of '/Users/dev/repo/camada-abc123/.git': Permission denied\n"
    expect(summarizeChildFailure(raw)).toBe(
      "fatal: could not create leading directories of '/Users/dev/repo/camada-abc123/.git': Permission denied"
    )
  })

  it('falls back to the first non-empty line when no fatal:/error: line is present', () => {
    const raw = '\n  some warning line  \nanother line\n'
    expect(summarizeChildFailure(raw)).toBe('some warning line')
  })

  it('prefers the LAST matching fatal:/error: line when there are several', () => {
    const raw = 'error: first problem\nsome context\nfatal: the real cause\n'
    expect(summarizeChildFailure(raw)).toBe('fatal: the real cause')
  })

  it('matches fatal:/error: case-insensitively, keeping the original casing', () => {
    const raw = 'context\nFatal: Something broke\n'
    expect(summarizeChildFailure(raw)).toBe('Fatal: Something broke')
  })

  it('caps at 160 chars with a trailing ellipsis', () => {
    const longLine = `fatal: ${'x'.repeat(200)}`
    const result = summarizeChildFailure(longLine)
    expect(result.length).toBe(161)
    expect(result.endsWith('…')).toBe(true)
    expect(result.startsWith('fatal: ')).toBe(true)
  })

  it('does not cap a line already within the limit', () => {
    expect(summarizeChildFailure('boom')).toBe('boom')
  })

  it('falls back to the generic message for empty input', () => {
    expect(summarizeChildFailure('')).toBe('no se pudo crear el cubo')
  })

  it('falls back to the generic message for whitespace-only input', () => {
    expect(summarizeChildFailure('   \n  \n')).toBe('no se pudo crear el cubo')
  })
})
