# Worklog

## 2026-06-10 — session 4 (branch `tape-2`: the EXPANSION.md build)

> ⚠️ SPOILERS BELOW — this entry stays systems-level on purpose.
> The spec itself (docs/EXPANSION.md) and the source are the spoiler zone.

Implemented EXPANSION.md specs A–H plus the lore-alignment addendum, on
top of the existing systems (director, chunk assembler, audio engine,
VHS pipeline) — no parallel systems built. Highlights, vaguely:

- **A** — one frame-locked HUD event, once per run, hidden inside an
  existing artifact class. 2 rendered frames, never acknowledged.
- **B** — director v2: a rolling behavioral profiler (`director/profile.ts`)
  with an exploit table. Exploits *replace* scheduled wrongness slots
  (density unchanged) and re-allocate — never add — entity beats.
- **C** — the held-Q mechanic now has a reason to be the most discussed
  mechanic in the game. Zero tutorialization. Discovery only.
- **D** — wrongness deck grew by ~12 cards (audio, light, shader-level,
  HUD, and prop cards). Two cards are gaze-contingent shader effects on
  the carpet/wallpaper materials. Skipped: D6 (shrink drift — fights the
  chunk assembler), D11 (the photograph — needs per-module authoring).
- **E** — TAPE 2 / NG+: run summary persisted to localStorage on
  completion; a second tape appears on the menu shelf. Next-day stamp,
  seeded director profile, conditional note set, ~1/3 of the maze
  re-rolled, one scripted frustum-edge beat (the game's only one), the
  Manila Room beat per the addendum's correction, ending bleed.
- **F** — audio escalations: slow-notch silence variant, per-zone reverb
  crossfade, formant sweeps on the hum bus, one very close one-shot,
  honest surface foley (wading layer; water swallows loudness debt).
- **G** — two new Level-0 zone recipes in the streamer: a 2002 office
  island (cubicle pods, dead CRTs, exactly one not dead — the only screen
  light in the game) and a flooded stretch (ankle-deep, drag physics,
  silence-debt rules, one submerged page readable only via zoom).
- **H** — microphone opt-in on the title screen, off by default,
  analysis-only (graph terminates at an AnalyserNode; nothing recorded or
  sent). Only modulates existing systems; can never trigger a beat.
- Lore eggs 1–4 from the addendum, all diegetic, none narrated.
- **Fix:** mantle now probes knee height too — you can climb out of the
  pool basins (reported: "fell into a pool, couldn't climb out").

### Validated (headless, dev server)
- `tsc --noEmit` clean; prod build clean (after local `npm i`; lockfile
  drift reverted — CI's pinned lockfile untouched)
- Pool basin escape: bot fell in (y −0.7), climbed out in 2.8 s
- Zone census over 81×81 chunks: office ~3%, flooded ~3.5%, wings unchanged
- Office: 6 chunks resident → 24 CRTs, 4 powered; flooded: waterDepth 0.11
- 28 forced deck draws at dread 0.7 + playbot soak: zero errors
- Tape 2 boot: shelf renders, next-day stamp, world variance on, profile
  seeded from persisted run from minute zero; storage-corrupt path falls
  back to Tape 1 behavior

## 2026-06-10 — build sessions 1–2 (research → live deploy)

**LIVE: https://danielkinsner.github.io/backrooms-game/**

All systems built, integrated, and validated headless; 11 commits on main.
Research (5 briefs) → DESIGN.md → scaffold → infinite maze → look pass →
audio engine → director → mechanics → narrative arc → CI deploy.

### Validated (headless browser, dev + prod + live)
- 180 fps with full post stack; geometry bounded over 200s soak (no leaks)
- Capsule controller: wall stop exact, pillar slide, crouch headroom, mantle, zoom
- Audio: master peak −13 dBFS, silence() cuts to 0 and recovers, ctx running
- Narrative beats each verified: intro slate/wake, distance note placement,
  silhouette (zoom-only, 1.8 s), meta-beat (REC→PLAY), near-miss, exit
  bulkhead, ending slates → reload loop
- Prod build under /backrooms-game/ base path + live Pages deploy

## 2026-06-10 — session 3 (polish + organic E2E validation → DONE)

Polish pass shipped: chalk arrows, abandoned furniture (organic mantle
targets), almond water (dread relief + 40s steady-cam), damp carpet
patches (openDamp always, elsewhere rare), true debug HUD stats.

**Organic playthrough (src/dev/playbot.ts, real input/interact paths):**
9.5 min, 1009 m walked, ALL 8 notes found+read organically, 3 bottles
drunk, silhouette/meta-beat/near-miss/pause-the-tape all fired, ending
reached. 180 fps on every 10s sample, ZERO console errors. 5 teleport
assists = bot has no pathfinding (wall-grinder), not a level defect.

**Fix surfaced by the run:** exit unlock previously required 7 notes
READ → human soft-lock risk if papers go unspotted. Now `unlockDescent()`
fires on notesRead≥7 OR walked>1400 (verified: 1401 m + 0 notes →
exit placed).

**Remaining (needs a human):** audio listen test (engine verified by
analyser levels only); a real-GPU feel pass on Dan's machine. Optional
future: Kane-style walkable intro hallway (slate intro shipped instead),
GTAO, WebGPU/TSL port via the createRenderer seam.

## 2026-06-10 — session 4 (the terror pass: research-driven escalation)

81-finding research sweep (Backrooms canon, analog-horror grammar,
psychoacoustics, WebGL horror rendering) synthesized into 27 ranked
upgrades; the high-impact half shipped this session.

### Terror
- **The mimic** — note 1's promise kept: at dread, footsteps answer yours
  (leather, pitched down, behind you); stop walking and they CONTINUE for
  6–10 strides before stopping. Gated on noise YOU made (retroactive
  hearing, per the original 4chan post). Max 3 episodes/run.
- **Blackout** — the earned lights-out: every fixture dies 9–12 s
  (hum dies with them — it was always the lights' voice), one unhurried
  impact mid-dark, plasma re-strike stutter on recovery. Scheduled ~30 s
  after reading "when the lights go brown, count the seconds."
- **Cone-of-confusion presence** — face the sound and it re-mirrors
  behind your facing axis. You can never turn fast enough.
- **Silence intruders** — something lands INSIDE each silence event:
  a far creak the first time; a wet exhale 0.5 m behind your shoulder
  the second (misophonia research: highest terror-per-byte available).
- **Pareidolia decals** — stains with almost-faces, peripheral-only,
  gone when fixated or approached. Max 3/run.
- **New wrongness events** — distant door closes (THERE ARE NO DOORS),
  ceiling ticks directly overhead, hum spectral-narrowing (the building
  swallows its own voice), peripheral-only fixture dims that abort if
  you look.
- **OSD corruption** — the burn-in lies: clock silently loses 20–40 s on
  every re-stitch; single-frame timestamp anomalies at high dread
  (AM 0:00:00 / JUN.11 2002 / AUG.04 1987); REC dot double-blinks after
  45 s of stillness (the camera noticed); battery drains visibly.

### Visual
- N8AO ambient occlusion (half-res, grime-brown), additive fixture halos
  + carpet light pools (blackout-aware), 220 drifting dust motes,
  baseboard/ceiling grime gradients injected into the wall shader,
  dread-driven fog density + FOV compression + vignette deepening.
- VHS shader rewrite: true luma/chroma separation (right-smeared chroma),
  halation fringe, interlace twitter, gate weave, generation-loss ratchet
  (acts + re-stitches make the tape permanently worse), tracking-surge
  API (the director tears the frame to mask re-stitches), permanent tape
  crease after the meta-beat, rolling interference band near the
  presence, green-spike CRI grade (mercury line; red dies to brown),
  IGN dither (kills fog banding, reads as grain).
- Quake lightstyle 10 flicker for nervous fixtures; 120 Hz micro-ripple
  on all tubes; green-contaminated tube color (0xeef3c4).

### Audio
- Generated-IR reverb send (carpet-deadened, zero bytes downloaded),
  wow & flutter on the ambience bus (deepens with dread), 18.98 Hz hum
  amplitude flutter (the Tandy frequency — felt before noticed),
  synthesized drips in damp zones / ballast ticks on nervous fixtures /
  wet exhale / swallow, EAS broadcast leak one-shot (853+960 Hz through
  a wall cavity you can never reach), dread-driven breath (audible past
  0.75 without sprinting).

### Lore
- Notes audit: pages numbered with gaps (missing pages never exist),
  "the hum is 19", "avoid the manager's office", final note cuts off
  mid-word; **the live lie** — page 12 reads "the hum gets louder near
  exits." until the meta-beat, then "near you." on re-read.
- Wanderer scrawls: tallies (reads 23), KEEP MOVING, NO DOORS, the
  recurring rune, EXIT :) pointing at a blank wall.
- Ending slate gains: CLASSIFICATION: SAFE · SECURE · ENTITY COUNT
  UNCONFIRMED.

### Validated (this session)
- tsc + prod build clean. Full organic playbot E2E: 8 notes, descent,
  ending reached, ZERO console errors (blackout fired mid-run).
- Audio smoke: every new voice fired with ctx running, no exceptions.
- Mimic verified end-to-end: idle → mirror → tail-after-stop → idle.
- Pareidolia placement verified in corridors.
- Visual captures: docs/shots/wip-*.jpg (hall, blackout, surge, grade).
- New automation: Loop.step() synchronous driver (immune to hidden-tab
  timer throttling), hidden-tab catch-up ticking, scripts/shot-server.mjs
  canvas capture rig.

### Next session candidates (from research, deferred)
Manila Room (the only mercy), kenopsia props (dial-tone phone, dying
CRT, wet footprints), P.T. loop wing via salt-pinning, Red Room glimpse
+ tally 74, impossible artifacts (counter reversal, freeze, foreign
insert), looming telegraph ramps + Shepard descent finale, blackout
ZONE region (ankle-deep fluid), found photographs (pre-memory + the
impossible angle), beat-pool illegibility (6 authored, 3 per seed).

## 2026-06-10 — session 5 (anomalous wings: the maze bleeds)

Dan supplied liminal reference images (poolrooms, dead playplace,
garage); a 3-agent research sweep pulled the canon. Three rare
2×2-chunk wing regions now generate ≥3 chunks from spawn (~2.5%/2.2%/
2.1% of coarse regions): the maze bleeds into other places.

- **The Poolrooms** (Level 37 / Jared Pike): pristine white tile on
  every surface (the exact inverse of Level 0's filth — canon says the
  sterility IS the wrongness), sunken basins with crystal blue-green
  water + the navy waterline band, humid blue-white fog shift, lapping
  bed + constant drips + the signature sourceless distant splash
  (50-160 s), wet tile footsteps, no scrawls (nothing marks the tile),
  no paper notes (research: canon = NO entities; the space is the
  entity).
- **Level Fun =)** (dead playplace): canonical orange walls + near-black
  carnival carpet that eats the light, dimmest fixtures, plastic towers
  (mantleable), ball pits (static instanced balls, 6 colors), dead tube
  slides with collider proxies, red balloon clusters still inflated,
  crayon scrawls ("party this way =)", "FUN =)", "have some cake =)")
  and a taped crayon drawing — count the stick figures.
- **The garage**: strict 3-cell column module, lowered 2.35 m ceiling
  (soffit seams against full-height neighbors), concrete + oil blooms +
  faded bay paint, sodium-warm dying fixtures (light AND emissive),
  LEVEL 3 stenciled on every column everywhere, floor arrows pointing
  into walls, a metal door slamming somewhere every 45-110 s, concrete
  footsteps, grey fog shift.

Tech: zone-aware AudioState (surface switching, lap bed, splash/slam
schedulers), per-fixture mount heights through gen→mesh→lighting→hum,
fogBase ownership moved into FixturePool (blackout-compatible per-zone
tint lerp), basin floor-hole geometry with BVH colliders (mantle out of
the water works), playbot budget 22 min for the longer arc.

Validated: tsc+build clean; full organic E2E (all 9 notes, descent
unlock, ending trigger + slates) with ZERO console errors; all three
wings located and screenshotted (docs/shots/wing-*.jpg); pushed live.

## 2026-06-10 — session 6 (wave 3: mercy, kenopsia, the tape misbehaving)

- **The Manila Room** — canon's sole resting anomaly, placed once at
  ~350 m: clean manila walls, its own steady warm light (the only
  honest light in the building), D.'s most human note ("you're doing
  fine."), his thermos (DRINK → "still warm."). Inside: the director
  holds its breath, the hum softens to a purr, dread drains. Leave,
  and the tape flinches; get 45 m away and the room stops existing.
  Never findable again.
- **The phone** (kenopsia, ~210 m): a desk phone off the hook playing
  the 2002 US dial tone (350+440 Hz). HANG UP and the line clicks dead.
  Walk away and the line gives up on its own.
- **Wet footprints** (~460 m): a barefoot trail, glossy on the carpet,
  walking straight into a wall. It stops there.
- **Impossible artifacts** (post-meta-beat, exactly two, minutes
  apart): the tape counter visibly runs BACKWARD for two seconds while
  gameplay continues; later, the frame freezes for 1.5 s while every
  sound carries on. The medium violating its own parameters — players
  will argue these happened at all.
- **Looming telegraph**: before the near-miss, the sub-bed swells over
  30 s, holds, then recedes — "it passed; it's behind you now" — and
  THEN the silhouette crosses. (Neuhoff auditory looming bias.)
- **Shepard descent**: under the ending's black, six octave-spaced
  sines glide down forever without arriving. No key, no melody — the
  no-music pillar survives on a technicality.

CI fixed: Windows npm 11 had pruned platform-optional deps from the
lockfile (lightningcss/rolldown bindings) → npm ci failed on Linux
only. Lockfile regenerated complete; CI pins npm 11.6.2 (the npm that
validates must match the npm that wrote it).

Validated headless: phone/dial-tone/hangup, Manila suppression
in→out→gone lifecycle, footprints placement, both artifacts firing,
loom + Shepard clean; zero console errors.

## 2026-06-10 — session 7 (the red room)

One set piece, once per run, at ~540 m: a dim red doorway far ahead in
the fog (the CRI grade renders its red dead-brown — physics, not
styling). Approach: the hum bends, tape interference climbs. At 9 m
the tape tears, and when the frame settles there is only wall — the
chunk re-seeds; the room was never there. Beside where it stood, a
chalk tally stays on the wall. It reads 74. Canon: red rooms "must be
avoided entirely"; the game makes avoidance mandatory. Verified
headless (place → approach → vanish, zero errors); deployed.

Remaining deferred (diminishing returns, specs in session-4 notes):
P.T. loop wing via salt-pinning, found photographs, beat-pool
illegibility, blackout ZONE region.

### Original backlog (now resolved except as noted)
1. **Chalk arrows** — notes 1 & 7 reference arrows on walls; they don't exist
   visually yet. Canvas-chalk decals on walls along a lying guidance path. HIGH.
2. **Mantle targets in-world** — maze has no organic furniture; add desks/
   filing boxes to `rooms`/`openDamp` recipes (props + colliders per chunk).
3. **Almond water** — DESIGN §5: bottles near notes; drinking steadies
   camera/breath (audio.setDread relief + sway damp). Currently absent.
4. Visual pass 2: ceiling fixture surround grime, wall hue variance per
   chunk, possible GTAO, damp carpet patches (carpet_damp set is unused).
5. Debug HUD render stats lie under EffectComposer (`renderer.info` reads
   last pass) — set `autoReset=false` + manual reset per frame.
6. Organic full playthrough (note-seeking bot or human); audio listen test
   needs human ears — Dan.
7. `PAUSE ❚❚` glyph — verify VT323 renders ❚ (fallback: "PAUSE | |").
8. Kane-style intro hallway (Act 0 walkable store, pre-noclip) — deferred
   from Task 9; the slate-only intro shipped instead. Optional.

### Architecture notes for future sessions
- Dev automation: `window.__noclip` (DEV builds only) — player/input/world/
  audio/director/narrative/post/THREE + `autopilot`; `input.setKey/setMouse`
  survive blur. agent-browser drives everything; pointer lock works headless.
- World re-gen: `world.bumpSalt(cx,cz)` (director uses it behind the player).
- Acts: `narrative.notesRead` is the story clock; `director.setDreadFloor`.
- One agent-shared-worktree rule: `git add <paths>`, never `-A`, while
  background agents write into the repo.
