import { execFileSync } from 'node:child_process'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import {
  mergeChangedDependencyManifests,
  startParentDependencySetupAfterMerge
} from './merge-winner-dependency-setup'
import { mergeWinnerIntoParent } from './merge-winner'
import { invalidateGitReadCaches } from './status'

const tempRoots: string[] = []

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

async function mergedRepo(winnerFile: string): Promise<{ parentDir: string; commitOid: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'orca-dep-setup-'))
  tempRoots.push(root)
  const repo = path.join(root, 'repo')
  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  git(repo, ['config', 'user.email', 'test@example.com'])
  git(repo, ['config', 'user.name', 'Test User'])
  git(repo, ['config', 'commit.gpgSign', 'false'])
  await writeFile(path.join(repo, 'base.txt'), 'base\n')
  git(repo, ['add', '-A'])
  git(repo, ['commit', '-q', '-m', 'base'])
  const parentDir = path.join(root, 'parent')
  const winnerDir = path.join(root, 'winner')
  git(repo, ['worktree', 'add', '-q', '-b', 'parent-branch', parentDir])
  git(repo, ['worktree', 'add', '-q', '-b', 'winner-branch', winnerDir])
  const target = path.join(winnerDir, winnerFile)
  execFileSync('mkdir', ['-p', path.dirname(target)])
  await writeFile(target, 'x\n')
  git(winnerDir, ['add', '-A'])
  git(winnerDir, ['commit', '-q', '-m', 'winner'])
  const result = await mergeWinnerIntoParent(parentDir, winnerDir, 'merge')
  if (result.outcome !== 'clean') {
    throw new Error('expected clean merge')
  }
  return { parentDir, commitOid: result.commitOid }
}

