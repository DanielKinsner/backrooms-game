/**
 * Dread bed + room tone + heartbeat entrainment (DESIGN.md §9).
 *
 * Three sublayers all routed through the same ambience bus:
 *  1. Sub pad — sine at 35-55 Hz with 0.5-2 Hz amplitude modulation. This
 *     is the practical infrasound substitute (psychology brief §3.1):
 *     true 17-19 Hz is unreliable on consumer speakers/headphones, so we
 *     ride the low-frequency edge of audible while the slow AM rate creates
 *     the same "something is wrong" sensation.
 *  2. Airvent room tone — quiet constant background, ducks during silence().
 *     We crossfade between two playing copies to hide non-clean loop seams.
 *  3. Heartbeat — synthesized dual-thump (lub-dub) at 60 BPM, creeping to
 *     90 BPM as dread → 1. Engineered to be BARELY audible (entrainment,
 *     not effect): the player's own heart should sync without them noticing
 *     the sound.
 */

const HEARTBEAT_BASE_BPM = 60
const HEARTBEAT_PEAK_BPM = 90

/** Equal-power crossfade looping of a buffer, click-free. */
class CrossfadeLoop {
  private a: AudioBufferSourceNode | null = null
  private b: AudioBufferSourceNode | null = null
  private aGain: GainNode
  private bGain: GainNode
  private out: GainNode
  private readonly buffer: AudioBuffer
  private readonly ctx: AudioContext
  private readonly fadeSeconds: number
  private running = false
  private nextSwapTimer: number | null = null

  constructor(ctx: AudioContext, buffer: AudioBuffer, dest: AudioNode, fadeSeconds = 1.2) {
    this.ctx = ctx
    this.buffer = buffer
    this.fadeSeconds = fadeSeconds
    this.aGain = ctx.createGain()
    this.bGain = ctx.createGain()
    this.out = ctx.createGain()
    this.aGain.gain.value = 0
    this.bGain.gain.value = 0
    this.out.gain.value = 1
    this.aGain.connect(this.out)
    this.bGain.connect(this.out)
    this.out.connect(dest)
  }

  setOutputGain(value: number, smoothSecs = 0.3): void {
    this.out.gain.setTargetAtTime(value, this.ctx.currentTime, smoothSecs / 3)
  }

  /** Hard-cut for silence(). */
  silence(rampSecs: number): void {
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, rampSecs / 3)
  }

  restore(target: number, secs: number): void {
    this.out.gain.setTargetAtTime(target, this.ctx.currentTime, secs / 3)
  }

  start(initialGain: number): void {
    if (this.running) return
    this.running = true
    this.out.gain.value = initialGain
    this.spawn('a')
  }

  private spawn(which: 'a' | 'b'): void {
    const src = this.ctx.createBufferSource()
    src.buffer = this.buffer
    // We crossfade manually, so don't let the underlying source loop sample-incoherently.
    src.loop = false
    if (which === 'a') {
      this.a?.disconnect()
      this.a = src
      src.connect(this.aGain)
      // Bring this voice up to unity over fade window.
      this.aGain.gain.cancelScheduledValues(this.ctx.currentTime)
      this.aGain.gain.setValueAtTime(0, this.ctx.currentTime)
      this.aGain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + this.fadeSeconds)
    } else {
      this.b?.disconnect()
      this.b = src
      src.connect(this.bGain)
      this.bGain.gain.cancelScheduledValues(this.ctx.currentTime)
      this.bGain.gain.setValueAtTime(0, this.ctx.currentTime)
      this.bGain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + this.fadeSeconds)
    }
    src.start(this.ctx.currentTime)

    // Schedule the partner to kick in fadeSeconds before this one ends.
    const dur = this.buffer.duration
    const swapIn = Math.max(0.1, dur - this.fadeSeconds)
    // Ramp this voice down during the swap window.
    const startGain = which === 'a' ? this.aGain : this.bGain
    startGain.gain.setValueAtTime(1, this.ctx.currentTime + swapIn)
    startGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + dur)

    if (this.nextSwapTimer !== null) clearTimeout(this.nextSwapTimer)
    this.nextSwapTimer = window.setTimeout(() => {
      if (!this.running) return
      this.spawn(which === 'a' ? 'b' : 'a')
    }, swapIn * 1000)
  }
}

export class DreadBed {
  private readonly ctx: AudioContext

