import type { Channel, ServoSpec } from './aircraft/types'

/** Servo arm travel for a full-scale command, degrees (typical). */
const ARM_THROW_DEG = 45

export const SURFACE_CHANNELS = ['aileron', 'elevator', 'rudder', 'flap'] as const
export type SurfaceChannel = (typeof SURFACE_CHANNELS)[number]

/**
 * Rate-limited servo outputs per channel, normalised (-1..1, flap 0..1).
 * Slop is applied per surface (see Aerodynamics) because it is a linkage
 * property expressed in degrees at the surface.
 */
export class Servos {
  readonly position: Record<SurfaceChannel, number> = {
    aileron: 0,
    elevator: 0,
    rudder: 0,
    flap: 0,
  }
  private readonly rate: number

  constructor(spec: ServoSpec) {
    this.rate = 60 / spec.secondsPer60Deg / ARM_THROW_DEG
  }

  reset(): void {
    for (const c of SURFACE_CHANNELS) this.position[c] = 0
  }

  update(command: Record<Channel, number>, dt: number): void {
    const max = this.rate * dt
    for (const c of SURFACE_CHANNELS) {
      const target = c === 'flap' ? clamp(command[c], 0, 1) : clamp(command[c], -1, 1)
      const p = this.position[c]
      this.position[c] = p + clamp(target - p, -max, max)
    }
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
