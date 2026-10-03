import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editableText } from '../PlainTextEditable'
import { keepsEmptyLine, listIndentEm, listItemCount, textLayoutAttributes, textLayoutStyle } from '../textLayout'

const BASE = {
  fontFamily: 'PingFang SC',
  fontSize: 40,
  align: 'left' as const,
  fontWeight: 'normal' as const,
  text: '一\n二',
}

// Just enough of a DOM tree for the serializer: node types, children, siblings and text.
interface FakeNode {
  nodeType: number
  tagName?: string
  textContent?: string
  childNodes: FakeNode[]
  nextSibling: FakeNode | null
}

function text(value: string): FakeNode {
  return { nodeType: 3, textContent: value, childNodes: [], nextSibling: null }
}

function el(tagName: string, ...children: Array<FakeNode | string>): FakeNode {
  const childNodes = children.map((child) => (typeof child === 'string' ? text(child) : child))
  childNodes.forEach((child, index) => {
    child.nextSibling = childNodes[index + 1] ?? null
  })
  return { nodeType: 1, tagName: tagName.toUpperCase(), childNodes, nextSibling: null }
}

function read(...children: Array<FakeNode | string>): string {
  return editableText(el('div', ...children) as unknown as Node)
}

describe('text layout (v20)', () => {
  it('lays out justify, vertical alignment, spacing and lists', () => {
    expect(textLayoutStyle({ ...BASE, align: 'justify' })).toMatchObject({ textAlign: 'justify' })
    expect(textLayoutStyle({ ...BASE, verticalAlign: 'middle' })).toMatchObject({ display: 'flex', flexDirection: 'column', justifyContent: 'safe center' })
    expect(textLayoutStyle({ ...BASE, verticalAlign: 'bottom' })).toMatchObject({ justifyContent: 'safe flex-end' })
    expect(textLayoutStyle(BASE)).not.toHaveProperty('display')
    expect(textLayoutStyle({ ...BASE, paragraphSpacing: 12 })).toMatchObject({ '--freeform-paragraph-spacing': '12px' })
    expect(textLayoutAttributes({ list: 'number', paragraphSpacing: 12 })).toEqual({ 'data-list': 'number', 'data-paragraph-spacing': '' })
    expect(textLayoutAttributes({})).toEqual({})
  })

  it('leaves room for the widest marker and counts only paragraphs with words', () => {
    expect(listIndentEm('bullet', 3)).toBe(1.4)
    expect(listIndentEm('number', 9)).toBe(1.6)
    expect(listIndentEm('number', 10)).toBe(2.2)
    expect(listItemCount('一\n\n二\n')).toBe(2)
    expect(keepsEmptyLine([], 0, 2)).toBe(true)
    expect(keepsEmptyLine([], 1, 2)).toBe(false)
    expect(keepsEmptyLine([{ text: 'x' }], 0, 2)).toBe(false)
  })
})

describe('editable text', () => {
  beforeEach(() => {
    vi.stubGlobal('Node', { ELEMENT_NODE: 1, TEXT_NODE: 3 })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the paragraphs the browser makes on Enter as line breaks', () => {
    expect(read(el('div', '第一行'), el('div', '第二行'))).toBe('第一行\n第二行')
    expect(read('第一行', el('div', '第二行'), el('div', el('br')), el('div', '第四行'))).toBe('第一行\n第二行\n\n第四行')
  })

  it('breaks at a <br> between words but not at one that only holds a line open', () => {
    expect(read(el('div', '甲', el('br')), el('div', '乙', el('br'), '丙'))).toBe('甲\n乙\n丙')
    expect(read(el('div', '甲', el('br'), text('')))).toBe('甲')
  })

  it('keeps styled words in their paragraph and pasted line breaks', () => {
    expect(read(el('div', '甲', el('span', '乙')), el('div'))).toBe('甲乙\n')
    expect(read(el('div', '甲\n乙'))).toBe('甲\n乙')
    expect(read()).toBe('')
  })
})
