import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Ground-truth ratchet: every local path a package.json script invokes must exist,
// no script may reference the removed electron-vite chain, and every pnpm/npm
// `run <name>` target must be a real script. Feeds Waves 1-2 of v5-2a-fork-cleanup.

const REPO_ROOT = join(import.meta.dirname, '..', '..')

// Genuine false positives only (dynamic paths, runtime-produced values) — never to
// silence a really-missing file. One reason per entry.
const ALLOWLIST: readonly { script: string; reason: string }[] = []

const OPERATOR_SPLIT = /\s*(?:&&|\|\||;|\|)\s*/
const PATH_PREFIXES = ['config/', 'tests/', 'resources/', 'scripts/', 'src/', 'frontend/', 'docs/']
const PATH_EXTENSIONS = /\.(mjs|cjs|js|ts|json|sh|cmd|ps1)$/
const GLOB_OR_SUBST = /[*?[\]{}]|\$|%/
// --project is excluded: every occurrence in this repo's scripts is a Playwright
// project name (e.g. "electron-headless"), never a filesystem path.
const PATH_FLAGS = new Set(['--config', '-p'])

function stripQuotes(token: string): string {
  return token.replace(/^['"]|['"]$/, '').replace(/['"]$/, '')
}

function looksLikeRepoPath(token: string): boolean {
  return PATH_PREFIXES.some((prefix) => token.startsWith(prefix)) || PATH_EXTENSIONS.test(token)
}

function checkPathToken(scriptName: string, rawToken: string, offenders: string[]): void {
  const token = stripQuotes(rawToken)
  if (GLOB_OR_SUBST.test(token)) {
    return
  }
  if (!existsSync(join(REPO_ROOT, token))) {
    offenders.push(`${scriptName}: missing path "${token}" referenced by command`)
  }
}

function checkCommandPaths(scriptName: string, command: string, offenders: string[]): void {
  for (const segment of command.split(OPERATOR_SPLIT)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean)
    for (let i = 0; i < tokens.length; i++) {
      const raw = tokens[i]
      const stripped = stripQuotes(raw)

      if (PATH_FLAGS.has(stripped) && tokens[i + 1]) {
        checkPathToken(scriptName, tokens[i + 1], offenders)
        i++
        continue
      }

      if (stripped.startsWith('-')) {
        continue
      }
      if (GLOB_OR_SUBST.test(stripped)) {
        continue
      }
      if (looksLikeRepoPath(stripped)) {
        checkPathToken(scriptName, stripped, offenders)
      }
    }
  }
}

function checkNoElectronVite(scriptName: string, command: string, offenders: string[]): void {
  if (command.includes('electron-vite')) {
    offenders.push(`${scriptName}: command references "electron-vite" (dead build chain)`)
  }
}

function checkRunTargets(
  scriptName: string,
  command: string,
  scripts: Record<string, string>,
  offenders: string[]
): void {
  for (const segment of command.split(OPERATOR_SPLIT)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean)
    for (let i = 0; i < tokens.length; i++) {
      const tool = stripQuotes(tokens[i])
      if (tool !== 'pnpm' && tool !== 'npm') {
        continue
      }

      const next = tokens[i + 1] ? stripQuotes(tokens[i + 1]) : undefined
      if (next === 'run' && tokens[i + 2]) {
        const target = stripQuotes(tokens[i + 2])
        if (!(target in scripts)) {
          offenders.push(`${scriptName}: "${tool} run ${target}" has no matching script`)
        }
      } else if (next && next in scripts) {
        // bare `pnpm <name>` shorthand for a name that is a real script — nothing to flag,
        // existence is true by construction, kept for completeness of the rule.
      }
    }
  }
}

describe('package.json scripts integrity', () => {
  const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  const scripts = packageJson.scripts

  it('references only existing local paths, never electron-vite, and only real run targets', () => {
    const offenders: string[] = []
    const allowlistedScripts = new Set(ALLOWLIST.map((entry) => entry.script))

    for (const [name, command] of Object.entries(scripts)) {
      if (allowlistedScripts.has(name)) {
        continue
      }
      checkCommandPaths(name, command, offenders)
      checkNoElectronVite(name, command, offenders)
      checkRunTargets(name, command, scripts, offenders)
    }

    expect(offenders).toEqual([])
  })
})
