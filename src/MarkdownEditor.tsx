import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView, Decoration, WidgetType, ViewPlugin, keymap } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { EditorState, Prec } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxTree, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { indentWithTab, insertNewlineAndIndent } from '@codemirror/commands'
import { tags } from '@lezer/highlight'
import { downscaleDataUrl } from './imageStore'
import { store } from './storage'

/**
 * Obsidian-style "Live Preview" Markdown editor built on CodeMirror 6.
 *
 * The document IS the Markdown source (single source of truth) — the right-side
 * paginator, image-width drags and `---` page breaks all keep reading/writing
 * this exact text. We only add a decoration layer on top:
 *
 *   - lines WITHOUT the caret hide their syntax marks (`#`, `**`, `` ` ``) and
 *     render styled (big headings, bold, italics, bullets, quotes, images);
 *   - the line the caret is on "peels back" to raw Markdown so it stays editable.
 *
 * This is exactly the CodeMirror 6 approach Obsidian itself uses, so it fits our
 * "Markdown is the truth" architecture with zero lossy rich-text conversion.
 */

// ---- Image preview widget (renders `![alt|w](ref)` as an <img>) ------------
class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super()
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt
  }
  toDOM() {
    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.className = 'cm-md-img'
    return img
  }
  ignoreEvent() {
    return false
  }
}

// ---- Bullet widget (renders unordered `-`/`*`/`+` list marks as `•`) -------
class BulletWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-md-bullet'
    span.textContent = '• '
    return span
  }
}

/** True when any selection range sits on one of the lines [fromLine, toLine]. */
function selectionOnLines(state: EditorState, from: number, to: number): boolean {
  const a = state.doc.lineAt(from).number
  const b = state.doc.lineAt(to).number
  for (const r of state.selection.ranges) {
    const ra = state.doc.lineAt(r.from).number
    const rb = state.doc.lineAt(r.to).number
    if (ra <= b && rb >= a) return true
  }
  return false
}

