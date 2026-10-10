import { describe, expect, it } from 'vitest'

import {
  PROGRESS_LABEL_MAX_CHARS,
  PROGRESS_VALUE_MAX,
  PROGRESS_VALUE_MIN,
  isProgressKind,
  isValidProgressLabel,
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
  it('accepts 0–100 with at most one decimal and a 1–12 character label', () => {
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
    expect(isValidProgressLabel('读书进度')).toBe(true)
    expect(isValidProgressLabel('a'.repeat(PROGRESS_LABEL_MAX_CHARS))).toBe(true)
    expect(isValidProgressLabel('')).toBe(false)
    expect(isValidProgressLabel('a'.repeat(PROGRESS_LABEL_MAX_CHARS + 1))).toBe(false)
    expect(isValidProgressLabel(65)).toBe(false)
  })

  it('rounds the share text and lays the bar out with the number on or beside the fill', () => {
    expect(progressPercentText(65)).toBe('65%')
    expect(progressPercentText(12.5)).toBe('12.5%')

    const bar = progressGeometry(480, 96, 'bar', 65)
    expect(bar.label).toBeNull()
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

  it('names the goal above the bar and under the ring\'s share', () => {
    // Above the bar: the name sits at the top-left and the bar shrinks to
    // the room left under it.
    const bar = progressGeometry(480, 96, 'bar', 65, { label: true })
    expect(bar.label).toEqual({ x: 0, y: 17.6, fontSize: 16 })
    expect(bar.bar!.track).toEqual({ x: 0, y: 24, width: 480, height: 72, radius: 36 })
    expect(bar.bar!.fill!.y).toBe(24)
    expect(bar.bar!.fill!.height).toBe(72)
    expect(bar.bar!.percent.y).toBeCloseTo(67.92, 6)
    // Under the ring's share: the percent-and-name stack centres on the
    // ring's middle.
    const ring = progressGeometry(240, 240, 'ring', 75, { label: true })
    expect(ring.label).toEqual({ x: 120, y: 141.9, fontSize: 20 })
    expect(ring.ring!.percent.x).toBe(120)
    expect(ring.ring!.percent.y).toBeCloseTo(121.9, 6)
    // Without a name the geometry is the plain v38 layout.
    expect(progressGeometry(480, 96, 'bar', 65, {}).label).toBeNull()
  })

  it('creates a bar sample and replaces the value through node/update-content', () => {
    const element = createProgressElement(slide)
    expect(element.progressKind).toBe('bar')
    expect(element.value).toBe(65)
    expect(element.width).toBe(480)
    expect(element.height).toBe(96)
    expect('label' in element).toBe(false)

    const document: FreeformDocument = {
      documentVersion: 41,
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

  it('names and clears the goal through node/update-content', () => {
    const element = createProgressElement(slide)
    const document: FreeformDocument = {
      documentVersion: 41,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [element as unknown as FreeformSceneNode] }],
    }
    const named = freeformReducer(document, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { label: '读书进度' } }],
    })
    expect((named.slides[0].nodes[0] as FreeformProgressElement).label).toBe('读书进度')
    // A same-label patch is no edit at all.
    const same = freeformReducer(named, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { label: '读书进度' } }],
    })
    expect(same).toBe(named)
    // An empty label clears the name again.
    const cleared = freeformReducer(named, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { label: '' } }],
    })
    expect('label' in (cleared.slides[0].nodes[0] as FreeformProgressElement)).toBe(false)
    // Over-long, empty-new, and non-string labels reject outright.
    const tooLong = freeformReducer(document, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { label: 'a'.repeat(PROGRESS_LABEL_MAX_CHARS + 1) } }],
    })
    expect(tooLong).toBe(document)
    const notString = freeformReducer(document, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { label: 65 as unknown as string } }],
    })
    expect(notString).toBe(document)
  })

  it('restyles the accent, the kind, and the track colour through node/update-style', () => {
    const element = createProgressElement(slide)
    const document: FreeformDocument = {
      documentVersion: 41,
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
    // The track colour rides at v39; `null` restores the accent tint.
    const tracked = freeformReducer(restored, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { trackFill: '#e4e4e7' } }],
    })
    expect((tracked.slides[0].nodes[0] as FreeformProgressElement).trackFill).toBe('#e4e4e7')
    const untracked = freeformReducer(tracked, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { trackFill: null } }],
    })
    expect('trackFill' in (untracked.slides[0].nodes[0] as FreeformProgressElement)).toBe(false)
    const badTrack = freeformReducer(restored, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [element.id], patch: { trackFill: 'grey' } }],
    })
    expect(badTrack).toBe(restored)
  })

  it('carries the goal name and track colour at v39 and rejects them at v38', () => {
    const element = createProgressElement(slide)
    const progressSlide = { ...slide, nodes: [element as unknown as FreeformSceneNode] }
    const v39 = normalizeFreeformDocument({ documentVersion: 41, activeSlideId: slide.id, slides: [progressSlide] })
    expect(v39).not.toBeNull()
    expect((v39!.slides[0].nodes[0] as FreeformProgressElement).value).toBe(65)
    const v38 = normalizeFreeformDocument({ documentVersion: 38, activeSlideId: slide.id, slides: [progressSlide] })
    expect(v38).not.toBeNull()
    const v37 = normalizeFreeformDocument({ documentVersion: 37, activeSlideId: slide.id, slides: [progressSlide] })
    expect(v37).toBeNull()
    // The v39 fields ride on a v39 document; on a v38 one they reject it.
    const named = normalizeFreeformDocument({
      documentVersion: 41,
      activeSlideId: slide.id,
      slides: [{
        ...slide,
        nodes: [{
          ...element,
          label: '读书进度',
          trackFill: '#e4e4e7',
        } as unknown as FreeformSceneNode],
      }],
    })
    const namedElement = named!.slides[0].nodes[0] as FreeformProgressElement
    expect(namedElement.label).toBe('读书进度')
    expect(namedElement.trackFill).toBe('#e4e4e7')
    const namedAtV38 = normalizeFreeformDocument({
      documentVersion: 38,
      activeSlideId: slide.id,
      slides: [{
        ...slide,
        nodes: [{ ...element, label: '读书进度' } as unknown as FreeformSceneNode],
      }],
    })
    expect(namedAtV38).toBeNull()
    const trackedAtV38 = normalizeFreeformDocument({
      documentVersion: 38,
      activeSlideId: slide.id,
      slides: [{
        ...slide,
        nodes: [{ ...element, trackFill: '#e4e4e7' } as unknown as FreeformSceneNode],
      }],
    })
    expect(trackedAtV38).toBeNull()
    // A bad label or a bad track hex rejects even a v39 document.
    const badLabel = normalizeFreeformDocument({
      documentVersion: 41,
      activeSlideId: slide.id,
      slides: [{
        ...slide,
        nodes: [{ ...element, label: 'a'.repeat(PROGRESS_LABEL_MAX_CHARS + 1) } as unknown as FreeformSceneNode],
      }],
    })
    expect(badLabel).toBeNull()
    const badTrackHex = normalizeFreeformDocument({
      documentVersion: 41,
      activeSlideId: slide.id,
      slides: [{
        ...slide,
        nodes: [{ ...element, trackFill: 'grey' } as unknown as FreeformSceneNode],
      }],
    })
    expect(badTrackHex).toBeNull()
  })
})
