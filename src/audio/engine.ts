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
  /** Anomalous wing under the player's feet (null = plain Level 0). */
  zone: 'pool' | 'playground' | 'garage' | 'flooded' | 'office' | null
  /** Feet in standing water — wading foley, and the water eats your noise. */
  inWater: boolean
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
  // F2 (the reverb lie): a second, longer/brighter IR for hard-surfaced
  // zones; the returns crossfade so the EAR learns the room changed first.
  private reverb: ConvolverNode | null = null
  private reverbReturnA: GainNode | null = null
  private reverbReturnB: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null

  // Spec C secondary: the floor under the silence. Runs only while the
  // tape is paused DURING a silence event. Routed to presence — silence()
  // never touches it, because it is not part of the world's sound.
  private respGain: GainNode | null = null
  private tapePaused = false

  // Spec H: optional microphone. RMS with slow noise-floor calibration.
  private micAnalyser: AnalyserNode | null = null
  private micData: Float32Array<ArrayBuffer> | null = null
  private micFloor = 0.01
  private micCalibrationT = 0
  /** 0..1 — how far above the calibrated floor the room is right now. */
  micLevel = 0
  /** Set true for one frame on a big spike (gasp/shout). Consumer clears. */
  micSpike = false
  private micSpikeArmed = true

  // Last listener pose — lets scheduled sounds (the silence intruder, drips)
  // place themselves relative to where the player IS, not where they were.
  private lastX = 0
  private lastZ = 0
  private lastFwdX = 0
  private lastFwdZ = -1

  private dripTimer = 5

  // Poolrooms: lapping-water bed (fades in over the threshold), plus the
  // signature scare — a distant splash with no visible source, 50-160 s apart.
  private lapGain: GainNode | null = null
  private lapLfoDepths: GainNode[] = []
  private splashTimer = 40
  // Garage: a metal door slams somewhere it shouldn't, every 45-110 s.
  private slamTimer = 30

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
    this.reverbReturnA = ctx.createGain()
    this.reverbReturnA.gain.value = 0.55
    this.reverb.connect(this.reverbReturnA).connect(this.master)
    // F2: the second room. Longer, less damped — tile and concrete don't
    // forgive sound the way carpet does. Crossfaded by zone in update().
    const reverbB = ctx.createConvolver()
    reverbB.buffer = makeImpulseResponse(ctx, 2.6, 1.7)
    this.reverbReturnB = ctx.createGain()
    this.reverbReturnB.gain.value = 0
    reverbB.connect(this.reverbReturnB).connect(this.master)
    const sfxSend = ctx.createGain()
    sfxSend.gain.value = 0.14
    this.sfxBus.connect(sfxSend)
    sfxSend.connect(this.reverb)
    sfxSend.connect(reverbB)
    const presenceSend = ctx.createGain()
    presenceSend.gain.value = 0.22
    this.presenceBus.connect(presenceSend)
    presenceSend.connect(this.reverb)
    presenceSend.connect(reverbB)

    // Spec C secondary — the respiration floor. A slow tidal swell of dark
    // noise, far below the noise gate. The silence has a floor. Pausing the
    // tape pauses the world's sounds, but not this.
    const respSrc = ctx.createBufferSource()
    respSrc.buffer = makeNoiseBuffer(ctx, 2)
    respSrc.loop = true
    respSrc.playbackRate.value = 0.5
    const respBp = ctx.createBiquadFilter()
    respBp.type = 'bandpass'
    respBp.frequency.value = 240
    respBp.Q.value = 0.7
    const respLfo = ctx.createOscillator()
    respLfo.frequency.value = 0.16 // ~10 breaths/min. large lungs. asleep.
    const respDepth = ctx.createGain()
    respDepth.gain.value = 0.5
    const respVca = ctx.createGain()
    respVca.gain.value = 0.5
    respLfo.connect(respDepth).connect(respVca.gain)
    this.respGain = ctx.createGain()
    this.respGain.gain.value = 0
    respSrc.connect(respBp).connect(respVca).connect(this.respGain).connect(this.presenceBus)
    respSrc.start()
    respLfo.start()

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
        phoneClick: null,
        phoneDead: null,
        drips: [],
        splash: null,
        wade: null,
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

    // Lapping water: looped noise pushed through a low bandpass, gain riding
    // two incommensurate slow LFOs. Silent until the player crosses into
    // the poolrooms; the hum thins there on its own (fewer fixtures).
    const lapSrc = ctx.createBufferSource()
    lapSrc.buffer = noiseBuf
    lapSrc.loop = true
    lapSrc.playbackRate.value = 0.4
    const lapBp = ctx.createBiquadFilter()
    lapBp.type = 'bandpass'
    lapBp.frequency.value = 240
    lapBp.Q.value = 0.6
    this.lapGain = ctx.createGain()
    this.lapGain.gain.value = 0
    const lapDepth1 = ctx.createGain()
    lapDepth1.gain.value = 0
    const lapLfo1 = ctx.createOscillator()
    lapLfo1.frequency.value = 0.13
    lapLfo1.connect(lapDepth1)
    const lapDepth2 = ctx.createGain()
    lapDepth2.gain.value = 0
    const lapLfo2 = ctx.createOscillator()
    lapLfo2.frequency.value = 0.071
    lapLfo2.connect(lapDepth2)
    const lapVca = ctx.createGain()
    lapVca.gain.value = 1
    lapDepth1.connect(lapVca.gain)
    lapDepth2.connect(lapVca.gain)
    lapSrc.connect(lapBp).connect(lapVca).connect(this.lapGain).connect(this.ambienceBus)
    lapSrc.start()
    lapLfo1.start()
    lapLfo2.start()
    this.lapLfoDepths = [lapDepth1, lapDepth2]

    // Reuse the noise buffer for breath (same low-passed pink-ish character).
    this.foley = new Foley(ctx, this.sfxBus, this.samples.footstepsCloth, noiseBuf)
    this.foley.wadeBuffer = this.samples.wade
    this.foley.onStep = (sprinting: boolean): void => {
      // Wading kills your loudness debt — the water hears you so the
      // building can't. The stalking presence loses you here (Spec G2).
      if (sprinting && this.foley?.surface !== 'water') this.lastNoiseAt = ctx.currentTime
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

    // Drips: near damp carpet, and constantly (faster) in the poolrooms.
    // Sparse — never two from the same place. (Where is the water coming
    // from? Don't ask.)
    const inPool = state.zone === 'pool'
    const inFlood = state.zone === 'flooded'
    if ((state.dampNear || inPool || inFlood) && !this.silenced) {
      this.dripTimer -= dt
      if (this.dripTimer <= 0) {
        this.dripTimer = inPool || inFlood ? 3 + Math.random() * 6 : 5 + Math.random() * 8
        const a = Math.random() * Math.PI * 2
        const d = 3 + Math.random() * 7
        this.playDrip(state.px + Math.cos(a) * d, state.pz + Math.sin(a) * d)
      }
    }

    // Zone character: footstep surface, the lapping bed, the schedulers.
    if (this.foley) {
      this.foley.surface = state.inWater
        ? 'water'
        : state.zone === 'pool'
          ? 'tile'
          : state.zone === 'garage'
            ? 'concrete'
            : 'carpet'
    }

    // F2 — the reverb lie: hard-surfaced zones get the longer, brighter
    // room. The crossfade starts the moment the zone changes under your
    // feet — the ear learns the ceiling moved before the eye does.
    if (this.reverbReturnA && this.reverbReturnB) {
      const hard = state.zone === 'pool' || state.zone === 'garage' || state.zone === 'flooded'
      const t = this.ctx.currentTime
      this.reverbReturnA.gain.setTargetAtTime(hard ? 0.12 : 0.55, t, 0.8)
      this.reverbReturnB.gain.setTargetAtTime(hard ? 0.6 : 0, t, 0.8)
    }

    // Spec C secondary: the respiration floor surfaces only while the tape
    // is paused inside a SILENCE event (or when a script forces it).
    if (this.respGain) {
      const audible = this.respForced || (this.tapePaused && this.silenced)
      this.respGain.gain.setTargetAtTime(audible ? 0.045 : 0, this.ctx.currentTime, audible ? 1.2 : 0.15)
    }

    this.updateMic(dt)
    if (this.lapGain) {
      const t = this.ctx.currentTime
      const target = !this.silenced ? (inPool ? 0.16 : inFlood ? 0.09 : 0) : 0
      this.lapGain.gain.setTargetAtTime(target, t, 1.4)
      for (const d of this.lapLfoDepths) d.gain.setTargetAtTime(target > 0 ? 0.35 : 0, t, 1.4)
    }
    if (inPool && !this.silenced) {
      this.splashTimer -= dt
      if (this.splashTimer <= 0) {
        this.splashTimer = 50 + Math.random() * 110
        const a = Math.random() * Math.PI * 2
        const d = 14 + Math.random() * 14
        this.playSplash(state.px + Math.cos(a) * d, state.pz + Math.sin(a) * d)
      }
    }
    if (state.zone === 'garage' && !this.silenced) {
      this.slamTimer -= dt
      if (this.slamTimer <= 0) {
        this.slamTimer = 45 + Math.random() * 65
        const a = Math.random() * Math.PI * 2
        const d = 26 + Math.random() * 22
        this.playSpatial('doorClose', state.px + Math.cos(a) * d, 1.2, state.pz + Math.sin(a) * d, {
          gain: 0.45,
        })
      }
    }
  }

  /** The poolrooms' signature scare: a splash with no swimmer. */
  playSplash(x: number, z: number): void {
    if (!this.ctx || !this.noiseBuf) return
    // the sampled splash, when we have it — something real went under
    if (this.samples?.splash) {
      this.playBufferAt(this.samples.splash, x, 0, z, 0.5, 50, 0.96 + Math.random() * 0.08)
      for (const dt0 of [0.6, 1.0, 1.5]) {
        window.setTimeout(
          () => this.playDrip(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2),
          dt0 * 1000,
        )
      }
      return
    }
    const ctx = this.ctx
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.playbackRate.value = 0.9
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 0.8
    bp.frequency.setValueAtTime(900, t)
    bp.frequency.exponentialRampToValueAtTime(280, t + 0.4)
    const vca = ctx.createGain()
    vca.gain.setValueAtTime(0, t)
    vca.gain.linearRampToValueAtTime(0.5, t + 0.025)
    vca.gain.setTargetAtTime(0, t + 0.06, 0.12)
    const panner = this.makePanner(x, 0.0, z, 50)
    src.connect(bp).connect(vca).connect(panner).connect(this.presenceBus)
    src.start(t)
    src.stop(t + 0.8)
    this.cleanup(src, [bp, vca, panner], t + 0.9)
    // the after-drips of whatever went under
    for (const dt0 of [0.5, 0.9, 1.4]) {
      window.setTimeout(
        () => this.playDrip(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2),
        dt0 * 1000,
      )
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

  /** Looming telegraph on the sub pad (see DreadBed.loom). */
  loom(rampS?: number, holdS?: number, recedeS?: number): void {
    this.bed?.loom(rampS, holdS, recedeS)
  }

  /** D12 — entrainment break: heartbeat locks to the player's gait. */
  lockHeartbeat(stepIntervalS: number, seconds = 30): void {
    this.bed?.lockToCadence(stepIntervalS, seconds)
  }

  /** Spec H — every fixture hum dips 3 dB for 2 s. The level heard you. */
  dipHums(seconds = 2): void {
    this.hum?.dipAll(seconds)
  }

  /** D1 — a clicked-off fixture stops humming too. */
  killFixtureHum(x: number, z: number, seconds: number): void {
    this.hum?.killFixture(x, z, seconds)
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

  /** Water (it is not water) hitting wet carpet: pitch-dropping sine blip.
   *  When the sampled drips are loaded, most drips are real — the synth
   *  blip stays in rotation so the ear can never quite file the sound. */
  playDrip(x: number, z: number): void {
    if (!this.ctx) return
    const drips = this.samples?.drips
    if (drips && drips.length > 0 && Math.random() < 0.65) {
      const buf = drips[Math.floor(Math.random() * drips.length)]
      this.playBufferAt(buf, x, 0.05, z, 0.16 + Math.random() * 0.08, 30, 0.9 + Math.random() * 0.2)
      return
    }
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

  /**
   * A desk phone, off the hook, dial tone running (350+440 Hz — the 2002 US
   * precise tone). Returns a handle: hangUp() cuts to the dead-line click.
   * Someone left in the middle of a call. The phone never stopped waiting.
   */
  startDialTone(x: number, y: number, z: number): { hangUp: () => void } | null {
    if (!this.ctx) return null
    const ctx = this.ctx
    const t = ctx.currentTime
    const vca = ctx.createGain()
    vca.gain.setValueAtTime(0, t)
    vca.gain.setTargetAtTime(0.05, t, 0.4)
    const panner = this.makePanner(x, y, z, 22)
    const oscs: OscillatorNode[] = []
    for (const f of [350, 440]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      o.connect(vca)
      o.start(t)
      oscs.push(o)
    }
    vca.connect(panner).connect(this.sfxBus)
    let done = false
    return {
      hangUp: (): void => {
        if (done || !this.ctx) return
        done = true
        const tt = this.ctx.currentTime
        // the line notices you: dial tone stops, one click, then nothing
        vca.gain.cancelScheduledValues(tt)
        vca.gain.setValueAtTime(vca.gain.value, tt)
        vca.gain.linearRampToValueAtTime(0, tt + 0.06)
        this.playPhoneClick(x, y, z)
        for (const o of oscs) o.stop(tt + 0.1)
        window.setTimeout(() => {
          try {
            vca.disconnect()
            panner.disconnect()
          } catch {
            /* gone */
          }
        }, 300)
      },
    }
  }

  /**
   * The descent (ending only): a barely-audible descending Shepard stack —
   * six octave-spaced sines under a raised-cosine loudness window, all
   * gliding down and wrapping. A floor that never stops falling. No key,
   * no melody; the no-music pillar survives on a technicality.
   */
  startShepardDescent(seconds: number): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const N = 6
    const FMIN = 40
    const FMAX = FMIN * Math.pow(2, N) // 2560 Hz
    const master = ctx.createGain()
    master.gain.value = 0
    master.gain.setTargetAtTime(0.05, ctx.currentTime, 2)
    // presence bus: survives the ending's silence() cut of the ambience bus
    master.connect(this.presenceBus)
    const oscs: { o: OscillatorNode; g: GainNode; f: number }[] = []
    for (let i = 0; i < N; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      const g = ctx.createGain()
      o.connect(g).connect(master)
      const f = FMIN * Math.pow(2, i + 0.5)
      o.frequency.value = f
      o.start()
      oscs.push({ o, g, f })
    }
    const tick = window.setInterval(() => {
      if (!this.ctx) return
      const t = this.ctx.currentTime
      for (const v of oscs) {
        v.f *= 0.9972 // ~ -1 octave / 40 s
        if (v.f < FMIN) v.f *= Math.pow(2, N)
        // raised-cosine window over log-frequency position
        const pos = Math.log(v.f / FMIN) / Math.log(FMAX / FMIN)
        const w = 0.5 - 0.5 * Math.cos(Math.PI * 2 * pos)
        v.o.frequency.setTargetAtTime(v.f, t, 0.06)
        v.g.gain.setTargetAtTime(w * w * 0.3, t, 0.06)
      }
    }, 50)
    window.setTimeout(() => {
      window.clearInterval(tick)
      if (!this.ctx) return
      master.gain.setTargetAtTime(0, this.ctx.currentTime, 1.5)
      window.setTimeout(() => {
        for (const v of oscs) {
          try {
            v.o.stop()
          } catch {
            /* stopped */
          }
        }
        master.disconnect()
      }, 6000)
    }, seconds * 1000)
  }

  private respForced = false

  /** Script hook (Tape 2 Manila variant): force the respiration floor. */
  forceRespiration(on: boolean): void {
    this.respForced = on
  }

  /** Narrative tells us when the tape is "paused" (held Q). */
  setTapePaused(v: boolean): void {
    this.tapePaused = v
  }

  get isSilenced(): boolean {
    return this.silenced
  }

  /**
   * F1 — slow-notch silence. The hum bed loses ~0.5 dB every 4 s for 90 s,
   * then gates fully. The player must not be able to say when the sound
   * left — only that it is gone. Restore happens in ONE frame.
   */
  slowSilence(fadeSeconds = 90, holdSeconds = 14): void {
    if (!this.ctx || this.silenced) return
    this.silenced = true
    const ctx = this.ctx
    const t = ctx.currentTime
    // stepped attenuation reads as nothing happening, 22 times in a row
    const steps = Math.floor(fadeSeconds / 4)
    this.ambienceBus.gain.cancelScheduledValues(t)
    this.ambienceBus.gain.setValueAtTime(this.ambienceBus.gain.value, t)
    for (let i = 1; i <= steps; i++) {
      this.ambienceBus.gain.setValueAtTime(0.85 * Math.pow(10, (-0.5 * i) / 20), t + i * 4)
    }
    this.ambienceBus.gain.setValueAtTime(0.0001, t + fadeSeconds)
    window.setTimeout(() => {
      if (!this.ctx) return
      // ONE frame: the hum is simply back, as if it never left
      this.ambienceBus.gain.cancelScheduledValues(this.ctx.currentTime)
      this.ambienceBus.gain.setValueAtTime(0.85, this.ctx.currentTime)
      this.silenced = false
    }, (fadeSeconds + holdSeconds) * 1000)
  }

  /**
   * F3 — formant hum. Two vowel-shaped bandpasses sweep across the
   * ambience bus at −18 dB for 8–12 s. Sub-threshold EVP: never
   * intelligible, never repeated identically.
   */
  formantSweep(): void {
    if (!this.ctx || this.silenced) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const dur = 8 + Math.random() * 4
    const out = ctx.createGain()
    out.gain.setValueAtTime(0, t)
    out.gain.linearRampToValueAtTime(0.12, t + dur * 0.3) // ≈ −18 dB rel
    out.gain.linearRampToValueAtTime(0, t + dur)
    out.connect(this.master)
    const mk = (f0: number, f1: number): BiquadFilterNode => {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.Q.value = 7
      bp.frequency.setValueAtTime(f0 * (0.92 + Math.random() * 0.16), t)
      bp.frequency.exponentialRampToValueAtTime(f1 * (0.92 + Math.random() * 0.16), t + dur)
      this.ambienceBus.connect(bp)
      bp.connect(out)
      return bp
    }
    const a = mk(700, 300)
    const b = mk(1200, 2300)
    window.setTimeout(() => {
      try {
        a.disconnect()
        b.disconnect()
        out.disconnect()
      } catch {
        /* gone */
      }
    }, (dur + 0.5) * 1000)
  }

  /** D2 — Echo +1: the player's own step again, slightly late, behind. */
  playEchoStep(x: number, z: number, gain = 0.3): void {
    if (!this.ctx || !this.samples) return
    const list = this.samples.footstepsCloth
    if (list.length === 0) return
    const ctx = this.ctx
    const buf = list[Math.floor(Math.random() * list.length)]
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = 0.85 * (1 + (Math.random() * 2 - 1) * 0.05)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1100 // your own shoes, heard from the wrong room
    const panner = this.makePanner(x, 0.1, z, 30)
    const vca = ctx.createGain()
    vca.gain.value = gain
    src.connect(lp).connect(vca).connect(panner).connect(this.presenceBus)
    const t = ctx.currentTime
    src.start(t)
    this.cleanup(src, [lp, vca, panner], t + buf.duration + 0.1)
  }

  /**
   * D5 — a 2002 office phone, ringing. 440+480 Hz, 2 s on / 4 s off —
   * the exact Bell cadence. Returns a handle to stop it (forever).
   */
  startPhoneRing(x: number, y: number, z: number): { stop: () => void } | null {
    if (!this.ctx) return null
    const ctx = this.ctx
    const vca = ctx.createGain()
    vca.gain.value = 0
    const panner = this.makePanner(x, y, z, 45)
    const oscs: OscillatorNode[] = []
    for (const f of [440, 480]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      // bell warble: 20 Hz tremolo makes sines read as a ringer
      o.connect(vca)
      o.start()
      oscs.push(o)
    }
    const trem = ctx.createOscillator()
    trem.frequency.value = 20
    const tremDepth = ctx.createGain()
    tremDepth.gain.value = 0.5
    trem.connect(tremDepth).connect(vca.gain)
    trem.start()
    const out = ctx.createGain()
    out.gain.value = 0.16
    vca.connect(out).connect(panner).connect(this.sfxBus)
    let alive = true
    const cycle = (): void => {
      if (!alive || !this.ctx) return
      const t = this.ctx.currentTime
      vca.gain.cancelScheduledValues(t)
      vca.gain.setValueAtTime(0.5, t)
      vca.gain.setValueAtTime(0, t + 2)
      window.setTimeout(cycle, 6000)
    }
    cycle()
    return {
      stop: (): void => {
        if (!alive || !this.ctx) return
        alive = false
        const t = this.ctx.currentTime
        vca.gain.cancelScheduledValues(t)
        vca.gain.setTargetAtTime(0, t, 0.04)
        window.setTimeout(() => {
          try {
            for (const o of oscs) o.stop()
            trem.stop()
            vca.disconnect()
            out.disconnect()
            panner.disconnect()
          } catch {
            /* gone */
          }
        }, 400)
      },
    }
  }

  /**
   * D5 answer: line static, then the room's own fluorescent hum played
   * back down the line, one second late. Then the click. It never rings
   * again, and you will think about the delay for the rest of the run.
   */
  playPhoneAnswer(x: number, y: number, z: number): void {
    if (!this.ctx || !this.noiseBuf) return
    this.playPhoneClick(x, y, z, 0.45) // the receiver, lifted
    const ctx = this.ctx
    const t = ctx.currentTime
    // telephone band: 300–3400 Hz
    const tel = ctx.createBiquadFilter()
    tel.type = 'bandpass'
    tel.frequency.value = 1100
    tel.Q.value = 0.35
    const out = ctx.createGain()
    out.gain.value = 0.14
    const panner = this.makePanner(x, y, z, 12)
    tel.connect(out).connect(panner).connect(this.sfxBus)
    // 1.4 s of line static
    const stat = ctx.createBufferSource()
    stat.buffer = this.noiseBuf
    stat.loop = true
    const statG = ctx.createGain()
    statG.gain.setValueAtTime(0.4, t)
    statG.gain.setValueAtTime(0.07, t + 1.4)
    stat.connect(statG).connect(tel)
    stat.start(t)
    stat.stop(t + 5.6)
    // ...then the hum. THIS room's hum. One second of delay on the line.
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = [120, 240, 360][i]
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.setValueAtTime([0.5, 0.25, 0.1][i], t + 2.4) // dial-delay: 1 s after static settles
      g.gain.setValueAtTime(0, t + 5.2)
      o.connect(g).connect(tel)
      o.start(t)
      o.stop(t + 5.3)
      this.cleanup(o, [g], t + 5.4)
    }
    // the far end hangs up first
    window.setTimeout(() => this.playPhoneClick(x, y, z, 0.55), 5300)
    this.cleanup(stat, [statG, tel, out, panner], t + 6)
  }

  /**
   * Tape 2 payoff — D.'s camcorder, ingested by your own tape. ~6 s,
   * non-spatial (it plays through the HUD, not the room): damp-carpet
   * steps, his breathing, the hum cutting to one second of the Manila
   * Room's softened purr, then the battery death click. Never more.
   */
  playDeadCamcorder(onDone?: () => void): void {
    if (!this.ctx || !this.samples || !this.noiseBuf) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const out = ctx.createGain()
    out.gain.value = 0.5
    // through-the-tape band
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 900
    band.Q.value = 0.3
    band.connect(out).connect(this.uiBus)
    // his steps — cloth, damp, unhurried; six of them
    const steps = this.samples.footstepsCloth
    for (let i = 0; i < 6; i++) {
      const at = t0 + 0.4 + i * 0.62
      if (steps.length > 0) {
        const src = ctx.createBufferSource()
        src.buffer = steps[i % steps.length]
        src.playbackRate.value = 0.8
        const g = ctx.createGain()
        g.gain.value = 0.5
        src.connect(g).connect(band)
        src.start(at)
        this.cleanup(src, [g], at + 1)
      }
    }
    // his breathing
    const br = ctx.createBufferSource()
    br.buffer = this.noiseBuf
    br.loop = true
    br.playbackRate.value = 0.55
    const brBp = ctx.createBiquadFilter()
    brBp.type = 'bandpass'
    brBp.frequency.value = 500
    brBp.Q.value = 0.9
    const brG = ctx.createGain()
    brG.gain.setValueAtTime(0, t0)
    for (let i = 0; i < 4; i++) {
      brG.gain.linearRampToValueAtTime(0.16, t0 + 0.6 + i * 1.1)
      brG.gain.linearRampToValueAtTime(0.03, t0 + 1.15 + i * 1.1)
    }
    br.connect(brBp).connect(brG).connect(band)
    br.start(t0)
    br.stop(t0 + 4.6)
    this.cleanup(br, [brBp, brG], t0 + 4.7)
    // the hum — then ONE second of the Manila purr (muffled, kind), then
    const humO = ctx.createOscillator()
    humO.type = 'sine'
    humO.frequency.value = 120
    const humG = ctx.createGain()
    humG.gain.setValueAtTime(0.3, t0)
    humG.gain.setValueAtTime(0.3, t0 + 4.4)
    humG.gain.linearRampToValueAtTime(0.12, t0 + 4.55) // the purr: softer, lower
    const humLp = ctx.createBiquadFilter()
    humLp.type = 'lowpass'
    humLp.frequency.setValueAtTime(1200, t0)
    humLp.frequency.setValueAtTime(320, t0 + 4.45)
    humO.connect(humG).connect(humLp).connect(band)
    humO.start(t0)
    humO.stop(t0 + 5.6)
    this.cleanup(humO, [humG, humLp], t0 + 5.7)
    // battery death: one click, then nothing at all
    window.setTimeout(() => {
      if (!this.ctx) return
      this.playUi('glitch', 0.18)
      onDone?.()
    }, 5800)
    window.setTimeout(() => {
      try {
        band.disconnect()
        out.disconnect()
      } catch {
        /* gone */
      }
    }, 6500)
  }

  /**
   * Spec H — microphone opt-in. getUserMedia → AnalyserNode → RMS with a
   * slow noise-floor calibration. NO audio is recorded, transmitted, or
   * stored — the graph ends at the analyser; nothing connects onward.
   */
  async enableMic(): Promise<boolean> {
    if (!this.ctx) return false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false },
      })
      const src = this.ctx.createMediaStreamSource(stream)
      this.micAnalyser = this.ctx.createAnalyser()
      this.micAnalyser.fftSize = 1024
      src.connect(this.micAnalyser) // terminal node — analysis only
      this.micData = new Float32Array(this.micAnalyser.fftSize)
      this.micCalibrationT = 0
      return true
    } catch {
      return false // denied or unavailable: silent degrade
    }
  }

  private updateMic(dt: number): void {
    if (!this.micAnalyser || !this.micData) return
    this.micAnalyser.getFloatTimeDomainData(this.micData)
    let sum = 0
    for (let i = 0; i < this.micData.length; i++) sum += this.micData[i] * this.micData[i]
    const rms = Math.sqrt(sum / this.micData.length)
    // first 30 s: learn the room. after: floor only creeps DOWN-slowly/UP-never-fast
    this.micCalibrationT += dt
    if (this.micCalibrationT < 30) {
      this.micFloor += (rms - this.micFloor) * Math.min(1, dt * 0.5)
    } else {
      this.micFloor += (Math.min(rms, this.micFloor) - this.micFloor) * Math.min(1, dt * 0.02)
    }
    const over = Math.max(0, rms - Math.max(this.micFloor * 1.8, 0.004))
    this.micLevel = Math.min(1, over / 0.1)
    if (this.micCalibrationT > 30 && rms > Math.max(this.micFloor * 8, 0.09)) {
      if (this.micSpikeArmed) {
        this.micSpike = true
        this.micSpikeArmed = false
      }
    } else if (rms < this.micFloor * 3) {
      this.micSpikeArmed = true
    }
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

  /** Play a decoded buffer at a world position (one-shot, sfx bus). */
  private playBufferAt(
    buf: AudioBuffer,
    x: number,
    y: number,
    z: number,
    gain: number,
    maxDist = 25,
    rate = 1,
  ): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const vca = ctx.createGain()
    vca.gain.value = gain
    const panner = this.makePanner(x, y, z, maxDist)
    src.connect(vca).connect(panner).connect(this.sfxBus)
    const t = ctx.currentTime
    src.start(t)
    this.cleanup(src, [vca, panner], t + buf.duration / rate + 0.1)
  }

  /** The real receiver click (sampled). Falls back to the synth tick. */
  playPhoneClick(x: number, y: number, z: number, gain = 0.5): void {
    const buf = this.samples?.phoneClick
    if (buf) this.playBufferAt(buf, x, y, z, gain, 18)
    else this.playTick(x, y, z, 1.4)
  }

  /** Receiver up on a line that already gave up: click, then dead air. */
  playPhoneDeadLine(x: number, y: number, z: number): void {
    this.playPhoneClick(x, y, z, 0.5)
    const buf = this.samples?.phoneDead
    if (!buf || !this.ctx) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = buf
    const vca = ctx.createGain()
    const t = ctx.currentTime
    vca.gain.setValueAtTime(0, t + 0.3)
    vca.gain.linearRampToValueAtTime(0.18, t + 0.6)
    vca.gain.setValueAtTime(0.18, t + buf.duration - 0.6)
    vca.gain.linearRampToValueAtTime(0, t + buf.duration)
    const panner = this.makePanner(x, y, z, 14)
    src.connect(vca).connect(panner).connect(this.sfxBus)
    src.start(t + 0.3)
    this.cleanup(src, [vca, panner], t + buf.duration + 0.5)
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
