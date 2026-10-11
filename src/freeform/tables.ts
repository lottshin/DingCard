// Table geometry: an even rows × cols grid of short text cells with an
// optional bold header row and optional zebra stripes. Everything the
// renderer draws — fills, grid lines and wrapped cell texts — comes from
// here, so the canvas, thumbnails and exports stay pixel-identical.

import type { FreeformTableGrid } from './types'

export const TABLE_ROWS_MAX = 12
export const TABLE_COLS_MAX = 6
export const TABLE_CELL_MAX_CHARS = 24

/** Cell texts are short: one line of a comparison, a price, a time slot. */
export function isValidTableCellText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= TABLE_CELL_MAX_CHARS
}

export function isValidTableRows(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 2 && value <= TABLE_ROWS_MAX
}

export function isValidTableCols(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= TABLE_COLS_MAX
}

/** Exactly rows × cols texts, each within the length cap. */
export function isValidTableCells(cells: readonly string[], rows: number, cols: number): boolean {
  return cells.length === rows * cols && cells.every(isValidTableCellText)
}

/** The header rule (v34): absent keeps the bold first row, `false` removes it. */
export function tableHeaderVisible(headerRow: boolean | undefined): boolean {
  return headerRow !== false
}

/** The stripe rule (v34): absent keeps the body plain, `true` shades alternate rows. */
export function tableStriped(striped: boolean | undefined): boolean {
  return striped === true
}

/** Which grid lines a table draws (v44); absent draws them all. */
export const TABLE_GRIDS: readonly FreeformTableGrid[] = ['all', 'rows', 'three-line', 'none']

export function isTableGrid(value: unknown): value is FreeformTableGrid {
  return typeof value === 'string' && (TABLE_GRIDS as readonly string[]).includes(value)
}

/** Grid line widths (v44): a hairline up to a bold rule; absent keeps 1px. */
export const TABLE_LINE_WIDTH_MIN = 0.5
export const TABLE_LINE_WIDTH_MAX = 24

export function isValidTableLineWidth(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= TABLE_LINE_WIDTH_MIN && value <= TABLE_LINE_WIDTH_MAX
}

/** A cell text size set outright (v44): small print up to poster type. */
export const TABLE_SET_FONT_SIZE_MIN = 8
export const TABLE_SET_FONT_SIZE_MAX = 96

export function isValidTableFontSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= TABLE_SET_FONT_SIZE_MIN && value <= TABLE_SET_FONT_SIZE_MAX
}

/** Column weights (v35): one positive weight per column, relative to their sum. */
export function isValidTableColWidths(value: unknown, cols: number): value is number[] {
  return Array.isArray(value)
    && value.length === cols
    && value.every((weight) => typeof weight === 'number' && Number.isFinite(weight) && weight > 0)
}

/** Where each column starts, in the table's own pixels: `cols + 1` edges from 0 to width. */
export function tableColumnEdges(
  width: number,
  cols: number,
  colWidths: readonly number[] | undefined,
): number[] {
  const weights = colWidths && colWidths.length === cols ? colWidths : Array.from({ length: cols }, () => 1)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const edges = [0]
  let used = 0
  for (let col = 0; col < cols; col += 1) {
    used += weights[col]
    edges.push(total > 0 ? (width * used) / total : 0)
  }
  return edges
}

export interface TableGeometry {
  /** The bold first row's fill area, or null with the header off. */
  header: { x: number; y: number; width: number; height: number } | null
  /** The shaded body rows (every second one after the header). */
  stripes: Array<{ x: number; y: number; width: number; height: number }>
  /**
   * Every grid line drawn, at its own width: rules along the outside sit
   * inside the box so their whole width shows (as a browser draws a
   * collapsed table border); inner ones centre on the border between cells.
   */
  lines: Array<{ x1: number; y1: number; x2: number; y2: number; width: number }>
  /** One entry per cell, row-major: wrapped lines and the header's boldness. */
  cells: Array<{ x: number; y: number; lines: string[]; bold: boolean }>
  /** The cell text size every cell is drawn at. */
  fontSize: number
  /** Cells whose words didn't fit and end in an ellipsis, row-major indexes. */
  clipped: number[]
}

/** The largest cell text a table draws: body copy on a 1080px card. */
export const TABLE_FONT_SIZE_MAX = 32

/**
 * The cell text size for a table: as large as its rows allow (42% of a row,
 * up to TABLE_FONT_SIZE_MAX), shrinking only as far as every cell's words
 * fit their cell. When nothing larger fits, the 14px-capped size tables
 * always had, which may cut words short.
 */
export function tableFontSize(
  width: number,
  height: number,
  rows: number,
  cols: number,
  cells: readonly string[],
  colWidths?: readonly number[],
): number {
  const rowHeight = height / rows
  const largest = Math.max(7, Math.min(rowHeight * 0.42, TABLE_FONT_SIZE_MAX))
  const floor = Math.max(7, Math.min(rowHeight * 0.42, 14))
  const edges = tableColumnEdges(width, cols, colWidths)
  const fits = (fontSize: number) => {
    const padding = fontSize * 0.32
    const maxLines = Math.max(1, Math.floor((rowHeight - padding) / (fontSize * 1.22)))
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const text = cells[row * cols + col] ?? ''
        if (text && wrapCellLines(text, fontSize, edges[col + 1] - edges[col] - padding * 2).length > maxLines) return false
      }
    }
    return true
  }
  for (let fontSize = Math.floor(largest); fontSize > floor; fontSize -= 1) {
    if (fits(fontSize)) return fontSize
  }
  return floor
}

