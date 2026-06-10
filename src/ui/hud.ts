/**
 * Diegetic camcorder burn-in (DESIGN.md §10): REC dot, tape timestamp,
 * battery. DOM layer — tack-sharp over the degraded image, exactly like a
 * real camcorder. The timestamp starting point is the morning the original
 * photo was taken. The director later glitches these (the PLAY beat).
 */
export class CamcorderHud {
  private root: HTMLDivElement
  private clockEl: HTMLSpanElement
  private dateEl: HTMLSpanElement
  private battEl: HTMLSpanElement
  private recEl: HTMLDivElement

  /** Seconds on tape since power-on (06:42:00 AM). */
  tapeTime = 0
  private battery = 0.84

  constructor() {
    this.root = document.createElement('div')
    this.root.id = 'cam-hud'
    this.root.classList.add('hidden')
    this.root.innerHTML = `
      <div class="hud-corner tl"></div>
      <div class="hud-corner tr"></div>
      <div class="hud-corner bl"></div>
      <div class="hud-corner br"></div>
      <div class="hud-rec"><span class="hud-dot"></span><span class="hud-rec-label">REC</span></div>
      <div class="hud-batt"><span class="batt-body"><span class="batt-fill"></span></span><span class="batt-pct"></span></div>
      <div class="hud-stamp"><span class="stamp-date">JUN.12 2002</span><br><span class="stamp-clock">AM 6:42:00</span></div>
    `
    document.body.appendChild(this.root)
    this.clockEl = this.root.querySelector('.stamp-clock')!
    this.dateEl = this.root.querySelector('.stamp-date')!
    this.battEl = this.root.querySelector('.batt-pct')!
    this.recEl = this.root.querySelector('.hud-rec')!

    void loadHudFonts()
  }

  show(): void {
    this.root.classList.remove('hidden')
  }

  hide(): void {
    this.root.classList.add('hidden')
  }

  update(dt: number): void {
    this.tapeTime += dt
    this.battery = Math.max(0.05, this.battery - dt * 0.00004)

    const total = 6 * 3600 + 42 * 60 + Math.floor(this.tapeTime)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    this.clockEl.textContent = `AM ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    const fill = this.root.querySelector<HTMLElement>('.batt-fill')
    if (fill) fill.style.width = `${Math.round(this.battery * 100)}%`
    this.battEl.textContent = `${Math.round(this.battery * 100)}%`
  }

  /** Director hooks — the one earned meta-beat swaps REC for PLAY. */
  setRecLabel(text: string): void {
    this.recEl.querySelector('.hud-rec-label')!.textContent = text
  }

  setStamp(date: string, clock: string): void {
    this.dateEl.textContent = date
    this.clockEl.textContent = clock
  }
}

async function loadHudFonts(): Promise<void> {
  const base = import.meta.env.BASE_URL
  const vt = new FontFace('VT323', `url(${base}fonts/vt323.woff2)`)
  const se = new FontFace('Special Elite', `url(${base}fonts/special-elite.woff2)`)
  const loaded = await Promise.allSettled([vt.load(), se.load()])
  for (const r of loaded) {
    if (r.status === 'fulfilled') document.fonts.add(r.value)
  }
}
