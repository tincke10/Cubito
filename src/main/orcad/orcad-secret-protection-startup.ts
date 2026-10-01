import { join } from 'node:path'
import { reportSecretProtectionGap } from '../host/secret-protection-report'
import type { LazyOrcadSecretStore, OrcadSecretKeySource } from './orcad-secret-store'

const SOURCE_LABEL: Record<Exclude<OrcadSecretKeySource, 'none'>, string> = {
  env: 'CUBITO_SECRET_KEY',
  'env-file': 'CUBITO_SECRET_KEY_FILE',
  keychain: 'macOS Keychain master key'
}

/**
 * Forces key resolution at startup and tells the operator what protects credentials at rest.
 * Why every start (`force`): unlike a desktop keyring, the fix is one env var the operator controls.
 */
export function reportOrcadSecretProtection(options: {
  store: LazyOrcadSecretStore
  userDataPath: string
  log?: (message: string) => void
}): void {
  const log = options.log ?? ((message: string) => console.error(message))
  const { source } = options.store.resolution()
  reportSecretProtectionGap({
    // Why a sibling name: the report keeps its state file beside this path; only dirname is used.
    dataFile: join(options.userDataPath, 'orcad-secrets'),
    force: true,
    log
  })
  if (source !== 'none') {
    log(`[orcad] credentials are sealed at rest (key source: ${SOURCE_LABEL[source]})`)
  }
}
