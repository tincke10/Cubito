import { describe, expect, it } from 'vitest'
import { nodeLabelModel } from './node-label-model'
import type { LabelTone } from './node-label-model'
import { deriveDecorations, deriveNodeState } from '../theme/node-state'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import type { NodeActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeNode } from '../../domain/worktree-graph/types'

const node = (activity: Partial<NodeActivity> = {}, overrides: Partial<WorktreeNode> = {}): WorktreeNode => ({
  id: 'repo::/path/feature-x',
  branch: 'refs/heads/feature-x',
  path: '/path/feature-x',
  status: 'in-progress',
  isMain: false,
  kind: 'worktree',
  parentId: null,
  childIds: [],
  activity: { ...inertActivity(), ...activity },
  ...overrides
})

const modelFor = (n: WorktreeNode): ReturnType<typeof nodeLabelModel> => {
  const state = deriveNodeState(n)
  return nodeLabelModel(n, state, deriveDecorations(n, false))
}

const SEMANTIC_TONES: readonly LabelTone[] = ['accent', 'primary', 'dim', 'faint', 'amber', 'amberDim', 'info']

describe('nodeLabelModel', () => {
  it('primary is the short branch name, in the same fixed tone regardless of state', () => {
    const idle = modelFor(node())
    const working = modelFor(node({ agentStatus: 'working' }))
    expect(idle.primary.text).toBe('feature-x')
    expect(idle.primary.tone).toBe(working.primary.tone)
    expect(SEMANTIC_TONES).toContain(idle.primary.tone)
  })

  it('passes through a branch name with no refs/heads/ prefix unchanged', () => {
    const model = modelFor(node({}, { branch: 'main' }))
    expect(model.primary.text).toBe('main')
  })

  it('secondary carries the agent status while working', () => {
    const model = modelFor(node({ agentStatus: 'working' }))
    expect(model.secondary).not.toBeNull()
    expect(model.secondary!.text.length).toBeGreaterThan(0)
  })

  it('secondary carries the agent status while waiting for input', () => {
    const model = modelFor(node({ agentStatus: 'waiting-input' }))
    expect(model.secondary).not.toBeNull()
  })

  it('secondary is the diff, using U+2212 MINUS (not a hyphen), when dirty', () => {
    const n = node({ diff: { added: 412, removed: 38 } })
    expect(deriveNodeState(n)).toBe('dirty')
    const model = modelFor(n)
    expect(model.secondary!.text).toBe('+412 −38')
    expect(model.secondary!.text).not.toContain('-38')
  })

  it('secondary carries the spawn phase/progress while spawning (engine-blocked: no production path populates spawn yet, fixture only)', () => {
    const n = node({ spawn: { phase: 'cloning', progress: 0.4 } })
    expect(deriveNodeState(n)).toBe('spawning')
    const model = modelFor(n)
    expect(model.secondary!.text).toContain('cloning')
    expect(model.secondary!.text).toContain('40')
  })

  it('secondary is null when idle, archived, or unread with no diff to show', () => {
    for (const n of [node(), node({ isArchived: true }), node({ isUnread: true })]) {
      expect(modelFor(n).secondary).toBeNull()
    }
  })

  it('callout is present if and only if the state is waiting-input', () => {
    const cases: ReadonlyArray<readonly [WorktreeNode, boolean]> = [
      [node({ agentStatus: 'waiting-input' }), true],
      [node({ agentStatus: 'working' }), false],
      [node(), false],
      [node({ isArchived: true }), false],
      [node({ isUnread: true }), false],
      [node({ diff: { added: 1, removed: 1 } }), false],
      [node({ spawn: { phase: 'cloning', progress: 0.1 } }), false]
    ]
    for (const [n, expectCallout] of cases) {
      const model = modelFor(n)
      expect(model.callout !== null).toBe(expectCallout)
      if (model.callout) {
        expect(model.callout.title.text.length).toBeGreaterThan(0)
        expect(model.callout.hint.text.length).toBeGreaterThan(0)
        expect(SEMANTIC_TONES).toContain(model.callout.title.tone)
        expect(SEMANTIC_TONES).toContain(model.callout.hint.tone)
      }
    }
  })

  it('never emits a raw hex value — every tone is a semantic name', () => {
    const fixtures = [
      node(),
      node({ agentStatus: 'working' }),
      node({ agentStatus: 'waiting-input' }),
      node({ diff: { added: 3, removed: 1 } }),
      node({ isUnread: true }),
      node({ isArchived: true }),
      node({ spawn: { phase: 'checkout', progress: 0.5 } })
    ]
    for (const n of fixtures) {
      const model = modelFor(n)
      const lines = [model.primary, model.secondary, model.callout?.title, model.callout?.hint].filter(
        (l): l is { text: string; tone: LabelTone } => l != null
      )
      for (const line of lines) {
        expect(line.text).not.toMatch(/#|0x/)
        expect(SEMANTIC_TONES).toContain(line.tone)
      }
    }
  })
})
