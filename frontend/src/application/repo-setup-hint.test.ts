import { describe, expect, it, vi } from 'vitest'
import { NO_SETUP_HINT, createSetupHintTracker } from './repo-setup-hint'

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('createSetupHintTracker', () => {
  it('shows no hint before the probe resolves', () => {
    const tracker = createSetupHintTracker({ probe: async () => null, onChange: vi.fn() })
    tracker.ensure('id:r1')
    expect(tracker.hint('id:r1')).toBeNull()
  })

  it('shows the hint and notifies once a repo probes as having no setup', async () => {
    const onChange = vi.fn()
    const tracker = createSetupHintTracker({ probe: async () => null, onChange })
    tracker.ensure('id:r1')
    await flush()
    expect(tracker.hint('id:r1')).toBe(NO_SETUP_HINT)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('shows no hint when the repo has a setup command', async () => {
    const tracker = createSetupHintTracker({
      probe: async () => 'pnpm install',
      onChange: vi.fn()
    })
    tracker.ensure('id:r1')
    await flush()
    expect(tracker.hint('id:r1')).toBeNull()
  })

  it('probes each selector once until reset', async () => {
    const probe = vi.fn(async () => null)
    const tracker = createSetupHintTracker({ probe, onChange: vi.fn() })
    tracker.ensure('id:r1')
    tracker.ensure('id:r1')
    await flush()
    tracker.ensure('id:r1')
    expect(probe).toHaveBeenCalledTimes(1)
    tracker.reset()
    expect(tracker.hint('id:r1')).toBeNull()
    tracker.ensure('id:r1')
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('ignores a null selector and swallows probe failures (no hint, no throw)', async () => {
    const onChange = vi.fn()
    const tracker = createSetupHintTracker({
      probe: async () => {
        throw new Error('offline')
      },
      onChange
    })
    tracker.ensure(null)
    tracker.ensure('id:r1')
    await flush()
    expect(tracker.hint('id:r1')).toBeNull()
    expect(tracker.hint(null)).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})