  // Sub pad
  private readonly subOsc: OscillatorNode
  private readonly subGain: GainNode // gets the dread-scaled level
  private readonly subAm: OscillatorNode // amplitude-mod LFO
  private readonly subAmGain: GainNode
  private readonly subAmOffset: ConstantSourceNode

  // Heartbeat synthesis
  private readonly hbOsc: OscillatorNode
  private readonly hbFilter: BiquadFilterNode
  private readonly hbVca: GainNode // per-thump envelope
  private readonly hbOut: GainNode // overall heartbeat level (scaled by dread)
  private hbTimer: number | null = null
  private hbBpm = HEARTBEAT_BASE_BPM
  private hbActive = false

  // Airvent room tone
  private airvent: CrossfadeLoop | null = null

  private dread = 0
  private baseAirventGain = 0.18

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx

    // --- Sub pad ---
    this.subOsc = ctx.createOscillator()
    this.subOsc.type = 'sine'
    this.subOsc.frequency.value = 42 // mid of 35-55 Hz window
    this.subGain = ctx.createGain()
    this.subGain.gain.value = 0
    // 0.8 Hz AM is mid of 0.5-2 Hz spec — slow enough to be subliminal.
    this.subAm = ctx.createOscillator()
    this.subAm.type = 'sine'
    this.subAm.frequency.value = 0.8
    this.subAmGain = ctx.createGain()
    this.subAmGain.gain.value = 0.45 // depth
    this.subAmOffset = ctx.createConstantSource()
    this.subAmOffset.offset.value = 0.55 // center; total range [0.1, 1.0]
    this.subAm.connect(this.subAmGain).connect(this.subGain.gain)
    this.subAmOffset.connect(this.subGain.gain)
    this.subOsc.connect(this.subGain).connect(dest)

    // --- Heartbeat ---
    // Single low sine through steep lowpass, gated by short envelope twice per beat.
    this.hbOsc = ctx.createOscillator()
    this.hbOsc.type = 'sine'
    this.hbOsc.frequency.value = 50 // felt-not-heard thump
    this.hbFilter = ctx.createBiquadFilter()
    this.hbFilter.type = 'lowpass'
    this.hbFilter.frequency.value = 90
    this.hbFilter.Q.value = 0.7
    this.hbVca = ctx.createGain()
    this.hbVca.gain.value = 0
    this.hbOut = ctx.createGain()
    this.hbOut.gain.value = 0
    this.hbOsc.connect(this.hbFilter).connect(this.hbVca).connect(this.hbOut).connect(dest)

