/** requestAnimationFrame loop with clamped delta time. */
export class Loop {
  running = false

  private last = 0
  private rafId = 0

  constructor(private readonly tick: (dt: number, time: number) => void) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const frame = (now: number) => {
      if (!this.running) return
      // Clamp so tab-switch pauses and hitches never produce giant physics steps.
      const dt = Math.min((now - this.last) / 1000, 1 / 30)
      this.last = now
      this.tick(dt, now / 1000)
      this.rafId = requestAnimationFrame(frame)
    }
    this.rafId = requestAnimationFrame(frame)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }
}