function buildDecorations(state: EditorState): DecorationSet {
  const ranges: Array<ReturnType<typeof Decoration.mark>['range'] extends never ? never : any> = []
  const add = (deco: ReturnType<typeof Decoration.mark>, from: number, to: number) =>
    ranges.push(deco.range(from, to))
  const addLine = (deco: ReturnType<typeof Decoration.line>, at: number) =>
    ranges.push(deco.range(at))

  const hide = Decoration.replace({})

  {
    syntaxTree(state).iterate({
      enter: (node) => {
        const name = node.name

        // Headings: style the whole line + hide the leading `#`s.
        const headingMatch = /^ATXHeading(\d)$/.exec(name)
        if (headingMatch) {
          const level = Number(headingMatch[1])
          const line = state.doc.lineAt(node.from)
          addLine(Decoration.line({ class: `cm-md-h cm-md-h${level}` }), line.from)
          return
        }

        if (name === 'HeaderMark') {
          // A HeaderMark is either the leading `#`s of an ATX heading OR the
          // `---`/`===` underline of a Setext heading. NEVER hide the Setext
          // underline: it sits on its own line, and replacing that whole line
          // with a zero-width decoration while the caret composes on the line
          // just above corrupts CM's DOM reconciliation (it computes a spurious
          // delete and eats the just-typed CJK character). Only hide `#` marks.
          const markText = state.doc.sliceString(node.from, node.to)
          if (!markText.startsWith('#')) return
          if (!selectionOnLines(state, node.from, node.to)) {
            // Also swallow the single space after the `#`s.
            let end = node.to
            if (state.doc.sliceString(end, end + 1) === ' ') end += 1
            add(hide, node.from, end)
          }
          return
        }

        if (name === 'StrongEmphasis') {
          add(Decoration.mark({ class: 'cm-md-strong' }), node.from, node.to)
          return
        }
        if (name === 'Emphasis') {
          add(Decoration.mark({ class: 'cm-md-em' }), node.from, node.to)
          return
        }
        if (name === 'Strikethrough') {
          add(Decoration.mark({ class: 'cm-md-strike' }), node.from, node.to)
          return
        }
        if (name === 'InlineCode') {
          add(Decoration.mark({ class: 'cm-md-code' }), node.from, node.to)
          return
        }

        // Fenced code block: wrap every line in a styled box and, when the caret
        // is not inside it, blank out the ``` fence lines (Obsidian-style). We
        // handle the whole subtree here and stop descending so the fence marks
        // aren't double-processed by the inline CodeMark rule below.
        if (name === 'FencedCode') {
          const first = state.doc.lineAt(node.from)
          const last = state.doc.lineAt(node.to)
          for (let n = first.number; n <= last.number; n++) {
            addLine(Decoration.line({ class: 'cm-md-codeblock' }), state.doc.line(n).from)
          }
          if (!selectionOnLines(state, node.from, node.to)) {
            add(hide, first.from, first.to)
            if (last.number !== first.number) add(hide, last.from, last.to)
          }
          return false
        }

        // Emphasis / inline-code / strike marks: hide when the caret is elsewhere.
        if (name === 'EmphasisMark' || name === 'CodeMark' || name === 'StrikethroughMark') {
          if (!selectionOnLines(state, node.from, node.to)) add(hide, node.from, node.to)
          return
        }

        if (name === 'Blockquote') {
          const startLine = state.doc.lineAt(node.from).number
          const endLine = state.doc.lineAt(node.to).number
          for (let n = startLine; n <= endLine; n++) {
            addLine(Decoration.line({ class: 'cm-md-quote' }), state.doc.line(n).from)
          }
          return
        }
        if (name === 'QuoteMark') {
          if (!selectionOnLines(state, node.from, node.to)) {
            let end = node.to
            if (state.doc.sliceString(end, end + 1) === ' ') end += 1
            add(hide, node.from, end)
          }
          return
        }

        // Unordered list marks -> bullet; ordered marks kept as-is.
        if (name === 'ListMark') {
          const mark = state.doc.sliceString(node.from, node.to)
          const isOrdered = /\d/.test(mark)
          if (!isOrdered && !selectionOnLines(state, node.from, node.to)) {
            let end = node.to
            if (state.doc.sliceString(end, end + 1) === ' ') end += 1
            add(Decoration.replace({ widget: new BulletWidget() }), node.from, end)
          }
          return
        }

        if (name === 'Link') {
          add(Decoration.mark({ class: 'cm-md-link' }), node.from, node.to)
          return
        }

        // Images: render as a real <img> when the caret is not editing the line.
        if (name === 'Image') {
          if (selectionOnLines(state, node.from, node.to)) return
          const text = state.doc.sliceString(node.from, node.to)
          const m = /^!\[([^\]]*)\]\(([^)]*)\)/.exec(text)
          if (!m) return
          const rawAlt = m[1]
          const url = m[2]
          const alt = rawAlt.replace(/\|\d+$/, '')
          const src = store.images.resolve(url)
          add(
            Decoration.replace({ widget: new ImageWidget(src, alt) }),
            node.from,
            node.from + m[0].length,
          )
          return
        }
      },
    })
  }

  return Decoration.set(ranges, true)
}

// Live-preview decorations, rebuilt synchronously whenever the document, the
// selection, or the viewport changes.
const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.state)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

// Syntax highlight for tokens the decoration layer doesn't restyle (code blocks…).
const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--accent-text)' },
  { tag: tags.url, color: 'var(--text-3)' },
  { tag: tags.monospace, fontFamily: 'var(--mono)' },
  { tag: tags.quote, color: 'var(--text-2)' },
])

const baseTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--text)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--editor-font)',
    fontSize: '15px',
    lineHeight: '1.9',
    padding: '22px 26px 44px',
    overflow: 'auto',
  },
  '.cm-content': { caretColor: 'var(--accent)', maxWidth: '100%' },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--accent-weak)',
  },
  '.cm-md-h': { fontWeight: '700', lineHeight: '1.5' },
  '.cm-md-h1': { fontSize: '1.7em' },
  '.cm-md-h2': { fontSize: '1.42em' },
  '.cm-md-h3': { fontSize: '1.2em' },
  '.cm-md-h4, .cm-md-h5, .cm-md-h6': { fontSize: '1.05em' },
  '.cm-md-strong': { fontWeight: '700' },
  '.cm-md-em': { fontStyle: 'italic' },
  '.cm-md-strike': { textDecoration: 'line-through', opacity: '0.7' },
  '.cm-md-code': {
    fontFamily: 'var(--mono)',
    fontSize: '0.9em',
    background: 'rgba(127,127,127,0.15)',
    padding: '1px 5px',
    borderRadius: '4px',
  },
  '.cm-md-quote': {
    borderLeft: '3px solid var(--accent)',
    paddingLeft: '14px',
    color: 'var(--text-2)',
  },
  '.cm-md-codeblock': {
    fontFamily: 'var(--mono)',
    fontSize: '0.9em',
    background: 'rgba(127,127,127,0.12)',
    padding: '0 14px',
  },
  '.cm-md-link': { color: 'var(--accent-text)', textDecoration: 'underline' },
  '.cm-md-bullet': { color: 'var(--accent)', fontWeight: '700' },
  '.cm-md-img': {
    maxWidth: '100%',
    borderRadius: '8px',
    display: 'block',
    margin: '6px 0',
  },
})

// Paste a screenshot straight in as a markdown image (downscaled + stored).
const pasteHandler = EditorView.domEventHandlers({
  paste(event, cmView) {
    const items = event.clipboardData?.items
    if (!items) return false
    const item = Array.from(items).find((it) => it.type.startsWith('image/'))
    if (!item) return false
    event.preventDefault()
    const file = item.getAsFile()
    if (!file) return true
    const reader = new FileReader()
    reader.onload = async () => {
      const url = await downscaleDataUrl(reader.result as string)
      const imgRef = await store.images.put(url)
      const { from, to } = cmView.state.selection.main
      const pre = from > 0 && cmView.state.doc.sliceString(from - 1, from) !== '\n' ? '\n' : ''
      const snippet = `${pre}![](${imgRef})\n`
      cmView.dispatch({
        changes: { from, to, insert: snippet },
        selection: { anchor: from + snippet.length },
      })
    }
    reader.readAsDataURL(file)
    return true
  },
})

interface Props {
  value: string
  onChange: (next: string) => void
  fontFamily: string
}

/**
 * Markdown editor. Uses @uiw/react-codemirror as the React wrapper — it handles
 * the controlled value <-> CodeMirror sync correctly, including IME composition
 * (the hand-rolled wrapper deleted the just-typed CJK character on compositionend).
 * All of OUR logic — the Obsidian-style live-preview decorations, the paste-image
 * handler, syntax highlight — is layered on as CodeMirror extensions and preserved.
 */
export function MarkdownEditor({ value, onChange, fontFamily }: Props) {
  const extensions = useMemo(
    () => [
      // Override markdown's Enter (insertNewlineContinueMarkup): on a lazy
      // list-continuation line directly above `---` it wrongly clears the line
      // instead of inserting a newline. Plain newline is what we want here.
      Prec.highest(keymap.of([{ key: 'Enter', run: insertNewlineAndIndent }])),
      keymap.of([indentWithTab]),
      markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      syntaxHighlighting(highlight),
      livePreview,
      baseTheme,
      EditorView.contentAttributes.of({ style: `--editor-font:${fontFamily}` }),
      pasteHandler,
    ],
    [fontFamily],
  )

  return (
    <CodeMirror
      className="cm-host"
      theme="none"
      value={value}
      height="100%"
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        bracketMatching: false,
        closeBrackets: false,
        autocompletion: false,
        highlightSelectionMatches: false,
        indentOnInput: false,
        drawSelection: true,
        history: true,
      }}
      onCreateEditor={(view) => {
        // Expose the EditorView for automated tests (dev only).
        if (import.meta.env.DEV) (window as unknown as { __cmView?: EditorView }).__cmView = view
      }}
    />
  )
}
