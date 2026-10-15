import {
  ACESFilmicToneMapping,
  Fog,
  PCFShadowMap,
  Scene,
  Vector3,
  type InstancedMesh,
  type Quaternion,
} from 'three'
import { WebGPURenderer } from 'three/webgpu'
import type { AircraftSpec } from '../sim/aircraft/types'
import type { Simulation, Telemetry } from '../sim/simulation'
import { AircraftView } from './aircraft'
import { CameraRig, type CameraMode } from './cameras'
import { DebugOverlay } from './debug'
import { createField } from './field'
import { createGrass } from './grass'
import { createSky, type SkyRig } from './sky'
import { createTrees } from './trees'

export type Quality = 'low' | 'medium' | 'high'

const QUALITY: Record<Quality, { pixelRatio: number; terrain: number; grass: number }> = {
  low: { pixelRatio: 1, terrain: 192, grass: 0 },
  medium: { pixelRatio: 1.5, terrain: 320, grass: 40000 },
  high: { pixelRatio: 2, terrain: 512, grass: 120000 },
}

export interface ViewOptions {
  camera: CameraMode
  autoZoom: boolean
  fov: number
  debugOverlay: boolean
  shadows: boolean
  grass: boolean
}

const right = new Vector3()

/** Owns the renderer, the scene and everything in it. */
export class World3D {
  readonly renderer: WebGPURenderer
  readonly scene = new Scene()
  readonly cameras: CameraRig
  readonly aircraft: AircraftView
  readonly debug: DebugOverlay
  private sky: SkyRig | null = null
  private grass: InstancedMesh | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    spec: AircraftSpec,
    sim: Simulation,
  ) {
    this.renderer = new WebGPURenderer({ canvas, antialias: true })
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.85
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFShadowMap
    this.cameras = new CameraRig(canvas.clientWidth / Math.max(canvas.clientHeight, 1))
    this.cameras.span = spec.surfaces[0]!.semiSpan * 2
    this.aircraft = new AircraftView(spec)
    this.debug = new DebugOverlay(sim)
    this.aircraft.group.add(this.debug.group)
    this.scene.add(this.aircraft.group)
    this.scene.fog = new Fog(0xb9c9d9, 1500, 14000)
  }

  /** Builds the scene. Resolves whether the aircraft's glTF model was found. */
  async init(quality: Quality, onProgress: (label: string) => void): Promise<boolean> {
    await this.renderer.init()
    const q = QUALITY[quality]
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio))
    this.resize()

    onProgress('Sky and lighting')
    this.sky = await createSky(this.scene)
    onProgress('Flying field')
    this.scene.add(await createField(q.terrain))
    onProgress('Trees')
    this.scene.add(await createTrees())
    if (q.grass > 0) {
      this.grass = createGrass(q.grass)
      this.scene.add(this.grass)
    }
    onProgress('Aircraft')
    return this.aircraft.load()
  }

  /** Whether WebGPU is in use (false = the WebGL2 fallback). */
  get usingWebGPU(): boolean {
    return (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true
  }

  resize(): void {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    this.cameras.camera.aspect = w / h
    this.cameras.camera.updateProjectionMatrix()
  }

  render(
    dt: number,
    position: Vector3,
    quaternion: Quaternion,
    t: Telemetry,
    view: ViewOptions,
  ): void {
    this.aircraft.setPose(position, quaternion)
    this.aircraft.animate(t)
    this.debug.group.visible = view.debugOverlay || !this.aircraft.model
    if (this.debug.group.visible) this.debug.update()
    if (this.grass) this.grass.visible = view.grass
    this.sky?.setShadows(view.shadows)

    const rig = this.cameras
    rig.mode = view.camera
    rig.autoZoom = view.autoZoom
    rig.baseFov = view.fov
    rig.update(dt, position, quaternion)
    void this.renderer.render(this.scene, rig.camera)
  }

  /** Camera position and right vector, for spatial audio. */
  listener(): { position: Vector3; right: Vector3 } {
    const cam = this.cameras.camera
    right.set(1, 0, 0).applyQuaternion(cam.quaternion)
    return { position: cam.position, right }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
  }
}
