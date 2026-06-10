# Worklog

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

### Backlog for polish iterations (Task 10)
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
