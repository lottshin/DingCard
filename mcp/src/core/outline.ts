// Batch generation: turn a Markdown outline into a finished multi-page deck
// on a built-in freeform template. The outline only decides the content;
// compose.ts places it in the template's slots.

import { TEMPLATE_REGISTRY } from '../../../src/templates/registry'
import { composeDeck, type ComposeError, type ComposeSuccess, type DeckContent, type DeckPage } from './compose'

export interface ParsedOutline {
  title: string | null
  subtitle: string | null
  sections: DeckPage[]
  ending: DeckPage | null
}

const HEADING_1 = /^#\s+/
const HEADING_2 = /^##\s+/
const POINT = /^(?:[-*+•]\s+|\d+[.、)]\s*)/
const QUOTE = /^>\s?/
const ENDING = /^(?:结尾|结束语|收尾|ending|end)\s*[：:]\s*(.+)$/i
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/
const TABLE_ROW = /^\|/
const TABLE_SEPARATOR = /^\|[\s:|-]+\|?$/

interface Draft {
  title: string
  body: string[]
  points: string[]
  quote: string[]
  table?: { header: string[]; rows: string[][] }
}

/** One `| a | b |` line as its cells; the outer pipes fall away. */
function tableCells(line: string): string[] {
  return line.split('|').slice(1, -1).map((cell) => cell.trim())
}

/**
 * Read a run of `|` lines as one Markdown table: the first row is the header,
 * the second must be the `| --- |` separator, the rest are data rows. Rows of
 * a second table in the same section join the first one's.
 */
function readTable(lines: readonly string[]): { header: string[]; rows: string[][] } | null {
  const rows = lines.map(tableCells)
  if (rows.length < 2 || !TABLE_SEPARATOR.test(lines[1])) return null
  return { header: rows[0], rows: rows.slice(2) }
}

function toPage(draft: Draft): DeckPage {
  return {
    title: draft.title,
    ...(draft.body.length > 0 ? { body: draft.body.join('\n') } : {}),
    ...(draft.points.length > 0 ? { points: draft.points } : {}),
    ...(draft.quote.length > 0 ? { quote: draft.quote.join(' ') } : {}),
    ...(draft.table ? { table: draft.table } : {}),
  }
}

/**
 * Parse an outline. "# 总标题" names the deck and the lines under it (before
 * the first "##") are the cover's subtitle. Each "## 小节" is a page: list
 * lines ("- 要点", "1. 要点") are its points, "> 引文" its quote, a Markdown
 * table (first row the header, second the `| --- |` separator) its table,
 * other lines its body. A section headed "## 结尾：标题" becomes the closing page.
 */
export function parseOutline(source: string): ParsedOutline | null {
  const lines = typeof source === 'string' ? source.replace(/\r\n?/g, '\n').split('\n') : []
  let title: string | null = null
  const subtitle: string[] = []
  const sections: Draft[] = []
  let ending: Draft | null = null
  let current: Draft | null = null
  const absorb = (line: string) => {
    if (!current) return
    if (QUOTE.test(line)) current.quote.push(line.replace(QUOTE, '').trim())
    else if (POINT.test(line)) current.points.push(line.replace(POINT, '').trim())
    else current.body.push(line)
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (line.length === 0 || RULE.test(line)) continue
    if (HEADING_1.test(line) && !HEADING_2.test(line)) {
      if (title === null && current === null) title = line.replace(HEADING_1, '').trim()
      continue
    }
    if (HEADING_2.test(line)) {
      const heading = line.replace(HEADING_2, '').trim()
      const closing = ENDING.exec(heading)
      current = { title: closing ? closing[1].trim() : heading, body: [], points: [], quote: [] }
      if (closing) ending = current
      else sections.push(current)
      continue
    }
    if (current === null) {
      if (title !== null) subtitle.push(line.replace(POINT, '').trim())
      continue
    }
    if (TABLE_ROW.test(line)) {
      // Gather the whole table before the other line kinds see it.
      const tableLines: string[] = []
      while (index < lines.length) {
        const candidate = lines[index].trim()
        if (!TABLE_ROW.test(candidate)) break
        tableLines.push(candidate)
        index += 1
      }
      index -= 1
      const table = readTable(tableLines)
      if (table) {
        if (!current.table) current.table = table
        else current.table.rows.push(...table.rows)
        continue
      }
      // Pipe lines that are not a table read as ordinary body copy.
      tableLines.forEach((tableLine) => absorb(tableLine))
      continue
    }
    absorb(line)
  }
  if (sections.length === 0) return null
  if (sections.some((section) => section.title.length === 0)) return null
  if (ending && ending.title.length === 0) return null
  return {
    title,
    subtitle: subtitle.length > 0 ? subtitle.join('\n') : null,
    sections: sections.map(toPage),
    ending: ending ? toPage(ending) : null,
  }
}

export function outlineContent(parsed: ParsedOutline): DeckContent {
  return {
    title: parsed.title ?? parsed.sections[0].title,
    ...(parsed.subtitle ? { subtitle: parsed.subtitle } : {}),
    pages: parsed.sections,
    ...(parsed.ending ? { ending: parsed.ending } : {}),
  }
}

export function createDocumentFromOutline(
  outline: string,
  templateId: string,
): ComposeSuccess | ComposeError {
  const parsed = parseOutline(outline)
  if (!parsed) {
    return {
      ok: false,
      error: '大纲解析失败：需要至少一个 "## 小节标题" 段落（可先用 "# 总标题" 给整套卡片命名）。',
    }
  }
  const template = TEMPLATE_REGISTRY.find((candidate) => candidate.id === templateId)
  if (!template) return { ok: false, error: `未知的模板 id：${templateId}（先用 list_templates 查询）。` }
  if (template.workspace !== 'freeform') return { ok: false, error: '仅支持自由画布模板（id 以 -freeform 结尾）。' }
  return composeDeck(templateId, outlineContent(parsed))
}
