import type { Channel } from './aircraft/types'

export interface FlightSensors {
  /** Body rates, rad/s (x pitch, y yaw, z roll). */
  bodyRate: { x: number; y: number; z: number }
  pitchDeg: number
  rollDeg: number
  airspeed: number
}

/**
 * On-board flight controller between receiver and servos (AS3X/SAFE-style
 * stabilisers plug in here). The default passes channels straight through.
 */
export interface FlightController {
  update(
    channels: Record<Channel, number>,
    sensors: FlightSensors,
    dt: number,
  ): Record<Channel, number>
  reset(): void
}

export const passThrough: FlightController = {
  update: (channels) => channels,
  reset: () => {},
}
