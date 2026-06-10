import * as THREE from 'three'
import type { PlayerController } from '../player/controller'
import type { Input } from '../core/input'
import type { InteractSystem, NoteOverlay, Interactable } from '../player/interact'
import type { Narrative } from '../story/narrative'

/**
 * Organic playthrough bot (dev builds only). Plays the game the way a
 * player does: walks, steers toward notes it can see in the interact
 * registry, aims, presses E, closes the overlay with a fresh press,
 * drinks bottles, goes still and zooms after note 5 (the silhouette),
 * holds Q after note 6 (the lie), and walks into the descent. Teleports
 * are a last-resort assist and are counted — a clean run has zero.
 */

interface Deps {
  player: PlayerController
  input: Input
  interact: InteractSystem
  notes: NoteOverlay
  narrative: Narrative
}

type Sample = Record<string, number | string>

export class Playbot {
  running = false
  done = false
  assists = 0
  errors: string[] = []
  samples: Sample[] = []
  events: string[] = []

  private t = 0
  private stuckT = 0
  private sideT = -1
  private readPhase = 0 // 0 none, 1 pressed-open, 2 waiting, 3 pressed-close
  private readTimer = 0
  private target: Interactable | null = null
  private targetSince = 0
  private stillAt = 20
  private stillT = -1
  private qDone = false
  private qT = -1
  private sampleT = 0
  private blacklist = new Set<object>()

  constructor(private readonly d: Deps) {
    window.addEventListener('error', (e) => this.errors.push(String(e.message)))
    window.addEventListener('unhandledrejection', (e) => this.errors.push(String(e.reason)))
  }

  start(): void {
    this.running = true
    this.events.push('start')
  }

  stop(): void {
    this.running = false
    const { input } = this.d
    for (const k of ['KeyW', 'ShiftLeft', 'KeyE', 'KeyQ', 'Space']) input.setKey(k, false)
    input.setMouse(2, false)
  }

  update(dt: number): void {
    if (!this.running) return
    this.t += dt
    this.sampleT += dt
    const { input, narrative } = this.d

    if (this.sampleT >= 10) {
      this.sampleT = 0
      const hud = document.querySelector('#debug-hud')?.textContent ?? ''
      this.samples.push({
        t: Math.round(this.t),
        fps: hud.split(' ')[0],
        walked: Math.round(narrative.walked),
        notes: narrative.notesRead,
        errors: this.errors.length,
      })
    }

    // finished?
    if (narrative.cinematic || narrative.ended) {
      this.events.push(`ending reached t=${Math.round(this.t)}`)
      this.done = true
      this.stop()
      return
    }
    if (this.t > 15 * 60) {
      this.events.push('TIMEOUT 15min')
      this.stop()
      return
    }
    if (narrative.cinematic) return

    // reading flow
    if (this.readPhase > 0) {
      this.stepRead(dt)
      return
    }

    // scheduled stillness + zoom (the silhouette wants you to stop and look)
    if (this.stillT >= 0) {
      this.stillT += dt
      input.setKey('KeyW', false)
      input.setKey('ShiftLeft', false)
      input.setMouse(2, this.stillT > 2.2) // zoom after it has had time to appear
      if (this.stillT > 6) {
        input.setMouse(2, false)
        this.stillT = -1
        this.stillAt = this.t + 18
      }
      return
    }
    if (narrative.notesRead >= 5 && !narrative['silhouetteDone'] && this.t > this.stillAt) {
      this.stillT = 0
      this.events.push(`still+zoom t=${Math.round(this.t)}`)
      return
    }

    // the lie, once
    if (narrative.notesRead >= 6 && !this.qDone) {
      if (this.qT < 0) {
        this.qT = 0
        this.events.push(`pause-the-tape t=${Math.round(this.t)}`)
      }
      this.qT += dt
      input.setKey('KeyQ', this.qT < 2.2)
      if (this.qT >= 2.4) this.qDone = true
      if (this.qT < 2.4) return
    }

    this.pickTarget()

    if (this.target) this.seek(dt)
    else this.wander(dt)
  }

  private pickTarget(): void {
    const { interact, player, narrative } = this.d
    const items: Interactable[] = [...(interact['items'] as Map<object, Interactable>).values()]
    let best: Interactable | null = null
    let bestD = 28
    for (const it of items) {
      if (this.blacklist.has(it.object)) continue
      const p = it.object.getWorldPosition(_v)
      const d = Math.hypot(p.x - player.position.x, p.z - player.position.z)
      if (d < bestD) {
        bestD = d
        best = it
      }
    }
    if (best !== this.target) {
      this.target = best
      this.targetSince = this.t
    }
    // exit beats any item once the last note is read
    const trigger = narrative['exitTrigger'] as THREE.Vector3 | null
    if (!best && trigger) {
      this.exitTarget = trigger
    }
  }

