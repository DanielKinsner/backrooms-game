import * as THREE from 'three'
import {
  CELL,
  CHUNK_CELLS,
  CHUNK_SIZE,
  CEIL_H,
  BASIN_DEPTH,
  WATER_Y,
  isWing,
  ceilHeightFor,
  zoneOf,
  type ChunkData,
} from './gen'
import {
  worldMaterials,
  wingMaterials,
  initWingMaterials,
  officeMaterials,
  initOfficeMaterials,
  floodWaterMaterial,
  floodedMaterials,
  initFloodedMaterials,
  getCrtStaticMaterial,
  getChalkArrowMaterial,
  getScrawlMaterials,
  getPlayScrawlMaterials,
  getGlowMaterials,
  getCrayonMaterial,
  getStencilMaterial,
  getFloorArrowMaterial,
} from './materials'
import { FLOOD_Y } from './gen'

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
  /** Office CRTs (main checks proximity to the powered one). */
  crts: ChunkData['crts']
  dispose: () => void
}

const fixtureGeo = new THREE.BoxGeometry(1.2, 0.06, 0.6)
const arrowGeo = new THREE.PlaneGeometry(0.55, 0.55)
const scrawlGeo = new THREE.PlaneGeometry(0.85, 0.85)
const crayonGeo = new THREE.PlaneGeometry(0.5, 0.5)
const stencilGeo = new THREE.PlaneGeometry(0.5, 0.25)
const floorArrowGeo = new THREE.PlaneGeometry(0.9, 0.9)
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
  const wing = isWing(data.zone)
  if (wing) initWingMaterials()
  if (data.zone === 'office') initOfficeMaterials()
  if (data.zone === 'flooded') initFloodedMaterials()

  const wall = new GeoAccum()
  const trim = new GeoAccum()
  const floor = new GeoAccum()
  const ceil = new GeoAccum()
  const furn = new GeoAccum()
  const partition = new GeoAccum() // office cubicle fabric
  const laminate = new GeoAccum() // office desks + CRT shells
  const basin = new GeoAccum()
  const plastic: GeoAccum[] = [new GeoAccum(), new GeoAccum(), new GeoAccum(), new GeoAccum()]
  const hiddenColliders = new GeoAccum() // collider-only volumes (slide tubes)
  const wallFaces: WallFace[] = []
  const useTrim = data.zone !== 'pool' && data.zone !== 'garage'

  const x0 = data.cx * CHUNK_SIZE
  const z0 = data.cz * CHUNK_SIZE

  // Floor (+y) — solid slab, or strips around sunken basins (Poolrooms)
  if (data.basins.length === 0) {
    floor.addFace(_o.set(x0, 0, z0 + CHUNK_SIZE), PX, CHUNK_SIZE, NZ, CHUNK_SIZE, PY)
  } else {
    for (const b of data.basins) {
      // border strips: south, north, west, east of the hole
      const S = CHUNK_SIZE
      if (b.z > z0) floor.addFace(_o.set(x0, 0, b.z), PX, S, NZ, b.z - z0, PY)
      if (b.z + b.d < z0 + S)
        floor.addFace(_o.set(x0, 0, z0 + S), PX, S, NZ, z0 + S - (b.z + b.d), PY)
      if (b.x > x0) floor.addFace(_o.set(x0, 0, b.z + b.d), PX, b.x - x0, NZ, b.d, PY)
      if (b.x + b.w < x0 + S)
        floor.addFace(_o.set(b.x + b.w, 0, b.z + b.d), PX, x0 + S - (b.x + b.w), NZ, b.d, PY)
      // basin inner walls (normals face INTO the pool) + bottom
      basin.addFace(_o.set(b.x, -BASIN_DEPTH, b.z + b.d), NZ, b.d, PY, BASIN_DEPTH, PX)
      basin.addFace(_o.set(b.x + b.w, -BASIN_DEPTH, b.z), PZ, b.d, PY, BASIN_DEPTH, NX)
      basin.addFace(_o.set(b.x, -BASIN_DEPTH, b.z), PX, b.w, PY, BASIN_DEPTH, PZ)
      basin.addFace(_o.set(b.x + b.w, -BASIN_DEPTH, b.z + b.d), NX, b.w, PY, BASIN_DEPTH, NZ)
      basin.addFace(_o.set(b.x, -BASIN_DEPTH, b.z + b.d), PX, b.w, NZ, b.d, PY)
    }
  }
  // ceiling (-y) — garage ceilings press lower; soffit bands close the seam
  // against neighbors with full-height ceilings.
  const zCeil = ceilHeightFor(data.zone)
  ceil.addFace(_o.set(x0, zCeil, z0), PX, CHUNK_SIZE, PZ, CHUNK_SIZE, NY)
  if (zCeil < CEIL_H) {
    const S = CHUNK_SIZE
    const h = CEIL_H - zCeil
    if (zoneOf(data.cx - 1, data.cz) !== data.zone)
      ceil.addFace(_o.set(x0, zCeil, z0 + S), NZ, S, PY, h, PX)
    if (zoneOf(data.cx + 1, data.cz) !== data.zone)
      ceil.addFace(_o.set(x0 + S, zCeil, z0), PZ, S, PY, h, NX)
    if (zoneOf(data.cx, data.cz - 1) !== data.zone)
      ceil.addFace(_o.set(x0, zCeil, z0), PX, S, PY, h, PZ)
    if (zoneOf(data.cx, data.cz + 1) !== data.zone)
      ceil.addFace(_o.set(x0 + S, zCeil, z0 + S), NX, S, PY, h, NZ)
  }

  // Damp patches — openDamp zones always, elsewhere rare (canon: the carpet
  // is moist in places; you notice before you understand why that's wrong)
  const damp = new GeoAccum()
  const dh = (i: number): number => {
    const v = Math.sin(data.cx * 269.5 + data.cz * 183.3 + i * 97.7) * 43758.5453
    return v - Math.floor(v)
  }
  const patchCount =
    data.zone === 'openDamp' ? 2 + Math.floor(dh(0) * 2) : !wing && dh(1) < 0.18 ? 1 : 0
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

  /** Axis-aligned box with top face (mantle target), into a visual accum. */
  const addBoxTo = (
    acc: GeoAccum,
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    y0 = 0,
  ): void => {
    const hw = w / 2
    const hd = d / 2
    acc.addFace(_o.set(x + hw, y0, z + hd), NZ, d, PY, h, PX)
    acc.addFace(_o.set(x - hw, y0, z - hd), PZ, d, PY, h, NX)
    acc.addFace(_o.set(x - hw, y0, z + hd), PX, w, PY, h, PZ)
    acc.addFace(_o.set(x + hw, y0, z - hd), NX, w, PY, h, NZ)
    acc.addFace(_o.set(x - hw, y0 + h, z + hd), PX, w, NZ, d, PY)
  }
  const addFurnBox = (x: number, z: number, w: number, h: number, d: number, y0 = 0): void =>
    addBoxTo(furn, x, z, w, h, d, y0)

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
    if (f.kind === 'cubicle') {
      // U-shaped fabric pod, 1.9 m square, 1.42 m high — head height when
      // seated, eye height when crouched, occlusion either way (G1).
      const H = 1.42
      const T = 0.07
      const R = 0.95
      if (f.rot === 0) {
        // opens toward +x
        addBoxTo(partition, f.x, f.z - R, R * 2, H, T)
        addBoxTo(partition, f.x, f.z + R, R * 2, H, T)
        addBoxTo(partition, f.x - R, f.z, T, H, R * 2 - T)
        addBoxTo(laminate, f.x - R + 0.36, f.z, 0.6, 0.04, 1.5, 0.7)
      } else {
        // opens toward +z
        addBoxTo(partition, f.x - R, f.z, T, H, R * 2)
        addBoxTo(partition, f.x + R, f.z, T, H, R * 2)
        addBoxTo(partition, f.x, f.z - R, R * 2 - T, H, T)
        addBoxTo(laminate, f.x, f.z - R + 0.36, 1.5, 0.04, 0.6, 0.7)
      }
      continue
    }
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
  const extraGeos: THREE.BufferGeometry[] = []

  // ---- play structures (Level Fun =) — a playplace with no children) ----
  const slideMeshes: THREE.Mesh[] = []
  for (const s of data.structures) {
    const acc = plastic[s.color]
    const acc2 = plastic[(s.color + 1) % plastic.length]
    if (s.kind === 'tower') {
      for (const [ox, oz] of [
        [-0.8, -0.8],
        [0.8, -0.8],
        [-0.8, 0.8],
        [0.8, 0.8],
      ] as const) {
        addBoxTo(acc, s.x + ox, s.z + oz, 0.09, 1.85, 0.09)
      }
      addBoxTo(acc2, s.x, s.z, 1.85, 0.07, 1.85, 0.85) // deck (mantle target)
      addBoxTo(acc, s.x, s.z - 0.8, 1.7, 0.06, 0.05, 1.32) // rails
      addBoxTo(acc, s.x, s.z + 0.8, 1.7, 0.06, 0.05, 1.32)
      addBoxTo(acc, s.x - 0.8, s.z, 0.05, 0.06, 1.7, 1.32)
      addBoxTo(acc, s.x + 0.8, s.z, 0.05, 0.06, 1.7, 1.32)
    } else if (s.kind === 'ballpit') {
      const R = 1.3
      addBoxTo(acc, s.x, s.z - R, R * 2 + 0.14, 0.42, 0.14)
      addBoxTo(acc, s.x, s.z + R, R * 2 + 0.14, 0.42, 0.14)
      addBoxTo(acc, s.x - R, s.z, 0.14, 0.42, R * 2 - 0.14)
      addBoxTo(acc, s.x + R, s.z, 0.14, 0.42, R * 2 - 0.14)
      // the balls — static, sun-faded, waiting
      const n = 110
      const ballGeo = new THREE.SphereGeometry(0.075, 7, 5)
      const inst = new THREE.InstancedMesh(
        ballGeo,
        new THREE.MeshStandardMaterial({ roughness: 0.5 }),
        n,
      )
      const m4 = new THREE.Matrix4()
      const col = new THREE.Color()
      const bh = (i: number): number => {
        const v = Math.sin(s.x * 12.3 + s.z * 7.7 + i * 31.7) * 43758.5453
        return v - Math.floor(v)
      }
      for (let i = 0; i < n; i++) {
        m4.makeTranslation(
          s.x + (bh(i * 3) - 0.5) * (R * 2 - 0.4),
          0.07 + bh(i * 3 + 1) * 0.3,
          s.z + (bh(i * 3 + 2) - 0.5) * (R * 2 - 0.4),
        )
        inst.setMatrixAt(i, m4)
        inst.setColorAt(i, col.setHex(wingMaterials.ballColors[i % wingMaterials.ballColors.length]))
      }
      inst.instanceMatrix.needsUpdate = true
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      group.add(inst)
      extraGeos.push(ballGeo)
    } else {
      // dead slide: a tube mouth aimed at the floor, dark inside
      const tubeGeo = new THREE.CylinderGeometry(0.34, 0.34, 3.0, 10, 1, true)
      const tube = new THREE.Mesh(tubeGeo, wingMaterials.plastics[s.color])
      tube.position.set(s.x, 0.78, s.z)
      tube.rotation.set(Math.PI / 2 - 0.4, s.rot, 0, 'YXZ')
      group.add(tube)
      slideMeshes.push(tube)
      extraGeos.push(tubeGeo)
      addBoxTo(plastic[s.color], s.x + Math.sin(s.rot) * 1.1, s.z + Math.cos(s.rot) * 1.1, 0.09, 1.5, 0.09)
      addBoxTo(plastic[s.color], s.x - Math.sin(s.rot) * 0.4, s.z - Math.cos(s.rot) * 0.4, 0.09, 0.8, 0.09)
      // collider-only proxy so you can't ghost through the tube
      addBoxTo(hiddenColliders, s.x, s.z, 0.8, 1.15, 0.8)
    }
  }

  // balloon clusters: tied to nothing in particular, still inflated. still.
  if (data.zone === 'playground') {
    const bh = (i: number): number => {
      const v = Math.sin(data.cx * 91.7 + data.cz * 41.3 + i * 53.9) * 43758.5453
      return v - Math.floor(v)
    }
    const clusters = bh(0) < 0.75 ? 1 + Math.floor(bh(1) * 2) : 0
    if (clusters > 0) {
      const count = clusters * 3
      const bGeo = new THREE.SphereGeometry(0.16, 10, 8)
      const balloons = new THREE.InstancedMesh(bGeo, wingMaterials.balloon, count)
      const m4 = new THREE.Matrix4()
      let k = 0
      for (let cI = 0; cI < clusters; cI++) {
        const bx = x0 + 3 + bh(cI * 7 + 2) * (CHUNK_SIZE - 6)
        const bz = z0 + 3 + bh(cI * 7 + 3) * (CHUNK_SIZE - 6)
        for (let b = 0; b < 3; b++) {
          m4.makeTranslation(
            bx + (bh(k * 3 + 4) - 0.5) * 0.4,
            1.9 + bh(k * 3 + 5) * 0.35,
            bz + (bh(k * 3 + 6) - 0.5) * 0.4,
          )
          balloons.setMatrixAt(k++, m4)
        }
      }
      balloons.instanceMatrix.needsUpdate = true
      group.add(balloons)
      extraGeos.push(bGeo)
    }
  }

  // ---- pool water + the navy waterline band (the only color in the room) --
  const band = new GeoAccum()
  for (const b of data.basins) {
    const waterGeo = new THREE.PlaneGeometry(b.w - 0.04, b.d - 0.04)
    const water = new THREE.Mesh(waterGeo, wingMaterials.water)
    water.rotation.x = -Math.PI / 2
    water.position.set(b.x + b.w / 2, WATER_Y, b.z + b.d / 2)
    group.add(water)
    extraGeos.push(waterGeo)
    const bandTop = -0.04
    const bandH = 0.14
    band.addFace(_o.set(b.x + 0.006, bandTop - bandH, b.z + b.d), NZ, b.d, PY, bandH, PX)
    band.addFace(_o.set(b.x + b.w - 0.006, bandTop - bandH, b.z), PZ, b.d, PY, bandH, NX)
    band.addFace(_o.set(b.x, bandTop - bandH, b.z + 0.006), PX, b.w, PY, bandH, PZ)
    band.addFace(_o.set(b.x + b.w, bandTop - bandH, b.z + b.d - 0.006), NX, b.w, PY, bandH, NZ)
  }

  // ---- office CRTs (G1): all dead. except one. ----
  for (const crt of data.crts) {
    const facingX = crt.rot === 0
    const cxr = facingX ? crt.x - 0.59 : crt.x
    const czr = facingX ? crt.z : crt.z - 0.59
    addBoxTo(laminate, cxr, czr, facingX ? 0.34 : 0.4, 0.34, facingX ? 0.4 : 0.34, 0.74)
    const screenGeo = new THREE.PlaneGeometry(0.28, 0.22)
    const screen = new THREE.Mesh(
      screenGeo,
      crt.powered ? getCrtStaticMaterial() : officeMaterials.crtDead,
    )
    if (facingX) {
      screen.position.set(cxr + 0.176, 0.91, czr)
      screen.rotation.y = Math.PI / 2
    } else {
      screen.position.set(cxr, 0.91, czr + 0.176)
    }
    group.add(screen)
    extraGeos.push(screenGeo)
    if (crt.powered) {
      // the only screen light in the game — cold, wrong, flickerless
      const glow = new THREE.PointLight(0xa8c4cf, 1.1, 4.5, 1.8)
      glow.position.set(
        facingX ? cxr + 0.5 : cxr,
        1.0,
        facingX ? czr : czr + 0.5,
      )
      group.add(glow)
    }
  }

  // ---- flooded zone (G2): the water owns the whole floor ----
  if (data.zone === 'flooded') {
    const floodGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE)
    const flood = new THREE.Mesh(floodGeo, floodWaterMaterial)
    flood.rotation.x = -Math.PI / 2
    flood.position.set(x0 + CHUNK_SIZE / 2, FLOOD_Y, z0 + CHUNK_SIZE / 2)
    group.add(flood)
    extraGeos.push(floodGeo)
  }

  // Chalk arrows on long wall faces — seeded, sparse, directionally honest
  // about nothing (DESIGN.md §11: "DON'T trust the arrows"). Not in the
  // poolrooms: nothing marks the tile. Nothing has ever marked the tile.
  let arrows = 0
  const h = (i: number): number => {
    const v = Math.sin(data.cx * 127.1 + data.cz * 311.7 + i * 74.7) * 43758.5453
    return v - Math.floor(v)
  }
  const wallDecalYaw = (f: WallFace): number =>
    f.nx === 1 ? Math.PI / 2 : f.nx === -1 ? -Math.PI / 2 : f.nz === 1 ? 0 : Math.PI
  if (data.zone !== 'pool' && data.zone !== 'playground') {
    for (let i = 0; i < wallFaces.length && arrows < 2; i++) {
      const f = wallFaces[i]
      if (f.len < 4.7 || h(i) > 0.13) continue
      arrows++
      const m = new THREE.Mesh(arrowGeo, getChalkArrowMaterial())
      m.position.set(f.x + f.nx * 0.012, 1.25 + h(i + 50) * 0.3, f.z + f.nz * 0.012)
      const dir = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(h(i + 90) * 4)]
      m.rotation.set(0, wallDecalYaw(f), dir + (h(i + 130) - 0.5) * 0.3, 'YXZ')
      group.add(m)
    }
  }

  // Wanderer scrawls (canon: markings since the late 1960s — tallies,
  // warnings, the rune). Rarer than arrows; one per ~3 chunks. The messages
  // never help. That's canon too. In the playground the handwriting is
  // crayon, and friendlier, which is worse.
  let scrawls = 0
  const scrawlPool = data.zone === 'playground' ? getPlayScrawlMaterials() : getScrawlMaterials()
  const scrawlChance = data.zone === 'playground' ? 0.3 : 0.045
  if (data.zone !== 'pool') {
    for (let i = 0; i < wallFaces.length && scrawls < 1; i++) {
      const f = wallFaces[i]
      if (f.len < 3.5 || h(i + 700) > scrawlChance) continue
      scrawls++
      const pick = Math.floor(h(i + 770) * scrawlPool.length) % scrawlPool.length
      const m = new THREE.Mesh(scrawlGeo, scrawlPool[pick])
      m.position.set(f.x + f.nx * 0.013, 1.18 + h(i + 740) * 0.45, f.z + f.nz * 0.013)
      m.rotation.set(0, wallDecalYaw(f), (h(i + 810) - 0.5) * 0.16, 'YXZ')
      group.add(m)
    }
  }

  // Playground: one crayon drawing taped at child height. Count the figures.
  if (data.zone === 'playground' && wallFaces.length > 0 && h(900) < 0.6) {
    const f = wallFaces[Math.floor(h(910) * wallFaces.length)]
    const m = new THREE.Mesh(crayonGeo, getCrayonMaterial())
    m.position.set(f.x + f.nx * 0.014, 1.0, f.z + f.nz * 0.014)
    m.rotation.set(0, wallDecalYaw(f), (h(920) - 0.5) * 0.2, 'YXZ')
    group.add(m)
  }

  // Garage: stencil LEVEL 3 on the columns (every column, every garage),
  // and faded floor arrows — some pointing into solid walls.
  if (data.zone === 'garage') {
    for (let p = 0; p < data.pillars.length; p++) {
      if (h(p + 300) > 0.6) continue
      const pil = data.pillars[p]
      const m = new THREE.Mesh(stencilGeo, getStencilMaterial())
      const side = h(p + 320) < 0.5 ? 1 : -1
      m.position.set(pil.x + side * (pil.size / 2 + 0.012), 1.45, pil.z)
      m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2
      group.add(m)
    }
    const nArrows = 2 + Math.floor(h(340) * 2)
    for (let a = 0; a < nArrows; a++) {
      const m = new THREE.Mesh(floorArrowGeo, getFloorArrowMaterial())
      m.rotation.x = -Math.PI / 2
      m.rotation.z = Math.floor(h(a + 360) * 4) * (Math.PI / 2)
      m.position.set(
        x0 + 2 + h(a + 380) * (CHUNK_SIZE - 4),
        0.006,
        z0 + 2 + h(a + 400) * (CHUNK_SIZE - 4),
      )
      group.add(m)
    }
  }

  // Per-zone surfaces: the wing IS its materials.
  const floorMat =
    data.zone === 'pool'
      ? wingMaterials.tileFloor
      : data.zone === 'playground'
        ? wingMaterials.carnival
        : data.zone === 'garage'
          ? wingMaterials.concrete
          : data.zone === 'office'
            ? officeMaterials.carpetTiles
            : data.zone === 'flooded'
              ? floodedMaterials.floor
              : worldMaterials.carpet
  const ceilMat =
    data.zone === 'pool'
      ? wingMaterials.tile
      : data.zone === 'garage'
        ? wingMaterials.concretePlain
        : worldMaterials.ceiling
  const wallMat =
    data.zone === 'pool'
      ? wingMaterials.tile
      : data.zone === 'playground'
        ? wingMaterials.playWall
        : data.zone === 'garage'
          ? wingMaterials.concretePlain
          : data.zone === 'flooded'
            ? floodedMaterials.wall
            : data.zone === 'office'
              ? officeMaterials.drywall
              : worldMaterials.wall

  const geos: THREE.BufferGeometry[] = []
  const buckets: Array<[GeoAccum, THREE.Material]> = [
    [floor, floorMat],
    [damp, worldMaterials.carpetDamp],
    [ceil, ceilMat],
    [wall, wallMat],
    [trim, worldMaterials.trim],
    [furn, worldMaterials.furniture],
    [partition, officeMaterials.partition],
    [laminate, officeMaterials.laminate],
    [basin, wingMaterials.tileFloor],
    [band, wingMaterials.navyBand],
    [plastic[0], wingMaterials.plastics[0]],
    [plastic[1], wingMaterials.plastics[1]],
    [plastic[2], wingMaterials.plastics[2]],
    [plastic[3], wingMaterials.plastics[3]],
  ]
  for (const [accum, mat] of buckets) {
    if (accum === trim && !useTrim) continue
    const geo = accum.build()
    if (!geo) continue
    geos.push(geo)
    group.add(new THREE.Mesh(geo, mat))
  }

  // Ceiling light fixtures (instanced, emissive; lighting pool attaches later)
  if (data.fixtures.length > 0) {
    const fixtureMat =
      data.zone === 'garage' ? wingMaterials.fixtureSodium : worldMaterials.fixture
    const inst = new THREE.InstancedMesh(fixtureGeo, fixtureMat, data.fixtures.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    data.fixtures.forEach((f, k) => {
      q.setFromAxisAngle(up, f.rotated ? Math.PI / 2 : 0)
      m.compose(new THREE.Vector3(f.x, f.y, f.z), q, new THREE.Vector3(1, 1, 1))
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
      m.compose(new THREE.Vector3(f.x, f.y - 0.07, f.z), q, new THREE.Vector3(1, 1, 1))
      haloInst.setMatrixAt(k, m)
      m.compose(new THREE.Vector3(f.x, 0.012, f.z), q, new THREE.Vector3(1, 1, 1))
      poolInst.setMatrixAt(k, m)
    })
    haloInst.instanceMatrix.needsUpdate = true
    poolInst.instanceMatrix.needsUpdate = true
    group.add(haloInst, poolInst)
  }

  // Collider: walls + pillars + floor + ceiling + basins + structures merged
  // into one BVH mesh. Water and balls are not in it — water is not floor.
  const colliderParts = [floor, ceil, wall, furn, partition, laminate, basin, hiddenColliders, ...plastic]
  const colliderAccum = new GeoAccum()
  let offset = 0
  for (const part of colliderParts) {
    colliderAccum.pos = colliderAccum.pos.concat(part.pos)
    colliderAccum.norm = colliderAccum.norm.concat(part.norm)
    colliderAccum.uv = colliderAccum.uv.concat(part.uv)
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
    crts: data.crts,
    dispose: () => {
      for (const geo of geos) geo.dispose()
      for (const geo of extraGeos) geo.dispose()
      colliderGeo.disposeBoundsTree()
      colliderGeo.dispose()
    },
  }
}
