import { describe, expect, it } from 'vitest'
import {
  composeFrontendUrl,
  dataDirSocketPathProblem,
  parseReadinessLine,
  repoAddArgs,
  resolveLaunchPlan,
  settingsSeedContent,
  settingsSeedPath
} from './cubito-launch-plan.mjs'

const HOME = '/Users/dev'
const REPO_ROOT = '/repo'
const BASE = { argv: [], env: {}, homedir: HOME, platform: 'darwin', repoRoot: REPO_ROOT }

describe('resolveLaunchPlan', () => {
  it('defaults to an isolated data dir, worktree root, and ports', () => {
    const plan = resolveLaunchPlan(BASE)
    expect(plan.dataDir).toBe('/Users/dev/.cubito')
    expect(plan.worktreeRoot).toBe('/Users/dev/cubito/workspaces')
    expect(plan.orcadPort).toBe(6799)
    expect(plan.frontendPort).toBe(5180)
  })

  it('derives the web client root from the repo root', () => {
    expect(resolveLaunchPlan(BASE).webClientRoot).toBe('/repo/out/orcad/web-client')
  })

  it('never defaults into the real Orca profile or workspace root', () => {
    const plan = resolveLaunchPlan(BASE)
    expect(plan.dataDir).not.toBe('/Users/dev/.orca')
    expect(plan.worktreeRoot).not.toBe('/Users/dev/orca/workspaces')
  })

  it('honors env overrides for data dir, worktree root, and both ports', () => {
    const plan = resolveLaunchPlan({
      ...BASE,
      env: {
        ORCA_USER_DATA: '/tmp/data',
        CUBITO_WORKTREE_ROOT: '/tmp/work',
        CUBITO_ORCAD_PORT: '7000',
        CUBITO_FRONTEND_PORT: '5555'
      }
    })
    expect(plan.dataDir).toBe('/tmp/data')
    expect(plan.worktreeRoot).toBe('/tmp/work')
    expect(plan.orcadPort).toBe(7000)
    expect(plan.frontendPort).toBe(5555)
  })

  it('flags beat env for data dir, worktree root, and both ports', () => {
    const plan = resolveLaunchPlan({
      ...BASE,
      argv: [
        '--data-dir',
        '/flag/data',
        '--worktree-root',
        '/flag/work',
        '--port',
        '7100',
        '--frontend-port',
        '5656'
      ],
      env: {
        ORCA_USER_DATA: '/tmp/data',
        CUBITO_WORKTREE_ROOT: '/tmp/work',
        CUBITO_ORCAD_PORT: '7000',
        CUBITO_FRONTEND_PORT: '5555'
      }
    })
    expect(plan.dataDir).toBe('/flag/data')
    expect(plan.worktreeRoot).toBe('/flag/work')
    expect(plan.orcadPort).toBe(7100)
    expect(plan.frontendPort).toBe(5656)
  })

  it('always carries --json plus the resolved --port and --web-client-root in orcadArgs', () => {
    const plan = resolveLaunchPlan(BASE)
    expect(plan.orcadArgs).toEqual([
      '--port',
      '6799',
      '--json',
      '--web-client-root',
      '/repo/out/orcad/web-client'
    ])
  })

  it('adds --bind and --pairing-address only when the env vars are set', () => {
    const plan = resolveLaunchPlan({
      ...BASE,
      env: { CUBITO_ORCAD_BIND: '0.0.0.0', CUBITO_PAIRING_ADDRESS: '127.0.0.1:6799' }
    })
    expect(plan.orcadArgs).toEqual([
      '--port',
      '6799',
      '--json',
      '--web-client-root',
      '/repo/out/orcad/web-client',
      '--bind',
      '0.0.0.0',
      '--pairing-address',
      '127.0.0.1:6799'
    ])
  })

  it('opens the browser on darwin by default', () => {
    expect(resolveLaunchPlan(BASE).openInBrowser).toBe(true)
  })

  it('never opens the browser off darwin', () => {
    expect(resolveLaunchPlan({ ...BASE, platform: 'linux' }).openInBrowser).toBe(false)
    expect(resolveLaunchPlan({ ...BASE, platform: 'win32' }).openInBrowser).toBe(false)
  })

  it('does not open the browser under --no-open or $CUBITO_NO_OPEN', () => {
    expect(resolveLaunchPlan({ ...BASE, argv: ['--no-open'] }).openInBrowser).toBe(false)
    expect(resolveLaunchPlan({ ...BASE, env: { CUBITO_NO_OPEN: '1' } }).openInBrowser).toBe(false)
  })

  it('has no repos to register by default', () => {
    expect(resolveLaunchPlan(BASE).registerRepoPaths).toEqual([])
  })

  it('collects repeated --register-repo flags', () => {
    const plan = resolveLaunchPlan({
      ...BASE,
      argv: ['--register-repo', '/repos/a', '--register-repo', '/repos/b']
    })
    expect(plan.registerRepoPaths).toEqual(['/repos/a', '/repos/b'])
  })

  it('splits $CUBITO_REGISTER_REPOS on commas', () => {
    const plan = resolveLaunchPlan({ ...BASE, env: { CUBITO_REGISTER_REPOS: '/repos/a,/repos/b' } })
    expect(plan.registerRepoPaths).toEqual(['/repos/a', '/repos/b'])
  })

  it('merges --register-repo flags with $CUBITO_REGISTER_REPOS', () => {
    const plan = resolveLaunchPlan({
      ...BASE,
      argv: ['--register-repo', '/repos/flag'],
      env: { CUBITO_REGISTER_REPOS: '/repos/env' }
    })
    expect(plan.registerRepoPaths).toEqual(['/repos/flag', '/repos/env'])
  })
})

