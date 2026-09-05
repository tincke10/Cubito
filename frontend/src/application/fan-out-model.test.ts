import { describe, expect, it } from 'vitest'
import {
  FANOUT_PLACEHOLDER_PREFIX,
  MAX_FANOUT,
  MIN_FANOUT,
  clampFanOutCount,
  composeFanOutGraph,
  emptyFanOutSlice,
  fanOutCounts,
  fanOutMemberIds,
  mapPsStatusToAgentStatus,
  reduceFanOut,
  toFanOutInputs
} from './fan-out-model'
import type { FanOutBatchEntry, FanOutSlice } from './fan-out-model'
import { childrenOf } from '../domain/worktree-graph/graph-traversal'
import { inertActivity } from '../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeNode } from '../domain/worktree-graph/types'

const node = (overrides: Partial<WorktreeNode> = {}): WorktreeNode => ({
  id: 'repo::/path/parent',
  repoId: 'repo',
  branch: 'refs/heads/main',
  path: '/path/parent',
  status: 'in-progress',
  isMain: true,
  kind: 'root',
  parentId: null,
  childIds: [],
  activity: inertActivity(),
  ...overrides
})

const graphOf = (nodes: readonly WorktreeNode[]): WorktreeGraph => ({
  nodes: new Map(nodes.map((n) => [n.id, n])),
  edges: [],
  rootIds: nodes.filter((n) => n.parentId === null).map((n) => n.id)
})

const formSliceWithCount = (count: number): FanOutSlice => ({
  view: 'form',
  parentId: 'w1',
  fields: { count, agent: 'none', prompt: '' },
  repoSelector: null
})

const runningSliceWithBatch = (batch: readonly FanOutBatchEntry[]): FanOutSlice => ({
  view: 'running',
  parentId: 'w1',
  fields: { count: batch.length, agent: 'claude', prompt: '' },
  repoSelector: 'id:repo-a',
  batch,
  memberStatus: {}
})

describe('emptyFanOutSlice', () => {
  it('starts closed with no repo selector', () => {
    expect(emptyFanOutSlice()).toEqual({ view: 'closed', repoSelector: null })
  })
})

describe('reduceFanOut — open-for-node', () => {
  it('opens a form anchored to the node with a default count of 3', () => {
    const slice = reduceFanOut(emptyFanOutSlice(), { type: 'open-for-node', nodeId: 'w1' })
    expect(slice).toEqual({
      view: 'form',
      parentId: 'w1',
      fields: { count: 3, agent: 'none', prompt: '' },
      repoSelector: null
    })
  })

  it('preserves the repo selector already set', () => {
    const closed: FanOutSlice = { view: 'closed', repoSelector: 'id:repo-a' }
    const slice = reduceFanOut(closed, { type: 'open-for-node', nodeId: 'w1' })
    expect(slice.repoSelector).toBe('id:repo-a')
  })

  it('resets to a fresh form even from a running batch', () => {
    const running: FanOutSlice = {
      view: 'running',
      parentId: 'old',
      fields: { count: 5, agent: 'claude', prompt: 'go' },
      repoSelector: 'id:repo-a',
      batch: [{ mutationId: 'm1', worktreeId: null, failed: false }],
      memberStatus: {}
    }
    const slice = reduceFanOut(running, { type: 'open-for-node', nodeId: 'w2' })
    expect(slice).toEqual({
      view: 'form',
      parentId: 'w2',
      fields: { count: 3, agent: 'none', prompt: '' },
      repoSelector: 'id:repo-a'
    })
  })
})

describe('reduceFanOut — update-count', () => {
  it.each([
    [1, MIN_FANOUT],
    [0, MIN_FANOUT],
    [2, 2],
    [5, 5],
    [8, 8],
    [9, MAX_FANOUT],
    [100, MAX_FANOUT]
  ])('clamps %i to %i', (input, expected) => {
    const slice = reduceFanOut(formSliceWithCount(3), { type: 'update-count', count: input })
    expect(slice).toMatchObject({ fields: { count: expected } })
  })

  it('is a no-op outside the form view', () => {
    const closed = emptyFanOutSlice()
    expect(reduceFanOut(closed, { type: 'update-count', count: 5 })).toBe(closed)
  })
})

