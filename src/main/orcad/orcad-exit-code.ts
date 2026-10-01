import { OrcadBindAddressError } from './orcad-bind-address'
import { OrcadBundledRuntimeError } from './orcad-bundled-runtime'
import { OrcadInstanceLockError } from './orcad-instance-lock'
import { OrcadSecretKeyError } from './orcad-secret-key'
import { ProfileStateAccessError } from '../persistence/profile-state/profile-state-access'

export const ORCAD_EXIT_OK = 0
export const ORCAD_EXIT_FAILED = 1
export const ORCAD_EXIT_CONFIGURATION = 78

/** Configuration faults cannot be repaired by a supervisor restart. */
export function resolveOrcadExitCode(error: unknown): number {
  return error instanceof OrcadInstanceLockError ||
    error instanceof OrcadBindAddressError ||
    error instanceof OrcadBundledRuntimeError ||
    error instanceof OrcadSecretKeyError ||
    error instanceof ProfileStateAccessError
    ? ORCAD_EXIT_CONFIGURATION
    : ORCAD_EXIT_FAILED
}
