#!/usr/bin/env node

// Stages the runtime's real external closure (computed, not a fixed cp -RL list — a fixed list
// brings a package's siblings but not the siblings' own deps, e.g. is-glob without is-extglob).
// Decisions live in cubito-runtime-closure.mjs (pure, unit-tested).

import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { collectRuntimeClosure, createRealResolver } from './cubito-runtime-closure.mjs'

function parseArgs(argv) {
  const args = { roots: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--from') {
      args.from = argv[++i]
    } else if (arg === '--to') {
      args.to = argv[++i]
    } else if (arg === '--root') {
      args.roots.push(argv[++i])
    } else {
      throw new Error(`[cubito-stage-runtime-deps] unknown argument: ${arg}`)
    }
  }
  if (!args.from || !args.to || args.roots.length === 0) {
    throw new Error(
      '[cubito-stage-runtime-deps] usage: --from <dir> --to <dir> --root <pkg> [--root <pkg> ...]'
    )
  }
  return args
}

const { from, to, roots } = parseArgs(process.argv.slice(2))
const { packages, skippedOptional, conflicts } = collectRuntimeClosure(
  roots,
  createRealResolver(from)
)

if (conflicts.length > 0) {
  console.error('[cubito-stage-runtime-deps] a flat node_modules cannot hold two versions:')
  for (const conflict of conflicts) {
    console.error(`  ${conflict.name}: ${conflict.dirs.join(' vs ')}`)
  }
  process.exit(1)
}

mkdirSync(to, { recursive: true })
for (const [name, dir] of packages) {
  const dest = join(to, name)
  mkdirSync(dirname(dest), { recursive: true }) // scoped names need the scope dir first
  cpSync(dir, dest, { recursive: true, dereference: true })
}

// Keep only what node-pty needs at runtime: the compiled addon (+ spawn-helper on Unix).
if (packages.has('node-pty')) {
  const ptyDir = join(to, 'node-pty')
  for (const leftover of ['src', 'deps', 'third_party', 'prebuilds', 'build/Release/obj.target']) {
    rmSync(join(ptyDir, leftover), { recursive: true, force: true })
  }
}

const skippedNote =
  skippedOptional.length > 0 ? ` (skipped optional: ${skippedOptional.join(', ')})` : ''
console.log(`[cubito-stage-runtime-deps] staged ${packages.size} packages to ${to}${skippedNote}`)
