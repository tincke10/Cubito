import type { FsChangeEvent } from '../../shared/filesystem-entry-types'
import type { IFilesystemProvider } from '../providers/types'
import { detectFramework } from './framework-detector'
import { parseExpressRoutes, type ParsedRouteFile } from './express-route-parser'
import { assembleSystemGraph } from './service-db-heuristic'
import { emptyEngineSystemGraph, type EngineSystemGraph } from './system-graph-model'
import { crawlSourceFiles } from './worktree-source-crawl'
import { createNodeWorktreeSourceReader } from './worktree-source-reader-node'
import type { WorktreeSourceReader } from './worktree-source-reader'
import { createSshWorktreeSourceReader } from './worktree-source-reader-ssh'

/** Everything the service needs from the runtime, decoupled from the orca-runtime god-class
 * so this stays unit-testable behind a fake — real wiring is Wave 5 / Change B. */
export type SystemGraphHost = {
  resolveWorktree(worktreeId: string): { rootPath: string; connectionId: string | null } | null
  getFilesystemProvider(connectionId: string): IFilesystemProvider | undefined
  watchWorktreeFiles(
    rootPath: string,
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
          routeFiles.push(parseExpressRoutes(source, filePath))
        } catch {
          // Why: one unreadable/unparsable file must not abort the whole rebuild.
        }
      }

      const packageDependencies = extractDependencyNames(await reader.readPackageJson())
      this.graphs.set(worktreeId, assembleSystemGraph({ routeFiles, packageDependencies }))
    } catch {
      // Why (pinned): a catastrophic rebuild failure keeps the last-good graph in place —
      // Wave 5's watcher retries on the next file event, so a transient blip self-heals.
    }
  }

  getGraph(worktreeId: string): EngineSystemGraph | undefined {
    return this.graphs.get(worktreeId)
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
