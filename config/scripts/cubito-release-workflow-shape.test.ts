import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

// Ratchet: the release workflow must stay gated, SHA-pinned, least-privilege and
// multi-arch, and must never publish from a dry run.

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const raw = readFileSync(join(REPO_ROOT, '.github/workflows/cubito-release.yml'), 'utf8')

type Step = { uses?: string; run?: string; if?: string; with?: Record<string, unknown> }
type Job = {
  if?: string
  needs?: string | string[]
  permissions?: Record<string, string>
  strategy?: { matrix?: { include?: { runner: string; platform: string }[] } }
  steps?: Step[]
}
type Workflow = {
  on: {
    push?: { tags?: string[] }
    workflow_dispatch?: { inputs?: Record<string, { default?: unknown }> }
  }
  permissions?: Record<string, string>
  jobs: Record<string, Job>
}

const workflow = parse(raw) as Workflow
const allSteps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? [])
const stepsOf = (job: string): string =>
  (workflow.jobs[job]?.steps ?? []).map((s) => s.run ?? '').join('\n')

describe('cubito-release.yml', () => {
  it('triggers on v* tags and a manual dispatch that defaults to a dry run', () => {
    expect(workflow.on.push?.tags).toEqual(['v*'])
    expect(workflow.on.workflow_dispatch?.inputs?.dry_run?.default).toBe(true)
    expect(workflow.on.workflow_dispatch?.inputs).toHaveProperty('version')
  })

  it('pins every third-party action by full commit SHA', () => {
    const uses = allSteps.map((s) => s.uses).filter((u): u is string => Boolean(u))
    expect(uses.length).toBeGreaterThan(0)
    const unpinned = uses.filter((u) => !/@[0-9a-f]{40}$/.test(u))
    expect(unpinned).toEqual([])
  })

  it('defaults the workflow to read-only and grants writes per job', () => {
    expect(workflow.permissions).toEqual({})
    expect(workflow.jobs.build.permissions?.packages).toBe('write')
    expect(workflow.jobs.merge.permissions).toMatchObject({
      packages: 'write',
      'id-token': 'write',
      attestations: 'write'
    })
    expect(workflow.jobs.release.permissions?.contents).toBe('write')
    expect(workflow.jobs.verify.permissions?.contents).not.toBe('write')
    expect(workflow.jobs.build.permissions?.contents).not.toBe('write')
  })

  it('gates the release on a successful cubito-ci run for the commit', () => {
    expect(stepsOf('verify')).toContain('cubito-ci.yml')
    expect(stepsOf('verify')).toContain('head_sha')
    for (const job of ['build', 'merge', 'release']) {
      expect(workflow.jobs[job].needs).toBeDefined()
    }
  })

  it('builds amd64 and arm64 on native runners', () => {
    const include = workflow.jobs.build.strategy?.matrix?.include ?? []
    expect(include.map((i) => [i.runner, i.platform])).toEqual([
      ['ubuntu-24.04', 'linux/amd64'],
      ['ubuntu-24.04-arm', 'linux/arm64']
    ])
  })

  it('stamps the version and revision as build args', () => {
    const build = workflow.jobs.build.steps?.find((s) => s.uses?.includes('build-push-action'))
    const args = String(build?.with?.['build-args'] ?? '')
    expect(args).toContain('CUBITO_VERSION=')
    expect(args).toContain('CUBITO_REVISION=')
  })

  it('never pushes, merges or releases on a dry run', () => {
    const login = workflow.jobs.build.steps?.find((s) => s.uses?.includes('login-action'))
    expect(login?.if).toContain('dry_run')
    expect(workflow.jobs.merge.if).toContain('dry_run')
    expect(workflow.jobs.release.if).toContain('dry_run')
  })

  it('publishes X.Y.Z, X.Y and latest, with the last two only for stable tags', () => {
    const merge = stepsOf('merge')
    expect(merge).toContain('imagetools create')
    expect(raw).toContain('IMAGE: ghcr.io/tincke10/cubito')
    expect(merge).toMatch(/latest/)
    expect(merge).toMatch(/prerelease/i)
  })

  it('attests the pushed manifest and creates a release with generated notes', () => {
    expect(
      workflow.jobs.merge.steps?.some((s) => s.uses?.includes('attest-build-provenance'))
    ).toBe(true)
    expect(stepsOf('release')).toContain('gh release create')
    expect(stepsOf('release')).toContain('--generate-notes')
    expect(stepsOf('release')).toContain('--prerelease')
  })

  it('never interpolates untrusted event data directly into a run script', () => {
    const runs = allSteps.map((s) => s.run ?? '').join('\n')
    expect(runs).not.toMatch(/\$\{\{\s*(inputs|github\.(ref_name|head_ref))/)
  })
})
