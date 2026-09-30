import type { RuntimeGateway } from '../../application/ports/runtime-gateway'
import type { RpcCaller } from './orcad-gateway'

export type RepoSetupMethods = Pick<RuntimeGateway, 'repoSetupCommand' | 'setRepoSetupCommand'>

type RawHookSettings = { scripts?: { setup?: unknown; archive?: unknown } } & Record<
  string,
  unknown
>

/**
 * Repo setup-hook gateway methods, composed into orcad-gateway.ts like orcad-agent-activity-gateway.ts.
 * The setup command is the upstream `hookSettings.scripts.setup`, run by worktree.create.
 */
export function createRepoSetupMethods(connection: { call: RpcCaller }): RepoSetupMethods {
  return {
    async repoSetupCommand(repo) {
      const response = await connection.call('repo.hooks', { repo })
      const result = response.result as { hooks?: { scripts?: { setup?: unknown } } | null }
      const setup = result?.hooks?.scripts?.setup
      return typeof setup === 'string' && setup.trim() !== '' ? setup : null
    },
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