describe('reduceFanOut — update-agent / update-prompt', () => {
  const formSlice: FanOutSlice = {
    view: 'form',
    parentId: 'w1',
    fields: { count: 3, agent: 'none', prompt: '' },
    repoSelector: null
  }

  it('merges the agent field in form view', () => {
    const slice = reduceFanOut(formSlice, { type: 'update-agent', agent: 'claude' })
    expect(slice).toMatchObject({ fields: { agent: 'claude', count: 3, prompt: '' } })
  })

  it('merges the prompt field in form view', () => {
    const slice = reduceFanOut(formSlice, { type: 'update-prompt', prompt: 'fix the bug' })
    expect(slice).toMatchObject({ fields: { prompt: 'fix the bug', count: 3, agent: 'none' } })
  })

  it('update-agent is a no-op outside form', () => {
    const closed = emptyFanOutSlice()
    expect(reduceFanOut(closed, { type: 'update-agent', agent: 'claude' })).toBe(closed)
  })

  it('update-prompt is a no-op outside form', () => {
    const closed = emptyFanOutSlice()
    expect(reduceFanOut(closed, { type: 'update-prompt', prompt: 'x' })).toBe(closed)
  })
})

describe('reduceFanOut — set-repo-selector', () => {
  it('is a no-op when closed', () => {
    const closed = emptyFanOutSlice()
    expect(reduceFanOut(closed, { type: 'set-repo-selector', repoSelector: 'id:a' })).toBe(closed)
  })

  it('updates the selector from the form view', () => {
    const formSlice: FanOutSlice = {
      view: 'form',
      parentId: 'w1',
      fields: { count: 3, agent: 'none', prompt: '' },
      repoSelector: null
    }
    const slice = reduceFanOut(formSlice, { type: 'set-repo-selector', repoSelector: 'id:a' })
    expect(slice.repoSelector).toBe('id:a')
  })

  it('updates the selector from the running view', () => {
    const running: FanOutSlice = {
      view: 'running',
      parentId: 'w1',
      fields: { count: 3, agent: 'none', prompt: '' },
      repoSelector: null,
      batch: [],
      memberStatus: {}
    }
    const slice = reduceFanOut(running, { type: 'set-repo-selector', repoSelector: 'id:b' })
    expect(slice.repoSelector).toBe('id:b')
  })
})

describe('reduceFanOut — submit', () => {
  const validForm: FanOutSlice = {
    view: 'form',
    parentId: 'w1',
    fields: { count: 3, agent: 'none', prompt: '' },
    repoSelector: 'id:repo-a'
  }

  it('is a no-op outside the form view', () => {
    const closed = emptyFanOutSlice()
    expect(reduceFanOut(closed, { type: 'submit', mutationIds: ['m1'] })).toBe(closed)
  })

  it('transitions to running with a pending batch entry per mutationId', () => {
    const slice = reduceFanOut(validForm, {
      type: 'submit',
      mutationIds: ['m1', 'm2', 'm3']
    })
    expect(slice).toEqual({
      view: 'running',
      parentId: 'w1',
      fields: { count: 3, agent: 'none', prompt: '' },
      repoSelector: 'id:repo-a',
      batch: [
        { mutationId: 'm1', worktreeId: null, failed: false },
        { mutationId: 'm2', worktreeId: null, failed: false },
        { mutationId: 'm3', worktreeId: null, failed: false }
      ],
      memberStatus: {}
    })
  })

  it('produces a form-error when the repo selector is missing', () => {
    const slice = reduceFanOut(
      { ...validForm, repoSelector: null },
      { type: 'submit', mutationIds: ['m1'] }
    )
    expect(slice.view).toBe('form')
    expect((slice as { errorMessage?: string }).errorMessage).toBeDefined()
  })

  it('produces a form-error when count is out of bounds', () => {
    const outOfBounds: FanOutSlice = {
      ...validForm,
      fields: { ...validForm.fields, count: 99 }
    }
    const slice = reduceFanOut(outOfBounds, { type: 'submit', mutationIds: ['m1'] })
    expect(slice.view).toBe('form')
    expect((slice as { errorMessage?: string }).errorMessage).toBeDefined()
  })
})

describe('reduceFanOut — form-error', () => {
  it('applies only to the form view', () => {
    const formSlice: FanOutSlice = {
      view: 'form',
      parentId: 'w1',
      fields: { count: 3, agent: 'none', prompt: '' },
      repoSelector: null
    }
    const slice = reduceFanOut(formSlice, { type: 'form-error', message: 'boom' })
    expect((slice as { errorMessage?: string }).errorMessage).toBe('boom')
  })

  it('is a no-op outside the form view', () => {
    const closed = emptyFanOutSlice()
    expect(reduceFanOut(closed, { type: 'form-error', message: 'boom' })).toBe(closed)
  })
})

