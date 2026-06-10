/**
 * requestAnimationFrame loop with clamped delta time.
 *
 * Hidden-tab fallback: browsers suspend rAF entirely when the document is
 * hidden, which froze headless validation runs (the playbot drives the sim
 * in a background preview window). When hidden, a 30 Hz setTimeout keeps the
 * simulation ticking; rendering still happens — nobody's watching, but the
 * compositor doesn't care — and rAF resumes seamlessly on visibility.
 */
export class Loop {
  running = false

  private last = 0
  private rafId = 0
  private timerId = 0
  private simTime = 0

  constructor(private readonly tick: (dt: number, time: number) => void) {}

  /** Synchronous sim stepping for automation (immune to timer throttling). */
  step(frames: number, dt = 1 / 30): void {
    for (let i = 0; i < frames; i++) {
      this.simTime += dt
      this.tick(dt, this.simTime + 1e6) // offset keeps it ahead of rAF clock
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()

    const step = (now: number): void => {
      // Clamp so tab-switch pauses and hitches never produce giant physics steps.
      const dt = Math.min((now - this.last) / 1000, 1 / 30)
      this.last = now
      this.tick(dt, now / 1000)
    }

    const frame = (now: number): void => {
      if (!this.running || document.hidden) return
      step(now)
      this.rafId = requestAnimationFrame(frame)
    }

    const hiddenTick = (): void => {
      if (!this.running || !document.hidden) return
      // Hidden tabs throttle timers to ~1 Hz: run fixed 33 ms catch-up steps
      // so simulated time tracks wall time regardless of callback cadence.
      const now = performance.now()
      const steps = Math.min(120, Math.floor((now - this.last) / 33))
      for (let i = 0; i < steps; i++) {
        this.last += 33
        this.tick(1 / 30, this.last / 1000)
      }
      this.timerId = window.setTimeout(hiddenTick, 33)
    }

    document.addEventListener('visibilitychange', () => {
      if (!this.running) return
      this.last = performance.now()
      if (document.hidden) hiddenTick()
      else this.rafId = requestAnimationFrame(frame)
    })

    if (document.hidden) hiddenTick()
    else this.rafId = requestAnimationFrame(frame)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
    clearTimeout(this.timerId)
  }
}
