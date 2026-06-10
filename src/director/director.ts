import * as THREE from 'three'
import type { ChunkManager } from '../world/manager'
import type { FixturePool } from '../world/lighting'
import type { AudioEngine } from '../audio/engine'
import type { PlayerController } from '../player/controller'
import { getPareidoliaMaterial } from '../world/materials'
import { Rng } from '../core/rng'

/**
 * The dread director (DESIGN.md §8). Paces "wrongness" on a 60–120s
 * cadence, escalating IMPLICATION not volume; never the same event class
 * twice in a row; density backs off after each spike; silence is
 * scheduled, not random. The entity is a position that exists only as
 * sound (§7) — the player's pattern-matching brain builds the monster.
 *
 * Two rules imported from the research pass:
 *  - RETROACTIVE HEARING: the presence only ever activates within seconds
 *    of a noise the player made ("...it sure as hell has heard you").
 *  - THE CONE OF CONFUSION: presence sounds re-mirror behind the player's
 *    facing axis if they turn toward the source. You can never turn fast
 *    enough. It is always just behind.
 */

type EventClass =
  | 'detune'
  | 'impact'
  | 'brownout'
  | 'silence'
  | 'echo'
  | 'restitch'
  | 'doorClose'
  | 'ceilingTick'
  | 'humSwallow'
  | 'peripheralDim'
  | 'pareidolia'

interface DirectorOptions {
  world: ChunkManager
  lights: FixturePool
  audio: AudioEngine | null // integration-tolerant: events degrade gracefully
  player: PlayerController
  scene?: THREE.Scene // pareidolia decals need somewhere to live
}

interface MimicStep {
  at: number
  x: number
  z: number
  gain: number
}

export class Director {
  /** 0..1, the master tension dial. Acts (Task 9) shape it; events spike it. */
  dread = 0.08

  /** Narrative flips this after note 1 is read — the note that explains it. */
  mimicEnabled = false

  /** Hook for the OSD suite + tape damage: fires on every silent re-stitch. */
  onRestitch: (() => void) | null = null

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
  private muffleT = -1
  private silenceCooldown = 0
  private silencesFired = 0
  private dimCheckT = -1
  private blackoutFired = false

  // ---- the mimic (note 1's promise, kept) ----
  private mimicState: 'idle' | 'mirror' | 'tail' = 'idle'
  private mimicCooldown = 70
  private mimicEpisodes = 0
  private mimicT = 0 // time in current state
  private mimicStillT = 0 // how long the player has been still during mirror
  private stepInterval = 0.55 // measured player cadence (s between footfalls)
  private lastPlayerStepAt = -10
  private mimicQueue: MimicStep[] = []
  private tailStepsLeft = 0
  private nextTailStepAt = 0
  private mimicGain = 0.25

  // ---- pareidolia ----
  private pareidoliaCount = 0
  private decal: THREE.Mesh | null = null
  private decalT = 0
  private decalState: 'in' | 'hold' | 'out' = 'in'

  constructor(private readonly opts: DirectorOptions) {}

