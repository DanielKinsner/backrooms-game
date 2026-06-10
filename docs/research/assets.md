# Backrooms Horror Game — Verified Free Asset Brief

Date: 2026-06-10
Scope: PBR textures, CC0/CC-BY audio, and Google Fonts suitable for a backrooms-style VHS/CRT horror game. All URLs in this document were checked via `curl.exe -sI -L` HEAD requests on the date above. HTTP status is recorded per URL. Where licenses are present on OpenGameArt I quote them verbatim; ambientCG is uniformly Public Domain (CC0) and Poly Haven is uniformly CC0 by site policy. Kenney is uniformly CC0.

---

## 1. Texture pipeline summary

The aesthetic targets a "fluorescent-lit, yellowed-office-on-mono-carpet" backrooms look. The minimum useful PBR set is:

- One yellow/brown office carpet (primary floor)
- A second carpet OR concrete variant for "damp/stained" sub-levels
- A yellow / off-white painted-plaster or wallpaper for walls
- A drop-ceiling acoustic tile for the ceiling
- Optionally a generic concrete or plywood for door frames, baseboards, hidden corridors

All seven of the textures listed below are CC0 (no attribution required) and come as `1K-JPG` (ambientCG) or 1K JPG individual maps (Poly Haven). Both libraries provide diffuse/normal/roughness/AO maps inside the same archive (ambientCG) or alongside each other (Poly Haven).

### 1.1 ambientCG — Public Domain (CC0)

URL pattern: `https://ambientcg.com/get?file=<AssetID>_1K-JPG.zip` (HTTP 302 → BackBlaze B2 → 200 OK). Each ZIP includes Color, NormalDX, NormalGL, Roughness, AmbientOcclusion, Displacement maps plus a preview JPG.

| AssetID | Use | Verified URL | HTTP | License |
|---|---|---|---|---|
| `Carpet013` | Primary yellow-brown commercial loop carpet | https://ambientcg.com/get?file=Carpet013_1K-JPG.zip | 200 | CC0 |
| `Carpet011` | Backup brown commercial carpet | https://ambientcg.com/get?file=Carpet011_1K-JPG.zip | 200 | CC0 |
| `Carpet004` | Dense beige/tan office carpet | https://ambientcg.com/get?file=Carpet004_1K-JPG.zip | 200 | CC0 |
| `Carpet008` | Stained / scuffed alternate carpet | https://ambientcg.com/get?file=Carpet008_1K-JPG.zip | 200 | CC0 |
| `Carpet014` | Variant carpet for transition zones | https://ambientcg.com/get?file=Carpet014_1K-JPG.zip | 200 | CC0 |
| `OfficeCeiling001` | Drop-ceiling acoustic tile (canonical backrooms ceiling) | https://ambientcg.com/get?file=OfficeCeiling001_1K-JPG.zip | 200 | CC0 |
| `OfficeCeiling002` | Drop ceiling variant 2 | https://ambientcg.com/get?file=OfficeCeiling002_1K-JPG.zip | 200 | CC0 |
| `OfficeCeiling003` | Drop ceiling variant 3 (good for damaged tile substitution) | https://ambientcg.com/get?file=OfficeCeiling003_1K-JPG.zip | 200 | CC0 |
| `OfficeCeiling004` | Drop ceiling variant 4 | https://ambientcg.com/get?file=OfficeCeiling004_1K-JPG.zip | 200 | CC0 |
| `OfficeCeiling005` | Drop ceiling variant 5 | https://ambientcg.com/get?file=OfficeCeiling005_1K-JPG.zip | 200 | CC0 |
| `PaintedPlaster003` | Off-white/yellowish painted-plaster wall | https://ambientcg.com/get?file=PaintedPlaster003_1K-JPG.zip | 200 | CC0 |
| `PaintedPlaster008` | Aged painted plaster (yellower) | https://ambientcg.com/get?file=PaintedPlaster008_1K-JPG.zip | 200 | CC0 |
| `PaintedPlaster017` | Smooth painted wall | https://ambientcg.com/get?file=PaintedPlaster017_1K-JPG.zip | 200 | CC0 |
| `PaintedPlaster011` | Patchy painted wall (subtle stains) | https://ambientcg.com/get?file=PaintedPlaster011_1K-JPG.zip | 200 | CC0 |
| `Plaster001` | Bare plaster (transition / abandoned rooms) | https://ambientcg.com/get?file=Plaster001_1K-JPG.zip | 200 | CC0 |
| `Concrete033` | Damp concrete floor / sub-basement (Level Fun-style) | https://ambientcg.com/get?file=Concrete033_1K-JPG.zip | 200 | CC0 |
| `Concrete034` | Dirty concrete floor | https://ambientcg.com/get?file=Concrete034_1K-JPG.zip | 200 | CC0 |
| `WoodFloor043` | Plywood / sub-floor exposed | https://ambientcg.com/get?file=WoodFloor043_1K-JPG.zip | 200 | CC0 |
| `AcousticFoam001` | Studio-foam wall (utility rooms / sound-treated zones) | https://ambientcg.com/get?file=AcousticFoam001_1K-JPG.zip | 200 | CC0 |
| `Tiles066` | Industrial floor tile (alternate level) | https://ambientcg.com/get?file=Tiles066_1K-JPG.zip | 200 | CC0 |

