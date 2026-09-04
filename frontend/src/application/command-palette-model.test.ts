import { describe, expect, it } from 'vitest'
import { emptyCommandPaletteSlice, reduceCommandPalette } from './command-palette-model'
import type { CommandPaletteSlice } from './command-palette-model'

describe('reduceCommandPalette', () => {
  it('emptyCommandPaletteSlice starts closed', () => {
    expect(emptyCommandPaletteSlice()).toEqual({ view: 'closed' })
  })

  it('open transitions to the open view with an empty query and highlight at 0', () => {
    expect(reduceCommandPalette(emptyCommandPaletteSlice(), { type: 'open' })).toEqual({
      view: 'open',
      query: '',
      highlightedIndex: 0
    })
  })

  it('open resets an already-open slice back to a fresh state', () => {
    const open: CommandPaletteSlice = { view: 'open', query: 'foo', highlightedIndex: 3 }
    expect(reduceCommandPalette(open, { type: 'open' })).toEqual({
      view: 'open',
      query: '',
      highlightedIndex: 0
    })
  })

  it('close always returns to closed', () => {
    expect(
      reduceCommandPalette({ view: 'open', query: 'x', highlightedIndex: 1 }, { type: 'close' })
    ).toEqual({ view: 'closed' })
  })

  it('set-query updates the query and resets highlightedIndex to 0', () => {
    const slice: CommandPaletteSlice = { view: 'open', query: '', highlightedIndex: 2 }
    expect(reduceCommandPalette(slice, { type: 'set-query', query: 'foc' })).toEqual({
      view: 'open',
      query: 'foc',
      highlightedIndex: 0
    })
  })

  it('set-query is a no-op outside the open view', () => {
    const closed = emptyCommandPaletteSlice()
    expect(reduceCommandPalette(closed, { type: 'set-query', query: 'x' })).toBe(closed)
  })

  it('move-highlight adds delta to highlightedIndex, positive or negative, unbounded', () => {
    const slice: CommandPaletteSlice = { view: 'open', query: '', highlightedIndex: 0 }
    expect(reduceCommandPalette(slice, { type: 'move-highlight', delta: 1 })).toEqual({
      view: 'open',
      query: '',
      highlightedIndex: 1
    })
    expect(reduceCommandPalette(slice, { type: 'move-highlight', delta: -1 })).toEqual({
      view: 'open',
      query: '',
      highlightedIndex: -1
    })
  })

  it('move-highlight is a no-op outside the open view', () => {
    const closed = emptyCommandPaletteSlice()
    expect(reduceCommandPalette(closed, { type: 'move-highlight', delta: 1 })).toBe(closed)
  })

  it('an unrecognized action returns the slice unchanged', () => {
    const slice = emptyCommandPaletteSlice()
    expect(
      reduceCommandPalette(slice, { type: 'bogus' } as unknown as Parameters<
        typeof reduceCommandPalette
      >[1])
    ).toBe(slice)
  })
})
