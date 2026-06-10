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
import { loadSampleBank, makeImpulseResponse, makeNoiseBuffer, type SampleBank } from './samples'

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
  /** Player is standing in/near an openDamp zone — schedules drips. */
  dampNear: boolean
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

  // Reverb send: a synthesized impulse response of a carpet-deadened hall.
  // sfx + presence get a quiet send so one-shots stop sounding pasted-on.
  private reverb: ConvolverNode | null = null
  private noiseBuf: AudioBuffer | null = null

  // Last listener pose — lets scheduled sounds (the silence intruder, drips)
  // place themselves relative to where the player IS, not where they were.
  private lastX = 0
  private lastZ = 0
  private lastFwdX = 0
  private lastFwdZ = -1

  private dripTimer = 5

  // Wow & flutter: the ambience bus runs through a modulated delay. Act 1 the
  // tape is nearly stable; by act 3 the 120 Hz hum audibly bends. (Research:
  // band-limited drift reads as dying hardware; a clean LFO reads as chorus.)
  private wowGain1: GainNode | null = null
  private wowGain2: GainNode | null = null

  /** Timestamp (ctx time) of the last loud player-made noise (sprint steps).
   *  The presence only ever comes because of a sound YOU made. */
  lastNoiseAt = -999

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

    // Ambience runs through a slightly unstable tape path: delay modulated by
    // two incommensurate slow sines (wow) + a 10 Hz jitter (flutter).
    this.ambienceBus = ctx.createGain()
    this.ambienceBus.gain.value = 0.85
    const tapePath = ctx.createDelay(0.1)
    tapePath.delayTime.value = 0.02
    const wow1 = ctx.createOscillator()
    wow1.type = 'sine'
    wow1.frequency.value = 0.31
    this.wowGain1 = ctx.createGain()
    this.wowGain1.gain.value = 0.0006
    wow1.connect(this.wowGain1).connect(tapePath.delayTime)
    const wow2 = ctx.createOscillator()
    wow2.type = 'sine'
    wow2.frequency.value = 0.117
    this.wowGain2 = ctx.createGain()
    this.wowGain2.gain.value = 0.0005
    wow2.connect(this.wowGain2).connect(tapePath.delayTime)
    const flutter = ctx.createOscillator()
    flutter.type = 'sine'
    flutter.frequency.value = 9.7
    const flutterGain = ctx.createGain()
    flutterGain.gain.value = 0.00005
    flutter.connect(flutterGain).connect(tapePath.delayTime)
    wow1.start()
    wow2.start()
    flutter.start()
    this.ambienceBus.connect(tapePath).connect(this.master)

    this.sfxBus = ctx.createGain()
    this.sfxBus.gain.value = 0.9
    this.sfxBus.connect(this.master)

    this.presenceBus = ctx.createGain()
    this.presenceBus.gain.value = 0.85
    this.presenceBus.connect(this.master)

    this.uiBus = ctx.createGain()
    this.uiBus.gain.value = 0.8
    this.uiBus.connect(this.master)

    // --- Reverb send (psychoacoustics: dry one-shots read as UI, wet ones as
    // events IN the space). Carpet kills highs fast, so the IR is short/dark.
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = makeImpulseResponse(ctx, 1.3, 3.2)
    const reverbReturn = ctx.createGain()
    reverbReturn.gain.value = 0.55
    this.reverb.connect(reverbReturn).connect(this.master)
    const sfxSend = ctx.createGain()
    sfxSend.gain.value = 0.14
    this.sfxBus.connect(sfxSend).connect(this.reverb)
    const presenceSend = ctx.createGain()
    presenceSend.gain.value = 0.22
    this.presenceBus.connect(presenceSend).connect(this.reverb)

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
    this.noiseBuf = noiseBuf

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
    this.foley.onStep = (sprinting: boolean): void => {
      if (sprinting) this.lastNoiseAt = ctx.currentTime
      this.stepCallback?.(sprinting)
    }
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
    this.lastX = state.px
    this.lastZ = state.pz
    this.lastFwdX = state.fwdX
    this.lastFwdZ = state.fwdZ

    if (this.hum) this.hum.update(state.px, state.pz, state.fixtures)
    if (this.foley)
      this.foley.update(
        dt,
        state.speed,
        state.moving,
        state.onGround,
        state.sprinting,
        state.crouching,
        this.dread,
      )

    // Ballast ticks: nervous fixtures (seed > 0.8) click occasionally. The
    // sound and the light dip share a personality, so the brain links them.
    if (!this.silenced) {
      for (const f of state.fixtures) {
        if (f.seed <= 0.82) continue
        const dx = f.x - state.px
        const dz = f.z - state.pz
        if (dx * dx + dz * dz > 81) continue // 9 m
        if (Math.random() < dt * 0.05) this.playTick(f.x, 2.7, f.z, 0.5 + Math.random() * 0.5)
      }
    }

    // Drips: only near damp carpet. Sparse — a drip every 5-13 s, never two
    // from the same place. (Where is the water coming from? Don't ask.)
    if (state.dampNear && !this.silenced) {
      this.dripTimer -= dt
      if (this.dripTimer <= 0) {
        this.dripTimer = 5 + Math.random() * 8
        const a = Math.random() * Math.PI * 2
        const d = 3 + Math.random() * 7
        this.playDrip(state.px + Math.cos(a) * d, state.pz + Math.sin(a) * d)
      }
    }
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
    // The tape degrades with the story: wow depth roughly triples by full dread.
    if (this.wowGain1 && this.wowGain2) {
      const t = this.ctx!.currentTime
      const depth = 0.35 + this.dread
      this.wowGain1.gain.setTargetAtTime(0.0006 * depth * 2, t, 2)
      this.wowGain2.gain.setTargetAtTime(0.0005 * depth * 2, t, 2)
    }
  }

  /** Explicit director-driven hum detune in cents (wrongness events). */
  setHumDetune(cents: number): void {
    if (this.hum) this.hum.setDetune(cents)
  }

  /** Spectral narrowing 0..1 — the building swallows the hum's top end. */
  setHumMuffle(v: number): void {
    if (this.hum) this.hum.setMuffle(v)
  }

  /** 18.98 Hz amplitude flutter on the hum, 0..1 (the Tandy frequency). */
  setHumBreath(v: number): void {
    if (this.hum) this.hum.setBreath(v)
  }

  /** Seconds since the player last made a loud noise (sprint footfalls). */
  secondsSinceNoise(): number {
    if (!this.ctx) return Infinity
    return this.ctx.currentTime - this.lastNoiseAt
  }

  /** Foley step callback (director's mimic system listens for the cadence). */
  private stepCallback: ((sprinting: boolean) => void) | null = null
  set onPlayerStep(cb: ((sprinting: boolean) => void) | null) {
    this.stepCallback = cb
  }

  /**
   * One-shot, once per run: an emergency broadcast leaking through a wall
   * cavity the maze never lets you reach. EAS attention tone (853+960 Hz,
   * engineered by Bell Labs to be unignorable) behind mangled FSK chatter,
   * bandpassed to through-the-wall, -30 dB. An outside world tried to warn
   * someone, once.
   */
  playBroadcastLeak(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1100
    bp.Q.value = 0.45
    const master = ctx.createGain()
    master.gain.value = 0.034
    // fixed azimuth, far, unreachable
    const a = Math.random() * Math.PI * 2
    const panner = this.makePanner(this.lastX + Math.sin(a) * 35, 1.8, this.lastZ + Math.cos(a) * 35, 60)
    bp.connect(master).connect(panner).connect(this.presenceBus)

    // 1.2 s of broken SAME-style FSK chatter
    const sq = ctx.createOscillator()
    sq.type = 'square'
    for (let i = 0; i < 24; i++) {
      sq.frequency.setValueAtTime(i % 2 === 0 ? 1562 : 2083, t0 + i * 0.05)
    }
    const sqGain = ctx.createGain()
    sqGain.gain.setValueAtTime(0, t0)
    for (let i = 0; i < 12; i++) {
      // dropouts: chatter cuts in and out
      sqGain.gain.setValueAtTime(Math.random() < 0.7 ? 0.5 : 0, t0 + i * 0.1)
    }
    sqGain.gain.setValueAtTime(0, t0 + 1.2)
    sq.connect(sqGain).connect(bp)
    sq.start(t0)
    sq.stop(t0 + 1.25)

    // the two-tone, 8 s, fading like a battery dying
    const mk = (freq: number): void => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t0 + 1.4)
      g.gain.linearRampToValueAtTime(0.5, t0 + 1.7)
      g.gain.setValueAtTime(0.5, t0 + 6.5)
      g.gain.linearRampToValueAtTime(0, t0 + 9.4)
      osc.connect(g).connect(bp)
      osc.start(t0 + 1.4)
      osc.stop(t0 + 9.5)
      this.cleanup(osc, [g], t0 + 9.6)
    }
    mk(853)
    mk(960)
    this.cleanup(sq, [sqGain, bp, master, panner], t0 + 10)
  }

  /**
   * The other footsteps (note 1: "they keep going"). Leather, pitched low,
   * darker lowpass than the player's own cloth steps — same gait, wrong shoes.
   */
  playMimicStep(x: number, z: number, gain = 1): void {
    if (!this.ctx || !this.samples) return
    const list = this.samples.footstepsLeather.length
      ? this.samples.footstepsLeather
      : this.samples.footstepsCloth
    if (list.length === 0) return
    const ctx = this.ctx
    const buf = list[Math.floor(Math.random() * list.length)]
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = 0.78 * (1 + (Math.random() * 2 - 1) * 0.06)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 750 // heard through walls and carpet
    const panner = this.makePanner(x, 0.15, z, 40)
    const vca = ctx.createGain()
    vca.gain.value = 0.5 * gain * (0.9 + Math.random() * 0.2)
    src.connect(lp).connect(vca).connect(panner).connect(this.presenceBus)
    const t = ctx.currentTime
    src.start(t)
    this.cleanup(src, [lp, vca, panner], t + buf.duration / src.playbackRate.value + 0.05)
  }

  /** Tiny ballast/ceiling tick: a click with no business being organic. */
  playTick(x: number, y: number, z: number, gain = 1): void {
    if (!this.ctx || !this.noiseBuf) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.playbackRate.value = 1.6 + Math.random() * 0.8
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1800
    const vca = ctx.createGain()
    const t = ctx.currentTime
    vca.gain.setValueAtTime(0, t)
    vca.gain.linearRampToValueAtTime(0.09 * gain, t + 0.004)
    vca.gain.setTargetAtTime(0, t + 0.006, 0.01)
    const panner = this.makePanner(x, y, z, 25)
    src.connect(hp).connect(vca).connect(panner).connect(this.sfxBus)
    src.start(t)
    src.stop(t + 0.12)
    this.cleanup(src, [hp, vca, panner], t + 0.15)
  }

  /** Water (it is not water) hitting wet carpet: pitch-dropping sine blip. */
  playDrip(x: number, z: number): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    const t = ctx.currentTime
    const f0 = 1100 + Math.random() * 500
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.045)
    const vca = ctx.createGain()
    vca.gain.setValueAtTime(0, t)
    vca.gain.linearRampToValueAtTime(0.10 + Math.random() * 0.05, t + 0.006)
    vca.gain.setTargetAtTime(0, t + 0.012, 0.025)
    const panner = this.makePanner(x, 0.05, z, 30)
    osc.connect(vca).connect(panner).connect(this.sfxBus)
    osc.start(t)
    osc.stop(t + 0.25)
    this.cleanup(osc, [vca, panner], t + 0.3)
  }

  /**
   * A wet exhale at the edge of HRTF resolution (DESIGN.md §7). Bandpassed
   * noise sweeping down, with a slow tremble — lungs, but the wrong size.
   */
  playExhale(x: number, y: number, z: number, gain = 1): void {
    if (!this.ctx || !this.noiseBuf) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    src.playbackRate.value = 0.6
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.4
    const t = ctx.currentTime
    bp.frequency.setValueAtTime(420, t)
    bp.frequency.exponentialRampToValueAtTime(130, t + 1.6)
    const vca = ctx.createGain()
    vca.gain.setValueAtTime(0, t)
    vca.gain.linearRampToValueAtTime(0.16 * gain, t + 0.35)
    vca.gain.setValueAtTime(0.16 * gain, t + 0.9)
    vca.gain.linearRampToValueAtTime(0, t + 1.8)
    const panner = this.makePanner(x, y, z, 30)
    src.connect(bp).connect(vca).connect(panner).connect(this.presenceBus)
    src.start(t)
    src.stop(t + 2)
    this.cleanup(src, [bp, vca, panner], t + 2.1)
  }

  /** Almond water going down. Two soft gulps, then quiet. */
  playSwallow(): void {
    if (!this.ctx || !this.noiseBuf) return
    const ctx = this.ctx
    for (const dt0 of [0, 0.42]) {
      const t = ctx.currentTime + dt0
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(210, t)
      osc.frequency.exponentialRampToValueAtTime(95, t + 0.1)
      const vca = ctx.createGain()
      vca.gain.setValueAtTime(0, t)
      vca.gain.linearRampToValueAtTime(0.12, t + 0.03)
      vca.gain.setTargetAtTime(0, t + 0.06, 0.04)
      osc.connect(vca).connect(this.uiBus)
      osc.start(t)
      osc.stop(t + 0.3)
      this.cleanup(osc, [vca], t + 0.35)
    }
  }

  private makePanner(x: number, y: number, z: number, maxDistance: number): PannerNode {
    const panner = this.ctx!.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = 1.5
    panner.rolloffFactor = 1.4
    panner.maxDistance = maxDistance
    panner.positionX.value = x
    panner.positionY.value = y
    panner.positionZ.value = z
    return panner
  }

  private cleanup(src: AudioScheduledSourceNode, nodes: AudioNode[], stopAt: number): void {
    src.onended = (): void => {
      try {
        src.disconnect()
        for (const n of nodes) n.disconnect()
      } catch {
        /* already disconnected */
      }
    }
    void stopAt
  }

  /**
   * THE weapon (DESIGN.md §9, psychology brief §3.2).
   * Hard-cut ambience+hum+bed for `seconds`, then creep back over ~4 s.
   * Sfx and UI buses are NOT cut — the player's footfalls and a glitch tone
   * triggered IN the silence should still land.
   */
  silence(seconds: number, intruder?: 'creak' | 'exhale'): void {
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

    // The intruder: one sound dropped INTO the vacuum, mid-silence. The sfx
    // and presence buses stay live precisely so this can land. Escalation is
    // the director's call: a far creak the first time; the second time, a wet
    // exhale half a meter behind the player's shoulder (misophonia research:
    // a too-close mouth sound out-scares any render).
    if (intruder && seconds >= 6) {
      window.setTimeout(() => {
        if (!this.ctx) return
        if (intruder === 'creak') {
          const a = Math.atan2(-this.lastFwdX, -this.lastFwdZ) + (Math.random() - 0.5) * 1.2
          const d = 5 + Math.random() * 4
          this.playSpatial('creak', this.lastX + Math.sin(a) * d, 1.1, this.lastZ + Math.cos(a) * d, {
            gain: 0.12,
          })
        } else {
          const side = Math.random() < 0.5 ? 1 : -1
          // behind-left or behind-right of the head, conversationally close
          const bx = this.lastX - this.lastFwdX * 0.55 + this.lastFwdZ * 0.35 * side
          const bz = this.lastZ - this.lastFwdZ * 0.55 - this.lastFwdX * 0.35 * side
          this.playExhale(bx, 1.55, bz, 0.55)
        }
      }, seconds * 0.55 * 1000)
    }

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
