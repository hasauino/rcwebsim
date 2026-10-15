/** Deterministic PRNG (mulberry32) so seeded runs replay exactly. */
export class Rng {
  private state: number
  private spare: number | undefined

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  /** Standard normal sample (Box-Muller). */
  gaussian(): number {
    if (this.spare !== undefined) {
      const s = this.spare
      this.spare = undefined
      return s
    }
    const u = Math.max(this.next(), 1e-12)
    const v = this.next()
    const r = Math.sqrt(-2 * Math.log(u))
    this.spare = r * Math.sin(2 * Math.PI * v)
    return r * Math.cos(2 * Math.PI * v)
  }
}
