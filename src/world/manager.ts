import * as THREE from 'three'
import { CHUNK_SIZE, generateChunk } from './gen'
import { buildChunkMeshes, type BuiltChunk } from './mesh'

const LOAD_RADIUS = 2 // 5×5 chunks resident (~48 m); fog hides the edge
const UNLOAD_RADIUS = 3 // hysteresis so border-walking doesn't thrash

/**
 * Streams chunks around the player. Per-chunk salts persist across unload,
 * so space is stable by default — until the director bumps a salt and the
 * maze quietly disagrees with the player's memory (DESIGN.md §6).
 */
export class ChunkManager {
  readonly group = new THREE.Group()

  private chunks = new Map<string, BuiltChunk>()
  private salts = new Map<string, number>()

  constructor(scene: THREE.Scene) {
    scene.add(this.group)
  }

  private static key(cx: number, cz: number): string {
    return `${cx},${cz}`
  }

  chunkOf(x: number, z: number): [number, number] {
    return [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)]
  }

  /** Build the full resident set synchronously (startup / teleports). */
  ensureInitial(x: number, z: number): void {
    const [pcx, pcz] = this.chunkOf(x, z)
    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++)
      for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) this.build(pcx + dx, pcz + dz)
  }

  /** Call once per frame; builds at most one missing chunk to avoid hitches. */
  update(x: number, z: number): void {
    const [pcx, pcz] = this.chunkOf(x, z)

    for (const [k, c] of this.chunks) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > UNLOAD_RADIUS) {
        this.group.remove(c.group)
        c.dispose()
        this.chunks.delete(k)
      }
    }

    let best: { cx: number; cz: number; d: number } | null = null
    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
      for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
        const cx = pcx + dx
        const cz = pcz + dz
        if (this.chunks.has(ChunkManager.key(cx, cz))) continue
        const d = dx * dx + dz * dz
        if (!best || d < best.d) best = { cx, cz, d }
      }
    }
    if (best) this.build(best.cx, best.cz)
  }

  private build(cx: number, cz: number): void {
    const k = ChunkManager.key(cx, cz)
    if (this.chunks.has(k)) return
    const data = generateChunk(cx, cz, this.salts.get(k) ?? 0)
    const built = buildChunkMeshes(data)
    this.group.add(built.group)
    this.chunks.set(k, built)
  }

  /** Colliders for the 3×3 around a position — all the capsule can touch. */
  collidersNear(x: number, z: number): THREE.Mesh[] {
    const [pcx, pcz] = this.chunkOf(x, z)
    const out: THREE.Mesh[] = []
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const c = this.chunks.get(ChunkManager.key(pcx + dx, pcz + dz))
        if (c) out.push(c.collider)
      }
    }
    return out
  }

  /** Director hook: next build of this chunk generates a different layout. */
  bumpSalt(cx: number, cz: number): void {
    const k = ChunkManager.key(cx, cz)
    this.salts.set(k, (this.salts.get(k) ?? 0) + 1)
  }

  get chunkCount(): number {
    return this.chunks.size
  }

  /** Resident chunks (fixture registry for lighting/audio pools). */
  all(): IterableIterator<BuiltChunk> {
    return this.chunks.values()
  }
}
