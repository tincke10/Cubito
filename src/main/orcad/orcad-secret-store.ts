import { readFileSync } from 'node:fs'
import type { SecretStore } from '../../shared/secret-store'
import { createAesGcmSecretStore } from './orcad-aes-gcm-secret-store'
import { loadOrCreateKeychainMasterKey, type KeychainRunner } from './orcad-keychain-master-key'
import { OrcadSecretKeyError, parseOrcadSecretKey } from './orcad-secret-key'

export type OrcadSecretKeySource = 'env' | 'env-file' | 'keychain' | 'none'

export type OrcadSecretStoreResolution = { store: SecretStore; source: OrcadSecretKeySource }

export type OrcadSecretStoreDeps = {
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  run?: KeychainRunner
  readFile?: (path: string) => string
}

const UNAVAILABLE_GUIDANCE =
  'Set CUBITO_SECRET_KEY (or CUBITO_SECRET_KEY_FILE) to a 32-byte key, for example `openssl rand -base64 32`, to seal credentials at rest.'

function createUnavailableSecretStore(gap: string): SecretStore {
  return {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error('orcad_secret_sealing_unavailable')
    },
    decryptString: () => {
      throw new Error('orcad_secret_sealing_unavailable')
    },
    describeProtectionGap: () => gap
  }
}

const defaultReadFile = (path: string): string => readFileSync(path, 'utf8')

/**
 * Layered key source: operator key (env / file) > macOS Keychain master key > unsealed.
 * A key the operator configured but that cannot be used throws: silently falling back to
 * plaintext would be a security downgrade they did not ask for.
 */
export function resolveOrcadSecretStore(deps: OrcadSecretStoreDeps): OrcadSecretStoreResolution {
  const inlineKey = deps.env.CUBITO_SECRET_KEY?.trim()
  if (inlineKey) {
    return { store: createAesGcmSecretStore(parseOrcadSecretKey(inlineKey)), source: 'env' }
  }
  const keyFile = deps.env.CUBITO_SECRET_KEY_FILE?.trim()
  if (keyFile) {
    let raw: string
    try {
      raw = (deps.readFile ?? defaultReadFile)(keyFile)
    } catch {
      throw new OrcadSecretKeyError(`CUBITO_SECRET_KEY_FILE (${keyFile}) could not be read.`)
    }
    return { store: createAesGcmSecretStore(parseOrcadSecretKey(raw)), source: 'env-file' }
  }
  if (deps.platform === 'darwin') {
    const keychain = loadOrCreateKeychainMasterKey(deps.run)
    if (keychain.ok) {
      return { store: createAesGcmSecretStore(keychain.key), source: 'keychain' }
    }
    return {
      store: createUnavailableSecretStore(
        `Credentials are stored unencrypted because the macOS Keychain could not provide a master key: ${keychain.reason}. ${UNAVAILABLE_GUIDANCE}`
      ),
      source: 'none'
    }
  }
  return {
    store: createUnavailableSecretStore(
      `This host has no key to seal credentials with, so they are stored unencrypted. ${UNAVAILABLE_GUIDANCE}`
    ),
    source: 'none'
  }
}

export type LazyOrcadSecretStore = SecretStore & { resolution(): OrcadSecretStoreResolution }

/**
 * Defers key resolution to first use so installing host adapters never touches the Keychain;
 * startup forces it explicitly, where a bad configured key can fail the launch.
 */
export function createLazyOrcadSecretStore(deps: OrcadSecretStoreDeps): LazyOrcadSecretStore {
  let resolved: OrcadSecretStoreResolution | null = null
  const resolution = (): OrcadSecretStoreResolution => (resolved ??= resolveOrcadSecretStore(deps))
  return {
    resolution,
    isEncryptionAvailable: () => resolution().store.isEncryptionAvailable(),
    encryptString: (plainText) => resolution().store.encryptString(plainText),
    decryptString: (sealed) => resolution().store.decryptString(sealed),
    describeProtectionGap: () => resolution().store.describeProtectionGap()
  }
}
