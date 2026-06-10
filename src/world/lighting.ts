import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { CEIL_H } from './gen'
import { worldMaterials, glowMaterials } from './materials'
import type { ChunkManager } from './manager'

const POOL_SIZE = 6
const RANGE = 16 // fixtures beyond this are emissive-only; fog owns the distance

// Quake lightstyle 10 — "mmamammmmammamamaaamammma" — 25 years of shipped
// horror agrees this is what electrical failure looks like. Sampled at
// 10 chars/sec with HARD steps (no interpolation; the hard step IS the look).
const FLICKER_STYLE = 'mmamammmmammamamaaamammma'
const STYLE_RATE = 10 // chars per second

/**
 * Real fluorescent tubes spike at 546 nm (mercury green) with a deep red
 * deficit — the "sickly" of sickly fluorescents is literal physics, and warm
 * studio yellow is the one thing this light should never be.
 */
const TUBE_COLOR = 0xeef3c4

/**
 * Real light is pooled: the N nearest fixtures get RectAreaLights (LTC),
 * everything else glows via emissive + bloom. Flicker personality comes
 * from each fixture's seed; the director forces dips, peripheral-only
 * misbehavior, and the one earned blackout.
 */
export class FixturePool {
  private lights: THREE.RectAreaLight[] = []
  /** Global flicker multiplier — the director's dial (silence events, brownouts). */
  master = 1

  // --- blackout state (canon: Level 0 blackout events, ~10 s of nothing) ---
  private blackoutT = -1 // counts down; <0 = inactive
  private blackoutDur = 0
  private readonly baseEmissive: number
  private readonly hemi: THREE.HemisphereLight | null
  private readonly scene: THREE.Scene
  private fogColor = new THREE.Color()
  private fogDark = new THREE.Color(0x050503)

  // --- peripheral dim: one fixture misbehaves only where you aren't looking ---
  private dimX = 0
  private dimZ = 0
  private dimUntil = -1
  private time = 0

  constructor(scene: THREE.Scene, hemi?: THREE.HemisphereLight) {
    RectAreaLightUniformsLib.init()
    this.scene = scene
    this.hemi = hemi ?? null
    this.baseEmissive = worldMaterials.fixture.emissiveIntensity
    if (scene.fog && 'color' in scene.fog) this.fogColor.copy(scene.fog.color)
    for (let i = 0; i < POOL_SIZE; i++) {
      const l = new THREE.RectAreaLight(TUBE_COLOR, 0, 1.2, 0.6)
      l.visible = false
      scene.add(l)
      this.lights.push(l)
    }
  }

  /**
   * The earned lights-out. Every fixture dies at once — and because the hum
   * is the fixtures' voice, the director cuts audio in the same call. The
   * last 1.4 s replays a real dying-tube re-strike: stutter, catch, overshoot.
   */
  blackout(seconds: number): void {
    if (this.blackoutT >= 0) return
    this.blackoutDur = seconds
    this.blackoutT = seconds
  }

  get blackedOut(): boolean {
    return this.blackoutT >= 0
  }

  private lastLevel = 1

  /** 0..1 — how lit the world currently is (dust/halos ride this). */
  get lightLevel(): number {
    return this.lastLevel
  }

  /** Director: dim the fixture nearest (x,z) to 35% until cancelled/expired. */
  dimAt(x: number, z: number, seconds: number): void {
    this.dimX = x
    this.dimZ = z
    this.dimUntil = this.time + seconds
  }

  cancelDim(): void {
    this.dimUntil = -1
  }

  private prevTime = -1

  update(world: ChunkManager, px: number, pz: number, time: number): void {
    const dt = this.prevTime < 0 ? 0 : Math.max(0, Math.min(0.1, time - this.prevTime))
    this.prevTime = time
    this.time = time

    // --- blackout envelope ---
    let blackLevel = 1 // 1 = lights on
    if (this.blackoutT >= 0) {
      this.blackoutT -= dt
      const elapsed = this.blackoutDur - this.blackoutT
      if (this.blackoutT <= 0) {
        this.blackoutT = -1
        blackLevel = 1
      } else if (elapsed < 0.09) {
        blackLevel = 0 // the cut is instant; that's what makes it a cut
      } else if (this.blackoutT < 1.4) {
        // re-strike: partial strikes that fail, then the catch at 110%
        const phase = 1.4 - this.blackoutT
        const step = Math.floor(phase * 14)
        const h = Math.sin(step * 127.31) * 43758.5453
        const r = h - Math.floor(h)
        blackLevel = phase > 1.15 ? 1.1 : r > 0.62 ? 0.55 + r * 0.4 : 0
      } else {
        blackLevel = 0
      }
    }

    // The world reacts: emissive tubes, halos, ambient bounce, the fog itself.
    this.lastLevel = blackLevel
    worldMaterials.fixture.emissiveIntensity = this.baseEmissive * Math.max(blackLevel, 0.012)
    if (glowMaterials.halo) glowMaterials.halo.opacity = 0.34 * blackLevel
    if (glowMaterials.pool) glowMaterials.pool.opacity = 0.05 * blackLevel
    if (this.hemi) this.hemi.intensity = 0.72 * Math.max(blackLevel, 0.04)
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.lerpColors(this.fogDark, this.fogColor, Math.max(blackLevel, 0.04))
      if (this.scene.background instanceof THREE.Color) {
        this.scene.background.copy(this.scene.fog.color)
      }
    }

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

    const dimActive = this.dimUntil > time
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
      let v = 6.5 * this.flicker(f.seed, time) * this.master * blackLevel
      if (dimActive && Math.abs(f.x - this.dimX) < 0.5 && Math.abs(f.z - this.dimZ) < 0.5) {
        v *= 0.35
      }
      l.intensity = v
    }
  }

  /**
   * Steady fixtures get ballast shimmer + a 120 Hz-ish micro-ripple; nervous
   * fixtures (seed > 0.8) run the Quake failure lightstyle with hard steps.
   */
  private flicker(seed: number, t: number): number {
    // sub-perceptual 120 Hz shimmer all tubes share (3% amplitude)
    const ripple = 1 - 0.03 * (Math.sin(t * 120 * Math.PI * 2) * 0.5 + 0.5)

    if (seed > 0.8) {
      // hard-stepped lightstyle, phase-offset per fixture so they never sync
      const phase = t * STYLE_RATE + seed * 100
      const ch = FLICKER_STYLE.charCodeAt(Math.floor(phase) % FLICKER_STYLE.length) - 97
      return (ch / 12.5) * ripple
    }

    const fast = Math.sin(t * 47.0 + seed * 80.0) * Math.sin(t * 31.7 + seed * 13.0)
    const slow = Math.sin(t * 1.3 + seed * 40.0)
    let v = 1 - 0.025 * (fast * 0.5 + 0.5) - 0.02 * (slow * 0.5 + 0.5)
    // occasional deep dip even for steady fixtures
    const dip = Math.sin(t * 0.43 + seed * 200.0)
    if (dip > 0.992) v *= 0.45 + 0.4 * Math.abs(Math.sin(t * 60.0))
    return v * ripple
  }
}
