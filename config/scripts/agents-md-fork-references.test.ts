import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Ratchet: AGENTS.md must describe the fork's real UI (frontend/) and validation path,
// never the removed React/Electron desktop shell. Feeds v5-2a-fork-cleanup Wave 3.

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const STALE_REFERENCES = [
  'src/renderer',
  'src/preload',
  '$electron',
  'Playwright CDP',
  'electron-vite'
]

describe('AGENTS.md fork references', () => {
  it('never points at the removed desktop-shell UI or its validation tooling', () => {
    const content = readFileSync(join(REPO_ROOT, 'AGENTS.md'), 'utf8')
    const offenders = STALE_REFERENCES.filter((reference) => content.includes(reference))

    expect(offenders).toEqual([])
  })
})
