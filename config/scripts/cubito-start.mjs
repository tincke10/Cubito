#!/usr/bin/env node

// Boots orcad on an isolated data dir/worktree root; orcad serves the staged frontend as its web
// client on the same port. Decisions live in cubito-launch-plan.mjs (pure, unit-tested); this is
// spawn/fs glue.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline'
import {
  composeFrontendUrl,
  dataDirSocketPathProblem,
  parseReadinessLine,
  resolveLaunchPlan,
  settingsSeedContent,
  settingsSeedPath
} from './cubito-launch-plan.mjs'

const scriptDir = import.meta.dirname
const repoRoot = resolve(scriptDir, '..', '..')
const orcadEntry = join(repoRoot, 'out', 'orcad', 'orcad.js')
const READY_TIMEOUT_MS = 120_000

const plan = resolveLaunchPlan({
  argv: process.argv.slice(2),
  env: process.env,
  homedir: homedir(),
  platform: process.platform,
  repoRoot
})

const socketPathProblem = dataDirSocketPathProblem(plan.dataDir, process.platform)
if (socketPathProblem) {
  console.error(`[cubito] ${socketPathProblem}`)
  process.exit(1)
}

const webIndexPath = join(plan.webClientRoot, 'web-index.html')
if (!existsSync(webIndexPath)) {
  console.error(
    `[cubito] no web client staged at ${plan.webClientRoot} — run \`pnpm cubito:install\` ` +
      '(or `node config/scripts/cubito-stage-web-client.mjs`) first.'
  )
  process.exit(1)
}

seedIsolatedProfile(plan)

let orcadChild = null
let stopAttempts = 0

await main()

async function main() {
  orcadChild = spawn(process.execPath, [orcadEntry, ...plan.orcadArgs], {
    cwd: repoRoot,
    detached: process.platform !== 'win32',
    env: { ...process.env, ORCA_USER_DATA: plan.dataDir },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  registerSignalForwarding()

  const { pairingUrl, webClientUrl } = await waitForReadiness(orcadChild)
  console.log(`[cubito] open: ${webClientUrl}`)
  console.log(`[cubito] dev frontend: ${composeFrontendUrl(plan.frontendPort, pairingUrl)}`)
  if (plan.openInBrowser) {
    spawn('open', [webClientUrl], { stdio: 'ignore' })
  }
}

/** Seeds the local-default profile's workspaceDir only when absent — never overwrite a user choice. */
function seedIsolatedProfile(launchPlan) {
  mkdirSync(launchPlan.dataDir, { recursive: true, mode: 0o700 })
  mkdirSync(launchPlan.worktreeRoot, { recursive: true })
  const seedPath = settingsSeedPath(launchPlan.dataDir)
  if (existsSync(seedPath)) {
    return
  }
  mkdirSync(dirname(seedPath), { recursive: true, mode: 0o700 })
  writeFileSync(seedPath, JSON.stringify(settingsSeedContent(launchPlan.worktreeRoot)))
}

/** Reads orcad's stdout for the ready line; rejects on timeout or an exit before one arrives. */
function waitForReadiness(child) {
  return new Promise((resolvePromise, rejectPromise) => {
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    const timer = setTimeout(
      () => rejectPromise(new Error(`orcad printed no ready line within ${READY_TIMEOUT_MS}ms`)),
      READY_TIMEOUT_MS
    )
    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => {
      const parsed = parseReadinessLine(line)
      if (parsed) {
        clearTimeout(timer)
        lines.close()
        resolvePromise(parsed)
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      rejectPromise(
        new Error(`orcad exited with ${code} before printing a ready line:\n${stderr.trim()}`)
      )
    })
  })
}

/** Forwards SIGINT/SIGTERM to orcad's process group; a second signal escalates to SIGKILL. */
function registerSignalForwarding() {
  process.on('SIGINT', () => stopChildren('SIGINT'))
  process.on('SIGTERM', () => stopChildren('SIGTERM'))
}

function stopChildren(signal) {
  stopAttempts += 1
  const targetSignal = stopAttempts > 1 ? 'SIGKILL' : signal
  killProcessGroup(orcadChild, targetSignal)
  if (stopAttempts > 1) {
    process.exit(1)
  }
}

function killProcessGroup(child, signal) {
  if (!child || child.killed || child.exitCode !== null) {
    return
  }
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {
      // Process group already gone; fall back to the direct child below.
    }
  }
  child.kill(signal)
}
