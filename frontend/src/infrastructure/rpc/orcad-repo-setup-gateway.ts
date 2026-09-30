import type { RepoSetupInfo, RuntimeGateway } from '../../application/ports/runtime-gateway'
import type { RpcCaller } from './orcad-gateway'

export type RepoSetupMethods = Pick<
  RuntimeGateway,
  'repoSetupCommand' | 'repoSetupInfo' | 'setRepoSetupCommand'
>

type RawHookSettings = { scripts?: { setup?: unknown; archive?: unknown } } & Record<
  string,
  unknown
>

type RawRepo = { connectionId?: string | null; hookSettings?: RawHookSettings }

const trimmedOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

/** Combines `repo.hooks` (orca.yaml; effective for local repos) with `repo.show` (the local setting). */
async function readSetupInfo(
  connection: { call: RpcCaller },
  repo: string
): Promise<RepoSetupInfo> {
  const [hooksFrame, shownFrame] = await Promise.all([
    connection.call('repo.hooks', { repo }),
    connection.call('repo.show', { repo })
  ])
  const hooks = (hooksFrame.result as { hooks?: { scripts?: { setup?: unknown } } | null })?.hooks
  const stored = (shownFrame.result as { repo?: RawRepo })?.repo
  const local = trimmedOrNull(stored?.hookSettings?.scripts?.setup)
  const fromHooks = trimmedOrNull(hooks?.scripts?.setup)
  const remote = Boolean(stored?.connectionId)
  // Why: for SSH repos `repo.hooks` returns only the remote orca.yaml (null when the fs provider is down), so absence is unknown.
  const shared = remote ? fromHooks : fromHooks !== local ? fromHooks : null
  return { local, shared, known: !remote || fromHooks !== null || local !== null }
}

/**
 * Repo setup-hook gateway methods, composed into orcad-gateway.ts like orcad-agent-activity-gateway.ts.
 * The setup command is the upstream `hookSettings.scripts.setup`, run by worktree.create.
 */
export function createRepoSetupMethods(connection: { call: RpcCaller }): RepoSetupMethods {
  return {
    async repoSetupCommand(repo) {
      const info = await readSetupInfo(connection, repo)
      const command = info.local ?? info.shared
      if (command === null && !info.known) throw new Error('setup command unknown for this repo')
      return command
    },
    repoSetupInfo: (repo) => readSetupInfo(connection, repo),
    async setRepoSetupCommand(repo, command) {
      // Why: hookSettings is replaced wholesale by repo.update, so merge onto the stored one to keep archive/policies.
      const shown = await connection.call('repo.show', { repo })
      const stored = (shown.result as { repo?: { hookSettings?: RawHookSettings } })?.repo
        ?.hookSettings
      const archive = typeof stored?.scripts?.archive === 'string' ? stored.scripts.archive : ''
      await connection.call('repo.update', {
        repo,
        updates: {
          hookSettings: {
            mode: 'auto',
            ...stored,
            scripts: { archive, setup: command.trim() }
          }
        }
      })
    }
  }
}
