import { describe, expect, it } from 'vitest'
import { inertActivity } from './node-activity'

describe('inertActivity', () => {
  it('produces the fully-inert default with no field omitted', () => {
    expect(inertActivity()).toEqual({
      agentStatus: 'idle',
      isUnread: false,
      isArchived: false,
      lastActivityAt: null,
      diff: null,
      spawn: null
    })
  })
})
