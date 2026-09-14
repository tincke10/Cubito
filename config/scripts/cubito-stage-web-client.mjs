#!/usr/bin/env node

// Stages frontend/dist as orcad's web client: index.html -> web-index.html, assets/ copied
// recursively. Decisions live in cubito-web-client-staging.mjs (pure, unit-tested).

import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import {
  assertStageableDist,
  unservableDistEntries,
  webClientStagePlan
} from './cubito-web-client-staging.mjs'

const scriptDir = import.meta.dirname
const repoRoot = resolve(scriptDir, '..', '..')
const distDir = join(repoRoot, 'frontend', 'dist')
const outDir = join(repoRoot, 'out', 'orcad', 'web-client')

const entries = readdirSync(distDir, { withFileTypes: true })
assertStageableDist(distDir, entries)

const unservable = unservableDistEntries(entries)
if (unservable.length > 0) {
  console.error(
    `[cubito-stage-web-client] frontend/dist has root-level entries the static handler ` +
      `cannot serve: ${unservable.join(', ')}`
  )
  process.exit(1)
}

const plan = webClientStagePlan(distDir, outDir)
rmSync(plan.removeDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
for (const copy of plan.copies) {
  cpSync(copy.from, copy.to, { recursive: copy.recursive })
}
console.log(`[cubito-stage-web-client] staged ${distDir} -> ${outDir}`)
