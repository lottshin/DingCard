import { useEffect, useId, useRef, useState } from 'react'

const TYPEAHEAD_RESET_MS = 500

function optionDomId(listId: string, optionId: string) {
  const encodedOptionId = Array.from(optionId, (character) =>
    character.codePointAt(0)!.toString(16),
  ).join('-')
  return `${listId}-option-${encodedOptionId || 'empty'}`
}

function isWithinInertSubtree(target: Element) {
  let current: Element | null = target
  while (current) {
    if (current.hasAttribute('inert')) return true
    current = current.parentElement
  }
  return false
}

function hasDisabledInteractiveAncestor(target: Element) {
  let current = target.parentElement
  while (current) {
    if (
      current.matches(':disabled') &&
      !(current instanceof HTMLFieldSetElement)
    ) {
      return true
    }
    current = current.parentElement
  }
  return false
}

function isMouseFocusable(element: HTMLElement) {
  if (element.hasAttribute('tabindex') || element.isContentEditable) return true
  if (element instanceof HTMLAnchorElement || element instanceof HTMLAreaElement) {
    return element.hasAttribute('href')
  }
  if (element instanceof HTMLInputElement) return element.type !== 'hidden'
  return (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element.tagName === 'SUMMARY'
  )
}

function findMouseFocusTarget(target: EventTarget | null) {
  if (!(target instanceof Element) || isWithinInertSubtree(target)) return null

  let current: Element | null = target
  while (current) {
    if (current instanceof HTMLElement && isMouseFocusable(current)) {
      if (
        current.matches(':disabled') ||
        hasDisabledInteractiveAncestor(target)
      ) {
        return null
      }
      return current
    }
    current = current.parentElement
  }
  return null
}

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
  testId?: string
  /** preview each option's label in its own font (used by the font picker) */
  previewFonts?: boolean
}

/**
 * Custom dropdown that replaces the native <select> so it can be styled to
 * match the app chrome (native selects can't be fully themed cross-browser).
 *
 * Keyboard: Enter/Space/Arrows open; Arrows/Home/End move; Enter/Space picks; Esc closes.
 * Closes on outside click. The open panel is positioned under the trigger.
 */
export function Select({ value, options, onChange, title, testId, previewFonts }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const typeaheadBufferRef = useRef('')
  const typeaheadTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const listId = useId()

  const hasOptions = options.length > 0
  const isOpen = open && hasOptions
  const selectedIndex = options.findIndex((option) => option.id === value)
  const selected = options[selectedIndex] ?? options[0]
  const requestedActiveIndex = options.findIndex((option) => option.id === activeOptionId)
  const currentActiveIndex = !hasOptions
    ? -1
    : requestedActiveIndex >= 0
      ? requestedActiveIndex
      : Math.max(0, selectedIndex)
  const normalizedActiveOptionId =
    currentActiveIndex >= 0 ? options[currentActiveIndex].id : null

  function clearTypeahead() {
    typeaheadBufferRef.current = ''
    if (typeaheadTimerRef.current !== null) {
      globalThis.clearTimeout(typeaheadTimerRef.current)
      typeaheadTimerRef.current = null
    }
  }

  function closeMenu() {
    clearTypeahead()
    setOpen(false)
  }

  function openMenu(initialIndex?: number) {
    if (!hasOptions) return
    const nextIndex = Math.min(
      options.length - 1,
      Math.max(0, initialIndex ?? selectedIndex),
    )
    setActiveOptionId(options[nextIndex].id)
    setOpen(true)
  }

  // Close on any outside click while preserving the click target's natural focus behavior.
  useEffect(() => {
    if (!isOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current || rootRef.current.contains(e.target as Node)) return

      closeMenu()
      const focusTarget = findMouseFocusTarget(e.target)
      if (!focusTarget) {
        e.preventDefault()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [isOpen])

  useEffect(() => {
    if (hasOptions) return
    clearTypeahead()
    setActiveOptionId(null)
    setOpen(false)
  }, [hasOptions])

  useEffect(() => {
    if (!isOpen || requestedActiveIndex >= 0 || normalizedActiveOptionId === null) return
    setActiveOptionId(normalizedActiveOptionId)
  }, [isOpen, normalizedActiveOptionId, requestedActiveIndex])

  useEffect(() => () => clearTypeahead(), [])

  function choose(i: number) {
    const opt = options[i]
    if (!opt) return
    closeMenu()
    onChange(opt.id)
  }

  function moveByTypeahead(key: string) {
    const nextBuffer = `${typeaheadBufferRef.current}${key}`.toLocaleLowerCase()
    typeaheadBufferRef.current = nextBuffer
    if (typeaheadTimerRef.current !== null) {
      globalThis.clearTimeout(typeaheadTimerRef.current)
    }
    typeaheadTimerRef.current = globalThis.setTimeout(() => {
      typeaheadBufferRef.current = ''
      typeaheadTimerRef.current = null
    }, TYPEAHEAD_RESET_MS)

    for (let offset = 1; offset <= options.length; offset += 1) {
      const index = (currentActiveIndex + offset) % options.length
      const label = options[index].label.toLocaleLowerCase()
      const matches =
        label.startsWith(nextBuffer) ||
        label.split(/\s+/).some((part) => part.startsWith(nextBuffer))
      if (matches) {
        setActiveOptionId(options[index].id)
        return
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (
        e.key === 'Enter' ||
        e.key === ' ' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp'
      ) {
        e.preventDefault()
        e.stopPropagation()
        openMenu(e.key === 'ArrowUp' ? options.length - 1 : undefined)
      }
      return
    }
    if (e.key === 'Tab') {
      closeMenu()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeMenu()
      triggerRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      const nextIndex = Math.min(options.length - 1, currentActiveIndex + 1)
      setActiveOptionId(options[nextIndex].id)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      const nextIndex = Math.max(0, currentActiveIndex - 1)
      setActiveOptionId(options[nextIndex].id)
    } else if (e.key === 'Home') {
      e.preventDefault()
      e.stopPropagation()
      setActiveOptionId(options[0].id)
    } else if (e.key === 'End') {
      e.preventDefault()
      e.stopPropagation()
      setActiveOptionId(options[options.length - 1].id)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      choose(currentActiveIndex)
    } else if (
      e.key.length === 1 &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey
    ) {
      e.preventDefault()
      e.stopPropagation()
      moveByTypeahead(e.key)
    }
  }

  return (
    <div className="sel" ref={rootRef} title={title}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className={isOpen ? 'sel-trigger open' : 'sel-trigger'}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={onKeyDown}
        aria-label={title}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={
          isOpen ? optionDomId(listId, options[currentActiveIndex].id) : undefined
        }
        disabled={!hasOptions}
        data-testid={testId}
      >
        <span
          className="sel-value"
          style={
            previewFonts && selected
              ? { fontFamily: selected.previewFont ?? selected.id }
              : undefined
          }
        >
          {selected?.label ?? '暂无选项'}
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

      {isOpen && (
        <ul className="sel-panel" role="listbox" id={listId}>
          {options.map((o, i) => (
            <li
              key={o.id}
              id={optionDomId(listId, o.id)}
              role="option"
              aria-selected={o.id === value}
              className={
                'sel-option' +
                (o.id === value ? ' selected' : '') +
                (i === currentActiveIndex ? ' hover' : '')
              }
              style={previewFonts ? { fontFamily: o.previewFont ?? o.id } : undefined}
              onMouseEnter={() => setActiveOptionId(o.id)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                choose(i)
              }}
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
