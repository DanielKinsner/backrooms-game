import * as THREE from 'three'
import { CELL, CHUNK_CELLS, CHUNK_SIZE, CEIL_H, type ChunkData } from './gen'
import { worldMaterials } from './materials'

/**
 * Chunk geometry. All vertices are baked in WORLD space and UVs are the
 * world-position projection in meters, so textures tile seamlessly across
 * chunk borders and wall runs. One geometry per surface material per chunk.
 */

const WALL_HALF_T = 0.1
const TRIM_H = 0.12
const TRIM_OUT = 0.015 // baseboard sticks out past the wall face

class GeoAccum {
  pos: number[] = []
  norm: number[] = []
  uv: number[] = []
  idx: number[] = []

  /**
   * Quad from `origin` spanning uDir*uLen × vDir*vLen, wound so the face
   * normal equals cross(uDir, vDir). UV = dot(worldPos, dir) in meters.
   */
  addFace(
    o: THREE.Vector3,
    u: THREE.Vector3,
    uLen: number,
    v: THREE.Vector3,
    vLen: number,
    n: THREE.Vector3,
  ): void {
    const base = this.pos.length / 3
    const u0 = o.dot(u)
    const v0 = o.dot(v)
    for (const [du, dv] of [
      [0, 0],
      [uLen, 0],
      [uLen, vLen],
      [0, vLen],
    ] as const) {
      this.pos.push(o.x + u.x * du + v.x * dv, o.y + u.y * du + v.y * dv, o.z + u.z * du + v.z * dv)
      this.norm.push(n.x, n.y, n.z)
      this.uv.push(u0 + du, v0 + dv)
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  build(): THREE.BufferGeometry | null {
    if (this.idx.length === 0) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    geo.setIndex(this.idx)
    return geo
  }
}

const _o = new THREE.Vector3()
const PX = new THREE.Vector3(1, 0, 0)
const NX = new THREE.Vector3(-1, 0, 0)
const PY = new THREE.Vector3(0, 1, 0)
const NY = new THREE.Vector3(0, -1, 0)
const PZ = new THREE.Vector3(0, 0, 1)
const NZ = new THREE.Vector3(0, 0, -1)

export interface BuiltChunk {
  cx: number
  cz: number
  group: THREE.Group
  collider: THREE.Mesh
  fixtures: ChunkData['fixtures']
  zone: ChunkData['zone']
  dispose: () => void
}

const fixtureGeo = new THREE.BoxGeometry(1.2, 0.06, 0.6)

export function buildChunkMeshes(data: ChunkData): BuiltChunk {
  const wall = new GeoAccum()
  const trim = new GeoAccum()
  const floor = new GeoAccum()
  const ceil = new GeoAccum()

  const x0 = data.cx * CHUNK_SIZE
  const z0 = data.cz * CHUNK_SIZE

  // Floor (+y) and ceiling (-y) slabs
  floor.addFace(_o.set(x0, 0, z0 + CHUNK_SIZE), PX, CHUNK_SIZE, NZ, CHUNK_SIZE, PY)
  ceil.addFace(_o.set(x0, CEIL_H, z0), PX, CHUNK_SIZE, PZ, CHUNK_SIZE, NY)

  const addWallBox = (ax: number, az: number, bx: number, bz: number, alongX: boolean): void => {
    // Wall slab from (ax,az) to (bx,bz) along its axis, WALL_HALF_T each side.
    if (alongX) {
      const len = bx - ax
      wall.addFace(_o.set(bx, 0, az - WALL_HALF_T), NX, len, PY, CEIL_H, NZ) // -z face
      wall.addFace(_o.set(ax, 0, az + WALL_HALF_T), PX, len, PY, CEIL_H, PZ) // +z face
      wall.addFace(_o.set(ax, 0, az - WALL_HALF_T), PZ, WALL_HALF_T * 2, PY, CEIL_H, NX) // west cap
      wall.addFace(_o.set(bx, 0, az + WALL_HALF_T), NZ, WALL_HALF_T * 2, PY, CEIL_H, PX) // east cap
      trim.addFace(_o.set(bx, 0, az - WALL_HALF_T - TRIM_OUT), NX, len, PY, TRIM_H, NZ)
      trim.addFace(_o.set(ax, 0, az + WALL_HALF_T + TRIM_OUT), PX, len, PY, TRIM_H, PZ)
    } else {
      const len = bz - az
      wall.addFace(_o.set(ax + WALL_HALF_T, 0, bz), NZ, len, PY, CEIL_H, PX) // +x face
      wall.addFace(_o.set(ax - WALL_HALF_T, 0, az), PZ, len, PY, CEIL_H, NX) // -x face
      wall.addFace(_o.set(ax + WALL_HALF_T, 0, az), NX, WALL_HALF_T * 2, PY, CEIL_H, NZ) // south cap
      wall.addFace(_o.set(ax - WALL_HALF_T, 0, bz), PX, WALL_HALF_T * 2, PY, CEIL_H, PZ) // north cap
      trim.addFace(_o.set(ax + WALL_HALF_T + TRIM_OUT, 0, bz), NZ, len, PY, TRIM_H, PX)
      trim.addFace(_o.set(ax - WALL_HALF_T - TRIM_OUT, 0, az), PZ, len, PY, TRIM_H, NX)
    }
  }

  // Vertical wall runs (lines 0..7; line 8 belongs to the next chunk east)
  for (let li = 0; li < CHUNK_CELLS; li++) {
    const X = x0 + li * CELL
    let j = 0
    while (j < CHUNK_CELLS) {
      if (!data.vWalls[li][j]) {
        j++
        continue
      }
      let j2 = j
      while (j2 < CHUNK_CELLS && data.vWalls[li][j2]) j2++
      addWallBox(X, z0 + j * CELL, X, z0 + j2 * CELL, false)
      j = j2
    }
  }
  // Horizontal wall runs
  for (let lj = 0; lj < CHUNK_CELLS; lj++) {
    const Z = z0 + lj * CELL
    let i = 0
    while (i < CHUNK_CELLS) {
      if (!data.hWalls[i][lj]) {
        i++
        continue
      }
      let i2 = i
      while (i2 < CHUNK_CELLS && data.hWalls[i2][lj]) i2++
      addWallBox(x0 + i * CELL, Z, x0 + i2 * CELL, Z, true)
      i = i2
    }
  }

  // Pillars: 4 faces + baseboard ring
  for (const p of data.pillars) {
    const h = p.size / 2
    wall.addFace(_o.set(p.x + h, 0, p.z + h), NZ, p.size, PY, CEIL_H, PX)
    wall.addFace(_o.set(p.x - h, 0, p.z - h), PZ, p.size, PY, CEIL_H, NX)
    wall.addFace(_o.set(p.x - h, 0, p.z + h), PX, p.size, PY, CEIL_H, PZ)
    wall.addFace(_o.set(p.x + h, 0, p.z - h), NX, p.size, PY, CEIL_H, NZ)
    const t = h + TRIM_OUT
    trim.addFace(_o.set(p.x + t, 0, p.z + t), NZ, p.size + TRIM_OUT * 2, PY, TRIM_H, PX)
    trim.addFace(_o.set(p.x - t, 0, p.z - t), PZ, p.size + TRIM_OUT * 2, PY, TRIM_H, NX)
    trim.addFace(_o.set(p.x - t, 0, p.z + t), PX, p.size + TRIM_OUT * 2, PY, TRIM_H, PZ)
    trim.addFace(_o.set(p.x + t, 0, p.z - t), NX, p.size + TRIM_OUT * 2, PY, TRIM_H, NZ)
  }

  const group = new THREE.Group()
  const geos: THREE.BufferGeometry[] = []
  const buckets: Array<[GeoAccum, THREE.Material]> = [
    [floor, worldMaterials.carpet],
    [ceil, worldMaterials.ceiling],
    [wall, worldMaterials.wall],
    [trim, worldMaterials.trim],
  ]
  for (const [accum, mat] of buckets) {
    const geo = accum.build()
    if (!geo) continue
    geos.push(geo)
    group.add(new THREE.Mesh(geo, mat))
  }

  // Ceiling light fixtures (instanced, emissive; lighting pool attaches later)
  if (data.fixtures.length > 0) {
    const inst = new THREE.InstancedMesh(fixtureGeo, worldMaterials.fixture, data.fixtures.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    data.fixtures.forEach((f, k) => {
      q.setFromAxisAngle(up, f.rotated ? Math.PI / 2 : 0)
      m.compose(new THREE.Vector3(f.x, CEIL_H - 0.03, f.z), q, new THREE.Vector3(1, 1, 1))
      inst.setMatrixAt(k, m)
    })
    inst.instanceMatrix.needsUpdate = true
    group.add(inst)
  }

  // Collider: walls + pillars + floor + ceiling merged into one BVH mesh.
  const colliderAccum = new GeoAccum()
  colliderAccum.pos = floor.pos.concat(ceil.pos, wall.pos)
  colliderAccum.norm = floor.norm.concat(ceil.norm, wall.norm)
  colliderAccum.uv = floor.uv.concat(ceil.uv, wall.uv)
  let offset = 0
  for (const part of [floor, ceil, wall]) {
    for (const i of part.idx) colliderAccum.idx.push(i + offset)
    offset += part.pos.length / 3
  }
  const colliderGeo = colliderAccum.build()!
  colliderGeo.computeBoundsTree()
  const collider = new THREE.Mesh(colliderGeo)
  collider.visible = false
  collider.updateMatrixWorld(true)

  return {
    cx: data.cx,
    cz: data.cz,
    group,
    collider,
    fixtures: data.fixtures,
    zone: data.zone,
    dispose: () => {
      for (const geo of geos) geo.dispose()
      colliderGeo.disposeBoundsTree()
      colliderGeo.dispose()
    },
  }
}
