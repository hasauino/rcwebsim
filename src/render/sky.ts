import {
  DirectionalLight,
  EquirectangularReflectionMapping,
  HemisphereLight,
  MathUtils,
  Object3D,
  Vector3,
  type Scene,
} from 'three'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'

/** Sun position: elevation and azimuth (degrees true). Afternoon, south-west. */
export const SUN = { elevationDeg: 34, azimuthDeg: 235 }

export function sunDirection(
  elevationDeg = SUN.elevationDeg,
  azimuthDeg = SUN.azimuthDeg,
): Vector3 {
  const el = MathUtils.degToRad(elevationDeg)
  const az = MathUtils.degToRad(azimuthDeg)
  // World: +x east, -z north.
  return new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
}

export interface SkyRig {
  sun: DirectionalLight
  setShadows(enabled: boolean): void
}

/**
 * Physical sky (with procedural clouds), one directional sun with cascaded
 * shadow maps, and the HDRI for image-based ambient light. The sun direction
 * is a single value so time-of-day can drive it later.
 */
export async function createSky(scene: Scene): Promise<SkyRig> {
  const direction = sunDirection()

  const sky = new SkyMesh()
  sky.scale.setScalar(45000)
  sky.turbidity.value = 4
  sky.rayleigh.value = 1.2
  sky.mieCoefficient.value = 0.004
  sky.mieDirectionalG.value = 0.85
  sky.cloudCoverage.value = 0.35
  sky.cloudDensity.value = 0.5
  sky.sunPosition.value.copy(direction)
  sky.material.fog = false
  scene.add(sky)

  const env = await new HDRLoader().loadAsync(
    'assets/env/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
  )
  env.mapping = EquirectangularReflectionMapping
  scene.environment = env
  scene.environmentIntensity = 0.55

  scene.add(new HemisphereLight(0xbfd8ff, 0x4a5a2a, 0.35))

  const sun = new DirectionalLight(0xfff1dc, 3.2)
  sun.position.copy(direction).multiplyScalar(400)
  sun.target = new Object3D()
  scene.add(sun.target)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0003
  sun.shadow.normalBias = 0.02
  scene.add(sun)

  const csm = new CSMShadowNode(sun, {
    cascades: 3,
    maxFar: 500,
    mode: 'practical',
    lightMargin: 120,
  })
  csm.fade = true
  sun.shadow.shadowNode = csm

  return {
    sun,
    setShadows(enabled: boolean) {
      sun.castShadow = enabled
    },
  }
}
