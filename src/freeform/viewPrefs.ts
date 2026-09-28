// Per-user editor view preferences for the freeform canvas (guide visibility
// and object snapping), persisted so the toggles survive reloads. Storage
// failures degrade to the defaults — blocked storage must never break the app.

export interface FreeformViewPrefs {
  guidesVisible: boolean
  snappingEnabled: boolean
}

const KEY = 'slicer.freeform.prefs.v1'

export const DEFAULT_VIEW_PREFS: FreeformViewPrefs = {
  guidesVisible: true,
  snappingEnabled: true,
}

function isPrefs(value: unknown): value is FreeformViewPrefs {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as FreeformViewPrefs).guidesVisible === 'boolean'
    && typeof (value as FreeformViewPrefs).snappingEnabled === 'boolean'
  )
}

export function loadViewPrefs(): FreeformViewPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_VIEW_PREFS }
    const parsed: unknown = JSON.parse(raw)
    if (!isPrefs(parsed)) return { ...DEFAULT_VIEW_PREFS }
    // Project only the known fields so stale payloads with extra keys never
    // leak into component state.
    return { guidesVisible: parsed.guidesVisible, snappingEnabled: parsed.snappingEnabled }
  } catch {
    return { ...DEFAULT_VIEW_PREFS }
  }
}

export function saveViewPrefs(prefs: FreeformViewPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // Best-effort persistence: a blocked quota or private mode keeps the
    // session-level state working.
  }
}
