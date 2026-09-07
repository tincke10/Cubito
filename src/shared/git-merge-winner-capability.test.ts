import { describe, expect, it } from 'vitest'
import { GIT_MERGE_WINNER_RUNTIME_CAPABILITY, RUNTIME_CAPABILITIES } from './protocol-version'

describe('git merge-winner capability', () => {
  it('is a versioned capability key advertised by the runtime', () => {
    expect(GIT_MERGE_WINNER_RUNTIME_CAPABILITY).toBe('git.merge-winner.v1')
    expect(RUNTIME_CAPABILITIES).toContain(GIT_MERGE_WINNER_RUNTIME_CAPABILITY)
  })
})
