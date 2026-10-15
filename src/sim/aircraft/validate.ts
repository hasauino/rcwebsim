import type { AircraftSpec } from './types'

type Leaf = { path: string; value: number }

/** Numeric leaves keyed by dotted path. Named array items use their name. */
function numericLeaves(value: unknown, path: string, out: Leaf[]): Leaf[] {
  if (typeof value === 'number') {
    out.push({ path, value })
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => {
      const named = item && typeof item === 'object' && 'name' in item
      numericLeaves(item, join(path, named ? String(item.name) : String(i)), out)
    })
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) numericLeaves(child, join(path, key), out)
  }
  return out
}

const join = (a: string, b: string) => (a ? `${a}.${b}` : b)
const covers = (key: string, path: string) => path === key || path.startsWith(`${key}.`)

/** Returns human-readable problems; an empty list means the spec is usable. */
export function validateAircraft(spec: AircraftSpec): string[] {
  const errors: string[] = []
  const { provenance, ...data } = spec
  const leaves = numericLeaves(data, '', [])
  const keys = Object.keys(provenance)

  for (const leaf of leaves) {
    if (!keys.some((k) => covers(k, leaf.path))) errors.push(`${leaf.path}: no provenance recorded`)
  }
  for (const key of keys) {
    if (!leaves.some((leaf) => covers(key, leaf.path)))
      errors.push(`provenance "${key}" matches no field`)
    const entry = provenance[key]!
    if (entry.basis === 'sourced' && !entry.source)
      errors.push(`provenance "${key}" is sourced but names no source`)
  }

  const positive = (path: string, v: number) => {
    if (!(v > 0)) errors.push(`${path} must be positive`)
  }
  positive('mass', spec.mass)
  spec.inertia.forEach((v, i) => positive(`inertia.${i}`, v))
  positive('crashSpeed', spec.crashSpeed)

  const surfaceNames = new Set(spec.surfaces.map((s) => s.name))
  for (const s of spec.surfaces) {
    const p = `surfaces.${s.name}`
    positive(`${p}.semiSpan`, s.semiSpan)
    positive(`${p}.rootChord`, s.rootChord)
    positive(`${p}.tipChord`, s.tipChord)
    if (!Number.isInteger(s.strips) || s.strips < 1)
      errors.push(`${p}.strips must be an integer >= 1`)
    if (s.downwashFrom && !surfaceNames.has(s.downwashFrom))
      errors.push(`${p}.downwashFrom names unknown surface "${s.downwashFrom}"`)
    for (const c of s.controls) {
      const cp = `${p}.controls.${c.name}`
      if (!(c.chordFraction > 0 && c.chordFraction < 1))
        errors.push(`${cp}.chordFraction must be in (0, 1)`)
      if (!(c.spanStart >= 0 && c.spanEnd <= 1 && c.spanStart < c.spanEnd))
        errors.push(`${cp} span range must satisfy 0 <= start < end <= 1`)
      if (c.throwMm === undefined && c.throwDeg === undefined)
        errors.push(`${cp} needs throwMm or throwDeg`)
      if (c.channel === 'throttle') errors.push(`${cp} cannot be driven by the throttle`)
    }
  }

  for (const w of spec.wheels) {
    const p = `wheels.${w.name}`
    positive(`${p}.radius`, w.radius)
    positive(`${p}.travel`, w.travel)
    positive(`${p}.springRate`, w.springRate)
  }

  positive('propeller.diameter', spec.propeller.diameter)
  positive('propeller.inertia', spec.propeller.inertia)
  if (spec.propeller.blades < 2) errors.push('propeller.blades must be >= 2')
  positive('motor.kv', spec.motor.kv)
  positive('motor.resistance', spec.motor.resistance)
  if (!Number.isInteger(spec.battery.cells) || spec.battery.cells < 1)
    errors.push('battery.cells must be an integer >= 1')
  positive('battery.capacityMah', spec.battery.capacityMah)

  return errors
}