describe('settingsSeedPath', () => {
  it('points at the local-default profile data file under the data dir', () => {
    expect(settingsSeedPath('/Users/dev/.cubito')).toBe(
      '/Users/dev/.cubito/profiles/local-default/orca-data.json'
    )
  })
})

describe('settingsSeedContent', () => {
  it('seeds only workspaceDir, leaving every other default setting untouched', () => {
    expect(settingsSeedContent('/Users/dev/cubito/workspaces')).toEqual({
      settings: { workspaceDir: '/Users/dev/cubito/workspaces' }
    })
  })
})

describe('parseReadinessLine', () => {
  it('extracts the pairing url from an orca_server_ready line', () => {
    const line = JSON.stringify({
      type: 'orca_server_ready',
      pairing: { url: 'orca://pair?code=abc' }
    })
    expect(parseReadinessLine(line)).toEqual({
      pairingUrl: 'orca://pair?code=abc',
      webClientUrl: null
    })
  })

  it('extracts the webClientUrl when present', () => {
    const line = JSON.stringify({
      type: 'orca_server_ready',
      pairing: { url: 'orca://pair?code=abc', webClientUrl: 'http://127.0.0.1:6799/web-index.html' }
    })
    expect(parseReadinessLine(line)).toEqual({
      pairingUrl: 'orca://pair?code=abc',
      webClientUrl: 'http://127.0.0.1:6799/web-index.html'
    })
  })

  it('ignores non-JSON lines', () => {
    expect(parseReadinessLine('not json at all')).toBeNull()
  })

  it('ignores JSON lines of the wrong type', () => {
    expect(parseReadinessLine(JSON.stringify({ type: 'something_else' }))).toBeNull()
  })

  it('ignores a ready line with no pairing url', () => {
    expect(parseReadinessLine(JSON.stringify({ type: 'orca_server_ready' }))).toBeNull()
  })
})

describe('dataDirSocketPathProblem', () => {
  const shortDataDir = '/Users/dev/.cubito'
  // 85 chars: dataDir.length + '/daemon/'.length(8) + margin(13) = 106 — over darwin's 104, under linux's 108.
  const borderlineDataDir = `/Users/dev/${'x'.repeat(74)}`

  it('passes a short data dir on darwin and linux', () => {
    expect(dataDirSocketPathProblem(shortDataDir, 'darwin')).toBeNull()
    expect(dataDirSocketPathProblem(shortDataDir, 'linux')).toBeNull()
  })

  it('fails on darwin once the worst-case socket path leaves less than the margin', () => {
    const problem = dataDirSocketPathProblem(borderlineDataDir, 'darwin')
    expect(problem).not.toBeNull()
    expect(problem).toContain('104')
    expect(problem).toMatch(/--data-dir|ORCA_USER_DATA/)
    expect(problem).toContain('~/.cubito')
  })

  it('passes the same borderline dir on linux, proving the platform-specific limit', () => {
    expect(dataDirSocketPathProblem(borderlineDataDir, 'linux')).toBeNull()
  })

  it('never fails on win32, regardless of length', () => {
    const veryLongDataDir = `/Users/dev/${'x'.repeat(500)}`
    expect(dataDirSocketPathProblem(veryLongDataDir, 'win32')).toBeNull()
  })
})

describe('repoAddArgs', () => {
  it('builds the CLI argv for `orca repo add` over the local unix socket', () => {
    expect(repoAddArgs('/app/out/cli/index.js', '/repos/demo-nest')).toEqual([
      '/app/out/cli/index.js',
      'repo',
      'add',
      '--path',
      '/repos/demo-nest',
      '--json'
    ])
  })
})

describe('composeFrontendUrl', () => {
  it('encodes the pairing url into a localhost fragment', () => {
    const pairingUrl = 'orca://pair?code=ab+c/d=&device=1'
    const url = composeFrontendUrl(5180, pairingUrl)
    expect(url).toBe(`http://localhost:5180/#pairing=${encodeURIComponent(pairingUrl)}`)
    expect(url).toContain(encodeURIComponent('?'))
    expect(url).toContain(encodeURIComponent('&'))
    expect(url).toContain(encodeURIComponent('='))
    expect(url).toContain(encodeURIComponent('+'))
    expect(url).toContain(encodeURIComponent('/'))
  })
})
