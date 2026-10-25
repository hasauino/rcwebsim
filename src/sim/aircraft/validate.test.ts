import { describe, expect, it } from 'vitest'
import { extra300 } from './extra300'
import { pa18 } from './pa18'
import { validateAircraft } from './validate'
import type { AircraftSpec } from './types'

const clone = (spec: AircraftSpec): AircraftSpec => structuredClone(spec)

describe('validateAircraft', () => {
  it('accepts the PA-18', () => {
    expect(validateAircraft(pa18)).toEqual([])
  })

  it('accepts the Extra 300', () => {
    expect(validateAircraft(extra300)).toEqual([])
  })

  it('reports numbers with no recorded provenance', () => {
    const spec = clone(pa18)
    delete spec.provenance.mass
    expect(validateAircraft(spec)).toContain('mass: no provenance recorded')
  })

  it('reports provenance entries that point at nothing', () => {
    const spec = clone(pa18)
    spec.provenance['surfaces.canard'] = { basis: 'estimated' }
    expect(validateAircraft(spec)).toContain('provenance "surfaces.canard" matches no field')
  })

  it('reports physically impossible values', () => {
    const spec = clone(pa18)
    spec.mass = -1
    spec.surfaces[0]!.controls[0]!.chordFraction = 1.2
    const errors = validateAircraft(spec)
    expect(errors).toContain('mass must be positive')
    expect(errors).toContain('surfaces.wing.controls.aileron.chordFraction must be in (0, 1)')
  })

  it('reports a control surface with no throw', () => {
    const spec = clone(pa18)
    delete spec.surfaces[0]!.controls[0]!.throwMm
    expect(validateAircraft(spec)).toContain(
      'surfaces.wing.controls.aileron needs throwMm or throwDeg',
    )
  })

  it('reports a control surface driven by the throttle channel', () => {
    const spec = clone(pa18)
    spec.surfaces[0]!.controls[0]!.channel = 'throttle'
    expect(validateAircraft(spec)).toContain(
      'surfaces.wing.controls.aileron cannot be driven by the throttle',
    )
  })

  it('requires a source for values marked as sourced', () => {
    const spec = clone(pa18)
    spec.provenance.mass = { basis: 'sourced' }
    expect(validateAircraft(spec)).toContain('provenance "mass" is sourced but names no source')
  })
})
