import { randomBytes } from 'node:crypto'
import {
  runProcessSync,
  type ProcessResult,
  type ProcessSpec
} from '../../shared/child-process/run-process'
import {
  ORCAD_SECRET_KEY_BYTES,
  OrcadSecretKeyError,
  parseOrcadSecretKey
} from './orcad-secret-key'

const SECURITY_CLI = '/usr/bin/security'
const SERVICE = 'cubito-orcad'
const ACCOUNT = 'master-key'
const KEYCHAIN_TIMEOUT_MS = 5000
const EXIT_ITEM_NOT_FOUND = 44

export type KeychainRunner = (
  spec: ProcessSpec
) => Pick<ProcessResult, 'code' | 'stdout' | 'stderr'>

export type KeychainMasterKeyResult = { ok: true; key: Buffer } | { ok: false; reason: string }

const defaultRunner: KeychainRunner = (spec) => runProcessSync(spec)

function readKey(run: KeychainRunner): KeychainMasterKeyResult | 'missing' {
  // Why -w on find: prints only the secret to stdout, so reading it never exposes it on argv.
  const result = run({
    program: SECURITY_CLI,
    args: ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'],
    timeoutMs: KEYCHAIN_TIMEOUT_MS
  })
  if (result.code === EXIT_ITEM_NOT_FOUND) {
    return 'missing'
  }
  if (result.code !== 0) {
    return { ok: false, reason: `the Keychain refused access (security exit ${result.code})` }
  }
  try {
    return { ok: true, key: parseOrcadSecretKey(result.stdout) }
  } catch (error) {
    if (error instanceof OrcadSecretKeyError) {
      return { ok: false, reason: 'the stored master key is not a valid 32-byte key' }
    }
    throw error
  }
}

/**
 * macOS-only master key held in the login Keychain via the `security` CLI.
 *
 * Unavoidable: `add-generic-password` takes the secret as an argv value (`-w` without a value
 * prompts on a TTY, never stdin), so the new key is visible to same-uid processes for the few
 * milliseconds of that one call, only on first creation.
 */
export function loadOrCreateKeychainMasterKey(
  run: KeychainRunner = defaultRunner
): KeychainMasterKeyResult {
  const existing = readKey(run)
  if (existing !== 'missing') {
    return existing
  }
  const generated = randomBytes(ORCAD_SECRET_KEY_BYTES)
  const added = run({
    program: SECURITY_CLI,
    args: [
      'add-generic-password',
      '-s',
      SERVICE,
      '-a',
      ACCOUNT,
      '-w',
      generated.toString('base64')
    ],
    timeoutMs: KEYCHAIN_TIMEOUT_MS
  })
  if (added.code === 0) {
    return { ok: true, key: generated }
  }
  // Why re-read: a concurrent orcad may have created the item between our find and add.
  const raced = readKey(run)
  if (raced !== 'missing') {
    return raced
  }
  return {
    ok: false,
    reason: `the Keychain refused to store a new key (security exit ${added.code})`
  }
}
