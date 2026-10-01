import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

// Ratchet: the root compose stack must build and serve Cubito on an isolated
// data/worktree root — never the real Orca profile or workspace dir.

const REPO_ROOT = join(import.meta.dirname, '..', '..')

type ComposeFile = {
  services: Record<
    string,
    {
      build?: string
      ports?: string[]
      environment?: Record<string, string | null>
      volumes?: string[]
      stdin_open?: boolean
      tty?: boolean
    }
  >
  volumes?: Record<string, unknown>
}

describe('compose.yaml', () => {
  const compose = parse(readFileSync(join(REPO_ROOT, 'compose.yaml'), 'utf8')) as ComposeFile
  const cubito = compose.services.cubito

  it('builds the cubito service from the repo root', () => {
    expect(cubito).toBeDefined()
    expect(cubito.build).toBe('.')
  })

  it('publishes only the orcad port — the frontend is served through it', () => {
    // Why: a bare '6799:6799' publishes on every host interface, exposing an agent-running daemon to the LAN.
    expect(cubito.ports).toEqual(['127.0.0.1:6799:6799'])
  })

  it('pins the pairing address to the one published port', () => {
    expect(cubito.environment?.CUBITO_PAIRING_ADDRESS).toBe('127.0.0.1:6799')
  })

  it('mounts the three named volumes', () => {
    expect(cubito.volumes).toEqual(
      expect.arrayContaining([
        'cubito-data:/data',
        'cubito-workspaces:/workspaces',
        'cubito-repos:/repos'
      ])
    )
    expect(Object.keys(compose.volumes ?? {})).toEqual(
      expect.arrayContaining(['cubito-data', 'cubito-workspaces', 'cubito-repos'])
    )
  })

  it('isolates the data dir and worktree root from the real Orca profile', () => {
    const env = cubito.environment ?? {}
    expect(env.ORCA_USER_DATA).toBe('/data')
    expect(env.CUBITO_WORKTREE_ROOT).toBe('/workspaces')
    expect(env.ORCA_USER_DATA).not.toMatch(/\.orca/)
    expect(env.CUBITO_WORKTREE_ROOT).not.toMatch(/orca\/workspaces/)
  })

  it('keeps the terminal interactive for docker compose exec', () => {
    expect(cubito.stdin_open).toBe(true)
    expect(cubito.tty).toBe(true)
  })

  it('passes the Claude OAuth token through from the host without ever storing a value', () => {
    const env = cubito.environment ?? {}
    expect(Object.hasOwn(env, 'CLAUDE_CODE_OAUTH_TOKEN')).toBe(true)
    // Why null: a valueless key is read from the host shell and left unset when absent.
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeNull()
  })

  it('passes the credential sealing key through from the host without storing a value', () => {
    const env = cubito.environment ?? {}
    expect(Object.hasOwn(env, 'CUBITO_SECRET_KEY')).toBe(true)
    // Why null: the key must come from the host shell, never from a file in the repo.
    expect(env.CUBITO_SECRET_KEY).toBeNull()
  })

  it('passes the agent bypass opt-in through from the host without storing a value', () => {
    const env = cubito.environment ?? {}
    expect(Object.hasOwn(env, 'CUBITO_AGENT_BYPASS')).toBe(true)
    expect(env.CUBITO_AGENT_BYPASS).toBeNull()
  })
})

