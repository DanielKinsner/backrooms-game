import { Effect, BlendFunction } from 'postprocessing'
import { Uniform } from 'three'

/**
 * Camcorder tape pass (DESIGN.md §10, upgraded per the analog-horror research
 * brief): the medium is the horror filter, never the gag.
 *
 * The physical model, faked cheap:
 *  - VHS stores chroma at ~1/5 the bandwidth of luma → chroma is blurred
 *    horizontally and smeared rightward while luma stays sharp.
 *  - The head-switch point lives at the frame bottom and never heals.
 *  - Dropouts are horizontal comet streaks where oxide left the tape.
 *  - Real fluorescents have a mercury green spike and a red deficit (CRI
 *    distortion) — the grade carries a green bias and red desaturation, so
 *    anything red on set dies to brown. That's physics, not a LUT choice.
 *  - `uGeneration` is the story's ratchet: every act (and every re-stitch)
 *    re-copies the tape. Noise floor, chroma width and dropouts all scale.
 *  - `uTrackAmp` is the tracking surge: the picture fails so the world
 *    doesn't have to. The director fires it to mask re-stitches.
 *  - After the meta-beat the tape carries a permanent crease at uCreaseY:
 *    it was wounded in that moment and never heals.
 *  - Last line is an interleaved-gradient-noise dither: kills the banding
 *    that mono-yellow fog gradients otherwise guarantee, and reads as fine
 *    tape grain for free.
 */
const frag = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uGeneration;
  uniform float uTrackAmp;
  uniform float uInterference;
  uniform float uCrease;
  uniform float uCreaseY;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void mainUv(inout vec2 uv) {
    // tracking wobble: slow breathing + per-row jitter, occasionally surging
    float surge = smoothstep(0.985, 1.0, sin(uTime * 0.37) * 0.5 + 0.5);
    float row = floor(uv.y * 312.0);
    float jitter = (hash(vec2(row, floor(uTime * 24.0))) - 0.5) * 0.0012
      * (0.4 + surge * 3.0 + uInterference * 2.0);
    float sway = sin(uTime * 1.1 + uv.y * 9.0) * 0.00035;
    uv.x += (jitter + sway) * uIntensity;

    // gate weave: the whole frame breathes vertically, slow and small
    uv.y += sin(uTime * 1.7) * 0.0006 * uIntensity;

    // tracking surge: full-frame horizontal tearing that spikes and decays
    if (uTrackAmp > 0.003) {
      uv.x += sin(uv.y * 41.0 + uTime * 63.0) * 0.013 * uTrackAmp;
      float band = fract(uv.y * 3.0 - uTime * 1.7);
      if (band < 0.08) uv.x += (hash(vec2(floor(uTime * 40.0), row)) - 0.5) * 0.06 * uTrackAmp;
    }

    // head-switch band displacement: the bottom of every field tears sideways
    if (uv.y < 0.013) {
      uv.x += (hash(vec2(floor(uTime * 30.0), 3.0)) - 0.5) * 0.04 * uIntensity;
    }

    // the crease: a permanent horizontal wound (post-meta-beat only)
    if (uCrease > 0.5 && abs(uv.y - uCreaseY) < 0.018) {
      uv.x += (hash(vec2(row, floor(uTime * 31.0))) - 0.5) * 0.01;
    }
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float px = 1.0 / resolution.x;

    // --- chroma/luma separation -----------------------------------------
    // luma from the sharp center; chroma from a wide, right-smeared blur
    float chromaW = (2.5 + uGeneration * 4.5) * px;
    vec3 cL = texture2D(inputBuffer, uv + vec2(-chromaW, 0.0)).rgb;
    vec3 cR = texture2D(inputBuffer, uv + vec2(chromaW * 0.6, 0.0)).rgb;
    vec3 cRR = texture2D(inputBuffer, uv + vec2(chromaW * 1.7, 0.0)).rgb;
    vec3 chroma = (cL + cR + cRR) / 3.0;

    vec3 c = inputColor.rgb;
    float lumaC = dot(c, vec3(0.299, 0.587, 0.114));
    float lumaB = dot(chroma, vec3(0.299, 0.587, 0.114));
    // recombine: sharp luma + soft chroma (the VHS look, one line)
    c = chroma + vec3(lumaC - lumaB);

    // --- halation: bright edges fringe warm (consumer-tape tell) ---------
    float hal = max(0.0, max(dot(cL, vec3(0.333)), dot(cRR, vec3(0.333))) - 0.74);
    c.r += hal * 0.10;
    c.g += hal * 0.03;

    // --- scanlines + interlace twitter -----------------------------------
    float sl = sin(uv.y * resolution.y * 3.14159);
    c *= mix(1.0, 0.955 + 0.045 * sl, uIntensity);
    float fieldRow = floor(uv.y * resolution.y);
    c *= 1.0 - 0.012 * mod(fieldRow + floor(uTime * 59.94), 2.0) * uIntensity;

    // --- head-switching noise band ---------------------------------------
    if (uv.y < 0.013) {
      float n = hash(vec2(uv.x * 491.0, floor(uTime * 47.0)));
      c = mix(c, vec3(n * 0.8), 0.55 * uIntensity);
    }

    // --- dropout comets (oxide shed; more as the tape generations stack) --
    float slot = floor(uTime * 2.0);
    float r = hash(vec2(slot, 7.0));
    if (r > 0.93 - uGeneration * 0.05) {
      float y0 = hash(vec2(slot, 13.0));
      float x0 = hash(vec2(slot, 29.0)) * 0.8;
      float w = 0.1 + hash(vec2(slot, 31.0)) * 0.5;
      float d = abs(uv.y - y0);
      float inX = step(x0, uv.x) * (1.0 - smoothstep(x0 + w * 0.7, x0 + w, uv.x));
      float bright = hash(vec2(slot, 37.0)) > 0.2 ? 0.35 : -0.25; // mostly white, sometimes black
      c += vec3(bright) * (1.0 - smoothstep(0.0, 0.0018, d)) * inX * uIntensity;
    }

    // --- the crease: flickers and sheds dropouts forever ------------------
    if (uCrease > 0.5) {
      float cd = abs(uv.y - uCreaseY);
      if (cd < 0.012) {
        float n = hash(vec2(floor(uv.x * 240.0), floor(uTime * 18.0)));
        c += vec3(n * 0.22) * (1.0 - cd / 0.012);
      }
    }

    // --- interference: a rolling band of static (presence/beat proximity) --
    if (uInterference > 0.01) {
      float bandY = fract(uTime * 0.13);
      float bd = abs(uv.y - bandY);
      if (bd < 0.02) {
        float n = hash(vec2(uv.x * 387.0, floor(uTime * 60.0)));
        c = mix(c, vec3(n * 0.7), uInterference * 0.5 * (1.0 - bd / 0.02));
      }
    }

    // --- tape grade -------------------------------------------------------
    // lifted blacks, GREEN-spiked mids (mercury line), starved red (CRI).
    c = pow(c, vec3(0.97, 0.93, 1.02));
    c *= vec3(1.0, 1.035, 0.88);
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    c.r = mix(c.r, luma, 0.13); // red pigment dies to brown under these lights
    c = mix(vec3(luma), c, 0.88 - uGeneration * 0.1);
    c += vec3(0.012, 0.013, 0.007) * (uIntensity + uGeneration);

    // --- interleaved gradient noise dither: kills fog banding, reads as grain
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    c += vec3((ign - 0.5) * (1.5 / 255.0) * (1.0 + uGeneration * 2.0));

    outputColor = vec4(c, inputColor.a);
  }
