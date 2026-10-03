import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { isStyledRun, splitParagraphRuns, textRunStyle, type TextRun } from './richText'
import { keepsEmptyLine } from './textLayout'
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
  /** The text's own size, which runs with a size of their own are a share of. */
  baseFontSize?: number
  /** The paragraph and list attributes (textLayoutAttributes). */
  attributes?: Record<string, string>
  className?: string
  style?: CSSProperties
  ariaLabel: string
  readOnly?: boolean
  onFocus: () => void
  onChange: (value: string) => void
  /** Live character selection inside the editable; null when it has none. */
  onSelectionChange?: (range: TextSelectionRange | null) => void
}

function runNode(run: TextRun, fallbackColor: string | undefined, baseFontSize: number | undefined): Node {
  if (!isStyledRun(run)) return document.createTextNode(run.text)
  const span = document.createElement('span')
  for (const [property, value] of Object.entries(textRunStyle(run, fallbackColor, baseFontSize))) {
    span.style.setProperty(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value)
  }
  span.textContent = run.text
  return span
}

/** Rebuild the editable's content from the model: one block per paragraph, styled runs inside. */
function applyContent(
  root: HTMLElement,
  value: string,
  spans: RichTextSpan[] | undefined,
  fallbackColor: string | undefined,
  baseFontSize: number | undefined,
) {
  const fragment = document.createDocumentFragment()
  const paragraphs = splitParagraphRuns(value, spans)
  paragraphs.forEach((paragraph, index) => {
    const block = document.createElement('div')
    for (const run of paragraph) block.append(runNode(run, fallbackColor, baseFontSize))
    if (keepsEmptyLine(paragraph, index, paragraphs.length)) block.append(document.createElement('br'))
    fragment.append(block)
  })
  root.replaceChildren(fragment)
}

function isBlock(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && ((node as Element).tagName === 'DIV' || (node as Element).tagName === 'P')
}

/** A <br> with nothing after it in its block: it only holds an empty line open. */
function endsItsBlock(br: Element): boolean {
  for (let next = br.nextSibling; next; next = next.nextSibling) {
    if (next.nodeType === Node.TEXT_NODE && (next.textContent ?? '') === '') continue
    return false
  }
  return true
}

/**
 * The plain text an editable (or a piece of one) holds: its paragraphs —
 * the blocks the browser makes on Enter, or text with no block around it —
 * joined by "\n". A <br> breaks a line unless it only ends its block.
 */
export function editableText(root: Node): string {
  const paragraphs: string[] = []
  let current: string | null = null
  const open = () => {
    if (current === null) current = ''
  }
  const close = () => {
    if (current !== null) paragraphs.push(current)
    current = null
  }
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        open()
        ;(child.textContent ?? '').split('\n').forEach((part, index) => {
          if (index > 0) {
            close()
            open()
          }
          current += part
        })
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as Element
        if (element.tagName === 'BR') {
          open()
          if (!endsItsBlock(element)) {
            close()
            open()
          }
        } else if (isBlock(element)) {
          close()
          open()
          walk(element)
          close()
        } else {
          walk(element)
        }
      }
    }
  }
  walk(root)
  close()
  return paragraphs.join('\n')
}

/** Where a DOM point falls in the plain text: the length of everything before it. */
function offsetInRoot(root: HTMLElement, node: Node, offset: number): number | null {
  if (!root.contains(node)) return null
  const range = document.createRange()
  range.setStart(root, 0)
  range.setEnd(node, offset)
  return editableText(range.cloneContents()).length
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

/** The DOM point of a plain-text offset in content applyContent built (one block per paragraph). */
function pointInRoot(root: HTMLElement, offset: number): { node: Node; offset: number } {
  let paragraphStart = 0
  const blocks = Array.from(root.childNodes)
  for (const [index, block] of blocks.entries()) {
    const length = editableText(block).length
    if (offset <= paragraphStart + length || index === blocks.length - 1) {
      const within = Math.max(0, Math.min(offset - paragraphStart, length))
      let count = 0
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
      for (let current = walker.nextNode(); current; current = walker.nextNode()) {
        const size = current.textContent?.length ?? 0
        if (within <= count + size) return { node: current, offset: within - count }
        count += size
      }
      return { node: block, offset: 0 }
    }
    paragraphStart += length + 1
  }
  return { node: root, offset: 0 }
}

/** Restore a character selection after the content was rebuilt from the model. */
function setSelectionInRoot(root: HTMLElement, start: number, end: number) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  const from = pointInRoot(root, start)
  const to = pointInRoot(root, end)
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function PlainTextEditable({
  value,
  spans,
  runFallbackColor,
  baseFontSize,
  attributes,
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
  const appliedSizeRef = useRef<number | undefined>(undefined)
  /** The browser changed the content (typing, Enter, paste) since it was last built from the model. */
  const editedRef = useRef(false)
  /** Bumped when the editable lets go of the caret after an edit, so the content is rebuilt from the model. */
  const [releases, setReleases] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const spansChanged = appliedSpansRef.current !== spans
      || appliedFallbackRef.current !== runFallbackColor
      || appliedSizeRef.current !== baseFontSize
    const apply = () => {
      applyContent(node, value, spans, runFallbackColor, baseFontSize)
      appliedSpansRef.current = spans
      appliedFallbackRef.current = runFallbackColor
      appliedSizeRef.current = baseFontSize
      editedRef.current = false
    }
    if (readOnly) {
      composingRef.current = false
      focusedRef.current = false
      if (document.activeElement === node) node.blur()
      // Blocks the browser made while editing are rebuilt as the model's paragraphs once editing ends.
      if (editableText(node) !== value || spansChanged || editedRef.current) apply()
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
    // Likewise once the editable lets go of the caret.
    if (editableText(node) !== value || spansChanged || editedRef.current) apply()
  }, [readOnly, value, spans, runFallbackColor, baseFontSize, releases])

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
    if (readOnly || composingRef.current || !ref.current) return
    onChange(editableText(ref.current))
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
      {...attributes}
      style={style}
      onFocus={() => {
        focusedRef.current = true
        onFocus()
      }}
      onBlur={() => {
        focusedRef.current = false
        if (onSelectionChange) onSelectionChange(null)
        if (!readOnly) publish()
        if (editedRef.current) setReleases((count) => count + 1)
      }}
      onInput={() => {
        if (readOnly) return
        editedRef.current = true
        publish()
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
        editedRef.current = true
        publish()
      }}
    />
  )
}
