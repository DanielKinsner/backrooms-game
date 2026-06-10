# High-Fidelity Browser 3D for a First-Person Horror Game — 2026 Tech Brief

Scope: a public-shipping, web-deployed first-person horror title (think "Backrooms") with procedural indoor environments, realistic fluorescent lighting, postprocessed grit, HRTF audio, and GitHub Pages deployment. Recommendations are scoped to **June 2026** and prefer paths that are stable today, not paths that will be stable "soon".

---

## 1. three.js core: version, WebGPU, WebGL2

### Current release
- **`three@0.184.x` (r184)** is the current production release on npm, published April 2026. r185 is in flight with WebXR-on-WebGPU work.
- For a horror game shipping in 2026 the recommended pin is `three@^0.184.0`. Avoid floating to `next` / `dev` builds — TSL surface area is still drifting and you do not want random shader breakages mid-development.

### WebGPURenderer is now production-eligible — but with caveats
- Since **r171 (Sep 2025)** `WebGPURenderer` ships with zero-config setup, and Safari 26 added WebGPU in September 2025. WebGPU went **Baseline** (Chrome, Edge, Firefox, Safari) in early 2026.
- The recommended import is `import * as THREE from 'three/webgpu'`. The renderer **auto-falls-back to WebGL2** if WebGPU is missing — you do not need to ship two renderer paths.
- r183 introduced `RenderPipeline`, the node-based replacement for the old `EffectComposer`. It is WebGPU-first with automatic WebGL2 fallback.

### Recommended path for a 2026 horror game
- **Use the WebGPU renderer (`three/webgpu`) with TSL** as the primary path, with the built-in WebGL2 fallback covering the residual ~5% of users.
- **But** keep the renderer choice behind a single seam in your engine (e.g. `createRenderer(canvas)`), because:
  - some third-party post stacks (specifically pmndrs `postprocessing`, see §2) are still WebGL2-only;
  - `RectAreaLight` requires different uniform/texture lib initialization on the two renderers (see §3);
  - shader debugging tooling is still richer on WebGL2.
- If your timeline is tight and you do not need WebGPU compute, **WebGL2 + `three@0.184` + pmndrs/postprocessing is the lowest-risk shipping configuration today**. WebGPU is the long-game.

### TSL (Three Shader Language)
- TSL is now the **first-class** shader authoring layer. New material features are TSL-first, raw GLSL is deprecated for new code.
- TSL compiles to **WGSL on WebGPU** and **GLSL on WebGL2** from one source — write your atmospheric/lighting/postprocess shaders in TSL even on WebGL2 today so the WebGPU port is free.

---

## 2. Postprocessing

### pmndrs `postprocessing` — still the right choice on WebGL2
- Current version: **`postprocessing@6.39.1`** (Zlib license). Peer-dep range: `three@0.157.0 – 0.176.x` per its `package.json`. It does still run against `three@0.184`, but you may see peer-warning noise; pin three and override the peer if needed.
- Status: actively maintained, single linear effect pipeline, hand-merges effects into one fullscreen pass for performance. **WebGL2 only** — it does **not** target WebGPURenderer.

### Effects available in `postprocessing@6.39`
All of these are first-party and merge-compatible:
- **Bloom** (`BloomEffect`) — selective, with luminance threshold.
- **SSAO** (`SSAOEffect`) — and a newer GTAO is in three.js core examples (`webgl_postprocessing_gtao`).
- **Chromatic Aberration** (`ChromaticAberrationEffect`).
- **Vignette** (`VignetteEffect`).
- **Noise / film grain** (`NoiseEffect`).
- **LUT color grading** (`LUT3DEffect` / `LUTPass`) — 3D LUT, drop in a `.cube` or PNG strip.
- **Depth of field** (`DepthOfFieldEffect`) — bokeh, focus distance from depth.
- Plus `ToneMappingEffect`, `BrightnessContrastEffect`, `HueSaturationEffect`, `GodRaysEffect`, `OutlineEffect`, `SMAAEffect` / `FXAAEffect`.

