import * as THREE from 'three'
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'
import './style.css'
import { createRenderer } from './core/renderer'
import { Input } from './core/input'
import { Loop } from './core/loop'
import { DebugHud } from './core/debug'
import { PlayerController } from './player/controller'
import { ChunkManager } from './world/manager'
import { CELL, FLOOD_Y, WATER_Y, zoneOf } from './world/gen'
import { initWorldMaterials, updateCrtStatic, carpetFlowUniforms } from './world/materials'
import { hasTape2, isTape2Run, selectTape } from './story/tape2'
import { FixturePool } from './world/lighting'
import { createPostStack } from './fx/post'
import { DustMotes } from './fx/dust'
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

  // Ambient base: fluorescent from above (mercury-green spike, never warm),
  // carpet bounce from below. The blackout controller owns its intensity.
  const hemi = new THREE.HemisphereLight(0xf6f4cd, 0x8a7c52, 0.72)
  scene.add(hemi)

  await initWorldMaterials()

  const input = new Input(canvas)
  const player = new PlayerController(camera)
  const world = new ChunkManager(scene)
  // Tape 2 must be decided before the first chunk exists (Spec E)
  world.tape2Variance = isTape2Run() && hasTape2()
  const lights = new FixturePool(scene, hemi)
  const SPAWN_X = CELL * 4.5 // middle of the spawn pillar hall
  player.setSpawn(SPAWN_X, 0.5, SPAWN_X)
  world.ensureInitial(SPAWN_X, SPAWN_X)

  const post = createPostStack(renderer, scene, camera)
  const hud = new CamcorderHud()
  const debug = new DebugHud(renderer)
  const interact = new InteractSystem()
  const notes = new NoteOverlay()

  const audio = new AudioEngine()
  const director = new Director({ world, lights, audio, player, scene })
  director.hud = hud // stamp cards (the breach, REC stop, reverse)
  director.vhs = post.vhs
  const dust = new DustMotes(scene)

  // the mimic learns the player's gait from the foley layer
  audio.onPlayerStep = (sprinting): void => director.notePlayerStep(sprinting)
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

  // re-stitches mark the tape: the picture fails (so the world doesn't have
  // to) and the burn-in clock silently loses half a minute.
  director.onRestitch = (): void => {
    hud.tapeJump()
    post.vhs.trackingSurge(0.55)
    post.vhs.bumpGeneration(0.05)
  }

  // ---- the shelf (Spec E): a second tape appears after first completion
  const tape2Btn = document.querySelector<HTMLButtonElement>('#tape2-btn')
  const tapeShelf = document.querySelector<HTMLDivElement>('#tape-shelf')
  if (tapeShelf && hasTape2()) {
    tapeShelf.classList.remove('hidden')
    const t2 = isTape2Run()
    document.querySelector('#tape1-btn')?.classList.toggle('selected', !t2)
    tape2Btn?.classList.toggle('selected', t2)
  }
  document.querySelector('#tape1-btn')?.addEventListener('click', (e) => {
    e.stopPropagation()
    if (isTape2Run()) {
      selectTape(1)
      window.location.reload()
    }
  })
  tape2Btn?.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!isTape2Run()) {
      selectTape(2)
      window.location.reload()
    }
  })

  // ---- mic opt-in (Spec H): off by default, analysis only, ships quiet
  const micToggle = document.querySelector<HTMLInputElement>('#mic-optin')
  if (micToggle) {
    micToggle.checked = window.localStorage.getItem('noclip.mic') === '1'
    micToggle.addEventListener('click', (e) => e.stopPropagation())
    micToggle.addEventListener('change', () => {
      try {
        window.localStorage.setItem('noclip.mic', micToggle.checked ? '1' : '0')
      } catch {
        /* fine */
      }
    })
  }
  document.querySelector('.mic-row')?.addEventListener('click', (e) => e.stopPropagation())

  overlay.addEventListener('click', () => {
    input.requestLock()
    void audio.init().then(() => {
      // permission flow lives in the same gesture chain; denial = silence
      if (micToggle?.checked) void audio.enableMic()
    })
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
  const _fogTarget = new THREE.Color()
  const _fixtures: Array<{ x: number; z: number; y?: number; seed: number }> = []

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
    dust,
    THREE,
    zoneOf,
    autopilot: false,
    loop: null as Loop | null,
  }

  const loop = new Loop((dt, time) => {
    const active = input.locked || devHooks.autopilot
    if (active) {
      const bot = (devHooks as { playbot?: { running: boolean; update(dt: number): void } }).playbot
      if (bot?.running) bot.update(dt)
      const justClosedNote = notes.update(input)
      narrative.update(dt)
      player.frozen = notes.reading || narrative.tapePaused || narrative.cinematic
      const colliders = world
        .collidersNear(player.position.x, player.position.z)
        .concat(narrative.colliders)
      player.update(dt, input, colliders)
      interact.update(camera, input, !notes.reading && !justClosedNote)
      const spd = Math.hypot(player.velocity.x, player.velocity.z)
      hud.update(dt, director.dread, spd > 0.25)
      director.update(dt)

      camera.getWorldDirection(_fwd)
      _fixtures.length = 0
      for (const chunk of world.all()) {
        for (const f of chunk.fixtures) _fixtures.push(f)
      }
      const horizSpeed = Math.hypot(player.velocity.x, player.velocity.z)
      const zoneHere = world.zoneAt(player.position.x, player.position.z)
      const wingHere =
        zoneHere === 'pool' ||
        zoneHere === 'playground' ||
        zoneHere === 'garage' ||
        zoneHere === 'flooded' ||
        zoneHere === 'office'
          ? zoneHere
          : null
      // standing water: ankle-deep in the flooded wing, knee-deep in a basin
      const inWater =
        zoneHere === 'flooded' ||
        (zoneHere === 'pool' && player.position.y < WATER_Y + 0.05)
      player.waterDepth = inWater
        ? zoneHere === 'flooded'
          ? FLOOD_Y
          : Math.min(0.45, WATER_Y - player.position.y + 0.26)
        : 0
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
        dampNear: zoneHere === 'openDamp',
        zone: wingHere,
        inWater,
      })

      // Office Pocket (G1): the powered CRT interferes with YOUR tape when
      // you stand with it. Two recordings, one bandwidth.
      let crtNear = 0
      if (zoneHere === 'office' || wingHere === 'office') {
        updateCrtStatic(time * 1000)
        for (const chunk of world.all()) {
          if (chunk.zone !== 'office') continue
          for (const crt of chunk.crts) {
            if (!crt.powered) continue
            const d = Math.hypot(crt.x - player.position.x, crt.z - player.position.z)
            crtNear = Math.max(crtNear, 1 - Math.min(d / 2.2, 1))
          }
        }
        if (crtNear > 0.55 && Math.random() < dt * 1.2) post.vhs.trackingSurge(0.3)
      }

      // dread leans on the frame: fog thickens, the lens tightens, the
      // vignette deepens — all at sub-perceptual rates (30s+ time constants)
      const fog = scene.fog as THREE.FogExp2
      fog.density = 0.034 * (1 + director.dread * 0.2 + Math.sin(time * 0.21) * 0.02)
      // each wing breathes its own air (humid blue-white / dark / sodium-grey)
      const fogTarget =
        wingHere === 'pool'
          ? 0x8aa49a
          : wingHere === 'playground'
            ? 0x4c4636
            : wingHere === 'garage'
              ? 0x6b675c
              : wingHere === 'flooded'
                ? 0x66614b // the damp air of a place that lost an argument with water
                : wingHere === 'office'
                  ? 0x80775a // cooler. more honest. somehow worse.
                  : FOG_COLOR
      _fogTarget.setHex(fogTarget)
      lights.fogBase.lerp(_fogTarget, 1 - Math.exp(-0.5 * dt))
      player.dreadNarrow += (director.dread - player.dreadNarrow) * (1 - Math.exp(-0.033 * dt))
      post.vignette.darkness = 0.52 + director.dread * 0.1

      // the tape reacts to the presence before the player can name why
      post.vhs.interference = Math.min(
        1,
        director.dread * 0.15 + director.presenceNearness * 0.6 + crtNear * 0.7,
      )
      hud.setTracking(post.vhs.surging)
      // D10 needs the framebuffer size to know where "center-frame" is
      carpetFlowUniforms.uFlowRes.value.set(canvas.width, canvas.height)
    }
    post.vhs.intensity = 1 + player.zoom * 0.55 // zoomed tape strains
    world.update(player.position.x, player.position.z)
    lights.update(world, player.position.x, player.position.z, time)
    dust.update(dt, camera.position.x, camera.position.z, lights.lightLevel)
    debug.update(dt, player.position)
    // "pausing the tape" freezes the frame; the world keeps making sound.
    // narrative.freezeT is the impossible-artifact variant: the frame holds
    // while every sound continues — the picture blinked, the world didn't.
    // Spec C: the prepared still RENDERS while paused — pause noise, judder
    // and all. What's in that frame was never in the live one.
    if ((!narrative.tapePaused || narrative.pauseStillActive) && narrative.freezeT <= 0) {
      renderer.info.reset()
      post.composer.render(dt)
    }
  })

  loop.start()
  devHooks.loop = loop

  if (import.meta.env.DEV) {
    // Automation harness for headless playthrough validation (DESIGN.md §13.10).
    Object.assign(window, { __noclip: devHooks })
    void import('./dev/playbot').then(({ Playbot }) => {
      ;(devHooks as Record<string, unknown>).playbot = new Playbot({
        player,
        input,
        interact,
        notes,
        narrative,
      })
    })
  }
}

boot().catch((e: unknown) => {
  console.error('[noclip] boot failed:', e)
  document.title = `BOOT FAIL: ${e instanceof Error ? e.message : String(e)}`
})
