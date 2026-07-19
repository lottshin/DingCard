import { useLayoutEffect, useRef, useState } from 'react'

export interface InspectorNumberInputProps {
  ariaLabel: string
  value: number
  min?: number
  max?: number
  step?: number | 'any'
  resetKey?: unknown
  onCommit: (value: number) => boolean | void
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return ''
  const rounded = Number(value.toFixed(2))
  if (rounded !== 0 || value === 0) return String(rounded)
  return value.toExponential(2).replace('e+', 'e')
}

/** Buffered numeric inspector field: partial input never creates document history. */
export function InspectorNumberInput({
  ariaLabel,
  value,
  min,
  max,
  step = 'any',
  resetKey,
  onCommit,
}: InspectorNumberInputProps) {
  const [draft, setDraft] = useState(() => formatNumber(value))
  const draftRef = useRef(draft)
  const [editing, setEditing] = useState(false)
  const lastValueRef = useRef(value)
  const lastResetKeyRef = useRef(resetKey)
  const cancelBlurRef = useRef(false)
  const editStartDraftRef = useRef(formatNumber(value))
  const userChangedRef = useRef(false)

  useLayoutEffect(() => {
    const externalReset = resetKey !== lastResetKeyRef.current
    if (!editing || value !== lastValueRef.current || externalReset) {
      const formatted = formatNumber(value)
      draftRef.current = formatted
      setDraft(formatted)
      editStartDraftRef.current = formatted
      userChangedRef.current = false
    }
    lastValueRef.current = value
    lastResetKeyRef.current = resetKey
  }, [editing, resetKey, value])

  function reset() {
    const formatted = formatNumber(value)
    draftRef.current = formatted
    setDraft(formatted)
    setEditing(false)
    cancelBlurRef.current = false
    editStartDraftRef.current = formatted
    userChangedRef.current = false
  }

  function commit() {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false
      return
    }
    const currentDraft = draftRef.current
    if (!userChangedRef.current || currentDraft === editStartDraftRef.current) {
      reset()
      return
    }
    const parsed = Number(currentDraft)
    const valid = currentDraft.trim().length > 0 && Number.isFinite(parsed) &&
      (min === undefined || parsed >= min) &&
      (max === undefined || parsed <= max)
    if (!valid || parsed === value) {
      reset()
      return
    }
    const accepted = onCommit(parsed)
    if (accepted === false) reset()
    else setEditing(false)
  }

  return (
    <input
      type="number"
      aria-label={ariaLabel}
      value={draft}
      min={min}
      max={max}
      step={step}
      onFocus={() => {
        editStartDraftRef.current = draftRef.current
        userChangedRef.current = false
        setEditing(true)
      }}
      onChange={(event) => {
        const nextDraft = event.currentTarget.value
        setEditing(true)
        userChangedRef.current = nextDraft !== editStartDraftRef.current
        draftRef.current = nextDraft
        setDraft(nextDraft)
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          cancelBlurRef.current = true
          const formatted = formatNumber(value)
          draftRef.current = formatted
          setDraft(formatted)
          setEditing(false)
          userChangedRef.current = false
          event.currentTarget.blur()
        }
      }}
    />
  )
}
