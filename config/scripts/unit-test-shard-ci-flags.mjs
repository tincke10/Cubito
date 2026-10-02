// Why: upstream's engine suite has timing-sensitive tests that flake on shared CI runners; one
// retry keeps a red shard meaningful, and the github-actions reporter lists every test that
// only passed on retry in the job summary so flakes stay visible. Local runs never retry.
export function ciShardFlags(env) {
  if (env.GITHUB_ACTIONS !== 'true') {
    return []
  }
  return ['--retry=1', '--reporter=default', '--reporter=github-actions']
}
