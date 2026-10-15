import { describe, expect, it } from 'vitest'
import { pa18 } from './aircraft/pa18'
import { balance, meanChord, neutralPoint } from './balance'

describe('balance', () => {
  it("puts the neutral point behind the manual's CG with a trainer-like static margin", () => {
    const np = neutralPoint(pa18)
    const margin = (np - pa18.centerOfGravity[2]) / meanChord(pa18)
    // Stable at the manual's CG, but not absurdly nose heavy: light aircraft
    // fly with a static margin of about 5-15% MAC (Raymer, Aircraft Design).
    expect(margin).toBeGreaterThan(0.05)
    expect(margin).toBeLessThan(0.15)
  })

  it('judges a CG against the manual range and the neutral point', () => {
    const [front, back] = pa18.cgRange
    const np = neutralPoint(pa18)
    expect(balance(pa18, (front + back) / 2).verdict).toBe('centered')
    expect(balance(pa18, front).verdict).toBe('centered')
    expect(balance(pa18, front - 0.01).verdict).toBe('noseHeavy')
    expect(balance(pa18, back + 0.005).verdict).toBe('tailHeavy')
    expect(balance(pa18, np + 0.001).verdict).toBe('unstable')
  })

  it('reports the static margin as a fraction of the mean chord', () => {
    const np = neutralPoint(pa18)
    const b = balance(pa18, np - 0.1 * meanChord(pa18))
    expect(b.neutralPoint).toBeCloseTo(np, 6)
    expect(b.staticMargin).toBeCloseTo(0.1, 6)
  })
})
