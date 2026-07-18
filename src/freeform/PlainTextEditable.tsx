import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

interface PlainTextEditableProps {
  value: string
  className?: string
  style?: CSSProperties
  ariaLabel: string
  readOnly?: boolean
  onFocus: () => void
  onChange: (value: string) => void
}

export function PlainTextEditable({
  value,
  className,
  style,
  ariaLabel,
  readOnly = false,
  onFocus,
  onChange,
}: PlainTextEditableProps) {
  const ref = useRef<HTMLDivElement>(null)
  const composingRef = useRef(false)
  const focusedRef = useRef(false)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    if (readOnly) {
      composingRef.current = false
      focusedRef.current = false
      node.blur()
      if (node.textContent !== value) node.textContent = value
      return
    }
    if (composingRef.current || focusedRef.current) return
    if (node.textContent !== value) node.textContent = value
  }, [readOnly, value])

  function publish() {
    if (readOnly || composingRef.current) return
    onChange(ref.current?.textContent ?? '')
  }

  function insertPlainText(text: string) {
    if (readOnly) return
    const root = ref.current
    if (!root) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) {
      root.append(document.createTextNode(text))
      return
    }

    const range = selection.getRangeAt(0)
    range.deleteContents()
    const node = document.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.setEndAfter(node)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  return (
    <div
      ref={ref}
      className={className}
      data-testid="freeform-textbox"
      role="textbox"
      aria-label={ariaLabel}
      aria-readonly={readOnly}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck={false}
      style={style}
      onFocus={() => {
        focusedRef.current = true
        onFocus()
      }}
      onBlur={() => {
        focusedRef.current = false
        if (!readOnly) publish()
      }}
      onInput={() => {
        if (!readOnly) publish()
      }}
      onCompositionStart={() => {
        if (!readOnly) composingRef.current = true
      }}
      onCompositionEnd={() => {
        composingRef.current = false
        if (!readOnly) publish()
      }}
      onPaste={(event) => {
        event.preventDefault()
        if (readOnly) return
        insertPlainText(event.clipboardData.getData('text/plain'))
        publish()
      }}
    />
  )
}
