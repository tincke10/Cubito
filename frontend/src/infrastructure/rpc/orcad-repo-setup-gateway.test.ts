import { describe, expect, it, vi } from 'vitest'
import { createRepoSetupMethods } from './orcad-repo-setup-gateway'
import type { RpcCaller } from './orcad-gateway'

const okFrame = (result: unknown) => ({
  id: 'x',
  ok: true as const,
  result,
  _meta: { runtimeId: 'rt' }
})

describe('createRepoSetupMethods', () => {
  it('reads the effective setup command from repo.hooks', async () => {
    const call: RpcCaller = vi.fn(async () =>
      okFrame({ hooks: { scripts: { setup: 'pnpm install' } } })
    )
    const gateway = createRepoSetupMethods({ call })
    await expect(gateway.repoSetupCommand('id:r1')).resolves.toBe('pnpm install')
    expect(call).toHaveBeenCalledWith('repo.hooks', { repo: 'id:r1' })
  })

  it('returns null when hooks are absent or the setup is blank', async () => {
    const gateway = createRepoSetupMethods({
      call: async () => okFrame({ hooks: null, hasHooksFile: false })
    })
    await expect(gateway.repoSetupCommand('id:r1')).resolves.toBeNull()
    const blank = createRepoSetupMethods({
      call: async () => okFrame({ hooks: { scripts: { setup: '  ' } } })
    })
    await expect(blank.repoSetupCommand('id:r1')).resolves.toBeNull()
  })

  it('writes hookSettings.scripts.setup via repo.update, keeping the stored archive script and policies', async () => {
    const call: RpcCaller = vi.fn(async (method: string) =>
      method === 'repo.show'
        ? okFrame({
            repo: {
              hookSettings: {
                mode: 'auto',
                setupRunPolicy: 'ask',
                scripts: { setup: 'old', archive: 'rm -rf x' }
              }
            }
          })
        : okFrame({ repo: {} })
    )
    const gateway = createRepoSetupMethods({ call })
    await gateway.setRepoSetupCommand('id:r1', ' pnpm install ')
    expect(call).toHaveBeenLastCalledWith('repo.update', {
      repo: 'id:r1',
      updates: {
        hookSettings: {
          mode: 'auto',
          setupRunPolicy: 'ask',
          scripts: { setup: 'pnpm install', archive: 'rm -rf x' }
        }
      }
    })
  })

  it('builds fresh hookSettings when the repo has none', async () => {
    const call: RpcCaller = vi.fn(async () => okFrame({ repo: {} }))
    const gateway = createRepoSetupMethods({ call })
    await gateway.setRepoSetupCommand('id:r1', 'yarn')
    expect(call).toHaveBeenLastCalledWith('repo.update', {
      repo: 'id:r1',
      updates: { hookSettings: { mode: 'auto', scripts: { setup: 'yarn', archive: '' } } }
    })
  })
})
