import { describe, expect, it } from 'vitest'
import { emptyTerminalsState, reduceTerminals } from './terminal-session-model'

describe('emptyTerminalsState', () => {
  it('starts empty with streamId allocation at 1', () => {
    const state = emptyTerminalsState()
    expect(state.sessions.size).toBe(0)
    expect(state.byNode.size).toBe(0)
    expect(state.activePanel).toBeNull()
    expect(state.nextStreamId).toBe(1)
  })
})

describe('reduceTerminals — open-terminal-for-node', () => {
  it('allocates a monotonic client-side streamId starting at 1', () => {
    let state = emptyTerminalsState()
    state = reduceTerminals(state, { type: 'open-terminal-for-node', nodeId: 'w1' })
    expect(state.sessions.get(1)?.streamId).toBe(1)
    expect(state.nextStreamId).toBe(2)

    state = reduceTerminals(state, { type: 'open-terminal-for-node', nodeId: 'w1' })
    expect(state.sessions.get(2)?.streamId).toBe(2)
    expect(state.nextStreamId).toBe(3)
  })

  it('creates a session with status creating, no handle, and hasOutput false', () => {
    const state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    const session = state.sessions.get(1)
    expect(session).toMatchObject({
      streamId: 1,
      nodeId: 'w1',
      handle: null,
      status: 'creating',
      hasOutput: false
    })
  })

  it('appends the streamId to byNode tab list for that node', () => {
    let state = emptyTerminalsState()
    state = reduceTerminals(state, { type: 'open-terminal-for-node', nodeId: 'w1' })
    state = reduceTerminals(state, { type: 'open-terminal-for-node', nodeId: 'w1' })
    expect(state.byNode.get('w1')).toEqual([1, 2])
  })

  it('keeps separate tab lists per node', () => {
    let state = emptyTerminalsState()
    state = reduceTerminals(state, { type: 'open-terminal-for-node', nodeId: 'w1' })
    state = reduceTerminals(state, { type: 'open-terminal-for-node', nodeId: 'w2' })
    expect(state.byNode.get('w1')).toEqual([1])
    expect(state.byNode.get('w2')).toEqual([2])
  })

  it('sets activePanel to the new tab, defaulting to scene placement and focused', () => {
    const state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    expect(state.activePanel).toEqual({
      nodeId: 'w1',
      sessionIndex: 0,
      placement: 'scene',
      focused: true
    })
  })

  it('opening a second tab for the SAME node preserves the current placement', () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, { type: 'set-placement', placement: 'hud' })
    state = reduceTerminals(state, { type: 'open-terminal-for-node', nodeId: 'w1' })
    expect(state.activePanel).toEqual({
      nodeId: 'w1',
      sessionIndex: 1,
      placement: 'hud',
      focused: true
    })
  })

  it('opening a tab for a DIFFERENT node resets placement to scene', () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, { type: 'set-placement', placement: 'hud' })
    state = reduceTerminals(state, { type: 'open-terminal-for-node', nodeId: 'w2' })
    expect(state.activePanel).toEqual({
      nodeId: 'w2',
      sessionIndex: 0,
      placement: 'scene',
      focused: true
    })
  })
})

describe('reduceTerminals — subscribed', () => {
  it('sets handle, cols, rows and moves status to snapshotting', () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, {
      type: 'subscribed',
      streamId: 1,
      terminal: 'term-abc',
      cols: 80,
      rows: 24
    })
    expect(state.sessions.get(1)).toMatchObject({
      handle: 'term-abc',
      cols: 80,
      rows: 24,
      status: 'snapshotting'
    })
  })

  it('is a no-op for an unknown streamId', () => {
    const before = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    const after = reduceTerminals(before, {
      type: 'subscribed',
      streamId: 999,
      terminal: 'x',
      cols: 1,
      rows: 1
    })
    expect(after).toBe(before)
  })
})

describe('reduceTerminals — output-arrived', () => {
  it('flips status to live and hasOutput to true on first output', () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, {
      type: 'subscribed',
      streamId: 1,
      terminal: 't',
      cols: 80,
      rows: 24
    })
    state = reduceTerminals(state, { type: 'output-arrived', streamId: 1 })
    expect(state.sessions.get(1)).toMatchObject({ status: 'live', hasOutput: true })
  })

  it('is a no-op for an unknown streamId', () => {
    const before = emptyTerminalsState()
    const after = reduceTerminals(before, { type: 'output-arrived', streamId: 1 })
    expect(after).toBe(before)
  })
})

