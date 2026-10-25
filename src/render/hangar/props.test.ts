import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LAYOUT } from './layout'
import { ALLOWED_LICENSES, PROPS, SURFACES, propUrl, surfaceUrl, type PropId } from './props'

const credits = { ...PROPS, ...SURFACES }

describe('hangar assets', () => {
  it.each(Object.entries(credits))('%s is credited under a licence we may ship', (_, credit) => {
    expect(ALLOWED_LICENSES).toContain(credit.license)
    expect(credit.author).not.toBe('')
    expect(credit.url).toMatch(/^https:\/\//)
  })

  it('ships every catalogued file', () => {
    for (const id of Object.keys(PROPS) as PropId[])
      expect(existsSync(`public/${propUrl(id)}`), id).toBe(true)
    for (const id of Object.keys(SURFACES) as (keyof typeof SURFACES)[])
      for (const map of ['diff', 'nor', 'arm'] as const)
        expect(existsSync(`public/${surfaceUrl(id, map)}`), `${id} ${map}`).toBe(true)
  })

  it('places every catalogued prop, so nothing ships unused', () => {
    const placed = new Set(LAYOUT.map((p) => p.prop))
    for (const id of Object.keys(PROPS)) expect(placed, id).toContain(id)
  })

  it('ships nothing that is not catalogued, so nothing goes uncredited', () => {
    const shipped = [
      ...readdirSync('public/assets/hangar').filter((f) => f.endsWith('.glb')),
      ...readdirSync('public/assets/hangar/textures').map((f) => `textures/${f}`),
    ]
    const catalogued = new Set([
      ...(Object.keys(PROPS) as PropId[]).map((id) => propUrl(id)),
      ...(Object.keys(SURFACES) as (keyof typeof SURFACES)[]).flatMap((id) =>
        (['diff', 'nor', 'arm'] as const).map((map) => surfaceUrl(id, map)),
      ),
    ])
    for (const file of shipped) expect(catalogued, file).toContain(`assets/hangar/${file}`)
  })
})
