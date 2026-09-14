/**
 * The two things a supervisor reads off a launch: what the arguments mean, and what an exit
 * code means. Both are part of the ops contract in docs/reference/orcad-operations.md.
 */
import { describe, expect, it } from 'vitest'
import {
  ORCAD_EXIT_CONFIGURATION,
  ORCAD_EXIT_FAILED,
  parseArgs,
  resolveOrcadExitCode
} from './orcad-entry'
import { OrcadBindAddressError } from './orcad-bind-address'
import { OrcadInstanceLockError } from './orcad-instance-lock'

describe('parseArgs', () => {
  it('accepts --bind and leaves it unset when absent', () => {
    expect(parseArgs(['--bind', '0.0.0.0'])).toEqual({ bind: '0.0.0.0' })
    expect(parseArgs([])).toEqual({})
    expect(parseArgs(['--port', '6768', '--bind', '10.0.0.5', '--json'])).toEqual({
      port: 6768,
      bind: '10.0.0.5',
      json: true
    })
  })

  it('rejects --bind with no value rather than silently binding the default', () => {
    expect(() => parseArgs(['--bind'])).toThrow('--bind expects a value')
    expect(() => parseArgs(['--bind', '--json'])).not.toThrow()
  })

  it('accepts --web-client-root alone and combined with other flags', () => {
    expect(parseArgs(['--web-client-root', '/app/out/orcad/web-client'])).toEqual({
      webClientRoot: '/app/out/orcad/web-client'
    })
    expect(
      parseArgs(['--port', '6799', '--web-client-root', '/dir', '--json', '--bind', '0.0.0.0'])
    ).toEqual({
      port: 6799,
      webClientRoot: '/dir',
      json: true,
      bind: '0.0.0.0'
    })
  })

  it('rejects --web-client-root with no value', () => {
    expect(() => parseArgs(['--web-client-root'])).toThrow('--web-client-root expects a value')
  })
})

describe('resolveOrcadExitCode', () => {
  it('separates a configuration fault from a generic failure', () => {
    // A supervisor must be able to stop restarting on faults that restarting cannot fix:
    // a data root owned by someone else, held by another instance, or a bad bind address.
    expect(
      resolveOrcadExitCode(new OrcadInstanceLockError('orcad_instance_lock_held', 'held'))
    ).toBe(ORCAD_EXIT_CONFIGURATION)
    expect(resolveOrcadExitCode(new OrcadBindAddressError('bad'))).toBe(ORCAD_EXIT_CONFIGURATION)
    expect(resolveOrcadExitCode(new Error('port in use'))).toBe(ORCAD_EXIT_FAILED)
    expect(ORCAD_EXIT_CONFIGURATION).not.toBe(ORCAD_EXIT_FAILED)
  })
})
