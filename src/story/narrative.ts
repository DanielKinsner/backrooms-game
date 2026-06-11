import * as THREE from 'three'
import {
  TRAIL_NOTES,
  TRAIL_NOTE_6_AFTER,
  FINAL_NOTE,
  ENDING_LINES,
  INTRO_LINES,
  INTRO_LINES_TAPE2,
  ENDING_LINES_TAPE2,
  TAPE2_NOTES,
  DOORWAY_NOTE,
  LOUD_DEBT_NOTE,
  DICTIONARY_NOTE,
  WORK_ORDER_NOTE,
  SUBMERGED_NOTE,
} from './notes'
import { ManilaRoom } from './manila'
import { loadRunSummary, saveRunSummary, isTape2Run, type RunSummary } from './tape2'
import { getFootprintMaterial, getTally74Material, getChevronMaterial } from '../world/materials'
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

const NOTE_DISTANCES = [30, 110, 200, 290, 390, 500, 640, 790, 950]

export class Narrative {
  /** Distance walked (m); the story's clock. */
  walked = 0
  notesRead = 0
  ended = false
  /** True while the player "pauses the tape" (the lie — it does nothing). */
  tapePaused = false
  /** True during slates/endings; main freezes the body. */
  cinematic = false
  /** Impossible artifact: >0 holds the rendered frame while audio continues. */
  freezeT = -1

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

  /** Run-1 summary if this is a TAPE 2 run; null = Tape 1 behavior. */
  readonly tape2: RunSummary | null

  constructor(private readonly ctx: Ctx) {
    this.slateEl = mkDiv('story-slate', 'hidden')
    this.fadeEl = mkDiv('story-fade', '')
    this.pauseEl = mkDiv('tape-pause', 'hidden')
    this.pauseEl.textContent = 'PAUSE ||'
    this.lastPos.copy(ctx.player.position)

    this.tape2 = isTape2Run() ? loadRunSummary() : null
    if (this.tape2) {
      ctx.hud.setTapeDate('JUN.13 2002')
      // the director already knows this player (Spec E: profile from min 0)
      ctx.director.profile.seed({
        sprintRatio: this.tape2.sprintRatio,
        lookbackRate: this.tape2.lookbackRate,
        zoomUsage: this.tape2.zoomUsage,
        wallHug: this.tape2.wallHug,
        noteReader: this.tape2.notesRead / Math.max(1, this.tape2.notesPlaced),
      })
    }

    // ---- Spec B / deck hooks the director can't build alone ----
    ctx.director.hooks = {
      phoneRing: () => this.placeRingingPhone(),
      doorwayNote: () => this.placeDoorwayNote(),
      wetPrints: () => this.placeWetPrintsAhead(),
      arrowsAgree: () => this.placeAgreeingArrows(),
      forwardSilhouette: () => this.armForwardSilhouette(),
      autofocus: () => this.armAutofocus(),
      loudDebtNote: () => {
        this.extraNoteQueue.push(LOUD_DEBT_NOTE)
      },
    }
  }

  /** Call once when the player first clicks in. Rolls the intro slate. */
  begin(): void {
    if (this.started) return
    this.started = true
    this.slateEl.innerHTML = (this.tape2 ? INTRO_LINES_TAPE2 : INTRO_LINES).join('<br>')
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
    audio.setTapePaused(this.tapePaused)
    if (this.tapePaused) {
      this.qHeldT += dt
      if (this.qHeldT > 0.5) this.qPauseUsed = true
    } else {
      this.qHeldT = 0
    }
    this.stepPauseStill(dt)

    this.placeNotes()
    this.stepTape2Extras()
    this.stepLoreArtifacts()
    this.stepExploitVisuals(dt)
    if (this.walked > 1400) this.unlockDescent()
    this.stepSilhouette(dt)
    this.stepMetaBeat(dt)
    this.stepNearMiss(dt)
    this.stepEnding(dt)
    this.stepWave3(dt)

    // acts drive the dread floor
    director.setDreadFloor(Math.min(0.1 + this.notesRead * 0.09 + this.walked * 0.00018, 0.95))

    // tape strain rises late; the generation ratchet never goes back
    if (this.notesRead >= 6) post.vhs.intensity = Math.max(post.vhs.intensity, 1.18)
    post.vhs.generation = Math.min(0.85, this.notesRead * 0.07 + this.walked * 0.00008)

    // one-shot: an emergency broadcast leaking through a wall cavity the
    // maze never lets you reach. an outside world tried to warn someone.
    if (!this.broadcastFired && this.walked > 620) {
      this.broadcastFired = true
      audio.playBroadcastLeak()
    }
    void hud
  }

  // ---- wave 3 ----------------------------------------------------------

