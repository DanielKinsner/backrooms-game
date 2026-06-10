import * as THREE from 'three'
import { CELL, CHUNK_CELLS, CHUNK_SIZE, CEIL_H, type ChunkData } from './gen'
import {
  worldMaterials,
  getChalkArrowMaterial,
  getScrawlMaterials,
  getGlowMaterials,
} from './materials'

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
const arrowGeo = new THREE.PlaneGeometry(0.55, 0.55)
const scrawlGeo = new THREE.PlaneGeometry(0.85, 0.85)
const haloGeo = new THREE.PlaneGeometry(1.9, 1.1)
const poolGeo = new THREE.PlaneGeometry(3.2, 2.6)

interface WallFace {
  x: number
  z: number
  nx: number
  nz: number
  len: number
}

export function buildChunkMeshes(data: ChunkData): BuiltChunk {
  const wall = new GeoAccum()
  const trim = new GeoAccum()
  const floor = new GeoAccum()
  const ceil = new GeoAccum()
  const furn = new GeoAccum()
  const wallFaces: WallFace[] = []

  const x0 = data.cx * CHUNK_SIZE
  const z0 = data.cz * CHUNK_SIZE

  // Floor (+y) and ceiling (-y) slabs
  floor.addFace(_o.set(x0, 0, z0 + CHUNK_SIZE), PX, CHUNK_SIZE, NZ, CHUNK_SIZE, PY)
  ceil.addFace(_o.set(x0, CEIL_H, z0), PX, CHUNK_SIZE, PZ, CHUNK_SIZE, NY)

  // Damp patches — openDamp zones always, elsewhere rare (canon: the carpet
  // is moist in places; you notice before you understand why that's wrong)
  const damp = new GeoAccum()
  const dh = (i: number): number => {
    const v = Math.sin(data.cx * 269.5 + data.cz * 183.3 + i * 97.7) * 43758.5453
    return v - Math.floor(v)
  }
  const patchCount = data.zone === 'openDamp' ? 2 + Math.floor(dh(0) * 2) : dh(1) < 0.18 ? 1 : 0
  for (let i = 0; i < patchCount; i++) {
    const w = 1.8 + dh(i * 3 + 2) * 2.4
    const d = 1.8 + dh(i * 3 + 3) * 2.4
    const px = x0 + 1 + dh(i * 3 + 4) * (CHUNK_SIZE - w - 2)
    const pz = z0 + 1 + dh(i * 3 + 5) * (CHUNK_SIZE - d - 2)
    damp.addFace(_o.set(px, 0.004, pz + d), PX, w, NZ, d, PY)
  }

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
      wallFaces.push({ x: (ax + bx) / 2, z: az - WALL_HALF_T, nx: 0, nz: -1, len })
      wallFaces.push({ x: (ax + bx) / 2, z: az + WALL_HALF_T, nx: 0, nz: 1, len })
    } else {
      const len = bz - az
      wall.addFace(_o.set(ax + WALL_HALF_T, 0, bz), NZ, len, PY, CEIL_H, PX) // +x face
      wall.addFace(_o.set(ax - WALL_HALF_T, 0, az), PZ, len, PY, CEIL_H, NX) // -x face
      wall.addFace(_o.set(ax + WALL_HALF_T, 0, az), NX, WALL_HALF_T * 2, PY, CEIL_H, NZ) // south cap
      wall.addFace(_o.set(ax - WALL_HALF_T, 0, bz), PX, WALL_HALF_T * 2, PY, CEIL_H, PZ) // north cap
      trim.addFace(_o.set(ax + WALL_HALF_T + TRIM_OUT, 0, bz), NZ, len, PY, TRIM_H, PX)
      trim.addFace(_o.set(ax - WALL_HALF_T - TRIM_OUT, 0, az), PZ, len, PY, TRIM_H, NX)
      wallFaces.push({ x: ax + WALL_HALF_T, z: (az + bz) / 2, nx: 1, nz: 0, len })
      wallFaces.push({ x: ax - WALL_HALF_T, z: (az + bz) / 2, nx: -1, nz: 0, len })
    }
  }

  /** Axis-aligned box with top face (mantle target), into visual + collider accums. */
  const addFurnBox = (x: number, z: number, w: number, h: number, d: number, y0 = 0): void => {
    const hw = w / 2
    const hd = d / 2
    furn.addFace(_o.set(x + hw, y0, z + hd), NZ, d, PY, h, PX)
    furn.addFace(_o.set(x - hw, y0, z - hd), PZ, d, PY, h, NX)
    furn.addFace(_o.set(x - hw, y0, z + hd), PX, w, PY, h, PZ)
    furn.addFace(_o.set(x + hw, y0, z - hd), NX, w, PY, h, NZ)
    furn.addFace(_o.set(x - hw, y0 + h, z + hd), PX, w, NZ, d, PY)
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

  // Furniture
  for (const f of data.furniture) {
    if (f.kind === 'desk') {
      const [w, d] = f.rot === 0 ? [1.5, 0.7] : [0.7, 1.5]
      addFurnBox(f.x, f.z, w, 0.06, d, 0.68) // top slab
      const [pw, pd] = f.rot === 0 ? [0.06, 0.66] : [0.66, 0.06]
      const off = f.rot === 0 ? [w / 2 - 0.05, 0] : [0, d / 2 - 0.05]
      addFurnBox(f.x - off[0], f.z - off[1], pw, 0.68, pd)
      addFurnBox(f.x + off[0], f.z + off[1], pw, 0.68, pd)
    } else if (f.kind === 'boxes') {
      addFurnBox(f.x, f.z, 0.56, 0.5, 0.56)
      addFurnBox(f.x + 0.04, f.z - 0.03, 0.5, 0.48, 0.5, 0.5)
    } else {
      const [w, d] = f.rot === 0 ? [0.9, 0.5] : [0.5, 0.9]
      addFurnBox(f.x, f.z, w, 1.32, d)
    }
  }

  const group = new THREE.Group()

  // Chalk arrows on long wall faces — seeded, sparse, directionally honest
  // about nothing (DESIGN.md §11: "DON'T trust the arrows").
  let arrows = 0
  const h = (i: number): number => {
    const v = Math.sin(data.cx * 127.1 + data.cz * 311.7 + i * 74.7) * 43758.5453
    return v - Math.floor(v)
  }
  for (let i = 0; i < wallFaces.length && arrows < 2; i++) {
    const f = wallFaces[i]
    if (f.len < 4.7 || h(i) > 0.13) continue
    arrows++
    const m = new THREE.Mesh(arrowGeo, getChalkArrowMaterial())
    m.position.set(f.x + f.nx * 0.012, 1.25 + h(i + 50) * 0.3, f.z + f.nz * 0.012)
    const ry = f.nx === 1 ? Math.PI / 2 : f.nx === -1 ? -Math.PI / 2 : f.nz === 1 ? 0 : Math.PI
    const dir = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(h(i + 90) * 4)]
    m.rotation.set(0, ry, dir + (h(i + 130) - 0.5) * 0.3, 'YXZ')
    group.add(m)
  }

  // Wanderer scrawls (canon: markings since the late 1960s — tallies,
  // warnings, the rune). Rarer than arrows; one per ~3 chunks. The messages
  // never help. That's canon too.
  let scrawls = 0
  const scrawlPool = getScrawlMaterials()
  for (let i = 0; i < wallFaces.length && scrawls < 1; i++) {
    const f = wallFaces[i]
    if (f.len < 3.5 || h(i + 700) > 0.045) continue
    scrawls++
    const pick = Math.floor(h(i + 770) * scrawlPool.length) % scrawlPool.length
    const m = new THREE.Mesh(scrawlGeo, scrawlPool[pick])
    m.position.set(f.x + f.nx * 0.013, 1.18 + h(i + 740) * 0.45, f.z + f.nz * 0.013)
    const ry = f.nx === 1 ? Math.PI / 2 : f.nx === -1 ? -Math.PI / 2 : f.nz === 1 ? 0 : Math.PI
    m.rotation.set(0, ry, (h(i + 810) - 0.5) * 0.16, 'YXZ')
    group.add(m)
  }

  const geos: THREE.BufferGeometry[] = []
  const buckets: Array<[GeoAccum, THREE.Material]> = [
    [floor, worldMaterials.carpet],
    [damp, worldMaterials.carpetDamp],
    [ceil, worldMaterials.ceiling],
    [wall, worldMaterials.wall],
    [trim, worldMaterials.trim],
    [furn, worldMaterials.furniture],
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

    // Volumetric fakes: a soft additive halo hugging each tube (light caught
    // in the haze) + a faint warm pool on the carpet below. Both share two
    // materials so the blackout can starve every halo with one opacity write.
    const { halo, pool } = getGlowMaterials()
    const haloInst = new THREE.InstancedMesh(haloGeo, halo, data.fixtures.length)
    const poolInst = new THREE.InstancedMesh(poolGeo, pool, data.fixtures.length)
    const e = new THREE.Euler()
    data.fixtures.forEach((f, k) => {
      e.set(-Math.PI / 2, 0, f.rotated ? Math.PI / 2 : 0)
      q.setFromEuler(e)
      m.compose(new THREE.Vector3(f.x, CEIL_H - 0.1, f.z), q, new THREE.Vector3(1, 1, 1))
      haloInst.setMatrixAt(k, m)
      m.compose(new THREE.Vector3(f.x, 0.012, f.z), q, new THREE.Vector3(1, 1, 1))
      poolInst.setMatrixAt(k, m)
    })
    haloInst.instanceMatrix.needsUpdate = true
    poolInst.instanceMatrix.needsUpdate = true
    group.add(haloInst, poolInst)
  }

  // Collider: walls + pillars + floor + ceiling merged into one BVH mesh.
  const colliderAccum = new GeoAccum()
  colliderAccum.pos = floor.pos.concat(ceil.pos, wall.pos, furn.pos)
  colliderAccum.norm = floor.norm.concat(ceil.norm, wall.norm, furn.norm)
  colliderAccum.uv = floor.uv.concat(ceil.uv, wall.uv, furn.uv)
  let offset = 0
  for (const part of [floor, ceil, wall, furn]) {
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
