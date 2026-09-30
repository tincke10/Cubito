export const NO_SETUP_HINT = 'sin setup: el worktree nace sin dependencias (configuralo en ⌘P)'

export type SetupHintTracker = {
  /** The hint text once `repoSelector` probed as setup-less; null while unknown or configured. */
  hint(repoSelector: string | null): string | null
  ensure(repoSelector: string | null): void
  /** Drops every verdict — call when the form closes so a fresh open re-probes. */
  reset(): void
}

/** Caches one "has this repo a setup command?" probe per selector; failures stay silent (no hint). */
export function createSetupHintTracker(deps: {
  probe: (repoSelector: string) => Promise<string | null>
  onChange: () => void
}): SetupHintTracker {
  const missing = new Map<string, boolean>()
  const inflight = new Set<string>()
  let epoch = 0
  return {
    hint(repoSelector) {
      return repoSelector !== null && missing.get(repoSelector) === true ? NO_SETUP_HINT : null
    },
    ensure(repoSelector) {
      if (repoSelector === null || missing.has(repoSelector) || inflight.has(repoSelector)) return
      const startEpoch = epoch
      inflight.add(repoSelector)
      deps
        .probe(repoSelector)
        .then((command) => {
          if (startEpoch !== epoch) return
          missing.set(repoSelector, command === null)
          deps.onChange()
        })
        .catch(() => undefined)
        .finally(() => inflight.delete(repoSelector))
    },
    reset() {
      epoch++
      missing.clear()
      inflight.clear()
    }
  }
}
