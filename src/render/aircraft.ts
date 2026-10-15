import {
  BoxGeometry,
  CircleGeometry,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  Quaternion,
  Vector3,
  type Object3D,
} from 'three'
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { AircraftSpec } from '../sim/aircraft/types'
import type { Telemetry } from '../sim/simulation'

interface Animated {
  node: Object3D
  rest: Quaternion
  axis: Vector3
}

const spin = new Quaternion()

/**
 * The aircraft's visual. Its group is the body frame (datum origin, +x right,
 * +y up, -z forward), so the sim pose applies directly and the debug overlay
 * can be parented to it.
 */
export class AircraftView {
  readonly group = new Group()
  model: Object3D | null = null
  private propeller: Animated | null = null
  /** Blades + blur disc, for models without a separate propeller node. */
  private spinner: {
    group: Group
    blades: Mesh
    disc: Mesh
    discMaterial: MeshBasicNodeMaterial
  } | null = null
  private readonly controls = new Map<string, Animated>()

  constructor(private readonly spec: AircraftSpec) {
    this.group.name = spec.id
  }

  /** Loads the glTF model. Resolves false when it isn't available. */
  async load(): Promise<boolean> {
    const binding = this.spec.model
    try {
      const gltf = await new GLTFLoader().loadAsync(binding.url)
      const root = gltf.scene
      root.scale.setScalar(binding.scale)
      root.rotation.set(
        ...(binding.rotationDeg.map((d) => MathUtils.degToRad(d)) as [number, number, number]),
      )
      root.position.set(...binding.offset)
      root.traverse((o) => {
        o.castShadow = true
        o.receiveShadow = true
      })
      this.group.add(root)
      this.model = root

      const find = (name: string) => root.getObjectByName(name)
      const prop = binding.nodes.propeller
      const propNode = prop && find(prop.node)
      if (prop && propNode)
        this.propeller = {
          node: propNode,
          rest: propNode.quaternion.clone(),
          axis: new Vector3(...prop.axis),
        }
      if (!this.propeller) this.addPropeller()
      for (const [key, c] of Object.entries(binding.nodes.controls ?? {})) {
        const node = find(c.node)
        if (node)
          this.controls.set(key, {
            node,
            rest: node.quaternion.clone(),
            axis: new Vector3(...c.hingeAxis),
          })
      }
      return true
    } catch {
      return false
    }
  }

  private addPropeller(): void {
    const p = this.spec.propeller
    const group = new Group()
    group.position.set(...p.position)
    // Disc and blades lie in the body x-y plane, normal to the thrust line.
    const blades = new Mesh(
      new BoxGeometry(p.diameter, p.diameter * 0.07, 0.006),
      new MeshStandardNodeMaterial({ color: 0x222222, roughness: 0.5 }),
    )
    blades.castShadow = true
    const discMaterial = new MeshBasicNodeMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    })
    const disc = new Mesh(new CircleGeometry(p.diameter / 2, 48), discMaterial)
    group.add(blades, disc)
    group.position.z -= 0.01
    this.group.add(group)
    this.spinner = { group, blades, disc, discMaterial }
  }

  setPose(position: Vector3, quaternion: Quaternion): void {
    this.group.position.copy(position)
    this.group.quaternion.copy(quaternion)
  }

  animate(t: Telemetry): void {
    if (this.spinner) {
      // Blades read while slow; above ~2500 rpm only the blur disc shows.
      const { blades, disc, discMaterial } = this.spinner
      blades.rotation.z = -t.propAngle
      blades.visible = t.rpm < 2500
      discMaterial.opacity = MathUtils.clamp(t.rpm / 6000, 0, 1) * 0.28
      disc.visible = t.rpm > 300
    }
    if (this.propeller) {
      const p = this.propeller
      p.node.quaternion.copy(p.rest).multiply(spin.setFromAxisAngle(p.axis, t.propAngle))
    }
    for (const [key, c] of this.controls) {
      const deg = t.deflections[key] ?? 0
      c.node.quaternion
        .copy(c.rest)
        .multiply(spin.setFromAxisAngle(c.axis, MathUtils.degToRad(deg)))
    }
  }
}
