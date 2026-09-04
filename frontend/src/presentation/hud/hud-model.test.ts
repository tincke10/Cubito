import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hudModel } from './hud-model'
import { countNodeStates } from '../theme/node-state'
import { emptyWorktreeGraph } from '../../domain/worktree-graph/types'
import { emptyTerminalsState, reduceTerminals } from '../../application/terminal-session-model'
import type { SceneState } from '../../application/scene-store'

const baseState = (overrides: Partial<SceneState> = {}): SceneState => ({
  graph: emptyWorktreeGraph(),
  sync: { state: 'idle' },
  connection: { state: 'down', reason: 'not connected' },
  selection: { selectedId: null },
  repo: null,
  terminals: emptyTerminalsState(),
  ...overrides
})

describe('hudModel', () => {
  it('connection.label shows the connecting label', () => {
    const model = hudModel(baseState({ connection: { state: 'connecting' } }), { isMac: true })
    expect(model.connection.label).toBe('conectando…')
  })

  it('connection.dotColor is amber while connecting', () => {
    const model = hudModel(baseState({ connection: { state: 'connecting' } }), { isMac: true })
    expect(model.connection.dotColor).toBe('amber')
  })

  it('connection.label includes the attempt number when reconnecting', () => {
    const model = hudModel(
      baseState({ connection: { state: 'reconnecting', attempt: 3, nextRetryInMs: 2000 } }),
      { isMac: true }
    )
    expect(model.connection.label).toBe('reconectando… · intento 3')
  })

  it('connection.label includes the runtime id when connected', () => {
    const model = hudModel(baseState({ connection: { state: 'connected', runtimeId: '4f2a9c' } }), {
      isMac: true
    })
    expect(model.connection.label).toContain('4f2a9c')
  })

  it('connection.label shows a reconnecting-specific label', () => {
    const model = hudModel(
      baseState({ connection: { state: 'reconnecting', attempt: 1, nextRetryInMs: 500 } }),
      { isMac: true }
    )
    expect(model.connection.label.toLowerCase()).toContain('reconect')
  })

  it('connection.label includes the reason when down', () => {
    const model = hudModel(
      baseState({ connection: { state: 'down', reason: 'runtime unreachable' } }),
      {
        isMac: true
      }
    )
    expect(model.connection.label).toContain('runtime unreachable')
  })

  it('connection.dotColor differs between connected and each non-connected variant', () => {
    const connected = hudModel(baseState({ connection: { state: 'connected', runtimeId: 'x' } }), {
      isMac: true
    })
    const reconnecting = hudModel(
      baseState({ connection: { state: 'reconnecting', attempt: 1, nextRetryInMs: 500 } }),
      { isMac: true }
    )
    const down = hudModel(baseState({ connection: { state: 'down', reason: 'x' } }), {
      isMac: true
    })

    expect(connected.connection.dotColor).not.toBe(reconnecting.connection.dotColor)
    expect(connected.connection.dotColor).not.toBe(down.connection.dotColor)
  })

  it('repo is null when state.repo is null', () => {
    const model = hudModel(baseState({ repo: null }), { isMac: true })
    expect(model.repo).toBeNull()
  })

  it('repo passes through name and baseBranch when present', () => {
    const model = hudModel(baseState({ repo: { name: 'Cubito', baseBranch: 'main' } }), {
      isMac: true
    })
    expect(model.repo).toEqual({ name: 'Cubito', baseBranch: 'main' })
  })

  it('counters equals countNodeStates(graph) exactly — no independent computation', () => {
    const graph = emptyWorktreeGraph()
    const state = baseState({ graph })
    const model = hudModel(state, { isMac: true })
    expect(model.counters).toEqual(countNodeStates(graph))
  })

  it('chips include the Mac-labeled palette shortcut when isMac is true', () => {
    const model = hudModel(baseState(), { isMac: true })
    const paletteChip = model.chips.find((chip) => chip.description === 'paleta')
    expect(paletteChip?.key).toContain('⌘K')
  })

  it('chips include the non-Mac-labeled palette shortcut when isMac is false', () => {
    const model = hudModel(baseState(), { isMac: false })
    const paletteChip = model.chips.find((chip) => chip.description === 'paleta')
    expect(paletteChip?.key).toContain('Ctrl+K')
  })

  it('adds no [t] terminal chip when no node is selected', () => {
    const model = hudModel(baseState({ selection: { selectedId: null } }), { isMac: true })
    expect(model.chips.some((chip) => chip.key === 't')).toBe(false)
  })

  it('adds a [t] terminal chip when a node is selected and no terminal is open', () => {
    const model = hudModel(baseState({ selection: { selectedId: 'w1' } }), { isMac: true })
    expect(model.chips).toContainEqual({ key: 't', description: 'terminal' })
  })

  it('shows pin + exit chips (no tab chip) for a single terminal open in scene placement', () => {
    const terminals = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    const model = hudModel(baseState({ terminals, selection: { selectedId: 'w1' } }), {
      isMac: true
    })
    expect(model.chips).toContainEqual({ key: 'p', description: 'pin' })
    expect(model.chips).toContainEqual({ key: 'Ctrl+]', description: 'salir' })
    expect(model.chips.some((chip) => chip.key === '⇥')).toBe(false)
    expect(model.chips.some((chip) => chip.key === 't')).toBe(false)
  })

  it('adds the tab-switch chip once a second terminal is open on the same node', () => {
    let terminals = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    terminals = reduceTerminals(terminals, { type: 'open-terminal-for-node', nodeId: 'w1' })
    const model = hudModel(baseState({ terminals, selection: { selectedId: 'w1' } }), {
      isMac: true
    })
    expect(model.chips).toContainEqual({ key: '⇥', description: 'otra terminal' })
  })

  it('shows escena + cerrar-panel chips once the terminal is pinned to the hud', () => {
    let terminals = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    terminals = reduceTerminals(terminals, { type: 'set-placement', placement: 'hud' })
    const model = hudModel(baseState({ terminals, selection: { selectedId: 'w1' } }), {
      isMac: true
    })
    expect(model.chips).toContainEqual({ key: 'p', description: 'escena' })
    expect(model.chips).toContainEqual({ key: 'esc', description: 'cerrar panel' })
    expect(model.chips.some((chip) => chip.key === 'Ctrl+]')).toBe(false)
    expect(model.chips.some((chip) => chip.key === '⇥')).toBe(false)
  })

  it('also shows the tab-switch chip once pinned when a second terminal is open', () => {
    let terminals = reduceTerminals(emptyTerminalsState(), {
      type: 'open-terminal-for-node',
      nodeId: 'w1'
    })
    terminals = reduceTerminals(terminals, { type: 'open-terminal-for-node', nodeId: 'w1' })
    terminals = reduceTerminals(terminals, { type: 'set-placement', placement: 'hud' })
    const model = hudModel(baseState({ terminals, selection: { selectedId: 'w1' } }), {
      isMac: true
    })
    expect(model.chips).toContainEqual({ key: '⇥', description: 'otra terminal' })
  })

  it('never reads the global navigator to decide platform — it only takes `platform.isMac`', () => {
    const source = readFileSync(fileURLToPath(new URL('./hud-model.ts', import.meta.url)), 'utf-8')
    expect(source).not.toMatch(/\bnavigator\b/)
  })
})
