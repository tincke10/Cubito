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
  const frames =
    (hooks: unknown, repo: unknown): RpcCaller =>
    async (method: string) =>
      okFrame(method === 'repo.hooks' ? hooks : { repo })

  it('reads the effective setup command from repo.hooks and repo.show', async () => {
    const call = vi.fn(frames({ hooks: { scripts: { setup: 'pnpm install' } } }, {}))
    const gateway = createRepoSetupMethods({ call })
    await expect(gateway.repoSetupCommand('id:r1')).resolves.toBe('pnpm install')
    expect(call).toHaveBeenCalledWith('repo.hooks', { repo: 'id:r1' })
  })

  it('returns null when hooks are absent or the setup is blank', async () => {
    const gateway = createRepoSetupMethods({
      call: frames({ hooks: null, hasHooksFile: false }, {})
    })
    await expect(gateway.repoSetupCommand('id:r1')).resolves.toBeNull()
    const blank = createRepoSetupMethods({
      call: frames({ hooks: { scripts: { setup: '  ' } } }, {})
    })
    await expect(blank.repoSetupCommand('id:r1')).resolves.toBeNull()
  })

  it('reports orca.yaml as shared and the local override separately', async () => {
    const yamlOnly = createRepoSetupMethods({
      call: frames({ hooks: { scripts: { setup: 'pnpm i' } }, hasHooksFile: true }, {})
    })
    await expect(yamlOnly.repoSetupInfo('id:r1')).resolves.toEqual({
      local: null,
      shared: 'pnpm i',
      known: true
    })
    const localWins = createRepoSetupMethods({
      call: frames(
        { hooks: { scripts: { setup: 'yarn' } }, hasHooksFile: true },
        { hookSettings: { scripts: { setup: 'yarn' } } }
      )
    })
    await expect(localWins.repoSetupInfo('id:r1')).resolves.toEqual({
      local: 'yarn',
      shared: null,
      known: true
    })
  })

  it('treats an SSH repo with no readable setup as unknown, and reads its local setting from repo.show', async () => {
    const remote = { connectionId: 'ssh-1' }
    const down = createRepoSetupMethods({ call: frames({ hooks: null }, remote) })
    await expect(down.repoSetupInfo('id:r1')).resolves.toMatchObject({ known: false })
    await expect(down.repoSetupCommand('id:r1')).rejects.toThrow()
    const local = createRepoSetupMethods({
      call: frames(
        { hooks: null },
        { ...remote, hookSettings: { scripts: { setup: 'pnpm install' } } }
      )
    })
    await expect(local.repoSetupCommand('id:r1')).resolves.toBe('pnpm install')
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
