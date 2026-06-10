/** Keyboard + pointer-lock mouse state. Mouse deltas accumulate and are consumed once per frame. */
export class Input {
  locked = false
  onLockChange?: (locked: boolean) => void

  private keys = new Set<string>()
  private heldKeys = new Set<string>() // automation holds; survive blur/lock-loss
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

    document.addEventListener('mousedown', (e) => {
      if (this.locked) this.buttons.add(e.button)
    })
    document.addEventListener('mouseup', (e) => this.buttons.delete(e.button))
  }

  private buttons = new Set<number>()
  private heldButtons = new Set<number>()

  isMouseDown(button: number): boolean {
    return this.buttons.has(button) || this.heldButtons.has(button)
  }

  /** Test hook, like setKey. */
  setMouse(button: number, down: boolean): void {
    if (down) this.heldButtons.add(button)
    else this.heldButtons.delete(button)
  }

  isDown(code: string): boolean {
    return this.keys.has(code) || this.heldKeys.has(code)
  }

  /** Test hook: hold or release a key programmatically (dev automation drives playthroughs with this). */
  setKey(code: string, down: boolean): void {
    if (down) this.heldKeys.add(code)
    else this.heldKeys.delete(code)
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
