// Single source of truth for files the CI unit shard excludes from
// `vitest run --config config/vitest.config.ts`. Each entry names why: these are
// live-shell / node-pty tests that hang or need real terminal hardware, unsuited
// to a headless CI runner. Kept as a module (not JSON) so entries carry a reason
// and the list stays importable by the agreement guard test.

export const UNIT_TEST_SHARD_EXCLUDES = [
  {
    path: 'src/main/daemon/repro-13767-shell-ready-marker-lost-to-exec.test.ts',
    why: 'reproduces a real shell-ready race; needs a live shell, hangs headless'
  },
  { path: 'src/main/daemon/shell-ready.test.ts', why: 'spawns a real shell to observe readiness' },
  { path: 'src/main/daemon/node-pty-fd-leak.test.ts', why: 'asserts real node-pty fd behavior' },
  {
    path: 'src/main/providers/local-pty-shell-ready-zsh-launch-environment.test.ts',
    why: 'launches a real zsh via node-pty'
  },
  {
    path: 'src/main/providers/__tests__/shell-ready-framework-example.test.ts',
    why: 'example harness for the live-shell framework, not CI-safe'
  },
  {
    path: 'src/main/pty/omp-shell-wrapper.node-pty.test.ts',
    why: 'exercises the real node-pty binding'
  },
  {
    path: 'src/main/shell-startup-feature-channel.test.ts',
    why: 'depends on a live shell startup sequence'
  },
  {
    path: 'src/main/terminal-history-fish-session.node-pty.test.ts',
    why: 'spawns a real fish session via node-pty'
  },
  { path: 'src/main/zsh-scoped-histfile.live-shell.test.ts', why: 'requires a live zsh shell' },
  {
    path: 'src/main/zsh-startup-hook-user-config-equivalence.live-shell.test.ts',
    why: 'requires a live zsh shell'
  },
  {
    path: 'src/main/zsh-wrapper-version-mismatch.live-shell.test.ts',
    why: 'requires a live zsh shell'
  },
  {
    path: 'src/shared/fish-query-reply-child-stdin.node-pty.test.ts',
    why: 'exercises the real node-pty binding'
  },
  {
    path: 'src/shared/pty-reply-echo-shapes.node-pty.test.ts',
    why: 'exercises the real node-pty binding'
  },
  { path: 'src/shared/startup-shell-portability.live-shell.test.ts', why: 'requires a live shell' },
  {
    path: 'src/shared/posix-command-path-lookup.test.ts',
    why: 'depends on the host PATH/shell environment'
  },
  {
    path: 'tests/e2e/cross-version-wire/**',
    why: 'long-running cross-version checkout fixtures, run separately'
  }
]

export function toVitestExcludeFlags() {
  return UNIT_TEST_SHARD_EXCLUDES.map((entry) => `--exclude=${entry.path}`)
}