Preview pages (visual confirmation before downloading):
- https://ambientcg.com/view?id=Carpet013 — `<title>Carpet 013 | ambientCG</title>` (HTTP 200)
- https://ambientcg.com/view?id=OfficeCeiling001 — `<title>Office Ceiling 001 | ambientCG</title>` (HTTP 200)

Note: ambientCG does not have an asset literally named `Wallpaper001-006`; those IDs return 404. The correct way to source "wallpaper-style" walls is via the `PaintedPlaster***` family (HTTP 200 across `001-017`). For something more obviously *patterned* wallpaper, use Poly Haven `decrepit_wallpaper` (next section).

### 1.2 Poly Haven — CC0 (1K JPG, individual maps)

Poly Haven's homepage download UI bundles all maps; the public API exposes direct per-map URLs. Use these for one-off downloads or to script a fetch.

| Asset | Use | Diffuse 1K JPG URL | HTTP | License |
|---|---|---|---|---|
| `dirty_carpet` | Aged/discolored office carpet (olive-brown, faded). API description: "discolored olive-brown tones, subtle stripe detail, worn fibers and surface grime". | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/dirty_carpet/dirty_carpet_diff_1k.jpg | 200 | CC0 |
| `decrepit_wallpaper` | Stained/peeling patterned wallpaper for "wallpaper rooms" | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/decrepit_wallpaper/decrepit_wallpaper_diff_1k.jpg | 200 | CC0 |
| `peeling_painted_wall` | High-detail peeling paint for distressed walls | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/peeling_painted_wall/peeling_painted_wall_diff_1k.jpg | 200 | CC0 |
| `painted_plaster_wall` | Clean painted-plaster wall variant | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/painted_plaster_wall/painted_plaster_wall_diff_1k.jpg | 200 | CC0 |
| `painted_concrete` | Painted concrete floor/wall | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/painted_concrete/painted_concrete_diff_1k.jpg | 200 | CC0 |
| `painted_concrete_02` | Painted concrete variant | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/painted_concrete_02/painted_concrete_02_diff_1k.jpg | 200 | CC0 |
| `ceiling_interior` | Interior ceiling texture (drywall ceiling variant) | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/ceiling_interior/ceiling_interior_diff_1k.jpg | 200 | CC0 |

Companion map URLs follow the pattern `<asset>_<map>_1k.jpg` where `<map>` ∈ `{diff, nor_dx, nor_gl, rough, arm, disp}`. Example for `dirty_carpet`:
- `dirty_carpet_diff_1k.jpg` (color) — 200 OK
- `dirty_carpet_nor_gl_1k.jpg` (OpenGL normal)
- `dirty_carpet_arm_1k.jpg` (AO/Roughness/Metallic packed)
- `dirty_carpet_disp_1k.png` (displacement)

To fetch a full ZIP per asset, query `https://api.polyhaven.com/files/<slug>` and read the JSON; the homepage does not expose a static zip URL.

### 1.3 Recommended minimum download set (10 ZIPs from ambientCG)

If you just want the smallest "ship today" texture pile, grab these ten. All return HTTP 200:

