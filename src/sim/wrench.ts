import { Vector3 } from 'three'

const lever = new Vector3()
const moment = new Vector3()

/** Accumulated force and torque about the centre of mass, world frame. */
export class Wrench {
  readonly force = new Vector3()
  readonly torque = new Vector3()

  clear(): void {
    this.force.set(0, 0, 0)
    this.torque.set(0, 0, 0)
  }

  addAtPoint(force: Vector3, point: Vector3, centerOfMass: Vector3): void {
    this.force.add(force)
    lever.subVectors(point, centerOfMass)
    this.torque.add(moment.crossVectors(lever, force))
  }
}
