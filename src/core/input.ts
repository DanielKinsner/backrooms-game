/** Keyboard + pointer-lock mouse state. Mouse deltas accumulate and are consumed once per frame. */
export class Input {
  locked = false
  onLockChange?: (locked: boolean) => void

  private keys = new Set<string>()
  private dx = 0
  private dy = 0

  constructor(private readonly lockTarget: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'F3') e.preventDefault()
      this.keys.add(e.code)
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.lockTarget
      if (!this.locked) this.keys.clear()
      this.onLockChange?.(this.locked)
    })

    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.dx += e.movementX
        this.dy += e.movementY
      }
    })
  }

  isDown(code: string): boolean {
    return this.keys.has(code)
  }

  /** Test hook: hold or release a key programmatically (dev automation drives playthroughs with this). */
  setKey(code: string, down: boolean): void {
    if (down) this.keys.add(code)
    else this.keys.delete(code)
  }

  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.dx, dy: this.dy }
    this.dx = 0
    this.dy = 0
    return out
  }

  requestLock(): void {
    // Raw input where supported; fall back if the platform rejects the option.
    try {
      const result = this.lockTarget.requestPointerLock({
        unadjustedMovement: true,
      }) as Promise<void> | undefined
      result?.catch(() => this.lockTarget.requestPointerLock())
    } catch {
      this.lockTarget.requestPointerLock()
    }
  }
}
