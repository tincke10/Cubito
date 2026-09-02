import { PULSE_MAX_OPACITY, PULSE_MIN_OPACITY, PULSE_PERIOD_SECONDS } from './scene-metrics'

// CSS `ease-in-out` timing function == cubic-bezier(0.42, 0, 0.58, 1).
const EASE_IN_OUT_P1X = 0.42
const EASE_IN_OUT_P1Y = 0
const EASE_IN_OUT_P2X = 0.58
const EASE_IN_OUT_P2Y = 1

const SOLVE_ITERATIONS = 12
const SOLVE_EPSILON = 1e-9

const bezierComponent = (t: number, p1: number, p2: number): number => {
  const inverse = 1 - t
  return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t
}

const bezierComponentSlope = (t: number, p1: number, p2: number): number => {
  const inverse = 1 - t
  return 3 * inverse * inverse * p1 + 6 * inverse * t * (p2 - p1) + 3 * t * t * (1 - p2)
}

/** Solves x(t) = x via Newton-Raphson with a bisection fallback for near-zero slopes. */
const solveBezierTime = (x: number, p1x: number, p2x: number): number => {
  let t = x
  for (let i = 0; i < SOLVE_ITERATIONS; i += 1) {
    const delta = bezierComponent(t, p1x, p2x) - x
    if (Math.abs(delta) < SOLVE_EPSILON) return t
    const slope = bezierComponentSlope(t, p1x, p2x)
    if (Math.abs(slope) < SOLVE_EPSILON) break
    t -= delta / slope
  }
  let low = 0
  let high = 1
  t = x
  for (let i = 0; i < SOLVE_ITERATIONS && high - low > SOLVE_EPSILON; i += 1) {
    const current = bezierComponent(t, p1x, p2x)
    if (current < x) low = t
    else high = t
    t = (low + high) / 2
  }
  return t
}

const easeInOut = (x: number): number => {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const t = solveBezierTime(x, EASE_IN_OUT_P1X, EASE_IN_OUT_P2X)
  return bezierComponent(t, EASE_IN_OUT_P1Y, EASE_IN_OUT_P2Y)
}

/** CSS `pulse 1.6s ease-in-out infinite` (1 <-> 0.4), driven by the shared scene clock. */
export const pulseOpacity = (
  elapsedSeconds: number,
  options?: { reducedMotion: boolean }
): number => {
  if (options?.reducedMotion) return PULSE_MAX_OPACITY

  const halfPeriod = PULSE_PERIOD_SECONDS / 2
  const range = PULSE_MAX_OPACITY - PULSE_MIN_OPACITY
  const phase = ((elapsedSeconds % PULSE_PERIOD_SECONDS) + PULSE_PERIOD_SECONDS) % PULSE_PERIOD_SECONDS

  return phase <= halfPeriod
    ? PULSE_MAX_OPACITY - range * easeInOut(phase / halfPeriod)
    : PULSE_MIN_OPACITY + range * easeInOut((phase - halfPeriod) / halfPeriod)
}
