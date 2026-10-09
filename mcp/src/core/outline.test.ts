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

describe('outline tables', () => {
  test('reads a Markdown table as the section\'s table element', () => {
    const parsed = parseOutline(`# 半年报
## 收入构成
| 来源 | 金额 | 占比 |
| --- | --- | --- |
| 广告 | 3000 | 60% |
| 带货 | 2000 | 40% |

## 写在最后
继续加油`)
    expect(parsed?.sections[0].table).toEqual({
      header: ['来源', '金额', '占比'],
      rows: [['广告', '3000', '60%'], ['带货', '2000', '40%']],
    })
    expect(parsed?.sections[1].table).toBeUndefined()
  })

  test('a table sits between body and points, and a second one joins it', () => {
    const parsed = parseOutline(`# 表格
## 第一节
开头一句
| a | b |
| --- | --- |
| 1 | 2 |
中间一句
- 要点一
| c | d |
| --- | --- |
| 3 | 4 |`)
    expect(parsed?.sections[0]).toEqual({
      title: '第一节',
      body: '开头一句\n中间一句',
      points: ['要点一'],
      table: { header: ['a', 'b'], rows: [['1', '2'], ['3', '4']] },
    })
  })

  test('pipe lines without a separator stay ordinary body copy', () => {
    const parsed = parseOutline('# t\n## s\n| 不是表格 | 没有 |')
    expect(parsed?.sections[0].table).toBeUndefined()
    expect(parsed?.sections[0].body).toContain('不是表格')
  })

  test('composes an outline table into a placed table element', () => {
    const composed = createDocumentFromOutline(
      `# 课程表
## 周一安排
| 节次 | 周一 |
| --- | --- |
| 第 1 节 | 语文 |
| 第 2 节 | 数学 |`,
      'editorial-freeform',
    )
    expect(composed.ok).toBe(true)
    if (!composed.ok) return
    const table = composed.document.slides.flatMap((slide) => slide.nodes).find((node) => node.type === 'table')
    expect(table).toMatchObject({
      type: 'table',
      rows: 3,
      cols: 2,
      cells: ['节次', '周一', '第 1 节', '语文', '第 2 节', '数学'],
    })
  })
})
