import { describe, expect, it } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'

// Why: the system-graph runtime adapter (Change B, Wave 3) needs a store-backed
// connectionId lookup keyed by repoId alone — this is that one seam, pinned in isolation.
describe('OrcaRuntimeService.getRepoConnectionId', () => {
  it('returns the connectionId of an SSH-backed repo', () => {
    const runtime = new OrcaRuntimeService({
      getRepo: (id: string) => (id === 'repo-ssh' ? { connectionId: 'ssh-conn-1' } : undefined)
    } as never)

    expect(runtime.getRepoConnectionId('repo-ssh')).toBe('ssh-conn-1')
  })

  it('returns null for a local repo and for an unknown repoId', () => {
    const runtime = new OrcaRuntimeService({
      getRepo: (id: string) => (id === 'repo-local' ? { connectionId: null } : undefined)
    } as never)

    expect(runtime.getRepoConnectionId('repo-local')).toBeNull()
    expect(runtime.getRepoConnectionId('missing')).toBeNull()
  })

  it('returns null when no store is attached', () => {
    const runtime = new OrcaRuntimeService(null)

    expect(runtime.getRepoConnectionId('anything')).toBeNull()
  })
})
