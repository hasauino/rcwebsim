import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { FIELD } from '../sim/field'

export type CameraMode = 'pilot' | 'chase'

const forward = new Vector3()
const desired = new Vector3()
const target = new Vector3()
const toAircraft = new Vector3()
const aimPoint = new Vector3()

/** How far below the horizon keep-ground-in-view shows, degrees. */
const GROUND_BELOW_HORIZON = 4
/**
 * Highest the aircraft sits when the ground is kept in view, as a fraction of
 * the half-angle above the centre of the view (0.6: about 80% up it).
 */
const AIRCRAFT_TOP = 0.6

/**
 * Pilot's-eye view (the default: this is how RC is flown) from wherever the
 * pilot stands, with optional auto-zoom, plus a chase camera that follows the
 * aircraft's heading but not its roll.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera
  mode: CameraMode = 'pilot'
  autoZoom = true
  /** Pilot view: zoom out and look down so the ground stays along the bottom. */
  keepGroundInView = true
  baseFov = 50
  /** Approximate aircraft size, for auto-zoom framing. */
  span = 1.7
  /** The pilot's eye, for the pilot view. */
  readonly eye = new Vector3(FIELD.pilotStation.x, FIELD.pilotStation.y, FIELD.pilotStation.z)

  private readonly look = new Vector3()
  private readonly chasePosition = new Vector3()
  private initialised = false

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(this.baseFov, aspect, 0.05, 60000)
    this.camera.position.copy(this.eye)
  }

  update(dt: number, position: Vector3, quaternion: Quaternion): void {
    const cam = this.camera
    const smoothing = 1 - Math.exp(-dt * 12)
    if (!this.initialised) {
      this.look.copy(position)
      this.chasePosition.copy(position)
      this.initialised = true
    }

    if (this.mode === 'pilot') {
      cam.position.copy(this.eye)
      toAircraft.subVectors(position, this.eye)
      const distance = toAircraft.length()
      const horizontal = Math.hypot(toAircraft.x, toAircraft.z)
      const elevation = MathUtils.radToDeg(Math.atan2(toAircraft.y, horizontal))
      // Keep the model a readable size on screen: it spans ~1/6 of the view.
      let fov = this.autoZoom
        ? MathUtils.radToDeg(2 * Math.atan((this.span * 3) / Math.max(distance, 1)))
        : this.baseFov
      // Zoom no tighter than fits both the aircraft and the ground under the horizon.
      if (this.keepGroundInView)
        fov = Math.max(fov, (elevation + GROUND_BELOW_HORIZON) / ((1 + AIRCRAFT_TOP) / 2))
      const clamped = MathUtils.clamp(fov, 12, this.baseFov)
      cam.fov += (clamped - cam.fov) * (1 - Math.exp(-dt * 4))
      if (this.keepGroundInView && horizontal > 1e-3) {
        // Look below the aircraft so the ground stays along the bottom, as far as keeps it in view.
        const half = cam.fov / 2
        const pitch = MathUtils.degToRad(
          Math.max(
            elevation - AIRCRAFT_TOP * half,
            Math.min(elevation, half - GROUND_BELOW_HORIZON),
          ),
        )
        aimPoint
          .set(toAircraft.x, 0, toAircraft.z)
          .multiplyScalar((distance * Math.cos(pitch)) / horizontal)
          .setY(distance * Math.sin(pitch))
          .add(this.eye)
      } else {
        aimPoint.copy(position)
      }
      this.look.lerp(aimPoint, smoothing)
      cam.lookAt(this.look)
    } else {
      forward.set(0, 0, -1).applyQuaternion(quaternion)
      forward.y = 0
      if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1)
      forward.normalize()
      desired.copy(position).addScaledVector(forward, -4.5)
      desired.y += 1.4
      this.chasePosition.lerp(desired, 1 - Math.exp(-dt * 5))
      cam.position.copy(this.chasePosition)
      target.copy(position).addScaledVector(forward, 2)
      this.look.lerp(target, smoothing)
      cam.lookAt(this.look)
      cam.fov += (this.baseFov + 10 - cam.fov) * (1 - Math.exp(-dt * 4))
    }
    cam.updateProjectionMatrix()
  }

  /** Jump straight to the target (after a reset). */
  snap(): void {
    this.initialised = false
  }
}