1. https://ambientcg.com/get?file=Carpet013_1K-JPG.zip (primary floor)
2. https://ambientcg.com/get?file=Carpet008_1K-JPG.zip (stained alt floor)
3. https://ambientcg.com/get?file=OfficeCeiling001_1K-JPG.zip (canonical ceiling)
4. https://ambientcg.com/get?file=OfficeCeiling003_1K-JPG.zip (damaged ceiling)
5. https://ambientcg.com/get?file=PaintedPlaster008_1K-JPG.zip (yellowish wall)
6. https://ambientcg.com/get?file=PaintedPlaster003_1K-JPG.zip (off-white wall)
7. https://ambientcg.com/get?file=Plaster001_1K-JPG.zip (bare wall, transitions)
8. https://ambientcg.com/get?file=Concrete033_1K-JPG.zip (damp sub-level floor)
9. https://ambientcg.com/get?file=WoodFloor043_1K-JPG.zip (exposed sub-floor)
10. https://ambientcg.com/get?file=AcousticFoam001_1K-JPG.zip (utility/foam room)

For a true backrooms "Level 0 yellow walls + brown carpet + drop ceiling" loop you need only #1, #3, #5 from this list — the other seven are variants for biome differentiation.

---

## 2. Audio — CC0 and CC-BY

The pipeline splits cleanly into:
1. **Kenney.nl** for raw building-block packs (interface, impact, sci-fi, UI) — all CC0, all return HTTP 200, all packaged as one ZIP per pack.
2. **OpenGameArt.org** for atmospheric loops, footsteps, and door SFX — mixed CC0 / CC-BY 3.0 / CC-BY 4.0; license is noted per entry below.
3. **Freesound** is intentionally excluded because download requires login; equivalent material is sourced from OGA and Kenney instead. If you ever need Freesound packs, the "Recommended Freesound packs to download manually" subsection lists three high-value ones.

### 2.1 Kenney.nl audio packs (all CC0, all 200 OK)

These were discovered by parsing the asset detail pages (`https://kenney.nl/assets/<slug>`) and following the `<a id="donate-text" href="...zip">` link.

| Pack | Direct ZIP URL | HTTP | License |
|---|---|---|---|
| Impact Sounds (130 SFX — thumps, hits, bangs) | https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip | 200 | CC0 |
| Interface Sounds (UI clicks/blips for menus and HUD) | https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip | 200 | CC0 |
| Digital Audio (electronic/data-corruption blips, good for VHS UI) | https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip | 200 | CC0 |
| Sci-Fi Sounds (hum/drone/whoosh, useful for "ambient anomaly") | https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip | 200 | CC0 |
| RPG Audio (door clunks, light foley, inventory) | https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip | 200 | CC0 |
| UI Audio (separate from Interface Sounds; more synthetic) | https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip | 200 | CC0 |
| Music Jingles (short stings, good as "found camera turns on") | https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip | 200 | CC0 |
| Casino Audio (slot/buzzer SFX — only useful if you build a "Level 666" arcade) | https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip | 200 | CC0 |

The full Kenney Audio listing is at https://kenney.nl/assets/category:Audio (HTTP 200).

### 2.2 OpenGameArt — atmospheres, footsteps, doors

Each entry was opened and the license string scraped from the metadata block. CC0 entries are highlighted because they require no attribution — they are the safest defaults for a small team.

**Room tone / ventilation / fluorescent hum (the backrooms drone bed):**

