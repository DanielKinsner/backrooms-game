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

/**
 * Pareidolia stain (DESIGN.md §8, research: Mandela-mechanism without the
 * subject): two darker blobs at roughly interocular ratio and a mouth-length
 * smear below — the viewer's own face detector does ALL the work. Deniable
 * by design; reads as water damage when fixated.
 */
let pareidoliaMat: THREE.MeshStandardMaterial | null = null
export function getPareidoliaMaterial(): THREE.MeshStandardMaterial {
  if (pareidoliaMat) return pareidoliaMat
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const blob = (x: number, y: number, r: number, a: number): void => {
    const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r)
    g.addColorStop(0, `rgba(58, 48, 26, ${a})`)
    g.addColorStop(1, 'rgba(58, 48, 26, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // the stain itself (cover) — broad, watery
  blob(128, 124, 118, 0.55)
  blob(150, 170, 80, 0.35)
  // the arrangement (payload): eyes at ~0.46 head-width separation, a mouth
  blob(98, 102, 17, 0.75)
  blob(160, 99, 15, 0.7)
  ctx.save()
  ctx.translate(126, 168)
  ctx.scale(1.9, 0.55)
  blob(0, 0, 16, 0.6)
  ctx.restore()
  const tex = new THREE.CanvasTexture(c)
  pareidoliaMat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  return pareidoliaMat
}

/**
 * Wanderer scrawls (M.E.G. records: markings since the late 1960s — arrows,
 * messages, unidentified runes; "much of this art is nonsensical"). A small
 * pool of canvases: tallies, warnings, one rune, and EXIT :) pointing at
 * nothing. Charcoal vs chalk = different eras of predecessor.
 */
let scrawlMats: THREE.MeshStandardMaterial[] | null = null
export function getScrawlMaterials(): THREE.MeshStandardMaterial[] {
  if (scrawlMats) return scrawlMats
  let s = 4242
  const rnd = (): number => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  const make = (draw: (ctx: CanvasRenderingContext2D) => void): THREE.MeshStandardMaterial => {
    const S = 256
    const c = document.createElement('canvas')
    c.width = c.height = S
    const ctx = c.getContext('2d')!
    ctx.lineCap = 'round'
    draw(ctx)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  }
  const CHARCOAL = 'rgba(48, 40, 30,'
  const CHALK = 'rgba(226, 219, 192,'
  const text = (ctx: CanvasRenderingContext2D, lines: string[], color: string, size = 40): void => {
    ctx.font = `${size}px "Special Elite", "Comic Sans MS", cursive`
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = `${color} ${0.35 + pass * 0.25})`
      lines.forEach((ln, i) => {
        ctx.fillText(
          ln,
          26 + (rnd() - 0.5) * 5,
          92 + i * (size + 14) + (rnd() - 0.5) * 5,
        )
      })
    }
  }
  scrawlMats = [
    // tally cluster — someone counted something here. it reads 23.
    make((ctx) => {
      ctx.strokeStyle = `${CHARCOAL} 0.55)`
      for (let g = 0; g < 4; g++) {
        const gx = 38 + g * 52
        const gy = 110 + (rnd() - 0.5) * 14
        ctx.lineWidth = 4.5
        for (let i = 0; i < (g === 3 ? 3 : 4); i++) {
          ctx.beginPath()
          ctx.moveTo(gx + i * 11 + (rnd() - 0.5) * 3, gy + (rnd() - 0.5) * 4)
          ctx.lineTo(gx + i * 11 + (rnd() - 0.5) * 3, gy + 52 + (rnd() - 0.5) * 4)
          ctx.stroke()
        }
        if (g < 3) {
          ctx.beginPath()
          ctx.moveTo(gx - 6, gy + 44)
          ctx.lineTo(gx + 42, gy + 8)
          ctx.stroke()
        }
      }
    }),
    make((ctx) => text(ctx, ['KEEP', 'MOVING'], CHALK, 52)),
    make((ctx) => text(ctx, ['NO DOORS', 'NO DOORS', 'no doors'], CHARCOAL, 34)),
    make((ctx) => text(ctx, ['it hears', 'the hum', 'stop humming'], CHARCOAL, 32)),
    make((ctx) => text(ctx, ['EXIT :)'], CHALK, 58)),
    // the rune: recurring, unidentified, never referenced anywhere
    make((ctx) => {
      ctx.strokeStyle = `${CHARCOAL} 0.6)`
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(128, 36)
      ctx.lineTo(70, 150)
      ctx.lineTo(186, 150)
      ctx.closePath()
      ctx.moveTo(128, 36)
      ctx.lineTo(128, 214)
      ctx.moveTo(96, 188)
      ctx.lineTo(160, 188)
      ctx.stroke()
    }),
    make((ctx) => text(ctx, ['down', 'down', 'down down'], CHALK, 40)),
  ]
  return scrawlMats
}

