import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { UNIT_TEST_SHARD_EXCLUDES } from './unit-test-shard-excludes.mjs'
import { ciShardFlags } from './unit-test-shard-ci-flags.mjs'

// Ratchet: the workflow must forward shard args to a single-source script instead of
// inlining --exclude flags, so the excludes list can carry a reason and be asserted alive.

const REPO_ROOT = join(import.meta.dirname, '..', '..')

function testShardRun(): string {
  const workflow = parse(
    readFileSync(join(REPO_ROOT, '.github/workflows/unit-tests.yml'), 'utf8')
  ) as { jobs: Record<string, { steps?: { name?: string; run?: string }[] }> }
  const steps = workflow.jobs.test?.steps ?? []
  const step = steps.find((s) => s.name === 'Test shard')
  expect(step).toBeDefined()
  return step?.run ?? ''
}

describe('unit-tests.yml <-> test:ci-shard agreement', () => {
  it('runs pnpm test:ci-shard with no inline vitest excludes', () => {
    const run = testShardRun()
    expect(run).toContain('pnpm test:ci-shard')
    expect(run).not.toContain('--exclude')
    expect(run).not.toMatch(/\bvitest\b/)
  })

  it('still forwards the shard flag', () => {
    const run = testShardRun()
    expect(run).toContain('--shard=${{ matrix.shard }}/${{ matrix.shard_total }}')
  })

  it('test:ci-shard invokes ensure-native-runtime and the shard runner', () => {
    const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    const script = packageJson.scripts['test:ci-shard']
    expect(script).toContain('ensure-native-runtime.mjs --runtime=node')
    expect(script).toContain('run-unit-test-shard.mjs')
  })

  it('every exclude entry resolves on disk and carries a reason', () => {
    for (const entry of UNIT_TEST_SHARD_EXCLUDES) {
      const literalPrefix = entry.path.split('*')[0].replace(/\/$/, '')
      expect(existsSync(join(REPO_ROOT, literalPrefix))).toBe(true)
      expect(entry.why.length).toBeGreaterThan(0)
    }
  })
})

describe('CI shard retry policy', () => {
  it('retries once and reports flaky tests to the job summary on GitHub Actions', () => {
    expect(ciShardFlags({ GITHUB_ACTIONS: 'true' })).toEqual([
      '--retry=1',
      '--reporter=default',
      '--reporter=github-actions'
    ])
  })

  it('never retries locally, so `pnpm test:ci-shard` stays an honest gate', () => {
    expect(ciShardFlags({})).toEqual([])
  })

  it('the shard runner applies the CI flags', () => {
    const runner = readFileSync(join(REPO_ROOT, 'config/scripts/run-unit-test-shard.mjs'), 'utf8')
    expect(runner).toContain('ciShardFlags(process.env)')
  })
})
