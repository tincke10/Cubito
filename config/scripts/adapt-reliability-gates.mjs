// Adapts config/reliability-gates.jsonc to the Cubito prune: drops references
// to test files that no longer exist (renderer/preload). Gates left with no
// coverage are demoted to protection "none" / maturity "accepted-gap" per the
// validator's contract (soak/blocking require commands+testFiles; none must
// declare neither, and no evidenceRuns).
import fs from 'node:fs'
import { parse } from 'jsonc-parser'

const MANIFEST = 'config/reliability-gates.jsonc'
const manifest = parse(fs.readFileSync(MANIFEST, 'utf8'))

let touched = 0
let demoted = 0

for (const gate of manifest.gates) {
  if (!Array.isArray(gate.testFiles) || gate.testFiles.length === 0) continue
  const missing = gate.testFiles.filter((f) => !fs.existsSync(f))
  if (missing.length === 0) continue
  touched += 1

  const surviving = gate.testFiles.filter((f) => fs.existsSync(f))
  const survivingRefs = Array.isArray(gate.assertionRefs)
    ? gate.assertionRefs.filter((ref) => surviving.includes(ref.file))
    : []

  if (surviving.length === 0 || survivingRefs.length === 0) {
    gate.protection = 'none'
    gate.maturity = 'accepted-gap'
    gate.commands = []
    gate.testFiles = []
    gate.assertionRefs = []
    gate.evidenceRuns = []
    gate.coveredPlatforms = []
    gate.coveredProviders = []
    demoted += 1
    continue
  }

  const stripMissing = (command) =>
    missing.reduce((cmd, file) => cmd.split(` ${file}`).join(''), command)

  gate.testFiles = surviving
  gate.assertionRefs = survivingRefs
  gate.commands = (gate.commands ?? []).map(stripMissing)
  gate.evidenceRuns = (gate.evidenceRuns ?? []).map((run) =>
    typeof run?.command === 'string' ? { ...run, command: stripMissing(run.command) } : run
  )
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`gates touched: ${touched}, demoted to none/accepted-gap: ${demoted}`)