  update(dt: number): void {
    this.time += dt
    this.silenceCooldown = Math.max(0, this.silenceCooldown - dt)
    this.mimicCooldown = Math.max(0, this.mimicCooldown - dt)

    // Baseline dread creeps with time-in-maze; Task 9's acts will drive this harder.
    this.dread = Math.min(1, this.dread + dt * 0.0006)
    this.opts.audio?.setDread(this.dread)

    this.stepPresence(dt)
    this.stepTransients(dt)
    this.stepMimic(dt)
    this.stepDecal(dt)

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
      // Retroactive hearing: it only ever comes because you were loud.
      const heardYou = (this.opts.audio?.secondsSinceNoise() ?? Infinity) < 8
      if (this.dread > 0.22 && this.presenceTimer <= 0 && heardYou) {
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

    // hum bends near it; the 19 Hz flutter rises with it;
    // sometimes the carpet remembers footsteps
    const near = Math.max(0, 1 - Math.hypot(this.presence.x - p.x, this.presence.z - p.z) / 18)
    this.opts.audio?.setHumDetune(near * -9 * this.dread)
    this.opts.audio?.setHumBreath(near * (0.35 + this.dread * 0.4))
    if (near > 0.4 && this.rng.chance(dt * 0.5)) {
      this.mirrorPresenceIfWatched()
      this.opts.audio?.playSpatial('impact', this.presence.x, 1.2, this.presence.z, {
        gain: 0.05 + near * 0.07,
      })
    }

    if (this.presenceTimer <= 0) {
      this.presenceActive = false
      this.presenceTimer = this.rng.range(60, 140) // it loses interest. for a while.
      this.opts.audio?.setHumDetune(0)
      this.opts.audio?.setHumBreath(0)
    }
  }

  /**
   * Cone-of-confusion enforcement: if the player is facing the presence,
   * mirror it through their facing axis (same distance, now behind). HRTF
   * front-back ambiguity does the rest — the sound never resolves.
   */
  private mirrorPresenceIfWatched(): void {
    const p = this.opts.player.position
    const yaw = this.opts.player.yaw
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    const vx = this.presence.x - p.x
    const vz = this.presence.z - p.z
    const dot = vx * fx + vz * fz
    const len = Math.hypot(vx, vz)
    if (len < 1e-3 || dot / len < 0.45) return // already lateral/behind
    // reflect the forward component: v' = v - 2(v·f)f
    this.presence.set(p.x + vx - 2 * dot * fx, 0, p.z + vz - 2 * dot * fz)
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
    if (this.muffleT >= 0) {
      this.muffleT -= dt
      if (this.muffleT <= 0) {
        this.muffleT = -1
        this.opts.audio?.setHumMuffle(0)
      }
    }
    // peripheral dim: abort the moment the player looks toward it
    if (this.dimCheckT >= 0) {
      this.dimCheckT -= dt
      const p = this.opts.player.position
      const yaw = this.opts.player.yaw
      const fx = -Math.sin(yaw)
      const fz = -Math.cos(yaw)
      const vx = this.dimFx - p.x
      const vz = this.dimFz - p.z
      const len = Math.hypot(vx, vz)
      if (len > 0.01 && (vx * fx + vz * fz) / len > 0.5) {
        this.opts.lights.cancelDim()
        this.dimCheckT = -1
      }
      if (this.dimCheckT <= 0) this.dimCheckT = -1
    }
  }

  private dimFx = 0
  private dimFz = 0

  // ---- the mimic ------------------------------------------------------

  /** Wired from main: fires on every player footfall. */
  notePlayerStep(sprinting: boolean): void {
    const now = this.time
    const gap = now - this.lastPlayerStepAt
    if (gap > 0.2 && gap < 1.4) {
      // running estimate of the player's cadence
      this.stepInterval = this.stepInterval * 0.7 + gap * 0.3
    }
    this.lastPlayerStepAt = now
    void sprinting

    if (this.mimicState === 'mirror') {
      // answer each step, slightly late, slightly behind — same gait, wrong shoes
      const delay = 0.13 + this.rng.range(0, 0.1)
      const d = THREE.MathUtils.lerp(7.5, 4.5, Math.min(this.mimicT / 14, 1))
      const yaw = this.opts.player.yaw
      const p = this.opts.player.position
      const lat = this.rng.range(-1.2, 1.2)
      this.mimicQueue.push({
        at: now + delay,
        x: p.x + Math.sin(yaw) * d + Math.cos(yaw) * lat,
        z: p.z + Math.cos(yaw) * d - Math.sin(yaw) * lat,
        gain: this.mimicGain,
      })
      this.mimicGain = Math.min(0.62, this.mimicGain + 0.025)
    }
  }

  private stepMimic(dt: number): void {
    const audio = this.opts.audio
    if (!audio) return
    const p = this.opts.player.position
    const speed = Math.hypot(this.opts.player.velocity.x, this.opts.player.velocity.z)

    // flush due steps
    while (this.mimicQueue.length > 0 && this.mimicQueue[0].at <= this.time) {
      const s = this.mimicQueue.shift()!
      audio.playMimicStep(s.x, s.z, s.gain)
    }

    switch (this.mimicState) {
      case 'idle': {
        if (
          this.mimicEnabled &&
          this.mimicEpisodes < 3 &&
          this.mimicCooldown <= 0 &&
          this.dread > 0.26 &&
          speed > 0.5 &&
          (audio.secondsSinceNoise() ?? Infinity) < 10
        ) {
          this.mimicState = 'mirror'
          this.mimicT = 0
          this.mimicStillT = 0
          this.mimicGain = 0.22
        }
        break
      }
      case 'mirror': {
        this.mimicT += dt
        this.mimicStillT = speed < 0.3 ? this.mimicStillT + dt : 0
        if (this.mimicStillT > 0.55) {
          // THE moment. The player stopped. Count to ten.
          this.mimicState = 'tail'
          this.tailStepsLeft = this.rng.int(6, 11)
          this.nextTailStepAt = this.time + this.stepInterval * this.rng.range(1.0, 1.3)
        } else if (this.mimicT > 16) {
          this.endMimic() // they never stopped; it just fades out of sync
        }
        break
      }
      case 'tail': {
        if (this.time >= this.nextTailStepAt) {
          const d = 4.5 + this.tailStepsLeft * 0.35 // each step slightly... closer? no: walking PAST
          const yaw = this.opts.player.yaw
          const drift = (this.rng.range(0.6, 1.4) * (11 - this.tailStepsLeft)) / 11
          // the steps angle away to the player's flank as they continue
          const a = yaw + Math.PI + drift * 0.9
          this.opts.audio?.playMimicStep(
            p.x - Math.sin(a) * d,
            p.z - Math.cos(a) * d,
            this.mimicGain * (0.55 + (this.tailStepsLeft / 11) * 0.45),
          )
          this.tailStepsLeft--
          this.nextTailStepAt = this.time + this.stepInterval * this.rng.range(0.92, 1.12)
          if (this.tailStepsLeft <= 0) this.endMimic()
        }
        break
      }
    }
  }

  private endMimic(): void {
    this.mimicState = 'idle'
    this.mimicEpisodes++
    this.mimicCooldown = this.rng.range(160, 280)
    this.mimicQueue.length = 0
    this.dread = Math.min(1, this.dread + 0.05)
  }

  // ---- pareidolia ------------------------------------------------------

  /** A stain that almost has a face, in the wallpaper, off-center only. */
  private tryPareidolia(): void {
    if (!this.opts.scene || this.decal || this.pareidoliaCount >= 3) return
    const p = this.opts.player.position
    const yaw = this.opts.player.yaw
    const ray = new THREE.Raycaster()
    ray.firstHitOnly = true
    for (let i = 0; i < 8; i++) {
      const side = this.rng.chance(0.5) ? 1 : -1
      const a = yaw + Math.PI + side * this.rng.range(0.85, 1.35) // 49°-77° off gaze
      const dir = _v.set(-Math.sin(a), 0, -Math.cos(a)).normalize()
      ray.set(new THREE.Vector3(p.x, 1.58, p.z), dir.clone())
      ray.far = 9
      const colliders = this.opts.world.collidersNear(p.x, p.z)
      let best: THREE.Intersection | null = null
      for (const c of colliders) {
        const hit = ray.intersectObject(c, false)[0]
        if (hit && (!best || hit.distance < best.distance)) best = hit
      }
      if (!best || best.distance < 2.5) continue
      const n = best.face?.normal
      if (!n || Math.abs(n.y) > 0.3) continue // walls only

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), getPareidoliaMaterial())
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.opacity = 0
      mesh.position.copy(best.point).addScaledVector(n, 0.015)
      mesh.lookAt(best.point.x + n.x, best.point.y + n.y, best.point.z + n.z)
      mesh.rotateZ(this.rng.range(-0.12, 0.12))
      this.opts.scene.add(mesh)
      this.decal = mesh
      this.decalT = 0
      this.decalState = 'in'
      this.pareidoliaCount++
      return
    }
  }

  private stepDecal(dt: number): void {
    if (!this.decal || !this.opts.scene) return
    this.decalT += dt
    const mat = this.decal.material as THREE.MeshStandardMaterial
    const p = this.opts.player.position
    const yaw = this.opts.player.yaw
    const vx = this.decal.position.x - p.x
    const vz = this.decal.position.z - p.z
    const len = Math.hypot(vx, vz)
    const facing = len > 0.01 ? (vx * -Math.sin(yaw) + vz * -Math.cos(yaw)) / len : 0

    if (this.decalState === 'in') {
      mat.opacity = Math.min(0.42, mat.opacity + dt * 0.1) // 4 s soft arrival
      if (mat.opacity >= 0.42) this.decalState = 'hold'
    }
    // fixated or approached → it was never there
    if (this.decalState !== 'out' && (facing > 0.93 || len < 2.4 || this.decalT > 50)) {
      this.decalState = 'out'
    }
    if (this.decalState === 'out') {
      mat.opacity -= dt * 0.55
      if (mat.opacity <= 0) {
        this.opts.scene.remove(this.decal)
        this.decal.geometry.dispose()
        this.decal = null
      }
    }
  }

  // ---- the event pool --------------------------------------------------

  private fireEvent(): void {
    const pool: EventClass[] = ['detune', 'impact', 'echo', 'restitch', 'doorClose']
    if (this.dread > 0.2) pool.push('ceilingTick', 'peripheralDim')
    if (this.dread > 0.25) pool.push('brownout')
    if (this.dread > 0.3) pool.push('humSwallow')
    if (this.dread > 0.4 && this.pareidoliaCount < 3 && !this.decal) pool.push('pareidolia')
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
      case 'doorClose': {
        // a door, closing, far away. note 4: THERE ARE NO DOORS HERE.
        const a = this.rng.range(0, Math.PI * 2)
        const d = this.rng.range(24, 45)
        this.opts.audio?.playSpatial(
          this.rng.chance(0.3) ? 'doorOpen' : 'doorClose',
          p.x + Math.cos(a) * d,
          1.0,
          p.z + Math.sin(a) * d,
          { gain: 0.3 },
        )
        break
      }
      case 'ceilingTick': {
        // the drop tiles, directly overhead, three slow ticks. nothing weighs that little.
        const n = this.rng.int(2, 4)
        for (let i = 0; i < n; i++) {
          const ox = this.rng.range(-1.2, 1.2)
          const oz = this.rng.range(-1.2, 1.2)
          window.setTimeout(
            () => this.opts.audio?.playTick(p.x + ox, 2.72, p.z + oz, 0.7),
            i * (420 + Math.random() * 380),
          )
        }
        break
      }
      case 'humSwallow': {
        // spectral narrowing: the building swallows the hum's top end for a while
        this.opts.audio?.setHumMuffle(this.rng.range(0.6, 0.9))
        this.muffleT = this.rng.range(14, 26)
        break
      }
      case 'peripheralDim': {
        // one fixture misbehaves, strictly off-center. aborts if looked at.
        const fix = this.pickPeripheralFixture()
        if (fix) {
          this.dimFx = fix.x
          this.dimFz = fix.z
          this.opts.lights.dimAt(fix.x, fix.z, 0.9)
          this.dimCheckT = 0.9
        }
        break
      }
      case 'pareidolia': {
        this.tryPareidolia()
        break
      }
      case 'brownout': {
        this.brownoutT = this.rng.range(2, 4.5)
        break
      }
      case 'silence': {
        // THE weapon. the hum stops. nothing replaces it. and then, halfway
        // through, something small happens INSIDE it — a far creak the first
        // time; the second time, a wet exhale just behind the shoulder.
        this.opts.audio?.silence(
          this.rng.range(8, 18),
          this.silencesFired === 0 ? 'creak' : 'exhale',
        )
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

  private pickPeripheralFixture(): { x: number; z: number } | null {
    const p = this.opts.player.position
    const yaw = this.opts.player.yaw
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    let best: { x: number; z: number } | null = null
    let bestD = Infinity
    for (const chunk of this.opts.world.all()) {
      for (const f of chunk.fixtures) {
        const vx = f.x - p.x
        const vz = f.z - p.z
        const d = Math.hypot(vx, vz)
        if (d < 5 || d > 14) continue
        if ((vx * fx + vz * fz) / d > 0.3) continue // must be peripheral
        if (d < bestD) {
          bestD = d
          best = { x: f.x, z: f.z }
        }
      }
    }
    return best
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
    // the tape was re-copied; the timestamp quietly disagrees with itself
    this.onRestitch?.()
  }

  /** The one earned lights-out (narrative schedules it; it cannot repeat).
   *  The hum dies WITH the lights — it was always the lights' voice. */
  blackout(): void {
    if (this.blackoutFired) return
    this.blackoutFired = true
    const dur = this.rng.range(9, 12)
    this.opts.lights.blackout(dur)
    this.opts.audio?.silence(dur, 'creak')
    this.dread = Math.min(1, this.dread + 0.12)
    // mid-blackout: one careful, unhurried impact. it is not in a hurry.
    window.setTimeout(() => {
      const p = this.opts.player.position
      const a = this.rng.range(0, Math.PI * 2)
      const d = this.rng.range(10, 18)
      this.opts.audio?.playSpatial('impact', p.x + Math.cos(a) * d, 1.2, p.z + Math.sin(a) * d, {
        gain: 0.3,
      })
    }, dur * 0.6 * 1000)
  }

  /** 0..1 — how close the presence currently feels (drives tape interference). */
  get presenceNearness(): number {
    if (!this.presenceActive) return 0
    const p = this.opts.player.position
    return Math.max(0, 1 - Math.hypot(this.presence.x - p.x, this.presence.z - p.z) / 18)
  }

  /** Task 9 hooks: acts drive dread directly. */
  setDreadFloor(v: number): void {
    this.dread = Math.max(this.dread, v)
  }

  /** Almond water: the only mercy in the building. */
  relief(v: number): void {
    this.dread = Math.max(0.05, this.dread - v)
  }
}

const _v = new THREE.Vector3()
