/** ISA troposphere at the field. */
export const SEA_LEVEL_DENSITY = 1.225
export const DYNAMIC_VISCOSITY = 1.81e-5

export function airDensity(altitude: number): number {
  return SEA_LEVEL_DENSITY * Math.pow(1 - 2.25577e-5 * altitude, 4.2559)
}
