# NOCLIP — TAPE 2 Expansion Spec

*Target player: someone who has already beaten the game twice and thinks they know the rules.
Every feature below exists to invalidate that confidence. All pillars and the ban list in
`DESIGN.md` remain in force — no jump-scare spam, no chase loops, no monster reveals, no music.
Implementer: map each spec onto the existing systems (dread director, chunk assembler,
landmark injector, audio engine, VHS pipeline) rather than building parallel systems.*

---

## Priority order

1. **A — Timestamp Breach** (small, surgical, highest scare-per-line-of-code)
2. **B — Reactive Director v2** (turns the scheduler into a predator)
3. **C — Q-Pause Secret** (rewards the mechanic nobody uses)
4. **D — Wrongness Card Pool v2** (+12 director events; replay variety)
5. **E — TAPE 2 / NG+** (persistence-driven remix run; the actual "more game")
6. **F — Audio escalations** (slow-notch silence, reverb lie, formant hum, binaural exhale)
7. **G — New modules** (Office Pocket, Flood Expansion, Phone Room)
8. **H — Microphone opt-in** (optional; ship last, behind a setting)

---

## A — Timestamp Breach

**Intent.** The diegetic frame (camcorder HUD, `JUN 12 2002`) is the player's one piece of
solid ground. Crack it exactly once per run, from the direction nobody guards: reality.

**Behavior.**
- Once per run, during Act 2 or later, the HUD timestamp renders the player's **actual system
  date and time** (`new Date()`, same HUD font/format) for **2 video frames**, then returns
  to the diegetic tape time.
- Must coincide with an existing tracking-wobble or head-switch-noise event so it can be
  rationalized as a glitch on first viewing.
- Never repeats within a run. Eligible window: any director-quiet period (not stacked on
  another wrongness event — this *is* a wrongness event, give it its own card).

**Constraints.**
- 2 frames at 60 fps is ~33 ms. Do not exceed 3 frames; longer reads as a feature, shorter
  is invisible. Tie to rendered frames, not wall-clock, so low-fps machines still show it.
- No sound cue. No director acknowledgment. Nothing reacts. That's what makes it land.

**Acceptance.** A player recording their screen can scrub back and confirm what they saw.
A player not recording can never be sure.

---

## B — Reactive Dread Director v2

**Intent.** Upgrade the director from a scheduler (60–120 s cadence, no-repeat) into a
profiler. It should exploit *this* player's coping behavior.

**Profile signals (rolling, last ~5 min):**
- `lookbackRate` — full >120° turns per minute while moving
- `sprintRatio` — time sprinting / time moving
- `wallHug` — mean lateral distance from nearest wall while traversing
- `dwellOnLandmarks` — seconds spent with a landmark in center-frame
- `zoomUsage` — RMB zoom activations per minute
- `noteReader` — fraction of spawned notes actually read

**Exploit table (each fires at most once per run, Act 2+, director picks by strongest signal):**

