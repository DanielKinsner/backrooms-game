import * as THREE from 'three'
import { manilaMaterial } from '../world/materials'
import type { PlayerController } from '../player/controller'
import type { InteractSystem, NoteOverlay } from '../player/interact'
import type { AudioEngine } from '../audio/engine'
import type { Director } from '../director/director'
import type { PostStack } from '../fx/post'

/**
 * The Manila Room (canon: Level 0's sole resting anomaly — the one place
 * the Isolation Effect lifts). Placed once mid-arc. While inside: the hum
 * softens to a purr, the director holds its breath, dread drains slowly.
 * D.'s most human note is here, and his thermos.
 *
 * The moment the player has left it well behind, the room stops existing.
 * It is never findable again. Leaving should feel like a regretted choice.
 */

const ROOM_W = 4.8
const ROOM_D = 4.2
const DOOR_W = 1.1

const MANILA_NOTE = `no page number

I slept here.
actual sleep.

the hum doesn't come in.
I don't know what this
room is and I don't care.

I left you the thermos.
drink it slow.

whoever you are —
you're doing fine.

— D.`

interface Ctx {
  scene: THREE.Scene
  player: PlayerController
  interact: InteractSystem
  notesOverlay: NoteOverlay
  audio: AudioEngine
  director: Director
  post: PostStack
  colliders: THREE.Mesh[] // narrative's collider list (shared with main)
}

export class ManilaRoom {
  placed = false
  gone = false

  private group: THREE.Group | null = null
  private myColliders: THREE.Mesh[] = []
  private center = new THREE.Vector3()
  private yaw = 0
  private inside = false
  private wasInside = false

  constructor(private readonly ctx: Ctx) {}

  /** Build the room at `spot`, doorway facing the player's approach. */
  place(spot: THREE.Vector3): void {
    if (this.placed) return
    this.placed = true
    const { scene, player, interact, notesOverlay, audio, director } = this.ctx

    const group = new THREE.Group()
    this.group = group
    this.center.copy(spot)
    this.yaw = Math.atan2(player.position.x - spot.x, player.position.z - spot.z)
    group.position.copy(spot)
    group.rotation.y = this.yaw

    const H = 2.65 // slightly lower than the maze: a room, not a hall
    const T = 0.14
    const mk = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), manilaMaterial)
      m.position.set(x, y, z)
      group.add(m)
      return m
    }
    // front wall (door side, facing player): two panels around the doorway
    const sideW = (ROOM_W - DOOR_W) / 2
    const walls = [
      mk(sideW, H, T, -(DOOR_W + sideW) / 2, H / 2, ROOM_D / 2),
      mk(sideW, H, T, (DOOR_W + sideW) / 2, H / 2, ROOM_D / 2),
      mk(ROOM_W, H, T, 0, H / 2, -ROOM_D / 2), // back
      mk(T, H, ROOM_D, -ROOM_W / 2, H / 2, 0), // west
      mk(T, H, ROOM_D, ROOM_W / 2, H / 2, 0), // east
      mk(ROOM_W, T, ROOM_D, 0, H + T / 2, 0), // its own ceiling, lower, closer
      mk(ROOM_W, 0.1, T, 0, H - 0.05, ROOM_D / 2), // door lintel
    ]

    // its own light: steady, warm, no flicker. the only honest light here.
    const lamp = new THREE.PointLight(0xffe7b8, 1.6, 7, 1.6)
    lamp.position.set(0, H - 0.4, 0)
    group.add(lamp)

    // the table, the thermos, the note
    const table = mk(1.1, 0.06, 0.7, 0.9, 0.72, -0.9)
    mk(0.07, 0.7, 0.07, 0.45, 0.35, -0.7)
    mk(0.07, 0.7, 0.07, 1.35, 0.35, -1.1)
    void table
    const thermos = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.06, 0.3, 12),
      new THREE.MeshStandardMaterial({ color: 0x8b9094, roughness: 0.35, metalness: 0.4 }),
    )
    thermos.position.set(0.75, 0.9, -0.95)
    group.add(thermos)

    const note = new THREE.Mesh(
      new THREE.PlaneGeometry(0.21, 0.297),
      new THREE.MeshStandardMaterial({ color: 0xd8cda8, roughness: 0.9, side: THREE.DoubleSide }),
    )
    note.rotation.x = -Math.PI / 2
    note.rotation.z = 0.4
    note.position.set(1.1, 0.756, -0.85)
    group.add(note)

    scene.add(group)

    // colliders (world-space clones into the narrative collider list)
    for (const w of walls) {
      const cg = w.geometry.clone()
      w.updateMatrixWorld(true)
      cg.applyMatrix4(w.matrixWorld)
      cg.computeBoundsTree()
      const cm = new THREE.Mesh(cg)
      cm.visible = false
      cm.updateMatrixWorld(true)
      this.myColliders.push(cm)
      this.ctx.colliders.push(cm)
    }

    interact.add({
      object: note,
      label: 'READ',
      once: false,
      onUse: () => notesOverlay.show(MANILA_NOTE),
    })
    let drunk = false
    interact.add({
      object: thermos,
      label: 'DRINK',
      onUse: () => {
        if (drunk) return
        drunk = true
        group.remove(thermos)
        notesOverlay.show('still warm.')
        audio.playSwallow()
        director.relief(0.3)
        this.ctx.player.steadyT = 70
      },
    })
  }

  update(dt: number): void {
    if (!this.placed || this.gone || !this.group) return
    const { player, audio, director, post } = this.ctx

    // inside test in room-local space
    const dx = player.position.x - this.center.x
    const dz = player.position.z - this.center.z
    const cos = Math.cos(-this.yaw)
    const sin = Math.sin(-this.yaw)
    const lx = dx * cos - dz * sin
    const lz = dx * sin + dz * cos
    this.inside = Math.abs(lx) < ROOM_W / 2 - 0.05 && Math.abs(lz) < ROOM_D / 2 - 0.05

    if (this.inside && !this.wasInside) {
      // the building stops looking at you
      director.suppressed = true
      audio.setHumMuffle(0.8)
      audio.setHumBreath(0)
      audio.setHumDetune(0)
    } else if (!this.inside && this.wasInside) {
      director.suppressed = false
      audio.setHumMuffle(0)
      // the hum comes back at full spectrum, and the tape flinches
      post.vhs.trackingSurge(0.7)
    }
    this.wasInside = this.inside

    if (this.inside) {
      director.relief(dt * 0.01) // dread drains while you rest
    }

    // once well behind the player, the room stops existing — forever
    const dist = Math.hypot(dx, dz)
    if (!this.inside && dist > 45) {
      this.gone = true
      this.ctx.scene.remove(this.group)
      this.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose()
      })
      for (const c of this.myColliders) {
        const i = this.ctx.colliders.indexOf(c)
        if (i >= 0) this.ctx.colliders.splice(i, 1)
        c.geometry.disposeBoundsTree()
        c.geometry.dispose()
      }
      this.group = null
    }
  }
}
