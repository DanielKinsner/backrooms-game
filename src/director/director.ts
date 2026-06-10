import * as THREE from 'three'
import type { ChunkManager } from '../world/manager'
import type { FixturePool } from '../world/lighting'
import type { AudioEngine } from '../audio/engine'
import type { PlayerController } from '../player/controller'
import { Rng } from '../core/rng'

/**
 * The dread director (DESIGN.md §8). Paces "wrongness" on a 60–120s
 * cadence, escalating IMPLICATION not volume; never the same event class
 * twice in a row; density backs off after each spike; silence is
 * scheduled, not random. The entity is a position that exists only as
 * sound (§7) — the player's pattern-matching brain builds the monster.
 */

type EventClass = 'detune' | 'impact' | 'brownout' | 'silence' | 'echo' | 'restitch'

interface DirectorOptions {
  world: ChunkManager
  lights: FixturePool
  audio: AudioEngine | null // integration-tolerant: events degrade gracefully
  player: PlayerController
}

export class Director {
  /** 0..1, the master tension dial. Acts (Task 9) shape it; events spike it. */
  dread = 0.08

  private time = 0
  private nextEventAt = 45 // first wrongness lands after a long calm stretch
  private lastClass: EventClass | null = null
  private eventCount = 0
  private rng = new Rng('the-tape-watches')

  // presence: a virtual position that stalks without a body
  private presence = new THREE.Vector3(40, 0, 40)
  private presenceActive = false
  private presenceTimer = 0

  // transient event state
  private brownoutT = -1
  private detuneT = -1
  private silenceCooldown = 0
  private silencesFired = 0

  constructor(private readonly opts: DirectorOptions) {}

  update(dt: number): void {
    this.time += dt
    this.silenceCooldown = Math.max(0, this.silenceCooldown - dt)

    // Baseline dread creeps with time-in-maze; Task 9's acts will drive this harder.
    this.dread = Math.min(1, this.dread + dt * 0.0006)
    this.opts.audio?.setDread(this.dread)

    this.stepPresence(dt)
    this.stepTransients(dt)

    if (this.time >= this.nextEventAt) {
      this.fireEvent()
      // 60–120s cadence, slightly tighter as dread rises (psych brief)
      const base = THREE.MathUtils.lerp(120, 62, this.dread)
      this.nextEventAt = this.time + base * this.rng.range(0.75, 1.25)
    }
  }

  /**
   * The two-brain model (market brief, Alien: Isolation): the director
   * knows where the player is; the presence only gets nudged toward the
   * general area and drifts imperfectly. It manifests as audio at the
   * edge of HRTF resolution.
   */
  private stepPresence(dt: number): void {
    const p = this.opts.player.position
    this.presenceTimer -= dt
    if (!this.presenceActive) {
      if (this.dread > 0.22 && this.presenceTimer <= 0) {
        this.presenceActive = true
        // materialize the idea of it somewhere off-screen, 25-40m out
        const a = this.rng.range(0, Math.PI * 2)
        const d = this.rng.range(25, 40)
        this.presence.set(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d)
        this.presenceTimer = this.rng.range(40, 90) // how long it stays interested
      }
      return
    }

    // drift toward the player's GENERAL area (never the exact spot), slowly
    const target = _v
      .set(p.x + Math.sin(this.time * 0.13) * 9, 0, p.z + Math.cos(this.time * 0.11) * 9)
    const dir = target.sub(this.presence)
    const dist = dir.length()
    if (dist > 1) {
      dir.normalize()
      this.presence.addScaledVector(dir, Math.min(0.9 * dt * (0.5 + this.dread), dist))
    }

    // hum bends near it; sometimes the carpet remembers footsteps
    const near = Math.max(0, 1 - Math.hypot(this.presence.x - p.x, this.presence.z - p.z) / 18)
    this.opts.audio?.setHumDetune(near * -9 * this.dread)
    if (near > 0.4 && this.rng.chance(dt * 0.5)) {
      this.opts.audio?.playSpatial('impact', this.presence.x, 1.2, this.presence.z, {
        gain: 0.05 + near * 0.07,
      })
    }

    if (this.presenceTimer <= 0) {
      this.presenceActive = false
      this.presenceTimer = this.rng.range(60, 140) // it loses interest. for a while.
      this.opts.audio?.setHumDetune(0)
    }
  }

