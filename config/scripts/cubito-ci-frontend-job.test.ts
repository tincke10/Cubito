import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

// Ratchet: cubito-ci.yml must run the frontend suite (typecheck, test, lint) on every
// push/PR — guards against the standalone frontend/ project silently falling out of CI.

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const REQUIRED_COMMANDS = [
  'pnpm --dir frontend install --frozen-lockfile',
  'pnpm --dir frontend run typecheck',
  'pnpm --dir frontend run test',
  'pnpm --dir frontend run lint'
]

describe('cubito-ci.yml frontend job', () => {
  it('runs install, typecheck, test and lint for frontend/', () => {
    const workflow = parse(
      readFileSync(join(REPO_ROOT, '.github/workflows/cubito-ci.yml'), 'utf8')
    ) as {
      jobs: Record<string, { steps?: { run?: string }[] }>
    }

    const frontendJob = workflow.jobs.frontend
    expect(frontendJob).toBeDefined()

    const allRuns = (frontendJob?.steps ?? []).map((step) => step.run ?? '').join('\n')
    const missing = REQUIRED_COMMANDS.filter((command) => !allRuns.includes(command))

    expect(missing).toEqual([])
  })
})
