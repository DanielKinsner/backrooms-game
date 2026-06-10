import * as THREE from 'three'
import { NOTES, ENDING_LINES, INTRO_LINES } from './notes'
import type { ChunkManager } from '../world/manager'
import type { PlayerController } from '../player/controller'
import type { InteractSystem, NoteOverlay } from '../player/interact'
import type { AudioEngine } from '../audio/engine'
import type { Director } from '../director/director'
import type { CamcorderHud } from '../ui/hud'
import type { PostStack } from '../fx/post'
import type { Input } from '../core/input'
import { Rng } from '../core/rng'

/**
 * The tape's story (DESIGN.md §4, §11). Distance walked places D.'s notes
 * ahead of the player; notes advance the act; the acts schedule the
 * silhouette, the lie, the meta-beat, the near-miss, and the descent.
 * The ending resets the timestamp. Nothing is ever explained.
 */

interface Ctx {
  scene: THREE.Scene
  world: ChunkManager
  player: PlayerController
  interact: InteractSystem
  notesOverlay: NoteOverlay
  audio: AudioEngine
  director: Director
  hud: CamcorderHud
  post: PostStack
  input: Input
}

const NOTE_DISTANCES = [30, 110, 220, 350, 500, 670, 860]

export class Narrative {
  /** Distance walked (m); the story's clock. */
  walked = 0
  notesRead = 0
  ended = false
  /** True while the player "pauses the tape" (the lie — it does nothing). */
  tapePaused = false
  /** True during slates/endings; main freezes the body. */
  cinematic = false

  private placedNotes = 0
  private rng = new Rng('d-was-here')
  private lastPos = new THREE.Vector3()
  private started = false

  // beats
  private silhouette: THREE.Mesh | null = null
  private silhouetteSeen = 0
  private silhouetteDone = false
  private stillTime = 0
  private metaBeatAt = -1
  private metaBeatDone = false
  private nearMissAt = -1
  private nearMissShape: THREE.Mesh | null = null
  private nearMissT = -1
  private exitPlaced = false
  private exitTrigger: THREE.Vector3 | null = null
  private endingT = -1

  private slateEl: HTMLDivElement
  private fadeEl: HTMLDivElement
  private pauseEl: HTMLDivElement

  constructor(private readonly ctx: Ctx) {
    this.slateEl = mkDiv('story-slate', 'hidden')
    this.fadeEl = mkDiv('story-fade', '')
    this.pauseEl = mkDiv('tape-pause', 'hidden')
    this.pauseEl.textContent = 'PAUSE ||'
    this.lastPos.copy(ctx.player.position)
  }

  /** Call once when the player first clicks in. Rolls the intro slate. */
  begin(): void {
    if (this.started) return
    this.started = true
    this.slateEl.innerHTML = INTRO_LINES.join('<br>')
    this.slateEl.classList.remove('hidden')
    this.cinematic = true
    this.ctx.player.pitch = -1.05 // face the carpet; you just came through it
    window.setTimeout(() => {
      this.slateEl.classList.add('hidden')
      this.cinematic = false
      this.wakeT = 0
    }, 4200)
  }

  private wakeT = -1

  update(dt: number): void {
    if (this.ended) return
    const { player, input, audio, director, hud, post } = this.ctx

    // wake-up: lift the camera off the carpet
    if (this.wakeT >= 0) {
      this.wakeT += dt
      const t = Math.min(this.wakeT / 1.6, 1)
      player.pitch = THREE.MathUtils.lerp(-1.05, 0, t * t * (3 - 2 * t))
      if (t >= 1) this.wakeT = -1
    }

    // distance clock
    const moved = Math.hypot(player.position.x - this.lastPos.x, player.position.z - this.lastPos.z)
    if (moved < 2) this.walked += moved // teleports don't count
    this.lastPos.copy(player.position)

    // the lie: holding Q "pauses the tape". the world keeps breathing.
    this.tapePaused = this.notesRead >= 1 && input.isDown('KeyQ')
    this.pauseEl.classList.toggle('hidden', !this.tapePaused)

    this.placeNotes()
    this.stepSilhouette(dt)
    this.stepMetaBeat(dt)
    this.stepNearMiss(dt)
    this.stepEnding(dt)

    // acts drive the dread floor
    director.setDreadFloor(Math.min(0.1 + this.notesRead * 0.09 + this.walked * 0.00018, 0.95))

    // tape strain rises late
    if (this.notesRead >= 6) post.vhs.intensity = Math.max(post.vhs.intensity, 1.18)
    void audio
    void hud
  }

