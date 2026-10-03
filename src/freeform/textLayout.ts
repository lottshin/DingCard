// How a text's words sit in its box: shared by the words on the canvas, their
// effect layer underneath, and the editor, so all three lay out alike.
//
// Since v20 the words are one block per paragraph (each "\n" ends one), which
// is what lets paragraphs keep space between them and become list items: the
// bullets and numbers are drawn by CSS (styles.css, [data-list]) before each
// paragraph, never part of the text you edit. An empty paragraph keeps a line
// with a <br>; an empty last one stays flat, as a trailing line break always
// did.

import type { CSSProperties } from 'react'
import type { FreeformTextElement, TextList } from './types'

/** The gap between a list marker and its words, in em. */
const MARKER_GAP_EM = 0.4

/** How far a list's words sit in from the edge: room for its widest marker. */
export function listIndentEm(list: TextList, items: number): number {
  if (list === 'bullet') return 1 + MARKER_GAP_EM
  const digits = String(Math.max(1, items)).length
  // A digit and the period are each about 0.6em in the fonts we offer.
  return Math.round(((digits + 1) * 0.6 + MARKER_GAP_EM) * 100) / 100
}

/** How many paragraphs carry words (empty ones get no marker and no number). */
export function listItemCount(text: string): number {
  return text.split('\n').filter((paragraph) => paragraph.length > 0).length
}

type LayoutSource = Pick<
  FreeformTextElement,
  'fontFamily' | 'fontSize' | 'align' | 'fontWeight' | 'lineHeight' | 'letterSpacing' | 'italic' | 'vertical'
  | 'verticalAlign' | 'paragraphSpacing' | 'list' | 'text'
>

/** The CSS that lays a text's words out in its box (camelCase, custom properties included). */
export function textLayoutStyle(leaf: LayoutSource): CSSProperties {
  const style: CSSProperties & Record<string, string | number> = {
    fontFamily: leaf.fontFamily,
    fontSize: leaf.fontSize,
    textAlign: leaf.align,
    fontWeight: leaf.fontWeight,
    ...(leaf.lineHeight !== undefined ? { lineHeight: leaf.lineHeight } : {}),
    ...(leaf.letterSpacing !== undefined ? { letterSpacing: `${leaf.letterSpacing}px` } : {}),
    ...(leaf.italic ? { fontStyle: 'italic' as const } : {}),
    ...(leaf.vertical ? { writingMode: 'vertical-rl' as const } : {}),
  }
  // Lines lower in a taller box: the paragraphs stack in a column pushed to its middle or end
  // ("safe": words that outgrow the box start at the top rather than being cut above it).
  if (leaf.verticalAlign) {
    style.display = 'flex'
    style.flexDirection = 'column'
    style.justifyContent = leaf.verticalAlign === 'middle' ? 'safe center' : 'safe flex-end'
  }
  if (leaf.paragraphSpacing) style['--freeform-paragraph-spacing'] = `${leaf.paragraphSpacing}px`
  if (leaf.list) style['--freeform-list-indent'] = `${listIndentEm(leaf.list, listItemCount(leaf.text))}em`
  return style
}

/** The attributes the paragraph and list rules in styles.css key on. */
export function textLayoutAttributes(leaf: Pick<FreeformTextElement, 'list' | 'paragraphSpacing'>): Record<string, string> {
  return {
    ...(leaf.list ? { 'data-list': leaf.list } : {}),
    ...(leaf.paragraphSpacing ? { 'data-paragraph-spacing': '' } : {}),
  }
}

/** Whether a paragraph holds a <br> to keep its empty line: every empty one but a last. */
export function keepsEmptyLine(paragraph: readonly unknown[], index: number, count: number): boolean {
  return paragraph.length === 0 && index < count - 1
}
