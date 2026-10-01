import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SaveDraftInput } from '../drafts'
import type { FreeformDocument } from '../freeform/types'
import { legacyTemplateToProject, migrateLegacyUserTemplates } from './legacyUserTemplates'

const KEY = 'slicer.user-templates.user-1'

function freeformDocument(): FreeformDocument {
  return {
    documentVersion: 16,
    activeSlideId: 'slide-1',
    slides: [
      {
        id: 'slide-1',
        name: '模板页',
        width: 1080,
        height: 1440,
        background: { type: 'solid', color: '#ffffff' },
        nodes: [],
      },
    ],
  }
}

const MARKDOWN_DOCUMENT = {
  source: '# 模板标题\n\n正文内容。',
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

/** The shape 0.17–0.20 wrote for one saved template. */
function stored(name: string, mode: 'markdown-card' | 'freeform-slide') {
  return {
    id: `tpl-${name}`,
    name,
    createdAt: 1,
    pageCount: 1,
    draft: {
      id: `draft-${name}`,
      title: name,
      schemaVersion: 2,
      updatedAt: 1,
      mode,
      document: mode === 'markdown-card' ? MARKDOWN_DOCUMENT : freeformDocument(),
    },
  }
}

describe('legacy user templates', () => {
  let values: Map<string, string>

  beforeEach(() => {
    values = new Map()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('turns a stored template into a project named after it', () => {
    expect(legacyTemplateToProject(stored('周报', 'markdown-card'))).toEqual({
      mode: 'markdown-card',
      title: '周报',
      document: MARKDOWN_DOCUMENT,
    })
    const freeform = legacyTemplateToProject(stored('海报', 'freeform-slide'))
    expect(freeform).toMatchObject({ mode: 'freeform-slide', title: '海报' })
    expect(legacyTemplateToProject({ name: 'broken', draft: { mode: 'freeform-slide' } })).toBeNull()
  })

  it('saves every template as a project, then forgets them', async () => {
    values.set(KEY, JSON.stringify([stored('周报', 'markdown-card'), { junk: true }, stored('海报', 'freeform-slide')]))
    const save = vi.fn(async (_input: SaveDraftInput) => undefined)

    await expect(migrateLegacyUserTemplates('user-1', save)).resolves.toBe(2)
    expect(save.mock.calls.map(([input]) => input.title)).toEqual(['周报', '海报'])
    expect(values.has(KEY)).toBe(false)

    await expect(migrateLegacyUserTemplates('user-1', save)).resolves.toBe(0)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('keeps what did not move yet when a save fails, without redoing what did', async () => {
    values.set(KEY, JSON.stringify([stored('一', 'markdown-card'), stored('二', 'markdown-card')]))
    const save = vi.fn<(input: SaveDraftInput) => Promise<undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)

    await expect(migrateLegacyUserTemplates('user-1', save)).rejects.toThrow('offline')
    expect(JSON.parse(values.get(KEY)!).map((entry: { name: string }) => entry.name)).toEqual(['二'])

    await expect(migrateLegacyUserTemplates('user-1', save)).resolves.toBe(1)
    expect(save.mock.calls.map(([input]) => input.title)).toEqual(['一', '二', '二'])
    expect(values.has(KEY)).toBe(false)
  })

  it('does nothing for accounts that never saved a template', async () => {
    const save = vi.fn()
    await expect(migrateLegacyUserTemplates('user-2', save)).resolves.toBe(0)
    expect(save).not.toHaveBeenCalled()
  })
})
