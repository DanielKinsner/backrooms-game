/**
 * AudioEngine — facade for the entire NOCLIP sound design.
 *
 * Bus graph (DESIGN.md §9):
 *
 *   ambience ─┐
 *   sfx ─────┤
 *   presence ─┼──► master ──► DynamicsCompressor ──► destination
 *   ui ──────┘
 *
 * The compressor is gentle limiting only (threshold -10 dB, ratio 12, fast
 * attack 3 ms, release 250 ms). It exists *not* to glue the mix but to catch
 * accidental peaks — the market brief was emphatic that ear-splitting
 * stingers killed competitor games. Conservative bus levels do the real work.
 *
 * Why a single facade and not exposed buses: callers in main.ts/Director
 * should never reach into individual nodes. The facade enforces the no-clicks
 * invariant (every gain change uses setTargetAtTime/linearRamp).
 *
 * Listener pose: ctx.listener positionX/forwardX with smoothing. Older Safari
 * still ships setPosition/setOrientation, so we feature-detect and fall back.
 */

import { DreadBed } from './bed'
import { Foley } from './foley'
import { HumLayer, type HumFixture } from './hum'
import { loadSampleBank, makeNoiseBuffer, type SampleBank } from './samples'

export interface AudioState {
  px: number
  py: number
  pz: number
  fwdX: number
  fwdY: number
  fwdZ: number
  upX: number
  upY: number
  upZ: number
  fixtures: HumFixture[]
  speed: number
  onGround: boolean
  sprinting: boolean
  crouching: boolean
  moving: boolean
}

export type SpatialName = 'impact' | 'doorOpen' | 'doorClose' | 'creak' | 'glitch'

const SILENCE_RAMP_S = 0.08 // hard cut, click-safe

export class AudioEngine {
  private ctx: AudioContext | null = null
  private samples: SampleBank | null = null

  // Bus graph nodes
  private master!: GainNode
  private limiter!: DynamicsCompressorNode
  private ambienceBus!: GainNode
  private sfxBus!: GainNode
  private presenceBus!: GainNode
  private uiBus!: GainNode

  // Sublayers
  private hum: HumLayer | null = null
  private bed: DreadBed | null = null
  private foley: Foley | null = null

  // Ambient texture (atmoseerie + ambient_horror) — runs as a slow swap-in/out
  // backdrop under the hum. Single voice; we pick a buffer on each fade.
  private atmosVoiceGain: GainNode | null = null
  private currentAtmosTarget = 0.07
  private dread = 0
  private silenced = false

  // Listener smoothing fallback for old Safari
  private listenerUsesScalar = false

  /** Master mute. Smoothly ramps master gain to 0 (no abrupt cuts). */
  private _muted = false

  get muted(): boolean {
    return this._muted
  }

  set muted(v: boolean) {
    this._muted = v
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(v ? 0 : 0.85, t, 0.05)
  }

  /** Must be called after a user gesture (pointer-lock click counts). */
  async init(): Promise<void> {
    if (this.ctx) return

    // Lazy import the WebKit-prefixed type only if AudioContext is missing.
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) throw new Error('Web Audio API not available')

