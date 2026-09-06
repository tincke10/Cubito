import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveRunScope,
  resolveLeaseCaller,
  assertLeaseOwnership,
  buildLeasePaneKey,
  buildLeaseHandle
} from './orchestration-run-scope'
import { isEquivalentPaneKey } from '../../orchestration/db/pane-key-match'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { createOrchestrationRpcHarness } from './orchestration-rpc-test-harness'
import type { RunRow } from '../../orchestration/types'

/**
 * Wave 2 (fan-out v2 Change A): a lease (paired GUI device, no terminal) binds
 * a Run by device ownership rather than by pane. This is the auth boundary for
 * a caller with no PTY and no attestable evidence, so these tests are
 * adversarial-first: every mismatch must fence, never silently resolve.
 */

// Why: OrchestrationError carries the machine-readable verdict in `.code`, not in `.message`.
function expectFenced(fn: () => unknown, code: string): void {
  try {
    fn()
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code)
    return
  }
  throw new Error(`expected function to throw with code ${code}`)
}

function makeLeaseRun(overrides: Partial<RunRow> = {}): RunRow {
  return {
    id: 'run_1',
    objective: 'obj',
    home_database: 'home.db',
    coordinator_handle: buildLeaseHandle('device_1'),
    coordinator_pane_key: buildLeasePaneKey('device_1', 'run_1'),
    consumer_generation: 1,
    legacy: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('buildLeasePaneKey / buildLeaseHandle', () => {
  it('formats a per-Run synthetic pane key', () => {
    expect(buildLeasePaneKey('device_1', 'run_1')).toBe('lease:device_1:run_1')
  })

  it('formats a per-device synthetic handle', () => {
    expect(buildLeaseHandle('device_1')).toBe('lease:device_1')
  })
})

describe('resolveLeaseCaller', () => {
  it('returns the lease handle and a null paneKey when no Run exists yet', () => {
    expect(resolveLeaseCaller('device_1')).toEqual({ handle: 'lease:device_1', paneKey: null })
  })

  it('returns the lease handle and per-Run paneKey once a Run id is known', () => {
    expect(resolveLeaseCaller('device_1', 'run_1')).toEqual({
      handle: 'lease:device_1',
      paneKey: 'lease:device_1:run_1'
    })
  })
})

describe('assertLeaseOwnership', () => {
  it('does not throw for the matching lease owner', () => {
    expect(() => assertLeaseOwnership(makeLeaseRun(), 'device_1')).not.toThrow()
  })

  it('fences a different device id from the same Run (non-owner)', () => {
    expectFenced(() => assertLeaseOwnership(makeLeaseRun(), 'device_2'), 'consumer_fenced')
  })

  it('fences a legacy Run even if pane/handle happen to match', () => {
    expectFenced(
      () => assertLeaseOwnership(makeLeaseRun({ legacy: 1 }), 'device_1'),
      'consumer_fenced'
    )
  })

  it('fences on coordinator_pane_key mismatch (right device, wrong run id encoded)', () => {
    const run = makeLeaseRun({ coordinator_pane_key: buildLeasePaneKey('device_1', 'other_run') })
    expectFenced(() => assertLeaseOwnership(run, 'device_1'), 'consumer_fenced')
  })

  it('fences on coordinator_handle mismatch', () => {
    const run = makeLeaseRun({ coordinator_handle: buildLeaseHandle('device_2') })
    expectFenced(() => assertLeaseOwnership(run, 'device_1'), 'consumer_fenced')
  })

  it('fences when the run was never lease-bound (terminal-owned pane/handle)', () => {
    const run = makeLeaseRun({
      coordinator_handle: 'term_coord',
      coordinator_pane_key: 'tab_coord:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    })
    expectFenced(() => assertLeaseOwnership(run, 'device_1'), 'consumer_fenced')
  })
})

describe('synthetic lease pane key vs real pane identity', () => {
  it('is rejected by parsePaneKey (more than one colon)', () => {
    expect(parsePaneKey(buildLeasePaneKey('device_1', 'run_1'))).toBeNull()
  })

  it('does not leaf-match a real tabId:leafId pane via isEquivalentPaneKey', () => {
    const realPane = 'tab_coord:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    expect(isEquivalentPaneKey(buildLeasePaneKey('device_1', 'run_1'), realPane)).toBe(false)
  })

  it('only matches itself exactly (fallback exact-match semantics)', () => {
    const key = buildLeasePaneKey('device_1', 'run_1')
    expect(isEquivalentPaneKey(key, key)).toBe(true)
    expect(isEquivalentPaneKey(key, buildLeasePaneKey('device_1', 'run_2'))).toBe(false)
  })
})

describe('resolveRunScope — lease branch', () => {
  const h = createOrchestrationRpcHarness()

  afterEach(() => {
    h.cleanup()
  })

  // Why: createRun needs a placeholder pane key; the id it mints is embedded afterwards.
  function bindLeaseRun(db: ReturnType<typeof h.setup>['db'], deviceId: string): string {
    const created = db.createRun({
      objective: 'lease run',
      coordinatorHandle: buildLeaseHandle(deviceId),
      coordinatorPaneKey: 'placeholder'
    })
    db.bindRun({
      runId: created.id,
      coordinatorHandle: buildLeaseHandle(deviceId),
      coordinatorPaneKey: buildLeasePaneKey(deviceId, created.id)
    })
    return created.id
  }

  it('resolves the run scope for the matching lease owner', () => {
    const { db, runtime } = h.setup(false)
    const runId = bindLeaseRun(db, 'device_1')

    const run = resolveRunScope(runtime, {
      runId,
      requireCurrentConsumer: true,
      leaseDeviceId: 'device_1'
    })

    expect(run.id).toBe(runId)
  })

  it('fences a non-owner device id', () => {
    const { db, runtime } = h.setup(false)
    const runId = bindLeaseRun(db, 'device_1')

    expectFenced(
      () =>
        resolveRunScope(runtime, {
          runId,
          requireCurrentConsumer: true,
          leaseDeviceId: 'device_2'
        }),
      'consumer_fenced'
    )
  })

  it('never binds a legacy run via lease', () => {
    const { runtime } = h.setup(false)
    expectFenced(
      () =>
        resolveRunScope(runtime, {
          runId: 'run_legacy_local',
          requireCurrentConsumer: true,
          leaseDeviceId: 'device_1'
        }),
      'run_not_found'
    )
  })

  it('requires an explicit runId for a lease caller (no pane fallback exists)', () => {
    const { runtime } = h.setup(false)
    expectFenced(
      () =>
        resolveRunScope(runtime, {
          requireCurrentConsumer: true,
          leaseDeviceId: 'device_1'
        }),
      'run_required'
    )
  })

  it('regression: a terminal caller (no leaseDeviceId) behaves byte-identically to before', () => {
    const { db, runtime } = h.setup(true)
    vi.spyOn(runtime, 'getTerminalPaneKey').mockReturnValue(h.coordinatorPaneKey)
    const bound = db.createRun({
      objective: 'terminal run',
      coordinatorHandle: 'term_coord',
      coordinatorPaneKey: h.coordinatorPaneKey
    })

    const resolved = resolveRunScope(runtime, {
      runId: bound.id,
      callerTerminalHandle: 'term_coord',
      requireCurrentConsumer: true
    })
    expect(resolved.id).toBe(bound.id)

    expectFenced(
      () =>
        resolveRunScope(runtime, {
          callerTerminalHandle: undefined,
          requireCurrentConsumer: true
        }),
      'run_required'
    )

    expectFenced(
      () =>
        resolveRunScope(runtime, {
          runId: 'run_legacy_local',
          callerTerminalHandle: 'term_coord',
          requireCurrentConsumer: true
        }),
      'run_not_found'
    )
  })
})