describe('reduceTerminals — placement and focus', () => {
  it('set-placement toggles the active panel placement scene <-> hud', () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, { type: 'set-placement', placement: 'hud' })
    expect(state.activePanel?.placement).toBe('hud')
    state = reduceTerminals(state, { type: 'set-placement', placement: 'scene' })
    expect(state.activePanel?.placement).toBe('scene')
  })

  it('set-placement is a no-op with no active panel', () => {
    const before = emptyTerminalsState()
    const after = reduceTerminals(before, { type: 'set-placement', placement: 'hud' })
    expect(after).toBe(before)
  })

  it('set-focused toggles focus on the active panel', () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, { type: 'set-focused', focused: false })
    expect(state.activePanel?.focused).toBe(false)
  })

  it('set-focused is a no-op with no active panel', () => {
    const before = emptyTerminalsState()
    const after = reduceTerminals(before, { type: 'set-focused', focused: true })
    expect(after).toBe(before)
  })
})

describe('reduceTerminals — next-tab', () => {
  it("cycles through a node's tabs, wrapping back to the first", () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, { type: 'open-terminal-for-node', nodeId: 'w1' })
    state = reduceTerminals(state, { type: 'open-terminal-for-node', nodeId: 'w1' })
    expect(state.activePanel?.sessionIndex).toBe(2)

    state = reduceTerminals(state, { type: 'next-tab', nodeId: 'w1' })
    expect(state.activePanel).toMatchObject({ nodeId: 'w1', sessionIndex: 0 })

    state = reduceTerminals(state, { type: 'next-tab', nodeId: 'w1' })
    expect(state.activePanel).toMatchObject({ nodeId: 'w1', sessionIndex: 1 })
  })

  it('is a no-op when the node has no tabs', () => {
    const before = emptyTerminalsState()
    const after = reduceTerminals(before, { type: 'next-tab', nodeId: 'w1' })
    expect(after).toBe(before)
  })

  it("switches to a different node's tab 0, preserving that node's own tab list", () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, { type: 'open-terminal-for-node', nodeId: 'w2' })
    state = reduceTerminals(state, { type: 'next-tab', nodeId: 'w1' })
    expect(state.activePanel).toMatchObject({ nodeId: 'w1', sessionIndex: 0 })
  })
})

describe('reduceTerminals — close-terminal', () => {
  it('removes the session and its byNode entry', () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, { type: 'close-terminal', streamId: 1 })
    expect(state.sessions.has(1)).toBe(false)
    expect(state.byNode.has('w1')).toBe(false)
  })

  it('clears activePanel when closing the last tab of the active node', () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, { type: 'close-terminal', streamId: 1 })
    expect(state.activePanel).toBeNull()
  })

  it('clamps the active sessionIndex when closing the currently-focused tab of several', () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, { type: 'open-terminal-for-node', nodeId: 'w1' })
    // activePanel currently points at streamId 2 (sessionIndex 1)
    state = reduceTerminals(state, { type: 'close-terminal', streamId: 2 })
    expect(state.byNode.get('w1')).toEqual([1])
    expect(state.activePanel).toMatchObject({ nodeId: 'w1', sessionIndex: 0 })
  })

  it('leaves activePanel untouched when closing a tab of a different node', () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, { type: 'open-terminal-for-node', nodeId: 'w2' })
    const before = state.activePanel
    state = reduceTerminals(state, { type: 'close-terminal', streamId: 1 })
    expect(state.activePanel).toEqual(before)
    expect(state.sessions.has(1)).toBe(false)
  })

  it('is a no-op for an unknown streamId', () => {
    const before = emptyTerminalsState()
    const after = reduceTerminals(before, { type: 'close-terminal', streamId: 42 })
    expect(after).toBe(before)
  })
})

describe('reduceTerminals — connection-lost / connection-regained', () => {
  it('connection-lost marks every non-ended session as subscribing', () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, {
      type: 'subscribed',
      streamId: 1,
      terminal: 't',
      cols: 80,
      rows: 24
    })
    state = reduceTerminals(state, { type: 'output-arrived', streamId: 1 })
    expect(state.sessions.get(1)?.status).toBe('live')

    state = reduceTerminals(state, { type: 'connection-lost' })
    expect(state.sessions.get(1)?.status).toBe('subscribing')
  })

  it('connection-lost is a no-op (same reference) when there are no sessions', () => {
    const before = emptyTerminalsState()
    const after = reduceTerminals(before, { type: 'connection-lost' })
    expect(after).toBe(before)
  })

  it('connection-regained resets error sessions back to creating so they can retry', () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = {
      ...state,
      sessions: new Map(state.sessions).set(1, {
        ...state.sessions.get(1)!,
        status: 'error',
        error: 'boom'
      })
    }
    state = reduceTerminals(state, { type: 'connection-regained' })
    const session = state.sessions.get(1)
    expect(session?.status).toBe('creating')
    expect('error' in (session ?? {})).toBe(false)
  })

  it('connection-regained leaves subscribing sessions untouched (awaiting a fresh subscribed emit)', () => {
    let state = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    state = reduceTerminals(state, { type: 'connection-lost' })
    const before = state
    state = reduceTerminals(state, { type: 'connection-regained' })
    expect(state).toBe(before)
  })
})
