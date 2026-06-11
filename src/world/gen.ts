import { Rng } from '../core/rng'

/**
 * Level 0 layout generation (DESIGN.md §6).
 *
 * The world is an infinite grid of 8×8-cell chunks (cell = 2.4 m). Walls sit
 * on cell edges. Chunk-boundary walls are a pure hash of WORLD coordinates so
 * adjacent chunks always agree, with guaranteed openings per side. Interiors
 * are carved by zone recipes, then a connectivity pass removes walls until no
 * cell is sealed. Everything derives from (cx, cz, salt) — bumping a chunk's
 * salt is how the director silently re-stitches space behind the player.
 */

export const CELL = 2.4
export const CHUNK_CELLS = 8
export const CHUNK_SIZE = CELL * CHUNK_CELLS
export const CEIL_H = 2.8
export const WALL_T = 0.2

const WORLD_SEED = 0x20020612 // the tape is dated June 12 2002

export type ZoneKind =
  | 'pillarHall'
  | 'corridors'
  | 'rooms'
  | 'openDamp'
  // TAPE 2 expansion (G1/G2) — Level 0 interior variants:
  | 'office' // a 2002 office island: cubicles, dead CRTs, one that isn't
  | 'flooded' // the damp won. ankle-deep throughout. the water hears you.
  // anomalous wings — the maze bleeds into other places (liminal canon):
  | 'pool' // the Poolrooms: tile, still water, the smell of nothing
  | 'playground' // Level Fun =) — a playplace with no children in it
  | 'garage' // the parking garage at 3 AM, forever

/** True for the rare bleed-through regions. */
export function isWing(zone: ZoneKind): boolean {
  return zone === 'pool' || zone === 'playground' || zone === 'garage'
}

export interface Fixture {
  x: number // world meters
  z: number
  /** Mount height (zone ceilings differ — the garage presses down on you). */
  y: number
  rotated: boolean
  seed: number // drives flicker personality + hum detune later
}

/** Garage clearance: lower than the maze. The camera feels it immediately. */
export const GARAGE_CEIL = 2.35

export function ceilHeightFor(zone: ZoneKind): number {
  return zone === 'garage' ? GARAGE_CEIL : CEIL_H
}

/** Public deterministic zone query (mesh uses it for neighbor seams). */
export function zoneOf(cx: number, cz: number): ZoneKind {
  return pickZone(cx, cz)
}

export interface Pillar {
  x: number
  z: number
  size: number
}

export type FurnitureKind = 'desk' | 'boxes' | 'cabinet' | 'cubicle'

/** Office CRT monitors. At most one per chunk is still powered. */
export interface Crt {
  x: number
  z: number
  rot: number // y radians
  powered: boolean
}

/** Flooded zones: standing water across the whole chunk at this height. */
export const FLOOD_Y = 0.11

export interface Furniture {
  kind: FurnitureKind
  x: number
  z: number
  /** 0 or 1: long axis along x or z. */
  rot: 0 | 1
}

/** Sunken pool basin, world-space rect. Water sits at WATER_Y. */
export interface Basin {
  x: number // min corner
  z: number
  w: number
  d: number
}

export type StructureKind = 'tower' | 'ballpit' | 'slide'

export interface PlayStructure {
  kind: StructureKind
  x: number
  z: number
  rot: number // radians, y-axis
  color: number // index into the plastic palette
}

export const BASIN_DEPTH = 0.7
export const WATER_Y = -0.26

export interface ChunkData {
  cx: number
  cz: number
  zone: ZoneKind
  /** vWalls[li][j] — wall on vertical line li (0..7, line 0 = west boundary), cell row j. */
  vWalls: boolean[][]
  /** hWalls[i][lj] — wall on horizontal line lj (0..7, line 0 = south boundary), cell col i. */
  hWalls: boolean[][]
  pillars: Pillar[]
  fixtures: Fixture[]
  furniture: Furniture[]
  basins: Basin[]
  structures: PlayStructure[]
  crts: Crt[]
}

function mix(a: number, b: number, c: number): number {
  let h = WORLD_SEED ^ Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 1597334677)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * Boundary wall on a chunk-edge line, pure function of world coords.
 * `line` is the world line index, `cell` the world cell index along it.
 * One guaranteed opening per 8-cell segment plus ~45% random openings.
 */
