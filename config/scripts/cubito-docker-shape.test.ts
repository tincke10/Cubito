import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

// Ratchet: the root compose stack must build and serve Cubito on an isolated
// data/worktree root — never the real Orca profile or workspace dir.

const REPO_ROOT = join(import.meta.dirname, '..', '..')

type ComposeFile = {
  services: Record<
    string,
    {
      build?: string
      ports?: string[]
      environment?: Record<string, string>
      volumes?: string[]
      stdin_open?: boolean
      tty?: boolean
    }
  >
  volumes?: Record<string, unknown>
}

describe('compose.yaml', () => {
  const compose = parse(readFileSync(join(REPO_ROOT, 'compose.yaml'), 'utf8')) as ComposeFile
  const cubito = compose.services.cubito

  it('builds the cubito service from the repo root', () => {
    expect(cubito).toBeDefined()
    expect(cubito.build).toBe('.')
  })

  it('publishes the orcad and frontend ports', () => {
    expect(cubito.ports).toEqual(expect.arrayContaining(['6799:6799', '5180:5180']))
  })

  it('mounts the three named volumes', () => {
    expect(cubito.volumes).toEqual(
      expect.arrayContaining([
        'cubito-data:/data',
        'cubito-workspaces:/workspaces',
        'cubito-repos:/repos'
      ])
    )
    expect(Object.keys(compose.volumes ?? {})).toEqual(
      expect.arrayContaining(['cubito-data', 'cubito-workspaces', 'cubito-repos'])
    )
  })

  it('isolates the data dir and worktree root from the real Orca profile', () => {
    const env = cubito.environment ?? {}
    expect(env.ORCA_USER_DATA).toBe('/data')
    expect(env.CUBITO_WORKTREE_ROOT).toBe('/workspaces')
    expect(env.ORCA_USER_DATA).not.toMatch(/\.orca/)
    expect(env.CUBITO_WORKTREE_ROOT).not.toMatch(/orca\/workspaces/)
  })

  it('keeps the terminal interactive for docker compose exec', () => {
    expect(cubito.stdin_open).toBe(true)
    expect(cubito.tty).toBe(true)
  })
})

describe('Dockerfile', () => {
  const dockerfile = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8')
  const REQUIRED_LINES = [
    'FROM node:24-bookworm',
    'ELECTRON_SKIP_BINARY_DOWNLOAD',
    'pnpm install --ignore-scripts',
    'ensure-native-runtime.mjs --runtime=node',
    'build:cli',
    'build:orcad',
    'pnpm --dir frontend run build',
    '@anthropic-ai/claude-code'
  ]

  it('carries every required build step', () => {
    const missing = REQUIRED_LINES.filter((line) => !dockerfile.includes(line))
    expect(missing).toEqual([])
  })
})

describe('.dockerignore', () => {
  const ignore = readFileSync(join(REPO_ROOT, '.dockerignore'), 'utf8')

  it('excludes node_modules and .git from the build context', () => {
    expect(ignore).toContain('node_modules')
    expect(ignore).toContain('.git')
  })
})
