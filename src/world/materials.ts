import * as THREE from 'three'

/**
 * World materials (DESIGN.md §10). UVs are world-meters, so each texture
 * sets repeat = 1/periodMeters. The sourced sets get corrected at load:
 * Carpet013 ships red → hue-shifted to canon olive-brown; the wallpaper
 * albedo is SYNTHESIZED (mono-yellow, thin vertical stripe pairs, arrow
 * motif, stains — wiki canon) over the plaster set's normal/roughness.
 */

export const worldMaterials = {
  carpet: new THREE.MeshStandardMaterial({ color: 0x8a7a45, roughness: 1.0 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xb9a55c, roughness: 0.92 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xd8d0b2, roughness: 0.9 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x4a3c28, roughness: 0.7 }),
  fixture: new THREE.MeshStandardMaterial({
    color: 0xd8d4c8,
    emissive: 0xfff6dc,
    emissiveIntensity: 2.2,
  }),
  furniture: new THREE.MeshStandardMaterial({ color: 0x4f4233, roughness: 0.8 }),
  /** "the stink of old moist carpet" — darker, wet-sheened patches. */
  carpetDamp: new THREE.MeshStandardMaterial({ color: 0x8a857a, roughness: 0.5 }),
}

/**
 * Chalk arrows (DESIGN.md §11): D. marked the walls. Some arrows are his.
 * Some are older. The directions are seeded noise — the lying is emergent,
 * and note 1 warned you.
 */
let chalkMat: THREE.MeshStandardMaterial | null = null
export function getChalkArrowMaterial(): THREE.MeshStandardMaterial {
  if (chalkMat) return chalkMat
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.strokeStyle = 'rgb(226, 219, 192)'
  ctx.lineCap = 'round'
  let s = 777
  const rnd = (): number => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  // three jittered passes read as chalk over wallpaper texture
  for (let pass = 0; pass < 3; pass++) {
    ctx.lineWidth = 6 + rnd() * 5
    ctx.globalAlpha = 0.3 + rnd() * 0.3
    const j = (): number => (rnd() - 0.5) * 9
    ctx.beginPath()
    ctx.moveTo(42 + j(), 128 + j())
    ctx.lineTo(198 + j(), 128 + j())
    ctx.moveTo(148 + j(), 82 + j())
    ctx.lineTo(204 + j(), 128 + j())
    ctx.lineTo(148 + j(), 174 + j())
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  chalkMat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: 1,
  })
  return chalkMat
}

const CARPET_PERIOD = 1.2
const WALL_PERIOD = 2.4
const CEILING_PERIOD = 3.6

function setupTiling(tex: THREE.Texture, period: number, srgb = false): THREE.Texture {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.setScalar(1 / period)
  tex.anisotropy = 8
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Hue-shift the red Carpet013 albedo into stained olive-brown. */
function recolorCarpet(img: HTMLImageElement): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const ctx = c.getContext('2d')!
  ctx.filter = 'hue-rotate(52deg) saturate(0.5) brightness(0.96)'
  ctx.drawImage(img, 0, 0)
  // mottled damp staining, drawn wrap-safe
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'multiply'
  stainPass(ctx, c.width, 9, 'rgba(96, 84, 44, 0.30)')
  stainPass(ctx, c.width, 5, 'rgba(60, 52, 30, 0.22)')
  return new THREE.CanvasTexture(c)
}

