import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/userData' } }))

import { ClaudeHookService } from '../claude/hook-service'

// Why POSIX only: os.homedir() honors HOME there; Windows reads USERPROFILE and is covered by hook-service.test.ts.
describe.skipIf(process.platform === 'win32')('ClaudeHookService.install co-existence', () => {
  let home: string
  let previousHome: string | undefined

  beforeEach(() => {
    previousHome = process.env.HOME
    home = mkdtempSync(join(tmpdir(), 'orcad-hook-merge-'))
    process.env.HOME = home
  })

  afterEach(() => {
    process.env.HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  })

  it('preserves a foreign hook and is idempotent over an existing Orca install', () => {
    const foreign = { matcher: '', hooks: [{ type: 'command', command: '/usr/local/bin/mine' }] }
    const settingsPath = join(home, '.claude', 'settings.json')
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(
      settingsPath,
      JSON.stringify({ theme: 'dark', hooks: { Stop: [foreign] } }, null, 2)
    )
    const service = new ClaudeHookService()

    service.install()
    const first = readFileSync(settingsPath, 'utf-8')
    service.install()
    const second = readFileSync(settingsPath, 'utf-8')

    const config = JSON.parse(second)
    expect(config.theme).toBe('dark')
    expect(config.hooks.Stop[0]).toEqual(foreign)
    expect(config.hooks.Stop).toHaveLength(2)
    expect(second).toBe(first)
    expect(existsSync(join(home, '.orca', 'agent-hooks', 'claude-hook.sh'))).toBe(true)
  })
})
