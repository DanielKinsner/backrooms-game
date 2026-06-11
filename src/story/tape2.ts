/**
 * TAPE 2 persistence (EXPANSION.md Spec E). On first completion the run
 * writes a summary to localStorage; the menu grows a second tape. All
 * persistence is local; corrupt or missing storage silently degrades to
 * Tape-1 behavior — the fail-safe is the absence of a feature, never a bug.
 */

export interface RunSummary {
  completions: number
  notesRead: number
  notesPlaced: number
  almondDrunk: number
  thermosDrunk: boolean
  sleptInManila: boolean
  qPauseUsed: boolean
  sprintRatio: number
  lookbackRate: number
  zoomUsage: number
  wallHug: number
  walked: number
}

const KEY = 'noclip.tape1'

export function loadRunSummary(): RunSummary | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<RunSummary>
    if (typeof s.completions !== 'number' || s.completions < 1) return null
    return {
      completions: s.completions,
      notesRead: s.notesRead ?? 0,
      notesPlaced: s.notesPlaced ?? 9,
      almondDrunk: s.almondDrunk ?? 0,
      thermosDrunk: s.thermosDrunk ?? false,
      sleptInManila: s.sleptInManila ?? false,
      qPauseUsed: s.qPauseUsed ?? false,
      sprintRatio: s.sprintRatio ?? 0,
      lookbackRate: s.lookbackRate ?? 0,
      zoomUsage: s.zoomUsage ?? 0,
      wallHug: s.wallHug ?? 2,
      walked: s.walked ?? 0,
    }
  } catch {
    return null
  }
}

export function saveRunSummary(s: RunSummary): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable — Tape 1 forever, and that's fine */
  }
}

export function hasTape2(): boolean {
  return loadRunSummary() !== null
}

/** Selected tape for THIS run. Set by the menu before pointer lock. */
export function isTape2Run(): boolean {
  return window.sessionStorage.getItem('noclip.tape') === '2'
}

export function selectTape(n: 1 | 2): void {
  try {
    window.sessionStorage.setItem('noclip.tape', String(n))
  } catch {
    /* ignore */
  }
}
