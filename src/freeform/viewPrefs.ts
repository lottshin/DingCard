// Per-user editor view preferences for the freeform canvas (rulers, guide
// visibility, object snapping, the settings panel, and PNG/JPEG export
// options), persisted so the toggles survive reloads. Storage failures degrade to the defaults — blocked
// storage must never break the app.

/** PNG and JPG export pictures; PDF puts each page in one file. */
export type ExportFormat = 'png' | 'jpeg' | 'pdf'

export interface FreeformViewPrefs {
  /** Rulers along the stage's top and left edges; off keeps the canvas quiet. */
  rulersVisible: boolean
  guidesVisible: boolean
  snappingEnabled: boolean
  exportFormat: ExportFormat
  /** JPEG quality in [0.5, 1]; ignored for PNG. */
  exportQuality: number
  /** Export pixel ratio; 2 doubles the output resolution. */
  exportScale: 1 | 2
  /** The settings panel beside the canvas (properties, layers, history); closed until asked for. */
  panelOpen: boolean
  /** The page list beside the stage; shown until someone collapses it. */
  pagesVisible: boolean
}

const KEY = 'slicer.freeform.prefs.v1'

export const DEFAULT_VIEW_PREFS: FreeformViewPrefs = {
  rulersVisible: false,
  guidesVisible: true,
  snappingEnabled: true,
  exportFormat: 'png',
  exportQuality: 0.92,
  exportScale: 1,
  panelOpen: false,
  pagesVisible: true,
}

function isExportFormat(value: unknown): value is ExportFormat {
  return value === 'png' || value === 'jpeg' || value === 'pdf'
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
      rulersVisible: typeof record.rulersVisible === 'boolean'
        ? record.rulersVisible
        : DEFAULT_VIEW_PREFS.rulersVisible,
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
      panelOpen: typeof record.panelOpen === 'boolean'
        ? record.panelOpen
        : DEFAULT_VIEW_PREFS.panelOpen,
      pagesVisible: typeof record.pagesVisible === 'boolean'
        ? record.pagesVisible
        : DEFAULT_VIEW_PREFS.pagesVisible,
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
