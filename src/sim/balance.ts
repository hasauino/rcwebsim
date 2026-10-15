import { Vector3 } from 'three'
import type { AircraftSpec } from './aircraft/types'
import { Aerodynamics } from './aero'
import { airDensity } from './atmosphere'
import { Propulsion } from './propulsion'

const DEG = Math.PI / 180

/** Where a CG sits relative to the manual's range and the neutral point. */
export type BalanceVerdict = 'noseHeavy' | 'centered' | 'tailHeavy' | 'unstable'

export interface Balance {
  /** CG, m behind the datum. */
  cg: number
  /** Neutral point, m behind the datum. */
  neutralPoint: number
  /** (neutral point - CG) / mean chord; negative is unstable. */
  staticMargin: number
  verdict: BalanceVerdict
}

/** Mean aerodynamic chord of the main wing (straight taper), m. */
export function meanChord(aircraft: AircraftSpec): number {
  const wing = aircraft.surfaces[0]!
  const taper = wing.tipChord / wing.rootChord
  return ((2 / 3) * wing.rootChord * (1 + taper + taper * taper)) / (1 + taper)
}

const neutralPoints = new WeakMap<AircraftSpec, number>()

/**
 * Stick-fixed, power-off neutral point, m behind the datum: the CG position
 * at which the pitching moment stops changing with angle of attack. Ahead of
 * it the aircraft is stable in pitch, behind it unstable. Measured with the
 * sim's own strip aerodynamics (wing, tail, downwash), so it follows the
 * geometry in the spec.
 */
export function neutralPoint(aircraft: AircraftSpec): number {
  const cached = neutralPoints.get(aircraft)
  if (cached !== undefined) return cached
  // Pitching moment about the datum's vertical line: M(z) = M(0) + z * Fy,
  // so dM/dalpha vanishes at z = -dM0/dalpha / dFy/dalpha.
  const low = trimmedLoads(aircraft, 2 * DEG)
  const high = trimmedLoads(aircraft, 4 * DEG)
  const np = -(high.moment - low.moment) / (high.normalForce - low.normalForce)
  neutralPoints.set(aircraft, np)
  return np
}

/** Judges a CG position (m behind the datum). */
export function balance(aircraft: AircraftSpec, cg: number): Balance {
  const np = neutralPoint(aircraft)
  const [front, back] = aircraft.cgRange
  const verdict: BalanceVerdict =
    cg >= np ? 'unstable' : cg < front ? 'noseHeavy' : cg > back ? 'tailHeavy' : 'centered'
  return { cg, neutralPoint: np, staticMargin: (np - cg) / meanChord(aircraft), verdict }
}

/** Steady aero loads at one angle of attack, once the lagged terms settle. */
function trimmedLoads(
  aircraft: AircraftSpec,
  alpha: number,
): { moment: number; normalForce: number } {
  const aero = new Aerodynamics(aircraft)
  const propulsion = new Propulsion(aircraft)
  const speed = 12
  const input = {
    dt: 1 / 500,
    density: airDensity(0),
    airVelocity: new Vector3(0, -speed * Math.sin(alpha), -speed * Math.cos(alpha)),
    bodyRate: new Vector3(),
    centerOfGravity: new Vector3(0, aircraft.centerOfGravity[1], 0),
    propulsion,
    heightAboveGround: 100,
    servos: { aileron: 0, elevator: 0, rudder: 0, flap: 0 },
  }
  for (let i = 0; i < 1000; i++) aero.update(input)
  return { moment: aero.moment.x, normalForce: aero.force.y }
}