| Entry | URL | HTTP | License |
|---|---|---|---|
| Airvent Loop (loopable HVAC hum — *exactly* the room tone you want) | https://opengameart.org/content/airvent-loop | 200 | **CC0** |
| Ambient Pulse Noise | https://opengameart.org/content/ambient-pulse-noise | 200 | CC-BY-SA 3.0 |
| Background Rumble Noise | https://opengameart.org/content/background-rumble-noise | 200 | CC-BY 3.0 |
| Sci-Fi Drone Loop | https://opengameart.org/content/sci-fi-drone-loop | 200 | CC-BY 3.0 |
| Ambient Spaceship Hums | https://opengameart.org/content/ambient-spaceship-hums | 200 | CC-BY 3.0 |
| Force Field Electric Hum (fluorescent-tube substitute) | https://opengameart.org/content/force-field-electric-hum | 200 | CC-BY 4.0 / CC-BY-SA 3.0 |
| Ventilation Variant 1 | https://opengameart.org/content/ventilationvariant1 | 200 | CC-BY 3.0 |
| Ventilation Version 2 | https://opengameart.org/content/ventilation-version2 | 200 | CC-BY 3.0 |
| 12 Ambient Machine Sounds | https://opengameart.org/content/12-ambient-machine-sounds | 200 | CC-BY 3.0 |
| 13 Ambient Machine Sounds | https://opengameart.org/content/13-ambient-machine-sounds | 200 | CC-BY 3.0 |

**Dark ambient / horror drones (longer-form score material):**

| Entry | URL | HTTP | License |
|---|---|---|---|
| Ambient Horror | https://opengameart.org/content/ambient-horror | 200 | **CC0** |
| Horror | https://opengameart.org/content/horror | 200 | **CC0** |
| 4 Atmospheric Ghostly Loops | https://opengameart.org/content/4-atmospheric-ghostly-loops | 200 | **CC0** |
| Ghost (single drone) | https://opengameart.org/content/ghost | 200 | **CC0** |
| Upside Down Grin (Freaky Ambient) | https://opengameart.org/content/upside-down-grin-freaky-ambient | 200 | **CC0** + Public Domain |
| Scifi City Ambient Loop | https://opengameart.org/content/scifi-city-ambient-loop | 200 | **CC0** |
| Dark Ambient 1 | https://opengameart.org/content/dark-ambient-1 | 200 | (verify on page; lic block uses image badge) |
| Dark Ambience Soundscapes | https://opengameart.org/content/dark-ambience-soundscapes | 200 | CC-BY-SA 3.0 |
| Horror Sound Effects Library | https://opengameart.org/content/horror-sound-effects-library | 200 | CC-BY 3.0 |
| Horror Ambient (loop) | https://opengameart.org/content/horror-ambient | 200 | CC-BY 3.0 + GPL |
| Horror Noise 1 | https://opengameart.org/content/horror-noise1 | 200 | CC-BY 3.0 |

**Footsteps (carpet, leather, cloth, concrete):**

| Entry | URL | HTTP | License |
|---|---|---|---|
| Footsteps (CC0 variant) | https://opengameart.org/content/footsteps-0 | 200 | **CC0** |
| Footsteps — Leather, Cloth, Armor (closest to carpet/cloth movement) | https://opengameart.org/content/footsteps-leather-cloth-armor | 200 | **CC0** |
| Metal Footsteps on Concrete | https://opengameart.org/content/metal-footsteps-on-concrete | 200 | **CC0** |
| Fantozzi's Footsteps (Grass/Sand & Stone) | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone | 200 | **CC0** |
| Footsteps on Different Surfaces | https://opengameart.org/content/footsteps-on-different-surfaces | 200 | CC-BY 3.0 |
| Stepping Sounds | https://opengameart.org/content/stepping-sounds | 200 | CC-BY 3.0 |
| Stone Stair Steps | https://opengameart.org/content/stone-stair-steps | 200 | CC-BY-SA 3.0 |

OGA does not have a dedicated "carpet footsteps" pack with a useful license; the standard workaround is to pitch-shift and EQ "Leather, Cloth, Armor" + "Stepping Sounds" to remove high-end snap, then layer with a low cloth rustle.

**Distant thumps / bangs / cloth movement:**

| Entry | URL | HTTP | License |
|---|---|---|---|
| Thwack Sounds | https://opengameart.org/content/thwack-sounds | 200 | **CC0** |
| Muffled Distant Explosion | https://opengameart.org/content/muffled-distant-explosion | 200 | **CC0** |
| Sound Effects Pack (general) | https://opengameart.org/content/sound-effects-pack | 200 | **CC0** |
| Footsteps — Leather, Cloth, Armor (reuse for cloth rustle) | https://opengameart.org/content/footsteps-leather-cloth-armor | 200 | **CC0** |

**Door SFX (all CC0 except where noted):**

