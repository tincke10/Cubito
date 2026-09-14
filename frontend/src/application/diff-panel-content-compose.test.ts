import { describe, expect, it } from 'vitest'
import { composeBaseToWorkingTree } from './diff-panel-content-compose'
import type { DiffFileContent } from './ports/runtime-gateway'

describe('composeBaseToWorkingTree', () => {
  it('takes original from the branch diff and modified from the working-tree diff', () => {
    const branch: DiffFileContent = {
      kind: 'text',
      originalContent: 'base\n',
      modifiedContent: 'branch-head\n',
      truncated: false
    }
    const working: DiffFileContent = {
      kind: 'text',
      originalContent: 'head\n',
      modifiedContent: 'worktree\n',
      truncated: false
    }

    expect(composeBaseToWorkingTree(branch, working)).toEqual({
      kind: 'text',
      originalContent: 'base\n',
      modifiedContent: 'worktree\n',
      truncated: false
    })
  })

  it('ORs the truncated flags', () => {
    const branch: DiffFileContent = {
      kind: 'text',
      originalContent: 'a',
      modifiedContent: 'b',
      truncated: true
    }
    const working: DiffFileContent = {
      kind: 'text',
      originalContent: 'c',
      modifiedContent: 'd',
      truncated: false
    }

    expect(composeBaseToWorkingTree(branch, working)).toMatchObject({ truncated: true })
    expect(composeBaseToWorkingTree(working, branch)).toMatchObject({ truncated: true })
  })

  it('degrades to binary when the branch side is binary, carrying working.modifiedDeleted', () => {
    const branch: DiffFileContent = { kind: 'binary', mimeType: 'image/png' }
    const working: DiffFileContent = { kind: 'binary', modifiedDeleted: true }

    expect(composeBaseToWorkingTree(branch, working)).toEqual({
      kind: 'binary',
      modifiedDeleted: true
    })
  })

  it('degrades to binary when the working side is binary, omitting modifiedDeleted when absent', () => {
    const branch: DiffFileContent = {
      kind: 'text',
      originalContent: 'a',
      modifiedContent: 'b',
      truncated: false
    }
    const working: DiffFileContent = { kind: 'binary' }

    expect(composeBaseToWorkingTree(branch, working)).toEqual({ kind: 'binary' })
  })
})
