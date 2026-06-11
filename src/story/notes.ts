/**
 * D.'s notes (DESIGN.md §11, research-audited). Arc: practical → counting →
 * unraveling → the lie → the descent. The last one is read beside his
 * camcorder, and it stops mid-word.
 *
 * Canon discipline (from the original 2019 post's radical sparseness):
 * every note states a RULE or a sensory observation. None may explain.
 * The pages are numbered with gaps — the missing pages are never placed,
 * never referenced, and never will be. (Zeigarnik: the unresolved gnaws.)
 *
 * Note 8 (page 14) is the Amnesia lie: pausing the tape does nothing.
 * It never did.
 *
 * THE LIVE LIE: page 12 reads differently after the meta-beat. One line.
 * Half the players will insist it never happened. That's the point.
 */
export const TRAIL_NOTES: string[] = [
  `— 2 —

the lights never turn off.
the hum gets in your teeth.

if you hear footsteps that
match yours — stop walking.
count to ten.
they keep going.

DON'T trust the arrows.

— D.`,

  `— 4 —

the carpet is wet in places.

don't smell it.

it's not water.
it's not anything.

you can hear it dripping
sometimes. there is no
ceiling leak. I checked.

— D.`,

  `— 5 —

the hum is 19.

it's not the lights.
I checked the lights.

it's not the lights.

— D.`,

  `— 7 —

I counted my steps.
4,000 between the last note
and this one.

I went back to check.

the distance back was 200.

I'm not doing that again.

— D.`,

  `— 9 —

FOUND A DOOR.

there are no doors here.
I'm writing this down so I
remember it:

THERE ARE NO DOORS HERE.

so what keeps closing?

— D.`,

  `— 11 —

it doesn't walk.

the hum bends around it.
that's how you know.

when the lights go brown,
count the seconds.

it's counting too.

— D.`,

  `— 12 —

rules. RULES.

stay off the wet carpet
after the lights dip.

avoid the manager's office.

the hum gets louder near
exits.

— D.`,

  `— 14 —

IT HEARS THE TAPE.

when it's close —
PAUSE THE TAPE.
hold the button down.

don't breathe.
don't let the reels turn.

it worked twice.

— D.`,

  `— 16 —

the exit is DOWN.

it was always down.
under the carpet.
under the hum.

follow MY arrows.
not the old ones.
the old ones lie.

(are mine the old ones now)

— D.`,
]

/** Page 12 after the meta-beat: one line is different. It always was. */
export const TRAIL_NOTE_6_AFTER = `— 12 —

rules. RULES.

stay off the wet carpet
after the lights dip.

avoid the manager's office.

the hum gets louder near
you.

— D.`

/** The last page, beside his camcorder. The pen stroke runs off the paper. */
export const FINAL_NOTE = `— 17 —

if you're reading this
you're holding my camera.

check the date on the tape.
check it against your watch.

I'm sorry.

keep the light behind you
and GO DOWN.

one more thing. the hum.
listen. the hum was never the li`

/** Ending slate copy (DOM sequence, Task 9). */
export const ENDING_LINES = [
  'PLAY ►',
  'JUN.12 2002   AM 6:42:00',
  '',
  'TAPE ENDED',
  '',
  '807 OREGON ST, OSHKOSH, WI',
  'RECOVERED JUN.14 2002',
  'NO PERSONS LOCATED',
  '',
  'CLASSIFICATION: SAFE · SECURE · ENTITY COUNT UNCONFIRMED',
]

export const INTRO_LINES = [
  'RECOVERED MEDIA — TAPE 1 OF 1',
  '807 OREGON ST, OSHKOSH, WI',
  '',
  'JUN.12 2002',
  '',
  'REVIEWED FOR CONTENT — DO NOT DUPLICATE',
  '',
  'PLAYBACK FOLLOWS',
]

