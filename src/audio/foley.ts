/**
 * Player foley: footsteps + breath (DESIGN.md §5, §9).
 *
 * Footsteps: distance-accumulator (not timer) — every Nm walking trips a
 * step. This automatically scales with speed, dt-jitter-free, and respects
 * sprint/crouch stride differences.
 *
 * Step-on-carpet: cloth samples pitched down to ~0.85 + lowpass ~1.6 kHz =
 * the muffled "damp carpet" surface (assets brief).
 *
 * Breath: fully synthesized (filtered noise + inhale/exhale envelope) so it's
 * authoritative and decoupled from any one breath sample's loop seam. Driven
 * by an internal stamina model from sprinting time.
 */

const STRIDE_WALK = 0.72 // meters between footfalls
const STRIDE_SPRINT = 0.95
const STRIDE_CROUCH = 0.55

const STEP_PITCH_DOWN = 0.85 // carpet feels heavier than the source recording
const STEP_PITCH_JITTER = 0.07 // ±7%
const STEP_LP_HZ = 1600

const STEP_VOL_WALK = 0.45
const STEP_VOL_SPRINT = 0.62
const STEP_VOL_CROUCH = 0.22

/** Tiny stereo widening on a mono step source. ~6-10 ms ITD reads as natural. */
const STEP_STEREO_DELAY_S = 0.008

export class Foley {
  private readonly ctx: AudioContext
  private readonly dest: AudioNode
  private readonly buffers: AudioBuffer[]
  private distAccum = 0
  private lastIndex = -1

  // --- Breath ---
  private readonly breathGain: GainNode
  private readonly breathFilter: BiquadFilterNode
  private readonly breathLfo: OscillatorNode
  private readonly breathLfoGain: GainNode
  private readonly breathLfoOffset: ConstantSourceNode
  private stamina = 0 // 0 = rested, 1 = winded
  private sprintTime = 0

  constructor(ctx: AudioContext, dest: AudioNode, buffers: AudioBuffer[], breathNoise: AudioBuffer) {
    this.ctx = ctx
    this.dest = dest
    this.buffers = buffers

    // Breath = pink noise → bandpass → VCA driven by slow LFO (inhale/exhale).
    this.breathGain = ctx.createGain()
    this.breathGain.gain.value = 0
    this.breathFilter = ctx.createBiquadFilter()
    this.breathFilter.type = 'bandpass'
    this.breathFilter.frequency.value = 600 // vocal-tract-ish hiss
    this.breathFilter.Q.value = 0.8
    const src = ctx.createBufferSource()
    src.buffer = breathNoise
    src.loop = true
    src.connect(this.breathFilter).connect(this.breathGain).connect(dest)

    this.breathLfo = ctx.createOscillator()
    this.breathLfo.type = 'sine'
    this.breathLfo.frequency.value = 0.4 // rest breathing ~24/min, sped up via setTarget
    this.breathLfoGain = ctx.createGain()
    this.breathLfoGain.gain.value = 0
    this.breathLfoOffset = ctx.createConstantSource()
    this.breathLfoOffset.offset.value = 0
    this.breathLfo.connect(this.breathLfoGain).connect(this.breathGain.gain)
    this.breathLfoOffset.connect(this.breathGain.gain)

    const t = ctx.currentTime
    src.start(t)
    this.breathLfo.start(t)
    this.breathLfoOffset.start(t)
  }

