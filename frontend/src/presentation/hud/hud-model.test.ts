import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hudModel } from './hud-model'
import { countNodeStates } from '../theme/node-state'
import { emptyWorktreeGraph } from '../../domain/worktree-graph/types'
import type { SceneState } from '../../application/scene-store'

const baseState = (overrides: Partial<SceneState> = {}): SceneState => ({
  graph: emptyWorktreeGraph(),
  sync: { state: 'idle' },
  connection: { state: 'down', reason: 'not connected' },
  selection: { selectedId: null },
  repo: null,
  ...overrides
})

describe('hudModel', () => {
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
    const model = hudModel(baseState({ connection: { state: 'down', reason: 'runtime unreachable' } }), {
      isMac: true
    })
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
    const down = hudModel(baseState({ connection: { state: 'down', reason: 'x' } }), { isMac: true })

    expect(connected.connection.dotColor).not.toBe(reconnecting.connection.dotColor)
    expect(connected.connection.dotColor).not.toBe(down.connection.dotColor)
  })

  it('repo is null when state.repo is null', () => {
    const model = hudModel(baseState({ repo: null }), { isMac: true })
    expect(model.repo).toBeNull()
  })

  it('repo passes through name and baseBranch when present', () => {
    const model = hudModel(baseState({ repo: { name: 'Cubito', baseBranch: 'main' } }), { isMac: true })
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

  it('never reads the global navigator to decide platform — it only takes `platform.isMac`', () => {
    const source = readFileSync(fileURLToPath(new URL('./hud-model.ts', import.meta.url)), 'utf-8')
    expect(source).not.toMatch(/\bnavigator\b/)
  })
})
