import type { FsChangeEvent } from '../../shared/filesystem-entry-types'
import type { IFilesystemProvider } from '../providers/types'
import { detectFramework } from './framework-detector'
import { frameworkRouteParsers } from './framework-route-parser-registry'
import type { ParsedRouteFile } from './framework-route-model'
import { assembleSystemGraph } from './service-db-heuristic'
import { emptyEngineSystemGraph, type EngineSystemGraph } from './system-graph-model'
import { createSystemGraphWatchScheduler } from './system-graph-watch-scheduler'
import { crawlSourceFiles } from './worktree-source-crawl'
import { createNodeWorktreeSourceReader } from './worktree-source-reader-node'
import type { WorktreeSourceReader } from './worktree-source-reader'
import { createSshWorktreeSourceReader } from './worktree-source-reader-ssh'

type WatchEntry = {
  release: () => Promise<void>
  scheduler: ReturnType<typeof createSystemGraphWatchScheduler>
}

/** Everything the service needs from the runtime, decoupled from the orca-runtime god-class
 * so this stays unit-testable behind a fake — real wiring is Wave 5 / Change B. */
export type SystemGraphHost = {
  resolveWorktree(worktreeId: string): { rootPath: string; connectionId: string | null } | null
  getFilesystemProvider(connectionId: string): IFilesystemProvider | undefined
  watchWorktreeFiles(
    worktreeId: string,
    onEvents: (events: FsChangeEvent[]) => void,
    onTerminalError: (error: Error) => void
  ): Promise<() => Promise<void>>
  listLiveWorktreeIds(): Set<string>
}

function extractDependencyNames(packageJson: unknown): string[] {
  if (!packageJson || typeof packageJson !== 'object') {
    return []
  }
  const { dependencies, devDependencies } = packageJson as {
    dependencies?: unknown
    devDependencies?: unknown
  }
  const names = new Set<string>()
  for (const deps of [dependencies, devDependencies]) {
    if (deps && typeof deps === 'object') {
      for (const name of Object.keys(deps)) {
        names.add(name)
      }
    }
  }
  return [...names]
}

/** Per-worktree Express/TS route graph, rebuilt on demand from local or SSH source. */
export class SystemGraphService {
  private readonly graphs = new Map<string, EngineSystemGraph>()
  private readonly watches = new Map<string, WatchEntry>()
  private readonly listeners = new Map<string, Set<() => void>>()

  constructor(private readonly host: SystemGraphHost) {}

  private readerFor(rootPath: string, connectionId: string | null): WorktreeSourceReader | null {
    if (!connectionId) {
      return createNodeWorktreeSourceReader(rootPath)
    }
    const provider = this.host.getFilesystemProvider(connectionId)
    return provider ? createSshWorktreeSourceReader(provider, rootPath) : null
  }

  async buildGraph(worktreeId: string): Promise<void> {
    try {
      const resolved = this.host.resolveWorktree(worktreeId)
      if (!resolved) {
        return
      }
      const reader = this.readerFor(resolved.rootPath, resolved.connectionId)
      if (!reader) {
        return
      }

      const framework = await detectFramework(reader)
      if (!framework) {
        this.graphs.set(worktreeId, emptyEngineSystemGraph())
        this.notify(worktreeId)
        return
      }

      const filePaths = await crawlSourceFiles(reader)
      const routeFiles: ParsedRouteFile[] = []
      for (const filePath of filePaths) {
        try {
          const source = await reader.readFileText(filePath)
          if (source === null) {
            continue
          }
          routeFiles.push(frameworkRouteParsers[framework].parse(source, filePath))
        } catch {
          // Why: one unreadable/unparsable file must not abort the whole rebuild.
        }
      }

      const packageDependencies = extractDependencyNames(await reader.readPackageJson())
      this.graphs.set(worktreeId, assembleSystemGraph({ routeFiles, packageDependencies }))
      this.notify(worktreeId)
    } catch {
      // Why (pinned): a catastrophic rebuild failure keeps the last-good graph in place —
      // Wave 5's watcher retries on the next file event, so a transient blip self-heals.
    }
  }

  getGraph(worktreeId: string): EngineSystemGraph | undefined {
    return this.graphs.get(worktreeId)
  }

  /** Fires after each successful rebuild of this worktree's graph. Independent of the
   * watch lifecycle: dispose()/reconcile() do not drop subscribers. */
  subscribe(worktreeId: string, listener: () => void): () => void {
    let set = this.listeners.get(worktreeId)
    if (!set) {
      set = new Set()
      this.listeners.set(worktreeId, set)
    }
    set.add(listener)
    return () => set!.delete(listener)
  }

  private notify(worktreeId: string): void {
    for (const listener of this.listeners.get(worktreeId) ?? []) {
      listener()
    }
  }

  /** Starts watching the worktree's files and rebuilds the graph on debounced changes.
   * Replaces any prior watch for the same id (avoids leaking a stale handle). */
  async watch(worktreeId: string): Promise<void> {
    const resolved = this.host.resolveWorktree(worktreeId)
    if (!resolved) {
      return
    }
    await this.dispose(worktreeId)

    const scheduler = createSystemGraphWatchScheduler(() => {
      void this.buildGraph(worktreeId)
    })
    const release = await this.host.watchWorktreeFiles(
      worktreeId,
      (events: FsChangeEvent[]) => scheduler.push(events),
      () => {
        // Why (D9): a terminal watcher error means the underlying watch is dead —
        // drop it rather than keep a scheduler that will never receive events again.
        void this.dispose(worktreeId)
      }
    )
    this.watches.set(worktreeId, { release, scheduler })
  }

  /** Arms the watch + does the initial build, but only the first time — a repeat call would
   * otherwise re-`watch()` (dispose + re-arm), dropping the live debounce for no reason. */
  async ensureWatched(worktreeId: string): Promise<void> {
    if (this.watches.has(worktreeId)) {
      return
    }
    await this.watch(worktreeId)
    await this.buildGraph(worktreeId)
  }

  /** Releases the watch (if any) for a worktree and cancels its pending debounce. Idempotent. */
  async dispose(worktreeId: string): Promise<void> {
    const entry = this.watches.get(worktreeId)
    if (!entry) {
      return
    }
    this.watches.delete(worktreeId)
    entry.scheduler.dispose()
    await entry.release()
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.watches.keys()].map((worktreeId) => this.dispose(worktreeId)))
  }

  /** Backup sweep (D9): drops graphs/watches for worktree ids the host no longer reports as
   * live — the safety net for the (missing) explicit worktree-removed hook. */
  async reconcile(): Promise<void> {
    const liveIds = this.host.listLiveWorktreeIds()
    const knownIds = new Set([...this.graphs.keys(), ...this.watches.keys()])
    const staleIds = [...knownIds].filter((id) => !liveIds.has(id))
    await Promise.all(
      staleIds.map(async (id) => {
        this.graphs.delete(id)
        await this.dispose(id)
      })
    )
  }
}

const services = new WeakMap<object, SystemGraphService>()

export function getSystemGraphService(runtime: SystemGraphHost): SystemGraphService {
  let service = services.get(runtime)
  if (!service) {
    service = new SystemGraphService(runtime)
    services.set(runtime, service)
  }
  return service
}
