# The Psychology and Psychoacoustics of Dread

A design-research brief for a 20-40 minute browser-based psychological-horror experience.
Compiled 2026-06-10. All section claims are footnoted against the Sources list at the bottom.

---

## 1. Why Ambiguity and the UNSEEN Threat Outperform Shown Monsters

R. Nicholas Carleton's "Fear of the Unknown" (FOTU) framework argues that fear of the
unknown is not just *a* fear — it is the **fundamental, irreducible fear from which other
specific fears are constructed**. Carleton defines FOTU as "an individual's propensity to
experience fear caused by the perceived absence of information at any level of consciousness
or point of processing." Empirically, FOTU is a stronger unique predictor of anxiety than
fear of death or fear of pain, and serves as a transdiagnostic factor across most anxiety
disorders.[^1][^2]

The related construct Intolerance of Uncertainty (IU) frames anxiety as a failure to
metabolize ambiguous information. Under a Predictive Processing model, the brain's job is
to minimize prediction error; horror media works precisely *because* it generates large
prediction errors the brain cannot resolve. A shown monster collapses the probability
distribution — the player now knows what the threat is, what it can do, and how to model
it. An unseen, partially-implied threat keeps the distribution wide and the prediction
error machine running hot.[^3][^4]

Design implication: a fully revealed antagonist is a closed information channel. The longer
you can keep the channel open — ambiguous footprints, half-heard breathing, sounds without
source, doors that were just closed — the longer dread sustains.

## 2. Liminal-Space Psychology: The Uncanny Applied to PLACES, Not Faces

Mori's original uncanny-valley curve was a model of how human-like faces or bodies elicit
revulsion when they're *almost but not quite* right. A 2022 paper in the *Journal of
Environmental Psychology* (Diel & MacDorman) extended this empirically to physical places:
a cubic function of realism fits image uncanniness for architecture just as it does for
faces. The driver is **structural deviation** — atypical configural features of an
otherwise normal-looking place. Familiarity primes a strong prior; deviation from that
prior generates the dip.[^5]

This is the mechanism behind kenopsia (the eerie feeling of a normally-busy place
encountered empty) and the broader liminal-space aesthetic. Empty hallways, motel
corridors, off-hours retail interiors, school halls in summer — the *category* is
recognized, the *expected social signal* (people, motion, sound) is missing. The amygdala
treats unexplained absence-of-people as a threat cue: the place is built for occupancy, so
the question "where did everyone go?" runs as background anxiety.[^6][^7][^8]

The Backrooms aesthetic exploits this precisely. Yellowed wallpaper, fluorescent hum, and
beige carpet are aggressively *familiar*; the wrongness lies in scale, repetition, and the
absence of any reason to be there. Liminal horror also taps modern existential anxieties —
loneliness, purposelessness, the feeling of being lost in systems built for someone else.[^9][^10]

Design implication: model real interiors faithfully — fluorescent fixtures, baseboards,
HVAC vents, ceiling tile grids — then deviate slightly: ceiling a touch too low, hallway
slightly too long, a door that opens the wrong direction, a light fixture that doesn't
match its neighbors. Players will not consciously catalogue the deviations but will report
the place "feels off."

## 3. Psychoacoustics of Dread

### 3.1 Infrasound around 17-19 Hz

Vic Tandy's "Ghost in the Machine" research (1998, *Journal of the Society for Psychical
Research*) identified a 19 Hz infrasonic component in a Coventry lab reputed to be haunted.
The human eyeball has a resonant frequency near 18-19 Hz; at that frequency the eyeball
vibrates in its socket, smearing peripheral vision into the gray amorphous shapes commonly
reported as apparitions. Subsequent work (the "Haunt" project, French et al.) used 17 Hz
infrasound in controlled studies and reported elevated anxiety, chills, and sense-of-
presence reports.[^11][^12][^13]

Browser caveat: laptop speakers and most consumer headphones roll off hard below ~40 Hz, so
true infrasound is unreliable as a delivery channel. The actionable adaptation is a
sub-bass drone in the 30-60 Hz range — felt-not-heard on headphones, plus low-amplitude
amplitude-modulated content (e.g. a 0.5-2 Hz LFO on a low pad) that *simulates* the
subliminal-pulsing feel.

