import { describe, expect, it } from 'vitest'

import {
  TABLE_CELL_MAX_CHARS,
  TABLE_COLS_MAX,
  TABLE_ROWS_MAX,
  isValidTableCells,
  isValidTableCols,
  isValidTableRows,
  parseTablePaste,
  tableGeometry,
  tableHeaderVisible,
  tableStriped,
} from '../tables'
import { createTableElement, freeformReducer } from '../document'
import { normalizeFreeformDocument } from '../sceneDocument'
import type { FreeformDocument, FreeformSceneNode, FreeformTableElement, FreeformSlide } from '../types'

describe('table data validation', () => {
  it('accepts 2–12 rows, 1–6 cols, and short cells', () => {
    expect(isValidTableRows(2)).toBe(true)
    expect(isValidTableRows(TABLE_ROWS_MAX)).toBe(true)
    expect(isValidTableRows(1)).toBe(false)
    expect(isValidTableRows(TABLE_ROWS_MAX + 1)).toBe(false)
    expect(isValidTableRows(3.5)).toBe(false)
    expect(isValidTableCols(1)).toBe(true)
    expect(isValidTableCols(TABLE_COLS_MAX)).toBe(true)
    expect(isValidTableCols(0)).toBe(false)
    expect(isValidTableCols(TABLE_COLS_MAX + 1)).toBe(false)
    expect(isValidTableCells(['a', 'b', 'c', 'd'], 2, 2)).toBe(true)
    expect(isValidTableCells(['a', 'b', 'c'], 2, 2)).toBe(false)
    expect(isValidTableCells(['a', 'b', 'c', 'd'], 2, 2)).toBe(true)
    expect(isValidTableCells([`${'长'.repeat(TABLE_CELL_MAX_CHARS)}`, 'b', 'c', 'd'], 2, 2)).toBe(true)
    expect(isValidTableCells([`${'长'.repeat(TABLE_CELL_MAX_CHARS + 1)}`, 'b', 'c', 'd'], 2, 2)).toBe(false)
    expect(isValidTableCells([1, 'b', 'c', 'd'] as unknown as string[], 2, 2)).toBe(false)
  })

  it('keeps the header on unless turned off and stripes only when asked', () => {
    expect(tableHeaderVisible(undefined)).toBe(true)
    expect(tableHeaderVisible(true)).toBe(true)
    expect(tableHeaderVisible(false)).toBe(false)
    expect(tableStriped(undefined)).toBe(false)
    expect(tableStriped(true)).toBe(true)
    expect(tableStriped(false)).toBe(false)
  })
})

describe('table geometry', () => {
  const cells = ['项目', '本月', '上月', '阅读', '1.2万', '9800', '涨粉', '320', '210']

  it('draws an even grid with a bold header by default', () => {
    const table = tableGeometry(480, 320, 3, 3, cells)
    // Outer border plus 2 inner verticals and 2 inner horizontals.
    expect(table.lines).toHaveLength(8)
    expect(table.header).toEqual({ x: 0, y: 0, width: 480, height: 320 / 3 })
    expect(table.stripes).toEqual([])
    expect(table.cells).toHaveLength(9)
    expect(table.cells[0]).toMatchObject({ bold: true })
    expect(table.cells[3]).toMatchObject({ bold: false })
    // Every cell centres inside its column.
    expect(table.cells[1].x).toBe(240)
    expect(table.cells[2].x).toBe(400)
  })

  it('drops the header on demand and shades every second body row when striped', () => {
    const plain = tableGeometry(480, 320, 4, 2, Array.from({ length: 8 }, (_, i) => `行${i}`), {
      headerRow: false,
      striped: true,
    })
    expect(plain.header).toBeNull()
    // 4 body rows: rows 1 and 3 (0-based) get the shade.
    expect(plain.stripes).toEqual([
      { x: 0, y: 80, width: 480, height: 80 },
      { x: 0, y: 240, width: 480, height: 80 },
    ])
    expect(plain.cells.every((cell) => !cell.bold)).toBe(true)

    const withHeader = tableGeometry(480, 320, 4, 2, Array.from({ length: 8 }, (_, i) => `行${i}`), {
      striped: true,
    })
    // The header stays plain; the second body row (after the header) shades.
    expect(withHeader.stripes.map((stripe) => stripe.y)).toEqual([160])
    expect(withHeader.cells[0].bold).toBe(true)
    expect(withHeader.cells[2].bold).toBe(false)
  })

  it('wraps long cell text and ellipsises what cannot fit', () => {
    const table = tableGeometry(240, 120, 3, 1, ['字'.repeat(35), '短', '值'])
    expect(table.cells[0].lines.length).toBe(2)
    const last = table.cells[0].lines[table.cells[0].lines.length - 1]
    expect(last.endsWith('…')).toBe(true)
    expect(table.cells[1].lines).toEqual(['短'])
    expect(table.cells[2].lines).toEqual(['值'])
  })
})

