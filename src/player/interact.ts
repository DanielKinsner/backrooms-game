import * as THREE from 'three'
import type { Input } from '../core/input'

/**
 * Gaze interaction (DESIGN.md §5): raycast from the lens, diegetic [E]
 * prompt, no inventory. Notes open a full-frame read overlay that freezes
 * the body but keeps the tape rolling.
 */
export interface Interactable {
  object: THREE.Object3D
  label: string // 'READ' | 'DRINK' | 'TAKE' | ...
  onUse: (item: Interactable) => void
  once?: boolean
}

export class InteractSystem {
  current: Interactable | null = null

  private items = new Map<THREE.Object3D, Interactable>()
  private ray = new THREE.Raycaster()
  private promptEl: HTMLDivElement
  private prevE = false

  constructor() {
    this.ray.far = 2.6
    this.promptEl = document.createElement('div')
    this.promptEl.id = 'interact-prompt'
    this.promptEl.classList.add('hidden')
    document.body.appendChild(this.promptEl)
  }

  add(item: Interactable): void {
    this.items.set(item.object, item)
  }

  remove(object: THREE.Object3D): void {
    this.items.delete(object)
  }

  update(camera: THREE.PerspectiveCamera, input: Input, enabled: boolean): void {
    this.current = null
    if (enabled && this.items.size > 0) {
      this.ray.setFromCamera(ZERO2, camera)
      const hits = this.ray.intersectObjects([...this.items.keys()], false)
      if (hits.length > 0) this.current = this.items.get(hits[0].object) ?? null
    }

    if (this.current) {
      this.promptEl.textContent = `[E] ${this.current.label}`
      this.promptEl.classList.remove('hidden')
    } else {
      this.promptEl.classList.add('hidden')
    }

    const eDown = input.isDown('KeyE')
    if (eDown && !this.prevE && this.current) {
      const item = this.current
      if (item.once !== false) this.remove(item.object)
      item.onUse(item)
    }
    this.prevE = eDown
  }
}

const ZERO2 = new THREE.Vector2(0, 0)

/** Full-frame handwritten note. Any of E/Escape/click closes it. */
export class NoteOverlay {
  reading = false

  private root: HTMLDivElement
  private textEl: HTMLDivElement
  private closeAt = 0

  constructor() {
    this.root = document.createElement('div')
    this.root.id = 'note-overlay'
    this.root.classList.add('hidden')
    this.root.innerHTML = `<div class="note-paper"><div class="note-text"></div><div class="note-hint">[E] put down</div></div>`
    document.body.appendChild(this.root)
    this.textEl = this.root.querySelector('.note-text')!
  }

  private prevKey = true // true at open so the opening press can't also close

  show(text: string): void {
    this.textEl.textContent = text
    this.root.classList.remove('hidden')
    this.reading = true
    this.prevKey = true
    this.closeAt = performance.now() + 250
  }

  /** Call each frame; closes on a FRESH E/Escape press only. */
  update(input: Input): boolean {
    if (!this.reading) return false
    const down = input.isDown('KeyE') || input.isDown('Escape')
    const fresh = down && !this.prevKey
    this.prevKey = down
    if (performance.now() < this.closeAt) return false
    if (fresh) {
      this.root.classList.add('hidden')
      this.reading = false
      return true
    }
    return false
  }
}