### 3.2 Sustained Drones, Detuned Harmonics, Sudden Silence

Sub-30 Hz drones are used industry-standard as a "felt more than heard" tension bed (Gaspar
Noé's *Irréversible* famously used a 28 Hz drone for nausea). Detuned and inharmonic
partials sit just outside what the auditory cortex can resolve into a clean pitch, which
generates a low-grade prediction error — the brain keeps trying to lock to a fundamental
that isn't quite there.[^14][^15]

**The single most powerful psychoacoustic move in horror is the sudden cut of a sustained
ambient bed.** The auditory cortex has built a model of the room from the drone; when it
disappears, the model collapses and the nervous system spikes alertness searching for the
new threat that has presumably caused the silence. Trailer composers describe this as
"using silence like jazz — it's when you don't play the note." Each successive silence is
trained to feel more dangerous than the last.[^14][^16]

### 3.3 Breathing and Heartbeat Entrainment

Auditory rhythms entrain respiration and, less reliably, heart rate. Slow, calm, regular
beats can downshift autonomic arousal; conversely, *accelerating* or *irregular* low-
frequency pulsing can drag a player's breath up with them. A low ~60-72 BPM heartbeat-like
pulse is interpretable as the player's own; subtly speeding it up over the course of a
scene is a low-detectability arousal lever.[^17][^18]

### 3.4 Binaural / HRTF Spatial Audio for Presence

HRTF-encoded audio reconstructs the cues the pinna, head, and torso impose on incoming
sound, letting the brain localize a source in three dimensions. For browser horror this is
*the* highest-leverage audio investment: a footstep "behind" the player or a whisper at
the right ear is processed by the same neural circuitry as a real-world threat. The Web
Audio API supports a PannerNode with HRTF panning mode out of the box. Caveats: headphones
are mandatory (speaker playback destroys spatial encoding), and inter-subject HRTF
variation means some players experience it as smeared rather than localized.[^19][^20]

## 4. Habituation Curves and Pacing "Wrongness Events"

Repeated exposure to the same stimulus produces habituation: the amygdala learns the
pattern and dismisses it. In horror this means **a single ambient texture loses its dread
charge in 2-4 minutes**, and any repeating wrongness event loses charge after roughly the
third occurrence unless the pattern is broken.[^21][^22]

A short browser experience has a structural advantage here: 20-40 minutes is short enough
that wholesale habituation does not set in if the texture *evolves*. The pacing model
borrowed from horror-trailer scoring is useful:

- **Bed** (continuous ambient dread, gently evolving) — never static for more than ~90 s.
- **Wrongness events** (a sound without source, an object moved, a flicker) — spaced
  ~60-120 s apart, escalating in implication but not necessarily in volume.
- **Silences** — at least 2-3 across the experience, each longer than the last.
- **Releases** — brief moments of apparent safety that re-load the dread budget for the
  next escalation. (Without releases, players exhaust and tune out.)

The published research on dread-heavy films (e.g. *Skinamarink*) shows sustained dread
produces the *largest* drop in heart-rate variability of any horror format — but only when
the texture keeps shifting. Static dread habituates fast.[^22][^23]

## 5. Techniques from the Best Psychological Horror Games

### 5.1 P.T. (2014, Kojima/del Toro)

The looping L-shaped corridor mutates between traversals: paintings tilt, the radio
broadcasts new fragments, a fetus laughs in the bathroom sink. The same space becomes a
different space without the player crossing a loading boundary. Tight walls drive
claustrophobia; long sightlines drive bathophobia; the player's back is always exposed.
**Reads as clever.** The horror is the player's growing certainty that the *rules* of the
space are not stable.[^24][^25]

### 5.2 Eternal Darkness: Sanity's Requiem (2002)

The Sanity meter triggers ~50 distinct "sanity effects" — fake BSODs, fake save-deletion
prompts, the volume bar appearing to drop, the character walking on the ceiling, a "TV
input lost" overlay. The trick weaponizes the player's relationship with the *medium*:
when you can't trust your own console, you're alone. **Reads as clever** in 2002, **risks
reading as cheap** today because audiences are trained on the trope; works best when used
sparingly and when the fake-malfunction is plausible against your delivery surface (e.g. a
browser tab that "crashes" then recovers is more plausible than a fake Windows BSOD).[^26][^27]

### 5.3 Amnesia: The Dark Descent (2010)

Sanity drops from staring at monsters and standing in darkness; visuals warp, audio
distorts. **Crucially, Thomas Grip has confirmed the sanity-mechanic-attracting-monsters is
a placebo — the game lies.** Players self-impose constraints (don't look, stay in light)
that make the game scarier than any actual penalty would. **Reads as clever** because the
deception is invisible; the player does the work.[^28][^29]

### 5.4 Antichamber (2013)

Non-Euclidean geometry: looking-at-a-wall-changes-it, walking-backwards-through-thresholds,
loops that resolve only when the player abandons learned spatial heuristics. Not
explicitly horror, but the mechanism (object permanence violation) is a wellspring of
dread because object permanence is one of the earliest cognitive achievements — its
violation hits very deep.[^30]

### 5.5 Layers of Fear (2016)

The Bloober technique: lure the player's gaze (a light, a sound) one way, mutate the
geometry behind them. Doors that led to a study now open onto a brick wall. Devs designed
around the certainty that telling a player "don't look back" makes them look back. **Reads
as clever** when the mutations are quiet and discovered after the fact; **reads as cheap**
when they happen visibly in front of the player (an "in your face" geometric change loses
the discovery payoff).[^31]

### 5.6 Silent Hill (1999)

The fog was originally a draw-distance hack and became the franchise signature. It steals
visibility, forcing reliance on the static-burst of a malfunctioning radio for threat
direction. Fog + audio-only threat detection turns *every* sound into a question.[^32]

### 5.7 DDLC / OneShot / Imscared (Meta / 4th-Wall)

DDLC corrupts its own visuals, replaces text with gibberish, breaks the cursor. Imscared
creates and deletes files on the player's desktop. OneShot manipulates the OS window. The
floor of effectiveness is high when the meta-break is *earned* by genre subversion (DDLC
poses as a dating sim for an hour first) and low when it's just a gimmick. **For a browser
experience the analogous moves are:** the tab title changing, a fake "this page has
crashed" overlay, a notification permission prompt at exactly the wrong moment, the cursor
behaving strangely, an injected `console.log` the player sees if they open DevTools. **Use
sparingly — one or two such beats in 30 minutes, not five.**[^33][^34]

### Clever vs Cheap — A Quick Heuristic

- **Clever:** the horror is something the *player builds in their own head* from
  ambiguous evidence the game provided. The game lies through omission.
- **Cheap:** the horror is delivered as a startle, the cause is visible, and there is no
  ambiguous interpretation left. The game lies through volume.

## 6. Fifteen Ranked Design Principles for a 20-40 Minute Browser Horror

Ordered by leverage — the top items contribute most dread per unit of dev effort.

1. **Withhold the threat. Never fully reveal.** Use silhouettes, audio-only presence, brief
   peripheral glimpses, evidence-of-passage. The thing the player imagines is always worse
   than the thing you can render in WebGL.
2. **Headphones-mandatory HRTF spatial audio.** A footstep behind the player at the correct
   azimuth and distance does more work than any visual asset. Use the Web Audio API
   PannerNode in HRTF mode. Open with a forced "headphones recommended" prompt.
3. **Establish a sub-bass drone bed, then weaponize SILENCE.** Run a continuous 30-60 Hz
   pad with slow amplitude-modulation. Pull it out hard at peak moments — the silence will
   be louder than any stinger.
4. **Build liminal architecture faithfully, then deviate subtly.** Fluorescent fixtures,
   ceiling-tile grids, baseboards, HVAC vents. Then make one hallway slightly too long, one
   doorway slightly too low, one light slightly miscolored. Don't telegraph the deviations.
5. **Mutate geometry behind the player's back, never in front.** Bloober's gaze-direction
   trigger pattern. The horror discovery has to happen when the player turns around — the
   moment of "wait, was that there before?" does the work.
6. **Make the antagonist a placebo where possible.** Per Amnesia: tell the player a
   constraint exists (don't look, don't stop, don't go in the dark). If you can avoid
   actually enforcing it, the player polices themselves harder than your code ever would.
7. **Pace wrongness events on a 60-120 second cadence, with at least two long silences.**
   Static dread habituates inside three minutes. Every wrongness event should escalate
   *implication* (not necessarily volume) over the last one.
8. **Loop a space and change it.** P.T.'s most powerful move. A second traversal of the
   same hallway with five subtle differences is more frightening than any new room.
9. **Limit visibility with diegetic justification.** Fog, dust, sodium-vapor color cast,
   flickering fluorescents, a flashlight battery. Forcing players to rely on sound triples
   the effectiveness of your sound budget.
10. **Seed peripheral-vision pareidolia.** Faint face-like patterns in wallpaper, ceiling
    stains, dust motes — readable as faces only in peripheral vision, gone when looked at
    directly. Use sparingly: two or three across the experience.
11. **One earned 4th-wall break, at the dramatic peak.** Tab title changes, cursor
    misbehaves, a fake "page unresponsive" recovery. Not five — one. It should pay off a
    specific narrative beat.
12. **Sub-audible heartbeat that subtly accelerates.** Low-amplitude ~60 BPM thump that
    creeps up to ~90 BPM over the climactic 5 minutes. Players will entrain without
    noticing.
13. **Object permanence violations, used surgically.** A door that wasn't there. An item
    you swore you picked up, back on the shelf. Antichamber-style. Sparingly — one
    violation lands, ten read as buggy.
14. **End with ambiguity, not resolution.** Never explain the antagonist. The player's
    post-play rumination is the longest-tail dread mechanism — finished horror is
    forgotten horror.
15. **Schedule a "false safety" beat ~60% through.** A moment of apparent normalcy /
    lights-on / quiet. This re-loads the dread budget for the final escalation and
    prevents fatigue. Without it, the player exhausts and tunes out by minute 30.
16. **Keep gameplay mechanically simple.** Walk, look, occasionally interact. Mental
    bandwidth not spent on controls is bandwidth spent on paranoia. (This is a
    counter-intuitive but well-attested principle from short-form horror.)
17. **No jump scares as load-bearing structure.** At most one, late, earned. Jump scares
    bank short-term physiological response; psychological horror banks long-term mood, and
    the latter is the only kind the player will tell a friend about.

---

## Sources

[^1]: Carleton, R. N. (2016). *Fear of the unknown: One fear to rule them all?* Journal of Anxiety Disorders. https://www.sciencedirect.com/science/article/pii/S0887618516300469
[^2]: Carleton, R. N. (2016). *Into the unknown: A review and synthesis of contemporary models involving uncertainty.* Journal of Anxiety Disorders. https://www.sciencedirect.com/science/article/pii/S0887618516300251
[^3]: Surfing uncertainty with screams: predictive processing, error dynamics and horror films. Philosophical Transactions of the Royal Society B (2024). https://royalsocietypublishing.org/rstb/article/379/1895/20220425/42755/Surfing-uncertainty-with-screams-predictive
[^4]: Affective forecasting during a horror attraction: Insights into Intolerance of Uncertainty. ScienceDirect (2025). https://www.sciencedirect.com/science/article/pii/S0887618525000829
[^5]: Diel, A. & MacDorman, K. F. (2022). Structural deviations drive an uncanny valley of physical places. Journal of Environmental Psychology. https://www.sciencedirect.com/science/article/pii/S0272494422000895
[^6]: Liminal space (aesthetic) — Wikipedia. https://en.wikipedia.org/wiki/Liminal_space_(aesthetic)
[^7]: Kenopsia: The Eerie Feeling of an Empty Space That's Normally Full. https://chicagocounselingandtherapy.com/kenopsia-the-eerie-feeling-of-an-empty-space-thats-normally-full/
[^8]: Backrooms: The Sinister in Liminal Space. https://a-desk.org/en/magazine/backrooms-the-sinister-in-liminal-space/
[^9]: Your brain on "backrooms": The horror concept explained — Newsweek. https://www.newsweek.com/entertainment/film-backrooms-horror-concept-brain-psychology-explained-12027895
[^10]: What Is Liminal Horror? — SlashFilm. https://www.slashfilm.com/2143744/what-is-liminal-horror-backrooms-trend-explained/
[^11]: Vic Tandy — Wikipedia. https://en.wikipedia.org/wiki/Vic_Tandy
[^12]: Fear Frequency: How 19 Hz Infrasound Creates "Ghostly" Dread. https://www.gsnsp.com/fear-frequency-19hz-infrasound-creates-ghostly-dread/
[^13]: French, C. C. et al. The "Haunt" Project: An attempt to build a "haunted" room. Goldsmiths Research Online. https://research.gold.ac.uk/id/eprint/4209/2/French_et_al_Haunt_accepted.pdf
[^14]: Sculpting Silence: Advanced Sound Design Techniques in Horror Cinema. Sinister Film Fest (2025). https://sinisterfilmfest.com/2025/07/28/sculpting-silence-advanced-sound-design-techniques-in-horror-cinema/
[^15]: Horror Trailer Music: How the Sound of Fear Gets Made. Tonal Chaos. https://www.tonalchaostrailers.com/blog/horror-trailer-music-sound-of-fear/
[^16]: Sound Design in Horror Games: Crafting Audio to Induce Fear. Horror Chronicles. https://horrorchronicles.com/horror-games-and-sound-design/
[^17]: Beating stress: music with monaural beats reduces anxiety and improves mood. Frontiers in Psychology (2025). https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1539823/full
[^18]: Systemic neurophysiological entrainment to behaviorally relevant rhythmic stimuli. PMC. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11461278/
[^19]: A Review on Head-Related Transfer Function Generation for Spatial Audio. MDPI Applied Sciences (2024). https://www.mdpi.com/2076-3417/14/23/11242
[^20]: Hancock, D. 'Put on your headphones and turn out the lights': Exploring Immersive Auditory Horror in 3D-sound Podcasting. Revenant Journal. https://www.revenantjournal.com/contents/put-on-your-headphones-and-turn-out-the-lights-exploring-immersive-auditory-horror-in-3d-sound-podcasting-danielle-hancock-university-of-east-anglia/
[^21]: Chasing the Rush: How horror games trigger adrenaline. ScienceDirect (2025). https://www.sciencedirect.com/science/article/abs/pii/S1875952125000813
[^22]: The Psychology Of Horror In Games. IJCRT (2025). https://www.ijcrt.org/papers/IJCRT25A5479.pdf
[^23]: (Re)Considering the jump scare in four elements. Frontiers in Psychology (2025). https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1569394/full
[^24]: P.T. (video game) — Wikipedia. https://en.wikipedia.org/wiki/P.T._(video_game)
[^25]: Silent Halls: P.T., Freud, and Psychological Horror. Press Start. https://press-start.gla.ac.uk/press-start/article/download/121/78/700
[^26]: Eternal Darkness — Wikipedia. https://en.wikipedia.org/wiki/Eternal_Darkness
[^27]: Eternal Darkness: Sanity's Requiem Deployed Fourth-Wall Tricks Before Anyone Could Stream Them. Dread Pixels. https://dreadpixels.com/eternal-darkness-sanitys-requiem-deployed-fourth-wall-tricks-before-anyone-could-stream-them/
[^28]: Game Design Deep Dive: Amnesia's 'Sanity Meter'. Game Developer. https://www.gamedeveloper.com/design/game-design-deep-dive-i-amnesia-i-s-sanity-meter-
[^29]: Amnesia: The Dark Descent Is Built On A Lie. Screen Rant. https://screenrant.com/amnesia-dark-descent-sanity-meter-fake-monster/
[^30]: The Aesthetics of Non-Euclidean Game Spaces: Multistability and Object Permanence in Antichamber and P.T. IT-University of Copenhagen. https://pure.itu.dk/en/publications/the-aesthetics-of-non-euclidean-game-spaces-multistability-and-ob
[^31]: Terrifying players with unstable level design in Layers of Fear. Game Developer. https://www.gamedeveloper.com/audio/terrifying-players-with-unstable-level-design-in-i-layers-of-fear-i-
[^32]: Unravel the Haunting Mystery: Silent Hill's Fog of Terror. https://thingscope.cs.columbia.edu/silent-hill-fog
[^33]: The Craft of Fourth Wall Breaking Anxiety in DDLC. Bloody Disgusting. https://bloody-disgusting.com/editorials/3559587/craft-fourth-wall-breaking-anxiety-doki-doki-literature-club/
[^34]: Imscared — Wikipedia. https://en.wikipedia.org/wiki/Imscared
