# Asset Licenses

All assets bundled under `public/` are listed below with source URL, author/site, license, and local path. Verified 2026-06-10.

The minimum CC0 ship-today bundle requires **no attribution**. CC0 entries here are listed for record-keeping / transparency only. SIL OFL fonts are also attribution-free for normal use.

## Textures (ambientCG — CC0 / Public Domain)

Source ZIP pattern: `https://ambientcg.com/get?file=<AssetID>_1K-JPG.zip`. Only the Color, NormalGL, Roughness, and AmbientOcclusion maps are kept; renamed to `color.jpg`, `normal.jpg`, `rough.jpg`, `ao.jpg`.

| Asset | Source | Author | License | Local path |
|---|---|---|---|---|
| Carpet013 (primary yellow-brown carpet) | https://ambientcg.com/view?id=Carpet013 | ambientCG (Lennart Demes) | CC0 1.0 | `public/textures/carpet/` |
| Carpet008 (damp/stained variant) | https://ambientcg.com/view?id=Carpet008 | ambientCG (Lennart Demes) | CC0 1.0 | `public/textures/carpet_damp/` |
| PaintedPlaster008 (aged yellowish wall) | https://ambientcg.com/view?id=PaintedPlaster008 | ambientCG (Lennart Demes) | CC0 1.0 | `public/textures/wall/` |
| OfficeCeiling001 (drop ceiling tile) | https://ambientcg.com/view?id=OfficeCeiling001 | ambientCG (Lennart Demes) | CC0 1.0 | `public/textures/ceiling/` |
| OfficeCeiling005 (drop ceiling vent variant) | https://ambientcg.com/view?id=OfficeCeiling005 | ambientCG (Lennart Demes) | CC0 1.0 | `public/textures/ceiling_vent/` |
| Concrete033 (utility / Act 3 floor) | https://ambientcg.com/view?id=Concrete033 | ambientCG (Lennart Demes) | CC0 1.0 | `public/textures/concrete/` |

No substitutions or 404s — all six requested ambientCG asset IDs returned HTTP 200.

## Audio — Kenney.nl (CC0)

| Pack / file selection | Source ZIP | Author | License | Local path |
|---|---|---|---|---|
| Impact Sounds (10 files: `impactWood_heavy_000..002`, `impactPlank_medium_000..001`, `impactPunch_heavy_000..001`, `impactSoft_heavy_000..001`, `impactMining_000`) | https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip | Kenney Vleugels | CC0 1.0 | `public/audio/impacts/` |
| Digital Audio (10 files for VHS/glitch blips: `phaseJump1..3`, `phaserDown1..2`, `lowRandom`, `lowDown`, `threeTone1..2`, `spaceTrash1`) | https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip | Kenney Vleugels | CC0 1.0 | `public/audio/glitch/` |

Both Kenney URLs returned HTTP 200; no substitution required.

## Audio — OpenGameArt (CC0 only — non-CC0 entries skipped)

Every page below was opened and its license badge was verified to be CC0. No CC-BY/CC-BY-SA assets were kept.

| Asset | Source page | Author | License | Local path |
|---|---|---|---|---|
| Airvent Loop (HVAC room tone) | https://opengameart.org/content/airvent-loop | Iwan Gabovitch (qubodup) | CC0 1.0 | `public/audio/ambient/airvent.wav` |
| Ambient Horror | https://opengameart.org/content/ambient-horror | RandomMind | CC0 1.0 | `public/audio/ambient/ambient_horror.ogg` |
| 4 Atmospheric Ghostly Loops (`atmoseerie01..04.flac`) | https://opengameart.org/content/4-atmospheric-ghostly-loops | LjudbanK / "independent_nu" | CC0 1.0 | `public/audio/ambient/atmoseerie0{1..4}.flac` |
| Footsteps — Leather, Cloth, Armor (8 oggs: `step_cloth1..4`, `step_lth1..4`; metal variants excluded for carpet feel) | https://opengameart.org/content/footsteps-leather-cloth-armor | Michel Baradari (artisticdude) | CC0 1.0 | `public/audio/footsteps/` |
| Door Open / Door Close Set (19 OGGs: `qubodup-DoorOpen01..08`, `qubodup-DoorClose01..10`, plus creaky hinge below; FLAC variants dropped to save space) | https://opengameart.org/content/door-open-door-close-set | Iwan Gabovitch (qubodup) | CC0 1.0 | `public/audio/doors/qubodup-Door*.ogg` |
| Creaky Door Hinge (Spooky) | https://opengameart.org/content/creaky-door-hinge-spooky | spookymodem | CC0 1.0 | `public/audio/doors/creaky_door_hinge.wav` |

No license rejections needed — all six requested OGA pages were already CC0 as listed in the research brief.

## Fonts — Google Fonts (SIL OFL 1.1)

Downloaded the Latin subset woff2 from `fonts.gstatic.com` after parsing the `fonts.googleapis.com/css2?...` response with a desktop browser User-Agent.

| Font | Specimen page | Author | License | Local path |
|---|---|---|---|---|
| VT323 | https://fonts.google.com/specimen/VT323 | Peter Hull | SIL OFL 1.1 | `public/fonts/vt323.woff2` |
| Special Elite | https://fonts.google.com/specimen/Special+Elite | Astigmatic | SIL OFL 1.1 | `public/fonts/special-elite.woff2` |

Both files are the Latin-only subset (`U+0000-00FF`); use them directly via `@font-face { src: url('/fonts/vt323.woff2') format('woff2'); }`.

## Substitutions / failures / rejections

- None. Every URL in the research brief that this task targeted returned HTTP 200 and matched the expected license on inspection.

## Cumulative sizes (post-cleanup)

- `public/textures/`: ~25 MB across 6 material sets (4 maps each)
- `public/audio/`: ~5.9 MB across 53 files in 5 subfolders (well under the 40 MB budget)
- `public/fonts/`: ~70 KB across 2 woff2 files

## Attribution policy

CC0 and SIL OFL together require no in-game credit screen. If you later add a CC-BY or CC-BY-SA asset (e.g. any of the CC-BY ventilation/drone loops listed in `docs/research/assets.md`), you must add an in-game credits screen with author name, source URL, and license.