describe('reduceFanOut — child-created / child-failed / member-status', () => {
  it('child-created fills in the worktreeId for the matching entry only', () => {
    const slice = runningSliceWithBatch([
      { mutationId: 'm1', worktreeId: null, failed: false },
      { mutationId: 'm2', worktreeId: null, failed: false }
    ])
    const next = reduceFanOut(slice, { type: 'child-created', mutationId: 'm1', worktreeId: 'w2' })
    expect(next).toMatchObject({
      batch: [
        { mutationId: 'm1', worktreeId: 'w2', failed: false },
        { mutationId: 'm2', worktreeId: null, failed: false }
      ]
    })
  })

  it('child-failed marks the matching entry failed only', () => {
    const slice = runningSliceWithBatch([
      { mutationId: 'm1', worktreeId: null, failed: false },
      { mutationId: 'm2', worktreeId: null, failed: false }
    ])
    const next = reduceFanOut(slice, { type: 'child-failed', mutationId: 'm2' })
    expect(next).toMatchObject({
      batch: [
        { mutationId: 'm1', worktreeId: null, failed: false },
        { mutationId: 'm2', worktreeId: null, failed: true }
      ]
    })
  })

  it('member-status merges into the memberStatus map', () => {
    const slice = runningSliceWithBatch([{ mutationId: 'm1', worktreeId: 'w2', failed: false }])
    const next = reduceFanOut(slice, { type: 'member-status', worktreeId: 'w2', status: 'working' })
    expect(next).toMatchObject({ memberStatus: { w2: 'working' } })
  })

  it('all three are a no-op outside the running view', () => {
    const closed = emptyFanOutSlice()
    expect(
      reduceFanOut(closed, { type: 'child-created', mutationId: 'm1', worktreeId: 'w2' })
    ).toBe(closed)
    expect(reduceFanOut(closed, { type: 'child-failed', mutationId: 'm1' })).toBe(closed)
    expect(
      reduceFanOut(closed, { type: 'member-status', worktreeId: 'w2', status: 'working' })
    ).toBe(closed)
  })
})

describe('reduceFanOut — cancel / close', () => {
  it.each(['cancel', 'close'] as const)(
    '%s returns to closed, keeping repoSelector, from form',
    (type) => {
      const formSlice: FanOutSlice = {
        view: 'form',
        parentId: 'w1',
        fields: { count: 3, agent: 'none', prompt: '' },
        repoSelector: 'id:a'
      }
      expect(reduceFanOut(formSlice, { type })).toEqual({ view: 'closed', repoSelector: 'id:a' })
    }
  )

  it.each(['cancel', 'close'] as const)(
    '%s returns to closed, keeping repoSelector, from running',
    (type) => {
      const running: FanOutSlice = {
        view: 'running',
        parentId: 'w1',
        fields: { count: 3, agent: 'none', prompt: '' },
        repoSelector: 'id:b',
        batch: [],
        memberStatus: {}
      }
      expect(reduceFanOut(running, { type })).toEqual({ view: 'closed', repoSelector: 'id:b' })
    }
  )
})

describe('clampFanOutCount', () => {
  it('clamps below MIN_FANOUT and above MAX_FANOUT', () => {
    expect(clampFanOutCount(0)).toBe(MIN_FANOUT)
    expect(clampFanOutCount(1000)).toBe(MAX_FANOUT)
    expect(clampFanOutCount(4)).toBe(4)
  })
})