function boundaryWall(line: number, cell: number, vertical: boolean): boolean {
  const dirSalt = vertical ? 101 : 211
  const seg = Math.floor(cell / CHUNK_CELLS)
  const guaranteed = Math.floor(mix(line, seg, dirSalt) * CHUNK_CELLS)
  const local = cell - seg * CHUNK_CELLS
  if (local === guaranteed) return false
  return mix(line, cell, dirSalt + 1) < 0.55
}

function pickZone(cx: number, cz: number): ZoneKind {
  if (cx === 0 && cz === 0) return 'pillarHall' // spawn chunk is an open hall
  // Anomalous wings: coherent 2x2-chunk regions (~38 m), only far from spawn.
  // Rare on purpose — finding one should feel like the maze made a mistake.
  if (Math.max(Math.abs(cx), Math.abs(cz)) >= 3) {
    const r2 = mix(Math.floor(cx / 2), Math.floor(cz / 2), 8888)
    if (r2 < 0.025) return 'pool'
    if (r2 < 0.047) return 'playground'
    if (r2 < 0.068) return 'garage'
  }
  // Level-0 interior variants (TAPE 2): same 2x2 coherence, slightly less
  // shy of spawn — they're still Level 0, just Level 0 having a bad day.
  if (Math.max(Math.abs(cx), Math.abs(cz)) >= 2) {
    const r3 = mix(Math.floor(cx / 2), Math.floor(cz / 2), 5151)
    if (r3 < 0.03) return 'office'
    if (r3 < 0.075) return 'flooded'
  }
  const r = mix(cx, cz, 977)
  if (r < 0.34) return 'corridors'
  if (r < 0.64) return 'pillarHall'
  if (r < 0.88) return 'rooms'
  return 'openDamp'
}

const FIXTURE_DENSITY: Record<ZoneKind, number> = {
  pillarHall: 0.2,
  corridors: 0.24,
  rooms: 0.22,
  openDamp: 0.13,
  office: 0.24, // offices are lit. that's the problem with them
  flooded: 0.08, // half the bank drowned. the rest reflect in the water
  pool: 0.1, // dimmer. the water makes up for it by being wrong
  playground: 0.07, // dimmest. the colors shouldn't be in shadow, but they are
  garage: 0.13,
}

