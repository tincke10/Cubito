import { describe, expect, it } from 'vitest'
import { computeLineDiff } from './line-diff'

describe('computeLineDiff', () => {
  it('returns [] when both inputs are empty', () => {
    expect(computeLineDiff('', '')).toEqual([])
  })

  it('marks identical inputs as all ctx with matching line numbers', () => {
    const lines = computeLineDiff('a\nb\nc', 'a\nb\nc')
    expect(lines).toEqual([
      { kind: 'ctx', text: 'a', oldNo: 1, newNo: 1 },
      { kind: 'ctx', text: 'b', oldNo: 2, newNo: 2 },
      { kind: 'ctx', text: 'c', oldNo: 3, newNo: 3 }
    ])
  })

  it('marks a pure addition as all add lines', () => {
    const lines = computeLineDiff('', 'x\ny')
    expect(lines).toEqual([
      { kind: 'add', text: 'x', oldNo: null, newNo: 1 },
      { kind: 'add', text: 'y', oldNo: null, newNo: 2 }
    ])
  })

  it('marks a pure deletion as all del lines', () => {
    const lines = computeLineDiff('x\ny', '')
    expect(lines).toEqual([
      { kind: 'del', text: 'x', oldNo: 1, newNo: null },
      { kind: 'del', text: 'y', oldNo: 2, newNo: null }
    ])
  })

  it('treats a single-line change as del followed by add', () => {
    expect(computeLineDiff('foo', 'bar')).toEqual([
      { kind: 'del', text: 'foo', oldNo: 1, newNo: null },
      { kind: 'add', text: 'bar', oldNo: null, newNo: 1 }
    ])
  })

  it('diffs a realistic mixed hunk (ctx, del, add, ctx)', () => {
    const original = 'const a = 1\nconst b = 2\nreturn a + b'
    const modified = 'const a = 1\nconst b = 3\nconst c = 4\nreturn a + b'
    const lines = computeLineDiff(original, modified)
    expect(lines).toEqual([
      { kind: 'ctx', text: 'const a = 1', oldNo: 1, newNo: 1 },
      { kind: 'del', text: 'const b = 2', oldNo: 2, newNo: null },
      { kind: 'add', text: 'const b = 3', oldNo: null, newNo: 2 },
      { kind: 'add', text: 'const c = 4', oldNo: null, newNo: 3 },
      { kind: 'ctx', text: 'return a + b', oldNo: 3, newNo: 4 }
    ])
  })
})
