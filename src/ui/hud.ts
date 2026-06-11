/**
 * Diegetic camcorder burn-in (DESIGN.md §10): REC dot, tape timestamp,
 * battery. DOM layer — tack-sharp over the degraded image, exactly like a
 * real camcorder. The timestamp starting point is the morning the original
 * photo was taken.
 *
 * Research upgrade — the OSD corruption suite: audiences treat burn-in as
 * ground truth, so the burn-in is where the lying hurts most. The clock
 * silently loses seconds when space re-stitches (the tape recorded this
 * hallway before); at high dread the timestamp flashes wrong for a single
 * beat; if the player stands still too long, the REC dot starts double-
 * blinking — the camera has noticed the stillness.
 */
export class CamcorderHud {
  private root: HTMLDivElement
  private clockEl: HTMLSpanElement
  private dateEl: HTMLSpanElement
  private battEl: HTMLSpanElement
  private recEl: HTMLDivElement
  private trackingEl: HTMLDivElement

  /** Seconds on tape since power-on (06:42:00 AM). */
  tapeTime = 0
  /** Diegetic date — Tape 2 runs the next day. */
  tapeDate = 'JUN.12 2002'
  private battery = 0.84
  private glitchT = -1
  private glitchKind = 0
  private stillT = 0
  private watching = false
  private stampLocked = false

  // Spec A — the timestamp breach. Frame-locked, not wall-clock: low-fps
  // machines still render exactly `breachFrames` frames of it.
  private breachFrames = 0
  // Spec D8 — the REC dot stops blinking. Solid. Nothing else changes.
  private recHoldT = -1

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
      <div class="hud-tracking hidden">TRACKING</div>
    `
    document.body.appendChild(this.root)
    this.clockEl = this.root.querySelector('.stamp-clock')!
    this.dateEl = this.root.querySelector('.stamp-date')!
    this.battEl = this.root.querySelector('.batt-pct')!
    this.recEl = this.root.querySelector('.hud-rec')!
    this.trackingEl = this.root.querySelector('.hud-tracking')!

    void loadHudFonts()
  }

  show(): void {
    this.root.classList.remove('hidden')
  }

  hide(): void {
    this.root.classList.add('hidden')
  }

  private reverseT = -1
  private reverseRate = 3

  /** Impossible artifact: the counter visibly runs BACKWARD for `seconds`
   *  while gameplay continues forward. Max twice per run, post-meta-beat.
   *  rate=1 is the SILENCE variant (D9): exact 1× reversal, no overshoot. */
  reverseFor(seconds: number, rate = 3): void {
    this.reverseT = seconds
    this.reverseRate = rate
  }

  /**
   * Spec A — the breach. For exactly `frames` rendered frames the stamp
   * shows the player's REAL system date and time, same font, same format.
   * No sound. No reaction. Nothing acknowledges it, including this comment.
   */
  breach(frames = 2): void {
    this.breachFrames = frames
  }

  /** D8: the REC dot goes solid for `seconds`. That's all. */
  holdRecDot(seconds: number): void {
    this.recHoldT = seconds
    this.root.querySelector('.hud-dot')!.classList.add('solid')
  }

  update(dt: number, dread = 0, moving = true): void {
    if (this.reverseT > 0) {
      this.reverseT -= dt
      this.tapeTime = Math.max(0, this.tapeTime - dt * this.reverseRate)
    } else {
      this.tapeTime += dt
    }
    if (this.recHoldT >= 0) {
      this.recHoldT -= dt
      if (this.recHoldT < 0) this.root.querySelector('.hud-dot')!.classList.remove('solid')
    }
    if (this.breachFrames > 0) {
      this.breachFrames--
      const now = new Date()
      const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
      const h24 = now.getHours()
      const ap = h24 < 12 ? 'AM' : 'PM'
      const h = h24 % 12 === 0 ? 12 : h24 % 12
      this.dateEl.textContent = `${MON[now.getMonth()]}.${String(now.getDate()).padStart(2, '0')} ${now.getFullYear()}`
      this.clockEl.textContent = `${ap} ${h}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      this.updateBattery(dt)
      return
    }
    if (this.dateEl.textContent !== this.tapeDate && this.glitchT < 0 && !this.stampLocked) {
      this.dateEl.textContent = this.tapeDate
    }
    // stillness watcher: 45 s without meaningful movement and the REC dot
    // switches to a heartbeat double-blink until the player moves again.
    this.stillT = moving ? 0 : this.stillT + dt
    const shouldWatch = this.stillT > 45
    if (shouldWatch !== this.watching) {
      this.watching = shouldWatch
      this.root.querySelector('.hud-dot')!.classList.toggle('watching', shouldWatch)
    }

    // single-beat timestamp anomalies at high dread (~one per minute at peak)
    if (this.glitchT < 0 && dread > 0.55 && Math.random() < dt * 0.018) {
      this.glitchT = 0.12 + Math.random() * 0.08
      this.glitchKind = Math.floor(Math.random() * 3)
    }
    if (this.glitchT >= 0) {
      this.glitchT -= dt
      if (this.glitchT >= 0) {
        if (this.glitchKind === 0) {
          this.clockEl.textContent = 'AM 0:00:00'
        } else if (this.glitchKind === 1) {
          // yesterday's date — and on Tape 2, "yesterday" is Tape 1
          this.dateEl.textContent = this.tapeDate === 'JUN.13 2002' ? 'JUN.12 2002' : 'JUN.11 2002'
        } else {
          this.dateEl.textContent = 'AUG.04 1987' // before this camera existed
        }
        return // hold the wrong frame; the real stamp resumes next frame
      }
      this.dateEl.textContent = this.tapeDate
    }

    if (!this.stampLocked) {
      const total = 6 * 3600 + 42 * 60 + Math.floor(this.tapeTime)
      const h = Math.floor(total / 3600)
      const m = Math.floor((total % 3600) / 60)
      const s = total % 60
      this.clockEl.textContent = `AM ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    this.updateBattery(dt)
  }

  /** Visible drain: ~15-20% across a run. The only honest clock left. */
  private updateBattery(dt: number): void {
    this.battery = Math.max(0.05, this.battery - dt * 0.00012)
    const fill = this.root.querySelector<HTMLElement>('.batt-fill')
    if (fill) fill.style.width = `${Math.round(this.battery * 100)}%`
    this.battEl.textContent = `${Math.round(this.battery * 100)}%`
  }

  /**
   * Re-stitch hook: the clock silently loses 20-40 seconds. No announcement.
   * Players who notice gain the implication; players who don't still feel it.
   */
  tapeJump(): void {
    this.tapeTime = Math.max(0, this.tapeTime - (20 + Math.random() * 20))
  }

  /** The tape is fighting the heads — mirrors the shader's surge state. */
  setTracking(on: boolean): void {
    this.trackingEl.classList.toggle('hidden', !on)
  }

  /** Director hooks — the one earned meta-beat swaps REC for PLAY. */
  setRecLabel(text: string): void {
    this.recEl.querySelector('.hud-rec-label')!.textContent = text
  }

  setStamp(date: string, clock: string): void {
    this.dateEl.textContent = date
    this.clockEl.textContent = clock
    this.stampLocked = true
    window.setTimeout(() => {
      this.stampLocked = false
      this.dateEl.textContent = this.tapeDate
    }, 1600)
  }

  /** Tape 2 boot: next-day stamp from the first frame. */
  setTapeDate(date: string): void {
    this.tapeDate = date
    this.dateEl.textContent = date
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