export function generateChunk(cx: number, cz: number, salt = 0): ChunkData {
  const zone = pickZone(cx, cz)
  const rng = new Rng(Math.floor(mix(cx, cz, 7001 + salt * 131) * 0x7fffffff))

  // Interior walls: lines 1..7 are recipe territory; line 0 is the shared boundary.
  const vWalls: boolean[][] = Array.from({ length: CHUNK_CELLS }, () => new Array(CHUNK_CELLS).fill(false))
  const hWalls: boolean[][] = Array.from({ length: CHUNK_CELLS }, () => new Array(CHUNK_CELLS).fill(false))
  const pillars: Pillar[] = []
  const furniture: Furniture[] = []

  for (let j = 0; j < CHUNK_CELLS; j++) vWalls[0][j] = boundaryWall(cx * CHUNK_CELLS, cz * CHUNK_CELLS + j, true)
  for (let i = 0; i < CHUNK_CELLS; i++) hWalls[i][0] = boundaryWall(cz * CHUNK_CELLS, cx * CHUNK_CELLS + i, false)

  const crts: Crt[] = []

  switch (zone) {
    case 'office': {
      // sparse real walls; the cubicles are the architecture (G1: dense
      // occlusion — ideal Reactive-Director terrain)
      for (let li = 1; li < CHUNK_CELLS; li++)
        for (let j = 0; j < CHUNK_CELLS; j++) vWalls[li][j] = rng.chance(0.14)
      for (let i = 0; i < CHUNK_CELLS; i++)
        for (let lj = 1; lj < CHUNK_CELLS; lj++) hWalls[i][lj] = rng.chance(0.14)
      // a cubicle island: pods on a loose grid, one CRT each, all dead.
      // except one. somewhere in the office, one of them is still on.
      const poweredPod = rng.int(0, 5)
      let pod = 0
      for (let i = 1; i < CHUNK_CELLS - 1; i += 2) {
        for (let j = 1; j < CHUNK_CELLS - 1; j += 2) {
          if (!rng.chance(0.4)) continue
          const px = (cx * CHUNK_CELLS + i + 0.5) * CELL + rng.range(-0.3, 0.3)
          const pz = (cz * CHUNK_CELLS + j + 0.5) * CELL + rng.range(-0.3, 0.3)
          // skip pods that would intersect interior walls — pods sit mid-cell,
          // walls on edges; the 1.9 m pod fits a 2.4 m cell, so we're clear.
          // (the U opens in a seeded direction)
          const rot: 0 | 1 = rng.chance(0.5) ? 0 : 1
          // cubicle pod marker; mesh expands it into partitions + desk
          // (reuses the furniture channel to stay on the existing systems)
          furniture.push({ kind: 'cubicle', x: px, z: pz, rot })
          if (rng.chance(0.85)) {
            crts.push({
              x: px,
              z: pz,
              rot: rot === 0 ? 0 : Math.PI / 2,
              powered: pod === poweredPod,
            })
          }
          pod++
        }
      }
      break
    }

    case 'flooded':
      // open and drowned: a few pillars, their reflections, and the rest
      for (let i = 0; i < CHUNK_CELLS; i++)
        for (let j = 0; j < CHUNK_CELLS; j++)
          if (rng.chance(0.05))
            pillars.push({
              x: (cx * CHUNK_CELLS + i + 0.5) * CELL,
              z: (cz * CHUNK_CELLS + j + 0.5) * CELL,
              size: 0.6,
            })
      break

    case 'corridors':
      for (let li = 1; li < CHUNK_CELLS; li++)
        for (let j = 0; j < CHUNK_CELLS; j++) vWalls[li][j] = rng.chance(0.55)
      for (let i = 0; i < CHUNK_CELLS; i++)
        for (let lj = 1; lj < CHUNK_CELLS; lj++) hWalls[i][lj] = rng.chance(0.55)
      break

    case 'rooms':
      bspSplit(rng, vWalls, hWalls, 0, 0, CHUNK_CELLS, CHUNK_CELLS, 2)
      break

    case 'pillarHall': {
      const spawnChunk = cx === 0 && cz === 0
      for (let i = 0; i < CHUNK_CELLS; i++) {
        for (let j = 0; j < CHUNK_CELLS; j++) {
          if (spawnChunk && i >= 2 && i <= 5 && j >= 2 && j <= 5) continue
          if (rng.chance(0.2)) {
            pillars.push({
              x: (cx * CHUNK_CELLS + i + 0.5) * CELL + rng.range(-0.5, 0.5),
              z: (cz * CHUNK_CELLS + j + 0.5) * CELL + rng.range(-0.5, 0.5),
              size: rng.range(0.5, 0.7),
            })
          }
        }
      }
      break
    }

    case 'openDamp':
      for (let i = 0; i < CHUNK_CELLS; i++)
        for (let j = 0; j < CHUNK_CELLS; j++)
          if (rng.chance(0.04))
            pillars.push({
              x: (cx * CHUNK_CELLS + i + 0.5) * CELL,
              z: (cz * CHUNK_CELLS + j + 0.5) * CELL,
              size: 0.6,
            })
      break

    case 'pool':
      // Open tiled hall; fat tiled columns; the basin comes below.
      for (let i = 0; i < CHUNK_CELLS; i++)
        for (let j = 0; j < CHUNK_CELLS; j++)
          if (rng.chance(0.05))
            pillars.push({
              x: (cx * CHUNK_CELLS + i + 0.5) * CELL,
              z: (cz * CHUNK_CELLS + j + 0.5) * CELL,
              size: rng.range(0.7, 0.95),
            })
      break

    case 'playground':
      // Wide open. The structures are the architecture.
      for (let i = 0; i < CHUNK_CELLS; i++)
        for (let j = 0; j < CHUNK_CELLS; j++)
          if (rng.chance(0.02))
            pillars.push({
              x: (cx * CHUNK_CELLS + i + 0.5) * CELL,
              z: (cz * CHUNK_CELLS + j + 0.5) * CELL,
              size: 0.5,
            })
      break

    case 'garage': {
      // The grid is the point: columns on a strict 3-cell module, forever.
      for (let i = 1; i < CHUNK_CELLS; i += 3) {
        for (let j = 1; j < CHUNK_CELLS; j += 3) {
          pillars.push({
            x: (cx * CHUNK_CELLS + i) * CELL,
            z: (cz * CHUNK_CELLS + j) * CELL,
            size: 0.55,
          })
        }
      }
      break
    }
  }

  ensureConnectivity(cx, cz, vWalls, hWalls)

  // Pool basins: one sunken pool per chunk, organic-ish inset, never touching
  // the chunk border (the floor strips around it must exist).
  const basins: Basin[] = []
  if (zone === 'pool') {
    const w = rng.range(7, 11)
    const d = rng.range(6, 10)
    const x0w = cx * CHUNK_SIZE + rng.range(2.6, CHUNK_SIZE - w - 2.6)
    const z0w = cz * CHUNK_SIZE + rng.range(2.6, CHUNK_SIZE - d - 2.6)
    basins.push({ x: x0w, z: z0w, w, d })
  }

  // Play structures: towers to mantle onto, a ball pit, a dead slide.
  const structures: PlayStructure[] = []
  if (zone === 'playground') {
    const kinds: StructureKind[] = ['tower', 'ballpit', 'slide']
    const n = rng.int(2, 4)
    for (let k = 0; k < n; k++) {
      structures.push({
        kind: kinds[k % kinds.length],
        x: cx * CHUNK_SIZE + rng.range(3.5, CHUNK_SIZE - 3.5),
        z: cz * CHUNK_SIZE + rng.range(3.5, CHUNK_SIZE - 3.5),
        rot: rng.range(0, Math.PI * 2),
        color: rng.int(0, 3),
      })
    }
  }

  // Fixtures: non-gridded (canon) — per-cell chance with jitter. Garage
  // fixtures snap to the column module instead (the rhythm is the level).
  const fixtures: Fixture[] = []
  const density = FIXTURE_DENSITY[zone]
  const fixtureY = ceilHeightFor(zone) - 0.03
  for (let i = 0; i < CHUNK_CELLS; i++) {
    for (let j = 0; j < CHUNK_CELLS; j++) {
      const r = mix(cx * CHUNK_CELLS + i, cz * CHUNK_CELLS + j, 5501 + salt * 17)
      if (r < density) {
        const grid = zone === 'garage'
        fixtures.push({
          x: (cx * CHUNK_CELLS + i + 0.5) * CELL + (grid ? 0 : (mix(i, j, 61) - 0.5) * 0.9),
          z: (cz * CHUNK_CELLS + j + 0.5) * CELL + (grid ? 0 : (mix(i, j, 62) - 0.5) * 0.9),
          y: fixtureY,
          rotated: grid ? true : mix(i, j, 63) < 0.5,
          seed: r / density,
        })
      }
    }
  }

  // Abandoned furniture: mantle targets and kenopsia anchors. Sparse —
  // a lone desk in an empty hall is worth ten cluttered ones.
  const FURN_CHANCE: Record<ZoneKind, number> = {
    rooms: 0.05,
    openDamp: 0.025,
    pillarHall: 0.018,
    corridors: 0,
    office: 0, // the office recipe places its own
    flooded: 0.015, // something heavy was abandoned mid-drag
    pool: 0,
    playground: 0,
    garage: 0,
  }
  const furnChance = FURN_CHANCE[zone]
  if (furnChance > 0) {
    for (let i = 0; i < CHUNK_CELLS; i++) {
      for (let j = 0; j < CHUNK_CELLS; j++) {
        if (cx === 0 && cz === 0 && i >= 2 && i <= 5 && j >= 2 && j <= 5) continue
        const r = mix(cx * CHUNK_CELLS + i, cz * CHUNK_CELLS + j, 8101 + salt * 23)
        if (r < furnChance) {
          const kinds: FurnitureKind[] =
            zone === 'rooms' ? ['desk', 'boxes', 'cabinet'] : ['desk', 'boxes']
          furniture.push({
            kind: kinds[Math.floor((r / furnChance) * kinds.length)],
            x: (cx * CHUNK_CELLS + i + 0.5) * CELL + (mix(i, j, 91) - 0.5) * 0.7,
            z: (cz * CHUNK_CELLS + j + 0.5) * CELL + (mix(i, j, 92) - 0.5) * 0.7,
            rot: mix(i, j, 93) < 0.5 ? 0 : 1,
          })
        }
      }
    }
  }

  return { cx, cz, zone, vWalls, hWalls, pillars, fixtures, furniture, basins, structures, crts }
}

