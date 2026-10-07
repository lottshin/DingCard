import { describe, expect, it } from 'vitest'

import {
  TIMELINE_ITEMS_MAX,
  TIMELINE_LABEL_MAX_CHARS,
  TIMELINE_TEXT_MAX_CHARS,
  isValidTimelineItems,
  timelineGeometry,
  timelineItemsSame,
} from '../timeline'
import { createTimelineElement, freeformReducer } from '../document'
import { normalizeFreeformDocument } from '../sceneDocument'
import type { FreeformDocument, FreeformSceneNode, FreeformSlide, FreeformTimelineElement, FreeformTimelineItem } from '../types'

const slide: FreeformSlide = {
  id: 'slide-1',
  name: '第 1 页',
  width: 1080,
  height: 1440,
  background: { type: 'solid', color: '#ffffff' },
  nodes: [],
}

describe('timeline element', () => {
  it('accepts 2–8 items with short labels and texts', () => {
    expect(isValidTimelineItems([{ text: '一件事' }, { label: '3 月', text: '两件事' }])).toBe(true)
    expect(isValidTimelineItems([{ text: '一件事' }])).toBe(false)
    expect(isValidTimelineItems(
      Array.from({ length: TIMELINE_ITEMS_MAX + 1 }, () => ({ text: 'x' })),
    )).toBe(false)
    expect(isValidTimelineItems([{ text: '' }, { text: 'y' }])).toBe(false)
    expect(isValidTimelineItems([{ text: 'x'.repeat(TIMELINE_TEXT_MAX_CHARS + 1) }, { text: 'y' }])).toBe(false)
    expect(isValidTimelineItems([{ label: 'x'.repeat(TIMELINE_LABEL_MAX_CHARS + 1), text: 'y' }, { text: 'z' }])).toBe(false)
    expect(isValidTimelineItems([{ label: 'x', text: 'y', bold: true }, { text: 'z' }])).toBe(false)
    expect(isValidTimelineItems('growing')).toBe(false)
  })

  it('lays entries out down the spine with wrapped text', () => {
    const items: FreeformTimelineItem[] = [
      { label: '3 月', text: '开始' },
      { text: '中间没有标签的一步' },
      { label: '12 月', text: '结尾' },
    ]
    const geometry = timelineGeometry(480, 300, items)
    expect(geometry.spine).toEqual({ x: 14, y1: 4, y2: 296 })
    // Three rows of 100: the dots sit at each row's centre.
    expect(geometry.entries.map((entry) => entry.dotY)).toEqual([50, 150, 250])
    // The label sits above the text, both left of nothing: beside the spine.
    expect(geometry.entries[0].label).not.toBeNull()
    expect(geometry.entries[0].label!.x).toBe(34)
    expect(geometry.entries[1].label).toBeNull()
    // Long text wraps to a second line instead of running off the box.
    const wrapped = timelineGeometry(200, 200, [
      { text: '这一行很长很长，会折成两行' },
      { text: '短句' },
    ])
    expect(wrapped.entries[0].textLines.length).toBeGreaterThan(1)
    expect(wrapped.entries[1].textLines.length).toBe(1)
  })

  it('creates a four-entry sample and replaces items through node/update-content', () => {
    const element = createTimelineElement(slide)
    expect(element.items).toHaveLength(4)
    expect(element.items[0].label).toBe('3 月')
    expect(timelineItemsSame(element.items, element.items.map((item) => ({ ...item })))).toBe(true)

    const document: FreeformDocument = {
      documentVersion: 36,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [element as unknown as FreeformSceneNode] }],
    }
    const items: FreeformTimelineItem[] = [
      { label: '周一', text: '写方案' },
      { label: '周二', text: '改方案' },
    ]
    const replaced = freeformReducer(document, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { items } }],
    })
    const replacedElement = replaced.slides[0].nodes[0] as FreeformTimelineElement
    expect(replacedElement.items).toEqual(items)
    // A bad item rejects the patch and keeps the element as-is.
    const rejected = freeformReducer(replaced, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { items: [{ text: '只有一项' }] } }],
    })
    expect(rejected).toBe(replaced)
  })

  it('styles the accent through node/update-style', () => {
    const element = createTimelineElement(slide)
    const document: FreeformDocument = {
      documentVersion: 36,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [element as unknown as FreeformSceneNode] }],
    }
    const styled = freeformReducer(document, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { accent: '#0f766e' } }],
    })
    expect((styled.slides[0].nodes[0] as FreeformTimelineElement).accent).toBe('#0f766e')
    const restored = freeformReducer(styled, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { accent: null } }],
    })
    expect('accent' in (restored.slides[0].nodes[0] as FreeformTimelineElement)).toBe(false)
    const bad = freeformReducer(restored, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { accent: 'teal' as unknown as string } }],
    })
    expect(bad).toBe(restored)
  })

  it('carries timelines at v36 and rejects them at v35', () => {
    const element = createTimelineElement(slide)
    const timelineSlide = { ...slide, nodes: [element as unknown as FreeformSceneNode] }
    const v36 = normalizeFreeformDocument({ documentVersion: 36, activeSlideId: slide.id, slides: [timelineSlide] })
    expect(v36).not.toBeNull()
    expect((v36!.slides[0].nodes[0] as FreeformTimelineElement).items).toHaveLength(4)
    const v35 = normalizeFreeformDocument({ documentVersion: 35, activeSlideId: slide.id, slides: [timelineSlide] })
    expect(v35).toBeNull()
    // The accent override rides at v36; a bad hex rejects outright.
    const accent: FreeformTimelineElement = { ...element, accent: '#0f766e' }
    const withAccent = normalizeFreeformDocument({
      documentVersion: 36,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [accent as unknown as FreeformSceneNode] }],
    })
    expect((withAccent!.slides[0].nodes[0] as FreeformTimelineElement).accent).toBe('#0f766e')
    const badHex = normalizeFreeformDocument({
      documentVersion: 36,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [{ ...element, accent: 'blue' } as unknown as FreeformSceneNode] }],
    })
    expect(badHex).toBeNull()
  })
})
