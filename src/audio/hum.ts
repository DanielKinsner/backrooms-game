/**
 * Fluorescent fixture hum (DESIGN.md §9).
 *
 * Per-fixture procedural voices: sines at 120/240/360/480 Hz (2x mains
 * dominant — that's ballast hum, not raw 60 Hz mains), through a ~1.2 kHz
 * lowpass (real ballast hum has very little above 1.5 kHz), plus a quiet
 * looped-noise floor and a ~3 Hz amplitude LFO (the imperceptible flicker
 * humans associate with sick fluorescents).
 *
 * Voice pool: cap at MAX_VOICES HRTF-panned voices, assigned to the nearest
 * fixtures each update with hysteresis to prevent thrashing. Far fixtures get
 * folded into a single quiet non-spatial "wash" voice.
 */

const MAX_VOICES = 10
const NEAR_RADIUS_M = 14 // beyond this, fixtures contribute to wash only
const REASSIGN_HYST_M = 3 // a new fixture must beat the current by this much

const HARMONIC_FREQS = [120, 240, 360, 480] as const
const HARMONIC_GAINS = [0.2, 0.1, 0.05, 0.025] as const

const PERSONALITY_CENTS = 3 // ± per-fixture sub-oscillator detune from seed

export interface HumFixture {
  x: number
  z: number
  /** Mount height (garage ceilings are lower). */
  y?: number
  seed: number
}

/** A single per-fixture voice graph: oscillators+noise → mix → lowpass → panner → out. */
class HumVoice {
  readonly panner: PannerNode
  private readonly oscs: OscillatorNode[] = []
  private readonly oscGains: GainNode[] = []
  private readonly mix: GainNode
  private readonly lfo: OscillatorNode
  private readonly lfoGain: GainNode
  private readonly lfoOffset: ConstantSourceNode
  private breathLfo!: OscillatorNode
  private breathGain!: GainNode
  private readonly lowpass: BiquadFilterNode
  private readonly noiseSrc: AudioBufferSourceNode
  private readonly noiseGain: GainNode
  private readonly outGain: GainNode

  fixtureId: string | null = null
  private personalityCents = 0

  constructor(ctx: AudioContext, noiseBuffer: AudioBuffer, out: AudioNode) {
    // Master gain for this voice (we ramp this when (de)activating to avoid clicks).
    this.outGain = ctx.createGain()
    this.outGain.gain.value = 0

    this.panner = ctx.createPanner()
    this.panner.panningModel = 'HRTF'
    this.panner.distanceModel = 'inverse'
    this.panner.refDistance = 2.0
    this.panner.rolloffFactor = 1.6
    this.panner.maxDistance = 30
    // Fixtures are above and slightly omnidirectional — leave the cone wide-open default.

    this.lowpass = ctx.createBiquadFilter()
    this.lowpass.type = 'lowpass'
    this.lowpass.frequency.value = 1200
    this.lowpass.Q.value = 0.4

    this.mix = ctx.createGain()
    // The mix is summed harmonics + noise; the LFO modulates this gain ±0.25 around 1.
    this.mix.gain.value = 1.0

    // ~3 Hz tremolo LFO. We drive `mix.gain` with `1 + lfo * 0.25`.
    this.lfo = ctx.createOscillator()
    this.lfo.type = 'sine'
    this.lfo.frequency.value = 3.0
    this.lfoGain = ctx.createGain()
    this.lfoGain.gain.value = 0.25
    this.lfo.connect(this.lfoGain).connect(this.mix.gain)
    this.lfoOffset = ctx.createConstantSource()
    this.lfoOffset.offset.value = 1.0
    this.lfoOffset.connect(this.mix.gain)

    // 18.98 Hz amplitude flutter — the Tandy infrasound frequency, delivered
    // as modulation on an audible carrier because no laptop speaker can emit
    // 19 Hz directly. Depth 0 by default; the director breathes it in slowly
    // before beats. Felt before noticed.
    this.breathLfo = ctx.createOscillator()
    this.breathLfo.type = 'sine'
    this.breathLfo.frequency.value = 18.98
    this.breathGain = ctx.createGain()
    this.breathGain.gain.value = 0
    this.breathLfo.connect(this.breathGain).connect(this.mix.gain)

    for (let i = 0; i < HARMONIC_FREQS.length; i++) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = HARMONIC_FREQS[i]
      const g = ctx.createGain()
      g.gain.value = HARMONIC_GAINS[i]
      osc.connect(g).connect(this.mix)
      this.oscs.push(osc)
      this.oscGains.push(g)
    }

