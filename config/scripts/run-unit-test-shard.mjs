import { spawnSync } from 'node:child_process'
import { toVitestExcludeFlags } from './unit-test-shard-excludes.mjs'

// Single entry point for the CI unit shard and the local honest gate (`pnpm test:ci-shard`).
// Keeps --exclude flags out of the workflow so the excludes carry a reason (see
// unit-test-shard-excludes.mjs) and stay assertable by unit-test-shard-agreement.test.ts.

// pnpm inserts a literal "--" ahead of args forwarded to a compound (`a && b`) script;
// vitest's CLI then reads --shard=N/M as a positional filter instead of an option and
// silently ignores sharding. Strip it so `pnpm test:ci-shard -- --shard=1/8` shards for real.
const forwardedArguments = process.argv.slice(2).filter((arg) => arg !== '--')

const result = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  [
    'exec',
    'vitest',
    'run',
    '--config',
    'config/vitest.config.ts',
    ...toVitestExcludeFlags(),
    ...forwardedArguments
  ],
  { stdio: 'inherit' }
)

process.exit(result.status ?? 1)
