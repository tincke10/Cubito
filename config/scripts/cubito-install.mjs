#!/usr/bin/env node

// Preflights the toolchain, then installs and builds everything `cubito-start.mjs` needs.
// Decisions live in cubito-install-preflight.mjs (pure, unit-tested); this is spawn glue.

import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { collectPreflightFailures } from './cubito-install-preflight.mjs'

const scriptDir = import.meta.dirname
const repoRoot = resolve(scriptDir, '..', '..')

runPreflight()
runStep('pnpm', ['install', '--ignore-scripts'])
runStep(process.execPath, ['config/scripts/ensure-native-runtime.mjs', '--runtime=node'])
runStep('pnpm', ['run', 'build:cli'])
runStep('pnpm', ['run', 'build:orcad'])
runStep('pnpm', ['--dir', 'frontend', 'install'])
runStep('pnpm', ['--dir', 'frontend', 'run', 'build'])
console.log('[cubito-install] done. Run `pnpm cubito:start` next.')

function runPreflight() {
  const probes = {
    nodeVersion: process.version,
    pnpmVersionOutput: probe('pnpm', ['--version']),
    gitVersionOutput: probe('git', ['--version']),
    platform: process.platform,
    xcodeSelectProbe: process.platform === 'darwin' ? probe('xcode-select', ['-p']) : null
  }
  const { ok, failures } = collectPreflightFailures(probes)
  if (ok) {
    return
  }
  console.error('[cubito-install] missing prerequisites:')
  for (const failure of failures) {
    console.error(`  - ${failure.tool}: found ${failure.found}, needed ${failure.needed}`)
    console.error(`    fix: ${failure.fix}`)
  }
  process.exit(1)
}

/** `null` on any probe failure — preflight checks treat that identically to "missing". */
function probe(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

/** Runs one install/build step with inherited stdio; aborts the whole install on first failure. */
function runStep(command, args) {
  console.log(`[cubito-install] ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' }
  })
  if (result.error) {
    console.error(`[cubito-install] failed to run ${command}: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
