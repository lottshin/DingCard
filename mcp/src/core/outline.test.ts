import { describe, expect, test } from 'vitest'
import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import type { FreeformTextElement } from '../../../src/freeform/types'
import { freeformTemplateIds } from './templates'
import { createDocumentFromOutline, parseOutline } from './outline'

const OUTLINE = `# 三步搞定周报
每周五十分钟写完

## 收集素材
- 每天 5 分钟记录
- 只记事实：别写感受

## 写初稿
先列骨架，再填细节。
> 写完再改 —— 老编辑

## 发出去
1. 别追求完美
2. 周五前发

## 结尾：下周见
- 收藏这份流程

---`

function texts(slide: { nodes: Array<{ type: string }> }): FreeformTextElement[] {
  return slide.nodes.filter((node): node is FreeformTextElement => node.type === 'text')
}

describe('parseOutline', () => {
  test('reads the cover, each section\'s points, body and quote, and the closing page', () => {
    expect(parseOutline(OUTLINE)).toEqual({
      title: '三步搞定周报',
      subtitle: '每周五十分钟写完',
      sections: [
        { title: '收集素材', points: ['每天 5 分钟记录', '只记事实：别写感受'] },
        { title: '写初稿', body: '先列骨架，再填细节。', quote: '写完再改 —— 老编辑' },
        { title: '发出去', points: ['别追求完美', '周五前发'] },
      ],
      ending: { title: '下周见', points: ['收藏这份流程'] },
    })
  })

  test('rejects outlines without sections or with blank section titles', () => {
    expect(parseOutline('# 只有总标题')).toBeNull()
    expect(parseOutline('## \n正文')).toBeNull()
    expect(parseOutline('')).toBeNull()
  })
})

describe('createDocumentFromOutline', () => {
  test('fills the editorial template with the outline and nothing else', () => {
    const result = createDocumentFromOutline(OUTLINE, 'editorial-freeform')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)

    // cover + three sections + the closing page the outline asked for
    expect(result.document.slides).toHaveLength(5)
    expect(result.summary.pages.map((page) => [page.page, page.role, page.title])).toEqual([
      [1, 'cover', '三步搞定周报'],
      [2, 'section', '收集素材'],
      [3, 'section', '写初稿'],
      [4, 'section', '发出去'],
      [5, 'ending', '下周见'],
    ])
    expect(result.summary.overflowing).toEqual([])

    const [cover, first, second, , ending] = result.document.slides
    expect(texts(cover).find((node) => node.name === '导语')?.text).toBe('每周五十分钟写完')
    expect(texts(first).map((node) => node.text)).toEqual(expect.arrayContaining([
      '收集素材',
      '01\n每天 5 分钟记录',
      '02\n只记事实：别写感受',
      '阅读顺序 / 02',
    ]))
    // An item with no point and the quote with no words go, with their backing card.
    expect(first.nodes.map((node) => node.name)).not.toEqual(expect.arrayContaining(['步骤三', '引文', '引文底板']))
    expect(texts(second).find((node) => node.name === '引文')?.text).toBe('“写完再改”')
    expect(texts(second).find((node) => node.name === '引文注释')?.text).toBe('老编辑')
    expect(second.nodes.map((node) => node.name)).not.toContain('步骤一')
    expect(texts(ending).find((node) => node.name === '页码')?.text).toBe('05')
    expect(texts(ending).find((node) => node.name === '结尾清单')?.text).toBe('收藏这份流程')

    expect(normalizeFreeformDocument(result.document)).toEqual(result.document)
  })

  test('without a closing section the deck ends on its last page', () => {
    const result = createDocumentFromOutline('# 标题\n## 唯一一节\n- 一点', 'signal-freeform')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.slides).toHaveLength(2)
    expect(result.summary.pages.map((page) => page.role)).toEqual(['cover', 'section'])
  })

  test('generates a valid deck from every freeform template', () => {
    for (const templateId of freeformTemplateIds()) {
      const result = createDocumentFromOutline(OUTLINE, templateId)
      expect(result.ok, templateId).toBe(true)
      if (!result.ok) continue
      expect(result.document.slides, templateId).toHaveLength(5)
      expect(normalizeFreeformDocument(result.document), templateId).toEqual(result.document)
    }
  })

  test('reports readable errors for bad outlines and template ids', () => {
    const badOutline = createDocumentFromOutline('# 无小节', 'editorial-freeform')
    expect(badOutline.ok).toBe(false)
    if (!badOutline.ok) expect(badOutline.error).toContain('大纲解析失败')

    const badTemplate = createDocumentFromOutline(OUTLINE, 'no-such-template')
    expect(badTemplate.ok).toBe(false)
    if (!badTemplate.ok) expect(badTemplate.error).toContain('未知的模板 id')

    const markdownTemplate = createDocumentFromOutline(OUTLINE, 'editorial-archive-markdown')
    expect(markdownTemplate.ok).toBe(false)
    if (!markdownTemplate.ok) expect(markdownTemplate.error).toContain('仅支持自由画布模板')
  })
})