    const ctx = new Ctor({ latencyHint: 'interactive' })
    this.ctx = ctx
    // Some browsers (Chrome) still create the context suspended even after gesture.
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch (e) {
        console.warn('[audio] resume() failed:', e)
      }
    }

    // --- Build bus graph ---
    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -10
    this.limiter.knee.value = 6
    this.limiter.ratio.value = 12
    this.limiter.attack.value = 0.003
    this.limiter.release.value = 0.25
    this.limiter.connect(ctx.destination)

    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(this.limiter)
    // Soft fade-in to mute the boot click on Chrome.
    this.master.gain.setTargetAtTime(this._muted ? 0 : 0.85, ctx.currentTime, 0.1)

    this.ambienceBus = ctx.createGain()
    this.ambienceBus.gain.value = 0.85
    this.ambienceBus.connect(this.master)

    this.sfxBus = ctx.createGain()
    this.sfxBus.gain.value = 0.9
    this.sfxBus.connect(this.master)

    this.presenceBus = ctx.createGain()
    this.presenceBus.gain.value = 0.85
    this.presenceBus.connect(this.master)

    this.uiBus = ctx.createGain()
    this.uiBus.gain.value = 0.8
    this.uiBus.connect(this.master)

    // --- Listener defaults ---
    // Default position 0,0,0 forward -z, up +y (three.js camera convention).
    this.applyListener(0, 0, 0, 0, 0, -1, 0, 1, 0, false)

    // --- Load samples (tolerate failures individually) ---
    try {
      this.samples = await loadSampleBank(ctx)
    } catch (e) {
      // Should be unreachable: loadSampleBank swallows per-file failures,
      // but guard anyway so the engine still functions silently if it fails.
      console.warn('[audio] sample bank load failed:', e)
      this.samples = {
        footstepsCloth: [],
        footstepsLeather: [],
        airvent: null,
        ambientHorror: null,
        atmos: [],
        impacts: [],
        doorOpens: [],
        doorCloses: [],
        creak: null,
        glitches: [],
      }
    }

    const noiseBuf = makeNoiseBuffer(ctx, 2)

    // --- Bring up sublayers ---
    this.hum = new HumLayer(ctx, noiseBuf, this.ambienceBus)
    this.bed = new DreadBed(ctx, this.ambienceBus)
    this.bed.setAirventBuffer(this.samples.airvent, this.ambienceBus)
    // Start dread bed at idle (low) intensity.
    this.bed.setDread(0.1)

    // Slow atmospheric texture cross-cycling underneath everything.
    if (this.samples.atmos.length > 0 || this.samples.ambientHorror) {
      this.startAtmosCycle()
    }

    // Reuse the noise buffer for breath (same low-passed pink-ish character).
    this.foley = new Foley(ctx, this.sfxBus, this.samples.footstepsCloth, noiseBuf)
  }

  /** Per-frame update from the game loop. */
  update(dt: number, state: AudioState): void {
    if (!this.ctx) return

    // Listener pose with smoothing (40 ms target — perceptually instant, no zipper).
    this.applyListener(
      state.px,
      state.py,
      state.pz,
      state.fwdX,
      state.fwdY,
      state.fwdZ,
      state.upX,
      state.upY,
      state.upZ,
      true,
    )

    if (this.hum) this.hum.update(state.px, state.pz, state.fixtures)
    if (this.foley)
      this.foley.update(dt, state.speed, state.moving, state.onGround, state.sprinting, state.crouching)
  }

  /** Director dread dial 0..1 — drives bed, heartbeat rate, and hum detune. */
  setDread(v: number): void {
    this.dread = Math.max(0, Math.min(1, v))
    if (this.bed) this.bed.setDread(this.dread)
    if (this.hum) this.hum.setDreadDetune(this.dread)
    // Atmos texture also rides dread slightly (louder when ripe, but never loud).
    this.currentAtmosTarget = 0.05 + this.dread * 0.07
    if (this.atmosVoiceGain && !this.silenced) {
      this.atmosVoiceGain.gain.setTargetAtTime(this.currentAtmosTarget, this.ctx!.currentTime, 1.5)
    }
  }

  /** Explicit director-driven hum detune in cents (wrongness events). */
  setHumDetune(cents: number): void {
    if (this.hum) this.hum.setDetune(cents)
  }

  /**
   * THE weapon (DESIGN.md §9, psychology brief §3.2).
   * Hard-cut ambience+hum+bed for `seconds`, then creep back over ~4 s.
   * Sfx and UI buses are NOT cut — the player's footfalls and a glitch tone
   * triggered IN the silence should still land.
   */
  silence(seconds: number): void {
    if (!this.ctx) return
    if (this.silenced) return // already in a silence beat; ignore re-trigger
    this.silenced = true

    const ctx = this.ctx
    if (this.hum) this.hum.silence()
    if (this.bed) this.bed.silence(SILENCE_RAMP_S)
    if (this.foley) this.foley.silence(SILENCE_RAMP_S)
    if (this.atmosVoiceGain) {
      this.atmosVoiceGain.gain.cancelScheduledValues(ctx.currentTime)
      this.atmosVoiceGain.gain.setTargetAtTime(0, ctx.currentTime, SILENCE_RAMP_S / 3)
    }
    // Ambience bus itself also drops, belt-and-braces against any voice we missed.
    this.ambienceBus.gain.setTargetAtTime(0, ctx.currentTime, SILENCE_RAMP_S / 3)

    window.setTimeout(() => {
      if (!this.ctx) return
      const restoreSecs = 4.0
      this.ambienceBus.gain.setTargetAtTime(0.85, this.ctx.currentTime, restoreSecs / 3)
      if (this.hum) this.hum.restore(restoreSecs)
      if (this.bed) this.bed.restore(restoreSecs)
      if (this.foley) this.foley.restore(restoreSecs)
      if (this.atmosVoiceGain) {
        this.atmosVoiceGain.gain.setTargetAtTime(
          this.currentAtmosTarget,
          this.ctx.currentTime,
          restoreSecs / 3,
        )
      }
      this.silenced = false
    }, Math.max(0, seconds) * 1000)
  }

  /** HRTF one-shot at a world position. */
  playSpatial(
    name: SpatialName,
    x: number,
    y: number,
    z: number,
    opts?: { gain?: number },
  ): void {
    if (!this.ctx || !this.samples) return
    const buf = this.pickSpatialBuffer(name)
    if (!buf) return
    const ctx = this.ctx

    const src = ctx.createBufferSource()
    src.buffer = buf
    // Subtle per-shot pitch jitter so impacts/doors don't sound identical.
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.04

    const panner = ctx.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = 1.5
    panner.rolloffFactor = 1.4
    panner.maxDistance = 60
    panner.positionX.value = x
    panner.positionY.value = y
    panner.positionZ.value = z

    const vca = ctx.createGain()
    const base = this.spatialBaseGain(name)
    vca.gain.value = base * (opts?.gain ?? 1) * (0.92 + Math.random() * 0.16)

    // Route through the right bus. Glitches go to presence (the entity layer);
    // impacts/doors/creak are world sfx.
    const bus = name === 'glitch' ? this.presenceBus : this.sfxBus
    src.connect(vca).connect(panner).connect(bus)

    const t = ctx.currentTime
    src.start(t)
    src.onended = (): void => {
      try {
        src.disconnect()
        vca.disconnect()
        panner.disconnect()
      } catch {
        /* already disconnected */
      }
    }
    src.stop(t + buf.duration / src.playbackRate.value + 0.05)
  }

  /** Non-spatial UI tone (e.g. tape-glitch flash; menu cue). */
  playUi(name: 'glitch', gain?: number): void {
    if (!this.ctx || !this.samples) return
    const buf = this.samples.glitches[Math.floor(Math.random() * this.samples.glitches.length)]
    if (!buf) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = buf
    const vca = ctx.createGain()
    const base = 0.35
    vca.gain.value = base * (gain ?? 1)
    src.connect(vca).connect(this.uiBus)
    const t = ctx.currentTime
    src.start(t)
    src.onended = (): void => {
      try {
        src.disconnect()
        vca.disconnect()
      } catch {
        /* already disconnected */
      }
    }
    src.stop(t + buf.duration + 0.05)
    void name // silence unused-param check until we add more UI cues
  }

  /** Pick the appropriate buffer for a spatial one-shot. */
  private pickSpatialBuffer(name: SpatialName): AudioBuffer | null {
    if (!this.samples) return null
    const s = this.samples
    const pick = (list: AudioBuffer[]): AudioBuffer | null =>
      list.length === 0 ? null : list[Math.floor(Math.random() * list.length)]
    switch (name) {
      case 'impact':
        return pick(s.impacts)
      case 'doorOpen':
        return pick(s.doorOpens)
      case 'doorClose':
        return pick(s.doorCloses)
      case 'creak':
        return s.creak
      case 'glitch':
        return pick(s.glitches)
    }
  }

  /** Conservative defaults per category — keeps the limiter from ever working hard. */
  private spatialBaseGain(name: SpatialName): number {
    switch (name) {
      case 'impact':
        return 0.55 // Kenney impacts are loud at source
      case 'doorOpen':
      case 'doorClose':
        return 0.55
      case 'creak':
        return 0.5
      case 'glitch':
        return 0.4
    }
  }

  /**
   * Apply listener pose. Uses the modern AudioParam API with smoothing when
   * available; falls back to setPosition/setOrientation on Safari < 14.
   */
  private applyListener(
    x: number,
    y: number,
    z: number,
    fx: number,
    fy: number,
    fz: number,
    ux: number,
    uy: number,
    uz: number,
    smooth: boolean,
  ): void {
    if (!this.ctx) return
    const listener = this.ctx.listener
    const t = this.ctx.currentTime
    if ('positionX' in listener && !this.listenerUsesScalar) {
      const tc = smooth ? 0.04 : 0
      const set = (p: AudioParam, v: number): void => {
        if (tc === 0) p.value = v
        else p.setTargetAtTime(v, t, tc)
      }
      set(listener.positionX, x)
      set(listener.positionY, y)
      set(listener.positionZ, z)
      set(listener.forwardX, fx)
      set(listener.forwardY, fy)
      set(listener.forwardZ, fz)
      set(listener.upX, ux)
      set(listener.upY, uy)
      set(listener.upZ, uz)
    } else {
      // Older API. Browsers shipping this don't support the scalar setters
      // strictly on AudioListener anymore, but the spec leaves them callable.
      type LegacyListener = AudioListener & {
        setPosition?: (x: number, y: number, z: number) => void
        setOrientation?: (
          fx: number,
          fy: number,
          fz: number,
          ux: number,
          uy: number,
          uz: number,
        ) => void
      }
      const legacy = listener as LegacyListener
      this.listenerUsesScalar = true
      legacy.setPosition?.(x, y, z)
      legacy.setOrientation?.(fx, fy, fz, ux, uy, uz)
    }
  }

  /**
   * Atmospheric backdrop: pick a random ambient/atmos buffer, slow-fade it in,
   * play it through, fade-cross to the next pick. Keeps the texture evolving
   * (psychology brief §3.5: static beds habituate within ~90 s).
   */
  private startAtmosCycle(): void {
    const ctx = this.ctx
    if (!ctx || !this.samples) return
    const all: AudioBuffer[] = [...this.samples.atmos]
    if (this.samples.ambientHorror) all.push(this.samples.ambientHorror)
    if (all.length === 0) return

    let lastIdx = -1
    const playNext = (): void => {
      if (!this.ctx || this.silenced) {
        // Re-arm later if silenced; once we restore, the cycle should resume.
        window.setTimeout(playNext, 4000)
        return
      }
      const c = this.ctx
      let idx = Math.floor(Math.random() * all.length)
      if (idx === lastIdx && all.length > 1) idx = (idx + 1) % all.length
      lastIdx = idx
      const buf = all[idx]
      const src = c.createBufferSource()
      src.buffer = buf
      // Slight pitch detune for stable replay-without-deja-vu.
      src.playbackRate.value = 0.95 + Math.random() * 0.1
      const vca = c.createGain()
      vca.gain.value = 0
      src.connect(vca).connect(this.ambienceBus)
      const fadeIn = 4.0
      const fadeOut = 4.0
      const dur = buf.duration / src.playbackRate.value
      const targetTime = c.currentTime
      const target = this.currentAtmosTarget
      vca.gain.linearRampToValueAtTime(target, targetTime + fadeIn)
      vca.gain.setValueAtTime(target, targetTime + Math.max(fadeIn, dur - fadeOut))
      vca.gain.linearRampToValueAtTime(0, targetTime + dur)
      src.start(targetTime)
      src.onended = (): void => {
        try {
          src.disconnect()
          vca.disconnect()
        } catch {
          /* already disconnected */
        }
      }
      // Track the current voice's gain so silence()/dread can adjust it on the fly.
      this.atmosVoiceGain = vca

      // Queue the next pick to start while this one is fading out (overlap = fadeOut).
      const next = Math.max(2, dur - fadeOut)
      window.setTimeout(playNext, next * 1000)
    }
    playNext()
  }
}

export type { HumFixture }