### WebGPU postprocessing path
- Use **three.js core `RenderPipeline`** with TSL post nodes: `BloomNode`, `GTAONode`, `SSAOPass`, etc. Pmndrs has **not** ported `postprocessing` to WebGPU as of June 2026.
- Drei's `EffectComposer` for R3F still wraps pmndrs/postprocessing and is therefore also WebGL2-only.

### Recommendation
For a horror look (bloom on fluorescents, GTAO under shelves, slight vignette, light film grain, LUT for sickly greens) **start on WebGL2 + pmndrs/postprocessing 6.39**. Pin three to 0.184 and override the postprocessing peer range. Plan a port to TSL `RenderPipeline` once WebGPU is your default — but do not let that block shipping.

---

## 3. Realistic indoor lighting

### RectAreaLight + LTC for fluorescent fixtures — the right tool
- `RectAreaLight` simulates a uniformly emitting rectangle and uses **Linearly Transformed Cosines** for the area-light math. This is the correct primitive for fluorescent tube fixtures, ceiling panels, and bright windows.
- Init differs per renderer:
  - WebGL2: `RectAreaLightUniformsLib.init()`.
  - WebGPU: `RectAreaLightTexturesLib.init()`.
- **Constraints to know**: only `MeshStandardMaterial` and `MeshPhysicalMaterial` are lit by it; **it has no native shadow support**; it is the most expensive light type — budget ~6-12 active rect lights per frame on desktop, fewer on integrated GPUs.

### Workaround for no shadows from RectAreaLight
For a horror interior you usually want the bright fixture *with* a contact shadow. Common pattern:
- `RectAreaLight` for the soft directional fill the tube actually casts.
- A **disabled-color, shadow-only `DirectionalLight` or `SpotLight`** at the same position with `light.castShadow = true`, `light.intensity = 0`, and `material.shadowSide = THREE.FrontSide` — purely to drop the contact shadow. (Or bake the AO; see below.)

### Lightmap baking for procedural geometry — generally not viable
- Lightmaps need stable UVs, which you do not have when geometry is procedurally generated each session. Atlas packing + offline-style baking at runtime is too slow for chunked streaming.
- `@react-three/lightmap` exists (in-browser AO/GI baker) but expects authored scenes, not infinite chunked worlds.

### Recommended faked-GI stack for procedural interiors
1. **Ambient + hemisphere base** — `HemisphereLight(skyColor, groundColor, ~0.15)` for the cheap directional ambient cue.
2. **Per-chunk AO** — bake an **AO texture per unique room module** at build time (in Blender, output to KTX2), then sample it on the procedural assembly. Modules repeat, so this is feasible.
3. **Screen-space AO at runtime** — **GTAO** preferred over SSAO; modern, less haloing, comparable cost. Available both in pmndrs/postprocessing (SSAO) and in three.js core examples / `RenderPipeline` (`GTAOPass`/`GTAONode`).
4. **RectAreaLight** for each active fluorescent fixture in the player's chunk radius (cull aggressively).
5. **Emissive materials** on the tubes themselves so bloom does the visual heavy lifting.

### Fog
- **`THREE.FogExp2(color, density)`** is exactly right for the horror look. Typical starting density: `0.035 – 0.08` for tight indoor corridors. Color slightly desaturated, tinted toward the fluorescent color temperature (mint/yellow-green for backrooms-classic) — fog color and clear color must match.
- Fog is per-material (`material.fog`) — instanced/batched meshes must opt in.

---

## 4. Collision and character control

### `three-mesh-bvh@0.9.10` — the standard choice
- Latest version: **0.9.10**, June 2026. Stable, actively maintained by `gkjohnson`.
- Provides `MeshBVH` you attach to a `BufferGeometry`; then `shapecast()` lets you intersect arbitrary shapes (boxes, spheres, **capsules via segment-closest-point**) against the BVH in roughly O(log n).
- Capsule pattern: define the capsule as a line segment + radius, use `triangle.closestPointToSegment(segment, ...)` inside the `intersectsTriangle` callback to compute push-out vectors.

### FPS controller pattern (hand-rolled, recommended)
A capsule + BVH controller, no physics engine needed, gives you tight movement:

