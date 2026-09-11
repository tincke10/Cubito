const MIN_NODE_MAJOR = 24
const MIN_PNPM_MAJOR = 10

/** Parses a leading integer off a version string; `null` when none is found. */
function leadingMajor(value) {
  const match = /^v?(\d+)/.exec(value ?? '')
  return match ? Number(match[1]) : null
}

/** Node major floor — matches `package.json`'s `engines.node`. */
export function checkNodeMajor(version) {
  const major = leadingMajor(version)
  const ok = major !== null && major >= MIN_NODE_MAJOR
  return {
    ok,
    found: version ?? 'not found',
    needed: `Node ${MIN_NODE_MAJOR}+`,
    fix: ok ? '' : `Install Node ${MIN_NODE_MAJOR}+ (e.g. via nvm or fnm) and re-run.`
  }
}

/** pnpm major floor — matches `package.json`'s `packageManager`. */
export function checkPnpmVersion(out) {
  const major = leadingMajor(out)
  const ok = major !== null && major >= MIN_PNPM_MAJOR
  return {
    ok,
    found: out ? out.trim() : 'not found',
    needed: `pnpm ${MIN_PNPM_MAJOR}+`,
    fix: ok ? '' : 'Install pnpm: `corepack enable && corepack prepare pnpm@10.24.0 --activate`.'
  }
}

/** git presence only — no version floor is documented for it. */
export function checkGit(out) {
  const ok = Boolean(out && out.trim().length > 0)
  return {
    ok,
    found: ok ? out.trim() : 'not found',
    needed: 'git',
    fix: ok ? '' : 'Install git for your platform (e.g. `xcode-select --install` on macOS).'
  }
}

/** Skipped off darwin — `node-gyp rebuild` (node-pty) only needs the toolchain there. */
export function checkXcodeCommandLineTools({ platform, probe }) {
  if (platform !== 'darwin') {
    return { ok: true, found: 'n/a (not darwin)', needed: 'n/a', fix: '' }
  }
  const ok = Boolean(probe && probe.trim().length > 0)
  return {
    ok,
    found: ok ? probe.trim() : 'not found',
    needed: 'Xcode Command Line Tools',
    fix: ok ? '' : 'Install with `xcode-select --install`.'
  }
}

/** Aggregates every check over injected probe results into an actionable failure list. */
export function collectPreflightFailures(probes) {
  const checks = [
    { tool: 'node', result: checkNodeMajor(probes.nodeVersion) },
    { tool: 'pnpm', result: checkPnpmVersion(probes.pnpmVersionOutput) },
    { tool: 'git', result: checkGit(probes.gitVersionOutput) },
    {
      tool: 'xcode-command-line-tools',
      result: checkXcodeCommandLineTools({
        platform: probes.platform,
        probe: probes.xcodeSelectProbe
      })
    }
  ]
  const failures = checks
    .filter(({ result }) => !result.ok)
    .map(({ tool, result }) => ({
      tool,
      found: result.found,
      needed: result.needed,
      fix: result.fix
    }))
  return { ok: failures.length === 0, failures }
}
