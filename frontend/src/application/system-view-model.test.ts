import { describe, expect, it } from 'vitest'
import {
  emptySystemViewSlice,
  reduceSystemView,
  SYSTEM_FEED_MAX_ROWS,
  systemHudCounts
} from './system-view-model'
import type { SystemViewSlice } from './system-view-model'
import type { SystemGraph, SystemNode } from '../domain/system-graph/types'

const systemNode = (overrides: Partial<SystemNode> = {}): SystemNode => ({
  id: 'n1',
  kind: 'endpoint',
  label: 'POST /auth/refresh',
  state: 'idle',
  diff: null,
  ...overrides
})

const graphOf = (nodes: readonly SystemNode[]): SystemGraph => ({
  nodes: new Map(nodes.map((n) => [n.id, n])),
  edges: []
})

const feedRowAt = (i: number) => ({
  id: `f${i}`,
  time: '14:03:05',
  kind: 'read' as const,
  text: `row ${i}`
})

const openSlice = (overrides: Partial<Extract<SystemViewSlice, { view: 'open' }>> = {}) => ({
  view: 'open' as const,
  focusedNodeId: 'w1',
  graph: graphOf([]),
  feed: [],
  ...overrides
})

describe('emptySystemViewSlice', () => {
  it('starts closed', () => {
    expect(emptySystemViewSlice()).toEqual({ view: 'closed' })
  })
})

describe('reduceSystemView — open/close', () => {
  it('open anchors the view to the focused node with an empty graph and feed', () => {
    const slice = reduceSystemView(emptySystemViewSlice(), { type: 'open', nodeId: 'w1' })
    expect(slice).toEqual({ view: 'open', focusedNodeId: 'w1', graph: graphOf([]), feed: [] })
  })

  it('close returns to closed from any open state', () => {
    const slice = reduceSystemView(openSlice(), { type: 'close' })
    expect(slice).toEqual({ view: 'closed' })
  })

  it('re-opening for a different node resets graph and feed', () => {
    const slice = reduceSystemView(
      openSlice({ focusedNodeId: 'w1', graph: graphOf([systemNode()]), feed: [] }),
      { type: 'open', nodeId: 'w2' }
    )
    expect(slice).toEqual({ view: 'open', focusedNodeId: 'w2', graph: graphOf([]), feed: [] })
  })
})

describe('reduceSystemView — apply-delta', () => {
  it('routes through applySystemGraphDelta when open', () => {
    const slice = reduceSystemView(openSlice(), {
      type: 'apply-delta',
      delta: { op: 'add-node', node: systemNode() }
    })
    expect(slice.view).toBe('open')
    expect((slice as { graph: SystemGraph }).graph.nodes.get('n1')).toEqual(systemNode())
  })

  it('is a no-op when closed', () => {
    const closed = emptySystemViewSlice()
    const slice = reduceSystemView(closed, {
      type: 'apply-delta',
      delta: { op: 'add-node', node: systemNode() }
    })
    expect(slice).toBe(closed)
  })
})

describe('reduceSystemView — replace-graph', () => {
  it('replaces the graph wholesale when open, preserving feed and highlight', () => {
    const row = { id: 'f1', time: '14:03:05', kind: 'read' as const, text: 'leyendo auth.ts' }
    const slice = openSlice({
      graph: graphOf([systemNode({ id: 'old' })]),
      feed: [row],
      highlightedNodeId: 'old'
    })
    const nextGraph = graphOf([systemNode({ id: 'new' })])
    const result = reduceSystemView(slice, { type: 'replace-graph', graph: nextGraph })
    expect(result).toEqual(openSlice({ graph: nextGraph, feed: [row], highlightedNodeId: 'old' }))
  })

  it('is a no-op when closed', () => {
    const closed = emptySystemViewSlice()
    const result = reduceSystemView(closed, { type: 'replace-graph', graph: graphOf([]) })
    expect(result).toBe(closed)
  })
})

describe('reduceSystemView — append-feed', () => {
  it('appends a feed row when open', () => {
    const row = { id: 'f1', time: '14:03:05', kind: 'read' as const, text: 'leyendo auth.ts' }
    const slice = reduceSystemView(openSlice(), { type: 'append-feed', row })
    expect(slice).toEqual(openSlice({ feed: [row] }))
  })

  it('is a no-op when closed', () => {
    const closed = emptySystemViewSlice()
    const row = { id: 'f1', time: '14:03:05', kind: 'read' as const, text: 'leyendo auth.ts' }
    expect(reduceSystemView(closed, { type: 'append-feed', row })).toBe(closed)
  })

  it('caps at SYSTEM_FEED_MAX_ROWS, keeping the newest', () => {
    let slice: SystemViewSlice = openSlice({
      feed: Array.from({ length: SYSTEM_FEED_MAX_ROWS }, (_, i) => feedRowAt(i))
    })
    slice = reduceSystemView(slice, {
      type: 'append-feed',
      row: feedRowAt(SYSTEM_FEED_MAX_ROWS)
    })
    expect(slice.view).toBe('open')
    if (slice.view !== 'open') throw new Error('unreachable')
    expect(slice.feed.length).toBe(SYSTEM_FEED_MAX_ROWS)
    expect(slice.feed[0]).toEqual(feedRowAt(1))
    expect(slice.feed.at(-1)).toEqual(feedRowAt(SYSTEM_FEED_MAX_ROWS))
  })
})

