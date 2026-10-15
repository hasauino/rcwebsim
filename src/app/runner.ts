import { Quaternion, Vector3 } from 'three'
import type { ControlInputs, Simulation } from '../sim/simulation'

interface Pose {
  position: Vector3
  quaternion: Quaternion
}

/**
 * Drives the fixed 500 Hz simulation from variable render frames. Leftover
 * time is carried in an accumulator and the render pose is interpolated
 * between the last two physics states. A per-frame step cap stops a slow
 * frame from snowballing into an ever-longer catch-up.
 */
export class FixedStepRunner {
  private accumulator = 0
  private readonly previous: Pose = { position: new Vector3(), quaternion: new Quaternion() }
  private readonly current: Pose = { position: new Vector3(), quaternion: new Quaternion() }

  constructor(
    readonly sim: Simulation,
    private readonly maxStepsPerFrame = 25,
  ) {
    this.snap()
  }

  /** Advances by a frame's worth of real time. Returns the interpolation factor. */
  advance(
    frameSeconds: number,
    inputs: ControlInputs,
    onStep?: (inputs: ControlInputs) => void,
  ): number {
    const dt = this.sim.dt
    this.accumulator += Math.min(frameSeconds, 0.25)
    let steps = 0
    while (this.accumulator >= dt && steps < this.maxStepsPerFrame) {
      this.previous.position.copy(this.current.position)
      this.previous.quaternion.copy(this.current.quaternion)
      onStep?.(inputs)
      this.sim.step(inputs)
      this.capture(this.current)
      this.accumulator -= dt
      steps++
    }
    // Fell behind: drop the backlog rather than spiral.
    if (steps === this.maxStepsPerFrame) this.accumulator = 0
    return this.accumulator / dt
  }

  /** Interpolated body pose for rendering. */
  pose(alpha: number, position: Vector3, quaternion: Quaternion): void {
    position.lerpVectors(this.previous.position, this.current.position, alpha)
    quaternion.slerpQuaternions(this.previous.quaternion, this.current.quaternion, alpha)
  }

  /** Call after a reset so the render pose doesn't sweep across the field. */
  snap(): void {
    this.capture(this.current)
    this.previous.position.copy(this.current.position)
    this.previous.quaternion.copy(this.current.quaternion)
    this.accumulator = 0
  }

  private capture(into: Pose): void {
    const s = this.sim.state()
    into.position.set(s.position.x, s.position.y, s.position.z)
    into.quaternion.set(s.quaternion.x, s.quaternion.y, s.quaternion.z, s.quaternion.w)
  }
}