/** Soft radial glow sprite for fixture halos + floor light pools. */
let glowTex: THREE.CanvasTexture | null = null
export function getGlowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255, 246, 214, 0.85)')
  g.addColorStop(0.4, 'rgba(255, 244, 200, 0.28)')
  g.addColorStop(1, 'rgba(255, 244, 200, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  glowTex = new THREE.CanvasTexture(c)
  return glowTex
}

/** Shared additive materials so the blackout can starve every halo at once. */
export const glowMaterials = {
  halo: null as THREE.MeshBasicMaterial | null,
  pool: null as THREE.MeshBasicMaterial | null,
}
export function getGlowMaterials(): { halo: THREE.MeshBasicMaterial; pool: THREE.MeshBasicMaterial } {
  if (!glowMaterials.halo) {
    glowMaterials.halo = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    glowMaterials.pool = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  }
  return { halo: glowMaterials.halo, pool: glowMaterials.pool! }
}

// ---------------------------------------------------------------------------
// Anomalous wing materials (the maze bleeds into other places).
// All synthesized — zero downloads. Poolrooms tile, dead-playplace carnival
// carpet + plastics, parking-garage concrete.
// ---------------------------------------------------------------------------

function seededRnd(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

/**
 * Poolrooms tile (canon: "eerily pristine, all identical, without a single
 * hint of damage"). The wrongness is sterile perfection — the exact inverse
 * of Level 0's filth. Small white squares, warm-grey grout, NO grime.
 */
function makeTileTexture(): THREE.CanvasTexture {
  const S = 512 // 1.2 m world period → ~7.5 cm tiles
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const rnd = seededRnd(91)
  ctx.fillStyle = '#b7b4a8' // grout
  ctx.fillRect(0, 0, S, S)
  const T = 32
  for (let y = 0; y < S; y += T) {
    for (let x = 0; x < S; x += T) {
      const v = 238 + Math.floor(rnd() * 12) - 6
      ctx.fillStyle = `rgb(${v - 2}, ${v}, ${v - 5})`
      ctx.fillRect(x + 1, y + 1, T - 2, T - 2)
    }
  }
  return new THREE.CanvasTexture(c)
}

/** Carnival carpet: near-black navy with confetti shapes. Eats light. */
function makeCarnivalTexture(): THREE.CanvasTexture {
  const S = 512 // 2 m period
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const rnd = seededRnd(777)
  ctx.fillStyle = '#11131f'
  ctx.fillRect(0, 0, S, S)
  const colors = ['#b5303c', '#2f6fb8', '#c8b22a', '#3d9c4a', '#8a3fa0', '#c46a22']
  for (let i = 0; i < 240; i++) {
    const x = rnd() * S
    const y = rnd() * S
    const col = colors[Math.floor(rnd() * colors.length)]
    ctx.strokeStyle = col
    ctx.fillStyle = col
    ctx.globalAlpha = 0.5 + rnd() * 0.3
    ctx.lineWidth = 2 + rnd() * 2
    const kind = rnd()
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rnd() * Math.PI * 2)
    if (kind < 0.33) {
      // squiggle
      ctx.beginPath()
      ctx.moveTo(-8, 0)
      ctx.quadraticCurveTo(-3, -7, 0, 0)
      ctx.quadraticCurveTo(3, 7, 8, 0)
      ctx.stroke()
    } else if (kind < 0.6) {
      // triangle / shape outline
      ctx.beginPath()
      ctx.moveTo(0, -6)
      ctx.lineTo(6, 5)
      ctx.lineTo(-6, 5)
      ctx.closePath()
      ctx.stroke()
    } else if (kind < 0.85) {
      // star burst
      for (let a = 0; a < 5; a++) {
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(Math.cos((a / 5) * Math.PI * 2) * 7, Math.sin((a / 5) * Math.PI * 2) * 7)
        ctx.stroke()
      }
    } else {
      ctx.beginPath()
      ctx.arc(0, 0, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
  ctx.globalAlpha = 1
  return new THREE.CanvasTexture(c)
}

/** Garage concrete: gray, tire scuff, oil blooms, faded yellow guidance. */
function makeConcreteTexture(withLines: boolean): THREE.CanvasTexture {
  const S = 512 // 3.2 m period
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const rnd = seededRnd(withLines ? 404 : 405)
  ctx.fillStyle = '#8d8a83'
  ctx.fillRect(0, 0, S, S)
  // aggregate noise
  for (let i = 0; i < 2600; i++) {
    const v = 120 + Math.floor(rnd() * 50)
    ctx.fillStyle = `rgba(${v}, ${v}, ${v - 4}, 0.16)`
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2)
  }
  ctx.globalCompositeOperation = 'multiply'
  stainPass(ctx, S, 6, 'rgba(70, 68, 60, 0.30)') // oil blooms
  stainPass(ctx, S, 4, 'rgba(95, 90, 78, 0.22)')
  if (withLines) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#b8a23a' // faded parking-bay paint
    ctx.fillRect(0, 248, S, 14)
    ctx.globalAlpha = 1
  }
  return new THREE.CanvasTexture(c)
}

/** Crayon drawing decal (the playground had visitors. small ones.) */
let crayonMat: THREE.MeshStandardMaterial | null = null
export function getCrayonMaterial(): THREE.MeshStandardMaterial {
  if (crayonMat) return crayonMat
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const rnd = seededRnd(2002)
  ctx.lineCap = 'round'
  // taped paper
  ctx.fillStyle = 'rgba(228, 222, 205, 0.92)'
  ctx.fillRect(48, 38, 160, 190)
  ctx.fillStyle = 'rgba(200, 200, 190, 0.5)'
  ctx.fillRect(110, 28, 40, 18)
  // a house, a sun, three stick figures — one drawn much taller than the rest
  ctx.strokeStyle = '#b5303c'
  ctx.lineWidth = 4
  ctx.strokeRect(70, 150, 50, 50)
  ctx.beginPath()
  ctx.moveTo(70, 150)
  ctx.lineTo(95, 124)
  ctx.lineTo(120, 150)
  ctx.stroke()
  ctx.strokeStyle = '#c8b22a'
  ctx.beginPath()
  ctx.arc(186, 70, 16, 0, Math.PI * 2)
  ctx.stroke()
  const stick = (x: number, y: number, h: number, color: string): void => {
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(x, y - h, 7, 0, Math.PI * 2)
    ctx.moveTo(x, y - h + 7)
    ctx.lineTo(x, y - h * 0.25)
    ctx.moveTo(x - 9, y - h * 0.62)
    ctx.lineTo(x + 9, y - h * 0.62)
    ctx.moveTo(x, y - h * 0.25)
    ctx.lineTo(x - 8, y)
    ctx.moveTo(x, y - h * 0.25)
    ctx.lineTo(x + 8, y)
    ctx.stroke()
  }
  stick(150, 215, 38, '#2f6fb8')
  stick(172, 215, 34, '#3d9c4a')
  stick(196, 215, 86, '#3a3a3a') // it was at the party too
  // the =)
  ctx.strokeStyle = '#3a3a3a'
  ctx.lineWidth = 3
  ctx.font = '26px monospace'
  ctx.fillStyle = '#3a3a3a'
  ctx.fillText('=)', 76, 222)
  void rnd
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  crayonMat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  return crayonMat
}

export const wingMaterials = {
  tile: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.02 }),
  tileFloor: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.02 }),
  /** Canon: blue-green, crystal-clear, lukewarm. The only color in the room. */
  water: new THREE.MeshStandardMaterial({
    color: 0x4fae9f,
    roughness: 0.06,
    metalness: 0.0,
    transparent: true,
    opacity: 0.66,
  }),
  /** The single navy accent band at the waterline (Pike's renders). */
  navyBand: new THREE.MeshStandardMaterial({ color: 0x1d3a6e, roughness: 0.25 }),
  carnival: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
  /** Level Fun =) — the canonical orange. Slightly glossy, like it's new. */
  playWall: new THREE.MeshStandardMaterial({ color: 0xd08a30, roughness: 0.7 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
  concretePlain: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }),
  /** Garage tubes run warmer — half-dead sodium contamination. */
  fixtureSodium: new THREE.MeshStandardMaterial({
    color: 0xd8cab0,
    emissive: 0xffb45a,
    emissiveIntensity: 1.7,
  }),
  plastics: [
    new THREE.MeshStandardMaterial({ color: 0xb5303c, roughness: 0.38, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x2f6fb8, roughness: 0.38, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0xc8b22a, roughness: 0.38, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x3d9c4a, roughness: 0.38, side: THREE.DoubleSide }),
  ],
  balloon: new THREE.MeshStandardMaterial({ color: 0xc02430, roughness: 0.25 }),
  ballColors: [0xb5303c, 0x2f6fb8, 0xc8b22a, 0x3d9c4a, 0xc46a22, 0xffffff],
}

