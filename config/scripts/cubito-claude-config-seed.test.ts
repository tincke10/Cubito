import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mergeClaudeConfig, seedClaudeConfig } from './cubito-claude-config-seed.mjs'

describe('mergeClaudeConfig', () => {
  it('sets onboarding done and leaves the bypass warning alone by default', () => {
    expect(mergeClaudeConfig({}, { acceptBypass: false })).toEqual({ hasCompletedOnboarding: true })
  })

  it('pre-accepts the bypass warning only when asked', () => {
    expect(mergeClaudeConfig({}, { acceptBypass: true })).toEqual({
      hasCompletedOnboarding: true,
      bypassPermissionsModeAccepted: true
    })
  })

  it('never removes or rewrites other keys, nor revokes an earlier acceptance', () => {
    const existing = {
      theme: 'dark',
      projects: { '/a': { x: 1 } },
      bypassPermissionsModeAccepted: true
    }
    expect(mergeClaudeConfig(existing, { acceptBypass: false })).toEqual({
      ...existing,
      hasCompletedOnboarding: true
    })
  })
})

describe('seedClaudeConfig', () => {
  let home: string
  const file = () => join(home, '.claude.json')

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'cubito-seed-'))
  })
  afterEach(() => rmSync(home, { recursive: true, force: true }))

  it('creates the file when missing', () => {
    seedClaudeConfig({ home, acceptBypass: true })
    expect(JSON.parse(readFileSync(file(), 'utf8'))).toEqual({
      hasCompletedOnboarding: true,
      bypassPermissionsModeAccepted: true
    })
  })

  it('merges into an existing file and leaves no temp file behind', () => {
    writeFileSync(file(), JSON.stringify({ userID: 'abc' }))
    seedClaudeConfig({ home, acceptBypass: false })
    expect(JSON.parse(readFileSync(file(), 'utf8'))).toEqual({
      userID: 'abc',
      hasCompletedOnboarding: true
    })
    expect(readdirSync(home)).toEqual(['.claude.json'])
  })

  it('refuses to overwrite a corrupt file', () => {
    writeFileSync(file(), '{not json')
    expect(() => seedClaudeConfig({ home, acceptBypass: true })).toThrow(/corrupt/i)
    expect(readFileSync(file(), 'utf8')).toBe('{not json')
  })

  it('refuses a JSON value that is not an object', () => {
    writeFileSync(file(), '[]')
    expect(() => seedClaudeConfig({ home, acceptBypass: false })).toThrow(/corrupt/i)
  })
})