describe('toFanOutInputs', () => {
  const formSlice: FanOutSlice = {
    view: 'form',
    parentId: 'w1',
    fields: { count: 3, agent: 'none', prompt: '' },
    repoSelector: null
  }

  it('returns nothing for a closed slice', () => {
    expect(toFanOutInputs(emptyFanOutSlice(), 'id:a', ['m1'])).toEqual([])
  })

  it('builds one input per mutationId with a distinct clientMutationId, sharing repo + parentWorktree', () => {
    const inputs = toFanOutInputs(formSlice, 'id:repo-a', ['m1', 'm2'])
    expect(inputs).toEqual([
      {
        repo: 'id:repo-a',
        parentWorktree: 'w1',
        clientMutationId: 'm1',
        name: 'camada-m1',
        nameWasGenerated: true
      },
      {
        repo: 'id:repo-a',
        parentWorktree: 'w1',
        clientMutationId: 'm2',
        name: 'camada-m2',
        nameWasGenerated: true
      }
    ])
  })

  it('always generates a name (host rejects an empty one) and includes startupAgent/startupPrompt only when agent is not none', () => {
    const inputs = toFanOutInputs(formSlice, 'id:repo-a', ['m1'])
    expect(inputs[0]).toHaveProperty('name')
    expect(inputs[0]).not.toHaveProperty('startupAgent')
    expect(inputs[0]).not.toHaveProperty('startupPrompt')
  })

  it('generates a non-empty, sanitize-safe, deterministic name per mutationId', () => {
    const mutationIds = ['aaaa-bbbb-cccc', 'dddd-eeee-ffff', '00001111-2222']
    const inputs = toFanOutInputs(formSlice, 'id:repo-a', mutationIds)

    for (const input of inputs) {
      expect(input.name).toBeTruthy()
      expect(input.name).toMatch(/^[a-z0-9-]+$/)
      expect(input.nameWasGenerated).toBe(true)
    }

    const names = inputs.map((input) => input.name)
    expect(new Set(names).size).toBe(names.length)

    // Deterministic for a given mutationId: same input twice -> same name.
    const rerun = toFanOutInputs(formSlice, 'id:repo-a', mutationIds)
    expect(rerun.map((input) => input.name)).toEqual(names)
  })

  it('includes startupAgent + startupPrompt when an agent is chosen and prompt is non-blank', () => {
    const withAgent: FanOutSlice = {
      ...formSlice,
      fields: { count: 2, agent: 'claude', prompt: 'ship it' }
    }
    const inputs = toFanOutInputs(withAgent, 'id:repo-a', ['m1'])
    expect(inputs[0]).toMatchObject({ startupAgent: 'claude', startupPrompt: 'ship it' })
  })

  it('omits startupPrompt when the prompt is blank even with an agent chosen', () => {
    const withAgent: FanOutSlice = {
      ...formSlice,
      fields: { count: 2, agent: 'claude', prompt: '   ' }
    }
    const inputs = toFanOutInputs(withAgent, 'id:repo-a', ['m1'])
    expect(inputs[0]).toMatchObject({ startupAgent: 'claude' })
    expect(inputs[0]).not.toHaveProperty('startupPrompt')
  })
})

describe('mapPsStatusToAgentStatus', () => {
  it.each([
    ['working', 'working'],
    ['permission', 'waiting-input'],
    ['idle', 'idle'],
    ['unknown-status', 'idle']
  ] as const)('maps %s to %s', (psStatus, expected) => {
    expect(mapPsStatusToAgentStatus(psStatus)).toBe(expected)
  })
})

describe('fanOutMemberIds', () => {
  it('is empty when closed', () => {
    expect(fanOutMemberIds(emptyFanOutSlice())).toEqual([])
  })

  it('is just the parent while in form (no children created yet)', () => {
    const formSlice: FanOutSlice = {
      view: 'form',
      parentId: 'w1',
      fields: { count: 3, agent: 'none', prompt: '' },
      repoSelector: null
    }
    expect(fanOutMemberIds(formSlice)).toEqual(['w1'])
  })

  it('is the parent plus every created worktreeId, excluding pending/failed entries', () => {
    const running: FanOutSlice = {
      view: 'running',
      parentId: 'w1',
      fields: { count: 3, agent: 'none', prompt: '' },
      repoSelector: null,
      batch: [
        { mutationId: 'm1', worktreeId: 'w2', failed: false },
        { mutationId: 'm2', worktreeId: null, failed: false },
        { mutationId: 'm3', worktreeId: null, failed: true },
        { mutationId: 'm4', worktreeId: 'w4', failed: false }
      ],
      memberStatus: {}
    }
    expect(fanOutMemberIds(running)).toEqual(['w1', 'w2', 'w4'])
  })
})

describe('fanOutCounts', () => {
  it('is all zero outside the running view', () => {
    expect(fanOutCounts(emptyFanOutSlice())).toEqual({
      total: 0,
      naciendo: 0,
      working: 0,
      waitingInput: 0,
      created: 0,
      failed: 0
    })
  })

  it('matches the mockup fixture: 2 trabajando · 1 esperando · 1 naciendo · 1 listo', () => {
    const running: FanOutSlice = {
      view: 'running',
      parentId: 'w1',
      fields: { count: 5, agent: 'claude', prompt: '' },
      repoSelector: 'id:a',
      batch: [
        { mutationId: 'm1', worktreeId: 'w2', failed: false },
        { mutationId: 'm2', worktreeId: 'w3', failed: false },
        { mutationId: 'm3', worktreeId: 'w4', failed: false },
        { mutationId: 'm4', worktreeId: 'w5', failed: false },
        { mutationId: 'm5', worktreeId: null, failed: false }
      ],
      memberStatus: { w2: 'working', w3: 'working', w4: 'waiting-input', w5: 'idle' }
    }
    expect(fanOutCounts(running)).toEqual({
      total: 5,
      naciendo: 1,
      working: 2,
      waitingInput: 1,
      created: 1,
      failed: 0
    })
  })

  it('counts a failed entry separately from naciendo and created', () => {
    const running: FanOutSlice = {
      view: 'running',
      parentId: 'w1',
      fields: { count: 2, agent: 'none', prompt: '' },
      repoSelector: null,
      batch: [
        { mutationId: 'm1', worktreeId: null, failed: true },
        { mutationId: 'm2', worktreeId: null, failed: false }
      ],
      memberStatus: {}
    }
    expect(fanOutCounts(running)).toEqual({
      total: 2,
      naciendo: 1,
      working: 0,
      waitingInput: 0,
      created: 0,
      failed: 1
    })
  })

  it('treats a created member with no memberStatus entry as idle (created)', () => {
    const running: FanOutSlice = {
      view: 'running',
      parentId: 'w1',
      fields: { count: 1, agent: 'none', prompt: '' },
      repoSelector: null,
      batch: [{ mutationId: 'm1', worktreeId: 'w2', failed: false }],
      memberStatus: {}
    }
    expect(fanOutCounts(running).created).toBe(1)
  })
})

