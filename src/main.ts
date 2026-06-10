import * as THREE from 'three'
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'
import './style.css'
import { createRenderer } from './core/renderer'
import { Input } from './core/input'
import { Loop } from './core/loop'
import { DebugHud } from './core/debug'
import { PlayerController } from './player/controller'
import { ChunkManager } from './world/manager'
import { CELL } from './world/gen'
import { initWorldMaterials } from './world/materials'
import { FixturePool } from './world/lighting'
import { createPostStack } from './fx/post'
import { CamcorderHud } from './ui/hud'
import { InteractSystem, NoteOverlay } from './player/interact'
import { AudioEngine } from './audio/engine'
import { Director } from './director/director'
import { Narrative } from './story/narrative'

// three-mesh-bvh integration (tech brief: BVH per chunk, accelerated raycasts everywhere)
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const overlay = document.querySelector<HTMLDivElement>('#overlay')!

  const renderer = createRenderer(canvas)
  const scene = new THREE.Scene()

  // Sickly desaturated yellow; fog is both draw-distance budget and dread engine.
  const FOG_COLOR = 0x7a6f45
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.034)
  scene.background = new THREE.Color(FOG_COLOR)

  const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.05, 120)

  // Ambient base: warm from above (fixtures everywhere), carpet bounce from below.
  scene.add(new THREE.HemisphereLight(0xfff1c9, 0x8a7c52, 0.72))

  await initWorldMaterials()

  const input = new Input(canvas)
  const player = new PlayerController(camera)
  const world = new ChunkManager(scene)
  const lights = new FixturePool(scene)
  const SPAWN_X = CELL * 4.5 // middle of the spawn pillar hall
  player.setSpawn(SPAWN_X, 0.5, SPAWN_X)
  world.ensureInitial(SPAWN_X, SPAWN_X)

  const post = createPostStack(renderer, scene, camera)
  const hud = new CamcorderHud()
  const debug = new DebugHud(renderer)
  const interact = new InteractSystem()
  const notes = new NoteOverlay()

  const audio = new AudioEngine()
  const director = new Director({ world, lights, audio, player })
  const narrative = new Narrative({
    scene,
    world,
    player,
    interact,
    notesOverlay: notes,
    audio,
    director,
    hud,
    post,
    input,
  })

  overlay.addEventListener('click', () => {
    input.requestLock()
    void audio.init() // must live in the gesture handler (autoplay policy); idempotent
  })
  input.onLockChange = (locked) => {
    overlay.classList.toggle('hidden', locked)
    if (locked) {
      hud.show()
      narrative.begin()
    } else if (!narrative.ended) {
      hud.hide()
    }
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    post.setSize(window.innerWidth, window.innerHeight)
  })

  const _fwd = new THREE.Vector3()
  const _fixtures: Array<{ x: number; z: number; seed: number }> = []

  // Automation can run the sim without pointer lock (headless playthroughs).
  const devHooks = {
    player,
    input,
    scene,
    camera,
    renderer,
    world,
    lights,
    post,
    hud,
    interact,
    notes,
    audio,
    director,
    narrative,
    THREE,
    autopilot: false,
  }

  const loop = new Loop((dt, time) => {
    const active = input.locked || devHooks.autopilot
    if (active) {
      const justClosedNote = notes.update(input)
      narrative.update(dt)
      player.frozen = notes.reading || narrative.tapePaused || narrative.cinematic
      const colliders = world
        .collidersNear(player.position.x, player.position.z)
        .concat(narrative.colliders)
      player.update(dt, input, colliders)
      interact.update(camera, input, !notes.reading && !justClosedNote)
      hud.update(dt)
      director.update(dt)

      camera.getWorldDirection(_fwd)
      _fixtures.length = 0
      for (const chunk of world.all()) {
        for (const f of chunk.fixtures) _fixtures.push(f)
      }
      const horizSpeed = Math.hypot(player.velocity.x, player.velocity.z)
      audio.update(dt, {
        px: camera.position.x,
        py: camera.position.y,
        pz: camera.position.z,
        fwdX: _fwd.x,
        fwdY: _fwd.y,
        fwdZ: _fwd.z,
        upX: 0,
        upY: 1,
        upZ: 0,
        fixtures: _fixtures,
        speed: horizSpeed,
        onGround: player.onGround,
        sprinting: player.sprinting,
        crouching: player.crouching,
        moving: horizSpeed > 0.05,
      })
    }
    post.vhs.intensity = 1 + player.zoom * 0.55 // zoomed tape strains
    world.update(player.position.x, player.position.z)
    lights.update(world, player.position.x, player.position.z, time)
    debug.update(dt, player.position)
    // "pausing the tape" freezes the frame; the world keeps making sound
    if (!narrative.tapePaused) {
      renderer.info.reset()
      post.composer.render(dt)
    }
  })

  loop.start()

  if (import.meta.env.DEV) {
    // Automation harness for headless playthrough validation (DESIGN.md §13.10).
    Object.assign(window, { __noclip: devHooks })
  }
}

boot().catch((e: unknown) => {
  console.error('[noclip] boot failed:', e)
  document.title = `BOOT FAIL: ${e instanceof Error ? e.message : String(e)}`
})
