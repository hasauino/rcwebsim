import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Mesh,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three'
import { LineBasicNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu'
import type { Strip } from '../sim/aero'
import type { AircraftSpec } from '../sim/aircraft/types'
import type { Simulation } from '../sim/simulation'

const NEWTONS_TO_METRES = 0.06
const METRES_PER_SECOND_TO_METRES = 0.05
/** Airspeed vector (cyan), total aero force (magenta), thrust (orange). */
const SUMMARY_COLORS = [0x26c6da, 0xe040fb, 0xff9800]
const attached = new Color(0x3ddc84)
const nearStall = new Color(0xffc107)
const stalled = new Color(0xff3d3d)
const washed = new Color(0x4fc3f7)

/**
 * Aerodynamic debug view in the body frame: one panel per strip coloured by
 * angle of attack (green attached -> amber near stall -> red stalled, blue
 * tint in the prop wash) and an arrow per strip showing its force.
 */
export class DebugOverlay {
  readonly group = new Group()
  private readonly panels: InstancedMesh
  private readonly arrows: LineSegments
  private readonly arrowPositions: Float32Array
  private readonly matrix = new Matrix4()
  private readonly color = new Color()
  private readonly basisX = new Vector3()
  private readonly center = new Vector3()
  private readonly summary: LineSegments[]
  private readonly cg: Vector3
  private readonly strips: readonly Strip[]

  constructor(
    spec: AircraftSpec,
    private readonly sim: Simulation,
  ) {
    this.strips = sim.strips()
    const strips = this.strips
    this.cg = new Vector3(...spec.centerOfGravity)
    this.group.name = 'aero-debug'
    const panelMaterial = new MeshBasicNodeMaterial({
      transparent: true,
      opacity: 0.55,
      side: DoubleSide,
      depthWrite: false,
    })
    this.panels = new InstancedMesh(new PlaneGeometry(1, 1), panelMaterial, strips.length)
    this.panels.frustumCulled = false
    this.panels.renderOrder = 10
    this.group.add(this.panels)

    this.arrowPositions = new Float32Array(strips.length * 6)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(this.arrowPositions, 3))
    this.arrows = new LineSegments(
      geometry,
      new LineBasicNodeMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
    )
    this.arrows.frustumCulled = false
    this.arrows.renderOrder = 11
    this.group.add(this.arrows)

    const cg = new Mesh(
      new SphereGeometry(0.025, 12, 8),
      new MeshBasicNodeMaterial({ color: 0xffeb3b, depthTest: false }),
    )
    cg.position.set(...spec.centerOfGravity)
    cg.renderOrder = 12
    this.group.add(cg)

    this.summary = SUMMARY_COLORS.map((color) => {
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(new Float32Array(6), 3))
      const line = new LineSegments(
        g,
        new LineBasicNodeMaterial({ color, depthTest: false, transparent: true }),
      )
      line.frustumCulled = false
      line.renderOrder = 12
      this.group.add(line)
      return line
    })
  }

  update(): void {
    this.strips.forEach((s, i) => {
      // Panel spans the strip: x along span, y along chord, normal out of plane.
      this.basisX.copy(s.span)
      this.center.copy(s.position).addScaledVector(s.forward, -0.25 * s.chord)
      this.matrix.makeBasis(
        this.basisX.multiplyScalar(s.width),
        s.forward.clone().multiplyScalar(s.chord),
        s.normal,
      )
      this.matrix.setPosition(this.center)
      this.panels.setMatrixAt(i, this.matrix)

      const a = Math.abs(s.alpha) * (180 / Math.PI)
      const t = Math.min(1, Math.max(0, (a - 6) / 8))
      this.color.copy(attached).lerp(nearStall, t)
      if (s.stalled) this.color.copy(stalled)
      if (s.inSlipstream) this.color.lerp(washed, 0.4)
      this.panels.setColorAt(i, this.color)

      const o = i * 6
      this.arrowPositions[o] = s.position.x
      this.arrowPositions[o + 1] = s.position.y
      this.arrowPositions[o + 2] = s.position.z
      this.arrowPositions[o + 3] = s.position.x + s.force.x * NEWTONS_TO_METRES
      this.arrowPositions[o + 4] = s.position.y + s.force.y * NEWTONS_TO_METRES
      this.arrowPositions[o + 5] = s.position.z + s.force.z * NEWTONS_TO_METRES
    })
    // Velocity through the air, total aero force and thrust, all from the CG.
    const v = this.sim.vectors()
    const vectors = [
      { vector: v.airVelocity, scale: METRES_PER_SECOND_TO_METRES },
      { vector: v.aeroForce, scale: NEWTONS_TO_METRES },
      { vector: v.thrust, scale: NEWTONS_TO_METRES },
    ]
    vectors.forEach(({ vector, scale }, i) => {
      const attr = this.summary[i]!.geometry.attributes.position as BufferAttribute
      const tip = this.center.copy(vector).multiplyScalar(scale).add(this.cg)
      attr.setXYZ(0, this.cg.x, this.cg.y, this.cg.z)
      attr.setXYZ(1, tip.x, tip.y, tip.z)
      attr.needsUpdate = true
    })

    this.panels.instanceMatrix.needsUpdate = true
    if (this.panels.instanceColor) this.panels.instanceColor.needsUpdate = true
    this.arrows.geometry.attributes.position!.needsUpdate = true
  }
}
