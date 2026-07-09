import { useEffect, useId, useRef, useState } from 'react'

export interface SelectOption {
  id: string
  label: string
  /** optional font-family applied to this option's label (font picker preview) */
  previewFont?: string
}

interface SelectProps {
  value: string
  options: SelectOption[]
  onChange: (id: string) => void
  title?: string
  /** preview each option's label in its own font (used by the font picker) */
  previewFonts?: boolean
}

/**
 * Custom dropdown that replaces the native <select> so it can be styled to
 * match the app chrome (native selects can't be fully themed cross-browser).
 *
 * Keyboard: Enter/Space/ArrowDown opens; Arrows move; Enter picks; Esc closes.
 * Closes on outside click. The open panel is positioned under the trigger.
 */
export function Select({ value, options, onChange, title, previewFonts }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selected = options.find((o) => o.id === value) ?? options[0]

  // Close on any outside click.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // When opening, start the highlight on the current value.
  useEffect(() => {
    if (open) setHover(Math.max(0, options.findIndex((o) => o.id === value)))
  }, [open, options, value])

  function choose(i: number) {
    const opt = options[i]
    if (opt) onChange(opt.id)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHover((h) => Math.min(options.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHover((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(hover)
    }
  }

  return (
    <div className="sel" ref={rootRef} title={title}>
      <button
        type="button"
        className={open ? 'sel-trigger open' : 'sel-trigger'}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className="sel-value"
          style={previewFonts ? { fontFamily: selected.previewFont ?? selected.id } : undefined}
        >
          {selected.label}
        </span>
        <svg className="sel-caret" viewBox="0 0 10 6" width="10" height="6" aria-hidden>
          <path
            d="M1 1l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ul className="sel-panel" role="listbox" id={listId}>
          {options.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={o.id === value}
              className={
                'sel-option' +
                (o.id === value ? ' selected' : '') +
                (i === hover ? ' hover' : '')
              }
              style={previewFonts ? { fontFamily: o.previewFont ?? o.id } : undefined}
              onMouseEnter={() => setHover(i)}
              onClick={() => choose(i)}
            >
              {o.label}
              {o.id === value && (
                <svg className="sel-check" viewBox="0 0 14 14" width="14" height="14" aria-hidden>
                  <path
                    d="M2.5 7.5l3 3 6-6.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