    this.noiseSrc = ctx.createBufferSource()
    this.noiseSrc.buffer = noiseBuffer
    this.noiseSrc.loop = true
    this.noiseGain = ctx.createGain()
    this.noiseGain.gain.value = 0.04
    this.noiseSrc.connect(this.noiseGain).connect(this.mix)

    this.mix.connect(this.lowpass).connect(this.panner).connect(this.outGain).connect(out)

    // Start everything; we modulate outGain to activate/deactivate without clicks.
    const t = ctx.currentTime
    this.lfo.start(t)
    this.lfoOffset.start(t)
    this.breathLfo.start(t)
    this.noiseSrc.start(t)
    for (const osc of this.oscs) osc.start(t)
  }

  /** 18.98 Hz flutter depth 0..1 (scaled to safe modulation range). */
  setBreath(ctx: AudioContext, depth: number): void {
    this.breathGain.gain.setTargetAtTime(depth * 0.45, ctx.currentTime, 8)
  }

  /** Spectral narrowing: 0 = open (1.2 kHz), 1 = swallowed (~320 Hz). */
  setMuffle(ctx: AudioContext, v: number): void {
    const f = 1200 - v * 880
    this.lowpass.frequency.setTargetAtTime(f, ctx.currentTime, 1.2)
  }

  /** Place this voice at a world fixture position. y is ceiling height. */
  position(ctx: AudioContext, x: number, y: number, z: number, smooth = true): void {
    const t = ctx.currentTime
    if (smooth) {
      this.panner.positionX.setTargetAtTime(x, t, 0.05)
      this.panner.positionY.setTargetAtTime(y, t, 0.05)
      this.panner.positionZ.setTargetAtTime(z, t, 0.05)
    } else {
      this.panner.positionX.value = x
      this.panner.positionY.value = y
      this.panner.positionZ.value = z
    }
  }

  setPersonalityFromSeed(seed: number): void {
    // Stable per-fixture detune in cents. Hash seed to [-1, 1].
    const h = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1 // 0..1
    this.personalityCents = (h * 2 - 1) * PERSONALITY_CENTS
  }

  /** Apply global detune from director (setHumDetune, dread). Each osc gets cents. */
  applyDetune(ctx: AudioContext, globalCents: number): void {
    const t = ctx.currentTime
    const total = globalCents + this.personalityCents
    for (const osc of this.oscs) {
      // detune is in cents and is k-rate; smooth to avoid zipper noise.
      osc.detune.setTargetAtTime(total, t, 0.08)
    }
  }

  fadeIn(ctx: AudioContext, target: number, secs = 0.6): void {
    const t = ctx.currentTime
    this.outGain.gain.setTargetAtTime(target, t, secs / 3)
  }

  fadeOut(ctx: AudioContext, secs = 0.4): void {
    const t = ctx.currentTime
    this.outGain.gain.setTargetAtTime(0, t, secs / 3)
  }

  /** Spec H: a brief −3 dB duck, then back. The level heard it too. */
  dip(ctx: AudioContext, target: number, seconds: number): void {
    const t = ctx.currentTime
    this.outGain.gain.setTargetAtTime(target * 0.708, t, 0.15)
    this.outGain.gain.setTargetAtTime(target, t + seconds, 0.4)
  }

  /** Hard-cut for SILENCE events. ~80ms ramp = imperceptible click, perceptible drop. */
  silence(ctx: AudioContext, ms = 80): void {
    const t = ctx.currentTime
    this.outGain.gain.cancelScheduledValues(t)
    this.outGain.gain.setTargetAtTime(0, t, ms / 1000 / 3)
  }

  /** Restore after silence. */
  restore(ctx: AudioContext, target: number, secs: number): void {
    const t = ctx.currentTime
    this.outGain.gain.setTargetAtTime(target, t, secs / 3)
  }

  dispose(): void {
    try {
      this.lfo.stop()
      this.lfoOffset.stop()
      this.noiseSrc.stop()
      for (const osc of this.oscs) osc.stop()
    } catch {
      /* already stopped */
    }
    this.panner.disconnect()
    this.outGain.disconnect()
    this.lowpass.disconnect()
    this.mix.disconnect()
  }
}

