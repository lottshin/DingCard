import { describe, expect, it } from 'vitest'
import { collapseSpaces, type Run } from '../htmlImport'

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