| Entry | URL | HTTP | License |
|---|---|---|---|
| 4 Door Closes | https://opengameart.org/content/4-door-closes | 200 | **CC0** |
| Creaky Door Hinge (Spooky) | https://opengameart.org/content/creaky-door-hinge-spooky | 200 | **CC0** |
| Door Open, Door Close | https://opengameart.org/content/door-open-door-close | 200 | **CC0** |
| Door Open, Door Close Set | https://opengameart.org/content/door-open-door-close-set | 200 | **CC0** |
| Door Lock Sounds | https://opengameart.org/content/door-lock-sounds | 200 | **CC0** |
| Door Open SFX | https://opengameart.org/content/door-open-sfx | 200 | **CC0** |
| Iron Door | https://opengameart.org/content/iron-door | 200 | **CC0** |
| Locked Door | https://opengameart.org/content/locked-door | 200 | CC-BY 4.0 |

### 2.3 Recommended minimal audio bundle (ship-today set)

1. **Room tone bed:** OGA `airvent-loop` (CC0) — primary loop, no attribution.
2. **Distant thump layer:** Kenney `impact-sounds` (CC0) + OGA `thwack-sounds` (CC0).
3. **Drone score:** OGA `ambient-horror` (CC0) + OGA `4-atmospheric-ghostly-loops` (CC0).
4. **Doors:** OGA `door-open-door-close-set` (CC0) + OGA `creaky-door-hinge-spooky` (CC0).
5. **Footsteps:** OGA `footsteps-leather-cloth-armor` (CC0) pitched down ~3 semitones for carpet feel.
6. **UI / VHS glitch blips:** Kenney `digital-audio` (CC0) + Kenney `interface-sounds` (CC0).

Total: 0 attribution required. All eight downloads above are HTTP 200 verified.

### 2.4 Recommended Freesound packs to download manually

Freesound requires login so URLs can't be HEAD-verified anonymously. If you want to expand later, search these on Freesound while logged in (all author-tagged CC0 packs that are well-known in indie horror):
- "Office Ambience" by Inspector J
- "Roomtone" by klankbeeld
- "Backrooms Ambience" community pool
None of these are needed for v1 — OGA + Kenney already covers every requirement.

---

## 3. Fonts — Google Fonts (all OFL, free for any use)

All five pages were HEAD-checked and the CSS endpoint was also confirmed live.

| Font | Use | URL | HTTP |
|---|---|---|---|
| **VT323** | Primary CRT/VHS overlay font (looks like an actual VT220 terminal) | https://fonts.google.com/specimen/VT323 | 200 |
| **Special Elite** | Typewriter / case-file labels / found-footage subtitles | https://fonts.google.com/specimen/Special+Elite | 200 |
| **Share Tech Mono** | Cleaner mono alternative for HUD readouts (less "retro game", more "1990s monitor") | https://fonts.google.com/specimen/Share+Tech+Mono | 200 |
| **Press Start 2P** | 8-bit pixel font for `Level 0` title cards or arcade Easter eggs | https://fonts.google.com/specimen/Press+Start+2P | 200 |
| **Silkscreen** | Pixel UI font, cleaner than Press Start 2P | https://fonts.google.com/specimen/Silkscreen | 200 |
| **Major Mono Display** | Brutalist display variant for chapter titles | https://fonts.google.com/specimen/Major+Mono+Display | 200 |
| **IBM Plex Mono** | Modern fallback mono | https://fonts.google.com/specimen/IBM+Plex+Mono | 200 |
| **Inconsolata** | Body mono fallback | https://fonts.google.com/specimen/Inconsolata | 200 |
| **Cutive Mono** | Slightly battered typewriter mono — good for "found notes" props | https://fonts.google.com/specimen/Cutive+Mono | 200 |

Live CSS confirmation: `https://fonts.googleapis.com/css2?family=VT323&display=swap` returns 200 OK (use this URL directly in CSS or import + bundle the woff2 it points to for offline builds). All Google Fonts are released under the **SIL Open Font License 1.1** — free for commercial and modification use, no attribution required, just don't redistribute under a different family name.

