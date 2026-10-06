import { describe, expect, test } from 'vitest'
import { importDraftFromJson } from '../drafts'
import type { FreeformDocument } from '../freeform/types'

function validFreeformDocument(): FreeformDocument {
  return {
    documentVersion: 30,
    activeSlideId: 'slide-1',
    slides: [
      {
        id: 'slide-1',
        name: '导入页',
        width: 1080,
        height: 1440,
        background: { type: 'solid', color: '#ffffff' },
        nodes: [
          {
            id: 'text-1',
            name: '标题',
            locked: false,
            hidden: false,
            type: 'text',
            x: 80,
            y: 160,
            width: 800,
            height: 200,
            rotation: 0,
            scale: 1,
            text: '从 MCP 导入的标题',
            fontSize: 64,
            fontFamily: 'PingFang SC',
            textFill: { type: 'solid', color: '#18181b' },
            align: 'left',
            fontWeight: 'bold',
          },
        ],
      },
    ],
  }
}

const validMarkdownDocument = {
  source: '# 从 MCP 导入\n\n正文内容。',
  platformId: 'rednote',
  themeId: 'light',
  fontFamily: "'Noto Sans SC', sans-serif",
  profile: {
    nickname: '叮卡',
    handle: 'dingcard',
    location: '',
    avatarColor: '#f97316',
    avatarImage: null,
    verified: false,
    headerFirstPageOnly: false,
  },
  radius: 18,
}

describe('importDraftFromJson', () => {
  test('accepts a valid v4 freeform document', () => {
    const outcome = importDraftFromJson(JSON.stringify(validFreeformDocument()))
    expect(outcome).toMatchObject({ ok: true })
    if (!outcome.ok) return
    expect(outcome.data.mode).toBe('freeform-slide')
    if (outcome.data.mode !== 'freeform-slide') return
    expect(outcome.data.document.documentVersion).toBe(30)
    expect(outcome.data.document.slides[0].nodes[0].type).toBe('text')
  })

  test('migrates a legacy v1 document to v4', () => {
    const legacy = JSON.stringify({
      documentVersion: 1,
      activeSlideId: 's0',
      slides: [
        {
          id: 's0',
          name: '旧文档',
          width: 1080,
          height: 1440,
          background: '#f6f3ea',
          elements: [
            {
              id: 'e0',
              type: 'text',
              x: 72,
              y: 120,
              width: 800,
              height: 120,
              rotation: 0,
              text: '旧版文字',
              fontSize: 48,
              fontFamily: 'PingFang SC',
              color: '#171717',
            },
          ],
        },
      ],
    })
    const outcome = importDraftFromJson(legacy)
    expect(outcome).toMatchObject({ ok: true })
    if (!outcome.ok || outcome.data.mode !== 'freeform-slide') return
    expect(outcome.data.document.documentVersion).toBe(30)
    expect(outcome.data.document.slides[0].nodes).toHaveLength(1)
  })

  test('rejects a freeform document with an extra node key', () => {
    const document = validFreeformDocument() as unknown as Record<string, unknown>
    const slide = (document.slides as Array<Record<string, unknown>>)[0]
    const nodes = slide.nodes as Array<Record<string, unknown>>
    nodes[0].bogus = true
    const outcome = importDraftFromJson(JSON.stringify(document))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error).toContain('校验')
  })

  test('accepts a markdown document envelope', () => {
    const outcome = importDraftFromJson(JSON.stringify(validMarkdownDocument))
    expect(outcome).toMatchObject({ ok: true })
    if (!outcome.ok) return
    expect(outcome.data.mode).toBe('markdown-card')
    if (outcome.data.mode !== 'markdown-card') return
    expect(outcome.data.document.source).toContain('从 MCP 导入')
  })

  test('rejects a markdown envelope without required fields', () => {
    const outcome = importDraftFromJson(JSON.stringify({ source: '只有正文' }))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error).toContain('Markdown 文档缺少必填字段')
  })

  test('rejects invalid JSON, non-objects, and unknown shapes', () => {
    expect(importDraftFromJson('不是 json').ok).toBe(false)
    expect(importDraftFromJson('[1,2,3]').ok).toBe(false)
    expect(importDraftFromJson('null').ok).toBe(false)
    expect(importDraftFromJson('{"foo":"bar"}').ok).toBe(false)
  })
})