/** Recursive BSP room splitting; every split wall gets 1–2 door gaps. */
function bspSplit(
  rng: Rng,
  vWalls: boolean[][],
  hWalls: boolean[][],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  depth: number,
): void {
  const w = x1 - x0
  const d = z1 - z0
  if (depth <= 0 || (w < 4 && d < 4)) return

  if (w >= d && w >= 4) {
    const line = x0 + rng.int(2, w - 2)
    if (line >= 1 && line <= CHUNK_CELLS - 1) {
      const gaps = new Set<number>()
      gaps.add(rng.int(z0, z1 - 1))
      if (rng.chance(0.5)) gaps.add(rng.int(z0, z1 - 1))
      for (let j = z0; j < z1; j++) if (!gaps.has(j)) vWalls[line][j] = true
    }
    bspSplit(rng, vWalls, hWalls, x0, z0, line, z1, depth - 1)
    bspSplit(rng, vWalls, hWalls, line, z0, x1, z1, depth - 1)
  } else if (d >= 4) {
    const line = z0 + rng.int(2, d - 2)
    if (line >= 1 && line <= CHUNK_CELLS - 1) {
      const gaps = new Set<number>()
      gaps.add(rng.int(x0, x1 - 1))
      if (rng.chance(0.5)) gaps.add(rng.int(x0, x1 - 1))
      for (let i = x0; i < x1; i++) if (!gaps.has(i)) hWalls[i][line] = true
    }
    bspSplit(rng, vWalls, hWalls, x0, z0, x1, line, depth - 1)
    bspSplit(rng, vWalls, hWalls, x0, line, x1, z1, depth - 1)
  }
}

