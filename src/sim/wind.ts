import { Vector3 } from 'three'
import { Rng } from './rng'

const FT = 0.3048

/**
 * Steady wind plus Dryden turbulence (MIL-F-8785C low-altitude model). The
 * gust velocity is evaluated at the aircraft and applied uniformly over it
 * (no gust gradients / rotational turbulence).
 *
 * Longitudinal gusts use the first-order Dryden filter; lateral and vertical
 * use the second-order form (1 + sqrt(3) T s) / (1 + T s)^2. Each is driven
 * by seeded white noise so runs replay exactly.
 */
export class Wind {
  readonly velocity = new Vector3()
  private readonly mean = new Vector3()
  private readonly along = new Vector3()
  private readonly across = new Vector3()
  private rng: Rng
  private intensity = 0
  private meanSpeed = 0
  // Filter states.
  private u = 0
  private v = [0, 0]
  private w = [0, 0]

  constructor(private seed: number) {
    this.rng = new Rng(seed)
  }

  set(speed: number, fromDeg: number, turbulence: number): void {
    const from = (fromDeg * Math.PI) / 180
    this.along.set(-Math.sin(from), 0, Math.cos(from))
    this.across.set(-this.along.z, 0, this.along.x)
    this.mean.copy(this.along).multiplyScalar(speed)
    this.meanSpeed = speed
    this.intensity = turbulence
  }

  reset(seed = this.seed): void {
    this.seed = seed
    this.rng = new Rng(seed)
    this.u = 0
    this.v = [0, 0]
    this.w = [0, 0]
    this.velocity.copy(this.mean)
  }

  /** Advances the gust filters; `height` is above ground, `airspeed` in m/s. */
  update(dt: number, height: number, airspeed: number): Vector3 {
    const h = Math.max(height, 3) / FT
    const k = 0.177 + 0.000823 * Math.min(h, 1000)
    // Wind speed at 20 ft sets the turbulence level.
    const sigmaW = 0.1 * this.meanSpeed * this.intensity
    const sigmaU = sigmaW / Math.pow(k, 0.4)
    const lengthW = Math.min(h, 1000) * FT
    const lengthU = (Math.min(h, 1000) / Math.pow(k, 1.2)) * FT
    const V = Math.max(airspeed, 5)

    const gustU = sigmaU * this.firstOrder(dt, lengthU / V)
    const gustV = sigmaU * this.secondOrder(this.v, dt, lengthU / V)
    const gustW = sigmaW * this.secondOrder(this.w, dt, lengthW / V)

    this.velocity
      .copy(this.mean)
      .addScaledVector(this.along, gustU)
      .addScaledVector(this.across, gustV)
    this.velocity.y += gustW
    return this.velocity
  }

  /** Unit-variance output of 1 / (1 + T s). */
  private firstOrder(dt: number, T: number): number {
    const noise = this.rng.gaussian() * Math.sqrt(dt)
    this.u += (-this.u / T) * dt + noise / T
    return this.u * Math.sqrt(2 * T)
  }

  /** Unit-variance output of (1 + sqrt(3) T s) / (1 + T s)^2. */
  private secondOrder(state: number[], dt: number, T: number): number {
    const noise = this.rng.gaussian() * Math.sqrt(dt)
    const [x1, x2] = state as [number, number]
    const nx2 = x2 + (-(2 * T * x2 + x1) / (T * T)) * dt + noise / (T * T)
    const nx1 = x1 + nx2 * dt
    state[0] = nx1
    state[1] = nx2
    return (nx1 + Math.sqrt(3) * T * nx2) * Math.sqrt(T)
  }
}
