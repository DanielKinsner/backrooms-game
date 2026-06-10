import * as THREE from 'three'
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'
import './style.css'
import { createRenderer } from './core/renderer'
import { Input } from './core/input'
import { Loop } from './core/loop'
import { DebugHud } from './core/debug'
import { PlayerController } from './player/controller'
import { buildTestRoom } from './world/testRoom'

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

const input = new Input(canvas)
const player = new PlayerController(camera)
const world = buildTestRoom(scene)
player.setSpawn(0, 0.5, 0)

const hud = new DebugHud(renderer)

overlay.addEventListener('click', () => input.requestLock())
input.onLockChange = (locked) => overlay.classList.toggle('hidden', locked)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

const loop = new Loop((dt) => {
  if (input.locked) {
    player.update(dt, input, world.colliders)
  }
  hud.update(dt, player.position)
  renderer.render(scene, camera)
})

loop.start()

if (import.meta.env.DEV) {
  // Automation harness for headless playthrough validation (DESIGN.md §13.10).
  Object.assign(window, { __noclip: { player, input, scene, camera, renderer } })
}