`

export class VHSEffect extends Effect {
  /** Where the surge envelope currently sits (the HUD's TRACKING readout). */
  private trackAmp = 0
  private generationBase = 0
  private generationSpike = 0

  constructor() {
    super('VHSEffect', frag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['uTime', new Uniform(0)],
        ['uIntensity', new Uniform(1)],
        ['uGeneration', new Uniform(0)],
        ['uTrackAmp', new Uniform(0)],
        ['uInterference', new Uniform(0)],
        ['uCrease', new Uniform(0)],
        ['uCreaseY', new Uniform(0.31)],
      ]),
    })
  }

  override update(_renderer: unknown, _inputBuffer: unknown, deltaTime: number): void {
    const t = this.uniforms.get('uTime')!
    t.value += deltaTime
    // surge decays on its own; generation spikes settle back to the base
    this.trackAmp = Math.max(0, this.trackAmp - deltaTime * 1.4)
    this.generationSpike = Math.max(0, this.generationSpike - deltaTime * 0.04)
    this.uniforms.get('uTrackAmp')!.value = this.trackAmp
    this.uniforms.get('uGeneration')!.value = Math.min(
      1,
      this.generationBase + this.generationSpike,
    )
  }

  set intensity(v: number) {
    this.uniforms.get('uIntensity')!.value = v
  }

  get intensity(): number {
    return this.uniforms.get('uIntensity')!.value as number
  }

  /** Director: the picture fails so the world doesn't have to. */
  trackingSurge(strength = 1): void {
    this.trackAmp = Math.max(this.trackAmp, Math.min(1, strength))
  }

  /** Story-depth ratchet (acts). Spikes settle; the base never goes back. */
  set generation(v: number) {
    this.generationBase = Math.max(this.generationBase, Math.min(1, v))
  }

  /** A re-copy event: the tape gets a little worse, then mostly recovers. */
  bumpGeneration(spike = 0.06): void {
    this.generationSpike = Math.min(0.4, this.generationSpike + spike)
  }

  /** Presence/beat proximity 0..1 — drives the rolling static band. */
  set interference(v: number) {
    this.uniforms.get('uInterference')!.value = Math.max(0, Math.min(1, v))
  }

  /** The meta-beat wounds the tape permanently. */
  enableCrease(): void {
    this.uniforms.get('uCrease')!.value = 1
  }

  /** True while a surge or the autonomous wobble peak is visibly tearing. */
  get surging(): boolean {
    const t = this.uniforms.get('uTime')!.value as number
    const auto = Math.sin(t * 0.37) * 0.5 + 0.5 > 0.985
    return this.trackAmp > 0.3 || auto
  }
}
