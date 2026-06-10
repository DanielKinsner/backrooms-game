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

// three-mesh-bvh integration (tech brief: BVH per chunk, accelerated raycasts everywhere)
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast

const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const overlay = document.querySelector<HTMLDivElement>('#overlay')!

const renderer = createRenderer(canvas)
const scene = new THREE.Scene()

// Sickly desaturated yellow-green; fog is both draw-distance budget and dread engine.
const FOG_COLOR = 0x73683f
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.05)
scene.background = new THREE.Color(FOG_COLOR)

const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.05, 120)

// Interim ambient until the Task 5 lighting pass (fixture pool + GTAO).
scene.add(new THREE.HemisphereLight(0xfff0c4, 0x595134, 0.8))

const input = new Input(canvas)
const player = new PlayerController(camera)
const world = new ChunkManager(scene)
const SPAWN_X = CELL * 4.5 // middle of the spawn pillar hall
player.setSpawn(SPAWN_X, 0.5, SPAWN_X)
world.ensureInitial(SPAWN_X, SPAWN_X)

const hud = new DebugHud(renderer)

overlay.addEventListener('click', () => input.requestLock())
input.onLockChange = (locked) => overlay.classList.toggle('hidden', locked)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// Automation can run the sim without pointer lock (headless playthroughs).
const devHooks = { player, input, scene, camera, renderer, world, autopilot: false }

const loop = new Loop((dt) => {
  if (input.locked || devHooks.autopilot) {
    player.update(dt, input, world.collidersNear(player.position.x, player.position.z))
  }
  world.update(player.position.x, player.position.z)
  hud.update(dt, player.position)
  renderer.render(scene, camera)
})

loop.start()

if (import.meta.env.DEV) {
  // Automation harness for headless playthrough validation (DESIGN.md §13.10).
  Object.assign(window, { __noclip: devHooks })
}