    const t = ctx.currentTime
    this.subOsc.start(t)
    this.subAm.start(t)
    this.subAmOffset.start(t)
    this.hbOsc.start(t)
  }

  /** Attach the loaded airvent buffer. Safe to call multiple times. */
  setAirventBuffer(buf: AudioBuffer | null, dest: AudioNode): void {
    if (!buf) return
    if (this.airvent) return // already running
    this.airvent = new CrossfadeLoop(this.ctx, buf, dest, Math.min(1.5, buf.duration * 0.25))
    this.airvent.start(this.baseAirventGain)
  }

  setDread(v: number): void {
    this.dread = Math.max(0, Math.min(1, v))
    const t = this.ctx.currentTime
    // Sub pad: louder with dread but never overwhelming. Peaks at ~0.18 ≈ -15 dB.
    const subTarget = 0.05 + this.dread * 0.13
    this.subGain.gain.cancelScheduledValues(t)
    // Note: subGain.gain has the AM-driving signals routed into it; setting the value
    // here would clobber them. Use setTargetAtTime so the existing modulation continues
    // (the offset is constant; we're just adjusting overall depth via AM gain).
    // Actually safer: scale the AM gain + offset proportionally.
    this.subAmGain.gain.setTargetAtTime(subTarget * 0.85, t, 0.5)
    this.subAmOffset.offset.setTargetAtTime(subTarget * 1.05, t, 0.5)

    // Heartbeat: barely audible. Peaks at ~0.06 — felt through phones, not heard.
    const hbTarget = this.dread < 0.15 ? 0 : (this.dread - 0.15) / 0.85 * 0.06
    this.hbOut.gain.setTargetAtTime(hbTarget, t, 0.8)

    // BPM scales 60 → 90 across full dread range — unless D12 has the
    // beat locked to the player's own gait. That tempo holds.
    if (!this.cadenceLocked) {
      this.hbBpm = HEARTBEAT_BASE_BPM + this.dread * (HEARTBEAT_PEAK_BPM - HEARTBEAT_BASE_BPM)
    }

    // Activate scheduling once dread crosses threshold.
    if (this.dread >= 0.15 && !this.hbActive) {
      this.hbActive = true
      this.scheduleHeartbeat()
    } else if (this.dread < 0.15 && this.hbActive) {
      this.hbActive = false
      if (this.hbTimer !== null) {
        clearTimeout(this.hbTimer)
        this.hbTimer = null
      }
    }
  }

  /** Schedule a "lub-dub" then queue the next beat. */
  private scheduleHeartbeat(): void {
    if (!this.hbActive) return
    const t = this.ctx.currentTime
    // Lub (S1): firmer, longer. Dub (S2): softer, shorter, ~120 ms after.
    this.envThump(t + 0.005, 0.06, 0.18, 1.0)
    this.envThump(t + 0.13, 0.04, 0.12, 0.75)
    const beatSec = 60 / this.hbBpm
    this.hbTimer = window.setTimeout(() => this.scheduleHeartbeat(), beatSec * 1000)
  }

  private envThump(t: number, attack: number, release: number, amp: number): void {
    this.hbVca.gain.cancelScheduledValues(t)
    this.hbVca.gain.setValueAtTime(0, t)
    this.hbVca.gain.linearRampToValueAtTime(amp, t + attack)
    // exponential to 0 (perceptually natural decay); use setTargetAtTime then snap.
    this.hbVca.gain.setTargetAtTime(0, t + attack, release / 3)
  }

  // D12 — entrainment break: the heartbeat locks to the player's own
  // step cadence for `seconds`... and keeps that tempo after they stop.
  private cadenceLockUntil = 0

  lockToCadence(stepIntervalS: number, seconds = 30): void {
    const bpm = Math.max(52, Math.min(112, 60 / Math.max(0.3, stepIntervalS)))
    this.hbBpm = bpm
    this.cadenceLockUntil = performance.now() + seconds * 1000
    if (this.hbActive) return
    this.hbActive = true
    this.scheduleHeartbeat()
  }

  get cadenceLocked(): boolean {
    return performance.now() < this.cadenceLockUntil
  }

  /**
   * Looming telegraph (Neuhoff: rising intensity is hardwired as "approaching
   * threat" and overestimated as closer than it is). The sub pad swells over
   * ~rampS, holds, then RECEDES — and the recede is the trick: it reads as
   * "it passed; it is behind you now". The scripted beat fires after.
   */
  loom(rampS = 35, holdS = 10, recedeS = 20): void {
    const t = this.ctx.currentTime
    const subTarget = 0.05 + this.dread * 0.13
    const loomTarget = Math.min(0.3, subTarget * 2.4)
    this.subAmGain.gain.cancelScheduledValues(t)
    this.subAmOffset.offset.cancelScheduledValues(t)
    this.subAmGain.gain.setTargetAtTime(loomTarget * 0.85, t, rampS / 3)
    this.subAmOffset.offset.setTargetAtTime(loomTarget * 1.05, t, rampS / 3)
    window.setTimeout(() => {
      const t2 = this.ctx.currentTime
      this.subAmGain.gain.setTargetAtTime(subTarget * 0.85, t2, recedeS / 3)
      this.subAmOffset.offset.setTargetAtTime(subTarget * 1.05, t2, recedeS / 3)
    }, (rampS + holdS) * 1000)
  }

  /** SILENCE: cut everything fast. */
  silence(rampSecs: number): void {
    const t = this.ctx.currentTime
    // Pad: kill the AM-driving signals so subGain.gain → 0.
    this.subAmGain.gain.setTargetAtTime(0, t, rampSecs / 3)
    this.subAmOffset.offset.setTargetAtTime(0, t, rampSecs / 3)
    this.hbOut.gain.setTargetAtTime(0, t, rampSecs / 3)
    this.airvent?.silence(rampSecs)
  }

  restore(secs: number): void {
    // Reapply dread targets (don't change dread itself).
    const subTarget = 0.05 + this.dread * 0.13
    this.subAmGain.gain.setTargetAtTime(subTarget * 0.85, this.ctx.currentTime, secs / 3)
    this.subAmOffset.offset.setTargetAtTime(subTarget * 1.05, this.ctx.currentTime, secs / 3)
    const hbTarget = this.dread < 0.15 ? 0 : (this.dread - 0.15) / 0.85 * 0.06
    this.hbOut.gain.setTargetAtTime(hbTarget, this.ctx.currentTime, secs / 3)
    this.airvent?.restore(this.baseAirventGain, secs)
  }
}
