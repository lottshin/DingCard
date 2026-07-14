import { useEffect, useRef, useState } from 'react'

export interface FreeformInsertMenuOption<T extends string> {
  id: T
  label: string
}

export interface FreeformInsertMenuProps<T extends string> {
  isActive: boolean
  testId: string
  label: string
  options: Array<FreeformInsertMenuOption<T>>
  onSelect: (id: T) => void
}

export function FreeformInsertMenu<T extends string>({
  isActive,
  testId,
  label,
  options,
  onSelect,
}: FreeformInsertMenuProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const focusFrameRef = useRef<number | null>(null)
  const isActiveRef = useRef(isActive)
  const selectedForOpenRef = useRef(false)
  const [open, setOpen] = useState(false)
  const menuId = `${testId}-menu`

  isActiveRef.current = isActive

  function cancelFocusFrame() {
    if (focusFrameRef.current === null) return
    window.cancelAnimationFrame(focusFrameRef.current)
    focusFrameRef.current = null
  }

  function returnFocusToTrigger() {
    if (!isActiveRef.current) return
    cancelFocusFrame()
    focusFrameRef.current = window.requestAnimationFrame(() => {
      focusFrameRef.current = null
      if (isActiveRef.current) triggerRef.current?.focus()
    })
  }

  function closeMenu(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) returnFocusToTrigger()
  }

  function openMenu() {
    if (!isActive || options.length === 0) return
    selectedForOpenRef.current = false
    setOpen(true)
  }

  function selectOption(id: T) {
    if (selectedForOpenRef.current) return
    selectedForOpenRef.current = true
    onSelect(id)
    closeMenu(true)
  }

  function focusItem(index: number) {
    const itemCount = options.length
    if (itemCount === 0) return
    const wrappedIndex = (index + itemCount) % itemCount
    itemRefs.current[wrappedIndex]?.focus()
  }

  useEffect(() => {
    if (!open || !isActive) return
    itemRefs.current[0]?.focus()
  }, [open, isActive])

  useEffect(() => {
    if (isActive) return
    cancelFocusFrame()
    setOpen(false)
  }, [isActive])

  useEffect(
    () => () => {
      cancelFocusFrame()
    },
    [],
  )

  useEffect(() => {
    if (!open || !isActive) return

    function closeOnOutsidePointer(event: PointerEvent) {
      const root = rootRef.current
      if (!root || root.contains(event.target as Node)) return
      const nextInsertTrigger =
        event.target instanceof Element
          ? event.target.closest('.freeform-insert-trigger')
          : null
      closeMenu(nextInsertTrigger === null)
    }

    window.addEventListener('pointerdown', closeOnOutsidePointer, true)
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointer, true)
  }, [open, isActive])

  return (
    <div className="freeform-insert-menu-control" ref={rootRef}>
      <button
        ref={triggerRef}
        className="freeform-insert-trigger"
        type="button"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? closeMenu(false) : openMenu())}
      >
        <span>{label}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </button>

      {open && (
        <div
          className="freeform-insert-menu"
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            const activeIndex = itemRefs.current.findIndex(
              (item) => item === globalThis.document.activeElement,
            )
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              event.stopPropagation()
              focusItem(activeIndex + 1)
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              event.stopPropagation()
              focusItem(activeIndex < 0 ? options.length - 1 : activeIndex - 1)
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              closeMenu(true)
            }
          }}
        >
          {options.map((option, index) => (
            <button
              key={option.id}
              ref={(element) => {
                itemRefs.current[index] = element
              }}
              className="freeform-insert-menu-item"
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => selectOption(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
