/** How one gamepad axis maps onto a gimbal or channel. */
export interface AxisMapping {
  /** Gamepad axis index, or -1 for unassigned. */
  index: number
  invert: boolean
  min: number
  center: number
  max: number
  /** Overrides the profile's deadzone for this axis (a radio's measured jitter). */
  deadzone?: number
}

/** An axis's raw value scaled to -1..1 by its calibration, with the deadzone at centre. */
export function normaliseAxis(raw: number, m: AxisMapping, deadzone: number): number {
  let v =
    raw >= m.center
      ? (raw - m.center) / (m.max - m.center || 1)
      : (raw - m.center) / (m.center - m.min || 1)
  v = Math.max(-1, Math.min(1, v))
  if (Math.abs(v) < (m.deadzone ?? deadzone)) v = 0
  return m.invert ? -v : v
}

/** Axis travel that tells which control was moved, when finding a channel or switch by moving it. */
export const DETECT_TRAVEL = 0.5