| Signal profile | Exploit |
| --- | --- |
| High lookbackRate | Player turns to check behind: nothing, repeatedly. Then once, on turning *back forward*, the distant silhouette is ahead, gone within 1.2 s. (Counts as one of the three entity beats — re-allocate, do not add a fourth.) |
| Near-zero lookbackRate | Single carpet footstep, 2 m directly behind, HRTF-exact. One. Never again. |
| High sprintRatio | The stalking-presence audio in Act 3 keys off accumulated loudness debt: it begins earlier and tracks more tightly. Notes in Act 2 foreshadow ("IT COUNTS YOUR STEPS"). |
| High wallHug | A stretch where the wall the player hugs is the one with the pareidolia wallpaper face — placed at shoulder height, visible only at hug distance. |
| High dwellOnLandmarks | One revisited landmark is altered (the child's drawing has one more figure in it). Landmark injector marks landmarks "dirty" on second approach. |
| High zoomUsage | Autofocus hunt occasionally resolves on something 40 m down a corridor for ~0.5 s before the player can identify it; zoom-out shows an empty corridor. |
| Low noteReader | A note placed unavoidably in a doorway. It reads: "you don't read these. it does." |

**Constraints.**
- Profiling is per-run, in-memory only (NG+ persistence is Spec E's job).
- The exploit replaces, never supplements, a scheduled wrongness slot — total event density
  must not rise. Pillar 1 still rules: the dread is the entity.
- Fail-safe: if signals are ambiguous (new player, balanced behavior), director falls back
  to the existing scheduled pool. No exploit is mandatory.

**Acceptance.** Two players with opposite playstyles get materially different Act 2/3 runs
and can't reproduce each other's clips.

---

## C — Q-Pause Secret

**Intent.** Hold-Q pauses the tape. Almost nobody uses it under stress. Make it the most
discussed mechanic in the game.

**Behavior.**
- During the Act 3 **near-miss** beat (and only then), if the player holds Q, the paused
  frame is not the live render: it is a **prepared still** — same scene, but the entity is
  fractionally more present than it ever is at speed. Closer. Oriented toward the lens.
- Pause noise (tracking shimmer, frame jitter) degrades the still so it can't be cleanly
  screenshotted — VHS pause-head judder, rolling band.
- On release, live render resumes exactly where it was. The game never references this.
- Secondary: pausing during any SILENCE event lets the player hear, faintly, that the
  "silence" has a floor — a slow respiration loop hidden under the noise gate. Pausing the
  tape pauses the world's sounds but not *that*.

**Constraints.**
- The prepared still must reuse the existing entity silhouette asset treatment: never fully
  lit, never up close in focus, never explained. This is an intensification, not a reveal.
- Zero achievement, zero hint, zero tutorialization. Discovery only.

**Acceptance.** A player who never presses Q has a complete, coherent run. A player who
presses Q at the wrong times finds nothing and concludes the rumor is fake.

---

## D — Wrongness Card Pool v2 (+12)

New cards for the director deck. Each obeys the existing cadence (60–120 s, never same card
twice in a row, escalation-weighted by act). Implementation notes inline.

1. **Receding lights.** In one corridor, fixtures audibly click off one by one *behind* the
   player as they walk. Turning around shows darkness already complete — no off animation is
   ever visible. (Audio: per-fixture hum voices drop with each click.)
2. **Echo +1.** For 60 s, the player's footstep audio plays one extra, slightly late step.
   Stops the instant the player stops. Standing still in this zone is silent.
3. **Playback.** Act 3 only: the player hears their *own* footsteps from ~10 min earlier —
   correct gait, correct pace, correct surface — traversing a corridor one chunk over.
   Implementation: ring-buffer the player's locomotion event stream with positions; replay
   spatialized at the recorded offsets translated to nearby geometry.
4. **Wet prints.** A trail of damp footprints ahead of the player, heading the direction the
   player was about to go. They end mid-corridor. (Decal trail; spawn only out-of-frustum.)
5. **The phone.** A 2002 office phone rings in an adjacent module (G3 Phone Room if built,
   else any room cluster). Ringing stops if approached at a run; continues if approached
   slow/crouched. Answering (E): line static, then the room's own fluorescent hum played
   back down the line, one second of delay. Hang-up. Never rings again.
6. **Shrink drift.** Over one zone (~4 chunks), corridor cross-sections scale down 2% per
   chunk. Exit chunk restores 100%. No doorway requires crouching — it just *almost* does.
7. **Seam drift.** Wallpaper seam alignment degrades along a corridor until patterns
   visibly mismatch, then snaps back to perfect at the next junction. (UV offset per wall
   segment ramped by distance.)
8. **REC stops.** The HUD REC dot stops blinking — solid — for 20–40 s. Tape timestamp
   continues. No other change. (Players who notice will not be able to explain why it's
   the worst one.)
9. **Reverse timestamp.** During a SILENCE event, the tape timestamp runs backwards at 1×.
   Resumes forward when sound returns. Total reversal never exceeds the silence duration.
10. **Carpet flow.** Shader on the carpet: pattern advects at ~1 cm/s, but velocity is
    masked to 0 inside the view-frustum center (gaze-contingent — moves only in peripheral
    vision). Subtle enough to be deniable.
11. **The photograph.** Landmark variant: a framed print of the original 807 Oregon Street
    photo on a wall — but the camera position in the photo matches the player's current
    standing position in the module. (Authored once per module geometry; injector picks the
    matching module.)
12. **Entrainment break.** The 60→90 bpm heartbeat bed locks, for 30 s, to the cadence of
    the player's own footsteps — then continues at that tempo after the player stops.

**Constraint.** Pool growth must not raise event density. Bigger deck, same draw rate —
the win is that two consecutive runs now share few cards.

---

## E — TAPE 2 (NG+)

**Intent.** The real "more game" for a finished player, at ~15% the cost of a new level.

**Unlock & persistence.**
- On first completion, write a run summary to `localStorage`: completion count, route
  heatmap (coarse chunk-visit counts), dwell landmarks, sprintRatio, notes read, almond
  water drunk, Q-pause used (y/n), ending variant.
- Main menu afterwards shows a second tape on the shelf: **"TAPE 2 — JUN 13 2002"**.
  No other explanation.

**Remix rules (Tape 2 run):**
- Same four-act structure, **next-day timestamp**, same maze systems — but the director
  seeds its v2 profile from the *previous run's* persisted profile from minute zero.
- Landmarks from run 1 reappear **moved** — the red stain is in a different module; the
  child's drawing has aged.
- New note set, written in response to run 1: at least three notes reference persisted
  facts ("you slept in the safe room", "you never drank the water", "back so soon").
  Conditional spawns keyed to the persisted flags — never spawn a note whose condition
  is false.
- **One rule from run 1 is broken, once:** a single re-stitch is allowed to occur inside
  peripheral vision (frustum edge, >60° off-center) — the player half-sees a corridor
  become a wall. This is Tape 2's signature beat and the only frustum-rule violation in
  the entire game. Scripted, not emergent; Act 2 only.
- The false-safety room is **no longer safe**: entering it triggers the SILENCE event
  with the Spec-C respiration floor active without needing the Q-pause.
- Ending: Tape 2's final frames include ~1 s of footage from the *player's run-1 ending
  variant* (pre-rendered per variant), as if the tapes are bleeding into each other.

**Constraints.**
- Tape 1 must remain fully self-contained and unchanged for fresh players.
- All persistence is local; corrupt/missing storage silently degrades to Tape-1 behavior.

---

## F — Audio escalations

1. **Slow-notch silence.** Replace (or add a variant of) the hard-cut SILENCE event:
   attenuate the hum bed by ~0.5 dB every 4 s over 90 s, then gate fully. The player must
   not be able to say when the sound left — only that it is *gone*. Restore in one frame.
2. **Reverb lie.** Per-zone convolution IRs (or parametric reverb presets if IR memory is
   tight). When the assembler re-stitches geometry behind the player, crossfade the room
   tone to the *new* geometry's preset **before** the player turns around. The ear learns
   the ceiling moved before the eye does.
3. **Formant hum.** Acts 2–3: occasionally sweep two vowel-shaped bandpass filters
   (e.g., 700/1200 Hz → 300/2300 Hz over 8–12 s) across the ballast-hum bus at −18 dB
   relative. Sub-threshold EVP. Never intelligible, never repeated identically.
4. **The exhale.** Once per run, Act 3, a single breath exhale rendered HRTF at ~0.3 m,
   right-rear quadrant. One sample, one play, no follow-up, no director acknowledgment.
5. **Footstep surface truth.** If not already: flooded-zone wading layer, and crouched
   steps on damp carpet as a distinct, quieter sample set — the stealth audio contract
   the notes promise ("running is loud") should be fully honest.

---

## G — New modules

1. **Office Pocket.** A 2002 office island inside Level 0: cubicle cluster, dead CRTs,
   one CRT powered and showing static (the only screen light in the game). Interacting
   with it (E) degrades the player's *own* VHS pipeline for 10 s — heavier tracking error,
   as if the two recordings interfere. Dense occlusion makes it ideal Reactive-Director
   terrain.
2. **Flood Expansion.** Lengthen the flooded stretch into a zone recipe: ankle-deep
   throughout, wading audio, ripple-distorted reflections of the fixtures (planar reflection
   or cheap SSR — VHS grade hides artifacts). One submerged note, legible only via zoom.
   The water kills the player's footstep audio — and the director knows it (silence debt
   instead of loudness debt: the stalking presence loses you here, and the audio says so).
3. **Phone Room.** Small office antechamber housing card D5's phone. Authored once.

**Constraint.** Modules slot into the existing socket system (2–6 sockets, baked-feel
lighting). No module may exceed the lighting/poly budget of the current heaviest module.

---

## H — Microphone opt-in (ship last)

- Headphone-check screen gains a second toggle: *"This tape has audio on both sides."*
  Off by default. Standard browser permission flow; degrade silently if denied.
- Implementation: `getUserMedia` → AnalyserNode → RMS with a slow noise-floor calibration
  (first 30 s of play). No audio is recorded, transmitted, or stored — state this in the
  toggle's fine print, and make it true.
- Effects (Act 3 only): real-world sound above threshold while the stalking presence is
  active causes its audio to reorient toward the player's position and hold ~10 s longer
  before losing interest. One-time response to a *loud* spike (gasp/shout): all fixture
  hums in the loaded chunks dip 3 dB for 2 s, as if the level heard it too.
- Hard rule: mic input may only modulate **existing** systems. It must never trigger an
  entity beat on its own — the three-beat cap is sacred.

---

## Global budgets & fail-safes

- Event density is capped at current levels in all specs. More deck, same draw rate.
- Entity beats remain exactly **three** per run, Tape 1 and Tape 2 alike. Spec B and C
  re-allocate beats; nothing adds one.
- Every new system must no-op cleanly: storage missing → Tape 1 behavior; mic denied →
  silent degrade; low fps → frame-locked effects (Spec A) still render.
- Anything ambiguous: re-read `DESIGN.md` §3. If a proposed change would be banned by the
  ban list, it's banned here too.

---

## I — Lore Alignment Addendum (post-research-brief review)

*Added after reading `docs/research/lore.md` and `psychology.md` against the specs above.*

### Corrections to earlier specs

1. **Spec E, Manila Room beat — REWRITTEN.** Earlier draft said the false-safety room is
   "no longer safe" in Tape 2. Wrong instrument. The Manila Room's defining property
   (`src/story/manila.ts`) is that it can never be found again. So Tape 2's betrayal is:
   **it is found again.** Same dimensions, hum still softened, director still holding its
   breath, the thermos exactly where the player left it in run 1 (persisted flag: drunk or
   not). One new note, same handwriting: *"I never wrote a second note. — D."* The dread
   drain still works — the player gets the rest — but they leave knowing the one honest
   room lied about the one thing it promised. Do NOT add the respiration floor here;
   restraint is the room's whole identity.
2. **Level taxonomy.** Any future descent content: Level 1 is the concrete **warehouse**
   (ankle fog, wall-mounted fluorescents, crates that materialize/vanish), Level 2 is
   **Pipe Dreams** (pipes, valves, dim red bulbs). Act 3's utility halls already read as
   Level 2 foreshadowing — preserve that ladder; do not invent a parking garage.
3. **Spec A risk note.** Psychology brief §5.2 warns medium-trust attacks (Eternal
   Darkness sanity effects) read as cheap when overused or implausible for the surface.
   The Timestamp Breach is exactly this class of trick. The 2-frame / once-per-run /
   never-acknowledged constraints are therefore load-bearing — any "improvement" that
   makes it longer, repeated, or reactive kills it.
4. **Spec H justification upgrade.** The mic feature is a direct implementation of the
   founding text ("…it sure as hell has heard you"). Surface that line in the toggle's
   diegetic copy. This feature is more canon than it is gimmick; weight priority
   accordingly.

### New lore-grounded easter eggs

1. **The work order (Act 0).** A clipboard in the renovation store: a contractor work
   order for the conversion of the second floor — outgoing tenant a home-furnishings
   store, incoming a hobby-shop franchise, dated June 2002. No names beyond that, no
   highlighting, readable only via E. Players who know how the original photo was traced
   will lose their minds; everyone else sees set dressing. (Lore-by-artifact rule:
   never narrated.)
2. **The arrows agree (Act 2 card).** Canon wallpaper is a thin vertical line with a
   small arrow-like motif — and an existing note already says DON'T TRUST THE ARROWS.
   New wrongness card: one corridor where every arrow in the repeating pattern has
   rotated to point in the direction of travel — and after the corridor's midpoint,
   to point back the way the player came. UV/decal variant of the wallpaper material,
   swapped out-of-frustum, restored at the next junction.
3. **D.'s camcorder (Tape 2 payoff).** The "dead camcorder" landmark exists in the
   injector. Tape 2 only: interacting with it (E) plays ~6 s of audio through the
   player's own HUD as if ingested by their tape — damp-carpet footsteps, D.'s breathing,
   and the hum cutting to one second of the Manila Room's softened purr. Then battery
   death click. No visuals, no explanation. This is D.'s entire on-screen fate; never
   show more.
4. **The dictionary page (Act 1/2 note variant).** A torn page, dictionary formatting,
   single visible entry: *kenopsia* with its real definition — the eerie atmosphere of a
   place usually bustling, now abandoned. Handwritten underneath, D.'s hand: "there's a
   word for it. that doesn't help." Grounds the game's whole aesthetic thesis in one
   diegetic object, costs one texture.

### Alignment verdict

Specs A–H comply with the ban list and the briefs' failure-mode table (no jumpscare
spam, no monster clarity, no mappable space, no music, restraint as principle). The two
flagged risks — Spec A's medium-trust class and Spec B's silhouette re-allocation —
are both governed by constraints already written into their sections. The three-entity-
beat cap remains untouched everywhere.
