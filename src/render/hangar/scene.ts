import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RectAreaLight,
  Scene,
  Vector3,
  type Material,
  type Object3D,
  type Texture,
} from 'three'
import {
  MeshBasicNodeMaterial,
  PMREMGenerator,
  RectAreaLightNode,
  WebGPURenderer,
  type RenderTarget,
} from 'three/webgpu'
import { float, length, smoothstep, uv } from 'three/tsl'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { controlThrowDeg } from '../../sim/aero'
import type { AircraftSpec, Channel } from '../../sim/aircraft/types'
import { AircraftView } from '../aircraft'
import { LAYOUT, PLANE_SPOT } from './layout'
import { orbitReach } from './orbit'
import { LoadProgress } from './progress'
import { propUrl, type PropId } from './props'
import { ROOM, ROOM_BOX, createRoom, loadGarden } from './room'

/** One stick routine: ailerons, elevator, rudder, then a rest, seconds each. */
const ROUTINE: (Channel | null)[] = ['aileron', 'elevator', 'rudder', null]
const STEP = 1.6
/** A slow turn of the prop: the blades still show (the blur disc starts at 300 rpm). */
const IDLE_RPM = 240
/** Auto-rotation resumes this long after the last gesture, s. */
const SETTLE = 3
/** How long a prop takes to fade in once it arrives, s. */
const FADE = 0.6
/** Lens: vertical field of view, and the least it may show across, degrees. */
const VERTICAL_FOV = 40
const MIN_HORIZONTAL_FOV = 55
/** The camera keeps this far off the walls, floor and ceiling, m. */
const WALL_MARGIN = 0.25

/**
 * Late morning, low from the front right: a hard patch of sun falls through
 * the door across the floor where the plane stands, and the side window
 * throws its glazing bars on the floor beyond.
 */
const SUN = { elevationDeg: 30, azimuthDeg: 45 }
/**
 * The first layer's parts, weighted by roughly what each downloads, MB: the
 * loading screen covers only these.
 */
const LOAD_WEIGHT = { room: 0.6, plane: 2 }
const SKY_LIGHT = 0xd6e6ff
const SUN_LIGHT = 0xfff1de

/** One moving half of a control surface, as the routine drives it. */
interface SweptSurface {
  /** Telemetry deflection key, e.g. "aileron.left". */
  key: string
  channel: Channel
  /** Channel-to-deflection sign on this half. */
  gain: number
  throwDeg: number
}

/** A prop's materials fading in, each towards its own opacity. */
interface Fading {
  materials: { material: Material; opacity: number }[]
  /** When the first placement went in, s; null until then. */
  start: number | null
}

/**
 * The hangar: the pilot's open home garage on a sunny morning, made over as
 * an RC workshop, with the chosen aircraft standing on its wheels in the sun
 * patch. The camera orbits it on drag and zooms on wheel or pinch, never
 * through a wall; the prop idles and the surfaces sweep through their
 * throws now and then. Loads in layers: the room and the plane first, then
 * the props fade in, then the garden outside. A plain class outside Vue,
 * like World3D (ADR-0009).
 */
