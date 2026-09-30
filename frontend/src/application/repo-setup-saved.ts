/** Fired after any repo setup command is persisted, so cached "sin setup" verdicts can be re-probed. */
export type RepoSetupSavedSignal = {
  subscribe(listener: () => void): () => void
  emit(): void
}

export function createRepoSetupSavedSignal(): RepoSetupSavedSignal {
  const listeners = new Set<() => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit() {
      for (const listener of [...listeners]) listener()
    }
  }
}

// Why: the ⌘P selector and the spawn/fan-out forms are built independently but must agree on setup state.
export const repoSetupSaved = createRepoSetupSavedSignal()
