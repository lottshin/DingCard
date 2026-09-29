import { describe, expect, test } from 'vitest'
import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import { walkScene } from '../../../src/freeform/sceneTree'
import type { FreeformTextElement } from '../../../src/freeform/types'
import { freeformTemplateIds } from './templates'
import { createDocumentFromOutline, parseOutline } from './outline'

const OUTLINE = `# 三步搞定周报

## 收集素材
- 每天 5 分钟记录
- 只记事实

## 写初稿
先列骨架，再填细节。

## 发出去
1. 别追求完美
2. 周五前发

---`

function textByPredicate(
  slide: { nodes: Parameters<typeof walkScene>[0] },
  predicate: (leaf: FreeformTextElement) => boolean,
): FreeformTextElement | undefined {
  let found: FreeformTextElement | undefined
  walkScene(slide.nodes, (node) => {
    if (node.type === 'text' && predicate(node)) found = node
  })
  return found
}

describe('parseOutline', () => {
  test('collects the deck title, sections, and bullet-stripped points', () => {
    const parsed = parseOutline(OUTLINE)
    expect(parsed).not.toBeNull()
    if (!parsed) throw new Error('expected a parsed outline')
    expect(parsed.title).toBe('三步搞定周报')
    expect(parsed.sections).toEqual([
      { title: '收集素材', points: ['每天 5 分钟记录', '只记事实'] },
      { title: '写初稿', points: ['先列骨架，再填细节。'] },
      { title: '发出去', points: ['别追求完美', '周五前发'] },
    ])
  })

  test('rejects outlines without sections or with blank section titles', () => {
    expect(parseOutline('# 只有总标题')).toBeNull()
    expect(parseOutline('## \n正文')).toBeNull()
    expect(parseOutline('')).toBeNull()
  })
})

describe('createDocumentFromOutline', () => {
  test('builds one styled slide per section around the editorial template', () => {
    const result = createDocumentFromOutline(OUTLINE, 'editorial-freeform')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)

    // cover + one slide per section + the template ending page
    expect(result.document.slides).toHaveLength(5)
    expect(result.summary).toEqual({
      documentVersion: 13,
      slideCount: 5,
      coverTitle: '三步搞定周报',
      sections: [
        { slideId: expect.any(String), title: '收集素材', pointCount: 2 },
        { slideId: expect.any(String), title: '写初稿', pointCount: 1 },
        { slideId: expect.any(String), title: '发出去', pointCount: 2 },
      ],
    })

    const coverTitle = textByPredicate(
      result.document.slides[0],
      (leaf) => leaf.name.includes('标题') && leaf.fontSize >= 40,
    )
    expect(coverTitle?.text).toBe('三步搞定周报')

    const first = result.document.slides[1]
    const firstTitle = textByPredicate(first, (leaf) => leaf.name.includes('标题') && leaf.fontSize >= 60)
    expect(firstTitle?.text).toBe('收集素材')
    const firstBody = textByPredicate(first, (leaf) => leaf.text.includes('每天 5 分钟记录'))
    expect(firstBody?.text).toBe('每天 5 分钟记录\n只记事实')

    const second = result.document.slides[2]
    const secondTitle = textByPredicate(second, (leaf) => leaf.name.includes('标题') && leaf.fontSize >= 60)
    expect(secondTitle?.text).toBe('写初稿')
    const secondBody = textByPredicate(second, (leaf) => leaf.text.includes('先列骨架'))
    expect(secondBody?.text).toBe('先列骨架，再填细节。')

    // The generated document survives a strict round trip.
    expect(normalizeFreeformDocument(result.document)).toEqual(result.document)
  })

  test('generates a valid styled document from every freeform template', () => {
    for (const templateId of freeformTemplateIds()) {
      const result = createDocumentFromOutline(OUTLINE, templateId)
      expect(result.ok, templateId).toBe(true)
      if (!result.ok) continue
      expect(result.document.slides, templateId).toHaveLength(5)
      expect(normalizeFreeformDocument(result.document), templateId).toEqual(result.document)
      for (const [index, section] of result.summary.sections.entries()) {
        const slide = result.document.slides.find((candidate) => candidate.id === section.slideId)
        expect(slide, templateId).toBeDefined()
        const title = textByPredicate(slide!, (leaf) => leaf.text === section.title)
        expect(title, `${templateId} section ${index}`).toBeDefined()
      }
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
