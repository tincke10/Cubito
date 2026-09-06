import { describe, expect, it } from 'vitest'
import { resolveDispatchCreator } from './orchestration-dispatch-creator'
import type { OrcaRuntimeService } from '../../orca-runtime'

/**
 * Wave 1 (fan-out v2 Change A): a lease caller (paired GUI device, no terminal
 * handle) resolves to a depth-0 root creator, same as the system branch.
 * Terminal and system branches must stay byte-identical.
 */
describe('resolveDispatchCreator', () => {
  const runtime = {
    getOrchestrationDispatchAuthority: () => undefined,
    getTerminalPaneKey: () => null
  } as unknown as OrcaRuntimeService

  it('resolves a lease caller (deviceId, no terminal handle) to a lease creator', () => {
    expect(resolveDispatchCreator(runtime, undefined, 'device_1')).toEqual({
      kind: 'lease',
      deviceId: 'device_1'
    })
  })

  it('prefers the terminal branch when a handle is present, even with a deviceId', () => {
    expect(resolveDispatchCreator(runtime, 'term_1', 'device_1')).toEqual({
      kind: 'terminal',
      handle: 'term_1',
      paneKey: undefined,
      processIncarnation: undefined
    })
  })

  it('falls back to system when neither a handle nor a deviceId is present', () => {
    expect(resolveDispatchCreator(runtime, undefined)).toEqual({ kind: 'system' })
  })
})
