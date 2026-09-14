import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertStageableDist,
  unservableDistEntries,
  webClientStagePlan
} from './cubito-web-client-staging.mjs'

const REPO_ROOT = join(import.meta.dirname, '..', '..')

function dirent(name: string, isDir = false) {
  return { name, isDirectory: () => isDir }
}

describe('webClientStagePlan', () => {
  it('renames index.html to web-index.html and copies assets recursively', () => {
    const plan = webClientStagePlan('/repo/frontend/dist', '/repo/out/orcad/web-client')
    expect(plan.removeDir).toBe('/repo/out/orcad/web-client')
    expect(plan.copies).toEqual([
      {
        from: '/repo/frontend/dist/index.html',
        to: '/repo/out/orcad/web-client/web-index.html',
        recursive: false
      },
      {
        from: '/repo/frontend/dist/assets',
        to: '/repo/out/orcad/web-client/assets',
        recursive: true
      }
    ])
  })
})

describe('unservableDistEntries', () => {
  it('allows index.html and the assets directory', () => {
    expect(unservableDistEntries([dirent('index.html'), dirent('assets', true)])).toEqual([])
  })

  it('flags a stray root-level file the static handler cannot serve', () => {
    expect(
      unservableDistEntries([dirent('index.html'), dirent('assets', true), dirent('favicon.ico')])
    ).toEqual(['favicon.ico'])
    expect(
      unservableDistEntries([
        dirent('index.html'),
        dirent('assets', true),
        dirent('manifest.webmanifest')
      ])
    ).toEqual(['manifest.webmanifest'])
    expect(
      unservableDistEntries([dirent('index.html'), dirent('assets', true), dirent('robots.txt')])
    ).toEqual(['robots.txt'])
  })

  it('passes the real frontend/dist build output', () => {
    const entries = readdirSync(join(REPO_ROOT, 'frontend', 'dist'), { withFileTypes: true })
    expect(unservableDistEntries(entries)).toEqual([])
  })
})

describe('assertStageableDist', () => {
  it('throws with an actionable message for an empty dist', () => {
    expect(() => assertStageableDist('/repo/frontend/dist', [])).toThrow(
      /frontend\/dist.*pnpm --dir frontend run build/
    )
  })

  it('does not throw for a non-empty dist', () => {
    expect(() => assertStageableDist('/repo/frontend/dist', [dirent('index.html')])).not.toThrow()
  })
})
