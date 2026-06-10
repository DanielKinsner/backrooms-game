import * as THREE from 'three'

/**
 * Single seam for renderer creation. DESIGN.md §10: ship WebGL2 +
 * pmndrs/postprocessing today; this is the only file that changes
 * when the WebGPU/TSL port happens.
 */
export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // AA comes from the post stack later (SMAA); MSAA fights post passes
    powerPreference: 'high-performance',
    stencil: false,
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  return renderer
}
