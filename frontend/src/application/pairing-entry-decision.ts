/**
 * Pure `#pairing` fragment -> connect-vs-demo decision (extracted so `main.ts`'s composition
 * stays a thin, untested declared-exclusion — see D6). CO-403's `prompt()` fallback is dropped
 * per the design-vs-spec conflict resolution pinned in tasks: no fragment or a rejected offer
 * both fall straight through to demo mode, never a manual pairing-code prompt.
 */
import { parsePairingCode, type PairingOffer } from '../infrastructure/rpc/pairing-offer'
import { pairingRejectionReason } from './connection-reason'

export type PairingEntryDecision = { kind: 'connect'; offer: PairingOffer } | { kind: 'demo'; reason: string }

export function decidePairingEntry(fragment: string | null): PairingEntryDecision {
  if (fragment === null) {
    return { kind: 'demo', reason: 'modo demo' }
  }
  const parsed = parsePairingCode(fragment)
  if (!parsed.ok) {
    return { kind: 'demo', reason: pairingRejectionReason(parsed.reason) }
  }
  return { kind: 'connect', offer: parsed.offer }
}
