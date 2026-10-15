import type { AirfoilId } from './aircraft/types'
import usa35b from './data/usa35b.json'
import clarky from './data/clarky.json'
import naca0009 from './data/naca0009.json'

interface PolarTable {
  name: string
  alphaDeg: { start: number; step: number; count: number }
  reynolds: number[]
  cl: number[][]
  cd: number[][]
  cm: number[][]
}

export interface Coefficients {
  cl: number
  cd: number
  cm: number
}

const DEG = 180 / Math.PI

/**
 * Full-range (-180..180 deg) section polars from XFoil + Viterna extension
 * (scripts/gen_polars.py), interpolated linearly in alpha and log(Re).
 */
export class Airfoil {
  private readonly logRe: number[]

  constructor(private readonly table: PolarTable) {
    this.logRe = table.reynolds.map(Math.log)
  }

  get name(): string {
    return this.table.name
  }

  /** Writes coefficients for angle of attack (rad) and Reynolds number into `out`. */
  lookup(alpha: number, reynolds: number, out: Coefficients): Coefficients {
    const { start, step, count } = this.table.alphaDeg
    let deg = alpha * DEG
    deg = ((((deg + 180) % 360) + 360) % 360) - 180
    const f = (deg - start) / step
    const i0 = Math.min(Math.max(Math.floor(f), 0), count - 2)
    const ta = f - i0

    const logs = this.logRe
    const lr = Math.log(Math.max(reynolds, 1))
    let j0 = 0
    let tr = 0
    if (lr >= logs[logs.length - 1]!) {
      j0 = logs.length - 1
    } else if (lr > logs[0]!) {
      while (lr > logs[j0 + 1]!) j0++
      tr = (lr - logs[j0]!) / (logs[j0 + 1]! - logs[j0]!)
    }
    const j1 = Math.min(j0 + 1, logs.length - 1)

    out.cl = this.bilinear(this.table.cl, i0, ta, j0, j1, tr)
    out.cd = this.bilinear(this.table.cd, i0, ta, j0, j1, tr)
    out.cm = this.bilinear(this.table.cm, i0, ta, j0, j1, tr)
    return out
  }

  private bilinear(rows: number[][], i0: number, ta: number, j0: number, j1: number, tr: number) {
    const a = rows[j0]!
    const b = rows[j1]!
    const va = a[i0]! + (a[i0 + 1]! - a[i0]!) * ta
    const vb = b[i0]! + (b[i0 + 1]! - b[i0]!) * ta
    return va + (vb - va) * tr
  }
}

const cache = new Map<AirfoilId, Airfoil>()
const tables: Record<AirfoilId, PolarTable> = { usa35b, clarky, naca0009 }

export function airfoil(id: AirfoilId): Airfoil {
  let a = cache.get(id)
  if (!a) cache.set(id, (a = new Airfoil(tables[id])))
  return a
}
