// Per-user editor view preferences for the freeform canvas (guide visibility,
// object snapping, and PNG/JPEG export options), persisted so the toggles
// survive reloads. Storage failures degrade to the defaults — blocked storage
// must never break the app.

export type ExportFormat = 'png' | 'jpeg'

export interface FreeformViewPrefs {
  guidesVisible: boolean
  snappingEnabled: boolean
  exportFormat: ExportFormat
  /** JPEG quality in [0.5, 1]; ignored for PNG. */
  exportQuality: number
  /** Export pixel ratio; 2 doubles the output resolution. */
  exportScale: 1 | 2
}

const KEY = 'slicer.freeform.prefs.v1'

export const DEFAULT_VIEW_PREFS: FreeformViewPrefs = {
  guidesVisible: true,
  snappingEnabled: true,
  exportFormat: 'png',
  exportQuality: 0.92,
  exportScale: 1,
}

function isExportFormat(value: unknown): value is ExportFormat {
  return value === 'png' || value === 'jpeg'
}

export function loadViewPrefs(): FreeformViewPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_VIEW_PREFS }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_VIEW_PREFS }
    const record = parsed as Record<string, unknown>
    // Project only the known fields so stale payloads with extra keys (or the
    // pre-export-options shape) never leak into component state.
    return {
      guidesVisible: typeof record.guidesVisible === 'boolean'
        ? record.guidesVisible
        : DEFAULT_VIEW_PREFS.guidesVisible,
      snappingEnabled: typeof record.snappingEnabled === 'boolean'
        ? record.snappingEnabled
        : DEFAULT_VIEW_PREFS.snappingEnabled,
      exportFormat: isExportFormat(record.exportFormat)
        ? record.exportFormat
        : DEFAULT_VIEW_PREFS.exportFormat,
      exportQuality: typeof record.exportQuality === 'number'
          && Number.isFinite(record.exportQuality)
          && record.exportQuality >= 0.5
          && record.exportQuality <= 1
        ? record.exportQuality
        : DEFAULT_VIEW_PREFS.exportQuality,
      exportScale: record.exportScale === 2 ? 2 : 1,
    }
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
