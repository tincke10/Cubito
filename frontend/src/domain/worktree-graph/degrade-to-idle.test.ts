import { describe, expect, it } from 'vitest'
import { buildWorktreeGraph } from './build-graph'
import type { RawWorktreeRecord } from './build-graph'
import { deriveDecorations, deriveNodeState } from '../../presentation/theme/node-state'

describe('degrade-to-idle invariant', () => {
  it("today's worktree.list record shape, with no optional activity fields, always derives 'idle'", () => {
    const record: RawWorktreeRecord = {
      id: 'repo::/path/main',
      branch: 'refs/heads/main',
      parentWorktreeId: null,
      childWorktreeIds: [],
      workspaceStatus: 'in-progress',
      git: { path: '/path/main', isMainWorktree: true }
    }
    const graph = buildWorktreeGraph([record])
    const node = graph.nodes.get('repo::/path/main')
    expect(node).toBeDefined()
    if (!node) return

    expect(deriveNodeState(node)).toBe('idle')

    const selected = deriveDecorations(node, true)
    expect(selected).toEqual({
      unreadDot: false,
      diffLabel: null,
      waitingCallout: false,
      selectionRing: true,
      dimmed: false
    })

    const unselected = deriveDecorations(node, false)
    expect(unselected).toEqual({
      unreadDot: false,
      diffLabel: null,
      waitingCallout: false,
      selectionRing: false,
      dimmed: false
    })
  })
})