afterEach(async () => {
  invalidateGitReadCaches()
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('mergeChangedDependencyManifests', () => {
  it.each(['package.json', 'pnpm-lock.yaml', 'frontend/package.json', 'yarn.lock'])(
    'is true when the merge brings %s',
    async (file) => {
      const { parentDir, commitOid } = await mergedRepo(file)
      await expect(mergeChangedDependencyManifests(parentDir, commitOid)).resolves.toBe(true)
    }
  )

  it('is false when the merge only touches source files', async () => {
    const { parentDir, commitOid } = await mergedRepo('src/app.ts')
    await expect(mergeChangedDependencyManifests(parentDir, commitOid)).resolves.toBe(false)
  })
})

describe('startParentDependencySetupAfterMerge', () => {
  const repoWithSetup = (overrides: Partial<Repo> = {}): Repo =>
    ({
      id: 'r1',
      path: '/nonexistent',
      hookSettings: { mode: 'auto', scripts: { setup: 'pnpm install', archive: '' } },
      ...overrides
    }) as unknown as Repo

  it('runs the setup hook in the parent when dependency files changed after a synced merge', async () => {
    const { parentDir, commitOid } = await mergedRepo('package.json')
    const runSetup = vi.fn(async () => ({ success: true, output: '' }))
    const result = await startParentDependencySetupAfterMerge({
      repo: repoWithSetup(),
      parentPath: parentDir,
      commitOid,
      workingTree: { status: 'synced' },
      runSetup
    })
    expect(result).toEqual({ status: 'started' })
    expect(runSetup).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), parentDir, {})
  })

  it('passes the project runtime options to the runner', async () => {
    const { parentDir, commitOid } = await mergedRepo('package.json')
    const runSetup = vi.fn(async () => ({ success: true, output: '' }))
    await startParentDependencySetupAfterMerge({
      repo: repoWithSetup(),
      parentPath: parentDir,
      commitOid,
      workingTree: { status: 'synced' },
      options: { wslDistro: 'Ubuntu' },
      runSetup
    })
    expect(runSetup).toHaveBeenCalledWith(expect.anything(), parentDir, { wslDistro: 'Ubuntu' })
  })

  it('returns before a slow hook finishes', async () => {
    const { parentDir, commitOid } = await mergedRepo('package.json')
    const runSetup = vi.fn(() => new Promise<{ success: boolean; output: string }>(() => {}))
    await expect(
      startParentDependencySetupAfterMerge({
        repo: repoWithSetup(),
        parentPath: parentDir,
        commitOid,
        workingTree: { status: 'synced' },
        runSetup
      })
    ).resolves.toEqual({ status: 'started' })
  })

  it('logs a failing hook without throwing', async () => {
    const { parentDir, commitOid } = await mergedRepo('pnpm-lock.yaml')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startParentDependencySetupAfterMerge({
      repo: repoWithSetup(),
      parentPath: parentDir,
      commitOid,
      workingTree: { status: 'synced' },
      runSetup: async () => ({ success: false, output: 'ERR_PNPM' })
    })
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
    expect(result).toEqual({ status: 'started' })
    errorSpy.mockRestore()
  })

  it('does not run an orca.yaml setup introduced by the winner', async () => {
    const { parentDir, commitOid } = await mergedRepo('package.json')
    await writeFile(path.join(parentDir, 'orca.yaml'), 'scripts:\n  setup: touch pwned\n')
    const repo = repoWithSetup({
      path: parentDir,
      hookSettings: {
        mode: 'auto',
        commandSourcePolicy: 'run-both',
        scripts: { setup: 'true', archive: '' }
      }
    })
    const result = await startParentDependencySetupAfterMerge({
      repo,
      parentPath: parentDir,
      commitOid,
      workingTree: { status: 'synced' }
    })
    expect(result).toEqual({ status: 'started' })
    await new Promise((resolve) => setTimeout(resolve, 500))
    await expect(access(path.join(parentDir, 'pwned'))).rejects.toThrow()
  })

  it('does nothing when the setup command only exists in orca.yaml', async () => {
    const { parentDir, commitOid } = await mergedRepo('package.json')
    await writeFile(path.join(parentDir, 'orca.yaml'), 'scripts:\n  setup: touch pwned\n')
    const runSetup = vi.fn(async () => ({ success: true, output: '' }))
    await expect(
      startParentDependencySetupAfterMerge({
        repo: repoWithSetup({
          hookSettings: { mode: 'auto', scripts: { setup: '', archive: '' } }
        }),
        parentPath: parentDir,
        commitOid,
        workingTree: { status: 'synced' },
        runSetup
      })
    ).resolves.toBeUndefined()
    expect(runSetup).not.toHaveBeenCalled()
  })

  it('does nothing when only source files changed', async () => {
    const { parentDir, commitOid } = await mergedRepo('src/app.ts')
    const runSetup = vi.fn(async () => ({ success: true, output: '' }))
    await expect(
      startParentDependencySetupAfterMerge({
        repo: repoWithSetup(),
        parentPath: parentDir,
        commitOid,
        workingTree: { status: 'synced' },
        runSetup
      })
    ).resolves.toBeUndefined()
    expect(runSetup).not.toHaveBeenCalled()
  })

  it.each([
    ['skipped', { status: 'skipped', reason: 'dirty' } as const],
    ['failed', { status: 'failed', message: 'x' } as const],
    ['absent', undefined]
  ])('does nothing when the working-tree sync is %s', async (_label, workingTree) => {
    const { parentDir, commitOid } = await mergedRepo('package.json')
    const runSetup = vi.fn(async () => ({ success: true, output: '' }))
    await expect(
      startParentDependencySetupAfterMerge({
        repo: repoWithSetup(),
        parentPath: parentDir,
        commitOid,
        workingTree,
        runSetup
      })
    ).resolves.toBeUndefined()
    expect(runSetup).not.toHaveBeenCalled()
  })

  it('does nothing without a setup command or when the repo is not run-by-default', async () => {
    const { parentDir, commitOid } = await mergedRepo('package.json')
    const runSetup = vi.fn(async () => ({ success: true, output: '' }))
    const base = {
      parentPath: parentDir,
      commitOid,
      workingTree: { status: 'synced' } as const,
      runSetup
    }
    await expect(
      startParentDependencySetupAfterMerge({
        ...base,
        repo: repoWithSetup({ hookSettings: { mode: 'auto', scripts: { setup: '', archive: '' } } })
      })
    ).resolves.toBeUndefined()
    await expect(
      startParentDependencySetupAfterMerge({
        ...base,
        repo: repoWithSetup({
          hookSettings: {
            mode: 'auto',
            setupRunPolicy: 'skip-by-default',
            scripts: { setup: 'pnpm install', archive: '' }
          }
        })
      })
    ).resolves.toBeUndefined()
    await expect(
      startParentDependencySetupAfterMerge({ ...base, repo: undefined })
    ).resolves.toBeUndefined()
    expect(runSetup).not.toHaveBeenCalled()
  })
})