  // ---- notes ----

  private placeNotes(): void {
    if (this.placedNotes >= NOTE_DISTANCES.length) return
    if (this.walked < NOTE_DISTANCES[this.placedNotes]) return
    const spot = this.findFloorSpot(9, 15)
    if (!spot) return
    const idx = this.placedNotes++
    this.spawnNote(spot, NOTES[idx])
    // D. left supplies sometimes. the bottles smell like almonds.
    if (idx >= 1 && this.rng.chance(0.45)) {
      this.spawnBottle(spot.x + this.rng.range(-0.9, 0.9), spot.z + this.rng.range(-0.9, 0.9))
    }
  }

  private spawnBottle(x: number, z: number): void {
    const bottle = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.05, 0.24, 12),
      new THREE.MeshStandardMaterial({ color: 0xcfd8d2, roughness: 0.35, metalness: 0.05 }),
    )
    body.position.y = 0.12
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.035, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.6 }),
    )
    cap.position.y = 0.26
    bottle.add(body, cap)
    bottle.position.set(x, 0, z)
    this.ctx.scene.add(bottle)
    this.ctx.interact.add({
      object: body,
      label: 'DRINK',
      onUse: () => {
        this.ctx.scene.remove(bottle)
        this.ctx.director.relief(0.18)
        this.ctx.player.steadyT = 40
      },
    })
  }

  private spawnNote(at: THREE.Vector3, text: string): void {
    const geo = new THREE.PlaneGeometry(0.21, 0.297)
    geo.rotateZ(this.rng.range(0, Math.PI * 2))
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0xd8cda8, roughness: 0.9, side: THREE.DoubleSide }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(at.x, 0.012, at.z)
    this.ctx.scene.add(mesh)
    this.ctx.interact.add({
      object: mesh,
      label: 'READ',
      once: false,
      onUse: () => {
        this.ctx.notesOverlay.show(text)
        if (!mesh.userData.read) {
          mesh.userData.read = true
          this.onNoteRead()
        }
      },
    })
  }

  private onNoteRead(): void {
    this.notesRead++
    if (this.notesRead === 7) {
      this.metaBeatAt = 8 // the tape acknowledges you, 8s after the descent note
      this.nearMissAt = this.rng.range(35, 55)
      this.placeExit()
    }
  }

  /** A clear-ish point ahead of the player, on carpet, not inside a wall. */
  private findFloorSpot(minD: number, maxD: number): THREE.Vector3 | null {
    const p = this.ctx.player.position
    const yaw = this.ctx.player.yaw
    const ray = new THREE.Raycaster()
    ray.firstHitOnly = true
    for (let i = 0; i < 10; i++) {
      const a = yaw + Math.PI + this.rng.range(-0.7, 0.7) // forward (yaw=0 faces -z, forward angle = yaw+π in sin/cos space below)
      const d = this.rng.range(minD, maxD)
      const x = p.x - Math.sin(yaw) * d + Math.cos(a) * this.rng.range(-2, 2)
      const z = p.z - Math.cos(yaw) * d + Math.sin(a) * this.rng.range(-2, 2)
      const colliders = this.ctx.world.collidersNear(x, z)
      if (colliders.length === 0) continue
      // horizontal clearance ≥0.4 in 4 directions at knee height
      let clear = true
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        ray.set(new THREE.Vector3(x, 0.35, z), new THREE.Vector3(dx, 0, dz))
        ray.far = 0.4
        for (const c of colliders) {
          if (ray.intersectObject(c, false).length > 0) {
            clear = false
            break
          }
        }
        if (!clear) break
      }
      if (clear) return new THREE.Vector3(x, 0, z)
    }
    return null
  }

  // ---- beat: the silhouette (zoom-only, sub-2s, once) ----

  private stepSilhouette(dt: number): void {
    const { player, post } = this.ctx
    if (this.silhouetteDone || this.notesRead < 5) return

    const speed = Math.hypot(player.velocity.x, player.velocity.z)
    this.stillTime = speed < 0.3 ? this.stillTime + dt : 0

    if (!this.silhouette && this.stillTime > 2) {
      const d = 30
      const x = player.position.x - Math.sin(player.yaw) * d
      const z = player.position.z - Math.cos(player.yaw) * d
      const geo = new THREE.CapsuleGeometry(0.26, 2.1, 4, 8)
      const mat = new THREE.MeshBasicMaterial({
        color: 0x1a1812,
        transparent: true,
        opacity: 0,
        fog: false, // it reads as a hole in the fog. wrong in a way you feel.
      })
      this.silhouette = new THREE.Mesh(geo, mat)
      this.silhouette.position.set(x, 1.45, z)
      this.silhouette.scale.set(0.9, 1.18, 0.9) // proportions slightly off
      this.ctx.scene.add(this.silhouette)
    }

    if (this.silhouette) {
      const mat = this.silhouette.material as THREE.MeshBasicMaterial
      // visible only through the lens
      mat.opacity = THREE.MathUtils.clamp((player.zoom - 0.45) * 1.6, 0, 0.85)
      if (mat.opacity > 0.15) {
        this.silhouetteSeen += dt
        post.vhs.intensity = 1.5 // the tape hates looking at it
        this.ctx.audio.setHumDetune(-12)
      }
      if (this.silhouetteSeen > 1.8) {
        this.ctx.scene.remove(this.silhouette)
        this.silhouette = null
        this.silhouetteDone = true
        post.vhs.intensity = 1
        this.ctx.audio.setHumDetune(0)
        this.ctx.director.setDreadFloor(0.55)
      }
    }
  }

  // ---- beat: the tape looks back (once) ----

  private stepMetaBeat(dt: number): void {
    if (this.metaBeatDone || this.metaBeatAt < 0) return
    this.metaBeatAt -= dt
    if (this.metaBeatAt > 0) return
    this.metaBeatDone = true
    const { hud, post, audio } = this.ctx
    hud.setRecLabel('PLAY ►')
    hud.setStamp('JUN.12 2002', 'AM 6:42:00')
    post.vhs.intensity = 2.6
    audio.playUi('glitch', 0.5)
    window.setTimeout(() => {
      hud.setRecLabel('REC')
      post.vhs.intensity = 1.18
    }, 1500)
  }

  // ---- beat: the near-miss (once) ----

  private stepNearMiss(dt: number): void {
    const { player } = this.ctx
    if (this.nearMissAt > 0) {
      this.nearMissAt -= dt
      if (this.nearMissAt <= 0) {
        // it crosses, left to right, eight meters ahead, during a brownout
        const fwdX = -Math.sin(player.yaw)
        const fwdZ = -Math.cos(player.yaw)
        const cx = player.position.x + fwdX * 8
        const cz = player.position.z + fwdZ * 8
        const geo = new THREE.CapsuleGeometry(0.3, 2.0, 4, 8)
        const mat = new THREE.MeshBasicMaterial({ color: 0x141210, fog: false })
        this.nearMissShape = new THREE.Mesh(geo, mat)
        this.nearMissShape.position.set(cx + fwdZ * 6, 1.35, cz - fwdX * 6)
        this.nearMissShape.userData = { cx, cz, fwdX, fwdZ }
        this.ctx.scene.add(this.nearMissShape)
        this.nearMissT = 0
        this.ctx.audio.setDread(1)
        this.ctx.audio.playSpatial('impact', cx, 1.2, cz, { gain: 0.5 })
      }
      return
    }
    if (this.nearMissT >= 0 && this.nearMissShape) {
      this.nearMissT += dt
      const t = this.nearMissT / 0.75
      const u = this.nearMissShape.userData as { cx: number; cz: number; fwdX: number; fwdZ: number }
      this.nearMissShape.position.set(
        u.cx + u.fwdZ * (6 - 12 * t),
        1.35,
        u.cz - u.fwdX * (6 - 12 * t),
      )
      if (t >= 1) {
        this.ctx.scene.remove(this.nearMissShape)
        this.nearMissShape = null
        this.nearMissT = -1
      }
    }
  }

  // ---- the descent + ending ----

  private placeExit(): void {
    if (this.exitPlaced) return
    const spot = this.findFloorSpot(22, 30)
    if (!spot) {
      window.setTimeout(() => this.placeExit(), 4000)
      return
    }
    this.exitPlaced = true

    const group = new THREE.Group()
    const conc = new THREE.MeshStandardMaterial({ color: 0x4d4a45, roughness: 0.95 })
    const dark = new THREE.MeshBasicMaterial({ color: 0x000000 })
    // bulkhead: open doorway facing the player's approach
    const W = 2.4
    const H = 2.2
    const D = 2.4
    const yaw = Math.atan2(this.ctx.player.position.x - spot.x, this.ctx.player.position.z - spot.z)
    group.position.copy(spot)
    group.rotation.y = yaw
    const side = new THREE.BoxGeometry(0.18, H, D)
    const l = new THREE.Mesh(side, conc)
    l.position.set(-W / 2, H / 2, 0)
    const r = new THREE.Mesh(side, conc)
    r.position.set(W / 2, H / 2, 0)
    const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), conc)
    top.position.set(0, H - 0.15, 0)
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.18), conc)
    back.position.set(0, H / 2, -D / 2)
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, 0.18), conc)
    lintel.position.set(0, H - 0.25, D / 2)
    // the inside is a hole in the world
    const void_ = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.36, H - 0.3), dark)
    void_.position.set(0, (H - 0.3) / 2, -D / 2 + 0.2)
    const bulb = new THREE.PointLight(0x991111, 2.2, 7) // canon: red means down
    bulb.position.set(0, H + 0.15, D / 2 + 0.2)
    group.add(l, r, top, back, lintel, void_, bulb)
    this.ctx.scene.add(group)

    // colliders for the shell
    for (const m of [l, r, top, back]) {
      const cg = m.geometry.clone()
      m.updateMatrixWorld(true)
      cg.applyMatrix4(m.matrixWorld)
      cg.computeBoundsTree()
      const cm = new THREE.Mesh(cg)
      cm.visible = false
      cm.updateMatrixWorld(true)
      this.colliders.push(cm)
    }
    this.exitTrigger = spot.clone()

    // D.'s last note + his camera, dropped at the threshold
    const noteAt = spot.clone()
    noteAt.x += Math.sin(yaw) * 2.2
    noteAt.z += Math.cos(yaw) * 2.2
    this.spawnNote(noteAt, NOTES[7])
    const cam = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.12, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.6 }),
    )
    cam.position.set(noteAt.x + 0.35, 0.06, noteAt.z + 0.2)
    cam.rotation.y = this.rng.range(0, Math.PI)
    this.ctx.scene.add(cam)
  }

  readonly colliders: THREE.Mesh[] = []

  private stepEnding(dt: number): void {
    const { player, audio, hud } = this.ctx
    if (this.endingT < 0) {
      if (!this.exitTrigger) return
      const d = Math.hypot(player.position.x - this.exitTrigger.x, player.position.z - this.exitTrigger.z)
      if (d < 0.9) {
        this.endingT = 0
        this.cinematic = true
        audio.silence(60)
        this.fadeEl.classList.add('on')
      }
      return
    }

    this.endingT += dt
    // descending concrete steps in the dark
    const steps = [1.2, 2.1, 3.0, 3.8, 4.7, 5.5]
    for (const s of steps) {
      if (this.endingT - dt < s && this.endingT >= s) {
        audio.playUi('glitch', 0.06) // distant, wrong-sounding steps
      }
    }
    if (this.endingT > 7 && !this.ended) {
      this.ended = true
      hud.hide()
      this.slateEl.innerHTML = ENDING_LINES.join('<br>')
      this.slateEl.classList.remove('hidden')
      window.setTimeout(() => {
        this.slateEl.innerHTML = 'the date on the tape is JUN.12 2002.<br><br>it is always JUN.12 2002.'
        window.setTimeout(() => window.location.reload(), 6500)
      }, 7000)
    }
  }
}

function mkDiv(id: string, cls: string): HTMLDivElement {
  const el = document.createElement('div')
  el.id = id
  if (cls) el.classList.add(cls)
  document.body.appendChild(el)
  return el
}