// ---------------------------------------------------------------------------
// TAPE 2 (EXPANSION.md Spec E) — the tape that should not exist.
// ---------------------------------------------------------------------------

export const INTRO_LINES_TAPE2 = [
  'RECOVERED MEDIA — TAPE 2 OF 1',
  '807 OREGON ST, OSHKOSH, WI',
  '',
  'JUN.13 2002',
  '',
  'NOTE: SITE INVENTORY LISTS ONE (1) TAPE',
  '',
  'PLAYBACK FOLLOWS',
]

export const ENDING_LINES_TAPE2 = [
  'PLAY ►',
  'JUN.13 2002   AM 6:42:00',
  '',
  'TAPE ENDED',
  '',
  '807 OREGON ST, OSHKOSH, WI',
  'RECOVERED JUN.14 2002',
  'NO PERSONS LOCATED',
  '',
  'CLASSIFICATION: SAFE · SECURE · TAPE COUNT UNCONFIRMED',
]

/**
 * Tape 2 notes — written in response to run 1. At least three reference
 * persisted facts; conditional spawns are keyed in narrative so a note
 * whose condition is false is never placed. Same hand. Same pen.
 */
export const TAPE2_NOTES = {
  backSoSoon: `no page number

back so soon.

I didn't write this.
you didn't read this.

the carpet remembered
your shoes.

— D.`,

  neverDrank: `no page number

you never drank the water.

it noticed.
it takes that personally.

drink the water.

— D.`,

  drankWater: `no page number

you drank the water.

good. it likes being
useful.

don't think about what
it's being useful FOR.

— D.`,

  sleptSafe: `no page number

you slept in the safe room.

so did I.
something counted our
breathing. both nights.

the same count.

— D.`,

  pausedTape: `no page number

you held the button.

you SAW it then. on the
still frame. closer.

it lets you see it when
the reels stop. that's
the price of pausing.

— D.`,

  neverPaused: `no page number

you never paused the tape.

smart.

I checked what's on the
still frames.

don't.

— D.`,
} as const

/** Tape 2, the Manila Room, found again. One new note. Same handwriting. */
export const MANILA_NOTE_TAPE2 = `no page number

I never wrote a second note.

— D.`

/** Spec B doorway-note exploit: for the player who doesn't read. */
export const DOORWAY_NOTE = `no page number

you don't read these.

it does.

— D.`

/** Spec B loudDebt foreshadow (Act 2, only for sprinters). */
export const LOUD_DEBT_NOTE = `no page number

IT COUNTS YOUR STEPS

the loud ones count
double

— D.`

/** Lore egg 4 — the dictionary page. One texture's worth of thesis. */
export const DICTIONARY_NOTE = `ken·op·si·a  /kə'näpsēə/  n.

   the eerie, forlorn atmosphere
   of a place that is usually
   bustling with people but is
   now abandoned and quiet.

—————————————————————

there's a word for it.

that doesn't help.

— D.`

/** Lore egg 1 — the work order (Act 0). Set dressing, unless you know. */
export const WORK_ORDER_NOTE = `WINNEBAGO COMMERCIAL INTERIORS
WORK ORDER  No. 4471

SITE: 807 OREGON ST — SECOND FLOOR
DATE: JUN 2002

SCOPE: full conversion of second
floor retail unit. outgoing tenant
(home furnishings) vacated MAY 31.
incoming tenant (hobby-shop
franchise) takes possession JUL 1.

— strip existing wallpaper (DO NOT
  match. tenant supplies own.)
— carpet: replace throughout.
  existing carpet retained in
  storage room only.
— lighting: replace ballasts as
  needed. note: hum complaint
  from previous tenant UNRESOLVED

signed: ________________`

/** Flooded zone: one submerged note, legible only through the lens. */
export const SUBMERGED_NOTE = `no page number

the water came up on a
wednesday. I think.

it doesn't rise. it
doesn't drain.

it waits at the ankle.

things underneath it
don't make ripples.

— D.`
