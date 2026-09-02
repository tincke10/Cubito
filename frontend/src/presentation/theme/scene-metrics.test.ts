import { describe, expect, it } from 'vitest'
import {
  CAMERA_DISTANCE,
  ELEVATION,
  FIT_MIN_RADIUS,
  FLOW_PERIOD_SECONDS,
  FOCUS_RADIUS,
  MAX_RADIUS,
  MIN_RADIUS,
  NODE_HEIGHT,
  ORBIT_DAMPING,
  NODE_SIZE,
  REFERENCE_HALF_HEIGHT,
  ROOT_MIN_ELEVATION,
  SHADOW_Y
} from './scene-metrics'

describe('scene-metrics', () => {
  it('pins the elevation ladder to the design table', () => {
    expect(ELEVATION['waiting-input']).toBe(0.6)
    expect(ELEVATION.working).toBe(0.52)
    expect(ELEVATION.dirty).toBe(0.44)
    expect(ELEVATION.unread).toBe(0.44)
    expect(ELEVATION.spawning).toBe(0.3)
    expect(ELEVATION.idle).toBe(0.2)
    expect(ELEVATION.archived).toBe(0)
  })

  it('pins the node body constants', () => {
    expect(NODE_SIZE).toBe(1)
    expect(NODE_HEIGHT).toBeCloseTo(0.9127, 10)
  })

  it('pins the root elevation floor', () => {
    expect(ROOT_MIN_ELEVATION).toBe(0.48)
  })

  it('pins the shadow ground offset', () => {
    expect(SHADOW_Y).toBe(0.005)
  })

  it('pins the flow animation period', () => {
    expect(FLOW_PERIOD_SECONDS).toBe(1.2)
  })

  it('exposes camera constants', () => {
    expect(CAMERA_DISTANCE).toBe(200)
    expect(REFERENCE_HALF_HEIGHT).toBe(10)
    expect(FOCUS_RADIUS).toBe(6)
    expect(FIT_MIN_RADIUS).toBe(6)
    expect(MIN_RADIUS).toBe(3)
    expect(MAX_RADIUS).toBe(60)
    expect(ORBIT_DAMPING).toBe(0.08)
  })
})