/** Crayon party scrawls — every text scrap in the wing ends with =) */
let playScrawls: THREE.MeshStandardMaterial[] | null = null
export function getPlayScrawlMaterials(): THREE.MeshStandardMaterial[] {
  if (playScrawls) return playScrawls
  const make = (lines: string[], color: string): THREE.MeshStandardMaterial => {
    const S = 256
    const c = document.createElement('canvas')
    c.width = c.height = S
    const ctx = c.getContext('2d')!
    ctx.font = '34px "Comic Sans MS", cursive'
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = color.replace('A)', `${0.4 + pass * 0.3})`)
      lines.forEach((ln, i) => ctx.fillText(ln, 22 + pass * 2, 96 + i * 52 + pass))
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  }
  playScrawls = [
    make(['party this', 'way =)'], 'rgba(180, 40, 50, A)'),
    make(['FUN =)'], 'rgba(40, 80, 180, A)'),
    make(['have some', 'cake =)'], 'rgba(50, 130, 60, A)'),
  ]
  return playScrawls
}

/** Faded yellow floor arrow (garage wayfinding that lies). */
let floorArrowMat: THREE.MeshStandardMaterial | null = null
export function getFloorArrowMaterial(): THREE.MeshStandardMaterial {
  if (floorArrowMat) return floorArrowMat
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.strokeStyle = 'rgba(184, 162, 58, 0.55)'
  ctx.fillStyle = 'rgba(184, 162, 58, 0.55)'
  ctx.lineWidth = 26
  ctx.beginPath()
  ctx.moveTo(128, 215)
  ctx.lineTo(128, 95)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(128, 30)
  ctx.lineTo(180, 105)
  ctx.lineTo(76, 105)
  ctx.closePath()
  ctx.fill()
  // wear: punch holes out of the paint
  const rnd = seededRnd(33)
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.5})`
    ctx.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 7, 2 + rnd() * 5)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  floorArrowMat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  return floorArrowMat
}

/** The tally by the red room. 74 marks. Never referenced. Never explained. */
let tally74Mat: THREE.MeshStandardMaterial | null = null
export function getTally74Material(): THREE.MeshStandardMaterial {
  if (tally74Mat) return tally74Mat
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 320
  const ctx = c.getContext('2d')!
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(46, 38, 28, 0.6)'
  let s = 74747
  const rnd = (): number => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  let drawn = 0
  for (let row = 0; row < 3 && drawn < 74; row++) {
    for (let g = 0; g < 5 && drawn < 74; g++) {
      const gx = 30 + g * 96
      const gy = 56 + row * 96 + (rnd() - 0.5) * 10
      const n = Math.min(5, 74 - drawn)
      ctx.lineWidth = 4
      for (let i = 0; i < Math.min(n, 4); i++) {
        ctx.beginPath()
        ctx.moveTo(gx + i * 14 + (rnd() - 0.5) * 3, gy + (rnd() - 0.5) * 4)
        ctx.lineTo(gx + i * 14 + (rnd() - 0.5) * 3, gy + 52 + (rnd() - 0.5) * 4)
        ctx.stroke()
        drawn++
      }
      if (n === 5) {
        ctx.beginPath()
        ctx.moveTo(gx - 7, gy + 46)
        ctx.lineTo(gx + 52, gy + 8)
        ctx.stroke()
        drawn++
      }
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tally74Mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  return tally74Mat
}

/** Wet bare footprint, glossy-dark on the carpet. They stop at a wall. */
let footprintMat: THREE.MeshStandardMaterial | null = null
export function getFootprintMaterial(): THREE.MeshStandardMaterial {
  if (footprintMat) return footprintMat
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgba(34, 30, 22, 0.62)'
  // sole
  ctx.beginPath()
  ctx.ellipse(32, 78, 14, 30, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(30, 42, 11, 14, -0.12, 0, Math.PI * 2)
  ctx.fill()
  // toes
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    ctx.ellipse(14 + i * 9, 22 - Math.abs(i - 1.4) * 2.2, 3.6 - i * 0.35, 4.6 - i * 0.4, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  footprintMat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: 0.25, // wet sheen — the lights catch it
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  return footprintMat
}

/** Manila Room walls: clean, calm, the one non-yellow surface that's kind. */
export const manilaMaterial = new THREE.MeshStandardMaterial({
  color: 0xe9deba,
  roughness: 0.82,
})

// ---------------------------------------------------------------------------
// TAPE 2 expansion materials
// ---------------------------------------------------------------------------

/** Office Pocket (G1): 2002 cubicle island. Fabric, laminate, beige plastic. */
export const officeMaterials = {
  partition: new THREE.MeshStandardMaterial({ color: 0x6e7077, roughness: 0.98 }),
  partitionTrim: new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 0.6 }),
  laminate: new THREE.MeshStandardMaterial({ color: 0xb9ad94, roughness: 0.55 }),
  crtShell: new THREE.MeshStandardMaterial({ color: 0xc9c2ae, roughness: 0.65 }),
  /** Dead screen: dark green-grey glass. It reflects you, barely. */
  crtDead: new THREE.MeshStandardMaterial({ color: 0x1c211e, roughness: 0.18, metalness: 0.1 }),
  carpetTiles: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96 }),
}

/** Flooded zone (G2): the water is shallow, dark, and very patient. */
export const floodWaterMaterial = new THREE.MeshStandardMaterial({
  color: 0x3a3d2e,
  roughness: 0.07,
  metalness: 0.0,
  transparent: true,
  opacity: 0.62,
})

/** The one powered CRT in the office: animated static. The only screen
 *  light in the game. Basic (unlit) — a screen IS a light. */
let crtStaticMat: THREE.MeshBasicMaterial | null = null
let crtStaticCanvas: HTMLCanvasElement | null = null
let crtStaticTex: THREE.CanvasTexture | null = null
let crtStaticLast = 0
export function getCrtStaticMaterial(): THREE.MeshBasicMaterial {
  if (crtStaticMat) return crtStaticMat
  crtStaticCanvas = document.createElement('canvas')
  crtStaticCanvas.width = crtStaticCanvas.height = 64
  drawCrtStatic()
  crtStaticTex = new THREE.CanvasTexture(crtStaticCanvas)
  crtStaticTex.magFilter = THREE.NearestFilter
  crtStaticMat = new THREE.MeshBasicMaterial({ map: crtStaticTex, fog: false })
  return crtStaticMat
}

function drawCrtStatic(): void {
  if (!crtStaticCanvas) return
  const ctx = crtStaticCanvas.getContext('2d')!
  const img = ctx.createImageData(64, 64)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 30 + Math.random() * 170
    img.data[i] = v * 0.82
    img.data[i + 1] = v
    img.data[i + 2] = v * 0.9
    img.data[i + 3] = 255
  }
  // a rolling dark band, like the refresh fighting the tape
  const band = Math.floor((performance.now() * 0.02) % 64)
  for (let y = band; y < Math.min(64, band + 7); y++) {
    for (let x = 0; x < 64; x++) {
      const k = (y * 64 + x) * 4
      img.data[k] *= 0.45
      img.data[k + 1] *= 0.45
      img.data[k + 2] *= 0.45
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** Call from the frame loop; redraws at ~12.5 Hz (CRTs are not smooth). */
export function updateCrtStatic(timeMs: number): void {
  if (!crtStaticTex || timeMs - crtStaticLast < 80) return
  crtStaticLast = timeMs
  drawCrtStatic()
  crtStaticTex.needsUpdate = true
}

/**
 * Lore egg 2 — "the arrows agree". A single chevron matching the wallpaper
 * motif, same ink, same weight. The horror is only in which way it points.
 */
let chevronMat: THREE.MeshStandardMaterial | null = null
export function getChevronMaterial(): THREE.MeshStandardMaterial {
  if (chevronMat) return chevronMat
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.strokeStyle = 'rgba(122, 106, 52, 0.62)'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(38, 44)
  ctx.lineTo(64, 78)
  ctx.lineTo(90, 44)
  ctx.stroke()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  chevronMat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  return chevronMat
}

/**
 * D10 — carpet flow. The pattern advects at ~1 cm/s, but only in
 * peripheral vision: the velocity is masked to zero at the center of the
 * frame. Gaze-contingent via gl_FragCoord; subtle enough to be deniable.
 */
export const carpetFlowUniforms = {
  uFlowAmt: { value: 0 },
  uFlowTime: { value: 0 },
  uFlowRes: { value: new THREE.Vector2(1920, 1080) },
}

/**
 * D7 — seam drift. Wallpaper seam alignment degrades along a corridor
 * (per-segment hash offset, ramped by distance from the event center),
 * then snaps back to perfect at the next junction.
 */
export const seamDriftUniforms = {
  uSeamAmt: { value: 0 },
  uSeamCenter: { value: new THREE.Vector2(0, 0) },
}

/** Column stencil. Every column says LEVEL 3. Every single one. */
let stencilMat: THREE.MeshStandardMaterial | null = null
export function getStencilMaterial(): THREE.MeshStandardMaterial {
  if (stencilMat) return stencilMat
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const ctx = c.getContext('2d')!
  ctx.font = 'bold 52px monospace'
  ctx.fillStyle = 'rgba(196, 170, 60, 0.75)'
  ctx.fillText('LEVEL', 38, 56)
  ctx.fillText('3', 105, 112)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  stencilMat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  return stencilMat
}

/** 2002 office carpet tiles: 50 cm grid, grey-blue, coffee ghosts. */
function makeOfficeCarpetTexture(): THREE.CanvasTexture {
  const S = 512 // 2 m world period → 4 tiles
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const rnd = seededRnd(2002)
  const T = 128
  for (let y = 0; y < S; y += T) {
    for (let x = 0; x < S; x += T) {
      const v = 78 + Math.floor(rnd() * 14)
      ctx.fillStyle = `rgb(${v - 6}, ${v}, ${v + 10})`
      ctx.fillRect(x, y, T, T)
      // tile direction alternates — the checker sheen of cheap carpet tile
      ctx.globalAlpha = 0.12
      ctx.fillStyle = (x / T + y / T) % 2 === 0 ? '#ffffff' : '#000000'
      ctx.fillRect(x, y, T, T)
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(20, 22, 28, 0.45)'
      ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1)
    }
  }
  // fiber noise + old coffee
  for (let i = 0; i < 2400; i++) {
    const v = 60 + Math.floor(rnd() * 60)
    ctx.fillStyle = `rgba(${v}, ${v + 4}, ${v + 12}, 0.18)`
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2)
  }
  ctx.globalCompositeOperation = 'multiply'
  stainPass(ctx, S, 4, 'rgba(96, 80, 52, 0.30)')
  return new THREE.CanvasTexture(c)
}

let officeInitialized = false
/** Lazy, like the wings: only pay if an office streams in. */
export function initOfficeMaterials(): void {
  if (officeInitialized) return
  officeInitialized = true
  const tex = makeOfficeCarpetTexture()
  setupTiling(tex, 2.0, true)
  officeMaterials.carpetTiles.map = tex
  officeMaterials.carpetTiles.needsUpdate = true
}

let wingsInitialized = false
/** Lazy: only pay the canvas cost if a wing actually streams in. */
export function initWingMaterials(): void {
  if (wingsInitialized) return
  wingsInitialized = true
  const tileTex = makeTileTexture()
  setupTiling(tileTex, 1.2, true)
  wingMaterials.tile.map = tileTex
  const tileFloorTex = makeTileTexture()
  setupTiling(tileFloorTex, 1.6, true)
  wingMaterials.tileFloor.map = tileFloorTex
  const carnTex = makeCarnivalTexture()
  setupTiling(carnTex, 2.0, true)
  wingMaterials.carnival.map = carnTex
  const concTex = makeConcreteTexture(true)
  setupTiling(concTex, 3.2, true)
  wingMaterials.concrete.map = concTex
  const concPlainTex = makeConcreteTexture(false)
  setupTiling(concPlainTex, 3.2, true)
  wingMaterials.concretePlain.map = concPlainTex
  for (const m of [
    wingMaterials.tile,
    wingMaterials.tileFloor,
    wingMaterials.carnival,
    wingMaterials.concrete,
    wingMaterials.concretePlain,
  ])
    m.needsUpdate = true
}

const CARPET_PERIOD = 1.2
const WALL_PERIOD = 2.4
const CEILING_PERIOD = 2.4 // stained set carries 2x2 panels → 1.2 m tiles

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
      // TAPE 2: Daniel's generated stained drop-tile set replaces the
      // clean OfficeCeiling001 — the stains were tinted on in-shader
      // before; now they're real and they don't repeat with the grime.
      load('ceiling_stained/color.jpg'),
      load('ceiling_stained/normal.jpg'),
      load('ceiling_stained/rough.jpg'),
      load('ceiling_stained/ao.jpg'),
      load('carpet_damp/color.jpg'),
      load('carpet_damp/normal.jpg'),
    ])

  // Fixture diffuser (Daniel-generated): grimy ribbed lens + emissive mask.
  // The dirt sits IN FRONT of the light now — specks read as silhouettes.
  void Promise.all([load('diffuser/color.jpg'), load('diffuser/emissive.jpg')]).then(
    ([dc, de]) => {
      dc.colorSpace = THREE.SRGBColorSpace
      worldMaterials.fixture.map = dc
      worldMaterials.fixture.emissiveMap = de
      worldMaterials.fixture.needsUpdate = true
    },
    () => {
      /* fixture stays a clean emissive panel — fine */
    },
  )

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
  m.ceiling.color.set(0xe6e0c8) // light tint only — the stains are baked in now

  m.carpetDamp.map = setupTiling(dampC, 1.6, true)
  m.carpetDamp.normalMap = setupTiling(dampN, 1.6)
  m.carpetDamp.normalScale.setScalar(0.8)

  // Grime gradients: walls darken toward the carpet line (scuff, shadow,
  // thirty-five years of shoulders) and slightly toward the ceiling. Chunk
  // geometry is baked in world space (identity transforms), so `transformed`
  // IS the world position — cheapest possible contact-occlusion fake.
  m.wall.onBeforeCompile = (shader) => {
    shader.uniforms.uSeamAmt = seamDriftUniforms.uSeamAmt
    shader.uniforms.uSeamCenter = seamDriftUniforms.uSeamCenter
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGrimeY;\nvarying vec2 vWorldXZ;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vGrimeY = transformed.y;\n  vWorldXZ = transformed.xz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vGrimeY;\nvarying vec2 vWorldXZ;\nuniform float uSeamAmt;\nuniform vec2 uSeamCenter;',
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  {
    // D7 seam drift: per-segment hash offset, ramped by distance from the
    // event center. Snaps to zero (perfect) the instant uSeamAmt drops.
    vec2 wUv = vMapUv;
    float seg = floor(vWorldXZ.x / 2.4) * 7.0 + floor(vWorldXZ.y / 2.4);
    float sh = fract(sin(seg * 127.1) * 43758.5453) - 0.5;
    float sd = distance(vWorldXZ, uSeamCenter);
    wUv.x += uSeamAmt * sh * 0.21 * smoothstep(16.0, 3.0, sd);
    vec4 sampledDiffuseColor = texture2D(map, wUv);
    diffuseColor *= sampledDiffuseColor;
  }
#endif
  {
    float lowGrime = 1.0 - 0.30 * smoothstep(0.62, 0.05, vGrimeY);
    float highGrime = 1.0 - 0.16 * smoothstep(2.30, 2.78, vGrimeY);
    diffuseColor.rgb *= lowGrime * highGrime;
  }`,
      )
  }

  // D10 carpet flow: the pattern advects at ~1 cm/s, masked to zero in the
  // center of the frame. Peripheral vision only. Deniable by design.
  m.carpet.onBeforeCompile = (shader) => {
    shader.uniforms.uFlowAmt = carpetFlowUniforms.uFlowAmt
    shader.uniforms.uFlowTime = carpetFlowUniforms.uFlowTime
    shader.uniforms.uFlowRes = carpetFlowUniforms.uFlowRes
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uFlowAmt;\nuniform float uFlowTime;\nuniform vec2 uFlowRes;',
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  {
    vec2 fUv = vMapUv;
    float fMask = smoothstep(0.16, 0.42, distance(gl_FragCoord.xy / uFlowRes, vec2(0.5)));
    fUv += uFlowAmt * fMask * uFlowTime * vec2(0.00833, 0.00833); // 1 cm/s in 1.2 m UV space
    vec4 sampledDiffuseColor = texture2D(map, fUv);
    diffuseColor *= sampledDiffuseColor;
  }
#else
  #include <map_fragment>
#endif`,
      )
  }

  for (const mat of [m.carpet, m.wall, m.ceiling, m.carpetDamp]) mat.needsUpdate = true
}
