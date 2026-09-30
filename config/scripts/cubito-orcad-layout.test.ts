import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ORCAD_ARTIFACTS, ORCAD_EMOJI_SHORTCODE_DATASET } from '../../src/shared/orcad-artifacts'
import {
  BUN_PACKAGE_MARKERS,
  CUBITO_ORCAD_CHILD_OUTPUTS,
  EMOJI_SHORTCODE_DATASET,
  cubitoOrcadRequiredFiles,
  ripgrepArtifact
} from './cubito-orcad-layout.mjs'
import { ORCAD_CHILD_ENTRY_POINTS } from './orcad-entry-build.mjs'

// Ratchet: Cubito's plain-Node orcad build must emit every child entry the synced runtime
// resolves beside orcad.js, and none of the files that make orcad hand off to a Bun runtime.

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const read = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8')

// Where the runtime looks each child up; a rename upstream must fail here, not in production.
const RUNTIME_RESOLVERS: Record<keyof typeof CUBITO_ORCAD_CHILD_OUTPUTS, string> = {
  watcher: 'src/main/ipc/parcel-watcher-entry-path.ts',
  daemon: 'src/main/daemon/daemon-launch-paths.ts',
  ptyGate: 'src/main/daemon/pty-subprocess/windows-bun-pty-launch.ts',
  writer: 'src/main/persistence/profile-state/profile-state-writer-worker-path.ts',
  backup: 'src/main/persistence/profile-state/profile-state-backup-worker.ts'
}

describe('cubito orcad layout', () => {
  it('names an output for every child entry point upstream builds', () => {
    expect(Object.keys(CUBITO_ORCAD_CHILD_OUTPUTS).sort()).toEqual(
      Object.keys(ORCAD_CHILD_ENTRY_POINTS).sort()
    )
  })

  it('emits every top-level JavaScript artifact the orcad manifest declares', () => {
    const declared = ORCAD_ARTIFACTS.map((artifact) => artifact.filename).filter(
      (filename) => filename.endsWith('.js') && !filename.includes('/')
    )
    expect(cubitoOrcadRequiredFiles()).toEqual(expect.arrayContaining(declared))
  })

  it.each(Object.entries(RUNTIME_RESOLVERS))(
    'uses the filename the runtime resolves for the %s child',
    (role, resolver) => {
      const output = CUBITO_ORCAD_CHILD_OUTPUTS[role as keyof typeof CUBITO_ORCAD_CHILD_OUTPUTS]
      expect(read(resolver)).toContain(`'${output}'`)
    }
  )

  it('ships the emoji dataset where the runtime createRequire()s it', () => {
    expect(EMOJI_SHORTCODE_DATASET).toBe(ORCAD_EMOJI_SHORTCODE_DATASET)
    expect(read('src/main/ipc/deferred-emoji-shortcode-dataset.ts')).toContain(
      EMOJI_SHORTCODE_DATASET.replace('node_modules/', '')
    )
  })

  it('ships ripgrep under the install root in the bundled-ripgrep layout', () => {
    expect(ripgrepArtifact('linux', 'x64')).toBe('ripgrep/linux-x64/rg')
    expect(ripgrepArtifact('win32', 'arm64')).toBe('ripgrep/win32-arm64/rg.exe')
    expect(cubitoOrcadRequiredFiles('linux', 'arm64')).toContain('ripgrep/linux-arm64/rg')
  })

  it('treats exactly the files handoffToBundledOrcad probes as Bun package markers', () => {
    const handoff = read('src/main/orcad/orcad-bundled-runtime.ts')
    for (const probe of [
      'ORCAD_VERSION_FILENAME',
      'ORCAD_BUILD_TARGET_FILENAME',
      'orcadBunRuntimeFilename'
    ]) {
      expect(handoff).toContain(probe)
    }
    const markers = ORCAD_ARTIFACTS.map((artifact) => artifact.filename).filter(
      (filename) => filename === '.build-target' || filename.startsWith('bun-runtime')
    )
    expect(BUN_PACKAGE_MARKERS).toEqual(expect.arrayContaining([...markers, '.version']))
  })
})

describe('build-orcad.mjs', () => {
  const script = read('config/scripts/build-orcad.mjs')

  it('builds every child from the shared entry list, flat beside orcad.js', () => {
    expect(script).toContain('Object.entries(ORCAD_CHILD_ENTRY_POINTS)')
    expect(script).toContain('CUBITO_ORCAD_CHILD_OUTPUTS[role]')
  })

  it('smoke-runs the profile-state workers and checks the final layout', () => {
    expect(script).toContain('smokeProfileStateWorkers(OUT_DIR)')
    expect(script).toContain('cubitoOrcadRequiredFiles()')
    expect(script).toContain('BUN_PACKAGE_MARKERS')
  })

  it('never writes a Bun package marker', () => {
    expect(script).not.toMatch(/writeFileSync\([^)]*ORCAD_(VERSION|BUILD_TARGET)_FILENAME/)
    expect(script).not.toContain('ORCAD_BUN_RUNTIME_PATH')
  })
})
