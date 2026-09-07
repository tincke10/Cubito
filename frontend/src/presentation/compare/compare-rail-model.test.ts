import { describe, expect, it } from 'vitest'
import { compareRailViewModel } from './compare-rail-model'
import type { CompareRailInput } from './compare-rail-model'
import { emptyCompareChildLoad } from '../../application/compare-child-load'
import type { CompareChildLoad } from '../../application/compare-child-load'
import type { DiffFileRow } from '../../application/diff-view-model'

const fileRow = (overrides: Partial<DiffFileRow> = {}): DiffFileRow => ({
  path: 'src/auth.ts',
  status: 'modified',
  added: 3,
  removed: 1,
  ...overrides
})

const load = (overrides: Partial<CompareChildLoad> = {}): CompareChildLoad => ({
  ...emptyCompareChildLoad(),
  ...overrides
})

const branchLabelFor = (childId: string): string => `cubito-${childId}`

const baseInput = (overrides: Partial<CompareRailInput> = {}): CompareRailInput => ({
  members: ['child-1', 'child-2'],
  childLoads: { 'child-1': load(), 'child-2': load() },
  focusedChildId: null,
  winnerId: null,
  branchLabelFor,
  ...overrides
})

describe('compareRailViewModel', () => {
  it('returns [] for no members', () => {
    expect(compareRailViewModel(baseInput({ members: [], childLoads: {} }))).toEqual([])
  })

  it('one row per member, in member order, labeled via branchLabelFor', () => {
    const rows = compareRailViewModel(baseInput())
    expect(rows.map((r) => r.childId)).toEqual(['child-1', 'child-2'])
    expect(rows.map((r) => r.label)).toEqual(['cubito-child-1', 'cubito-child-2'])
  })

  it('formats the stat text from the child load files via hudCountsOfFiles', () => {
    const rows = compareRailViewModel(
      baseInput({
        childLoads: {
          'child-1': load({ files: [fileRow({ added: 3, removed: 1 })], status: 'ready' }),
          'child-2': load()
        }
      })
    )
    expect(rows[0]!.statText).toBe('1 archivos · +3 −1')
    expect(rows[1]!.statText).toBe('0 archivos · +0 −0')
  })

  it('defaults status to loading for a member with no childLoads entry yet', () => {
    const rows = compareRailViewModel(baseInput({ childLoads: {} }))
    expect(rows.map((r) => r.status)).toEqual(['loading', 'loading'])
  })

  it('flags the row matching focusedChildId as focused, with the modifier class', () => {
    const rows = compareRailViewModel(baseInput({ focusedChildId: 'child-2' }))
    expect(rows[0]!.focused).toBe(false)
    expect(rows[1]!.focused).toBe(true)
    expect(rows[1]!.cssClass).toContain('compare-rail__row--focused')
    expect(rows[0]!.cssClass).not.toContain('compare-rail__row--focused')
  })

  it('flags the row matching winnerId as winner and swaps the toggle label', () => {
    const rows = compareRailViewModel(baseInput({ winnerId: 'child-1' }))
    expect(rows[0]!.isWinner).toBe(true)
    expect(rows[0]!.winnerToggleLabel).toBe('ganador')
    expect(rows[0]!.cssClass).toContain('compare-rail__row--winner')
    expect(rows[1]!.isWinner).toBe(false)
    expect(rows[1]!.winnerToggleLabel).toBe('elegir ganador')
    expect(rows[1]!.cssClass).not.toContain('compare-rail__row--winner')
  })

  it.each(['loading', 'ready', 'empty', 'error'] as const)(
    'encodes status "%s" into cssClass',
    (status) => {
      const rows = compareRailViewModel(
        baseInput({ childLoads: { 'child-1': load({ status }), 'child-2': load() } })
      )
      expect(rows[0]!.cssClass).toContain(`compare-rail__row--${status}`)
    }
  )
})
