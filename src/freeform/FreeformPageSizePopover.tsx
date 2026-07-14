import { useEffect, useRef, useState } from 'react'
import { PAGE_SIZE_MAX, PAGE_SIZE_MIN } from './constants'
import { pageSizePresets, validatePageSize } from './document'

export interface FreeformPageSizePopoverProps {
  isActive: boolean
  width: number
  height: number
  onApply: (width: number, height: number) => void
}

const POPOVER_ID = 'freeform-page-size-popover'
const ERROR_ID = 'freeform-page-size-error'

function parseDraft(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value)
}

export function FreeformPageSizePopover({
  isActive,
  width,
  height,
  onApply,
}: FreeformPageSizePopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const focusFrameRef = useRef<number | null>(null)
  const isActiveRef = useRef(isActive)
  const [open, setOpen] = useState(false)
  const [widthDraft, setWidthDraft] = useState(String(width))
  const [heightDraft, setHeightDraft] = useState(String(height))
  const [error, setError] = useState<string | null>(null)

  const matchingPreset = pageSizePresets.find(
    (preset) => preset.width === width && preset.height === height,
  )
  const sizeLabel = matchingPreset
    ? `${matchingPreset.ratio} · ${width}×${height}px`
    : `自定义 · ${width}×${height}px`

  isActiveRef.current = isActive

  function returnFocusToTrigger() {
    if (!isActiveRef.current) return
    if (focusFrameRef.current !== null) window.cancelAnimationFrame(focusFrameRef.current)
    focusFrameRef.current = window.requestAnimationFrame(() => {
      focusFrameRef.current = null
      if (isActiveRef.current) triggerRef.current?.focus()
    })
  }

  function closePopover(returnFocus: boolean) {
    setOpen(false)
    setError(null)
    if (returnFocus) returnFocusToTrigger()
  }

  function openPopover() {
    if (!isActive) return
    setWidthDraft(String(width))
    setHeightDraft(String(height))
    setError(null)
    setOpen(true)
  }

  function apply(nextWidth: number, nextHeight: number) {
    const validation = validatePageSize(nextWidth, nextHeight)
    if (!validation.ok) {
      setError(validation.message)
      return
    }

    onApply(nextWidth, nextHeight)
    closePopover(true)
  }

  useEffect(() => {
    if (isActive) return
    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current)
      focusFrameRef.current = null
    }
    setOpen(false)
    setError(null)
  }, [isActive])

  useEffect(
    () => () => {
      if (focusFrameRef.current !== null) window.cancelAnimationFrame(focusFrameRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!open || !isActive) return
    const selectedPreset = popoverRef.current?.querySelector<HTMLButtonElement>(
      '.page-size-preset[aria-pressed="true"]',
    )
    const firstField = popoverRef.current?.querySelector<HTMLInputElement>('.page-size-field input')
    const focusTarget = selectedPreset ?? firstField
    focusTarget?.focus()
  }, [open, isActive])

  useEffect(() => {
    if (!open) return

    function closeOnOutsidePointer(event: PointerEvent) {
      const root = rootRef.current
      if (root && !root.contains(event.target as Node)) closePopover(true)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      closePopover(true)
    }

    window.addEventListener('pointerdown', closeOnOutsidePointer, true)
    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer, true)
      window.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [open, isActive])

  return (
    <div className="page-size-control" ref={rootRef}>
      <button
        ref={triggerRef}
        className="page-size-trigger"
        type="button"
        data-testid="page-size-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={POPOVER_ID}
        onClick={() => (open ? closePopover(false) : openPopover())}
      >
        <span data-testid="freeform-slide-size">{sizeLabel}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="page-size-popover"
          id={POPOVER_ID}
          data-testid="page-size-popover"
          role="dialog"
          aria-label="页面尺寸"
        >
          <div className="page-size-popover-heading">
            <strong>页面尺寸</strong>
            <span>{width}×{height}px</span>
          </div>

          <div className="page-size-presets" aria-label="常用页面比例">
            {pageSizePresets.map((preset) => {
              const selected = preset.width === width && preset.height === height
              return (
                <button
                  key={preset.ratio}
                  type="button"
                  className={selected ? 'page-size-preset on' : 'page-size-preset'}
                  aria-label={preset.ratio}
                  aria-pressed={selected}
                  onClick={() => apply(preset.width, preset.height)}
                >
                  <span>{preset.ratio}</span>
                  <small>{preset.width}×{preset.height}</small>
                </button>
              )
            })}
          </div>

          <form
            className="page-size-custom"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              apply(parseDraft(widthDraft), parseDraft(heightDraft))
            }}
          >
            <div className="page-size-custom-heading">自定义尺寸</div>
            <div className="page-size-fields">
              <label className="page-size-field">
                <span>宽度 <small>px</small></span>
                <input
                  aria-label="宽度 px"
                  aria-describedby={error ? ERROR_ID : undefined}
                  type="number"
                  inputMode="numeric"
                  min={PAGE_SIZE_MIN}
                  max={PAGE_SIZE_MAX}
                  step="1"
                  value={widthDraft}
                  onChange={(event) => {
                    setWidthDraft(event.currentTarget.value)
                    setError(null)
                  }}
                />
              </label>
              <span className="page-size-times" aria-hidden="true">×</span>
              <label className="page-size-field">
                <span>高度 <small>px</small></span>
                <input
                  aria-label="高度 px"
                  aria-describedby={error ? ERROR_ID : undefined}
                  type="number"
                  inputMode="numeric"
                  min={PAGE_SIZE_MIN}
                  max={PAGE_SIZE_MAX}
                  step="1"
                  value={heightDraft}
                  onChange={(event) => {
                    setHeightDraft(event.currentTarget.value)
                    setError(null)
                  }}
                />
              </label>
            </div>

            {error && (
              <div className="page-size-error" id={ERROR_ID} role="alert">
                {error}
              </div>
            )}

            <button className="page-size-apply" type="submit">
              应用尺寸
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
