import { describe, expect, it } from 'vitest'
import {
  checkGit,
  checkNodeMajor,
  checkPnpmVersion,
  checkXcodeCommandLineTools,
  collectPreflightFailures
} from './cubito-install-preflight.mjs'

describe('checkNodeMajor', () => {
  it('fails below the Node 24 floor', () => {
    expect(checkNodeMajor('v23.9.0').ok).toBe(false)
  })

  it('passes at exactly Node 24', () => {
    expect(checkNodeMajor('v24.0.0').ok).toBe(true)
  })

  it('passes above Node 24', () => {
    expect(checkNodeMajor('v25.1.0').ok).toBe(true)
  })

  it('carries an actionable fix when it fails', () => {
    const result = checkNodeMajor('v23.9.0')
    expect(result.fix).toMatch(/node/i)
    expect(result.fix.length).toBeGreaterThan(0)
  })
})

describe('checkPnpmVersion', () => {
  it('fails when pnpm is missing', () => {
    const result = checkPnpmVersion(null)
    expect(result.ok).toBe(false)
    expect(result.fix.length).toBeGreaterThan(0)
  })

  it('fails when pnpm is too old', () => {
    const result = checkPnpmVersion('9.5.0')
    expect(result.ok).toBe(false)
    expect(result.fix.length).toBeGreaterThan(0)
  })

  it('passes at the required major', () => {
    expect(checkPnpmVersion('10.24.0').ok).toBe(true)
  })
})

describe('checkGit', () => {
  it('fails when git is missing', () => {
    const result = checkGit(null)
    expect(result.ok).toBe(false)
    expect(result.fix.length).toBeGreaterThan(0)
  })

  it('passes when git reports a version', () => {
    expect(checkGit('git version 2.42.0').ok).toBe(true)
  })
})

describe('checkXcodeCommandLineTools', () => {
  it('is skipped off darwin regardless of the probe', () => {
    expect(checkXcodeCommandLineTools({ platform: 'linux', probe: null }).ok).toBe(true)
    expect(checkXcodeCommandLineTools({ platform: 'win32', probe: null }).ok).toBe(true)
  })

  it('fails on darwin without the tools installed', () => {
    const result = checkXcodeCommandLineTools({ platform: 'darwin', probe: null })
    expect(result.ok).toBe(false)
    expect(result.fix).toMatch(/xcode-select --install/)
  })

  it('passes on darwin when the probe returns a path', () => {
    expect(
      checkXcodeCommandLineTools({
        platform: 'darwin',
        probe: '/Library/Developer/CommandLineTools'
      }).ok
    ).toBe(true)
  })
})

describe('collectPreflightFailures', () => {
  it('reports ok with no failures when every probe passes', () => {
    const result = collectPreflightFailures({
      nodeVersion: 'v24.1.0',
      pnpmVersionOutput: '10.24.0',
      gitVersionOutput: 'git version 2.42.0',
      platform: 'linux',
      xcodeSelectProbe: null
    })
    expect(result).toEqual({ ok: true, failures: [] })
  })

  it('collects one failure entry per failing tool, each with an actionable fix', () => {
    const result = collectPreflightFailures({
      nodeVersion: 'v23.0.0',
      pnpmVersionOutput: null,
      gitVersionOutput: 'git version 2.42.0',
      platform: 'darwin',
      xcodeSelectProbe: null
    })
    expect(result.ok).toBe(false)
    const tools = result.failures.map((failure) => failure.tool)
    expect(tools).toEqual(['node', 'pnpm', 'xcode-command-line-tools'])
    for (const failure of result.failures) {
      expect(failure.fix.length).toBeGreaterThan(0)
      expect(failure.found).toBeTruthy()
      expect(failure.needed).toBeTruthy()
    }
  })

  it('never reports the xcode-command-line-tools failure off darwin', () => {
    const result = collectPreflightFailures({
      nodeVersion: 'v24.1.0',
      pnpmVersionOutput: '10.24.0',
      gitVersionOutput: null,
      platform: 'linux',
      xcodeSelectProbe: null
    })
    expect(result.failures.map((failure) => failure.tool)).toEqual(['git'])
  })
})
