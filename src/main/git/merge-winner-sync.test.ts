import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { syncParentWorkingTree } from './merge-winner-sync'
import { invalidateGitReadCaches } from './status'

const tempRoots: string[] = []

function git(repo: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

/**
 * Builds a parent worktree at parentTip plus a newTreeOid one commit ahead, and
 * moves refs/heads/parent-branch to that new commit WITHOUT touching the
 * worktree's index/files — mirrors mergeWinnerIntoParent's update-ref-then-sync
 * sequence so `git status --porcelain` reflects the real staleness being fixed.
 */
async function createParentWorktreeAheadOfIndex(): Promise<{
  parentDir: string
  parentTip: string
  newTreeOid: string
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'orca-merge-winner-sync-'))
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
  git(repo, ['worktree', 'add', '-q', '-b', 'parent-branch', parentDir])
  const parentTip = git(parentDir, ['rev-parse', 'HEAD'])

  await writeFile(path.join(parentDir, 'new-file.txt'), 'new\n')
  git(parentDir, ['add', '-A'])
  const newTreeOid = git(parentDir, ['write-tree'])
  git(parentDir, ['reset', '--hard', parentTip])

  const newCommitOid = git(parentDir, [
    'commit-tree',
    newTreeOid,
    '-p',
    parentTip,
    '-m',
    'simulated merge commit'
  ])
  git(parentDir, ['update-ref', 'refs/heads/parent-branch', newCommitOid, parentTip])

  return { parentDir, parentTip, newTreeOid }
}

afterEach(async () => {
  invalidateGitReadCaches()
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('syncParentWorkingTree against a real repository', () => {
  it('fast-forwards a clean parent working tree to the new tree', async () => {
    const { parentDir, parentTip, newTreeOid } = await createParentWorktreeAheadOfIndex()

    const result = await syncParentWorkingTree(parentDir, parentTip, newTreeOid)

    expect(result).toEqual({ status: 'synced' })
    expect(git(parentDir, ['status', '--porcelain'])).toBe('')
    await expect(readFile(path.join(parentDir, 'new-file.txt'), 'utf8')).resolves.toBe('new\n')
  })

  it('skips a tracked-dirty parent without mutating it', async () => {
    const { parentDir, parentTip, newTreeOid } = await createParentWorktreeAheadOfIndex()
    await writeFile(path.join(parentDir, 'base.txt'), 'dirty\n')

    const result = await syncParentWorkingTree(parentDir, parentTip, newTreeOid)

    expect(result).toEqual({ status: 'skipped', reason: 'dirty' })
    await expect(readFile(path.join(parentDir, 'base.txt'), 'utf8')).resolves.toBe('dirty\n')
    expect(git(parentDir, ['status', '--porcelain'])).toContain('base.txt')
  })

  it('keeps an untracked file that does not conflict with the new tree', async () => {
    const { parentDir, parentTip, newTreeOid } = await createParentWorktreeAheadOfIndex()
    await writeFile(path.join(parentDir, 'untracked.txt'), 'scratch\n')

    const result = await syncParentWorkingTree(parentDir, parentTip, newTreeOid)

    expect(result).toEqual({ status: 'synced' })
    await expect(readFile(path.join(parentDir, 'untracked.txt'), 'utf8')).resolves.toBe('scratch\n')
    await expect(readFile(path.join(parentDir, 'new-file.txt'), 'utf8')).resolves.toBe('new\n')
  })

  it('fails and leaves the file untouched when an untracked file collides with the new tree', async () => {
    const { parentDir, parentTip, newTreeOid } = await createParentWorktreeAheadOfIndex()
    await writeFile(path.join(parentDir, 'new-file.txt'), 'untracked-collision\n')
    const parentBranchTipBefore = git(parentDir, ['rev-parse', 'refs/heads/parent-branch'])

    const result = await syncParentWorkingTree(parentDir, parentTip, newTreeOid)

    expect(result.status).toBe('failed')
    if (result.status !== 'failed') {
      throw new Error('expected failed status')
    }
    expect(result.message.length).toBeGreaterThan(0)
    await expect(readFile(path.join(parentDir, 'new-file.txt'), 'utf8')).resolves.toBe(
      'untracked-collision\n'
    )
    expect(git(parentDir, ['rev-parse', 'refs/heads/parent-branch'])).toBe(parentBranchTipBefore)
  })
})
