import * as THREE from 'three'
import { getGlowTexture } from '../world/materials'

const COUNT = 220
const BOX_XZ = 16 // motes live in a box this wide, re-centered on the camera
const BOX_Y = 2.7

/** Wrap a relative coordinate into [-BOX_XZ/2, BOX_XZ/2). */
function wrapHalf(r: number): number {
  return r - Math.round(r / BOX_XZ) * BOX_XZ
}

/**
 * Drifting dust motes. Nothing says "the air in here is old" cheaper than
 * 220 points sinking through fluorescent light. Additive, fog-faded, and
 * dimmed to nothing during the blackout (dust is only visible because of
 * the light; that's also true in real life).
 */
export class DustMotes {
  private readonly points: THREE.Points
  private readonly mat: THREE.PointsMaterial
  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly phase: Float32Array
  private time = 0

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(COUNT * 3)
    this.vel = new Float32Array(COUNT)
    this.phase = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * BOX_XZ
      this.pos[i * 3 + 1] = Math.random() * BOX_Y
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * BOX_XZ
      this.vel[i] = 0.018 + Math.random() * 0.05 // sink rate
      this.phase[i] = Math.random() * Math.PI * 2
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.mat = new THREE.PointsMaterial({
      map: getGlowTexture(),
      color: 0xfff3cf,
      size: 0.035,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
    this.points = new THREE.Points(geo, this.mat)
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  update(dt: number, cx: number, cz: number, lightLevel: number): void {
    this.time += dt
    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3
      // world-space drift: sink + a slow lateral wander
      this.pos[ix] += Math.sin(this.time * 0.21 + this.phase[i]) * 0.013 * dt * 60
      this.pos[ix + 1] -= this.vel[i] * dt
      this.pos[ix + 2] += Math.cos(this.time * 0.17 + this.phase[i] * 1.7) * 0.013 * dt * 60
      if (this.pos[ix + 1] < 0.02) this.pos[ix + 1] = BOX_Y - 0.05
      // keep each mote inside the camera-centered box (toroidal wrap)
      this.pos[ix] = cx + wrapHalf(this.pos[ix] - cx)
      this.pos[ix + 2] = cz + wrapHalf(this.pos[ix + 2] - cz)
    }
    ;(this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    this.mat.opacity = 0.16 * lightLevel
  }
}
