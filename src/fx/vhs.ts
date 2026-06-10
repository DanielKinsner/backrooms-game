import { Effect, BlendFunction } from 'postprocessing'
import { Uniform } from 'three'

/**
 * Camcorder tape pass (DESIGN.md §10): scanlines, tracking wobble,
 * head-switching noise at the frame bottom, rare dropout streaks, black
 * lift and a sickly grade. Always on, always subtle — the medium is the
 * horror filter, never the gag. `intensity` is the director's dial.
 */
const frag = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void mainUv(inout vec2 uv) {
    // tracking wobble: slow breathing + per-row jitter, occasionally surging
    float surge = smoothstep(0.985, 1.0, sin(uTime * 0.37) * 0.5 + 0.5);
    float row = floor(uv.y * 312.0);
    float jitter = (hash(vec2(row, floor(uTime * 24.0))) - 0.5) * 0.0012 * (0.4 + surge * 3.0);
    float sway = sin(uTime * 1.1 + uv.y * 9.0) * 0.00035;
    uv.x += (jitter + sway) * uIntensity;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 c = inputColor.rgb;

    // scanlines
    float sl = sin(uv.y * resolution.y * 3.14159);
    c *= mix(1.0, 0.955 + 0.045 * sl, uIntensity);

    // head-switching noise band
    if (uv.y < 0.013) {
      float n = hash(vec2(uv.x * 491.0, floor(uTime * 47.0)));
      c = mix(c, vec3(n * 0.8), 0.55 * uIntensity);
    }

    // rare dropout streak
    float slot = floor(uTime * 2.0);
    float r = hash(vec2(slot, 7.0));
    if (r > 0.93) {
      float y0 = hash(vec2(slot, 13.0));
      float d = abs(uv.y - y0);
      c += vec3(0.30) * (1.0 - smoothstep(0.0, 0.002, d)) * uIntensity;
    }

    // tape grade: lifted blacks, sickly warm mids, gentle desaturation
    c = pow(c, vec3(0.96, 0.93, 1.02));
    c *= vec3(1.05, 1.015, 0.90);
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(luma), c, 0.88);
    c += vec3(0.012, 0.012, 0.007) * uIntensity;

    outputColor = vec4(c, inputColor.a);
  }
`

export class VHSEffect extends Effect {
  constructor() {
    super('VHSEffect', frag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['uTime', new Uniform(0)],
        ['uIntensity', new Uniform(1)],
      ]),
    })
  }

  override update(_renderer: unknown, _inputBuffer: unknown, deltaTime: number): void {
    const t = this.uniforms.get('uTime')!
    t.value += deltaTime
  }

  set intensity(v: number) {
    this.uniforms.get('uIntensity')!.value = v
  }

  get intensity(): number {
    return this.uniforms.get('uIntensity')!.value as number
  }
}
