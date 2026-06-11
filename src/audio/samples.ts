/**
 * Sample loader/registry. Fetch + decodeAudioData, tolerate per-file failures.
 *
 * Why a registry: we want named, typed lookup at playback time without paying
 * the fetch/decode cost mid-frame. All decoding happens once during init().
 *
 * Loop-cleanliness: source ambiences (airvent.wav, atmoseerie*.flac,
 * ambient_horror.ogg) rarely loop sample-accurately. We don't pretend they do —
 * the AudioEngine's bed/ambience layer uses equal-power crossfade between two
 * playing instances of the same buffer rather than relying on loopStart/End.
 */

const FOOTSTEP_FILES = [
  'audio/footsteps/step_cloth1.ogg',
  'audio/footsteps/step_cloth2.ogg',
  'audio/footsteps/step_cloth3.ogg',
  'audio/footsteps/step_cloth4.ogg',
] as const

const FOOTSTEP_LEATHER_FILES = [
  'audio/footsteps/step_lth1.ogg',
  'audio/footsteps/step_lth2.ogg',
  'audio/footsteps/step_lth33.ogg', // note: actual filename has the double-3
  'audio/footsteps/step_lth4.ogg',
] as const

const AMBIENT_FILES = {
  airvent: 'audio/ambient/airvent.wav',
  ambientHorror: 'audio/ambient/ambient_horror.ogg',
  atmos1: 'audio/ambient/atmoseerie01.flac',
  atmos2: 'audio/ambient/atmoseerie02.flac',
  atmos3: 'audio/ambient/atmoseerie03.flac',
  atmos4: 'audio/ambient/atmoseerie04.flac',
  // TAPE 2: two processed drones widen the rotation (anti-habituation)
  atmos5: 'audio/ambient/drone_subtle.ogg',
  atmos6: 'audio/ambient/drone_muffled.ogg',
} as const

const IMPACT_FILES = [
  'audio/impacts/impactMining_000.ogg',
  'audio/impacts/impactPlank_medium_000.ogg',
  'audio/impacts/impactPlank_medium_001.ogg',
  'audio/impacts/impactPunch_heavy_000.ogg',
  'audio/impacts/impactPunch_heavy_001.ogg',
  'audio/impacts/impactSoft_heavy_000.ogg',
  'audio/impacts/impactSoft_heavy_001.ogg',
  'audio/impacts/impactWood_heavy_000.ogg',
  'audio/impacts/impactWood_heavy_001.ogg',
  'audio/impacts/impactWood_heavy_002.ogg',
  // TAPE 2: long-tailed echo hits — the building is larger than it should be
  'audio/impacts/echo_bottle.ogg',
  'audio/impacts/echo_silo.ogg',
  'audio/impacts/echo_dungeon.ogg',
] as const

const DOOR_OPEN_FILES = [
  'audio/doors/qubodup-DoorOpen01.ogg',
  'audio/doors/qubodup-DoorOpen02.ogg',
  'audio/doors/qubodup-DoorOpen03.ogg',
  'audio/doors/qubodup-DoorOpen04.ogg',
  'audio/doors/qubodup-DoorOpen05.ogg',
  'audio/doors/qubodup-DoorOpen06.ogg',
  'audio/doors/qubodup-DoorOpen07.ogg',
  'audio/doors/qubodup-DoorOpen08.ogg',
] as const

const DOOR_CLOSE_FILES = [
  'audio/doors/qubodup-DoorClose01.ogg',
  'audio/doors/qubodup-DoorClose02.ogg',
  'audio/doors/qubodup-DoorClose03.ogg',
  'audio/doors/qubodup-DoorClose04.ogg',
  'audio/doors/qubodup-DoorClose05.ogg',
  'audio/doors/qubodup-DoorClose06.ogg',
  'audio/doors/qubodup-DoorClose07.ogg',
  'audio/doors/qubodup-DoorClose08.ogg',
  'audio/doors/qubodup-DoorClose09.ogg',
  'audio/doors/qubodup-DoorClose10.ogg',
] as const

const CREAK_FILE = 'audio/doors/creaky_door_hinge.wav'

// 2002 desk phone (processed derivatives — see docs/ASSET-LICENSES.md)
const PHONE_CLICK_FILE = 'audio/phone/click.ogg'
const PHONE_DEAD_FILE = 'audio/phone/deadline.ogg'

// Water set (processed derivatives — see docs/ASSET-LICENSES.md)
const DRIP_FILES = ['audio/water/drip1.ogg', 'audio/water/drip2.ogg'] as const
const SPLASH_FILE = 'audio/water/splash.ogg'
const WADE_FILE = 'audio/water/wade.ogg' // foley grains a random slice per step

// Camcorder transport buttons (processed vintage-camera clicks)
const PAUSE_DOWN_FILE = 'audio/ui/pause_down.ogg'
const PAUSE_UP_FILE = 'audio/ui/pause_up.ogg'