  /** Drive the distance accumulator and breath stamina from player state. */
  update(
    dt: number,
    speed: number,
    moving: boolean,
    onGround: boolean,
    sprinting: boolean,
    crouching: boolean,
  ): void {
    // --- Footstep trigger via distance accumulation ---
    if (moving && onGround && speed > 0.05) {
      this.distAccum += speed * dt
      const stride = crouching ? STRIDE_CROUCH : sprinting ? STRIDE_SPRINT : STRIDE_WALK
      if (this.distAccum >= stride) {
        this.distAccum -= stride
        this.playStep(sprinting, crouching)
      }
    } else {
      // Slowly drain the accumulator when stopped so the next step doesn't fire
      // immediately the moment you start moving again.
      this.distAccum = Math.max(0, this.distAccum - dt * 0.5)
    }

    // --- Stamina / breath ---
    if (sprinting && moving) this.sprintTime += dt
    else this.sprintTime = Math.max(0, this.sprintTime - dt) // ~8s recovery if we damp

    // After 4s of sprinting, breath fades in; over ~8s of rest, it fades out.
    const target = this.sprintTime < 4 ? 0 : Math.min(1, (this.sprintTime - 4) / 6)
    // Exponential approach (frame-rate independent).
    const k = 1 - Math.exp(-1.0 * dt)
    this.stamina += (target - this.stamina) * k

    // Breath gain envelope: very subtle. Even at full stamina, peak ≈ 0.08.
    const breathPeak = this.stamina * 0.08
    const t = this.ctx.currentTime
    this.breathLfoGain.gain.setTargetAtTime(breathPeak * 0.9, t, 0.4)
    this.breathLfoOffset.offset.setTargetAtTime(breathPeak * 0.5, t, 0.4)
    // Rate of breathing scales with stamina: 0.35 → 0.85 Hz (≈21 → 51/min).
    const rate = 0.35 + this.stamina * 0.5
    this.breathLfo.frequency.setTargetAtTime(rate, t, 0.4)
  }

  private pickIndex(): number {
    if (this.buffers.length === 0) return -1
    if (this.buffers.length === 1) return 0
    // Avoid the same sample twice in a row — habituation kills foley.
    let idx = Math.floor(Math.random() * this.buffers.length)
    if (idx === this.lastIndex) idx = (idx + 1) % this.buffers.length
    this.lastIndex = idx
    return idx
  }

  private playStep(sprinting: boolean, crouching: boolean): void {
    const idx = this.pickIndex()
    if (idx < 0) return
    const buf = this.buffers[idx]
    const ctx = this.ctx

    const src = ctx.createBufferSource()
    src.buffer = buf
    const jitter = 1 + (Math.random() * 2 - 1) * STEP_PITCH_JITTER
    src.playbackRate.value = STEP_PITCH_DOWN * jitter

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = STEP_LP_HZ
    lp.Q.value = 0.4

    const vca = ctx.createGain()
    const baseVol = crouching ? STEP_VOL_CROUCH : sprinting ? STEP_VOL_SPRINT : STEP_VOL_WALK
    // micro-jitter so identical samples don't feel mechanical
    vca.gain.value = baseVol * (0.92 + Math.random() * 0.16)

    // Subtle stereo width: L and R get the same audio with ±delay each.
    // Use a ChannelMerger to assemble a stereo signal from two mono delays.
    const splitL = ctx.createDelay()
    splitL.delayTime.value = STEP_STEREO_DELAY_S * 0.5
    const splitR = ctx.createDelay()
    splitR.delayTime.value = STEP_STEREO_DELAY_S
    const merger = ctx.createChannelMerger(2)

    src.connect(lp).connect(vca)
    vca.connect(splitL).connect(merger, 0, 0)
    vca.connect(splitR).connect(merger, 0, 1)
    merger.connect(this.dest)

    const t = ctx.currentTime
    src.start(t)
    // Self-clean: disconnect after the sample plus a generous tail.
    const dur = buf.duration / src.playbackRate.value + 0.1
    src.onended = (): void => {
      try {
        src.disconnect()
        lp.disconnect()
        vca.disconnect()
        splitL.disconnect()
        splitR.disconnect()
        merger.disconnect()
      } catch {
        /* already torn down */
      }
    }
    // Belt-and-braces stop in case onended doesn't fire (rare in old browsers).
    src.stop(t + dur)
  }

  /** SILENCE: kill breath fast. Footsteps are transient, no action needed. */
  silence(rampSecs: number): void {
    const t = this.ctx.currentTime
    this.breathLfoGain.gain.setTargetAtTime(0, t, rampSecs / 3)
    this.breathLfoOffset.offset.setTargetAtTime(0, t, rampSecs / 3)
  }

  restore(secs: number): void {
    // Let next update() reapply targets — but reset the offset to be safe.
    const t = this.ctx.currentTime
    const breathPeak = this.stamina * 0.08
    this.breathLfoGain.gain.setTargetAtTime(breathPeak * 0.9, t, secs / 3)
    this.breathLfoOffset.offset.setTargetAtTime(breathPeak * 0.5, t, secs / 3)
  }
}
