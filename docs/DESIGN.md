# NOCLIP — Design Document

*A browser-playable psychological-horror descent into Level 0 of the Backrooms.*
*Synthesized from the research briefs in [`docs/research/`](research/) — lore, psychology, tech, assets, market. Those briefs are the evidence base; this doc is the decisions.*

---

## 1. The one-sentence pitch

You are the person who took the original Backrooms photo — a man filming a store renovation in Oshkosh, Wisconsin, June 2002 — and the tape you are watching is what the camcorder recorded after he noclipped through the floor of reality.

## 2. Why this framing wins

- **It's true to the lore at a depth no cheap adaptation reaches.** The actual origin photo was traced (May 2024) to a June 2002 renovation photo of 807 Oregon Street, Oshkosh, WI. We don't imitate Kane Pixels' A-Sync framing — we go one layer deeper into the real mythos: *you are the camera that started it.*
- **Found-footage VHS is the highest-leverage premium signal** (market brief): camcorder HUD (REC dot, tape timestamp `JUN 12 2002`, battery), handheld sway, VHS grading. It gives us a diegetic excuse for every UI element and post effect, and the lo-fi medium *hides* the polygon budget while *amplifying* dread.
- **The tape is the 4th wall.** The game pretends to be a recovered recording. That premise carries the psychological-horror payload: tracking glitches can *lie*, timestamps can *skip*, and the one earned meta-break at the climax is the tape itself acknowledging you.

## 3. Pillars (ban list included)

1. **The dread is the entity.** Level 0 purist canon: nothing visibly hunts you for most of the run. Max **three** scripted entity beats total (distant silhouette → audio-only stalking → one near-miss). Never fully lit, never up close, never explained.
2. **Mono-yellow, over-lit, sickly.** No dark-horror purple/teal cowardice. The horror is bright. Limited visibility comes from fog and architecture, not darkness (with ONE earned lights-out zone).
3. **Sound is half the game.** Continuous procedural fluorescent hum-buzz as the level's voice; HRTF spatialization; sudden silence as the loudest sound in the game; no orchestral stingers, no music. Diegetic only.
4. **Simple controls, complex paranoia.** Walk, sprint, crouch, mantle, interact. Every neuron not spent on controls is spent on fear.
5. **The maze lies, but only behind your back.** Geometry mutates exclusively outside the view frustum. Retracing yields new rooms. The map in the player's head must slowly rot.
6. **20–40 minutes, authored ending, ambiguous resolution.** A tight cut beats an endless wander. The ending must generate post-play rumination, not answers.

**Banned** (each killed a shipped competitor): jump-scare audio spam, visible chase AI loops, mappable coherent levels, monster reveals, scavenger-hunt objectives ("find 8 batteries"), exposition dumps, music.

## 4. Structure — four acts on one tape

| Act | ~Time | Space | What happens |
|---|---|---|---|
| **0 — The Renovation** | 2–3 min | Empty retail store, 2002 | Tutorialless intro. You film the gutted store (movement learned naturally). One hallway is wrong. The carpet sags. You fall *through* — noclip static burst. |
| **1 — Mono-Yellow** | 8–12 min | Level 0 pure | The hum begins and never stops. Wandering, damp carpet, landmark anchors, the first handwritten notes from a previous wanderer ("KEEP MOVING / DON'T TRUST THE ARROWS"). Behind-the-back re-stitching starts. No entity. |
| **2 — Wrongness** | 8–12 min | Level 0 decaying | The 60–120s wrongness cadence escalates *implication*: a hallway too long, a doorway too low, wallpaper pareidolia, a flooded stretch, the first SILENCE event, almond water, the lights-out zone, the **distant silhouette** (sub-2-second, through camcorder zoom only). A false-safety room (~60% mark) reloads the dread budget. |
| **3 — The Descent** | 5–8 min | Utility halls | A torn wall reveals concrete and pipes going *down*. Audio-only stalking (it heard you). Heartbeat pulse creeps 60→90 BPM. The near-miss. The earned 4th-wall beat. The exit. |
| **Ending** | 1 min | — | You climb through and emerge… in the store, June 2002, morning light. The camcorder battery icon blinks. As the tape runs out, the last frames show the yellow seeping through the fresh paint. SMPTE bars. Silence. No explanation, ever. |

## 5. Mechanics

