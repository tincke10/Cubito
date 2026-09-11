#!/usr/bin/env node

// Boots orcad + the frontend preview server on an isolated data dir/worktree root, prints the
// pairing URL. Decisions live in cubito-launch-plan.mjs (pure, unit-tested); this is spawn/fs glue.

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
const FRONTEND_READY_TIMEOUT_MS = 30_000

const plan = resolveLaunchPlan({
  argv: process.argv.slice(2),
  env: process.env,
  homedir: homedir(),
  platform: process.platform
})

const socketPathProblem = dataDirSocketPathProblem(plan.dataDir, process.platform)
if (socketPathProblem) {
  console.error(`[cubito] ${socketPathProblem}`)
  process.exit(1)
}

seedIsolatedProfile(plan)

let orcadChild = null
let frontendChild = null
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

  const pairingUrl = await waitForPairingUrl(orcadChild)
  console.log(`[cubito] orcad ready, pairing URL: ${pairingUrl}`)

  frontendChild = spawn('pnpm', ['--dir', 'frontend', 'run', 'preview'], {
    cwd: repoRoot,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  await waitForFrontendReady(frontendChild)

  const url = composeFrontendUrl(plan.frontendPort, pairingUrl)
  console.log(`[cubito] open: ${url}`)
  if (plan.openInBrowser) {
    spawn('open', [url], { stdio: 'ignore' })
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
function waitForPairingUrl(child) {
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
        resolvePromise(parsed.pairingUrl)
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

/** Waits for vite preview's "Local:" line; a short poll would race the same output. */
function waitForFrontendReady(child) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(
      () =>
        rejectPromise(
          new Error(`frontend preview printed no ready line within ${FRONTEND_READY_TIMEOUT_MS}ms`)
        ),
      FRONTEND_READY_TIMEOUT_MS
    )
    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => {
      if (line.includes('Local:')) {
        clearTimeout(timer)
        lines.close()
        resolvePromise()
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      rejectPromise(new Error(`frontend preview exited with ${code} before becoming ready`))
    })
  })
}

/** Forwards SIGINT/SIGTERM to both spawned process groups; a second signal escalates to SIGKILL. */
function registerSignalForwarding() {
  process.on('SIGINT', () => stopChildren('SIGINT'))
  process.on('SIGTERM', () => stopChildren('SIGTERM'))
}

function stopChildren(signal) {
  stopAttempts += 1
  const targetSignal = stopAttempts > 1 ? 'SIGKILL' : signal
  for (const child of [orcadChild, frontendChild]) {
    killProcessGroup(child, targetSignal)
  }
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