  private exitTarget: THREE.Vector3 | null = null

  private seek(dt: number): void {
    const { player, input } = this.d
    const it = this.target!
    const p = it.object.getWorldPosition(_v)
    const dx = p.x - player.position.x
    const dz = p.z - player.position.z
    const dist = Math.hypot(dx, dz)

    // give up → assist teleport (counted) so story pacing can't deadlock
    if (this.t - this.targetSince > 50) {
      player.position.set(p.x - dx * (0.6 / dist), 0.1, p.z - dz * (0.6 / dist))
      this.assists++
      this.events.push(`ASSIST teleport to ${it.label} t=${Math.round(this.t)}`)
      this.targetSince = this.t
      return
    }

    if (dist < 1.9) {
      // aim at it and start the read/drink flow
      input.setKey('KeyW', false)
      input.setKey('ShiftLeft', false)
      this.aimAt(p)
      if (this.d.interact.current === it) {
        this.readPhase = 1
        this.readTimer = 0
        this.events.push(`${it.label} @${Math.round(this.d.narrative.walked)}m t=${Math.round(this.t)}`)
      }
      return
    }

    this.steerToward(Math.atan2(-dx, -dz), dt)
    input.setKey('KeyW', true)
    input.setKey('ShiftLeft', dist > 7)
    this.unstick(dt)
  }

  private stepRead(dt: number): void {
    const { input, notes } = this.d
    this.readTimer += dt
    if (this.readPhase === 1) {
      input.setKey('KeyE', this.readTimer < 0.15)
      if (this.readTimer > 0.5) {
        this.readPhase = 2
        this.readTimer = 0
      }
    } else if (this.readPhase === 2) {
      if (!notes.reading) {
        // it was a bottle (or the read failed silently) — move on
        if (this.target) this.blacklist.add(this.target.object)
        this.readPhase = 0
        this.target = null
        return
      }
      if (this.readTimer > 1.4) {
        this.readPhase = 3
        this.readTimer = 0
      }
    } else {
      input.setKey('KeyE', this.readTimer < 0.15)
      if (this.readTimer > 0.6 && !notes.reading) {
        if (this.target) this.blacklist.add(this.target.object)
        this.readPhase = 0
        this.target = null
      } else if (this.readTimer > 2) {
        this.readTimer = 0 // overlay still open — press again
      }
    }
  }

  private wander(dt: number): void {
    const { input, player } = this.d
    if (this.exitTarget) {
      const dx = this.exitTarget.x - player.position.x
      const dz = this.exitTarget.z - player.position.z
      this.steerToward(Math.atan2(-dx, -dz), dt)
    }
    input.setKey('KeyW', true)
    input.setKey('ShiftLeft', true)
    this.unstick(dt)
  }

  private steerToward(targetYaw: number, dt: number): void {
    const { player } = this.d
    if (this.sideT > 0) return // mid sidestep: don't fight it
    let dy = targetYaw - player.yaw
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    player.yaw += dy * Math.min(1, 5 * dt)
    player.pitch *= 1 - Math.min(1, 6 * dt)
  }

  private unstick(dt: number): void {
    const { player, input } = this.d
    const speed = Math.hypot(player.velocity.x, player.velocity.z)
    if (this.sideT > 0) {
      this.sideT -= dt
      return
    }
    if (speed < 0.4) {
      this.stuckT += dt
      if (this.stuckT > 0.7) {
        input.setKey('Space', true) // try a mantle first — maybe it's furniture
        window.setTimeout(() => input.setKey('Space', false), 150)
        player.yaw += (Math.random() < 0.5 ? 1 : -1) * (0.9 + Math.random() * 1.6)
        this.sideT = 0.9
        this.stuckT = 0
      }
    } else {
      this.stuckT = 0
    }
  }

  private aimAt(p: THREE.Vector3): void {
    const { player } = this.d
    const eye = player.position.y + player.eyeHeight
    const dx = p.x - player.position.x
    const dz = p.z - player.position.z
    player.yaw = Math.atan2(-dx, -dz)
    player.pitch = Math.atan2(p.y - eye, Math.hypot(dx, dz))
  }

  report(): object {
    const n = this.d.narrative
    return {
      done: this.done,
      minutes: +(this.t / 60).toFixed(1),
      walked: Math.round(n.walked),
      notesRead: n.notesRead,
      assists: this.assists,
      silhouetteDone: n['silhouetteDone'],
      metaBeatDone: n['metaBeatDone'],
      ended: n.ended || n.cinematic,
      errors: this.errors,
      events: this.events,
      samples: this.samples,
    }
  }
}

const _v = new THREE.Vector3()
