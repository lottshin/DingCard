import { describe, expect, it } from 'vitest'
import { collapseSpaces, progressShare, readHtmlTable, type Run } from '../htmlImport'

/** A run as the importer reads it, each chunk mapped to itself. */
function run(text: string): Run {
  const map: Run['map'] = []
  const pattern = / +|[^ ]+/g
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    map.push([match.index, match.index + match[0].length, match.index, match.index + match[0].length])
  }
  return { text, node: null, element: {} as Element, map }
}

const texts = (runs: Run[]) => runs.map((entry) => entry.text)

describe('html import whitespace', () => {
  it('keeps one space where words meet, none at the ends or beside a line break', () => {
    expect(texts(collapseSpaces([run(' Every cup '), run(' is'), run(' brewed ')], () => true))).toEqual(['Every cup ', 'is', ' brewed'])
    expect(texts(collapseSpaces([run('a '), run('\n'), run(' b')], () => true))).toEqual(['a', '\n', 'b'])
  })

  it('keeps every space of preformatted text', () => {
    expect(texts(collapseSpaces([run('  indented  ')], () => false))).toEqual(['  indented  '])
  })
})

describe('html table reading', () => {
  const cell = (tag: string, text: string) => ({ tagName: tag, textContent: text }) as unknown as Element

  it('reads header, rows and cells, padding short rows', () => {
    const read = readHtmlTable([
      [cell('TH', ' 来源 '), cell('TH', '金额')],
      [cell('TD', '广告'), cell('TD', '3000')],
      [cell('TD', '带货')],
    ])
    expect(read).toMatchObject({ rows: 3, cols: 2, headerRow: true, droppedRows: 0, droppedCells: 0, cutChars: 0 })
    expect(read.cells).toEqual(['来源', '金额', '广告', '3000', '带货', ''])
  })

  it('an all-td table is not a header table', () => {
    expect(readHtmlTable([[cell('TD', 'a'), cell('TD', 'b')], [cell('TD', 'c'), cell('TD', 'd')]]).headerRow).toBe(false)
  })

  it('drops rows past 12, cells past 6 columns, and cuts cells past 24 characters', () => {
    const long = Array.from({ length: 15 }, () => Array.from({ length: 8 }, (_, index) => cell('TD', `格${index}`)))
    const read = readHtmlTable(long)
    expect(read.rows).toBe(12)
    expect(read.cols).toBe(6)
    expect(read.cells).toHaveLength(72)
    expect(read.droppedRows).toBe(3)
    expect(read.droppedCells).toBe(24)

    const cut = readHtmlTable([
      [cell('TH', 'a'), cell('TH', 'b')],
      [cell('TD', '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十'), cell('TD', 'ok')],
    ])
    expect(cut.cells[2]).toHaveLength(24)
    expect(cut.cutChars).toBe(1)
    expect(cut.cells[3]).toBe('ok')
  })

  it('squeezes a cell\'s whitespace to single spaces', () => {
    const read = readHtmlTable([[cell('TH', 'a'), cell('TH', 'b')], [cell('TD', '换行\n和   空格'), cell('TD', 'x')]])
    expect(read.cells[2]).toBe('换行 和 空格')
  })
})

describe('html progress share', () => {
  it('reads the share of the max, clamped and rounded to one decimal', () => {
    expect(progressShare(65, 100)).toBe(65)
    expect(progressShare(0.42, 1)).toBe(42)
    expect(progressShare(1.5, 1)).toBe(100)
    expect(progressShare(-3, 100)).toBe(0)
    expect(progressShare(1, 3)).toBeCloseTo(33.3, 6)
    expect(progressShare(7, 0)).toBe(100)
  })
})