**Recommended pairing for the VHS/CRT UI:**
- HUD readouts and CRT scanline overlay: **VT323** (12–16px, with green or amber color and 0.5px text-shadow blur for bleed)
- Title cards / "found footage timestamp": **Special Elite** (24–32px, slight rotation)
- Optional pixel accent for chapter slates: **Silkscreen**

---

## 4. License + attribution cheat sheet

| Source | License | Attribution required? | Commercial OK? |
|---|---|---|---|
| ambientCG | CC0 / Public Domain | No | Yes |
| Poly Haven | CC0 | No | Yes |
| Kenney.nl | CC0 | No (credit appreciated) | Yes |
| OpenGameArt (CC0 entries above) | CC0 | No | Yes |
| OpenGameArt (CC-BY 3.0 / 4.0 entries above) | CC-BY 3.0 / 4.0 | **Yes** — credit author + link + license in your in-game credits screen | Yes |
| OpenGameArt (CC-BY-SA entries) | CC-BY-SA | Yes + share-alike obligation | Yes (with SA on derivative audio) |
| Google Fonts | SIL OFL 1.1 | No | Yes |

For the minimal CC0-only ship-today bundle in §1.3 and §2.3, you owe nobody any attribution. As soon as you pull in any CC-BY OGA entry (e.g. `force-field-electric-hum`, `12-ambient-machine-sounds`), you must add a credits screen.

---

## 5. Suggested download order

1. ambientCG carpet + ceiling + plaster trio (Carpet013, OfficeCeiling001, PaintedPlaster008) — these three alone make a recognizable backrooms scene.
2. Kenney `impact-sounds` and `digital-audio` ZIPs — gives you immediate SFX and UI sounds.
3. OGA `airvent-loop` + `ambient-horror` + `4-atmospheric-ghostly-loops` — the audio bed and score.
4. OGA `door-open-door-close-set` + `creaky-door-hinge-spooky` + `footsteps-leather-cloth-armor` — interaction foley.
5. Google Fonts VT323 + Special Elite for HUD/overlay.
6. Optional: Poly Haven `dirty_carpet` + `decrepit_wallpaper` for a stained second biome.

After step 5 you have a complete, attribution-free, 0-USD asset stack for an MVP backrooms walking simulator.

---

## Sources (all HEAD-verified 2026-06-10)

### ambientCG
- https://ambientcg.com/get?file=Carpet013_1K-JPG.zip — 200
- https://ambientcg.com/get?file=Carpet011_1K-JPG.zip — 200
- https://ambientcg.com/get?file=Carpet004_1K-JPG.zip — 200
- https://ambientcg.com/get?file=Carpet008_1K-JPG.zip — 200
- https://ambientcg.com/get?file=Carpet014_1K-JPG.zip — 200
- https://ambientcg.com/get?file=OfficeCeiling001_1K-JPG.zip — 200
- https://ambientcg.com/get?file=OfficeCeiling002_1K-JPG.zip — 200
- https://ambientcg.com/get?file=OfficeCeiling003_1K-JPG.zip — 200
- https://ambientcg.com/get?file=OfficeCeiling004_1K-JPG.zip — 200
- https://ambientcg.com/get?file=OfficeCeiling005_1K-JPG.zip — 200
- https://ambientcg.com/get?file=PaintedPlaster003_1K-JPG.zip — 200
- https://ambientcg.com/get?file=PaintedPlaster008_1K-JPG.zip — 200
- https://ambientcg.com/get?file=PaintedPlaster011_1K-JPG.zip — 200
- https://ambientcg.com/get?file=PaintedPlaster017_1K-JPG.zip — 200
- https://ambientcg.com/get?file=Plaster001_1K-JPG.zip — 200
- https://ambientcg.com/get?file=Concrete033_1K-JPG.zip — 200
- https://ambientcg.com/get?file=Concrete034_1K-JPG.zip — 200
- https://ambientcg.com/get?file=WoodFloor043_1K-JPG.zip — 200
- https://ambientcg.com/get?file=AcousticFoam001_1K-JPG.zip — 200
- https://ambientcg.com/get?file=Tiles066_1K-JPG.zip — 200