  private stepWave3(dt: number): void {
    this.freezeT -= dt
    this.manila?.update(dt)

    // THE PHONE (kenopsia): a desk phone off the hook, dial tone running.
    // 2002. someone left mid-call. hang it up, or don't.
    if (!this.phoneDone && this.walked > 210) {
      const spot = this.findFloorSpot(10, 16)
      if (spot) {
        this.phoneDone = true
        this.placePhone(spot)
      }
    }
    // the line gives up if you walk away from it
    if (this.phoneHandle && this.phoneAt) {
      const d = Math.hypot(
        this.ctx.player.position.x - this.phoneAt.x,
        this.ctx.player.position.z - this.phoneAt.z,
      )
      if (d > 32) {
        this.phoneHandle.hangUp()
        this.phoneHandle = null
      }
    }

    // THE MANILA ROOM: the only mercy, ~mid-arc, once.
    if (!this.manila && this.walked > 350) {
      const spot = this.findFloorSpot(16, 22)
      if (spot) {
        this.manila = new ManilaRoom({
          scene: this.ctx.scene,
          player: this.ctx.player,
          interact: this.ctx.interact,
          notesOverlay: this.ctx.notesOverlay,
          audio: this.ctx.audio,
          director: this.ctx.director,
          post: this.ctx.post,
          colliders: this.colliders,
          tape2: this.tape2 ? { thermosDrunk: this.tape2.thermosDrunk } : undefined,
        })
        this.manila.place(spot)
      }
    }

    // WET FOOTPRINTS: they lead to a wall. they stop there.
    if (!this.footprintsDone && this.walked > 460) {
      this.footprintsDone = this.placeFootprints()
    }

    // THE RED ROOM (canon: "must be avoided entirely" — so the maze makes
    // avoidance mandatory). A dim red doorway, far ahead. At 9 m the tape
    // tears, and when the frame settles there is only wall. Beside where
    // it stood: a chalk tally. It reads 74.
    this.stepRedRoom()

    // IMPOSSIBLE ARTIFACTS (post-meta-beat, max two, minutes apart): the
    // tape operates outside its own parameters. nobody will agree on these.
    if (this.metaBeatDone && this.artifactsFired < 2) {
      if (this.nextArtifactAt < 0) {
        this.nextArtifactAt = this.rng.range(45, 110)
      }
      this.nextArtifactAt -= dt
      if (this.nextArtifactAt <= 0) {
        this.artifactsFired++
        this.nextArtifactAt = this.rng.range(240, 360)
        if (this.artifactsFired === 1) {
          // the counter runs backward for two seconds. gameplay continues.
          this.ctx.hud.reverseFor(2)
        } else {
          // the frame holds; every sound continues. the picture blinked.
          this.freezeT = 1.5
          this.ctx.post.vhs.bumpGeneration(0.1)
        }
      }
    }
  }

