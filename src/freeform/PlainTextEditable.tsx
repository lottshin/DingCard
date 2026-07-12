import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

interface PlainTextEditableProps {
  value: string
  className?: string
  style?: CSSProperties
  ariaLabel: string
  onFocus: () => void
  onChange: (value: string) => void
}

export function PlainTextEditable({
  value,
  className,
  style,
  ariaLabel,
  onFocus,
  onChange,
}: PlainTextEditableProps) {
  const ref = useRef<HTMLDivElement>(null)
  const composingRef = useRef(false)
  const focusedRef = useRef(false)

  useEffect(() => {
    const node = ref.current
    if (!node || composingRef.current || focusedRef.current) return
    if (node.textContent !== value) node.textContent = value
  }, [value])

  function publish() {
    onChange(ref.current?.textContent ?? '')
  }

  function insertPlainText(text: string) {
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
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={style}
      onFocus={() => {
        focusedRef.current = true
        onFocus()
      }}
      onBlur={() => {
        focusedRef.current = false
        publish()
      }}
      onInput={publish}
      onCompositionStart={() => {
        composingRef.current = true
      }}
      onCompositionEnd={() => {
        composingRef.current = false
        publish()
      }}
      onPaste={(event) => {
        event.preventDefault()
        insertPlainText(event.clipboardData.getData('text/plain'))
        publish()
      }}
    />
  )
}
