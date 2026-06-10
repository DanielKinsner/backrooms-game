declare module 'n8ao' {
  import type { Scene, Camera, Color } from 'three'
  import { Pass } from 'postprocessing'

  /** N8AO screen-space ambient occlusion as a pmndrs/postprocessing pass. */
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    configuration: {
      aoRadius: number
      distanceFalloff: number
      intensity: number
      color: Color
      halfRes: boolean
      aoSamples: number
      denoiseSamples: number
      denoiseRadius: number
      gammaCorrection: boolean
      screenSpaceRadius: boolean
    }
    setQualityMode(
      mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra',
    ): void
    setSize(width: number, height: number): void
  }
}