describe('table paste', () => {
  it('reads tab-separated rows, then comma- and space-separated ones', () => {
    expect(parseTablePaste('项目\t本月\t上月\n阅读\t1.2万\t9800')).toEqual({
      rows: [['项目', '本月', '上月'], ['阅读', '1.2万', '9800']],
    })
    expect(parseTablePaste('周一,上午\n周二,下午')).toEqual({
      rows: [['周一', '上午'], ['周二', '下午']],
    })
    expect(parseTablePaste('周一 上午\n周二 下午')).toEqual({
      rows: [['周一', '上午'], ['周二', '下午']],
    })
    expect(parseTablePaste('  \n\n')).toBeNull()
  })

  it('caps columns, rows, and cell length', () => {
    const wide = parseTableParse(Array.from({ length: 9 }, (_, i) => `列${i}`).join('\t'))
    expect(wide!.rows[0]).toHaveLength(6)
    const tall = parseTablePaste(Array.from({ length: 20 }, (_, i) => `行${i}`).join('\n'))
    expect(tall!.rows).toHaveLength(12)
    const long = parseTablePaste('x'.repeat(40))
    expect(long!.rows[0][0]).toHaveLength(24)
  })
})

function parseTableParse(text: string) {
  return parseTablePaste(text)
}

describe('table element in the document', () => {
  const slide: FreeformSlide = {
    id: 'slide-1',
    name: '第一页',
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    nodes: [],
  }

  it('creates a centred 3×3 table with a readable sample', () => {
    const element = createTableElement(slide)
    expect(element.type).toBe('table')
    expect(element.rows).toBe(3)
    expect(element.cols).toBe(3)
    expect(element.cells).toHaveLength(9)
    expect(element.headerRow).toBeUndefined()
    expect(element.striped).toBeUndefined()
  })

  it('carries tables at v34 and rejects them at v33', () => {
    const table: FreeformTableElement = createTableElement(slide)
    const tableSlide = { ...slide, nodes: [table as unknown as FreeformSceneNode] }
    const v34 = normalizeFreeformDocument({ documentVersion: 34, activeSlideId: slide.id, slides: [tableSlide] })
    expect(v34).not.toBeNull()
    expect((v34!.slides[0].nodes[0] as FreeformTableElement).cells).toHaveLength(9)
    const v33 = normalizeFreeformDocument({ documentVersion: 33, activeSlideId: slide.id, slides: [tableSlide] })
    expect(v33).toBeNull()
    // Optional flags ride along; wrong-typed ones reject.
    const striped: FreeformTableElement = { ...table, striped: true, headerRow: false }
    const withFlags = normalizeFreeformDocument({
      documentVersion: 35,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [striped as unknown as FreeformSceneNode] }],
    })
    expect((withFlags!.slides[0].nodes[0] as FreeformTableElement).striped).toBe(true)
    expect((withFlags!.slides[0].nodes[0] as FreeformTableElement).headerRow).toBe(false)
    const bad = normalizeFreeformDocument({
      documentVersion: 35,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [{ ...table, cells: ['少'] } as unknown as FreeformSceneNode] }],
    })
    expect(bad).toBeNull()
  })

  it('resizes and replaces cells through node/update-content', () => {
    const base = createTableElement(slide)
    const document: FreeformDocument = {
      documentVersion: 35,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [base as unknown as FreeformSceneNode] }],
    }
    // A bare column add pads each row's new place with an empty cell.
    const widened = freeformReducer(document, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { cols: 4 } }],
    })
    const widenedTable = widened.slides[0].nodes[0] as FreeformTableElement
    expect(widenedTable.cols).toBe(4)
    expect(widenedTable.cells).toHaveLength(12)
    expect(widenedTable.cells).toEqual([
      '项目', '本月', '上月', '',
      '阅读', '1.2万', '9800', '',
      '涨粉', '320', '210', '',
    ])
    // A row drop keeps the cells that still have a place.
    const shortened = freeformReducer(document, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { rows: 2 } }],
    })
    const shortenedTable = shortened.slides[0].nodes[0] as FreeformTableElement
    expect(shortenedTable.cells).toEqual(base.cells.slice(0, 6))
    // Cells replace wholesale and must match the grid.
    const replaced = freeformReducer(document, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { cells: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] } }],
    })
    expect((replaced.slides[0].nodes[0] as FreeformTableElement).cells[0]).toBe('a')
    const mismatched = freeformReducer(document, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { cells: ['a', 'b'] } }],
    })
    expect(mismatched).toBe(document)
  })

  it('styles the header and stripes through node/update-style', () => {
    const base = createTableElement(slide)
    const document: FreeformDocument = {
      documentVersion: 35,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [base as unknown as FreeformSceneNode] }],
    }
    const styled = freeformReducer(document, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { headerRow: false, striped: true } }],
    })
    const styledTable = styled.slides[0].nodes[0] as FreeformTableElement
    expect(styledTable.headerRow).toBe(false)
    expect(styledTable.striped).toBe(true)
    const restored = freeformReducer(styled, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { headerRow: null, striped: null } }],
    })
    const restoredTable = restored.slides[0].nodes[0] as FreeformTableElement
    expect('headerRow' in restoredTable).toBe(false)
    expect('striped' in restoredTable).toBe(false)
    const bad = freeformReducer(restored, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { headerRow: 'no' as unknown as boolean } }],
    })
    expect(bad).toBe(restored)
  })

  it('styles the ink, header fill, and stripe fill through node/update-style', () => {
    const base = createTableElement(slide)
    const document: FreeformDocument = {
      documentVersion: 35,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [base as unknown as FreeformSceneNode] }],
    }
    const styled = freeformReducer(document, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { ink: '#0f766e', headerFill: '#ccfbf1', stripeFill: '#f0fdfa' } }],
    })
    const styledTable = styled.slides[0].nodes[0] as FreeformTableElement
    expect(styledTable.ink).toBe('#0f766e')
    expect(styledTable.headerFill).toBe('#ccfbf1')
    expect(styledTable.stripeFill).toBe('#f0fdfa')
    // null restores the default gray ink tints by removing the fields.
    const restored = freeformReducer(styled, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { ink: null, headerFill: null, stripeFill: null } }],
    })
    const restoredTable = restored.slides[0].nodes[0] as FreeformTableElement
    expect('ink' in restoredTable).toBe(false)
    expect('headerFill' in restoredTable).toBe(false)
    expect('stripeFill' in restoredTable).toBe(false)
    // A non-hex color rejects the patch and keeps the table as-is.
    const bad = freeformReducer(restored, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { ink: 'teal' as unknown as string } }],
    })
    expect(bad).toBe(restored)
  })

  it('carries the color overrides at v35 and rejects them at v34', () => {
    const table: FreeformTableElement = { ...createTableElement(slide), striped: true, ink: '#334155', headerFill: '#e2e8f0', stripeFill: '#f1f5f9' }
    const tableSlide = { ...slide, nodes: [table as unknown as FreeformSceneNode] }
    const v35 = normalizeFreeformDocument({ documentVersion: 35, activeSlideId: slide.id, slides: [tableSlide] })
    expect(v35).not.toBeNull()
    const kept = v35!.slides[0].nodes[0] as FreeformTableElement
    expect(kept.ink).toBe('#334155')
    expect(kept.headerFill).toBe('#e2e8f0')
    expect(kept.stripeFill).toBe('#f1f5f9')
    // v34 documents never carried the overrides; a bad hex rejects outright.
    const v34 = normalizeFreeformDocument({ documentVersion: 34, activeSlideId: slide.id, slides: [tableSlide] })
    expect(v34).toBeNull()
    const badHex = normalizeFreeformDocument({
      documentVersion: 35,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [{ ...table, ink: 'gray' } as unknown as FreeformSceneNode] }],
    })
    expect(badHex).toBeNull()
  })
})