const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/

export function wrapCellLines(text: string, fontSize: number, maxWidth: number): string[] {
  if (text === '') return []
  const perLine = Math.max(1, Math.floor(maxWidth / (fontSize * 1.02)))
  const lines: string[] = []
  let line = ''
  let units = 0
  for (const char of text) {
    const unit = CJK.test(char) ? 1 : 0.55
    if (line !== '' && units + unit > perLine) {
      lines.push(line)
      line = ''
      units = 0
    }
    line += char
    units += unit
  }
  if (line !== '') lines.push(line)
  return lines
}

export function tableGeometry(
  width: number,
  height: number,
  rows: number,
  cols: number,
  cells: readonly string[],
  options: {
    headerRow?: boolean
    striped?: boolean
    colWidths?: number[]
    grid?: FreeformTableGrid
    lineWidth?: number
    fontSize?: number
  } = {},
): TableGeometry {
  const header = tableHeaderVisible(options.headerRow)
  const striped = tableStriped(options.striped)
  const edges = tableColumnEdges(width, cols, options.colWidths)
  const rowHeight = height / rows
  const fontSize = options.fontSize ?? tableFontSize(width, height, rows, cols, cells, options.colWidths)
  const lineHeight = fontSize * 1.22
  const padding = fontSize * 0.32

  const lines: TableGeometry['lines'] = []
  const grid = options.grid ?? 'all'
  const lineWidth = options.lineWidth ?? 1
  const across = (y: number, ruleWidth: number) => lines.push({ x1: 0, y1: y, x2: width, y2: y, width: ruleWidth })
  const down = (x: number, ruleWidth: number) => lines.push({ x1: x, y1: 0, x2: x, y2: height, width: ruleWidth })
  if (grid === 'all') {
    // The outer border plus the inner separators: verticals between
    // columns, horizontals between rows.
    across(lineWidth / 2, lineWidth)
    across(height - lineWidth / 2, lineWidth)
    down(lineWidth / 2, lineWidth)
    down(width - lineWidth / 2, lineWidth)
    for (let col = 1; col < cols; col += 1) down(edges[col], lineWidth)
    for (let row = 1; row < rows; row += 1) across(row * rowHeight, lineWidth)
  } else if (grid === 'rows') {
    // A rule under every row, the last one along the bottom.
    for (let row = 1; row < rows; row += 1) across(row * rowHeight, lineWidth)
    across(height - lineWidth / 2, lineWidth)
  } else if (grid === 'three-line') {
    // The three-line table: heavy rules along the top and bottom, a light
    // one under the header.
    across(lineWidth, lineWidth * 2)
    if (header) across(rowHeight, lineWidth)
    across(height - lineWidth, lineWidth * 2)
  }

  const stripes: TableGeometry['stripes'] = []
  if (striped) {
    for (let row = header ? 1 : 0; row < rows; row += 1) {
      const bodyIndex = row - (header ? 1 : 0)
      if (bodyIndex % 2 === 1) {
        stripes.push({ x: 0, y: row * rowHeight, width, height: rowHeight })
      }
    }
  }

  const cellTexts: TableGeometry['cells'] = []
  const clipped: number[] = []
  const maxLines = Math.max(1, Math.floor((rowHeight - padding) / lineHeight))
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const colWidth = edges[col + 1] - edges[col]
      const wrapped = wrapCellLines(cells[row * cols + col] ?? '', fontSize, colWidth - padding * 2)
      if (wrapped.length > maxLines) clipped.push(row * cols + col)
      const linesShown = wrapped.length > maxLines
        ? [...wrapped.slice(0, maxLines - 1), `${wrapped[maxLines - 1].slice(0, -1)}…`]
        : wrapped
      const blockHeight = linesShown.length * lineHeight
      const centerY = row * rowHeight + rowHeight / 2
      cellTexts.push({
        x: edges[col] + colWidth / 2,
        // The first baseline: a CJK em box (0.88 of it above the baseline)
        // sits in the middle of its line, as a browser centres a cell's words.
        y: centerY - blockHeight / 2 + (lineHeight - fontSize) / 2 + fontSize * 0.88,
        lines: linesShown,
        bold: header && row === 0,
      })
    }
  }

  return {
    header: header ? { x: 0, y: 0, width, height: rowHeight } : null,
    stripes,
    lines,
    cells: cellTexts,
    fontSize,
    clipped,
  }
}

/**
 * Read pasted rows as table cells: every non-empty line splits on tabs
 * (a spreadsheet copy), then commas, then spaces; empty trailing columns are
 * trimmed. Returns null when nothing readable is there.
 */
export function parseTablePaste(text: string): { rows: string[][] } | null {
  const rows: string[][] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '') continue
    const cells = line.includes('\t')
      ? line.split('\t')
      : line.includes('，') || line.includes(',')
        ? line.split(/[,，]/)
        : line.split(/\s+/)
    const trimmed = cells.map((cell) => cell.trim()).filter((cell, index, all) =>
      cell !== '' || index < all.length - 1,
    )
    while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') trimmed.pop()
    if (trimmed.length === 0) continue
    rows.push(trimmed.slice(0, TABLE_COLS_MAX).map((cell) => cell.slice(0, TABLE_CELL_MAX_CHARS)))
    if (rows.length >= TABLE_ROWS_MAX) break
  }
  return rows.length > 0 ? { rows } : null
}