export class HangarScene {
  private readonly renderer: WebGPURenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(VERTICAL_FOV, 1, 0.05, 400)
  private readonly sun = new DirectionalLight(SUN_LIGHT, 4.2)
  /** Where the plane stands: it turns the airframe nose to the door. */
  private readonly stand = new Group()
  /** The furnishings; the room's reflection leaves them out. */
  private readonly props = new Group()
  /** Soft dark patches on the floor under the airframe and each wheel. */
  private readonly contact = new Group()
  private pmrem: PMREMGenerator | null = null
  /** The room's reflection: the first capture, kept for good; later ones are copied in. */
  private env: RenderTarget | null = null
  /** Where each later capture renders before it is copied into `env`. */
  private scratch: RenderTarget | null = null
  private view: AircraftView | null = null
  private spec: AircraftSpec | null = null
  private surfaces: SweptSurface[] = []
  /** Starts behind and left of the plane, looking out through the door. */
  private yaw = -2.85
  private pitch = 0.32
  private distance = 3
  /** How far the camera can back off this frame before it meets a wall. */
  private reach = Infinity
  /** What the camera orbits: the middle of the airframe. */
  private readonly target = new Vector3()
  /** From the target towards the camera. */
  private readonly dir = new Vector3()
  private span = 1.5
  private lastGesture = -Infinity
  private clock = 0
  private propAngle = 0
  private routine = 0
  private readonly fading: Fading[] = []
  /**
   * Resolves once every layer has loaded or failed; it never rejects, since
   * a later layer that fails is only left out. Resolved until `init` starts them.
   */
  complete: Promise<void> = Promise.resolve()
  private readonly pointers = new Map<number, { x: number; y: number }>()
  private resizeObserver: ResizeObserver | null = null
  private loading = 0
  private disposed = false
  /** Phones and the WebGL fallback: only big props cast shadows. */
  private lowQuality = false
  /** Resolves once the first aircraft is up (or after a few seconds without one). */
  private planeShown: () => void = () => {}
  private firstPlaneTimer = 0
  private readonly firstPlane = new Promise<void>((resolve) => {
    this.planeShown = resolve
    this.firstPlaneTimer = window.setTimeout(resolve, 6000)
  })
  /** Pixels the cards cover on the right and along the bottom; the view centres beside them. */
  private readonly insets = { right: 0, bottom: 0 }

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false })
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFShadowMap
    this.scene.background = new Color(SKY_LIGHT)
    this.stand.position.set(...PLANE_SPOT.at)
    this.stand.rotation.y = MathUtils.degToRad(PLANE_SPOT.yawDeg)
    this.stand.add(this.contact)
    this.scene.add(this.stand, this.props)
  }

  /**
   * Starts rendering and loads the first layer, the room and the plane;
   * `onProgress` hears the share of it loaded so far. The rest carries on
   * loading behind it: `complete` resolves once every layer is in.
   */
  async init(onProgress: (fraction: number) => void = () => {}): Promise<void> {
    const progress = new LoadProgress(LOAD_WEIGHT.room + LOAD_WEIGHT.plane, onProgress)
    await this.renderer.init()
    if (this.disposed) return
    const backend = this.renderer.backend as { isWebGPUBackend?: boolean }
    this.lowQuality = !backend.isWebGPUBackend || matchMedia('(pointer: coarse)').matches
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.lowQuality ? 1.5 : 2))
    this.resize()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.canvas)
    this.attach()
    this.light()
    const room = createRoom()
    this.scene.add(room.group)
    this.pmrem = new PMREMGenerator(this.renderer)
    this.renderer.setAnimationLoop((time) => this.frame(time / 1000))
    await Promise.all([
      progress.track(room.ready, LOAD_WEIGHT.room),
      progress.track(this.firstPlane, LOAD_WEIGHT.plane),
    ])
    if (this.disposed) return
    this.captureEnvironment()
    this.complete = this.loadRest().catch((e: unknown) => console.error(e))
  }

  /**
   * The layers after the first, each with the bandwidth to itself: the props
   * fade in, then the sky and garden outside (a plain sky colour shows
   * through the door until then).
   */
  private async loadRest(): Promise<void> {
    await this.loadProps()
    const [garden] = await Promise.all([loadGarden().catch(() => null), this.loadSky()])
    if (this.disposed) return
    if (garden) this.scene.add(garden)
    this.captureEnvironment()
  }

  /** Swaps in an aircraft. Resolves whether its model loaded. */
  async show(spec: AircraftSpec): Promise<boolean> {
    const ticket = ++this.loading
    const view = new AircraftView(spec)
    const found = await view.load()
    if (this.disposed || ticket !== this.loading) {
      view.dispose()
      return found
    }
    if (this.view) {
      this.stand.remove(this.view.group)
      this.view.dispose()
    }
    this.view = view
    this.spec = spec
    this.stand.add(view.group)
    this.standOnWheels(spec)
    this.surfaces = this.bindSurfaces(spec)
    this.routine = this.clock
    this.planeShown()
    return found
  }

  /** Keeps the plane in the middle of the part of the canvas the cards leave clear. */
  setInsets(right: number, bottom: number): void {
    this.insets.right = right
    this.insets.bottom = bottom
    if (this.resizeObserver) this.resize()
  }

  dispose(): void {
    this.disposed = true
    clearTimeout(this.firstPlaneTimer)
    this.view?.dispose()
    this.clearContact()
    this.stand.clear()
    this.detach?.()
    this.resizeObserver?.disconnect()
    this.renderer.setAnimationLoop(null)
    this.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return
      o.geometry.dispose()
      for (const m of [o.material].flat() as Material[]) {
        for (const value of Object.values(m))
          if (value && (value as Texture).isTexture) (value as Texture).dispose()
        m.dispose()
      }
    })
    if (this.scene.background && (this.scene.background as Texture).isTexture)
      (this.scene.background as Texture).dispose()
    this.env?.dispose()
    this.scratch?.dispose()
    this.pmrem?.dispose()
    this.renderer.dispose()
  }

  /**
   * The sun through the door, plus the light that would bounce: sky light
   * filling in through the door and the window, and warm light thrown up off
   * the sunlit floor. The room's own reflection is captured separately.
   */
  private light(): void {
    RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())
    const el = MathUtils.degToRad(SUN.elevationDeg)
    const az = MathUtils.degToRad(SUN.azimuthDeg)
    this.sun.position
      .set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
      .multiplyScalar(20)
    this.sun.castShadow = true
    const size = this.lowQuality ? 1024 : 2048
    this.sun.shadow.mapSize.set(size, size)
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.02
    const shadow = this.sun.shadow.camera
    shadow.left = shadow.bottom = -6
    shadow.right = shadow.top = 6
    shadow.near = 5
    shadow.far = 40
    shadow.updateProjectionMatrix()
    this.scene.add(this.sun, this.sun.target)

    const z = ROOM.depth / 2
    const door = new RectAreaLight(SKY_LIGHT, 2.2, ROOM.door.width, ROOM.door.height)
    door.position.set(0, ROOM.door.height / 2, z + 0.05)
    door.lookAt(0, ROOM.door.height / 2, 0)
    const { window: win } = ROOM
    const side = new RectAreaLight(SKY_LIGHT, 1.6, win.z1 - win.z0, win.y1 - win.y0)
    side.position.set(ROOM.width / 2 + 0.1, (win.y0 + win.y1) / 2, (win.z0 + win.z1) / 2)
    side.lookAt(0, (win.y0 + win.y1) / 2, (win.z0 + win.z1) / 2)
    const bounce = new RectAreaLight(0xffe4c4, 0.9, 3.4, 2.6)
    bounce.position.set(PLANE_SPOT.at[0] - 0.4, 0.02, PLANE_SPOT.at[2] + 0.2)
    bounce.lookAt(PLANE_SPOT.at[0] - 0.4, 2, PLANE_SPOT.at[2] + 0.2)
    this.scene.add(door, side, bounce, new HemisphereLight(SKY_LIGHT, 0xb9ad9b, 0.35))
  }

  /**
   * Captures the room as the environment light from the middle of it, twice
   * so the light bounces once off what it lit. The aircraft and the props
   * stay out of it: blurred to 128 px they hardly show, and each prop
   * material would need its shaders built again for the capture.
   */
  private captureEnvironment(): void {
    if (this.disposed || !this.pmrem) return
    this.stand.visible = false
    this.props.visible = false
    for (let bounce = 0; bounce < 2; bounce++) {
      const capture = this.pmrem.fromScene(this.scene, 0.02, 0.05, 200, {
        size: 128,
        position: new Vector3(0, 1.3, 0),
        renderTarget: this.scratch,
      })
      // Every material keeps the one environment texture: a new one would
      // rebuild every shader in the room.
      if (!this.env) {
        this.env = capture
        this.scene.environment = capture.texture
      } else {
        this.scratch = capture
        this.renderer.copyTextureToTexture(capture.texture, this.env.texture)
      }
    }
    this.scene.environmentIntensity = 0.9
    this.stand.visible = true
    this.props.visible = true
  }

  /** The sky seen through the door and window. */
  private loadSky(): Promise<void> {
    return new HDRLoader()
      .loadAsync('assets/env/kloofendal_48d_partly_cloudy_puresky_1k.hdr')
      .then((env: Texture) => {
        if (this.disposed) return env.dispose()
        env.mapping = EquirectangularReflectionMapping
        this.scene.background = env
      })
      .catch(() => {
        // A plain sky colour shows through the door instead.
      })
  }

  /**
   * Loads every prop in parallel, each fading in as it arrives. Every
   * placement of a prop shares its materials, so they fade together.
   */
  private async loadProps(): Promise<void> {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const models = new Map<PropId, Promise<{ model: Object3D; fade: Fading } | null>>()
    const model = (id: PropId) => {
      if (!models.has(id))
        models.set(
          id,
          loader.loadAsync(propUrl(id)).then(
            (g) => ({ model: g.scene, fade: this.hide(g.scene) }),
            () => null,
          ),
        )
      return models.get(id)!
    }
    await Promise.all(
      LAYOUT.map(async (p) => {
        const loaded = await model(p.prop)
        if (!loaded || this.disposed) return
        const prop = loaded.model.clone()
        prop.position.set(...p.at)
        prop.rotation.set(
          MathUtils.degToRad(p.tiltDeg?.[0] ?? 0),
          MathUtils.degToRad(p.yawDeg ?? 0),
          MathUtils.degToRad(p.tiltDeg?.[1] ?? 0),
          'YXZ',
        )
        const cast = !this.lowQuality || p.big === true
        prop.traverse((o) => {
          if (!(o instanceof Mesh)) return
          o.castShadow = cast
          o.receiveShadow = true
        })
        // Builds its shaders now, one prop at a time, rather than all of
        // them in the first frame that draws them (which it falls back on).
        await this.renderer.compileAsync(prop, this.camera, this.scene).catch(() => {})
        if (this.disposed) return
        this.props.add(prop)
        if (loaded.fade.start === null) {
          loaded.fade.start = this.clock
          this.fading.push(loaded.fade)
        }
      }),
    )
  }

  /**
   * Turns a model's materials clear, ready to fade in once it goes in.
   * Opaque ones fade by alpha hashing, a dither that stays opaque, so they
   * need no sorting and their shaders stay the same once the fade ends
   * (none of the props' opaque textures carry alpha to dither through).
   */
  private hide(model: Object3D): Fading {
    const materials = new Map<Material, number>()
    model.traverse((o) => {
      if (o instanceof Mesh)
        for (const m of [o.material].flat() as Material[]) materials.set(m, m.opacity)
    })
    for (const m of materials.keys()) {
      if (!m.transparent) m.alphaHash = true
      m.opacity = 0
    }
    return {
      materials: [...materials].map(([material, opacity]) => ({ material, opacity })),
      start: null,
    }
  }

  /** Sits the airframe on its wheels at its ground attitude, wheels on the floor. */
  private standOnWheels(spec: AircraftSpec): void {
    const bottoms = spec.wheels.map((w) =>
      new Vector3(...w.attach).setY(w.attach[1] - w.travel - w.radius),
    )
    const front = bottoms.reduce((a, b) => (b.z < a.z ? b : a))
    const back = bottoms.reduce((a, b) => (b.z > a.z ? b : a))
    const attitude = Math.atan2(back.y - front.y, back.z - front.z)
    const group = this.view!.group
    group.rotation.set(attitude, 0, 0)
    group.position.set(0, 0, 0)
    group.updateMatrix()
    const lowest = Math.min(...bottoms.map((b) => b.clone().applyMatrix4(group.matrix).y))
    group.position.set(0, -lowest, 0)
    this.stand.updateMatrixWorld(true)

    this.span = spec.surfaces[0]!.semiSpan * 2
    this.distance = this.span * 1.9
    // Look at the middle of the airframe, halfway from the prop to the tail.
    const tail = Math.max(...spec.wheels.map((w) => w.attach[2]))
    group.localToWorld(this.target.set(0, 0, (spec.propeller.position[2] + tail) / 2))

    // Contact shadows: under the fuselage, and darker under each tyre.
    group.updateMatrix()
    this.clearContact()
    const nose = spec.propeller.position[2]
    const fuselage = contactShadow(this.span * 0.22, (tail - nose) * 1.15, 0.3)
    fuselage.position.set(0, 0.002, (nose + tail) / 2)
    this.contact.add(fuselage)
    for (const [i, bottom] of bottoms.entries()) {
      const at = bottom.applyMatrix4(group.matrix)
      const size = spec.wheels[i]!.radius * 5
      const tyre = contactShadow(size, size, 0.55)
      tyre.position.set(at.x, 0.003, at.z)
      this.contact.add(tyre)
    }
  }

  private clearContact(): void {
    for (const m of this.contact.children as Mesh[]) {
      m.geometry.dispose()
      ;(m.material as Material).dispose()
    }
    this.contact.clear()
  }

  /** Each control surface half, keyed like telemetry deflections. */
  private bindSurfaces(spec: AircraftSpec): SweptSurface[] {
    const out: SweptSurface[] = []
    for (const s of spec.surfaces)
      for (const c of s.controls) {
        const throwDeg = controlThrowDeg(s, c)
        if (s.vertical || !s.mirrored) {
          out.push({ key: `${c.name}.center`, channel: c.channel, gain: c.gain, throwDeg })
        } else {
          out.push({ key: `${c.name}.right`, channel: c.channel, gain: c.gain, throwDeg })
          out.push({
            key: `${c.name}.left`,
            channel: c.channel,
            gain: c.mirrorGain ?? c.gain,
            throwDeg,
          })
        }
      }
    return out
  }

  private frame(time: number): void {
    const dt = Math.min(time - this.clock, 0.1)
    this.clock = time
    // A finger resting on the model holds it still too.
    const idle = time - this.lastGesture > SETTLE && this.pointers.size === 0
    if (idle) this.yaw += dt * 0.12

    if (this.view && this.spec) {
      // The routine waits while the pilot is turning the model by hand.
      if (!idle) this.routine += dt
      const t = (time - this.routine) % (ROUTINE.length * STEP)
      const active = ROUTINE[Math.floor(t / STEP)]
      // One smooth sweep each way, full throw at the peaks.
      const stick = Math.sin((2 * Math.PI * (t % STEP)) / STEP)
      const deflections: Record<string, number> = {}
      for (const s of this.surfaces) {
        const flap = s.channel === 'flap' ? Math.max(stick, 0) : 0
        const amount = s.channel === active ? (s.channel === 'flap' ? flap : stick) : 0
        deflections[s.key] = amount * s.gain * s.throwDeg
      }
      this.propAngle += (IDLE_RPM / 60) * 2 * Math.PI * dt
      this.view.animate({ rpm: IDLE_RPM, propAngle: this.propAngle, deflections })
    }
    this.fade()

    const c = this.camera
    this.dir.set(
      Math.cos(this.pitch) * Math.sin(this.yaw),
      Math.sin(this.pitch),
      Math.cos(this.pitch) * Math.cos(this.yaw),
    )
    const { target, dir } = this
    this.reach = orbitReach(target.toArray(), dir.toArray(), ROOM_BOX, WALL_MARGIN)
    c.position.copy(target).addScaledVector(dir, Math.min(this.distance, this.reach))
    c.lookAt(target)
    void this.renderer.render(this.scene, c)
  }

  private fade(): void {
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i]!
      const k = Math.min(1, (this.clock - f.start!) / FADE)
      for (const { material, opacity } of f.materials) material.opacity = k * opacity
      if (k === 1) this.fading.splice(i, 1)
    }
  }

  private resize(): void {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // A portrait phone widens the lens until the wings fit across.
    const across = Math.tan(MathUtils.degToRad(MIN_HORIZONTAL_FOV / 2)) / this.camera.aspect
    this.camera.fov = Math.max(VERTICAL_FOV, MathUtils.radToDeg(2 * Math.atan(across)))
    // Shift the picture's centre half the covered width left (and up).
    this.camera.setViewOffset(w, h, this.insets.right / 2, this.insets.bottom / 2, w, h)
  }

  private detach: (() => void) | null = null

  /** Drag to orbit, wheel or pinch to zoom. */
  private attach(): void {
    const el = this.canvas
    const zoom = (factor: number) => {
      // From where the camera is, not where it would be without the walls.
      const from = Math.min(this.distance, this.reach)
      this.distance = Math.min(this.span * 3, Math.max(this.span * 0.7, from * factor))
    }
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId)
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.lastGesture = this.clock
    }
    const move = (e: PointerEvent) => {
      const last = this.pointers.get(e.pointerId)
      if (!last) return
      this.lastGesture = this.clock
      if (this.pointers.size === 1) {
        this.yaw -= (e.clientX - last.x) * 0.008
        this.pitch = Math.min(1.2, Math.max(0.05, this.pitch + (e.clientY - last.y) * 0.006))
      } else {
        const other = [...this.pointers].find(([id]) => id !== e.pointerId)![1]
        const before = Math.hypot(last.x - other.x, last.y - other.y)
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y)
        if (before > 0 && after > 0) zoom(before / after)
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      this.lastGesture = this.clock
      zoom(Math.exp(e.deltaY * 0.001))
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    this.detach = () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }
}

/**
 * A soft dark ellipse lying on the floor, `width` across x and `along`
 * along z, m: the light the airframe keeps off the floor right under it,
 * which the sun's shadow map is too coarse to show.
 */
function contactShadow(width: number, along: number, darkness: number): Mesh {
  const material = new MeshBasicNodeMaterial({
    color: 0x000000,
    transparent: true,
    depthWrite: false,
  })
  const r = length(uv().sub(0.5).mul(2))
  material.opacityNode = float(darkness).mul(smoothstep(1, 0, r).pow(2))
  const mesh = new Mesh(new PlaneGeometry(width, along), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.renderOrder = 1
  return mesh
}
