import { useEffect, useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { isStyledRun, splitTextRuns, textRunStyle, type TextRun } from './richText'
import type { RichTextSpan } from './types'

export interface TextSelectionRange {
  start: number
  end: number
}

interface PlainTextEditableProps {
  value: string
  /** Rich text spans over `value`; rendered as styled inline runs. */
  spans?: RichTextSpan[]
  /** A solid colour for styled runs in gradient text (see textRunStyle). */
  runFallbackColor?: string
  className?: string
  style?: CSSProperties
  ariaLabel: string
  readOnly?: boolean
  onFocus: () => void
  onChange: (value: string) => void
  /** Live character selection inside the editable; null when it has none. */
  onSelectionChange?: (range: TextSelectionRange | null) => void
}

function runNode(run: TextRun, fallbackColor: string | undefined): Node {
  if (!isStyledRun(run)) return document.createTextNode(run.text)
  const span = document.createElement('span')
  for (const [property, value] of Object.entries(textRunStyle(run, fallbackColor))) {
    span.style.setProperty(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value)
  }
  span.textContent = run.text
  return span
}

/** Rebuild the editable's content from the model (plain text + styled runs). */
function applyContent(
  root: HTMLElement,
  value: string,
  spans: RichTextSpan[] | undefined,
  fallbackColor: string | undefined,
) {
  const fragment = document.createDocumentFragment()
  for (const run of splitTextRuns(value, spans)) fragment.append(runNode(run, fallbackColor))
  root.replaceChildren(fragment)
}

function offsetInRoot(root: HTMLElement, node: Node, offset: number): number | null {
  let count = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  while (current) {
    if (current === node) return count + offset
    count += current.textContent?.length ?? 0
    current = walker.nextNode()
  }
  return null
}

function selectionInRoot(root: HTMLElement): TextSelectionRange | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const start = offsetInRoot(root, range.startContainer, range.startOffset)
  const end = offsetInRoot(root, range.endContainer, range.endOffset)
  if (start === null || end === null) return null
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

/** Restore a character selection after the content was rebuilt from the model. */
function setSelectionInRoot(root: HTMLElement, start: number, end: number) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  let count = 0
  let startNode: Node | null = null
  let startOffset = 0
  let endNode: Node | null = null
  let endOffset = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  while (current && (startNode === null || endNode === null)) {
    const length = current.textContent?.length ?? 0
    if (startNode === null && start <= count + length) {
      startNode = current
      startOffset = Math.max(0, Math.min(start - count, length))
    }
    if (endNode === null && end <= count + length) {
      endNode = current
      endOffset = Math.max(0, Math.min(end - count, length))
    }
    count += length
    current = walker.nextNode()
  }
  if (startNode === null || endNode === null) {
    range.setStart(root, 0)
    range.setEnd(root, 0)
  } else {
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
  }
  selection.removeAllRanges()
  selection.addRange(range)
}

export function PlainTextEditable({
  value,
  spans,
  runFallbackColor,
  className,
  style,
  ariaLabel,
  readOnly = false,
  onFocus,
  onChange,
  onSelectionChange,
}: PlainTextEditableProps) {
  const ref = useRef<HTMLDivElement>(null)
  const composingRef = useRef(false)
  const focusedRef = useRef(false)
  const appliedSpansRef = useRef<RichTextSpan[] | undefined>(undefined)
  const appliedFallbackRef = useRef<string | undefined>(undefined)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const spansChanged = appliedSpansRef.current !== spans
      || appliedFallbackRef.current !== runFallbackColor
    const apply = () => {
      applyContent(node, value, spans, runFallbackColor)
      appliedSpansRef.current = spans
      appliedFallbackRef.current = runFallbackColor
    }
    if (readOnly) {
      composingRef.current = false
      focusedRef.current = false
      if (document.activeElement === node) node.blur()
      if (node.textContent !== value || spansChanged) apply()
      return
    }
    if (composingRef.current) return
    if (focusedRef.current) {
      // The DOM owns the content while focused; a spans change (e.g. the
      // inspector bolded the current selection) rebuilds the runs in place
      // and restores the caret so editing continues seamlessly.
      if (!spansChanged) return
      const selection = selectionInRoot(node)
      apply()
      if (selection) setSelectionInRoot(node, selection.start, selection.end)
      return
    }
    if (node.textContent !== value || spansChanged) apply()
  }, [readOnly, value, spans, runFallbackColor])

  // Report the live character selection while the editable owns the caret.
  useEffect(() => {
    if (readOnly || !onSelectionChange) return
    const node = ref.current
    if (!node) return
    const handleSelectionChange = () => {
      if (!focusedRef.current) return
      onSelectionChange(selectionInRoot(node))
    }
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [readOnly, onSelectionChange])

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
        if (onSelectionChange) onSelectionChange(null)
        if (!readOnly) publish()
      }}
      onInput={() => {
        if (!readOnly) publish()
      }}
      onKeyUp={() => {
        if (!readOnly && onSelectionChange && focusedRef.current && ref.current) {
          onSelectionChange(selectionInRoot(ref.current))
        }
      }}
      onMouseUp={() => {
        if (!readOnly && onSelectionChange && focusedRef.current && ref.current) {
          onSelectionChange(selectionInRoot(ref.current))
        }
      }}
      onCompositionStart={() => {
        if (!readOnly) composingRef.current = true
      }}
      onCompositionEnd={() => {
        composingRef.current = false
        if (!readOnly) publish()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        if (event.nativeEvent.isComposing || composingRef.current) return
        event.preventDefault()
        event.stopPropagation()
        ref.current?.blur()
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