const GLITCH_FILES = [
  'audio/glitch/lowDown.ogg',
  'audio/glitch/lowRandom.ogg',
  'audio/glitch/phaseJump1.ogg',
  'audio/glitch/phaseJump2.ogg',
  'audio/glitch/phaseJump3.ogg',
  'audio/glitch/phaserDown1.ogg',
  'audio/glitch/phaserDown2.ogg',
  'audio/glitch/spaceTrash1.ogg',
  'audio/glitch/threeTone1.ogg',
  'audio/glitch/threeTone2.ogg',
] as const

/** Decoded buffers, keyed by logical name. Missing files: silently skipped. */
export interface SampleBank {
  footstepsCloth: AudioBuffer[]
  footstepsLeather: AudioBuffer[]
  airvent: AudioBuffer | null
  ambientHorror: AudioBuffer | null
  atmos: AudioBuffer[]
  impacts: AudioBuffer[]
  doorOpens: AudioBuffer[]
  doorCloses: AudioBuffer[]
  creak: AudioBuffer | null
  glitches: AudioBuffer[]
  phoneClick: AudioBuffer | null
  phoneDead: AudioBuffer | null
  drips: AudioBuffer[]
  splash: AudioBuffer | null
  wade: AudioBuffer | null
  pauseDown: AudioBuffer | null
  pauseUp: AudioBuffer | null
}

async function tryLoad(ctx: AudioContext, path: string): Promise<AudioBuffer | null> {
  try {
    const url = `${import.meta.env.BASE_URL}${path}`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[audio] fetch failed ${path}: ${res.status}`)
      return null
    }
    const ab = await res.arrayBuffer()
    return await ctx.decodeAudioData(ab)
  } catch (e) {
    console.warn(`[audio] decode failed ${path}:`, e)
    return null
  }
}

async function loadList(ctx: AudioContext, files: readonly string[]): Promise<AudioBuffer[]> {
  const results = await Promise.all(files.map((f) => tryLoad(ctx, f)))
  return results.filter((b): b is AudioBuffer => b !== null)
}

export async function loadSampleBank(ctx: AudioContext): Promise<SampleBank> {
  const [
    footstepsCloth,
    footstepsLeather,
    airvent,
    ambientHorror,
    atmos,
    impacts,
    doorOpens,
    doorCloses,
    creak,
    glitches,
    phoneClick,
    phoneDead,
    drips,
    splash,
    wade,
    pauseDown,
    pauseUp,
  ] = await Promise.all([
    loadList(ctx, FOOTSTEP_FILES),
    loadList(ctx, FOOTSTEP_LEATHER_FILES),
    tryLoad(ctx, AMBIENT_FILES.airvent),
    tryLoad(ctx, AMBIENT_FILES.ambientHorror),
    loadList(ctx, [
      AMBIENT_FILES.atmos1,
      AMBIENT_FILES.atmos2,
      AMBIENT_FILES.atmos3,
      AMBIENT_FILES.atmos4,
      AMBIENT_FILES.atmos5,
      AMBIENT_FILES.atmos6,
    ]),
    loadList(ctx, IMPACT_FILES),
    loadList(ctx, DOOR_OPEN_FILES),
    loadList(ctx, DOOR_CLOSE_FILES),
    tryLoad(ctx, CREAK_FILE),
    loadList(ctx, GLITCH_FILES),
    tryLoad(ctx, PHONE_CLICK_FILE),
    tryLoad(ctx, PHONE_DEAD_FILE),
    loadList(ctx, DRIP_FILES),
    tryLoad(ctx, SPLASH_FILE),
    tryLoad(ctx, WADE_FILE),
    tryLoad(ctx, PAUSE_DOWN_FILE),
    tryLoad(ctx, PAUSE_UP_FILE),
  ])

  return {
    footstepsCloth,
    footstepsLeather,
    airvent,
    ambientHorror,
    atmos,
    impacts,
    doorOpens,
    doorCloses,
    creak,
    glitches,
    phoneClick,
    phoneDead,
    drips,
    splash,
    wade,
    pauseDown,
    pauseUp,
  }
}

/**
 * 2-second pink-ish noise buffer for hum's noise floor (mono). Generated once
 * at init so the hum can run a BufferSource loop without AudioWorklet.
 *
 * Why pink-ish (running average) instead of white: a fluorescent ballast's
 * acoustic noise floor is rolled-off above ~2 kHz; pure white reads as hiss,
 * not as electrical hum.
 */
/**
 * Synthesized impulse response: exponentially-decaying noise with heavy
 * high-frequency rolloff. Level 0 is carpet and drop tile — highs die fast,
 * lows linger. Stereo decorrelation widens it without sounding "hall".
 */
export function makeImpulseResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const len = Math.floor(sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    let last = 0
    for (let i = 0; i < len; i++) {
      const t = i / len
      const w = Math.random() * 2 - 1
      // progressively darker as it decays (carpet eats the highs first)
      const k = 0.12 + t * 0.5
      last = last * (1 - k) + w * k
      data[i] = last * Math.pow(1 - t, decay) * 0.55
    }
  }
  return buf
}

export function makeNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const len = Math.floor(sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, sampleRate)
  const data = buf.getChannelData(0)
  // Simple 1-pole low-pass on white noise — cheap, perceptually pink-ish.
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    last = last * 0.86 + w * 0.14
    data[i] = last * 0.9
  }
  return buf
}