### Poly Haven
- https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/dirty_carpet/dirty_carpet_diff_1k.jpg — 200
- https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/decrepit_wallpaper/decrepit_wallpaper_diff_1k.jpg — 200
- https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/peeling_painted_wall/peeling_painted_wall_diff_1k.jpg — 200
- https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/painted_plaster_wall/painted_plaster_wall_diff_1k.jpg — 200
- https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/painted_concrete/painted_concrete_diff_1k.jpg — 200
- https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/painted_concrete_02/painted_concrete_02_diff_1k.jpg — 200
- https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/ceiling_interior/ceiling_interior_diff_1k.jpg — 200
- https://api.polyhaven.com/files/dirty_carpet — 200 (JSON of all maps/sizes)

### Kenney
- https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip — 200
- https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip — 200
- https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip — 200
- https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip — 200
- https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip — 200
- https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip — 200
- https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip — 200
- https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip — 200
- https://kenney.nl/assets/category:Audio — 200 (browse index)

### OpenGameArt
- https://opengameart.org/content/airvent-loop — 200 (CC0)
- https://opengameart.org/content/ambient-horror — 200 (CC0)
- https://opengameart.org/content/horror — 200 (CC0)
- https://opengameart.org/content/4-atmospheric-ghostly-loops — 200 (CC0)
- https://opengameart.org/content/ghost — 200 (CC0)
- https://opengameart.org/content/upside-down-grin-freaky-ambient — 200 (CC0)
- https://opengameart.org/content/scifi-city-ambient-loop — 200 (CC0)
- https://opengameart.org/content/footsteps-0 — 200 (CC0)
- https://opengameart.org/content/footsteps-leather-cloth-armor — 200 (CC0)
- https://opengameart.org/content/metal-footsteps-on-concrete — 200 (CC0)
- https://opengameart.org/content/fantozzis-footsteps-grasssand-stone — 200 (CC0)
- https://opengameart.org/content/4-door-closes — 200 (CC0)
- https://opengameart.org/content/creaky-door-hinge-spooky — 200 (CC0)
- https://opengameart.org/content/door-open-door-close — 200 (CC0)
- https://opengameart.org/content/door-open-door-close-set — 200 (CC0)
- https://opengameart.org/content/door-lock-sounds — 200 (CC0)
- https://opengameart.org/content/door-open-sfx — 200 (CC0)
- https://opengameart.org/content/iron-door — 200 (CC0)
- https://opengameart.org/content/thwack-sounds — 200 (CC0)
- https://opengameart.org/content/muffled-distant-explosion — 200 (CC0)
- https://opengameart.org/content/sound-effects-pack — 200 (CC0)
- https://opengameart.org/content/background-rumble-noise — 200 (CC-BY 3.0)
- https://opengameart.org/content/sci-fi-drone-loop — 200 (CC-BY 3.0)
- https://opengameart.org/content/ambient-spaceship-hums — 200 (CC-BY 3.0)
- https://opengameart.org/content/force-field-electric-hum — 200 (CC-BY 4.0)
- https://opengameart.org/content/ventilationvariant1 — 200 (CC-BY 3.0)
- https://opengameart.org/content/ventilation-version2 — 200 (CC-BY 3.0)
- https://opengameart.org/content/12-ambient-machine-sounds — 200 (CC-BY 3.0)
- https://opengameart.org/content/13-ambient-machine-sounds — 200 (CC-BY 3.0)
- https://opengameart.org/content/horror-sound-effects-library — 200 (CC-BY 3.0)
- https://opengameart.org/content/locked-door — 200 (CC-BY 4.0)
- https://opengameart.org/content/dark-ambience-soundscapes — 200 (CC-BY-SA 3.0)

### Google Fonts
- https://fonts.google.com/specimen/VT323 — 200
- https://fonts.google.com/specimen/Special+Elite — 200
- https://fonts.google.com/specimen/Share+Tech+Mono — 200
- https://fonts.google.com/specimen/Press+Start+2P — 200
- https://fonts.google.com/specimen/Silkscreen — 200
- https://fonts.google.com/specimen/Major+Mono+Display — 200
- https://fonts.google.com/specimen/IBM+Plex+Mono — 200
- https://fonts.google.com/specimen/Inconsolata — 200
- https://fonts.google.com/specimen/Cutive+Mono — 200
- https://fonts.googleapis.com/css2?family=VT323&display=swap — 200
