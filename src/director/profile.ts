import * as THREE from 'three'
import type { PlayerController } from '../player/controller'
import type { ChunkManager } from '../world/manager'

/**
 * Player coping-behavior profiler (EXPANSION.md Spec B). Rolling signals,
 * ~5-minute horizon via exponential moving averages. The director reads
 * these to pick ONE exploit per run — the scheduler becomes a predator.
 *
 * Per-run, in-memory only. Tape 2 seeds the EMAs from the previous run's
 * persisted summary so the exploit can land from minute zero.
 */

const EMA_TAU = 150 // seconds; ~5 min effective window

export class PlayerProfile {
  /** Full >120° turns per minute while moving. */
  lookbackRate = 0
  /** Time sprinting / time moving. */
  sprintRatio = 0
  /** Mean lateral distance (m) to the nearest wall while traversing. */
  wallHug = 2.0
  /** RMB zoom activations per minute. */
  zoomUsage = 0
  /** Fraction of spawned notes actually read (narrative pushes it). */
  noteReader = 1
  /** Total seconds of profiling so far (signals are noise before ~90 s). */
  age = 0

  private yawAccum = 0
  private yawPrev = 0
  private turnWindowT = 0
  private lookbackEvents = 0 // decaying count
  private zoomEvents = 0
  private zoomPrev = 0
  private hugProbeT = 0
  private ray = new THREE.Raycaster()

  constructor() {
    this.ray.firstHitOnly = true
    this.ray.far = 2.6
  }

  /** Tape 2: inherit the previous run's read on this player. */
  seed(s: { sprintRatio: number; lookbackRate: number; zoomUsage: number; wallHug: number; noteReader?: number }): void {
    this.sprintRatio = s.sprintRatio
    this.lookbackRate = s.lookbackRate
    this.zoomUsage = s.zoomUsage
    this.wallHug = s.wallHug
    if (s.noteReader !== undefined) this.noteReader = s.noteReader
    this.age = 300 // trusted from minute zero
  }

  update(dt: number, player: PlayerController, world: ChunkManager): void {
    this.age += dt
    const speed = Math.hypot(player.velocity.x, player.velocity.z)
    const moving = speed > 0.4
    const k = 1 - Math.exp(-dt / EMA_TAU)

    // --- lookback: accumulate yaw change; a fast >120° swing while moving
    // counts as one check-behind. Events decay so the rate stays rolling.
    let dyaw = player.yaw - this.yawPrev
    this.yawPrev = player.yaw
    while (dyaw > Math.PI) dyaw -= Math.PI * 2
    while (dyaw < -Math.PI) dyaw += Math.PI * 2
    if (Math.sign(dyaw) === Math.sign(this.yawAccum) || this.yawAccum === 0) {
      this.yawAccum += dyaw
      this.turnWindowT += dt
    } else {
      this.yawAccum = dyaw
      this.turnWindowT = dt
    }
    if (this.turnWindowT > 1.6) {
      this.yawAccum = 0
      this.turnWindowT = 0
    }
    if (moving && Math.abs(this.yawAccum) > (Math.PI * 120) / 180) {
      this.lookbackEvents += 1
      this.yawAccum = 0
      this.turnWindowT = 0
    }
    this.lookbackEvents *= Math.exp(-dt / EMA_TAU)
    this.lookbackRate = this.lookbackEvents / (Math.min(this.age, EMA_TAU) / 60 + 1e-3)

    // --- sprint ratio (only updates while moving)
    if (moving) {
      this.sprintRatio += ((player.sprinting ? 1 : 0) - this.sprintRatio) * k
    }

    // --- zoom activations per minute
    if (player.zoom > 0.5 && this.zoomPrev <= 0.5) this.zoomEvents += 1
    this.zoomPrev = player.zoom
    this.zoomEvents *= Math.exp(-dt / EMA_TAU)
    this.zoomUsage = this.zoomEvents / (Math.min(this.age, EMA_TAU) / 60 + 1e-3)

    // --- wall hug: every 0.5 s while traversing, probe laterally both ways
    this.hugProbeT -= dt
    if (moving && this.hugProbeT <= 0) {
      this.hugProbeT = 0.5
      const colliders = world.collidersNear(player.position.x, player.position.z)
      if (colliders.length > 0) {
        let nearest = 2.6
        for (const side of [1, -1]) {
          _dir.set(Math.cos(player.yaw) * side, 0, -Math.sin(player.yaw) * side)
          _origin.set(player.position.x, 1.1, player.position.z)
          this.ray.set(_origin, _dir)
          for (const c of colliders) {
            const hit = this.ray.intersectObject(c, false)[0]
            if (hit && hit.distance < nearest) nearest = hit.distance
          }
        }
        this.wallHug += (nearest - this.wallHug) * Math.min(1, k * 8)
      }
    }
  }
}

const _dir = new THREE.Vector3()
const _origin = new THREE.Vector3()