  private stepTransients(dt: number): void {
    if (this.brownoutT >= 0) {
      this.brownoutT -= dt
      this.opts.lights.master = this.brownoutT > 0 ? 0.45 + Math.random() * 0.15 : 1
      if (this.brownoutT <= 0) this.brownoutT = -1
    }
    if (this.detuneT >= 0) {
      this.detuneT -= dt
      if (this.detuneT <= 0) {
        this.detuneT = -1
        if (!this.presenceActive) this.opts.audio?.setHumDetune(0)
      }
    }
  }

  private fireEvent(): void {
    const pool: EventClass[] = ['detune', 'impact', 'echo', 'restitch']
    if (this.dread > 0.25) pool.push('brownout')
    if (this.dread > 0.35 && this.silencesFired < 2 && this.silenceCooldown <= 0) {
      pool.push('silence', 'silence') // weighted: silence is the headliner
    }
    let cls = this.rng.pick(pool)
    if (cls === this.lastClass) cls = this.rng.pick(pool) // never twice in a row (one reroll is enough in practice)
    this.lastClass = cls
    this.eventCount++

    const p = this.opts.player.position
    switch (cls) {
      case 'detune': {
        // the hum goes six cents wrong for half a minute — felt, not heard
        this.opts.audio?.setHumDetune(this.rng.chance(0.5) ? 6 : -6)
        this.detuneT = this.rng.range(20, 40)
        break
      }
      case 'impact': {
        // a single distant THUMP from a specific direction. nothing follows it.
        const a = this.rng.range(0, Math.PI * 2)
        const d = this.rng.range(28, 55)
        this.opts.audio?.playSpatial('impact', p.x + Math.cos(a) * d, 1.5, p.z + Math.sin(a) * d, {
          gain: 0.22,
        })
        break
      }
      case 'brownout': {
        this.brownoutT = this.rng.range(2, 4.5)
        break
      }
      case 'silence': {
        // THE weapon. the hum stops. nothing replaces it.
        this.opts.audio?.silence(this.rng.range(8, 18))
        this.silencesFired++
        this.silenceCooldown = 240
        this.dread = Math.min(1, this.dread + 0.07)
        break
      }
      case 'echo': {
        // one extra footstep, behind, half a beat late
        const yaw = this.opts.player.yaw
        this.opts.audio?.playSpatial(
          'impact',
          p.x + Math.sin(yaw) * 7,
          0.2,
          p.z + Math.cos(yaw) * 7,
          { gain: 0.06 },
        )
        break
      }
      case 'restitch': {
        this.restitchBehind()
        break
      }
    }
  }

  /**
   * Non-Euclidean gaslighting (§6): re-seed chunks that are unloaded and
   * BEHIND the player. The map in their head rots; nothing ever visibly
   * changes. Runs as an event but also opportunistically.
   */
  private restitchBehind(): void {
    const p = this.opts.player.position
    const yaw = this.opts.player.yaw
    const bx = Math.sin(yaw) // behind = +forward reversed; forward is (-sin, -cos)
    const bz = Math.cos(yaw)
    const [pcx, pcz] = this.opts.world.chunkOf(p.x, p.z)
    for (let i = 0; i < 6; i++) {
      const dist = this.rng.int(4, 7) // beyond UNLOAD_RADIUS → guaranteed unloaded
      const side = this.rng.range(-2.5, 2.5)
      const cx = pcx + Math.round(bx * dist + -bz * side)
      const cz = pcz + Math.round(bz * dist + bx * side)
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) <= 3) continue // never touch resident space
      this.opts.world.bumpSalt(cx, cz)
    }
  }

  /** Task 9 hooks: acts drive dread directly. */
  setDreadFloor(v: number): void {
    this.dread = Math.max(this.dread, v)
  }
}

const _v = new THREE.Vector3()