/**
 * Far-field hum wash: a single non-spatial, very-quiet harmonic mix that
 * "fills in" the fixtures we don't have voices for. Without this, the moment
 * a fixture leaves the near-pool the player perceives a sudden drop in
 * ambience that breaks immersion.
 */
class HumWash {
  private readonly out: GainNode
  private readonly mix: GainNode
  private readonly oscs: OscillatorNode[] = []
  private readonly lowpass: BiquadFilterNode
  private readonly lfo: OscillatorNode
  private readonly lfoGain: GainNode
  private readonly lfoOffset: ConstantSourceNode
  private fixtureCount = 0

  constructor(ctx: AudioContext, noiseBuffer: AudioBuffer, dest: AudioNode) {
    this.out = ctx.createGain()
    this.out.gain.value = 0

    this.lowpass = ctx.createBiquadFilter()
    this.lowpass.type = 'lowpass'
    this.lowpass.frequency.value = 900 // darker than near voices (distance)

    this.mix = ctx.createGain()
    this.mix.gain.value = 1.0

    this.lfo = ctx.createOscillator()
    this.lfo.type = 'sine'
    this.lfo.frequency.value = 1.7 // slower than near voices
    this.lfoGain = ctx.createGain()
    this.lfoGain.gain.value = 0.15
    this.lfo.connect(this.lfoGain).connect(this.mix.gain)
    this.lfoOffset = ctx.createConstantSource()
    this.lfoOffset.offset.value = 1.0
    this.lfoOffset.connect(this.mix.gain)

    for (let i = 0; i < HARMONIC_FREQS.length; i++) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = HARMONIC_FREQS[i]
      const g = ctx.createGain()
      // Wash is much quieter than a single near voice.
      g.gain.value = HARMONIC_GAINS[i] * 0.35
      osc.connect(g).connect(this.mix)
      this.oscs.push(osc)
    }

    const noiseSrc = ctx.createBufferSource()
    noiseSrc.buffer = noiseBuffer
    noiseSrc.loop = true
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.02
    noiseSrc.connect(noiseGain).connect(this.mix)

    this.mix.connect(this.lowpass).connect(this.out).connect(dest)

    const t = ctx.currentTime
    this.lfo.start(t)
    this.lfoOffset.start(t)
    noiseSrc.start(t)
    for (const osc of this.oscs) osc.start(t)
  }

  /** Volume should reflect "how many far fixtures are out there". */
  update(ctx: AudioContext, farFixtureCount: number): void {
    if (farFixtureCount === this.fixtureCount) return
    this.fixtureCount = farFixtureCount
    // Soft saturation: more fixtures => more wash, but ceiling at ~0.18.
    const target = Math.min(0.05 + farFixtureCount * 0.012, 0.18)
    this.out.gain.setTargetAtTime(target, ctx.currentTime, 0.4)
  }

  applyDetune(ctx: AudioContext, globalCents: number): void {
    const t = ctx.currentTime
    for (const osc of this.oscs) osc.detune.setTargetAtTime(globalCents, t, 0.08)
  }

  setMuffle(ctx: AudioContext, v: number): void {
    this.lowpass.frequency.setTargetAtTime(900 - v * 640, ctx.currentTime, 1.2)
  }

  silence(ctx: AudioContext, ms = 80): void {
    const t = ctx.currentTime
    this.out.gain.cancelScheduledValues(t)
    this.out.gain.setTargetAtTime(0, t, ms / 1000 / 3)
  }

  restore(ctx: AudioContext, secs: number): void {
    const target = Math.min(0.05 + this.fixtureCount * 0.012, 0.18)
    this.out.gain.setTargetAtTime(target, ctx.currentTime, secs / 3)
  }
}