describe('git host CLIs and tokens', () => {
  const compose = parse(readFileSync(join(REPO_ROOT, 'compose.yaml'), 'utf8')) as ComposeFile
  const env = compose.services.cubito.environment ?? {}
  const dockerfile = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8')
  const runtimeStage = dockerfile.slice(dockerfile.indexOf('FROM node:24-bookworm-slim'))
  const entrypoint = readFileSync(join(REPO_ROOT, 'config/docker/cubito/entrypoint.sh'), 'utf8')
  const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8')

  it('passes GH_TOKEN and GITLAB_TOKEN through from the host without storing a value', () => {
    for (const key of ['GH_TOKEN', 'GITLAB_TOKEN']) {
      expect(Object.hasOwn(env, key)).toBe(true)
      expect(env[key]).toBeNull()
    }
  })

  it('installs gh and glab in the runtime stage from pinned, checksum-verified releases', () => {
    expect(runtimeStage).toMatch(/ARG GH_VERSION=\d+\.\d+\.\d+/)
    expect(runtimeStage).toMatch(/ARG GLAB_VERSION=\d+\.\d+\.\d+/)
    expect(runtimeStage.match(/GH_SHA256_(AMD64|ARM64)=[0-9a-f]{64}/g)).toHaveLength(2)
    expect(runtimeStage.match(/GLAB_SHA256_(AMD64|ARM64)=[0-9a-f]{64}/g)).toHaveLength(2)
    expect(runtimeStage).toContain('sha256sum -c -')
    expect(runtimeStage).toContain('/usr/local/bin/gh')
    expect(runtimeStage).toContain('/usr/local/bin/glab')
  })

  it('wires gh as the github.com git credential helper as node when GH_TOKEN is set', () => {
    expect(entrypoint).toMatch(/if \[ -n "\$\{GH_TOKEN:-\}" \]/)
    expect(entrypoint).toContain("'!gh auth git-credential'")
    expect(entrypoint).toContain('https://github.com')
    expect(entrypoint.indexOf('!gh auth git-credential')).toBeLessThan(
      entrypoint.indexOf('exec setpriv')
    )
  })

  it('wires glab for gitlab.com when GITLAB_TOKEN is set', () => {
    expect(entrypoint).toMatch(/if \[ -n "\$\{GITLAB_TOKEN:-\}" \]/)
    expect(entrypoint).toContain("'!glab auth git-credential'")
  })

  it('never echoes a token', () => {
    expect(entrypoint).not.toMatch(/echo[^\n]*\$\{?(GH_TOKEN|GITLAB_TOKEN)/)
  })

  it('documents the token passthrough in the Docker README', () => {
    expect(readme).toContain('export GH_TOKEN=')
    expect(readme).toContain('export GITLAB_TOKEN=')
  })
})

describe('egress posture', () => {
  const compose = parse(readFileSync(join(REPO_ROOT, 'compose.yaml'), 'utf8')) as ComposeFile
  const env = compose.services.cubito.environment ?? {}
  const dockerfile = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8')
  const runtimeStage = dockerfile.slice(dockerfile.indexOf('FROM node:24-bookworm-slim'))
  const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8')

  // Why: Claude Code cannot usefully self-update inside an immutable image.
  it('disables the Claude Code auto-updater in the runtime image', () => {
    expect(runtimeStage).toMatch(/^ENV DISABLE_AUTOUPDATER=1$/m)
  })

  it('passes the nonessential-traffic switch through from the host without storing a value', () => {
    expect(Object.hasOwn(env, 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC')).toBe(true)
    expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBeNull()
  })

  it('documents the expected network egress in a Privacy / network README section', () => {
    expect(readme).toContain('## Privacy / network')
    const section = readme.slice(readme.indexOf('## Privacy / network'))
    for (const term of ['Anthropic', 'telemetry', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC']) {
      expect(section).toContain(term)
    }
  })
})

describe('glab wrapper', () => {
  const dockerfile = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8')
  const runtimeStage = dockerfile.slice(dockerfile.indexOf('FROM node:24-bookworm-slim'))
  const wrapper = join(REPO_ROOT, 'config/docker/cubito/glab-wrapper.sh')

  // Why: orcad runs `glab auth status` on [d]; unconfigured, the real binary calls gitlab.com.
  it('installs the real glab under a non-PATH name and the wrapper as /usr/local/bin/glab', () => {
    expect(runtimeStage).toContain('/usr/local/libexec/glab-real')
    expect(runtimeStage).not.toContain('install -m 755 /tmp/glab /usr/local/bin/glab')
    expect(runtimeStage).toMatch(/glab-wrapper\.sh \/usr\/local\/bin\/glab/)
  })

  function run(args: string[], env: Record<string, string>, withConfig: boolean) {
    const dir = mkdtempSync(join(tmpdir(), 'glab-wrapper-'))
    const real = join(dir, 'glab-real')
    writeFileSync(real, '#!/bin/sh\necho "REAL $*"\n')
    chmodSync(real, 0o755)
    const home = join(dir, 'home')
    mkdirSync(join(home, '.config', 'glab-cli'), { recursive: true })
    if (withConfig) {
      writeFileSync(
        join(home, '.config', 'glab-cli', 'config.yml'),
        'hosts:\n  gitlab.example.com:\n    token: abc\n'
      )
    }
    return spawnSync('sh', [wrapper, ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', HOME: home, GLAB_REAL_BIN: real, ...env }
    })
  }

  it('answers auth status as not logged in, offline, when nothing is configured', () => {
    const r = run(['auth', 'status'], {}, false)
    expect(r.status).not.toBe(0)
    expect(r.stdout).not.toContain('REAL')
    expect(r.stderr).toMatch(/not logged in/i)
    expect(r.stderr.split('\n').length).toBeLessThan(4)
  })

  it('emits nothing the known-hosts parser would read as a host', () => {
    const r = run(['auth', 'status'], {}, false)
    expect(r.stderr).not.toMatch(/logged in to /i)
    for (const line of r.stderr.split('\n').filter(Boolean)) {
      expect(line).toMatch(/\s/)
    }
  })

  it.each(['GITLAB_TOKEN', 'GITLAB_ACCESS_TOKEN', 'GLAB_TOKEN'])(
    'execs the real glab with %s',
    (k) => {
      const r = run(['auth', 'status'], { [k]: 'x' }, false)
      expect(r.stdout).toContain('REAL auth status')
    }
  )

  it('execs the real glab when a config file lists hosts', () => {
    expect(run(['auth', 'status'], {}, true).stdout).toContain('REAL auth status')
  })

  it('passes every other command through untouched', () => {
    expect(run(['mr', 'list'], {}, false).stdout).toContain('REAL mr list')
    expect(run(['api', 'user'], {}, false).stdout).toContain('REAL api user')
  })
})

describe('Dockerfile', () => {
  const dockerfile = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8')
  const fromLines = dockerfile.match(/^FROM .+$/gm) ?? []
  const runtimeStageIndex = dockerfile.indexOf('FROM node:24-bookworm-slim')
  const runtimeStage = dockerfile.slice(runtimeStageIndex)
  const REQUIRED_LINES = [
    'FROM node:24-bookworm AS builder',
    'FROM node:24-bookworm-slim',
    'ELECTRON_SKIP_BINARY_DOWNLOAD',
    'pnpm install --ignore-scripts',
    'ensure-native-runtime.mjs --runtime=node',
    'build:cli',
    'build:orcad',
    'pnpm --dir frontend run build',
    'cubito-stage-web-client.mjs',
    'cubito-stage-runtime-deps.mjs',
    'COPY --from=builder',
    'EXPOSE 6799',
    '@anthropic-ai/claude-code'
  ]

  it('carries every required build step', () => {
    const missing = REQUIRED_LINES.filter((line) => !dockerfile.includes(line))
    expect(missing).toEqual([])
  })

  it('is a two-stage build: a builder and a slim runtime', () => {
    expect(fromLines).toEqual(['FROM node:24-bookworm AS builder', 'FROM node:24-bookworm-slim'])
    expect(runtimeStageIndex).toBeGreaterThan(-1)
  })

  it('smoke-tests the staged native closure and the CLI entrypoint at build time', () => {
    expect(dockerfile).toContain("require('/stage/node_modules/node-pty')")
    expect(dockerfile).toContain("require('/stage/node_modules/@parcel/watcher')")
    expect(dockerfile).toMatch(
      /NODE_PATH=\/stage\/node_modules node -e "require\('\/app\/out\/cli\/index\.js'\)"/
    )
  })

  // Why: out/cli is unbundled tsc output, so every package it imports must be staged.
  it('stages the orcad externals and every package the CLI imports at runtime', () => {
    for (const root of [
      'node-pty',
      '@parcel/watcher',
      'zod',
      'ws',
      'tweetnacl',
      'yaml',
      'jsonc-parser'
    ]) {
      expect(dockerfile).toContain(`--root ${root} `)
    }
  })

  it('does not publish or reference the dropped frontend port', () => {
    expect(dockerfile).not.toContain('5180')
  })

  it('stages the runtime closure via script, not a hand-picked cp -RL list', () => {
    expect(dockerfile).not.toContain('cp -RL')
    expect(dockerfile).toContain('cubito-stage-runtime-deps.mjs')
  })

  it('keeps the runtime stage free of the Chromium/GTK build toolchain', () => {
    expect(runtimeStage).not.toContain('build-essential')
    expect(runtimeStage).not.toContain('libgtk-3-0')
  })

  // Why: the installed agent status hooks POST each event to orcad with curl.
  it('ships curl in the runtime stage so agent status hooks can reach orcad', () => {
    expect(runtimeStage).toMatch(/apt-get install[^&]*\bcurl\b/)
  })

  // Why: worktree setup commands (pnpm install/yarn) run as the node user and need the shims.
  it('enables corepack in the runtime stage so pnpm/yarn setup commands resolve', () => {
    expect(runtimeStage).toMatch(/RUN corepack enable/)
  })

  // Why: the terminal wrapper sources /etc/profile, which on Debian resets PATH and drops the
  // shim dir cubito-start prepends; /usr/local/bin survives that reset.
  it('installs the orca CLI on the default PATH for interactive terminals', () => {
    expect(runtimeStage).toMatch(/\/usr\/local\/bin\/orca/)
    expect(runtimeStage).toContain('/app/out/cli/index.js')
  })

  it('points the orca CLI at the data volume for docker compose exec shells', () => {
    expect(runtimeStage).toContain(
      'ORCA_USER_DATA_PATH="${ORCA_USER_DATA_PATH:-${ORCA_USER_DATA:-/data}}"'
    )
  })
})

describe('.dockerignore', () => {
  const ignore = readFileSync(join(REPO_ROOT, '.dockerignore'), 'utf8')

  it('excludes node_modules and .git from the build context', () => {
    expect(ignore).toContain('node_modules')
    expect(ignore).toContain('.git')
  })
})

describe('container user', () => {
  const entrypoint = readFileSync(join(REPO_ROOT, 'config/docker/cubito/entrypoint.sh'), 'utf8')
  const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8')

  // Why: agents launch with bypass permissions, and Claude Code refuses that flag as root.
  it('starts orcad as the unprivileged node user, never as root', () => {
    expect(entrypoint).toMatch(
      /exec setpriv --reuid=node --regid=node --init-groups .*node config\/scripts\/cubito-start\.mjs/
    )
    expect(entrypoint).toContain('HOME=/home/node')
  })

  it('hands every volume to the node user before dropping privileges', () => {
    expect(entrypoint).toMatch(/\/data \/workspaces \/repos .*chown -h node:node/)
    expect(entrypoint.indexOf('chown')).toBeLessThan(entrypoint.indexOf('exec setpriv'))
  })

  // Why: without seeding, a spawned Claude blocks on onboarding and the bypass warning (default "exit").
  it('seeds the Claude config as node before dropping into cubito-start', () => {
    expect(entrypoint).toMatch(
      /setpriv --reuid=node --regid=node --init-groups env HOME=\/home\/node node config\/scripts\/cubito-claude-config-seed\.mjs/
    )
    expect(entrypoint.indexOf('cubito-claude-config-seed.mjs')).toBeLessThan(
      entrypoint.indexOf('exec setpriv')
    )
    expect(entrypoint.indexOf('chown')).toBeLessThan(
      entrypoint.indexOf('cubito-claude-config-seed')
    )
  })

  it('maps CUBITO_AGENT_BYPASS=accept to yolo plus --accept-bypass, anything else to manual', () => {
    expect(entrypoint).toMatch(/"\$\{CUBITO_AGENT_BYPASS:-\}" = "accept"/)
    expect(entrypoint).toMatch(/agent_mode=yolo/)
    expect(entrypoint).toMatch(/agent_mode=manual/)
    expect(entrypoint).toContain('--accept-bypass')
  })

  it('hands the chosen mode to cubito-start on the exec line', () => {
    expect(entrypoint).toMatch(
      /exec setpriv .*cubito-start\.mjs .*--agent-permissions "?\$agent_mode"?/
    )
  })

  it('documents sealing credentials at rest with CUBITO_SECRET_KEY in the Docker README', () => {
    expect(readme).toContain('export CUBITO_SECRET_KEY=')
    expect(readme).toContain('openssl rand -base64 32')
  })

  it('documents the bypass opt-in in the Docker README', () => {
    expect(readme).toContain('export CUBITO_AGENT_BYPASS=accept')
  })

  it('documents exec commands as the node user so logins and clones land where agents run', () => {
    expect(readme).not.toMatch(/docker compose exec cubito /)
    expect(readme).toContain('docker compose exec -u node cubito')
  })
})

describe('agent git identity', () => {
  const compose = parse(readFileSync(join(REPO_ROOT, 'compose.yaml'), 'utf8')) as ComposeFile
  const env = compose.services.cubito.environment ?? {}
  const entrypoint = readFileSync(join(REPO_ROOT, 'config/docker/cubito/entrypoint.sh'), 'utf8')
  const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8')

  it('passes the commit identity through from the host without storing a value', () => {
    expect(env.CUBITO_GIT_NAME).toBeNull()
    expect(env.CUBITO_GIT_EMAIL).toBeNull()
    expect(Object.hasOwn(env, 'CUBITO_GIT_NAME')).toBe(true)
    expect(Object.hasOwn(env, 'CUBITO_GIT_EMAIL')).toBe(true)
  })

  it("writes the identity into the node user's global git config before orcad starts", () => {
    expect(entrypoint).toMatch(
      /setpriv --reuid=node .*git config --global user\.name "\$CUBITO_GIT_NAME"/
    )
    expect(entrypoint).toMatch(
      /setpriv --reuid=node .*git config --global user\.email "\$CUBITO_GIT_EMAIL"/
    )
    expect(entrypoint.indexOf('user.name')).toBeLessThan(entrypoint.indexOf('exec setpriv'))
  })

  it('warns at startup when no identity is given, instead of failing silently at commit time', () => {
    expect(entrypoint).toMatch(/CUBITO_GIT_NAME and CUBITO_GIT_EMAIL.*>&2/)
  })

  it('documents taking the identity from the host git config', () => {
    expect(readme).toContain('export CUBITO_GIT_NAME="$(git config user.name)"')
    expect(readme).toContain('export CUBITO_GIT_EMAIL="$(git config user.email)"')
  })
})
