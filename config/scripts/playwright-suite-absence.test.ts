import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Ban guard: the Electron/Playwright E2E suite and toolchain are gone (v5-3-e2e-cleanup).
// Fails loud if any part of it, or a stray import of its packages, creeps back.

const REPO_ROOT = join(import.meta.dirname, '..', '..')
// @stablyai/playwright-test itself is NOT banned: tests/tools/win-update-e2e/app-driver.mjs
// (a live, kept Windows update-survival repro harness, unrelated to the removed browser
// E2E suite) genuinely launches Electron through its `_electron` driver. Only the deleted
// suite's own package, @playwright/test, and every tests/e2e/* path are banned outright.
const BANNED_PACKAGES = ['@playwright/test']
// This guard's own source names the banned package literally; exclude it from its own scan.
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

  it('declares no @playwright/test dependency in package.json', () => {
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
    expect(names).not.toContain('@playwright/test')
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

  it('imports no Playwright package from any tracked source file', () => {
    // Genuine false positives only; never to silence a real straggler import.
    const ALLOWLIST: readonly string[] = []
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

  it('never imports @stablyai/playwright-test from the relocated survivor suites', () => {
    const survivorDirs = [
      'tests/cross-version-wire',
      'tests/docker-ssh-relay',
      'tests/computer-use'
    ]
    const offenders = trackedFiles()
      .filter((rel) => survivorDirs.some((dir) => rel.startsWith(`${dir}/`)))
      .filter((rel) =>
        readFileSync(join(REPO_ROOT, rel), 'utf8').includes('@stablyai/playwright-test')
      )
    expect(offenders).toEqual([])
  })
})