interface VoiceSlot {
  voice: HumVoice
  fixtureKey: string | null
  distance: number
}

export class HumLayer {
  private readonly voices: VoiceSlot[] = []
  private readonly wash: HumWash
  private readonly ctx: AudioContext
  private readonly ceilY = 2.7 // ceiling-tile audio height (slightly below CEIL_H = 2.8)
  private globalDetune = 0
  private dreadDetune = 0
  private nearVoiceGain = 0.45 // gets multiplied into each voice's outGain

  constructor(ctx: AudioContext, noiseBuffer: AudioBuffer, dest: AudioNode) {
    this.ctx = ctx
    for (let i = 0; i < MAX_VOICES; i++) {
      const v = new HumVoice(ctx, noiseBuffer, dest)
      this.voices.push({ voice: v, fixtureKey: null, distance: Infinity })
    }
    this.wash = new HumWash(ctx, noiseBuffer, dest)
  }

  // D1: killed fixtures stop humming — the voice drops with the click.
  private killedFixtures: { x: number; z: number; until: number }[] = []

  killFixture(x: number, z: number, seconds: number): void {
    this.killedFixtures.push({ x, z, until: this.ctx.currentTime + seconds })
  }

  /** Reassign voice pool to the nearest fixtures with hysteresis. */
  update(listenerX: number, listenerZ: number, allFixtures: HumFixture[]): void {
    let fixtures = allFixtures
    if (this.killedFixtures.length > 0) {
      const now = this.ctx.currentTime
      this.killedFixtures = this.killedFixtures.filter((k) => k.until > now)
      if (this.killedFixtures.length > 0) {
        fixtures = allFixtures.filter(
          (f) =>
            !this.killedFixtures.some(
              (k) => Math.abs(k.x - f.x) < 0.5 && Math.abs(k.z - f.z) < 0.5,
            ),
        )
      }
    }
    // Sort fixtures by squared distance to listener.
    const scored = fixtures.map((f) => {
      const dx = f.x - listenerX
      const dz = f.z - listenerZ
      const d = Math.sqrt(dx * dx + dz * dz)
      return { f, d, key: `${f.x.toFixed(2)},${f.z.toFixed(2)}` }
    })
    scored.sort((a, b) => a.d - b.d)

    const near = scored.filter((s) => s.d <= NEAR_RADIUS_M)
    const far = scored.length - near.length

    // Pass 1: keep current assignments if they're still in the near set.
    const currentKeys = new Set<string>()
    for (const slot of this.voices) {
      if (slot.fixtureKey && near.some((s) => s.key === slot.fixtureKey)) {
        const match = near.find((s) => s.key === slot.fixtureKey)!
        slot.distance = match.d
        currentKeys.add(slot.fixtureKey)
      } else if (slot.fixtureKey) {
        // Fixture left the near set — release this slot.
        slot.voice.fadeOut(this.ctx, 0.5)
        slot.fixtureKey = null
        slot.distance = Infinity
      }
    }

    // Pass 2: fill empty slots with the nearest unassigned fixtures.
    const freeSlots = this.voices.filter((s) => s.fixtureKey === null)
    const wantList = near.filter((s) => !currentKeys.has(s.key)).slice(0, freeSlots.length)
    wantList.forEach((s, i) => {
      const slot = freeSlots[i]
      const fx = s.f
      slot.fixtureKey = s.key
      slot.distance = s.d
      slot.voice.fixtureId = s.key
      slot.voice.setPersonalityFromSeed(fx.seed)
      slot.voice.position(this.ctx, fx.x, fx.y ?? this.ceilY, fx.z, false)
      slot.voice.applyDetune(this.ctx, this.globalDetune + this.dreadDetune)
      slot.voice.fadeIn(this.ctx, this.nearVoiceGain, 0.7)
    })

    // Pass 3: hysteresis swap — if a free near fixture is meaningfully closer
    // than the worst currently-assigned one, swap them. This prevents two
    // voices from flip-flopping on the boundary.
    const assigned = this.voices.filter((s) => s.fixtureKey !== null)
    const unassignedNear = near.filter((s) => !assigned.some((a) => a.fixtureKey === s.key))
    if (assigned.length > 0 && unassignedNear.length > 0) {
      assigned.sort((a, b) => b.distance - a.distance)
      const worst = assigned[0]
      const candidate = unassignedNear[0]
      if (candidate.d < worst.distance - REASSIGN_HYST_M) {
        worst.voice.fadeOut(this.ctx, 0.4)
        worst.fixtureKey = candidate.key
        worst.distance = candidate.d
        worst.voice.setPersonalityFromSeed(candidate.f.seed)
        worst.voice.position(this.ctx, candidate.f.x, candidate.f.y ?? this.ceilY, candidate.f.z, false)
        worst.voice.applyDetune(this.ctx, this.globalDetune + this.dreadDetune)
        worst.voice.fadeIn(this.ctx, this.nearVoiceGain, 0.7)
      }
    }

    // Keep panners tracking fixtures that moved (we don't move fixtures yet,
    // but cheap to call and listener is moving so HRTF recalc happens anyway).
    // The wash reflects "how many other fixtures are out there".
    this.wash.update(this.ctx, far + Math.max(0, near.length - this.voices.length))
  }

