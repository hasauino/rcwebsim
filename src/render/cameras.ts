import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { FIELD } from '../sim/field'

export type CameraMode = 'pilot' | 'chase'

const forward = new Vector3()
const desired = new Vector3()
const target = new Vector3()

/**
 * Pilot's-eye view (the default: this is how RC is flown) from wherever the
 * pilot stands, with optional auto-zoom, plus a chase camera that follows the
 * aircraft's heading but not its roll.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera
  mode: CameraMode = 'pilot'
  autoZoom = true
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
      this.look.lerp(position, smoothing)
      cam.lookAt(this.look)
      // Keep the model a readable size on screen: it spans ~1/6 of the view.
      const distance = cam.position.distanceTo(position)
      const fov = this.autoZoom
        ? MathUtils.radToDeg(2 * Math.atan((this.span * 3) / Math.max(distance, 1)))
        : this.baseFov
      const clamped = MathUtils.clamp(fov, 12, this.baseFov)
      cam.fov += (clamped - cam.fov) * (1 - Math.exp(-dt * 4))
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
