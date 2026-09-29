#!/usr/bin/env node

// Pre-answers Claude Code's first-run prompts in $HOME/.claude.json so a spawned agent never
// blocks on them. Additive only: other keys are never removed or rewritten.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

/** Pure: `acceptBypass` also pre-accepts the "Bypass Permissions mode" warning (default "exit"). */
export function mergeClaudeConfig(existing, { acceptBypass }) {
  return {
    ...existing,
    hasCompletedOnboarding: true,
    ...(acceptBypass ? { bypassPermissionsModeAccepted: true } : {})
  }
}

export function seedClaudeConfig({ home, acceptBypass }) {
  const file = join(home, '.claude.json')
  let existing = {}
  if (existsSync(file)) {
    try {
      existing = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      existing = null
    }
    if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
      throw new Error(`${file} is corrupt (not a JSON object); refusing to overwrite it`)
    }
  }
  const tmp = `${file}.cubito-seed.${process.pid}`
  writeFileSync(
    tmp,
    `${JSON.stringify(mergeClaudeConfig(existing, { acceptBypass }), null, 2)}\n`,
    {
      mode: 0o600
    }
  )
  renameSync(tmp, file)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    seedClaudeConfig({
      home: process.env.HOME || homedir(),
      acceptBypass: process.argv.includes('--accept-bypass')
    })
  } catch (error) {
    console.error(`[cubito] ${error.message}`)
    process.exit(1)
  }
}
