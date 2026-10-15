import type { AircraftSpec } from './aircraft/types'
import { Rng } from './rng'

/**
 * How far one airframe's control surfaces sit off neutral with the servos
 * centred, degrees at the surface, signed like the stick that would cause
 * it: positive aileron rolls right, elevator pitches up, rudder yaws right.
 * Trimming cancels it, as on a real model's maiden flight.
 */
export interface BuildTolerances {
  aileronDeg: number
  elevatorDeg: number
  rudderDeg: number
}

/** An airframe rigged exactly to the plans. */
export const PERFECT_BUILD: Readonly<BuildTolerances> = {
  aileronDeg: 0,
  elevatorDeg: 0,
  rudderDeg: 0,
}

/** One airframe's build tolerances, drawn from the aircraft's band. The same seed builds the same airframe. */
export function buildTolerances(aircraft: AircraftSpec, seed: number): BuildTolerances {
  const rng = new Rng(seed)
  const band = aircraft.buildTolerance
  return {
    aileronDeg: rng.range(-band.aileronDeg, band.aileronDeg),
    elevatorDeg: rng.range(-band.elevatorDeg, band.elevatorDeg),
    rudderDeg: rng.range(-band.rudderDeg, band.rudderDeg),
  }
}