1. **Camera**: `PerspectiveCamera` (fov 75-90), child of a "head" node, parented to a "body" node at capsule top.
2. **Input**: `PointerLockControls` from `three/examples/jsm/controls/PointerLockControls.js` — captures the mouse for true FPS look. WASD / Shift (sprint) / Ctrl or C (crouch) / Space (jump).
3. **Movement integration**: semi-implicit Euler. Apply input acceleration to horizontal velocity, gravity to vertical, clamp to max speed (e.g. 4 m/s walk, 7 m/s sprint).
4. **Collision step** (do this **after** integration, **before** rendering):
   - Translate the capsule by `velocity * dt`.
   - `bvh.shapecast({ intersectsBox, intersectsTriangle })` — for each triangle that the capsule's AABB overlaps, compute closest point on the capsule segment, push the capsule out along the normal by `(radius - distance)`.
   - Iterate the push-out 4-5 times per frame for stability against corners.
5. **Ground check**: project a small downward segment from capsule bottom; if it hits within `groundEpsilon`, `isGrounded = true`, zero negative vertical velocity, allow jump.
6. **Crouch**: lerp capsule height between e.g. 1.8m and 1.0m over ~150ms. **Block stand-up** if the upper capsule sample-points overlap geometry (BVH spherecast).
7. **Mantle**: cast a forward ray at chest height — if it hits within reach **and** a downward ray from the hit's top finds a ledge within `mantleHeight`, trigger a scripted lerp of the body to the ledge top over ~250ms with input locked.

### Why not Rapier / Cannon / Ammo
- For a single-player walking-sim with one capsule and static geometry, a physics engine is overkill, adds ~200-400KB to the bundle, and complicates determinism. `three-mesh-bvh` + hand-rolled capsule sweep is what most modern web-FPS demos ship with.