- **Move/look** — pointer-lock mouse + WASD. Handheld camera sway scaled by speed; amateur-camcorder imperfection (micro-lookaways, settle lag), never gimbal-smooth.
- **Sprint** — Shift; stamina expressed *only* through audio (breathing builds, never a bar). Sprinting is loud. The notes warn you about being loud.
- **Crouch** — Ctrl/C; required for low gaps; slower, quieter.
- **Mantle/climb** — auto-prompt at chest-height ledges (desks, half-walls, the hole down); Space to vault. Input locked during the ~0.8s mantle.
- **Interact** — E on gaze raycast: pick up/read notes (held up to the lens to read — diegetic), flip light switches (some do nothing; some shouldn't have done what they did), open doors, drink almond water (steadies the camera/breathing), pick up tapes.
- **Camcorder zoom** — RMB hold. The only way Act 2's silhouette is ever visible. Zoom adds compression noise + autofocus hunt.

**No:** inventory screens, maps, health bars, batteries, fetch quests.

## 6. The world — hybrid authored-procedural, infinite by lying

Market verdict: pure procgen reads cheap in <10 minutes; pure authored can't feel infinite. So:

- **~20 hand-authored room modules** (corridor, pillar hall, room cluster, dead-end nook, flooded stretch, mezzanine with mantle ledge, etc.), each with stable baked-feel lighting and 2–6 sockets.
- **Seeded assembler** stitches modules into chunks streamed around the player (Web Worker generation, BVH per chunk, full dispose on eviction).
- **Non-Euclidean re-stitch:** chunks behind the view frustum and beyond an acoustic radius are eligible for silent regeneration. Walk straight long enough and the assembler quietly hands you your starting module back, aged slightly.
- **Landmark injector** guarantees 6–8 unique anchors per run (the red stain, the child's drawing, the dead camcorder of the wanderer before you, the humming supply room) on an act-paced schedule — lost is good, bored-lost is the failure mode.
- **The director owns the topology.** Act transitions are spatial promises: Act 3's descent hole spawns when the director decides you've ripened, in a wall you haven't looked at for 90 seconds.

## 7. The presence — entity as audio system

- A **virtual entity position** managed by an Alien:Isolation-style two-brain director: the director knows where you are; the entity only gets nudged toward your *general area* and "searches" imperfectly.
- It manifests as: carpet-muffled footsteps that almost-but-don't-quite echo yours, the hum detuning as it passes under fixtures, a wet exhale at the edge of HRTF resolution, ceiling tiles ticking overhead.
- **Sight beats:** exactly three, scripted by act (see §4). Despawn-on-direct-look after 1.8s. Through-lens only, distance only, sub-2s only.
- **The Amnesia lie:** a found note says *"IT HEARS THE TAPE. PAUSE THE TAPE WHEN IT'S CLOSE"* — pausing (holding Q, screen freezes to a paused-VHS frame while the world keeps making sound) does nothing mechanically. Players will police themselves harder than any AI could.

## 8. The director — pacing dread

A single `Director` system schedules **wrongness events** on a 60–120s cadence, escalating implication not volume, drawing from pools per act:

- *Spatial:* corridor extended while unobserved; door now where wall was; the room you just left is different if re-entered.
- *Light:* one distant fixture dies; a fixture flickers in your peripheral only; the lights-out zone.
- *Sound:* hum detune ±6 cents; single distant impact (HRTF, 30–60m); the SILENCE events (full bed cut, 8–20s — scheduled at least twice); footstep echo gains +1 step.
- *Pareidolia:* 2–3 total, faint face-structure in wallpaper stain visible only off-center (peripheral-vision bias), gone when fixated.
- *Meta (exactly one, Act 3 climax):* the tape glitches, the timestamp rolls back to the moment you fell, and for 1.5 seconds the HUD's REC label reads **PLAY** — the tape has been watching you back. (Browser-safe, diegetic, earned.)

Anti-habituation: event classes never repeat twice in a row; density backs off after each spike; the false-safety room is a scheduled trough.

## 9. Sound design (the actual half of the budget)

**Bus graph:** `ambience / sfx / presence / ui → master` with worklet-driven ducking and a master limiter (no peak above −3 dBFS — ear-splitting stingers are a banned competitor mistake).

- **The hum:** procedural, per-fixture. Sines at 120/240/360/480 Hz (ballast hum = 2× mains dominant), gains 0.20/0.10/0.05/0.025, lowpass ~1.2 kHz, quiet worklet noise floor, ~3 Hz flicker LFO, each routed through an HRTF `PannerNode` at the fixture position (voice-pooled, distant fixtures demote to equal-power). The hum is the level's voice: it detunes when the presence is near, and its absence is the scariest sound we own.
- **Dread bed:** sub 30–60 Hz pad, 0.5–2 Hz amplitude modulation (felt, not heard — the practical infrasound substitute). Cut instantly for SILENCE events.
- **Heartbeat entrainment:** sub-audible pulse at 60 BPM creeping to 90 over Act 3.
- **Foley:** CC0 verified list (assets brief): footsteps-leather-cloth pitched down + lowpassed for carpet, layered cloth; Kenney impact + digital-audio (VHS blips); OGA airvent-loop under everything; door set; creaky hinge. Surface-aware (carpet/wet/concrete).
- **Player body:** breathing tied to stamina and dread state; swallowing after almond water; the camcorder's own motor whine in quiet moments.
- **Headphones gate:** start screen strongly recommends headphones (HRTF is wasted on speakers) — diegetic: "this recording contains binaural artifacts."

## 10. Rendering — "Unreal-like" the honest way

Per tech brief: fidelity in a browser comes from *light, grade, and grain*, not poly count.

- **Stack:** `three@0.184` (WebGL2 path), `postprocessing@6.39`, `three-mesh-bvh@0.9.10`, Vite 7, TypeScript. Renderer behind a `createRenderer()` seam; new shader work in TSL where practical so a WebGPU port stays mechanical.
- **Materials:** ambientCG PBR 1K sets — Carpet013 (yellow-brown commercial), OfficeCeiling001 (drop tiles), PaintedPlaster008 (aged yellow wall) + runtime canvas-composited wallpaper stripe/arrow motif per wiki canon; damp variants via roughness/normal modulation and decal stains.
- **Light:** emissive fixture meshes + RectAreaLight/LTC on the *near* ring of fixtures (pooled, ~6 active), shadow-only spotlight paired per active fixture for contact shadows, HemisphereLight ambient base, GTAO in post. Fixtures deliberately *non-gridded* (canon). Distant fixtures are emissive-only — fog does the rest.
- **Atmosphere:** `FogExp2`, density ~0.05, sickly desaturated yellow-green, background matched. Fog is both draw-distance budget and Silent Hill dread engine.
- **Post stack (always on, subtle):** GTAO → bloom (emissive-selective) → chromatic aberration (slight) → VHS composite (custom effect: scanlines, head-switching noise at frame bottom, tracking wobble, dropout lines, color bleed) → film grain → vignette → LUT (sickly grade). HUD (REC/timestamp/battery) is a DOM layer in VT323/Special Elite, so it stays tack-sharp over the degraded image — exactly like a real camcorder burn-in.
- **Budget:** 60 fps at 1080p on a mid laptop GPU; chunk gen in a Worker; `renderer.info` HUD in dev builds from day one; KTX2 compression if texture memory becomes a problem.

## 11. Narrative delivery

All lore via artifacts (no NPCs, no narration): ~12 handwritten notes from "D." — the wanderer before you — arcing from practical advice to unraveling sanity to the final note beside his camcorder; chalk arrows on walls that the maze occasionally reverses; the almond water bottles he left; one playable VHS tape insert (analog-horror interstitial) found in Act 2. The notes double as the mechanics tutorial and as the Amnesia-lie delivery vehicle.

## 12. Repo layout

```
src/
  main.ts            // boot, renderer seam, loop
  core/              // input, assets, events, rng(seeded), debug HUD
  player/            // capsule controller, mantle, stamina, camera sway
  world/             // modules/, assembler, chunks, worker, landmarks
  director/          // acts, wrongness events, presence, silence
  audio/             // context, buses, hum synth, worklets, foley, bed
  fx/                // composer, vhs effect, grade, grain
  ui/                // camcorder hud, start screen, notes overlay, endings
  story/             // note texts, tape script, timestamps
public/
  textures/ audio/ fonts/
docs/
  DESIGN.md research/
```

## 13. Milestones (= task list, committed in small chunks)

1. ✅ Research (5 briefs in `docs/research/`)
2. ✅ This document
3. Scaffold: Vite+TS+three, renderer seam, pointer-lock capsule controller, test room, 60 fps
4. World: modules + seeded assembler + chunk streaming + BVH collision + re-stitch
5. Look: PBR materials, fixture lighting, fog, full post stack incl. VHS
6. Sound: bus graph, procedural hum, foley, dread bed, silence machinery
7. Mechanics: sprint/stamina/breath, crouch, mantle, interact, notes, almond water, zoom
8. Director: acts, wrongness pools, presence, the three sightings, the lie, the meta-beat
9. Narrative: intro renovation, notes content, endings, start screen
10. Validation: automated browser playthrough, fps + console sweep, full E2E run, fix cycle
11. Deploy: GitHub Pages, README with play link + credits

## 14. Definition of done

- Full start→ending playthrough completes in a real browser with zero console errors.
- 60 fps sustained on a mid-tier GPU at 1080p during a 10-minute soak walk.
- Every mechanic exercised in the validation run (sprint, crouch, mantle, interact, zoom, note, water, pause-the-tape).
- All three entity beats, both silences, the false-safety room, and the meta-beat fire on schedule.
- Asset licenses are CC0/OFL only, credited in README anyway.
- It is *not cheap*: the first 30 seconds alone (grade + hum + HUD) must read premium.
