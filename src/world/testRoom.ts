import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { Rng } from '../core/rng'

/**
 * Throwaway test chamber for validating the controller and render loop.
 * Placeholder mono-yellow materials; real Level 0 modules replace this in Task 4.
 */
export interface BuiltWorld {
  group: THREE.Group
  colliders: THREE.Mesh[]
}

const CEIL = 2.8

export function buildTestRoom(scene: THREE.Scene): BuiltWorld {
  RectAreaLightUniformsLib.init()

  const rng = new Rng('level0-test-chamber')
  const group = new THREE.Group()
  const colliderGeos: THREE.BufferGeometry[] = []

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xb9a55c, roughness: 0.92 })
  const carpetMat = new THREE.MeshStandardMaterial({ color: 0x8a7a45, roughness: 1.0 })
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xd8d0b2, roughness: 0.9 })
  const fixtureMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff6dc,
    emissiveIntensity: 1.4,
  })

  const addBox = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    solid = true,
  ): void => {
    const geo = new THREE.BoxGeometry(w, h, d)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.updateMatrix()
    group.add(mesh)
    if (solid) {
      const cg = geo.clone()
      cg.applyMatrix4(mesh.matrix)
      colliderGeos.push(cg)
    }
  }

  const SIZE = 40
  // Floor and ceiling slabs
  addBox(SIZE, 0.2, SIZE, 0, -0.1, 0, carpetMat)
  addBox(SIZE, 0.2, SIZE, 0, CEIL + 0.1, 0, ceilMat)
  // Perimeter walls
  addBox(SIZE, CEIL, 0.3, 0, CEIL / 2, -SIZE / 2, wallMat)
  addBox(SIZE, CEIL, 0.3, 0, CEIL / 2, SIZE / 2, wallMat)
  addBox(0.3, CEIL, SIZE, -SIZE / 2, CEIL / 2, 0, wallMat)
  addBox(0.3, CEIL, SIZE, SIZE / 2, CEIL / 2, 0, wallMat)

  // Jittered pillar grid (canon: segmentation is irregular, never gridded)
  for (let gx = -15; gx <= 15; gx += 5) {
    for (let gz = -15; gz <= 15; gz += 5) {
      if (Math.abs(gx) < 4 && Math.abs(gz) < 4) continue // keep spawn clear
      if (rng.chance(0.25)) continue
      const x = gx + rng.range(-1.2, 1.2)
      const z = gz + rng.range(-1.2, 1.2)
      addBox(0.6, CEIL, 0.6, x, CEIL / 2, z, wallMat)
    }
  }

  // A few interior wall stubs to make corridors
  for (let i = 0; i < 6; i++) {
    const len = rng.range(4, 9)
    const horizontal = rng.chance(0.5)
    const x = rng.range(-14, 14)
    const z = rng.range(-14, 14)
    if (Math.abs(x) < 4 && Math.abs(z) < 4) continue
    addBox(horizontal ? len : 0.25, CEIL, horizontal ? 0.25 : len, x, CEIL / 2, z, wallMat)
  }

  // Mantle-height test obstacles near spawn
  addBox(1.4, 0.5, 1.4, 3, 0.25, 0, wallMat)
  addBox(1.2, 0.9, 1.2, 3, 0.45, 2.5, wallMat)
  addBox(1.0, 1.1, 1.0, 3, 0.55, -2.5, wallMat)

  // Light fixtures: emissive panels on a loose grid, RectAreaLights on the near ones
  let rectLights = 0
  for (let gx = -16; gx <= 16; gx += 8) {
    for (let gz = -16; gz <= 16; gz += 8) {
      const x = gx + rng.range(-1.5, 1.5)
      const z = gz + rng.range(-1.5, 1.5)
      addBox(1.2, 0.05, 0.6, x, CEIL - 0.03, z, fixtureMat, false)
      if (rectLights < 6 && Math.abs(x) < 13 && Math.abs(z) < 13) {
        const light = new THREE.RectAreaLight(0xfff3d6, 4.2, 1.2, 0.6)
        light.position.set(x, CEIL - 0.06, z)
        light.lookAt(x, 0, z)
        group.add(light)
        rectLights++
      }
    }
  }

  scene.add(new THREE.HemisphereLight(0xfff2cc, 0x44402a, 0.45))

  // One merged static collider with a BVH — the per-chunk pattern Task 4 will reuse.
  const merged = mergeGeometries(colliderGeos, false)
  colliderGeos.forEach((g) => g.dispose())
  merged.computeBoundsTree()
  const collider = new THREE.Mesh(merged)
  collider.visible = false
  collider.updateMatrixWorld(true)

  scene.add(group)
  return { group, colliders: [collider] }
}