describe('reduceSystemView — append-feed-rows', () => {
  it('appends N rows in order in one action', () => {
    const rows = [feedRowAt(1), feedRowAt(2), feedRowAt(3)]
    const slice = reduceSystemView(openSlice(), { type: 'append-feed-rows', rows })
    expect(slice).toEqual(openSlice({ feed: rows }))
  })

  it('caps at SYSTEM_FEED_MAX_ROWS, keeping the newest', () => {
    const existing = Array.from({ length: SYSTEM_FEED_MAX_ROWS - 2 }, (_, i) => feedRowAt(i))
    const incoming = [feedRowAt(1000), feedRowAt(1001), feedRowAt(1002), feedRowAt(1003)]
    const slice = reduceSystemView(openSlice({ feed: existing }), {
      type: 'append-feed-rows',
      rows: incoming
    })
    expect(slice.view).toBe('open')
    if (slice.view !== 'open') throw new Error('unreachable')
    expect(slice.feed.length).toBe(SYSTEM_FEED_MAX_ROWS)
    expect(slice.feed.at(-1)).toEqual(feedRowAt(1003))
    expect(slice.feed[0]).toEqual(feedRowAt(2))
  })

  it('is a no-op when closed', () => {
    const closed = emptySystemViewSlice()
    expect(reduceSystemView(closed, { type: 'append-feed-rows', rows: [feedRowAt(1)] })).toBe(
      closed
    )
  })
})

describe('reduceSystemView — reset-feed', () => {
  it('clears feed and leaves graph/focusedNodeId untouched', () => {
    const row = { id: 'f1', time: '14:03:05', kind: 'read' as const, text: 'leyendo auth.ts' }
    const graph = graphOf([systemNode()])
    const slice = reduceSystemView(openSlice({ feed: [row], graph }), { type: 'reset-feed' })
    expect(slice).toEqual(openSlice({ feed: [], graph }))
  })

  it('is a no-op when closed', () => {
    const closed = emptySystemViewSlice()
    expect(reduceSystemView(closed, { type: 'reset-feed' })).toBe(closed)
  })
})

describe('reduceSystemView — set-highlight', () => {
  it('sets highlightedNodeId when open', () => {
    const slice = reduceSystemView(openSlice(), { type: 'set-highlight', nodeId: 'n1' })
    expect(slice).toEqual(openSlice({ highlightedNodeId: 'n1' }))
  })

  it('clears highlightedNodeId when set to null', () => {
    const slice = reduceSystemView(openSlice({ highlightedNodeId: 'n1' }), {
      type: 'set-highlight',
      nodeId: null
    })
    expect(slice).toEqual(openSlice())
    expect('highlightedNodeId' in slice).toBe(false)
  })

  it('is a no-op when closed', () => {
    const closed = emptySystemViewSlice()
    expect(reduceSystemView(closed, { type: 'set-highlight', nodeId: 'n1' })).toBe(closed)
  })
})

describe('systemHudCounts', () => {
  it('is all-zero when closed', () => {
    expect(systemHudCounts(emptySystemViewSlice())).toEqual({ tocados: 0, nuevo: 0 })
  })

  it('counts editing/dirty endpoints as tocados and naciendo endpoints as nuevo', () => {
    const slice = openSlice({
      graph: graphOf([
        systemNode({ id: 'e1', state: 'editing' }),
        systemNode({ id: 'e2', state: 'dirty' }),
        systemNode({ id: 'e3', state: 'naciendo' }),
        systemNode({ id: 'e4', state: 'idle' }),
        systemNode({ id: 'e5', state: 'tested' })
      ])
    })
    expect(systemHudCounts(slice)).toEqual({ tocados: 2, nuevo: 1 })
  })

  it('only counts endpoint-kind nodes, matching the "N endpoints tocados" copy', () => {
    const slice = openSlice({
      graph: graphOf([
        systemNode({ id: 'r1', kind: 'router', state: 'editing' }),
        systemNode({ id: 's1', kind: 'service', state: 'naciendo' })
      ])
    })
    expect(systemHudCounts(slice)).toEqual({ tocados: 0, nuevo: 0 })
  })
})