describe('composeFanOutGraph', () => {
  const parent = node({ id: 'w1', childIds: [] })

  it('returns the graph unchanged outside the running view', () => {
    const graph = graphOf([parent])
    expect(composeFanOutGraph(graph, emptyFanOutSlice())).toBe(graph)
  })

  it('injects a spawning placeholder per pending entry, linked into the parent childIds', () => {
    const graph = graphOf([parent])
    const running: FanOutSlice = {
      view: 'running',
      parentId: 'w1',
      fields: { count: 2, agent: 'claude', prompt: '' },
      repoSelector: 'id:a',
      batch: [
        { mutationId: 'm1', worktreeId: null, failed: false },
        { mutationId: 'm2', worktreeId: null, failed: false }
      ],
      memberStatus: {}
    }
    const composed = composeFanOutGraph(graph, running)

    const placeholderIds = [`${FANOUT_PLACEHOLDER_PREFIX}m1`, `${FANOUT_PLACEHOLDER_PREFIX}m2`]
    for (const id of placeholderIds) {
      const placeholder = composed.nodes.get(id)
      expect(placeholder).toBeDefined()
      expect(placeholder?.activity.spawn).not.toBeNull()
      expect(placeholder?.parentId).toBe('w1')
    }
    expect(childrenOf(composed, 'w1')).toEqual(expect.arrayContaining(placeholderIds))
  })

  it('skips a failed entry — no placeholder is injected for it', () => {
    const graph = graphOf([parent])
    const running: FanOutSlice = {
      view: 'running',
      parentId: 'w1',
      fields: { count: 1, agent: 'none', prompt: '' },
      repoSelector: null,
      batch: [{ mutationId: 'm1', worktreeId: null, failed: true }],
      memberStatus: {}
    }
    const composed = composeFanOutGraph(graph, running)
    expect(composed.nodes.has(`${FANOUT_PLACEHOLDER_PREFIX}m1`)).toBe(false)
  })

  it('skips an already-real entry — no placeholder, and overlays its memberStatus', () => {
    const child = node({ id: 'w2', parentId: 'w1', kind: 'worktree', isMain: false })
    const graph = graphOf([parent, child])
    const running: FanOutSlice = {
      view: 'running',
      parentId: 'w1',
      fields: { count: 1, agent: 'none', prompt: '' },
      repoSelector: null,
      batch: [{ mutationId: 'm1', worktreeId: 'w2', failed: false }],
      memberStatus: { w2: 'working' }
    }
    const composed = composeFanOutGraph(graph, running)
    expect(composed.nodes.has(`${FANOUT_PLACEHOLDER_PREFIX}m1`)).toBe(false)
    expect(composed.nodes.get('w2')?.activity.agentStatus).toBe('working')
  })

  it('is idempotent — composing twice produces the same result', () => {
    const graph = graphOf([parent])
    const running: FanOutSlice = {
      view: 'running',
      parentId: 'w1',
      fields: { count: 1, agent: 'none', prompt: '' },
      repoSelector: null,
      batch: [{ mutationId: 'm1', worktreeId: null, failed: false }],
      memberStatus: {}
    }
    const once = composeFanOutGraph(graph, running)
    const twice = composeFanOutGraph(once, running)
    expect([...twice.nodes.keys()].sort()).toEqual([...once.nodes.keys()].sort())
    expect(twice.nodes.get('w1')?.childIds).toEqual(once.nodes.get('w1')?.childIds)
  })
})