  /** Apply explicit director-driven detune (cents). */
  setDetune(cents: number): void {
    this.globalDetune = cents
    const total = this.globalDetune + this.dreadDetune
    for (const slot of this.voices) {
      if (slot.fixtureKey) slot.voice.applyDetune(this.ctx, total)
    }
    this.wash.applyDetune(this.ctx, total)
  }

  /** Dread → subtle detune contribution. 0..1 → 0..4 cents drift. */
  setDreadDetune(dread: number): void {
    this.dreadDetune = dread * 4
    const total = this.globalDetune + this.dreadDetune
    for (const slot of this.voices) {
      if (slot.fixtureKey) slot.voice.applyDetune(this.ctx, total)
    }
    this.wash.applyDetune(this.ctx, total)
  }

  /** Spectral narrowing 0..1 — the building swallowing its own voice. */
  setMuffle(v: number): void {
    for (const slot of this.voices) slot.voice.setMuffle(this.ctx, v)
    this.wash.setMuffle(this.ctx, v)
  }

  /** 18.98 Hz flutter depth 0..1, ramped over ~30 s by the slow time constant. */
  setBreath(depth: number): void {
    for (const slot of this.voices) slot.voice.setBreath(this.ctx, depth)
  }

  /** Spec H: every loaded fixture dips 3 dB for `seconds`, then recovers. */
  dipAll(seconds = 2): void {
    for (const slot of this.voices) {
      if (slot.fixtureKey) slot.voice.dip(this.ctx, this.nearVoiceGain, seconds)
    }
  }

  /** SILENCE: ramp every voice + wash to 0 fast. */
  silence(): void {
    for (const slot of this.voices) slot.voice.silence(this.ctx)
    this.wash.silence(this.ctx)
  }

  /** Creep back to normal over `secs` (called by AudioEngine.silence()). */
  restore(secs: number): void {
    for (const slot of this.voices) {
      if (slot.fixtureKey) slot.voice.restore(this.ctx, this.nearVoiceGain, secs)
    }
    this.wash.restore(this.ctx, secs)
  }
}
