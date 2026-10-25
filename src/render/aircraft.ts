import {
  BoxGeometry,
  CircleGeometry,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  Quaternion,
  Texture,
  Vector3,
  type Material,
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
  /** Blur disc, and the blades it stands in for once the prop is fast. */
  private blur: { blades: Object3D | null; disc: Mesh; material: MeshBasicNodeMaterial } | null =
    null
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
      root.scale.set(...binding.scale)
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
      let blades: Object3D | null = null
      if (prop && propNode) {
        this.propeller = {
          node: propNode,
          rest: propNode.quaternion.clone(),
          axis: new Vector3(...prop.axis),
        }
        blades = (prop.blades && find(prop.blades)) || null
      } else {
        this.propeller = this.addBlades()
        blades = this.propeller.node
      }
      this.addBlurDisc(blades)
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

  /** Plain blades on the thrust line, for models without a propeller node. */
  private addBlades(): Animated {
    const p = this.spec.propeller
    // Lie in the body x-y plane, normal to the thrust line.
    const blades = new Mesh(
      new BoxGeometry(p.diameter, p.diameter * 0.07, 0.006),
      new MeshStandardNodeMaterial({ color: 0x222222, roughness: 0.5 }),
    )
    blades.castShadow = true
    blades.position.set(...p.position)
    blades.position.z -= 0.01
    this.group.add(blades)
    // Clockwise from behind is a right-handed turn about +thrust (body -z).
    const axis = new Vector3(0, 0, p.clockwiseFromBehind ? -1 : 1)
    return { node: blades, rest: blades.quaternion.clone(), axis }
  }

  private addBlurDisc(blades: Object3D | null): void {
    const p = this.spec.propeller
    const material = new MeshBasicNodeMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    })
    // In the body x-y plane, just ahead of the blades.
    const disc = new Mesh(new CircleGeometry(p.diameter / 2, 48), material)
    disc.position.set(...p.position)
    disc.position.z -= 0.012
    this.group.add(disc)
    this.blur = { blades, disc, material }
  }

  /** Frees the model's geometry, materials and textures. */
  dispose(): void {
    this.group.traverse((o) => {
      if (!(o instanceof Mesh)) return
      o.geometry.dispose()
      for (const m of [o.material].flat() as Material[]) {
        for (const value of Object.values(m)) if (value instanceof Texture) value.dispose()
        m.dispose()
      }
    })
  }

  setPose(position: Vector3, quaternion: Quaternion): void {
    this.group.position.copy(position)
    this.group.quaternion.copy(quaternion)
  }

  /** Spins the prop and moves the surfaces: the sim's telemetry, or the hangar's idle routine. */
  animate(t: Pick<Telemetry, 'rpm' | 'propAngle' | 'deflections'>): void {
    if (this.blur) {
      // Blades read while slow; above ~2500 rpm only the blur disc shows.
      const { blades, disc, material } = this.blur
      if (blades) blades.visible = t.rpm < 2500
      material.opacity = MathUtils.clamp(t.rpm / 6000, 0, 1) * 0.28
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
