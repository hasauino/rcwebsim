import {
  ACESFilmicToneMapping,
  CircleGeometry,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Fog,
  HemisphereLight,
  Mesh,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  type Texture,
} from 'three'
import { MeshStandardNodeMaterial, WebGPURenderer } from 'three/webgpu'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { controlThrowDeg } from '../sim/aero'
import type { AircraftSpec, Channel } from '../sim/aircraft/types'
import { AircraftView } from './aircraft'
import { sunDirection } from './sky'

const SKY = 0xb9cfe4
/** One stick routine: ailerons, elevator, rudder, then a rest, seconds each. */
const ROUTINE: (Channel | null)[] = ['aileron', 'elevator', 'rudder', null]
const STEP = 1.6
/** A slow turn of the prop: the blades still show (the blur disc starts at 300 rpm). */
const IDLE_RPM = 240
/** Auto-rotation resumes this long after the last gesture, s. */
const SETTLE = 3

const target = new Vector3()

/** One moving half of a control surface, as the routine drives it. */
interface SweptSurface {
  /** Telemetry deflection key, e.g. "aileron.left". */
  key: string
  channel: Channel
  /** Channel-to-deflection sign on this half. */
  gain: number
  throwDeg: number
}

/**
 * The start screen's turntable: one aircraft at a time in a small scene of
 * its own, lit like the field, standing on its wheels on a patch of grass.
 * It turns slowly and orbits on drag, zooms on wheel or pinch; the prop
 * idles and the surfaces sweep through their throws now and then. A plain
 * class outside Vue, like World3D (ADR-0009).
 */
export class AircraftPreview {
  private readonly renderer: WebGPURenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(32, 1, 0.05, 200)
  private readonly sun = new DirectionalLight(0xffffff, 2.6)
  private readonly ground: Mesh
  private view: AircraftView | null = null
  private spec: AircraftSpec | null = null
  private surfaces: SweptSurface[] = []
  private yaw = 2.4
  private pitch = 0.32
  private distance = 3
  private span = 1.5
  private lastGesture = -Infinity
  private clock = 0
  private propAngle = 0
  private routine = 0
  private readonly pointers = new Map<number, { x: number; y: number }>()
  private resizeObserver: ResizeObserver | null = null
  private loading = 0
  private disposed = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false })
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.85
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFSoftShadowMap
    this.scene.background = new Color(SKY)
    this.scene.add(new HemisphereLight(0xbfd8ff, 0x4a5a2a, 0.5))
    this.sun.position.copy(sunDirection()).multiplyScalar(10)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.01
    this.scene.add(this.sun, this.sun.target)
    this.ground = new Mesh(
      new CircleGeometry(1, 64),
      new MeshStandardNodeMaterial({ color: 0x5f7d3c, roughness: 1 }),
    )
    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = true
    this.scene.add(this.ground)
  }

  async init(): Promise<void> {
    await this.renderer.init()
    if (this.disposed) return
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.resize()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.canvas)
    this.attach()
    this.renderer.setAnimationLoop((time) => this.frame(time / 1000))
    new HDRLoader()
      .loadAsync('assets/env/kloofendal_48d_partly_cloudy_puresky_1k.hdr')
      .then((env: Texture) => {
        if (this.disposed) return env.dispose()
        env.mapping = EquirectangularReflectionMapping
        this.scene.environment = env
        this.scene.environmentIntensity = 0.6
      })
      .catch(() => {
        // The hemisphere light alone still shows the model.
      })
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
      this.scene.remove(this.view.group)
      this.view.dispose()
    }
    this.view = view
    this.spec = spec
    this.scene.add(view.group)
    this.standOnWheels(spec)
    this.surfaces = this.bindSurfaces(spec)
    this.routine = this.clock
    return found
  }

  dispose(): void {
    this.disposed = true
    this.view?.dispose()
    this.detach?.()
    this.resizeObserver?.disconnect()
    this.renderer.setAnimationLoop(null)
    this.scene.environment?.dispose()
    this.renderer.dispose()
  }

  /** Sits the airframe on its wheels at its ground attitude, wheels on the grass. */
  private standOnWheels(spec: AircraftSpec): void {
    const bottoms = spec.wheels.map((w) =>
      new Vector3(...w.attach).setY(w.attach[1] - w.travel - w.radius),
    )
    const front = bottoms.reduce((a, b) => (b.z < a.z ? b : a))
    const back = bottoms.reduce((a, b) => (b.z > a.z ? b : a))
    const attitude = Math.atan2(back.y - front.y, back.z - front.z)
    const group = this.view!.group
    group.rotation.set(attitude, 0, 0)
    group.updateMatrixWorld(true)
    const lowest = Math.min(...bottoms.map((b) => b.clone().applyMatrix4(group.matrixWorld).y))
    group.position.set(0, -lowest, 0)

    this.span = spec.surfaces[0]!.semiSpan * 2
    this.distance = this.span * 1.9
    this.ground.scale.setScalar(this.span * 12)
    this.scene.fog = new Fog(SKY, this.span * 3, this.span * 9)
    const shadow = this.sun.shadow.camera
    shadow.left = shadow.bottom = -this.span
    shadow.right = shadow.top = this.span
    shadow.near = 0.1
    shadow.far = 30
    shadow.updateProjectionMatrix()
    // Look at the middle of the airframe, halfway from the prop to the tail.
    const tail = Math.max(...spec.wheels.map((w) => w.attach[2]))
    group.localToWorld(target.set(0, 0, (spec.propeller.position[2] + tail) / 2))
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
    if (idle) this.yaw += dt * 0.22

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

    const c = this.camera
    const flat = this.distance * Math.cos(this.pitch)
    c.position.set(
      target.x + flat * Math.sin(this.yaw),
      target.y + this.distance * Math.sin(this.pitch),
      target.z + flat * Math.cos(this.yaw),
    )
    c.lookAt(target)
    void this.renderer.render(this.scene, c)
  }

  private resize(): void {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private detach: (() => void) | null = null

  /** Drag to orbit, wheel or pinch to zoom. */
  private attach(): void {
    const el = this.canvas
    const zoom = (factor: number) => {
      this.distance = Math.min(this.span * 4, Math.max(this.span * 0.9, this.distance * factor))
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
        this.pitch = Math.min(1.2, Math.max(0.03, this.pitch + (e.clientY - last.y) * 0.006))
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
