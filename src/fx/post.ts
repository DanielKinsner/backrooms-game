import * as THREE from 'three'
import {
  BlendFunction,
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  VignetteEffect,
} from 'postprocessing'
// eslint-disable-next-line import/no-unresolved -- ships its own types
import { N8AOPostPass } from 'n8ao'
import { VHSEffect } from './vhs'

/**
 * The grade IS the fidelity (market brief): GTAO-class ambient occlusion,
 * bloom on emissive fixtures, slight chromatic aberration, the VHS pass,
 * film grain, vignette, SMAA. Subtle and always-on; nothing here ever slams.
 *
 * AO note: corners, ceiling-tile seams and baseboards going dark is the
 * single biggest "this is a real place" upgrade a fog-lit box world can buy.
 */
export interface PostStack {
  composer: EffectComposer
  vhs: VHSEffect
  bloom: BloomEffect
  vignette: VignetteEffect
  setSize: (w: number, h: number) => void
}

export function createPostStack(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): PostStack {
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
  })
  composer.addPass(new RenderPass(scene, camera))

  // Screen-space AO (N8AO half-res): contact darkening where walls meet
  // carpet and tiles meet walls. Fog already eats the distance, so a tight
  // radius is both cheaper and more correct.
  const ao = new N8AOPostPass(scene, camera, window.innerWidth, window.innerHeight)
  ao.configuration.aoRadius = 1.6
  ao.configuration.distanceFalloff = 1.2
  ao.configuration.intensity = 2.6
  ao.configuration.color = new THREE.Color(0x1f1a0e) // grime-brown, not dead black
  ao.configuration.halfRes = true
  ao.setQualityMode('Medium')
  composer.addPass(ao)

  const bloom = new BloomEffect({
    intensity: 0.7,
    luminanceThreshold: 0.72,
    luminanceSmoothing: 0.18,
    mipmapBlur: true,
  })

  const ca = new ChromaticAberrationEffect({
    offset: new THREE.Vector2(0.00075, 0.0005),
    radialModulation: true,
    modulationOffset: 0.28,
  })

  const vhs = new VHSEffect()

  const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false })
  grain.blendMode.opacity.value = 0.12

  const vignette = new VignetteEffect({ darkness: 0.52, offset: 0.28 })

  const smaa = new SMAAEffect()

  // pmndrs merge rules: one convolution effect per pass, and UV-transforming
  // effects (VHS mainUv) can't share with convolution (bloom, CA).
  composer.addPass(new EffectPass(camera, bloom))
  composer.addPass(new EffectPass(camera, ca))
  composer.addPass(new EffectPass(camera, vhs, grain, vignette))
  composer.addPass(new EffectPass(camera, smaa))

  return {
    composer,
    vhs,
    bloom,
    vignette,
    setSize: (w, h) => composer.setSize(w, h),
  }
}
