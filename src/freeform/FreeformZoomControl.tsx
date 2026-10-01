import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { t } from '../i18n'
import { CheckIcon } from '../ui/icons'
import { isFocusablePointerTarget } from './focusTarget'
import { shortcutLabel } from './shortcutLabels'

export type FreeformViewToggle = 'rulersVisible' | 'guidesVisible' | 'snappingEnabled'

export interface FreeformZoomControlProps {
  isActive: boolean
  zoomPercent: number
  canZoomOut: boolean
  canZoomIn: boolean
  canZoomToSelection: boolean
  view: Record<FreeformViewToggle, boolean>
  onZoomOut: () => void
  onZoomIn: () => void
  onFit: () => void
  onZoomToSelection: () => void
  onToggleView: (toggle: FreeformViewToggle) => void
}

const VIEW_TOGGLES: Array<{ id: FreeformViewToggle; testId: string; label: string }> = [
  { id: 'rulersVisible', testId: 'freeform-rulers-toggle', label: '显示标尺' },
  { id: 'guidesVisible', testId: 'freeform-guides-toggle', label: '显示参考线' },
  { id: 'snappingEnabled', testId: 'freeform-snap-toggle', label: '对象吸附' },
]

const MENU_ITEMS = '[role^="menuitem"]:not(:disabled)'

/** Zoom in the stage's lower right corner. Its value opens zoom and view options, as in Figma. */
export function FreeformZoomControl({
  isActive,
  zoomPercent,
  canZoomOut,
  canZoomIn,
  canZoomToSelection,
  view,
  onZoomOut,
  onZoomIn,
  onFit,
  onZoomToSelection,
  onToggleView,
}: FreeformZoomControlProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!isActive) setOpen(false)
  }, [isActive])

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLButtonElement>(MENU_ITEMS)?.focus()
    function closeOnOutsidePointer(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
      if (!isFocusablePointerTarget(event.target)) triggerRef.current?.focus({ preventScroll: true })
    }
    window.addEventListener('pointerdown', closeOnOutsidePointer, true)
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointer, true)
  }, [open])

  function close(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true })
  }

  function run(action: () => void) {
    action()
    close(true)
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>(MENU_ITEMS) ?? [])
    const index = items.findIndex((item) => item === document.activeElement)
    let next: number | null = null
    if (event.key === 'ArrowDown') next = index + 1
    else if (event.key === 'ArrowUp') next = index < 0 ? items.length - 1 : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    if (next !== null && items.length > 0) {
      event.preventDefault()
      event.stopPropagation()
      items[(next + items.length) % items.length].focus()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div className="freeform-zoom" ref={rootRef} role="group" aria-label={t('预览缩放')}>
      <button
        className="zoom-btn"
        type="button"
        aria-label={t('缩小画布')}
        title={t('缩小画布')}
        disabled={!canZoomOut}
        onClick={onZoomOut}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4 10h12" />
        </svg>
      </button>
      <button
        ref={triggerRef}
        className="zoom-value"
        type="button"
        data-testid="freeform-zoom-value"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'freeform-zoom-menu' : undefined}
        title={t('缩放与视图')}
        onClick={() => setOpen((current) => !current)}
      >
        {zoomPercent}%
      </button>
      <button
        className="zoom-btn"
        type="button"
        aria-label={t('放大画布')}
        title={t('放大画布')}
        disabled={!canZoomIn}
        onClick={onZoomIn}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4v12M4 10h12" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          id="freeform-zoom-menu"
          className="freeform-zoom-menu"
          data-testid="freeform-zoom-menu"
          role="menu"
          aria-label={t('缩放与视图')}
          onKeyDown={onMenuKeyDown}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="freeform-context-menu-item"
            data-testid="freeform-zoom-fit"
            onClick={() => run(onFit)}
          >
            {t('适应画布')}
            <kbd className="freeform-context-menu-shortcut" aria-hidden="true">{shortcutLabel('1', { shift: true })}</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="freeform-context-menu-item"
            data-testid="freeform-zoom-selection"
            disabled={!canZoomToSelection}
            onClick={() => run(onZoomToSelection)}
          >
            {t('缩放到选区')}
            <kbd className="freeform-context-menu-shortcut" aria-hidden="true">{shortcutLabel('2', { shift: true })}</kbd>
          </button>
          <div className="freeform-context-menu-separator" role="separator" />
          {VIEW_TOGGLES.map((toggle) => (
            <button
              key={toggle.id}
              type="button"
              role="menuitemcheckbox"
              tabIndex={-1}
              aria-checked={view[toggle.id]}
              className="freeform-context-menu-item freeform-zoom-check"
              data-testid={toggle.testId}
              onClick={() => run(() => onToggleView(toggle.id))}
            >
              <CheckIcon className="freeform-zoom-check-mark" />
              {t(toggle.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