  private placePhone(spot: THREE.Vector3): void {
    const { scene, interact, audio } = this.ctx
    const group = new THREE.Group()
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x4f4233, roughness: 0.8 })
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.65), deskMat)
    desk.position.y = 0.7
    const legGeo = new THREE.BoxGeometry(0.05, 0.7, 0.6)
    const l1 = new THREE.Mesh(legGeo, deskMat)
    l1.position.set(-0.55, 0.35, 0)
    const l2 = new THREE.Mesh(legGeo, deskMat)
    l2.position.set(0.55, 0.35, 0)
    const phoneBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.07, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.5 }),
    )
    phoneBase.position.set(-0.2, 0.765, 0)
    // the handset, off the hook, on the desk, waiting
    const handset = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.025, 0.16, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.5 }),
    )
    handset.rotation.z = Math.PI / 2
    handset.position.set(0.18, 0.75, 0.1)
    group.add(desk, l1, l2, phoneBase, handset)
    group.position.copy(spot)
    group.rotation.y = this.rng.range(0, Math.PI * 2)
    scene.add(group)

    const hp = handset.getWorldPosition(new THREE.Vector3())
    this.phoneHandle = audio.startDialTone(hp.x, hp.y, hp.z)
    this.phoneAt = spot.clone()
    interact.add({
      object: handset,
      label: 'HANG UP',
      onUse: () => {
        this.phoneHandle?.hangUp()
        this.phoneHandle = null
        handset.position.set(-0.2, 0.81, 0)
        handset.rotation.set(0, 0, 0)
      },
    })
  }

  /** A barefoot trail on the carpet, wet enough to catch the light,
   *  walking straight into a wall. Returns false to retry later. */
  private placeFootprints(): boolean {
    const spot = this.findFloorSpot(10, 14)
    if (!spot) return false
    // find a wall within 8m in some direction
    const ray = new THREE.Raycaster()
    ray.firstHitOnly = true
    const colliders = this.ctx.world.collidersNear(spot.x, spot.z)
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = this.rng.range(0, Math.PI * 2)
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
      ray.set(new THREE.Vector3(spot.x, 0.6, spot.z), dir)
      ray.far = 8
      let hit: THREE.Intersection | null = null
      for (const c of colliders) {
        const h = ray.intersectObject(c, false)[0]
        if (h && (!hit || h.distance < hit.distance)) hit = h
      }
      if (!hit || hit.distance < 3) continue
      const n = hit.face?.normal
      if (!n || Math.abs(n.y) > 0.3) continue

      const mat = getFootprintMaterial()
      const geo = new THREE.PlaneGeometry(0.11, 0.26)
      const steps = Math.floor((hit.distance - 0.25) / 0.38)
      for (let s = 0; s < steps; s++) {
        const m = new THREE.Mesh(geo, mat)
        m.rotation.x = -Math.PI / 2
        m.rotation.z = -a + (s % 2 === 0 ? 0.07 : -0.07)
        const lat = (s % 2 === 0 ? 1 : -1) * 0.09
        m.position.set(
          spot.x + dir.x * (0.3 + s * 0.38) - dir.z * lat,
          0.008,
          spot.z + dir.z * (0.3 + s * 0.38) + dir.x * lat,
        )
        this.ctx.scene.add(m)
      }
      return true
    }
    return false
  }

  private stepRedRoom(): void {
    const { player, post, audio } = this.ctx

    // place once, deep in act 2, well ahead in the fog
    if (!this.redRoomDone && !this.redRoom && this.walked > 540) {
      const spot = this.findFloorSpot(24, 30)
      if (spot) this.placeRedRoom(spot)
      return
    }
    if (!this.redRoom || !this.redRoomAt) return

    const d = Math.hypot(
      player.position.x - this.redRoomAt.x,
      player.position.z - this.redRoomAt.z,
    )
    if (d < 14) {
      // canonical approach effects: claustrophobia via the lens, not UI
      audio.setHumDetune(-15)
      post.vhs.interference = Math.max(post.vhs.interference, (14 - d) / 14)
    }
    if (d < 9) {
      // the tape fails. the room was never there. the tally stays.
      post.vhs.trackingSurge(1)
      audio.setHumDetune(0)
      audio.playUi('glitch', 0.35)
      this.ctx.scene.remove(this.redRoom)
      this.redRoom.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose()
      })
      this.redRoom = null
      this.redRoomDone = true
      const [cx, cz] = this.ctx.world.chunkOf(this.redRoomAt.x, this.redRoomAt.z)
      this.ctx.world.bumpSalt(cx, cz)
      this.ctx.director.setDreadFloor(0.6)
    }
  }

  private placeRedRoom(spot: THREE.Vector3): void {
    const { scene, player } = this.ctx
    const group = new THREE.Group()
    const yaw = Math.atan2(player.position.x - spot.x, player.position.z - spot.z)
    group.position.copy(spot)
    group.rotation.y = yaw

    const jambMat = new THREE.MeshStandardMaterial({ color: 0x3a3026, roughness: 0.9 })
    const mkBox = (w: number, h: number, dd: number, x: number, y: number, z: number): void => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), jambMat)
      m.position.set(x, y, z)
      group.add(m)
    }
    mkBox(0.16, 2.2, 0.2, -0.62, 1.1, 0)
    mkBox(0.16, 2.2, 0.2, 0.62, 1.1, 0)
    mkBox(1.4, 0.18, 0.2, 0, 2.19, 0)
    // the room beyond: a red that the CRI grade renders dead and wrong
    const void_ = new THREE.Mesh(
      new THREE.PlaneGeometry(1.08, 2.1),
      new THREE.MeshBasicMaterial({ color: 0x4a0a0a, fog: false }),
    )
    void_.position.set(0, 1.05, -0.06)
    group.add(void_)
    const glow = new THREE.PointLight(0xff2020, 1.4, 6, 1.8)
    glow.position.set(0, 1.3, 0.5)
    group.add(glow)

    // the tally, beside the door. 14 groups and four strokes. count them.
    const tally = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), getTally74Material())
    tally.position.set(1.25, 1.3, 0.02)
    group.add(tally)

    scene.add(group)
    this.redRoom = group
    this.redRoomAt = spot.clone()
  }

  // ======================================================================
  // TAPE 2 expansion
  // ======================================================================

  /** True while the Q-pause secret is showing its prepared still. */
  pauseStillActive = false
  private qHeldT = 0
  private qPauseUsed = false
  private judderT = 0
  private nearMissLingerT = 0

  private extraNoteQueue: string[] = []
  private tape2NotesPlaced = 0
  private tape2RestitchDone = false
  private workOrderDone = false
  private dictionaryDone = false
  private submergedDone = false
  private ringingPhone: {
    at: THREE.Vector3
    handle: { stop: () => void } | null
    silenced: boolean
  } | null = null
  private wetPrintsArmed = false
  private wetPrintsDir = new THREE.Vector3(0, 0, -1)
  private fwdSilState: 'off' | 'baseline' | 'turned' = 'off'
  private fwdSilBaseYaw = 0
  private autofocusArmed = false
  private autofocusShape: THREE.Mesh | null = null
  private autofocusT = -1
  private fwdSilShape: THREE.Mesh | null = null
  private fwdSilT = -1

  /**
   * Spec C — the Q-pause secret. During (and shortly after) the near-miss,
   * the paused frame is not the live render: the shape is fractionally
   * more present than it ever is at speed. Closer. Oriented toward the
   * lens. Pause judder keeps it from being cleanly screenshotted. The
   * game never references this. Zero hint. Discovery only.
   */
  private stepPauseStill(dt: number): void {
    const { player, post } = this.ctx
    if (this.nearMissLingerT > 0 && !this.tapePaused) {
      this.nearMissLingerT -= dt
      if (this.nearMissLingerT <= 0 && this.nearMissShape) {
        this.ctx.scene.remove(this.nearMissShape)
        this.nearMissShape.geometry.dispose()
        this.nearMissShape = null
      }
    }
    const eligible =
      this.nearMissShape !== null && (this.nearMissT >= 0 || this.nearMissLingerT > 0)
    const active = this.tapePaused && eligible
    if (active && !this.pauseStillActive && this.nearMissShape) {
      const yaw = player.yaw
      this.nearMissShape.visible = true
      this.nearMissShape.position.set(
        player.position.x - Math.sin(yaw) * 4.3,
        1.42,
        player.position.z - Math.cos(yaw) * 4.3,
      )
      this.nearMissShape.scale.set(1.12, 1.12, 1.12)
      this.nearMissShape.rotation.set(0.05, 0, 0.04) // a lean. toward you.
      post.vhs.trackingSurge(0.5)
      this.judderT = 0
    }
    if (!active && this.pauseStillActive && this.nearMissShape) {
      this.nearMissShape.scale.set(1, 1, 1)
      this.nearMissShape.rotation.set(0, 0, 0)
      if (this.nearMissT < 0) this.nearMissShape.visible = false
    }
    this.pauseStillActive = active
    if (active) {
      // VHS pause-head judder: the still can't hold steady
      this.judderT -= dt
      if (this.judderT <= 0) {
        this.judderT = 0.3 + Math.random() * 0.35
        post.vhs.trackingSurge(0.22 + Math.random() * 0.22)
      }
    }
  }

  /** Spec E — conditional Tape 2 notes + the one scripted in-view re-stitch. */
  private stepTape2Extras(): void {
    if (!this.tape2) return
    const s = this.tape2
    const marks = [55, 240, 430]
    if (this.tape2NotesPlaced < marks.length && this.walked >= marks[this.tape2NotesPlaced]) {
      const spot = this.findFloorSpot(8, 14)
      if (spot) {
        const text =
          this.tape2NotesPlaced === 0
            ? TAPE2_NOTES.backSoSoon
            : this.tape2NotesPlaced === 1
              ? s.almondDrunk > 0 || s.thermosDrunk
                ? TAPE2_NOTES.drankWater
                : TAPE2_NOTES.neverDrank
              : s.sleptInManila
                ? TAPE2_NOTES.sleptSafe
                : s.qPauseUsed
                  ? TAPE2_NOTES.pausedTape
                  : TAPE2_NOTES.neverPaused
        this.tape2NotesPlaced++
        this.spawnNote(spot, text)
      }
    }

    // The signature beat: ONE re-stitch inside peripheral vision. Act 2
    // only, scripted, while moving — a corridor becomes a wall, half-seen.
    if (!this.tape2RestitchDone && this.walked > 300 && this.walked < 640) {
      const { player, world } = this.ctx
      const speed = Math.hypot(player.velocity.x, player.velocity.z)
      if (speed > 1.4) {
        const side = this.rng.chance(0.5) ? 1 : -1
        const a = player.yaw + Math.PI + side * 1.08 // ~62° off gaze center
        const px = player.position.x + -Math.sin(a) * 19
        const pz = player.position.z + -Math.cos(a) * 19
        const [cx, cz] = world.chunkOf(px, pz)
        const [pcx, pcz] = world.chunkOf(player.position.x, player.position.z)
        if (cx !== pcx || cz !== pcz) {
          this.tape2RestitchDone = true
          world.rebuildNow(cx, cz) // no surge. no mask. you half-saw it.
        }
      }
    }
  }

  /** Lore eggs 1 + 4, and the flooded zone's submerged page. */
  private stepLoreArtifacts(): void {
    if (!this.workOrderDone && this.walked > 13) {
      const spot = this.findFloorSpot(5, 10)
      if (spot) {
        this.workOrderDone = true
        // a contractor's clipboard, face up where it was set down in 2002
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.012, 0.33),
          new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.85 }),
        )
        board.position.set(spot.x, 0.012, spot.z)
        board.rotation.y = this.rng.range(0, Math.PI * 2)
        const sheet = new THREE.Mesh(
          new THREE.PlaneGeometry(0.2, 0.28),
          new THREE.MeshStandardMaterial({ color: 0xd3cdb9, roughness: 0.9 }),
        )
        sheet.rotation.x = -Math.PI / 2
        sheet.position.y = 0.013
        board.add(sheet)
        this.ctx.scene.add(board)
        this.ctx.interact.add({
          object: sheet,
          label: 'READ',
          once: false,
          onUse: () => this.ctx.notesOverlay.show(WORK_ORDER_NOTE),
        })
      }
    }
    if (!this.dictionaryDone && this.walked > 160) {
      const spot = this.findFloorSpot(8, 13)
      if (spot) {
        this.dictionaryDone = true
        this.spawnNote(spot, DICTIONARY_NOTE)
      }
    }
    // the flooded wing's one page, under the water, legible only zoomed
    if (!this.submergedDone) {
      const { player, world } = this.ctx
      if (world.zoneAt(player.position.x, player.position.z) === 'flooded') {
        const spot = this.findFloorSpot(5, 9)
        if (spot && world.zoneAt(spot.x, spot.z) === 'flooded') {
          this.submergedDone = true
          const geo = new THREE.PlaneGeometry(0.21, 0.297)
          geo.rotateZ(this.rng.range(0, Math.PI * 2))
          const mesh = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({
              color: 0xb8b29a, // paper, through water
              roughness: 0.6,
              side: THREE.DoubleSide,
            }),
          )
          mesh.rotation.x = -Math.PI / 2
          mesh.position.set(spot.x, 0.015, spot.z) // below FLOOD_Y
          this.ctx.scene.add(mesh)
          this.ctx.interact.add({
            object: mesh,
            label: 'READ',
            once: false,
            onUse: () => {
              this.ctx.notesOverlay.show(
                this.ctx.player.zoom > 0.4 ? SUBMERGED_NOTE : 'the water blurs the ink.\n\n(the lens might cut through the glare)',
              )
            },
          })
        }
      }
    }
  }

  // ---- director hooks (cards that need props) ----

  /** D5 — the ringing phone. It can hear how fast you're coming. */
  private placeRingingPhone(): boolean {
    const spot = this.findFloorSpot(12, 18)
    if (!spot) return false
    const { scene, interact, audio } = this.ctx
    const group = new THREE.Group()
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x4f4233, roughness: 0.8 })
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.65), deskMat)
    desk.position.y = 0.7
    const legGeo = new THREE.BoxGeometry(0.05, 0.7, 0.6)
    const l1 = new THREE.Mesh(legGeo, deskMat)
    l1.position.set(-0.55, 0.35, 0)
    const l2 = new THREE.Mesh(legGeo, deskMat)
    l2.position.set(0.55, 0.35, 0)
    const phoneBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.07, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.5 }),
    )
    phoneBase.position.set(0, 0.765, 0)
    const handset = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.025, 0.16, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.5 }),
    )
    handset.rotation.z = Math.PI / 2
    handset.position.set(0, 0.83, 0) // on the hook. ringing.
    group.add(desk, l1, l2, phoneBase, handset)
    group.position.copy(spot)
    group.rotation.y = this.rng.range(0, Math.PI * 2)
    scene.add(group)

    const hp = handset.getWorldPosition(new THREE.Vector3())
    const handle = audio.startPhoneRing(hp.x, hp.y, hp.z)
    this.ringingPhone = { at: spot.clone(), handle, silenced: false }
    interact.add({
      object: handset,
      label: 'ANSWER',
      onUse: () => {
        const rp = this.ringingPhone
        if (!rp) return
        rp.handle?.stop()
        rp.handle = null
        handset.position.set(0.16, 0.75, 0.12)
        handset.rotation.set(0, 0, 0)
        if (!rp.silenced) {
          // line static, then this room's own hum, one second late
          audio.playPhoneAnswer(hp.x, hp.y, hp.z)
        } else {
          audio.playTick(hp.x, hp.y, hp.z, 1.2) // dead line. it gave up first.
        }
        this.ringingPhone = null
      },
    })
    return true
  }

  /** Spec B — the note for players who don't read notes. In the doorway. */
  private placeDoorwayNote(): boolean {
    const spot = this.findFloorSpot(4, 8)
    if (!spot) return false
    this.spawnNote(spot, DOORWAY_NOTE)
    return true
  }

  /** D4 — wet prints ahead, going your way. Placed only out-of-frustum. */
  private placeWetPrintsAhead(): boolean {
    if (this.wetPrintsArmed) return false
    this.wetPrintsArmed = true
    return true
  }

  /** Lore egg 2 — one corridor where every arrow agrees with you. */
  private placeAgreeingArrows(): boolean {
    const { player, world } = this.ctx
    const p = player.position
    const yaw = player.yaw
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    const ray = new THREE.Raycaster()
    ray.firstHitOnly = true
    const colliders = world.collidersNear(p.x, p.z)
    // verify we're in corridor-ish geometry: walls within 2.2 m both sides
    const sideHits: THREE.Intersection[] = []
    for (const side of [1, -1]) {
      const dir = new THREE.Vector3(Math.cos(yaw) * side, 0, -Math.sin(yaw) * side)
      ray.set(new THREE.Vector3(p.x, 1.3, p.z), dir)
      ray.far = 2.3
      let best: THREE.Intersection | null = null
      for (const c of colliders) {
        const h = ray.intersectObject(c, false)[0]
        if (h && (!best || h.distance < best.distance)) best = h
      }
      if (!best) return false
      sideHits.push(best)
    }
    // chevrons march 12 m down both walls. first half agree with your
    // direction of travel. past the midpoint they point back the way you
    // came. note 1 told you not to trust them. you won't listen either way.
    const mat = getChevronMaterial()
    const geo = new THREE.PlaneGeometry(0.34, 0.34)
    const N = 10
    for (let k = 0; k < N; k++) {
      const along = 1.5 + k * 1.2
      const back = k >= N / 2 ? -1 : 1 // second half: the way you came
      for (let s = 0; s < 2; s++) {
        const hit = sideHits[s]
        const n = hit.face?.normal
        if (!n || Math.abs(n.y) > 0.3) continue
        const m = new THREE.Mesh(geo, mat)
        m.position.set(
          hit.point.x + fwd.x * along + n.x * 0.014,
          1.28 + Math.sin(k * 3.7 + s) * 0.05,
          hit.point.z + fwd.z * along + n.z * 0.014,
        )
        const decalYaw = Math.atan2(n.x, n.z)
        // apex direction = ±(cos(decalYaw), 0, -sin(decalYaw)) for rotZ=∓π/2
        const apexPlus = Math.cos(decalYaw) * fwd.x - Math.sin(decalYaw) * fwd.z
        const rotZ = (apexPlus * back > 0 ? 1 : -1) * (Math.PI / 2)
        m.rotation.set(0, decalYaw, rotZ, 'YXZ')
        this.ctx.scene.add(m)
      }
    }
    return true
  }

  /** Spec B — for the player who keeps checking behind: once, on turning
   *  back FORWARD, it is ahead instead. Re-allocates the silhouette beat. */
  private armForwardSilhouette(): boolean {
    if (this.silhouetteDone || this.fwdSilState !== 'off') return false
    this.fwdSilState = 'baseline'
    this.fwdSilBaseYaw = this.ctx.player.yaw
    return true
  }

  /** Spec B — for the player who lives in the zoom. */
  private armAutofocus(): boolean {
    if (this.autofocusArmed) return false
    this.autofocusArmed = true
    return true
  }

  /** Per-frame machinery for the armed exploit visuals + wet prints. */
  private stepExploitVisuals(dt: number): void {
    const { player, scene } = this.ctx
    const yaw = player.yaw
    const speed = Math.hypot(player.velocity.x, player.velocity.z)

    // wet prints: wait for the player to look away from their path
    if (this.wetPrintsArmed) {
      if (speed > 0.8) this.wetPrintsDir.set(player.velocity.x / speed, 0, player.velocity.z / speed)
      const gx = -Math.sin(yaw)
      const gz = -Math.cos(yaw)
      const facingPath = gx * this.wetPrintsDir.x + gz * this.wetPrintsDir.z
      if (facingPath < 0.2) {
        this.wetPrintsArmed = false
        const mat = getFootprintMaterial()
        const geo = new THREE.PlaneGeometry(0.11, 0.26)
        const a = Math.atan2(-this.wetPrintsDir.x, -this.wetPrintsDir.z)
        const n = 7 + this.rng.int(0, 3)
        for (let s = 0; s < n; s++) {
          const m = new THREE.Mesh(geo, mat)
          m.rotation.x = -Math.PI / 2
          m.rotation.z = -a + (s % 2 === 0 ? 0.07 : -0.07)
          const lat = (s % 2 === 0 ? 1 : -1) * 0.09
          m.position.set(
            player.position.x + this.wetPrintsDir.x * (6 + s * 0.38) - this.wetPrintsDir.z * lat,
            0.008,
            player.position.z + this.wetPrintsDir.z * (6 + s * 0.38) + this.wetPrintsDir.x * lat,
          )
          scene.add(m)
        }
        // they end mid-corridor. whoever made them stopped needing feet.
      }
    }

    // forward silhouette: detect the check-behind, then the turn back
    if (this.fwdSilState !== 'off') {
      let dyaw = yaw - this.fwdSilBaseYaw
      while (dyaw > Math.PI) dyaw -= Math.PI * 2
      while (dyaw < -Math.PI) dyaw += Math.PI * 2
      if (this.fwdSilState === 'baseline') {
        if (Math.abs(dyaw) > (Math.PI * 120) / 180) {
          this.fwdSilState = 'turned'
        } else if (speed > 0.8 && Math.abs(dyaw) < 0.3) {
          // drift the baseline with sustained travel heading
          this.fwdSilBaseYaw += dyaw * 0.05
        }
      } else if (this.fwdSilState === 'turned' && Math.abs(dyaw) < 0.45) {
        // they turned back forward. it didn't wait behind them.
        this.fwdSilState = 'off'
        this.silhouetteDone = true // re-allocated: still only three beats
        const d = 17
        const geo = new THREE.CapsuleGeometry(0.26, 2.1, 4, 8)
        const mat = new THREE.MeshBasicMaterial({ color: 0x17150f, fog: false })
        this.fwdSilShape = new THREE.Mesh(geo, mat)
        this.fwdSilShape.position.set(
          player.position.x - Math.sin(yaw) * d,
          1.42,
          player.position.z - Math.cos(yaw) * d,
        )
        this.fwdSilShape.scale.set(0.9, 1.16, 0.9)
        scene.add(this.fwdSilShape)
        this.fwdSilT = 1.2
        this.ctx.audio.setHumDetune(-11)
        this.ctx.director.setDreadFloor(0.55)
      }
    }
    if (this.fwdSilT > 0) {
      this.fwdSilT -= dt
      if (this.fwdSilT <= 0 && this.fwdSilShape) {
        scene.remove(this.fwdSilShape)
        this.fwdSilShape.geometry.dispose()
        this.fwdSilShape = null
        this.ctx.audio.setHumDetune(0)
      }
    }

    // autofocus: the lens finds something 38 m out, for half a second
    if (this.autofocusArmed && player.zoom > 0.55) {
      this.autofocusArmed = false
      const geo = new THREE.BoxGeometry(0.42, 1.9, 0.3)
      const mat = new THREE.MeshBasicMaterial({
        color: 0x231f16,
        transparent: true,
        opacity: 0.5,
        fog: false,
      })
      this.autofocusShape = new THREE.Mesh(geo, mat)
      this.autofocusShape.position.set(
        player.position.x - Math.sin(yaw) * 38,
        0.95,
        player.position.z - Math.cos(yaw) * 38,
      )
      scene.add(this.autofocusShape)
      this.autofocusT = 0.5
      this.ctx.post.vhs.intensity = Math.max(this.ctx.post.vhs.intensity, 1.4)
    }
    if (this.autofocusT > 0) {
      this.autofocusT -= dt
      if (this.autofocusT <= 0 && this.autofocusShape) {
        scene.remove(this.autofocusShape)
        this.autofocusShape.geometry.dispose()
        this.autofocusShape = null
        this.ctx.post.vhs.intensity = 1.18
      }
    }

    // the ringing phone hears your gait (run = it hangs up on you)
    if (this.ringingPhone?.handle && !this.ringingPhone.silenced) {
      const d = Math.hypot(
        player.position.x - this.ringingPhone.at.x,
        player.position.z - this.ringingPhone.at.z,
      )
      if (d < 8 && speed > 3.4) {
        this.ringingPhone.handle.stop()
        this.ringingPhone.handle = null
        this.ringingPhone.silenced = true
      }
    }
  }

  // ---- notes ----

  private placeNotes(): void {
    // exploit-queued extras (loud-debt foreshadow) ride the same system
    if (this.extraNoteQueue.length > 0) {
      const spot0 = this.findFloorSpot(7, 12)
      if (spot0) this.spawnNote(spot0, this.extraNoteQueue.shift()!)
    }
    if (this.placedNotes >= NOTE_DISTANCES.length) return
    if (this.walked < NOTE_DISTANCES[this.placedNotes]) return
    const spot = this.findFloorSpot(9, 15)
    if (!spot) return
    const idx = this.placedNotes++
    // page 12 is the live lie: one line reads differently after the meta-beat.
    // re-reading is the only way to catch it, and nobody will believe them.
    const text =
      idx === 6
        ? (): string => (this.metaBeatDone ? TRAIL_NOTE_6_AFTER : TRAIL_NOTES[6])
        : TRAIL_NOTES[idx]
    this.spawnNote(spot, text)
    this.ctx.director.profile.noteReader = this.notesRead / Math.max(1, this.placedNotes)
    // D. left supplies sometimes. the bottles smell like almonds.
    if (idx >= 1 && this.rng.chance(0.45)) {
      this.spawnBottle(spot.x + this.rng.range(-0.9, 0.9), spot.z + this.rng.range(-0.9, 0.9))
    }
  }

  private almondDrunk = 0

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
        this.ctx.audio.playSwallow()
        this.ctx.director.relief(0.18)
        this.ctx.player.steadyT = 40
        this.almondDrunk++
      },
    })
  }

  private spawnNote(at: THREE.Vector3, text: string | (() => string)): void {
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
        this.ctx.notesOverlay.show(typeof text === 'function' ? text() : text)
        if (!mesh.userData.read) {
          mesh.userData.read = true
          this.onNoteRead()
        }
      },
    })
  }

  private onNoteRead(): void {
    this.notesRead++
    this.ctx.director.profile.noteReader = this.notesRead / Math.max(1, this.placedNotes)
    // note 1 explains the matching footsteps; from here the game may keep
    // the promise. (the phenomenon never precedes its own explanation.)
    if (this.notesRead >= 1) this.ctx.director.mimicEnabled = true
    // page 11: "when the lights go brown, count the seconds." the real
    // blackout arrives a half-minute after reading it. it was counting too.
    if (this.notesRead === 6 && !this.blackoutScheduled) {
      this.blackoutScheduled = true
      window.setTimeout(() => this.ctx.director.blackout(), (25 + this.rng.range(0, 20)) * 1000)
    }
    if (this.notesRead >= 7) this.unlockDescent()
  }

  private blackoutScheduled = false
  private broadcastFired = false

  // ---- the red room: seen once, reached never ----
  private redRoom: THREE.Group | null = null
  private redRoomDone = false
  private redRoomAt: THREE.Vector3 | null = null

  // ---- wave 3: kenopsia + impossible artifacts + the Manila Room ----
  private manila: ManilaRoom | null = null
  private phoneDone = false
  private phoneHandle: { hangUp: () => void } | null = null
  private phoneAt: THREE.Vector3 | null = null
  private footprintsDone = false
  private artifactsFired = 0
  private nextArtifactAt = -1

  private descentUnlocked = false

  /** Reading note 7 unlocks the exit — or sheer distance walked, so a
   *  player who never spots the papers can't soft-lock the story. */
  private unlockDescent(): void {
    if (this.descentUnlocked) return
    this.descentUnlocked = true
    this.metaBeatAt = 8 // the tape acknowledges you, 8s after the descent unlocks
    // looming telegraph: the sub swells for ~30s, holds, then RECEDES —
    // "it passed; it's behind you now" — and THEN the near-miss crosses.
    this.ctx.audio.loom(30, 8, 18)
    this.nearMissAt = this.rng.range(64, 82)
    this.placeExit()
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
      // paper doesn't survive the poolrooms (and would float over basins)
      if (this.ctx.world.zoneAt(x, z) === 'pool') continue
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
    hud.setStamp(this.tape2 ? 'JUN.13 2002' : 'JUN.12 2002', 'AM 6:42:00')
    post.vhs.intensity = 2.6
    post.vhs.trackingSurge(1)
    audio.playUi('glitch', 0.5)
    window.setTimeout(() => {
      hud.setRecLabel('REC')
      post.vhs.intensity = 1.18
      // the tape was wounded in that moment. it never heals.
      post.vhs.enableCrease()
    }, 1500)
  }

  // ---- beat: the near-miss (once) ----

  private stepNearMiss(dt: number): void {
    const { player } = this.ctx
    // Spec C: while the prepared still is showing, the beat holds its breath
    if (this.pauseStillActive) return
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
        // it's gone — but the tape keeps it for a few seconds, in case
        // somebody out there believes a note enough to hold the button
        this.nearMissShape.visible = false
        this.nearMissT = -1
        this.nearMissLingerT = 6
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
    this.spawnNote(noteAt, FINAL_NOTE)
    const cam = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.12, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.6 }),
    )
    cam.position.set(noteAt.x + 0.35, 0.06, noteAt.z + 0.2)
    cam.rotation.y = this.rng.range(0, Math.PI)
    this.ctx.scene.add(cam)

    // Lore egg 3 — Tape 2 only: D.'s camcorder still has six seconds in
    // it. They play through YOUR tape, as if ingested. This is his entire
    // on-screen fate. Never show more.
    if (this.tape2) {
      let played = false
      this.ctx.interact.add({
        object: cam,
        label: 'PLAY',
        onUse: () => {
          if (played) return
          played = true
          this.ctx.audio.playDeadCamcorder()
          this.ctx.post.vhs.bumpGeneration(0.08)
        },
      })
    }
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
        // a floor that never stops falling, mixed under the dark
        audio.startShepardDescent(9)
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
      this.saveRun()
      this.slateEl.innerHTML = (this.tape2 ? ENDING_LINES_TAPE2 : ENDING_LINES).join('<br>')
      this.slateEl.classList.remove('hidden')
      if (this.tape2) {
        // Spec E ending: the tapes bleed into each other — one second of
        // run 1's final frame surfaces inside run 2's ending.
        window.setTimeout(() => {
          const held = this.slateEl.innerHTML
          this.slateEl.innerHTML = 'PLAY ►<br>JUN.12 2002&nbsp;&nbsp;&nbsp;AM 6:42:00'
          window.setTimeout(() => {
            this.slateEl.innerHTML = held
          }, 1000)
        }, 3400)
        window.setTimeout(() => {
          this.slateEl.innerHTML =
            'the date on the tape is JUN.13 2002.<br><br>it is always JUN.12 2002.'
          window.setTimeout(() => window.location.reload(), 6500)
        }, 8400)
      } else {
        window.setTimeout(() => {
          this.slateEl.innerHTML =
            'the date on the tape is JUN.12 2002.<br><br>it is always JUN.12 2002.'
          window.setTimeout(() => window.location.reload(), 6500)
        }, 7000)
      }
    }
  }

  /** Spec E — the run summary TAPE 2 is built from. Local only; if the
   *  storage fails, the second tape simply never existed. */
  private saveRun(): void {
    const prev = loadRunSummary()
    const profile = this.ctx.director.profile
    saveRunSummary({
      completions: (prev?.completions ?? 0) + 1,
      notesRead: this.notesRead,
      notesPlaced: this.placedNotes,
      almondDrunk: this.almondDrunk,
      thermosDrunk: this.manila?.thermosDrunkThisRun ?? prev?.thermosDrunk ?? false,
      sleptInManila: this.manila?.sleptHere ?? prev?.sleptInManila ?? false,
      qPauseUsed: this.qPauseUsed || (prev?.qPauseUsed ?? false),
      sprintRatio: profile.sprintRatio,
      lookbackRate: profile.lookbackRate,
      zoomUsage: profile.zoomUsage,
      wallHug: profile.wallHug,
      walked: this.walked,
    })
  }
}

function mkDiv(id: string, cls: string): HTMLDivElement {
  const el = document.createElement('div')
  el.id = id
  if (cls) el.classList.add(cls)
  document.body.appendChild(el)
  return el
}
