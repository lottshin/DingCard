import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SaveDraftInput } from '../drafts'
import type { FreeformDocument } from '../freeform/types'
import {
  deleteUserTemplate,
  inlineImageRefs,
  listUserTemplates,
  saveUserTemplate,
  userTemplateToDefinition,
} from './userTemplates'

function validFreeformDocument(): FreeformDocument {
  return {
    documentVersion: 12,
    activeSlideId: 'slide-1',
    slides: [
      {
        id: 'slide-1',
        name: '模板页',
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
            text: '要存成模板的标题',
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

function markdownDraft(overrides: Partial<{ source: string }> = {}): SaveDraftInput {
  return {
    mode: 'markdown-card',
    document: {
      source: overrides.source ?? '# 模板标题\n\n正文内容。',
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
    },
  }
}

describe('userTemplates storage', () => {
  let values: Map<string, string>

  beforeEach(() => {
    values = new Map()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    })
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves and lists a freeform template with the given name', () => {
    const saved = saveUserTemplate('user-1', {
      name: '我的封面',
      pageCount: 2,
      draft: { mode: 'freeform-slide', document: validFreeformDocument() },
    })
    expect(saved.name).toBe('我的封面')
    expect(saved.pageCount).toBe(2)
    expect(saved.draft.mode).toBe('freeform-slide')

    const list = listUserTemplates('user-1')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(saved.id)
    expect(list[0].draft.mode).toBe('freeform-slide')
  })

  it('falls back to a default name when the input name is blank', () => {
    const saved = saveUserTemplate('user-1', {
      name: '   ',
      pageCount: 1,
      draft: markdownDraft(),
    })
    expect(saved.name).toBe('未命名模板')
  })

  it('lists newest first and deletes by id', () => {
    const first = saveUserTemplate('user-1', { name: '一号', pageCount: 1, draft: markdownDraft() })
    const second = saveUserTemplate('user-1', { name: '二号', pageCount: 1, draft: markdownDraft() })
    const list = listUserTemplates('user-1')
    expect(list.map((template) => template.id)).toEqual([second.id, first.id])

    deleteUserTemplate('user-1', second.id)
    expect(listUserTemplates('user-1').map((template) => template.id)).toEqual([first.id])
  })

  it('keeps templates namespaced per user', () => {
    saveUserTemplate('user-1', { name: 'A', pageCount: 1, draft: markdownDraft() })
    saveUserTemplate('user-2', { name: 'B', pageCount: 1, draft: markdownDraft() })
    expect(listUserTemplates('user-1').map((template) => template.name)).toEqual(['A'])
    expect(listUserTemplates('user-2').map((template) => template.name)).toEqual(['B'])
  })

  it('rejects an invalid draft payload', () => {
    expect(() =>
      saveUserTemplate('user-1', {
        name: '坏模板',
        pageCount: 1,
        draft: { mode: 'freeform-slide', document: { documentVersion: 4 } as unknown as FreeformDocument },
      }),
    ).toThrow('模板内容无效')
    expect(listUserTemplates('user-1')).toHaveLength(0)
  })

  it('skips corrupt entries when listing', () => {
    const saved = saveUserTemplate('user-1', { name: '好的', pageCount: 1, draft: markdownDraft() })
    values.set('slicer.user-templates.user-1', JSON.stringify([{ id: 'bad' }, saved]))
    expect(listUserTemplates('user-1').map((template) => template.id)).toEqual([saved.id])
  })

  it('surfaces a readable error when the quota is exceeded', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('QuotaExceededError')
      }),
      removeItem: vi.fn(),
    })
    expect(() =>
      saveUserTemplate('user-1', { name: '超大', pageCount: 1, draft: markdownDraft() }),
    ).toThrow('本地存储空间不足，模板保存失败')
  })
})

describe('userTemplateToDefinition', () => {
  let values: Map<string, string>

  beforeEach(() => {
    values = new Map()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    })
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adapts a freeform template and clones on every factory call', () => {
    const saved = saveUserTemplate('user-1', {
      name: '画布模板',
      pageCount: 3,
      draft: { mode: 'freeform-slide', document: validFreeformDocument() },
    })
    const definition = userTemplateToDefinition(saved)
    expect(definition.id).toBe(`user-${saved.id}`)
    expect(definition.userTemplateId).toBe(saved.id)
    expect(definition.series).toBe('user')
    expect(definition.workspace).toBe('freeform')
    expect(definition.pageCount).toBe(3)

    const first = definition.createFreeform?.()
    expect(first?.slides[0].nodes[0].type).toBe('text')
    if (first?.slides[0].nodes[0].type !== 'text') throw new Error('expected a text node')
    first.slides[0].nodes[0].text = '被调用方改动'
    const second = definition.createFreeform?.()
    if (second?.slides[0].nodes[0].type !== 'text') throw new Error('expected a text node')
    expect(second.slides[0].nodes[0].text).toBe('要存成模板的标题')
    if (saved.draft.mode !== 'freeform-slide') throw new Error('expected a freeform draft')
    if (saved.draft.document.slides[0].nodes[0].type !== 'text') throw new Error('expected a text node')
    expect(saved.draft.document.slides[0].nodes[0].text).toBe('要存成模板的标题')
  })

  it('adapts a markdown template', () => {
    const saved = saveUserTemplate('user-1', {
      name: '图文模板',
      pageCount: 4,
      draft: markdownDraft(),
    })
    const definition = userTemplateToDefinition(saved)
    expect(definition.workspace).toBe('markdown')
    const document = definition.createMarkdown?.()
    expect(document?.source).toContain('模板标题')
    expect(document?.platformId).toBe('rednote')
    expect(document?.radius).toBe(18)
  })
})

describe('inlineImageRefs', () => {
  it('replaces img refs with resolved urls and leaves other text intact', () => {
    const source = '# 标题\n\n![图一](img:abc123)\n\n![图二](img:def456)'
    const out = inlineImageRefs(source, {
      'img:abc123': 'data:image/png;base64,AAA',
      'img:def456': 'data:image/png;base64,BBB',
    })
    expect(out).toBe('# 标题\n\n![图一](data:image/png;base64,AAA)\n\n![图二](data:image/png;base64,BBB)')
  })

  it('keeps the source when no image resolves', () => {
    const source = '![保留](img:missing)'
    expect(inlineImageRefs(source, {})).toBe(source)
  })
})
