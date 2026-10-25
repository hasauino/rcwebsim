import { describe, expect, it } from 'vitest'
import { orbitReach, type Box } from './orbit'

const room: Box = { min: [-3, 0, -3.25], max: [3, 2.6, 3.25] }

describe('orbitReach', () => {
  it('reaches the nearest wall, short of it by the margin', () => {
    expect(orbitReach([0, 1, 0], [1, 0, 0], room, 0.2)).toBeCloseTo(2.8)
    expect(orbitReach([0, 1, 0], [0, 0, -1], room, 0.2)).toBeCloseTo(3.05)
  })

  it('stops under the ceiling when looking down from high', () => {
    const up = Math.SQRT1_2
    // 1.6 m of headroom less the margin, along a 45° ray.
    expect(orbitReach([0, 1, 0], [up, up, 0], room, 0.2)).toBeCloseTo(1.4 / up)
  })

  it('takes whichever wall a diagonal meets first', () => {
    const d = 1 / Math.hypot(1, 2)
    // x hits 2.8 at t = 2.8 / d; z hits 3.05 at t = 3.05 / (2d), sooner.
    expect(orbitReach([0, 1, 0], [d, 0, 2 * d], room, 0.2)).toBeCloseTo(3.05 / (2 * d))
  })

  it('never goes negative when the target is already within the margin', () => {
    expect(orbitReach([2.9, 1, 0], [1, 0, 0], room, 0.2)).toBe(0)
  })
})
