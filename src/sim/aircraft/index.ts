import { extra300 } from './extra300'
import { pa18 } from './pa18'
import type { AircraftSpec } from './types'

/** Every aircraft the pilot can fly, in the order the start screen lists them. */
export const AIRCRAFT: readonly AircraftSpec[] = [pa18, extra300]

/** The aircraft with this id, or the first one when the id is unknown. */
export function aircraftById(id: string | undefined): AircraftSpec {
  return AIRCRAFT.find((a) => a.id === id) ?? AIRCRAFT[0]!
}

/** Whether any surface is driven by the flap channel. */
export const hasFlaps = (aircraft: AircraftSpec): boolean =>
  aircraft.surfaces.some((s) => s.controls.some((c) => c.channel === 'flap'))