/** Canon Level 0 wallpaper, synthesized: greyish-yellow, stripe pairs, arrows, age. */
function makeWallpaper(): THREE.CanvasTexture {
  const S = 1024 // 2.4 m world period
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!

  ctx.fillStyle = '#b3a361'
  ctx.fillRect(0, 0, S, S)

  // paper grain: faint vertical streaks
  for (let i = 0; i < 360; i++) {
    const x = (i * 73.7) % S
    const w = 1 + ((i * 31) % 3)
    const a = 0.02 + ((i * 17) % 10) * 0.004
    ctx.fillStyle = (i & 1) === 0 ? `rgba(255, 244, 190, ${a})` : `rgba(70, 60, 28, ${a})`
    ctx.fillRect(x, 0, w, S)
  }

  // stripe pairs every 1.2 m (512 px), thin darker lines with arrow motif between
  ctx.fillStyle = 'rgba(122, 106, 52, 0.55)'
  for (const gx of [128, 640]) {
    ctx.fillRect(gx - 14, 0, 5, S)
    ctx.fillRect(gx + 9, 0, 5, S)
    // small arrow/chevron glyphs running down the gap
    ctx.save()
    ctx.strokeStyle = 'rgba(122, 106, 52, 0.5)'
    ctx.lineWidth = 2.5
    for (let y = 24; y < S; y += 64) {
      ctx.beginPath()
      ctx.moveTo(gx - 5, y)
      ctx.lineTo(gx, y + 9)
      ctx.lineTo(gx + 5, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  // age: blotchy stains (multiply, wrap-safe) — present but not black-mold
  ctx.globalCompositeOperation = 'multiply'
  stainPass(ctx, S, 7, 'rgba(150, 134, 76, 0.22)')
  stainPass(ctx, S, 4, 'rgba(110, 96, 52, 0.16)')
  return new THREE.CanvasTexture(c)
}

/** Random soft blobs drawn at ±size offsets so the texture stays tileable. */
function stainPass(ctx: CanvasRenderingContext2D, size: number, count: number, fill: string): void {
  let s = 12345
  const rnd = (): number => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  for (let i = 0; i < count; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const r = size * (0.08 + rnd() * 0.2)
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, r * 0.2, x + dx, y + dy, r)
        g.addColorStop(0, fill)
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

export async function initWorldMaterials(): Promise<void> {
  const loader = new THREE.TextureLoader()
  const base = import.meta.env.BASE_URL
  const load = (p: string): Promise<THREE.Texture> => loader.loadAsync(`${base}textures/${p}`)

  const [carpetC, carpetN, carpetR, carpetAO, wallN, wallR, ceilC, ceilN, ceilR, ceilAO, dampC, dampN] =
    await Promise.all([
      load('carpet/color.jpg'),
      load('carpet/normal.jpg'),
      load('carpet/rough.jpg'),
      load('carpet/ao.jpg'),
      load('wall/normal.jpg'),
      load('wall/rough.jpg'),
      load('ceiling/color.jpg'),
      load('ceiling/normal.jpg'),
      load('ceiling/rough.jpg'),
      load('ceiling/ao.jpg'),
      load('carpet_damp/color.jpg'),
      load('carpet_damp/normal.jpg'),
    ])

  const m = worldMaterials

  m.carpet.map = setupTiling(recolorCarpet(carpetC.image as HTMLImageElement), CARPET_PERIOD, true)
  m.carpet.normalMap = setupTiling(carpetN, CARPET_PERIOD)
  m.carpet.normalScale.setScalar(0.9)
  m.carpet.roughnessMap = setupTiling(carpetR, CARPET_PERIOD)
  m.carpet.aoMap = setupTiling(carpetAO, CARPET_PERIOD)
  m.carpet.color.set(0xffffff)

  m.wall.map = setupTiling(makeWallpaper(), WALL_PERIOD, true)
  // plaster relief kept very low so it reads as old paper, not ruin
  m.wall.normalMap = setupTiling(wallN, WALL_PERIOD)
  m.wall.normalScale.setScalar(0.22)
  m.wall.roughnessMap = setupTiling(wallR, WALL_PERIOD)
  m.wall.roughness = 1.0
  m.wall.color.set(0xffffff)

  m.ceiling.map = setupTiling(ceilC, CEILING_PERIOD, true)
  m.ceiling.normalMap = setupTiling(ceilN, CEILING_PERIOD)
  m.ceiling.normalScale.setScalar(0.7)
  m.ceiling.roughnessMap = setupTiling(ceilR, CEILING_PERIOD)
  m.ceiling.aoMap = setupTiling(ceilAO, CEILING_PERIOD)
  m.ceiling.color.set(0xcfc4a2) // grime tint over the clean white tiles

  m.carpetDamp.map = setupTiling(dampC, 1.6, true)
  m.carpetDamp.normalMap = setupTiling(dampN, 1.6)
  m.carpetDamp.normalScale.setScalar(0.8)

  for (const mat of [m.carpet, m.wall, m.ceiling, m.carpetDamp]) mat.needsUpdate = true
}
