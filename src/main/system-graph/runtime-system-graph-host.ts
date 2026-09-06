import type { FsChangeEvent } from '../../shared/filesystem-entry-types'
import { splitWorktreeIdForFilesystem } from '../../shared/worktree/id'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import {
  getSystemGraphService,
  type SystemGraphHost,
  type SystemGraphService
} from './system-graph-service'

/** Narrow slice of OrcaRuntimeService the adapter needs — keeps this module
 * fake-testable without booting a real runtime. */
export type RuntimeSystemGraphDeps = {
  getRepoConnectionId(repoId: string): string | null
  watchFileExplorer(
    worktreeId: string,
    onEvents: (events: FsChangeEvent[]) => void,
    onTerminalError: (error: Error) => void
  ): Promise<() => Promise<void>>
}

/** Adapts the runtime's worktree/watch primitives to the engine's SystemGraphHost seam.
 * SSH reconnect comes for free by reusing watchFileExplorer: its own rearm re-installs
 * on provider re-registration and emits overflow, which the service's watch-scheduler
 * turns into a rebuild — no separate reconnect wiring needed here. */
export function createRuntimeSystemGraphHost(deps: RuntimeSystemGraphDeps): SystemGraphHost {
  const armedWorktreeIds = new Set<string>()
  return {
    resolveWorktree(worktreeId) {
      const parsed = splitWorktreeIdForFilesystem(worktreeId)
      if (!parsed) {
        return null
      }
      return {
        rootPath: parsed.worktreePath,
        connectionId: deps.getRepoConnectionId(parsed.repoId)
      }
    },
    getFilesystemProvider(connectionId) {
      return getSshFilesystemProvider(connectionId)
    },
    async watchWorktreeFiles(worktreeId, onEvents, onTerminalError) {
      const release = await deps.watchFileExplorer(worktreeId, onEvents, onTerminalError)
      armedWorktreeIds.add(worktreeId)
      return async () => {
        armedWorktreeIds.delete(worktreeId)
        await release()
      }
    },
    listLiveWorktreeIds() {
      return armedWorktreeIds
    }
  }
}

const hosts = new WeakMap<OrcaRuntimeService, SystemGraphHost>()

/** Memoized per runtime — required because getSystemGraphService keys its own
 * WeakMap on this object; a fresh host per call would silently fork the service. */
export function getRuntimeSystemGraphHost(runtime: OrcaRuntimeService): SystemGraphHost {
  let host = hosts.get(runtime)
  if (!host) {
    host = createRuntimeSystemGraphHost({
      getRepoConnectionId: (repoId) => runtime.getRepoConnectionId(repoId),
      watchFileExplorer: (worktreeId, onEvents, onTerminalError) =>
        runtime.watchFileExplorer(worktreeId, onEvents, onTerminalError)
    })
    hosts.set(runtime, host)
  }
  return host
}

export function getRuntimeSystemGraphService(runtime: OrcaRuntimeService): SystemGraphService {
  return getSystemGraphService(getRuntimeSystemGraphHost(runtime))
}
