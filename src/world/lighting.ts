import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { CEIL_H } from './gen'
import type { ChunkManager } from './manager'

const POOL_SIZE = 6
const RANGE = 16 // fixtures beyond this are emissive-only; fog owns the distance

/**
 * Real light is pooled: the N nearest fixtures get RectAreaLights (LTC),
 * everything else glows via emissive + bloom. Flicker personality comes
 * from each fixture's seed; the director can later force dips/dropouts.
 */
export class FixturePool {
  private lights: THREE.RectAreaLight[] = []
  /** Global flicker multiplier — the director's dial (silence events, brownouts). */
  master = 1

  constructor(scene: THREE.Scene) {
    RectAreaLightUniformsLib.init()
    for (let i = 0; i < POOL_SIZE; i++) {
      const l = new THREE.RectAreaLight(0xffeebf, 0, 1.2, 0.6)
      l.visible = false
      scene.add(l)
      this.lights.push(l)
    }
  }

  update(world: ChunkManager, px: number, pz: number, time: number): void {
    type Near = { x: number; z: number; seed: number; d: number }
    const near: Near[] = []
    for (const chunk of world.all()) {
      for (const f of chunk.fixtures) {
        const dx = f.x - px
        const dz = f.z - pz
        const d = dx * dx + dz * dz
        if (d < RANGE * RANGE) near.push({ x: f.x, z: f.z, seed: f.seed, d })
      }
    }
    near.sort((a, b) => a.d - b.d)

    for (let i = 0; i < POOL_SIZE; i++) {
      const l = this.lights[i]
      const f = near[i]
      if (!f) {
        l.visible = false
        continue
      }
      l.visible = true
      l.position.set(f.x, CEIL_H - 0.06, f.z)
      l.lookAt(f.x, 0, f.z)
      l.intensity = 6.5 * this.flicker(f.seed, time) * this.master
    }
  }

  /** Mostly-steady ballast shimmer; some fixtures have a nervous personality. */
  private flicker(seed: number, t: number): number {
    const nervous = seed > 0.8 ? 1.0 : 0.25
    const fast = Math.sin(t * 47.0 + seed * 80.0) * Math.sin(t * 31.7 + seed * 13.0)
    const slow = Math.sin(t * 1.3 + seed * 40.0)
    let v = 1 - 0.025 * (fast * 0.5 + 0.5) - 0.02 * (slow * 0.5 + 0.5)
    // occasional deep dip for nervous fixtures
    const dip = Math.sin(t * 0.43 + seed * 200.0)
    if (dip > 0.992) v *= 0.45 + 0.4 * Math.abs(Math.sin(t * 60.0))
    return v * (1 - 0.06 * nervous * (fast * 0.5 + 0.5))
  }
}
