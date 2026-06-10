import * as THREE from 'three'

/** Dev-only stats HUD (F3). Wired to renderer.info from day one to catch leaks early (DESIGN.md §10). */
export class DebugHud {
  private el: HTMLDivElement
  private frames = 0
  private accum = 0
  private fps = 0
  private worstMs = 0

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.el = document.createElement('div')
    this.el.id = 'debug-hud'
    if (!import.meta.env.DEV) this.el.classList.add('hidden')
    document.body.appendChild(this.el)

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') this.el.classList.toggle('hidden')
    })
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    this.frames++
    this.accum += dt
    this.worstMs = Math.max(this.worstMs, dt * 1000)
    if (this.accum >= 0.5) {
      this.fps = this.frames / this.accum
      const info = this.renderer.info
      this.el.textContent =
        `${this.fps.toFixed(0)} fps  worst ${this.worstMs.toFixed(1)} ms\n` +
        `calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(1)}k\n` +
        `geo ${info.memory.geometries}  tex ${info.memory.textures}\n` +
        `pos ${playerPos.x.toFixed(1)} ${playerPos.y.toFixed(2)} ${playerPos.z.toFixed(1)}`
      this.frames = 0
      this.accum = 0
      this.worstMs = 0
    }
  }
}
