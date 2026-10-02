// Tables in poster templates (a timetable): a grid of rounded blocks with
// words on them, drawn by one function from a layout and the cells' words.
// The template draws its sample with it, and composing a poster redraws the
// grid with the client's rows and columns, so the table always fills its
// space whatever its size.

import type { FreeformSceneNode } from '../freeform/types'

export interface TableLayout {
  /** Layer names start with this: a cell's words are `${name}字 r-c`, its block `${name}格 r-c`. */
  name: string
  x: number
  y: number
  width: number
  height: number
  gap: number
  /** The first column (row labels), as a share of the width. */
  labelShare: number
  /** The first row (column headings), as a share of the height. */
  headerShare: number
  radius: number
  font: string
  /** Column headings along the first row. */
  header: { fill: string; color: string; fontSize: number }
  /** Row labels down the first column. */
  labels: { fill: string; color: string; fontSize: number }
  /** The cells; a word gets the same block colour wherever it appears (a subject keeps its colour all week). */
  body: { color: string; fontSize: number; empty: string; palette: readonly string[] }
  /** Most rows and columns a client's table may have. */
  maxRows: number
  maxColumns: number
}

export interface TableCellNames {
  texts: string[]
  blocks: string[]
}

export const tableTextName = (layout: TableLayout, row: number, column: number) => `${layout.name}字 ${row + 1}-${column + 1}`
export const tableBlockName = (layout: TableLayout, row: number, column: number) => `${layout.name}格 ${row + 1}-${column + 1}`

/** The grid's shape for these cells: as many rows as given, as many columns as the longest row, within the layout's limits. */
export function tableShape(layout: TableLayout, cells: readonly (readonly string[])[]): { rows: number; columns: number } {
  return {
    rows: Math.max(1, Math.min(layout.maxRows, cells.length)),
    columns: Math.max(1, Math.min(layout.maxColumns, Math.max(0, ...cells.map((row) => row.length)))),
  }
}

/** The layer names the grid for these cells has. */
export function tableCellNames(layout: TableLayout, cells: readonly (readonly string[])[]): TableCellNames {
  const { rows, columns } = tableShape(layout, cells)
  const names: TableCellNames = { texts: [], blocks: [] }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      names.blocks.push(tableBlockName(layout, row, column))
      if ((cells[row]?.[column] ?? '').trim()) names.texts.push(tableTextName(layout, row, column))
    }
  }
  return names
}

/** The grid as nodes: each cell's block, then its words, row by row. */
export function tableNodes(
  layout: TableLayout,
  cells: readonly (readonly string[])[],
  newId: () => string = () => crypto.randomUUID(),
): FreeformSceneNode[] {
  const { rows, columns } = tableShape(layout, cells)
  const labelWidth = columns > 1 ? layout.width * layout.labelShare : layout.width
  const cellWidth = columns > 1 ? (layout.width - labelWidth - layout.gap * (columns - 1)) / (columns - 1) : 0
  const headerHeight = rows > 1 ? layout.height * layout.headerShare : layout.height
  const cellHeight = rows > 1 ? (layout.height - headerHeight - layout.gap * (rows - 1)) / (rows - 1) : 0
  const colours = new Map<string, string>()
  const blockColour = (word: string) => {
    if (!word) return layout.body.empty
    if (!colours.has(word)) colours.set(word, layout.body.palette[colours.size % layout.body.palette.length])
    return colours.get(word)!
  }
  const round = (value: number) => Math.round(value * 10) / 10
  const nodes: FreeformSceneNode[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const word = (cells[row]?.[column] ?? '').trim()
      const x = layout.x + (column === 0 ? 0 : labelWidth + layout.gap + (column - 1) * (cellWidth + layout.gap))
      const y = layout.y + (row === 0 ? 0 : headerHeight + layout.gap + (row - 1) * (cellHeight + layout.gap))
      const width = column === 0 ? labelWidth : cellWidth
      const height = row === 0 ? headerHeight : cellHeight
      const style = row === 0 ? layout.header : column === 0 ? layout.labels : { fill: blockColour(word), ...layout.body }
      nodes.push({
        id: newId(),
        name: tableBlockName(layout, row, column),
        locked: false,
        hidden: false,
        type: 'shape',
        x: round(x),
        y: round(y),
        width: round(width),
        height: round(height),
        rotation: 0,
        scale: 1,
        shape: 'rect',
        fill: { type: 'solid', color: style.fill },
        stroke: 'transparent',
        strokeWidth: 0,
        cornerRadius: layout.radius,
      })
      if (!word) continue
      const lines = word.split('\n').length
      const lineHeight = 1.3
      const textHeight = Math.min(height, style.fontSize * lineHeight * lines + 16)
      nodes.push({
        id: newId(),
        name: tableTextName(layout, row, column),
        locked: false,
        hidden: false,
        type: 'text',
        x: round(x),
        y: round(y + (height - textHeight) / 2),
        width: round(width),
        height: round(textHeight),
        rotation: 0,
        scale: 1,
        text: word,
        fontSize: style.fontSize,
        fontFamily: layout.font,
        textFill: { type: 'solid', color: style.color },
        align: 'center',
        fontWeight: row === 0 || column > 0 ? 'bold' : 'normal',
        lineHeight,
      })
    }
  }
  return nodes
}

// --- The timetable poster's table (registry.ts draws it, slots.ts names it) ---

export const TIMETABLE_TABLE: TableLayout = {
  name: '课表',
  x: 90,
  y: 300,
  width: 1574,
  height: 850,
  gap: 12,
  labelShare: 0.13,
  headerShare: 0.1,
  radius: 18,
  font: 'PingFang SC, Microsoft YaHei, system-ui, sans-serif',
  header: { fill: '#2f2a24', color: '#ffffff', fontSize: 34 },
  labels: { fill: '#efe6d6', color: '#5a4f43', fontSize: 26 },
  body: {
    color: '#2f2a24',
    fontSize: 38,
    empty: '#f6f1e8',
    palette: ['#ffd9d2', '#d4e6ff', '#fff0bf', '#d4f2e1', '#e7dcff', '#ffe0ee', '#ffe4c8', '#d6f0f2', '#ecf3c6', '#f0ddd0', '#dce3f7', '#f7d9f2'],
  },
  maxRows: 12,
  maxColumns: 8,
}

export const TIMETABLE_SAMPLE: readonly (readonly string[])[] = [
  ['节次', '周一', '周二', '周三', '周四', '周五'],
  ['第 1 节\n8:00', '语文', '数学', '英语', '语文', '数学'],
  ['第 2 节\n8:55', '数学', '语文', '数学', '英语', '语文'],
  ['第 3 节\n10:00', '英语', '科学', '语文', '数学', '美术'],
  ['第 4 节\n10:55', '体育', '音乐', '体育', '科学', '英语'],
  ['第 5 节\n14:00', '美术', '数学', '道法', '体育', '班会'],
  ['第 6 节\n14:55', '科学', '体育', '音乐', '书法', '阅读'],
  ['第 7 节\n15:50', '阅读', '英语', '社团', '阅读', '社团'],
]
