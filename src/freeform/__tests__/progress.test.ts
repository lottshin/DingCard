import { describe, expect, it } from 'vitest'

import {
  PROGRESS_VALUE_MAX,
  PROGRESS_VALUE_MIN,
  isProgressKind,
  isValidProgressValue,
  progressGeometry,
  progressPercentText,
} from '../progress'
import { createProgressElement, freeformReducer } from '../document'
import { normalizeFreeformDocument } from '../sceneDocument'
import type { FreeformDocument, FreeformProgressElement, FreeformSceneNode, FreeformSlide } from '../types'

const slide: FreeformSlide = {
  id: 'slide-1',
  name: '第 1 页',
  width: 1080,
  height: 1440,
  background: { type: 'solid', color: '#ffffff' },
  nodes: [],
}

describe('progress element', () => {
  it('accepts 0–100 with at most one decimal', () => {
    expect(isValidProgressValue(0)).toBe(true)
    expect(isValidProgressValue(65)).toBe(true)
    expect(isValidProgressValue(100)).toBe(true)
    expect(isValidProgressValue(12.5)).toBe(true)
    expect(isValidProgressValue(PROGRESS_VALUE_MIN - 0.1)).toBe(false)
    expect(isValidProgressValue(PROGRESS_VALUE_MAX + 1)).toBe(false)
    expect(isValidProgressValue(33.33)).toBe(false)
    expect(isValidProgressValue('65')).toBe(false)
    expect(isValidProgressValue(Number.NaN)).toBe(false)
    expect(isProgressKind('bar')).toBe(true)
    expect(isProgressKind('ring')).toBe(true)
    expect(isProgressKind('circle')).toBe(false)
  })

  it('rounds the share text and lays the bar out with the number on or beside the fill', () => {
    expect(progressPercentText(65)).toBe('65%')
    expect(progressPercentText(12.5)).toBe('12.5%')

    const bar = progressGeometry(480, 96, 'bar', 65)
    expect(bar.ring).toBeNull()
    expect(bar.bar!.track).toEqual({ x: 0, y: 0, width: 480, height: 96, radius: 48 })
    expect(bar.bar!.fill).toEqual({ x: 0, y: 0, width: 312, height: 96, radius: 48 })
    // A wide fill carries the share inside it; a narrow one beside its end.
    expect(bar.bar!.percent.onFill).toBe(true)
    expect(bar.bar!.percent.text).toBe('65%')
    const narrow = progressGeometry(480, 96, 'bar', 5)
    expect(narrow.bar!.fill).toEqual({ x: 0, y: 0, width: 96, height: 96, radius: 48 })
    expect(narrow.bar!.percent.onFill).toBe(false)
    expect(narrow.bar!.percent.x).toBeGreaterThan(narrow.bar!.fill!.width)
    // An empty goal leaves no fill at all.
    const empty = progressGeometry(480, 96, 'bar', 0)
    expect(empty.bar!.fill).toBeNull()

    const ring = progressGeometry(240, 240, 'ring', 75)
    expect(ring.bar).toBeNull()
    expect(ring.ring!.cx).toBe(120)
    expect(ring.ring!.cy).toBe(120)
    expect(ring.ring!.radius).toBe(116)
    expect(ring.ring!.percent.text).toBe('75%')
    expect(ring.ring!.percent.x).toBe(120)
    expect(ring.ring!.fillPath).toContain('A 116 116')
    expect(progressGeometry(240, 240, 'ring', 0).ring!.fillPath).toBeNull()
    expect(progressGeometry(240, 240, 'ring', 100).ring!.fillPath).toContain('A 116 116 0 1 1')
  })

  it('creates a bar sample and replaces the value through node/update-content', () => {
    const element = createProgressElement(slide)
    expect(element.progressKind).toBe('bar')
    expect(element.value).toBe(65)
    expect(element.width).toBe(480)
    expect(element.height).toBe(96)

    const document: FreeformDocument = {
      documentVersion: 38,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [element as unknown as FreeformSceneNode] }],
    }
    const updated = freeformReducer(document, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { value: 42.5 } }],
    })
    expect((updated.slides[0].nodes[0] as FreeformProgressElement).value).toBe(42.5)
    // An out-of-range or over-precise value rejects the patch.
    const rejected = freeformReducer(updated, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { value: 120 } }],
    })
    expect(rejected).toBe(updated)
    const rejectedPrecise = freeformReducer(updated, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { value: 33.33 } }],
    })
    expect(rejectedPrecise).toBe(updated)
    // A same-value patch is no edit at all.
    const same = freeformReducer(updated, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { value: 42.5 } }],
    })
    expect(same).toBe(updated)
  })

  it('restyles the accent and the kind through node/update-style', () => {
    const element = createProgressElement(slide)
    const document: FreeformDocument = {
      documentVersion: 38,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [element as unknown as FreeformSceneNode] }],
    }
    const styled = freeformReducer(document, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { accent: '#0f766e', progressKind: 'ring' } }],
    })
    const styledElement = styled.slides[0].nodes[0] as FreeformProgressElement
    expect(styledElement.accent).toBe('#0f766e')
    expect(styledElement.progressKind).toBe('ring')
    const restored = freeformReducer(styled, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { accent: null } }],
    })
    expect('accent' in (restored.slides[0].nodes[0] as FreeformProgressElement)).toBe(false)
    const bad = freeformReducer(restored, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { progressKind: 'circle' as unknown as 'bar' } }],
    })
    expect(bad).toBe(restored)
  })

  it('carries progress at v38 and rejects it at v37', () => {
    const element = createProgressElement(slide)
    const progressSlide = { ...slide, nodes: [element as unknown as FreeformSceneNode] }
    const v38 = normalizeFreeformDocument({ documentVersion: 38, activeSlideId: slide.id, slides: [progressSlide] })
    expect(v38).not.toBeNull()
    expect((v38!.slides[0].nodes[0] as FreeformProgressElement).value).toBe(65)
    const v37 = normalizeFreeformDocument({ documentVersion: 37, activeSlideId: slide.id, slides: [progressSlide] })
    expect(v37).toBeNull()
    // The accent override rides at v38; a bad hex or a bad kind rejects outright.
    const accent = normalizeFreeformDocument({
      documentVersion: 38,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [{ ...element, accent: '#0f766e' } as unknown as FreeformSceneNode] }],
    })
    expect((accent!.slides[0].nodes[0] as FreeformProgressElement).accent).toBe('#0f766e')
    const badHex = normalizeFreeformDocument({
      documentVersion: 38,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [{ ...element, accent: 'blue' } as unknown as FreeformSceneNode] }],
    })
    expect(badHex).toBeNull()
    const badValue = normalizeFreeformDocument({
      documentVersion: 38,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [{ ...element, value: 101 } as unknown as FreeformSceneNode] }],
    })
    expect(badValue).toBeNull()
  })
})
