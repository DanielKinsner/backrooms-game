# NOCLIP — a Backrooms descent

> *"If you're not careful and you noclip out of reality in the wrong areas, you'll end up in the Backrooms…"*

A browser-playable, first-person psychological-horror experience set in Level 0 of the Backrooms.
No jump-scare spam. No cheap monster chases. Just six hundred million square miles of damp carpet,
mono-yellow wallpaper, the hum-buzz of fluorescent lights — and the growing certainty that the
maze knows you're in it.

**Status: in development.** Design doc and research briefs live in [`docs/`](docs/).

## Pillars

1. **Dread over shock** — psychological horror; the environment is the entity.
2. **Authentic to the lore** — Level 0 canon, VHS found-footage grading, restraint.
3. **Sound design first** — procedural fluorescent hum, HRTF-spatialized wrongness, silence as a weapon.
4. **No cheap feel** — PBR materials, real lighting, film-grade post-processing, 60 fps.

## Tech (planned)

Three.js + TypeScript + Vite. Procedural infinite maze, chunk-streamed. Web Audio API for
spatial/procedural sound. Deployed as a static site — playable in any modern browser.
