const PAIRING_FRAGMENT_PREFIX = '#pairing='

/** Pure decode of the `#pairing=<encoded>` fragment, matching `createWebClientUrl` (runtime-rpc.ts:183-190). */
export function readPairingFragment(hash: string): string | null {
  if (!hash.startsWith(PAIRING_FRAGMENT_PREFIX)) {
    return null
  }
  const encoded = hash.slice(PAIRING_FRAGMENT_PREFIX.length)
  if (encoded.length === 0) {
    return null
  }
  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

// Declared exclusion (CO-402): browser-global adapter, untestable without jsdom.
// All decision logic lives in readPairingFragment above.
export function consumePairingFragment(win: Window = window): string | null {
  const fragment = readPairingFragment(win.location.hash)
  win.history.replaceState(null, '', win.location.pathname + win.location.search)
  return fragment
}
