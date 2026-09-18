import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Ban guard: the Electron/Playwright E2E suite (v5-3-e2e-cleanup), electron-builder's
// packaging toolchain, and the Electron-renderer-window automation cluster (win-update-e2e,
// win-crash-survival-e2e, terminal-garble-*, workspace-switch-paint-latency — Cubito has had
// no Electron renderer since bb24b404b) are all gone. Fails loud if any part of them, or a
// stray import of their packages, creeps back.

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const BANNED_PACKAGES = [
  '@playwright/test',
  'electron-builder',
  'electron-builder-squirrel-windows',
  '@stablyai/playwright-test'
]
// Genuine false positives only — comment-only mentions of a banned package's name that
// explain historical behavior, never a real straggler import. Never used to silence one.
const ALLOWLIST: readonly string[] = [
  'config/scripts/build-notification-status-macos.mjs',
  'config/scripts/build-windows-cli-launcher.mjs',
  'config/scripts/rebuild-native-deps.mjs',
  'src/main/ssh/ssh-relay-deploy.ts',
  'src/shared/release-channel.ts'
]
// This guard's own source names the banned packages literally; exclude it from its own scan.
const SELF_FILE = 'config/scripts/playwright-suite-absence.test.ts'

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*.mjs', '*.cjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
    .split('\n')
    .filter(Boolean)
    .filter((rel) => rel !== SELF_FILE)
}

describe('Playwright/Electron E2E suite absence', () => {
  it('leaves no trace of the removed suite or its config on disk', () => {
    for (const removed of ['tests/e2e', 'tests/playwright.config.ts', 'config/tsconfig.e2e.json']) {
      expect(existsSync(join(REPO_ROOT, removed))).toBe(false)
    }
  })

  it('leaves no trace of electron-builder config, scripts, or their tests on disk', () => {
    const removed = [
      'config/electron-builder.config.cjs',
      'config/scripts/electron-builder-native-rebuild.cjs',
      'config/scripts/electron-builder-native-rebuild.test.mjs',
      'config/scripts/electron-builder-mac-channel-config.test.mjs',
      'config/scripts/verify-packaged-daemon-entry.cjs',
      'config/scripts/verify-packaged-daemon-entry.test.mjs',
      'config/scripts/verify-packaged-plugin-resources.cjs',
      'config/scripts/verify-packaged-plugin-resources.test.mjs',
      'config/scripts/verify-packaged-node-pty-job-ownership.cjs',
      'config/scripts/verify-packaged-node-pty-job-ownership.test.mjs',
      'config/scripts/verify-dev-channel-packaging.mjs',
      'config/scripts/verify-dev-channel-packaging.test.mjs',
      'config/scripts/mac-build-compatibility.cjs',
      'config/scripts/mac-build-compatibility.test.mjs',
      'config/scripts/resolve-7za-path.mjs',
      'config/scripts/resolve-7za-path.test.mjs',
      'config/scripts/generate-windows-blockmap.mjs',
      'config/scripts/build-mac-local.mjs',
      'config/scripts/build-mac-local.test.mjs',
      'src/main/cli/packaged-cli-assets.test.ts',
      // Dead renderer-web-client projection: `out/renderer` hasn't existed since bb24b404b;
      // its only assertion tying it to this change read electron-builder.config.cjs directly.
      'config/scripts/project-renderer-web-client.mjs',
      'config/scripts/project-renderer-web-client.test.mjs',
      // Read the packaged app.asar through @electron/asar, which only ever arrived via electron-builder.
      'config/scripts/verify-telemetry-constants.mjs',
      'config/scripts/telemetry-bundle-constant-patterns.mjs',
      'config/scripts/telemetry-bundle-constant-patterns.test.mjs'
    ]
    for (const rel of removed) {
      expect(existsSync(join(REPO_ROOT, rel))).toBe(false)
    }
  })

  it('leaves no trace of desktop packaging resources on disk', () => {
    const removed = ['config/nsis', 'resources/linux/packaging', 'resources/linux/bin/orca-ide']
    for (const rel of removed) {
      expect(existsSync(join(REPO_ROOT, rel))).toBe(false)
    }
  })

  it('leaves no trace of the daemon-relocation-spike and its runtime-module helper on disk', () => {
    const removed = [
      'tests/tools/daemon-relocation-spike',
      'config/packaged-runtime-node-modules.cjs',
      'config/scripts/packaged-node-pty-prebuild-prune.test.mjs'
    ]
    for (const rel of removed) {
      expect(existsSync(join(REPO_ROOT, rel))).toBe(false)
    }
  })

  it('leaves no trace of the Electron-renderer automation tool cluster on disk', () => {
    const removed = [
      'tests/tools/win-update-e2e',
      'tests/tools/win-crash-survival-e2e',
      'tests/tools/terminal-garble-production-repro.mjs',
      'tests/tools/terminal-garble-frame-analysis.mjs',
      'tests/tools/terminal-garble-react-terminal-recovery.mjs',
      'tests/tools/terminal-garble-session-replay.mjs',
      'tests/tools/benchmarks/workspace-switch-paint-latency.mjs'
    ]
    for (const rel of removed) {
      expect(existsSync(join(REPO_ROOT, rel))).toBe(false)
    }
  })

  it('leaves no windows-main-crash-survival gate in reliability-gates.jsonc', () => {
    const gates = readFileSync(join(REPO_ROOT, 'config/reliability-gates.jsonc'), 'utf8')
    expect(gates).not.toContain('terminal-session.windows-main-crash-survival')
    expect(gates).not.toContain('win-crash-survival')
  })

  it('declares none of the removed packaging/E2E dependencies in package.json', () => {
    const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    const names = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {})
    ]
    for (const banned of BANNED_PACKAGES) {
      expect(names).not.toContain(banned)
    }
  })

  it('mentions no playwright, tests/e2e, or electron-vite in any package.json script', () => {
    const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    const offenders = Object.entries(packageJson.scripts)
      .filter(([, command]) => /playwright|tests\/e2e|electron-vite/i.test(command))
      .map(([name]) => name)
    expect(offenders).toEqual([])
  })

  it('imports no removed packaging/E2E package from any tracked source file', () => {
    const offenders: string[] = []
    for (const rel of trackedFiles()) {
      if (ALLOWLIST.includes(rel)) {
        continue
      }
      const src = readFileSync(join(REPO_ROOT, rel), 'utf8')
      for (const pkg of BANNED_PACKAGES) {
        if (src.includes(pkg)) {
          offenders.push(`${rel}: imports ${pkg}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('has no tests/e2e entry in the vitest include list', () => {
    const config = readFileSync(join(REPO_ROOT, 'config/vitest.config.ts'), 'utf8')
    expect(config).not.toMatch(/tests\/e2e/)
  })
})