/**
 * No sealed pockets, ever: flood-fill from every cell that has a boundary
 * opening (the neighbor side of those openings is the rest of the world),
 * then knock down interior walls between unreached and reached cells until
 * the chunk is one region. Deterministic iteration = deterministic layout.
 */
function ensureConnectivity(cx: number, cz: number, vWalls: boolean[][], hWalls: boolean[][]): void {
  const N = CHUNK_CELLS
  const reached = new Uint8Array(N * N)
  const queue: number[] = []

  const eastLine = (cx + 1) * CHUNK_CELLS
  const northLine = (cz + 1) * CHUNK_CELLS
  for (let j = 0; j < N; j++) {
    if (!vWalls[0][j]) queue.push(0 * N + j) // west boundary open
    if (!boundaryWall(eastLine, cz * CHUNK_CELLS + j, true)) queue.push((N - 1) * N + j)
  }
  for (let i = 0; i < N; i++) {
    if (!hWalls[i][0]) queue.push(i * N + 0) // south boundary open
    if (!boundaryWall(northLine, cx * CHUNK_CELLS + i, false)) queue.push(i * N + (N - 1))
  }
  // Degenerate (all walls): force one opening's cell as seed anyway.
  if (queue.length === 0) queue.push(0)

  const flood = (): void => {
    while (queue.length > 0) {
      const c = queue.pop()!
      if (reached[c]) continue
      reached[c] = 1
      const i = Math.floor(c / N)
      const j = c % N
      if (i > 0 && !vWalls[i][j] && !reached[(i - 1) * N + j]) queue.push((i - 1) * N + j)
      if (i < N - 1 && !vWalls[i + 1][j] && !reached[(i + 1) * N + j]) queue.push((i + 1) * N + j)
      if (j > 0 && !hWalls[i][j] && !reached[i * N + (j - 1)]) queue.push(i * N + (j - 1))
      if (j < N - 1 && !hWalls[i][j + 1] && !reached[i * N + (j + 1)]) queue.push(i * N + (j + 1))
    }
  }

  flood()
  let guard = N * N
  while (guard-- > 0) {
    let carved = false
    for (let i = 0; i < N && !carved; i++) {
      for (let j = 0; j < N && !carved; j++) {
        if (reached[i * N + j]) continue
        // Unreached cell touching a reached one: carve that wall, re-flood.
        if (i > 0 && reached[(i - 1) * N + j] && vWalls[i][j]) {
          vWalls[i][j] = false
        } else if (i < N - 1 && reached[(i + 1) * N + j] && vWalls[i + 1][j]) {
          vWalls[i + 1][j] = false
        } else if (j > 0 && reached[i * N + (j - 1)] && hWalls[i][j]) {
          hWalls[i][j] = false
        } else if (j < N - 1 && reached[i * N + (j + 1)] && hWalls[i][j + 1]) {
          hWalls[i][j + 1] = false
        } else {
          continue
        }
        queue.push(i * N + j)
        carved = true
      }
    }
    if (!carved) break
    flood()
  }
}
