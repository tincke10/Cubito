import { parsePairingCode } from '../infrastructure/rpc/pairing-offer'

export const PAIRING_STORAGE_KEY = 'cubito.pairing'

export type PairingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** `sessionStorage` can throw (blocked site data) or be absent — the page must work without it. */
export function tryGetSessionStorage(win: Window = window): PairingStorage | null {
  try {
    return win.sessionStorage
  } catch {
    return null
  }
}

function safely<T>(action: () => T): T | null {
  try {
    return action()
  } catch {
    return null
  }
}

export function clearStoredPairing(storage: PairingStorage | null): void {
  if (storage) safely(() => storage.removeItem(PAIRING_STORAGE_KEY))
}

/**
 * The pairing code to connect with: a fresh URL fragment wins (and is persisted when valid, so a
 * reload — which strips the hash — keeps the session); otherwise the stored one, re-validated.
 * sessionStorage, not localStorage: the offer carries a device token and must die with the tab.
 */
export function resolvePairingSource(
  fragment: string | null,
  storage: PairingStorage | null
): string | null {
  if (fragment !== null) {
    if (storage && parsePairingCode(fragment).ok) {
      safely(() => storage.setItem(PAIRING_STORAGE_KEY, fragment))
    }
    return fragment
  }
  if (!storage) return null
  const stored = safely(() => storage.getItem(PAIRING_STORAGE_KEY))
  if (stored === null) return null
  if (!parsePairingCode(stored).ok) {
    clearStoredPairing(storage)
    return null
  }
  return stored
}