### Performance tip
- Build the BVH **once per chunk** (`geometry.computeBoundsTree()` from `three-mesh-bvh`'s extension), keep it alive while the chunk is loaded, dispose with the chunk. Do **not** rebuild every frame.

---

## 5. Infinite / chunked world streaming

### Batching primitives
- **`InstancedMesh`** — same geometry, N transforms, one draw call. Use for: lights, chairs, identical wall panels, vents, ceiling tiles.
- **`BatchedMesh`** — since r156, **stable in 2026**, multi-draw extension when available. Different geometries, same material, one draw call. Use for: a chunk's varied prop geometry (different shelves, different debris). On dGPU expect ~2× speedup over per-mesh draws, ~1.5× on iGPU.
- Rule of thumb: same geometry → `InstancedMesh`; varied geometry, same material → `BatchedMesh`; everything else → consider material atlasing.

### Chunk lifecycle
1. **Spatial hash** keyed by integer chunk coords; player's chunk + N-ring is the active set.
2. **Streaming**:
   - On enter-ring: generate chunk geometry on a Web Worker (procedural rules, then triangulate), transfer the typed arrays via `postMessage` (transferable), build `BufferGeometry` on main thread, `geometry.computeBoundsTree()`, add to scene.
   - On exit-ring: `scene.remove(chunk)`, then **dispose explicitly**: `geometry.dispose()`, all `material.dispose()`, all `texture.dispose()`, `geometry.disposeBoundsTree()`. Monitor `renderer.info.memory` — geometries/textures must trend flat as the player wanders.
3. **Frustum culling**: three.js culls per-`Object3D` by default. Disable manual culling only when you have proven it is wrong. For `InstancedMesh`/`BatchedMesh`, set `frustumCulled = false` if the bounding sphere is unreliable, and rely on the BVH-driven per-instance culling extension instead.
4. **Texture strategy**: KTX2 (BasisU) compressed textures via `KTX2Loader` — ~4-8× smaller GPU footprint than PNG/JPG.

### Pool, don't allocate
- For frequently spawned objects (loose paper, ceiling-tile debris) keep an object pool keyed by type. Allocating new geometries inside the play loop is the #1 cause of jank.

---

## 6. Audio: HRTF, procedural hum, AudioWorklet

### Spatialization
- **`PannerNode` with `panningModel = 'HRTF'`** gives convolution-based 3D positional audio — the right tool for horror cues that need to come from *behind*. It is the only built-in way to get convincing front/back disambiguation in stereo headphones.
- HRTF is **expensive** (convolution per source). Budget:
  - Desktop: ~16-24 simultaneous HRTF voices fine.
  - Mobile / low-end: switch to `panningModel = 'equalpower'` (cheap stereo pan) for distant or non-critical sources, keep HRTF for player-proximity cues.
- Set `distanceModel = 'inverse'`, `refDistance = 1`, `rolloffFactor` ~1.5 for tight indoor falloff.
- Update `panner.positionX/Y/Z` and `orientationX/Y/Z` via the `.setValueAtTime` automation API every frame from the entity's transform — avoid the deprecated `setPosition`/`setOrientation`.

### Procedural fluorescent hum
Approximate recipe (the iconic flickering 60Hz hum):
- Mains hum is **60 Hz fundamental** (US) or 50 Hz (EU) — but the magnetic ballast's hum is dominated by **120 Hz** (2× mains, from the rectified AC), with harmonics at 240, 360, 480 Hz.
- Use **3-4 `OscillatorNode`s** at `[120, 240, 360, 480]` Hz with `type = 'sine'`, decreasing gain (e.g. 0.20, 0.10, 0.05, 0.025).
- Sum into a `GainNode`, then through a **`BiquadFilterNode` lowpass at ~1.2 kHz** to soften.
- Add a **noise source** (an `AudioWorkletNode` emitting white noise, lowpassed to ~3 kHz) at very low gain (~0.02) for the "buzz floor".
- Modulate the master gain with an LFO (a slow `OscillatorNode` at ~3 Hz, low gain into the master's `gain.gain`) for the unsteady flicker-amplitude.
- Spatialize the result through a `PannerNode` at the fixture's position.
- This whole thing is ~30 lines and free per-fixture (no asset loading), and identical each session — perfect for procedural worlds.

### AudioWorklet status
- AudioWorklet is **fully shipped** and the **mandatory standard** for any custom DSP in 2026 (`ScriptProcessorNode` is deprecated). Use it for: custom noise generators, reverb tails, sidechain compression, the ducking implementation below.
- Register worklets at game boot: `await audioCtx.audioWorklet.addModule('/worklets/noise.js')`.

### Mixing + ducking
- Build a **bus graph**: SFX bus, Ambience bus, Music bus, UI bus → each a `GainNode` → master `GainNode` → `audioCtx.destination`.
- **Ducking** (e.g. duck ambience when a monster sting plays): connect the sting's envelope follower to the ambience bus gain via a worklet doing simple peak-detection, target -12dB attenuation with ~80ms attack / ~400ms release.
- Always **resume the AudioContext on the first user gesture** (`pointerdown` listener that calls `audioCtx.resume()`); browsers block autoplay otherwise.

---

## 7. Project setup: Vite + TypeScript + three.js + GitHub Pages

### Toolchain (June 2026 versions)
- `vite@^7` (Vite 7 is current as of mid-2026)
- `typescript@^5.6`
- `three@^0.184.0` + `@types/three@^0.184` (or use three's own bundled types)
- `three-mesh-bvh@^0.9.10`
- `postprocessing@^6.39` (if going WebGL2)
- Dev: `@types/three`, `vite-plugin-glsl` (optional, for `.glsl` imports if you still write raw GLSL)

### Recommended layout
```
/src
  main.ts                  # bootstrap
  engine/
    renderer.ts            # createRenderer() — WebGPU with WebGL2 fallback
    loop.ts                # rAF, fixed-timestep integration
    input.ts               # PointerLockControls + key state
    audio/
      bus.ts               # AudioContext + bus graph
      hrtf.ts              # spatial source factory
      hum.ts               # procedural fluorescent hum
  world/
    chunk.ts               # per-chunk geometry + BVH
    streaming.ts           # ring of active chunks, worker dispatch
    workers/
      generate.worker.ts   # procedural generation, off-main-thread
  player/
    controller.ts          # capsule + BVH push-out, sprint/crouch/mantle
  fx/
    post.ts                # postprocessing EffectComposer (or RenderPipeline on WebGPU)
  shaders/                 # TSL nodes; .ts files, not .glsl
/public                    # static assets (KTX2 textures, audio worklets)
/.github/workflows/deploy.yml
vite.config.ts
tsconfig.json
index.html
```

### `vite.config.ts` for GitHub Pages
```ts
import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''}/` : '/',
  build: { target: 'es2022', sourcemap: true },
  worker: { format: 'es' },
});
```
The `base` must match the repo name when deployed to `https://<user>.github.io/<repo>/`. Use `./` for relative if you serve from the root.

### GitHub Actions deploy (`.github/workflows/deploy.yml`)
- `actions/checkout@v4`
- `actions/setup-node@v4` with Node 22
- `npm ci && npm run build`
- `actions/upload-pages-artifact@v3` with `./dist`
- `actions/deploy-pages@v4`
- Required `permissions: { pages: write, id-token: write }`
- Repo Settings → Pages → Source: **GitHub Actions** (not the legacy branch-deploy).

### Things that bite on Pages
- Asset paths must respect `base`. Use Vite's `import url from './foo.png?url'` rather than hard-coded `/foo.png`.
- AudioWorklet module paths must include the base: `audioWorklet.addModule(import.meta.env.BASE_URL + 'worklets/noise.js')`.
- Verify with `npm run build && npx serve dist` locally before pushing.

---

## Recommended architecture summary

**Renderer**: `three@0.184` via `three/webgpu` (auto-falls-back to WebGL2). Single `createRenderer(canvas)` seam so we can swap if needed.

**Materials**: `MeshStandardMaterial` everywhere; emissive on fluorescents. Shaders in **TSL** so we are WebGPU-portable for free.

**Lighting**: `HemisphereLight` ambient + per-fixture `RectAreaLight` (LTC) for tubes + shadow-only `SpotLight` for contact shadow. Per-module baked AO maps as KTX2. **GTAO** in post. `FogExp2` mint-tinted at ~0.05.

**Post (WebGL2 path)**: `postprocessing@6.39` — Bloom (selective on emissives), GTAO/SSAO, Chromatic Aberration (mild), Vignette, Noise (film grain), LUT3D for a sickly green grade.

**Collision**: `three-mesh-bvh@0.9.10`, BVH built per chunk on load, hand-rolled capsule controller with `PointerLockControls`, sprint/crouch/mantle.

**World**: chunked ring around player, worker-generated, `InstancedMesh` + `BatchedMesh` for props, KTX2 textures, hard discipline on `dispose()` on chunk eviction.

**Audio**: bus graph (SFX/Ambience/Music/UI → master), HRTF `PannerNode` for proximity sources, procedural fluorescent hum (120/240/360/480 Hz sines + lowpassed noise + 3 Hz amplitude LFO), AudioWorklet for ducking.

**Build**: Vite 7, TypeScript 5.6, GitHub Actions deploying to Pages with `base` set to the repo name.

**Risks to monitor**:
1. `postprocessing@6.39` peer-dep range is behind `three@0.184` — you will need an `overrides` block in package.json to suppress install warnings, and you must smoke-test every effect against the version you ship.
2. `RectAreaLight` has no native shadows — plan the shadow-only secondary light from day one, not as a fix-up.
3. HRTF voice budget — design the audio system with a per-frame budget (16 simultaneous HRTF voices), demote farther sources to `equalpower` automatically.
4. Chunk disposal leaks — wire `renderer.info.memory` to a debug HUD from week one. Catch leaks while the codebase is small.

---

## Sources

- [three.js Releases on GitHub](https://github.com/mrdoob/three.js/releases)
- [three on npm](https://www.npmjs.com/package/three)
- [What's New in Three.js (2026): WebGPU, New Workflows & Beyond — utsubo.com](https://www.utsubo.com/blog/threejs-2026-what-changed)
- [Migrate Three.js to WebGPU (2026) — The Complete Checklist — utsubo.com](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)
- [The Complete Guide to Three.js Post-Processing in 2026 — threejsroadmap.com](https://threejsroadmap.com/blog/the-complete-guide-to-threejs-post-processing-in-2026)
- [WebGPU Just Hit Baseline in Every Major Browser — vr.org](https://vr.org/articles/webgpu-baseline-2026-three-js-webxr-default)
- [TSL — three.js docs](https://threejs.org/docs/pages/TSL.html)
- [Field Guide to TSL and WebGPU — Maxime Heckel](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/)
- [WebGPURenderer — three.js docs](https://threejs.org/docs/pages/WebGPURenderer.html)
- [pmndrs/postprocessing on GitHub](https://github.com/pmndrs/postprocessing)
- [postprocessing on npm](https://www.npmjs.com/package/postprocessing)
- [three.js webgl postprocessing GTAO example](https://threejs.org/examples/webgl_postprocessing_gtao.html)
- [three.js webgl postprocessing SSAO example](https://threejs.org/examples/webgl_postprocessing_ssao.html)
- [RectAreaLight — three.js docs](https://threejs.org/docs/api/en/lights/RectAreaLight.html)
- [three.js webgl lights RectAreaLight example](https://threejs.org/examples/webgl_lights_rectarealight.html)
- [pmndrs/react-three-lightmap](https://github.com/pmndrs/react-three-lightmap)
- [Lightmap Baking in Blender for Three.js — Pixel Capture](https://www.pixel-capture.com/tutorials/lightmap-baking-in-blender)
- [FogExp2 — three.js docs](https://threejs.org/docs/pages/FogExp2.html)
- [gkjohnson/three-mesh-bvh on GitHub](https://github.com/gkjohnson/three-mesh-bvh)
- [three-mesh-bvh on npm](https://www.npmjs.com/package/three-mesh-bvh)
- [three-mesh-bvh Sphere Physics example](https://gkjohnson.github.io/three-mesh-bvh/example/bundle/physics.html)
- [PointerLockControls example — three.js](https://threejs.org/examples/misc_controls_pointerlock.html)
- [BatchedMesh — three.js docs](https://threejs.org/docs/pages/BatchedMesh.html)
- [InstancedMesh — three.js docs](https://threejs.org/docs/api/en/objects/InstancedMesh.html)
- [InstancedMesh vs BatchedMesh discussion — three.js forum](https://discourse.threejs.org/t/instancedmesh-vs-batchedmesh/31243)
- [How to choose between InstancedMesh and BatchedMesh — three.js forum](https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221)
- [100 Three.js Tips That Actually Improve Performance (2026) — utsubo.com](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [Dispose things correctly in three.js — three.js forum](https://discourse.threejs.org/t/dispose-things-correctly-in-three-js/6534)
- [Tips on preventing memory leaks in Three.js — Roger Chi](https://roger-chi.vercel.app/blog/tips-on-preventing-memory-leak-in-threejs-scene)
- [Web audio spatialization basics — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics)
- [PannerNode panningModel — MDN](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/panningModel)
- [Web Audio API 1.1 — W3C](https://www.w3.org/TR/webaudio-1.1/)
- [Web Audio API: Immersive Soundscapes for WebXR in 2026 — weskill.org](https://blog.weskill.org/2026/03/web-audio-api-immersive-soundscapes-for.html)
- [How to Create Procedural Audio Effects in JavaScript — dev.to / hexshift](https://dev.to/hexshift/how-to-create-procedural-audio-effects-in-javascript-with-web-audio-api-199e)
- [Deploying a Static Site — Vite docs](https://vite.dev/guide/static-deploy)
- [Host using GitHub Pages — Three.js Tutorials (sbcode.net)](https://sbcode.net/threejs/github-pages-vite/)
- [fdoganis/three_vite — Vite + three.js template](https://github.com/fdoganis/three_vite)
- [pachoclo/vite-threejs-ts-template](https://github.com/pachoclo/vite-threejs-ts-template)
- [Deploying Vite to GitHub Pages with a Single GitHub Action — Savas Labs](https://savaslabs.com/blog/deploying-vite-github-pages-single-github-action/)
