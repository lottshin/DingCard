// Table geometry: an even rows × cols grid of short text cells with an
// optional bold header row and optional zebra stripes. Everything the
// renderer draws — fills, grid lines and wrapped cell texts — comes from
// here, so the canvas, thumbnails and exports stay pixel-identical.

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
  /** Every grid line drawn, outer border and inner separators alike. */
  lines: Array<{ x1: number; y1: number; x2: number; y2: number }>
  /** One entry per cell, row-major: wrapped lines and the header's boldness. */
  cells: Array<{ x: number; y: number; lines: string[]; bold: boolean }>
}

const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/

function wrapCellLines(text: string, fontSize: number, maxWidth: number): string[] {
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
  options: { headerRow?: boolean; striped?: boolean; colWidths?: number[] } = {},
): TableGeometry {
  const header = tableHeaderVisible(options.headerRow)
  const striped = tableStriped(options.striped)
  const edges = tableColumnEdges(width, cols, options.colWidths)
  const rowHeight = height / rows
  const fontSize = Math.max(7, Math.min(rowHeight * 0.42, 14))
  const lineHeight = fontSize * 1.22
  const padding = fontSize * 0.32

  const lines: TableGeometry['lines'] = []
  // The outer border plus the inner separators: verticals between columns,
  // horizontals between rows.
  lines.push({ x1: 0, y1: 0, x2: width, y2: 0 })
  lines.push({ x1: 0, y1: height, x2: width, y2: height })
  lines.push({ x1: 0, y1: 0, x2: 0, y2: height })
  lines.push({ x1: width, y1: 0, x2: width, y2: height })
  for (let col = 1; col < cols; col += 1) {
    lines.push({ x1: edges[col], y1: 0, x2: edges[col], y2: height })
  }
  for (let row = 1; row < rows; row += 1) {
    lines.push({ x1: 0, y1: row * rowHeight, x2: width, y2: row * rowHeight })
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
  const maxLines = Math.max(1, Math.floor((rowHeight - padding) / lineHeight))
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const colWidth = edges[col + 1] - edges[col]
      const wrapped = wrapCellLines(cells[row * cols + col] ?? '', fontSize, colWidth - padding * 2)
      const linesShown = wrapped.length > maxLines
        ? [...wrapped.slice(0, maxLines - 1), `${wrapped[maxLines - 1].slice(0, -1)}…`]
        : wrapped
      const blockHeight = linesShown.length * lineHeight
      const centerY = row * rowHeight + rowHeight / 2
      cellTexts.push({
        x: edges[col] + colWidth / 2,
        y: centerY - blockHeight / 2 + fontSize * 0.88,
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
