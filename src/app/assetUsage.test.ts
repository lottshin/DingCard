import { describe, expect, it } from 'vitest'

import type { Asset } from '../assets'
import type { Draft } from '../drafts'
import { assetUsage } from './assetUsage'

const DATA_URL = 'data:image/png;base64,aGlzdG9yaWNhbA=='

function asset(id: string, src: string): Asset {
  return { id, name: id, src, width: 10, height: 10, bytes: 10, createdAt: 1 }
}

function markdownDraft(id: string, source: string, images?: Record<string, string>): Draft {
  return {
    id,
    title: id,
    schemaVersion: 2,
    updatedAt: 1,
    mode: 'markdown-card',
    document: {
      source,
      platformId: 'rednote',
      themeId: 'light',
      fontFamily: 'PingFang SC',
      profile: {
        nickname: '',
        handle: '',
        location: '',
        avatarColor: '#000000',
        avatarImage: null,
        verified: false,
        headerFirstPageOnly: false,
      },
      radius: 18,
      images,
    },
  }
}

function freeformDraft(id: string, src: string): Draft {
  return {
    id,
    title: id,
    schemaVersion: 2,
    updatedAt: 1,
    mode: 'freeform-slide',
    document: {
      documentVersion: 17,
      activeSlideId: 'page-1',
      slides: [{
        id: 'page-1',
        name: 'Page 1',
        width: 1080,
        height: 1440,
        background: { type: 'solid', color: '#ffffff' },
        nodes: [{
          id: 'image',
          name: '图片',
          locked: false,
          hidden: false,
          type: 'image',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          scale: 1,
          src,
          alt: '',
          fit: 'cover',
          framing: { focusX: 0.5, focusY: 0.5, zoom: 1 },
        }],
      }],
    },
  } as Draft
}

describe('assetUsage', () => {
  it('counts each project once per asset across both systems and URL spellings', () => {
    const usage = assetUsage(
      [asset('street', 'https://api.example/uploads/street.jpg'), asset('local', DATA_URL), asset('unused', '/uploads/x.png')],
      [
        markdownDraft('a', '![街道](/uploads/street.jpg)\n\n![又一次](https://api.example/uploads/street.jpg)'),
        markdownDraft('b', '![](img:abc)', { 'img:abc': DATA_URL }),
        freeformDraft('c', 'https://api.example/uploads/street.jpg'),
        freeformDraft('d', DATA_URL),
      ],
    )

    expect(Object.fromEntries(usage)).toEqual({ street: 2, local: 2 })
  })

  it('returns nothing without assets', () => {
    expect(assetUsage([], [freeformDraft('c', DATA_URL)]).size).toBe(0)
  })
})
