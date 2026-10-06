import { describe, expect, it } from 'vitest'

import {
  CHART_ACCENT_DEFAULT,
  CHART_POINTS_MAX,
  barChartGeometry,
  chartPointColors,
  formatChartValue,
  isValidChartKind,
  isValidChartSeries,
  lineChartGeometry,
  ringChartGeometry,
  tintTowardWhite,
} from '../charts'
import { createChartElement, freeformReducer } from '../document'
import { normalizeFreeformDocument } from '../sceneDocument'
import type { FreeformDocument, FreeformChartElement, FreeformSlide } from '../types'

describe('chart data validation', () => {
  it('accepts 1–12 paired labels and non-negative finite values', () => {
    expect(isValidChartSeries(['一月'], [4])).toBe(true)
    expect(isValidChartSeries(Array.from({ length: CHART_POINTS_MAX }, (_, i) => `第${i}项`), Array.from({ length: CHART_POINTS_MAX }, () => 1.5))).toBe(true)
    expect(isValidChartSeries([], [])).toBe(false)
    expect(isValidChartSeries(['a'], [4, 5])).toBe(false)
    expect(isValidChartSeries(['a', ''], [4, 5])).toBe(false)
    expect(isValidChartSeries(['a', 'b'], [4, -1])).toBe(false)
    expect(isValidChartSeries(['a', 'b'], [4, Number.NaN])).toBe(false)
    expect(isValidChartSeries(Array.from({ length: CHART_POINTS_MAX + 1 }, () => 'a'), Array.from({ length: CHART_POINTS_MAX + 1 }, () => 1))).toBe(false)
    expect(isValidChartSeries(['a'], ['4'])).toBe(false)
  })

  it('accepts the three chart kinds only', () => {
    for (const kind of ['bar', 'ring', 'line'] as const) expect(isValidChartKind(kind)).toBe(true)
    expect(isValidChartKind('pie')).toBe(false)
    expect(isValidChartKind(undefined)).toBe(false)
  })
})

describe('chart colours', () => {
  it('tints toward white and ramps ring slices from the accent', () => {
    expect(tintTowardWhite('#1d4ed8', 0)).toBe('#1d4ed8')
    expect(tintTowardWhite('#1d4ed8', 1)).toBe('#ffffff')
    const ramp = chartPointColors('ring', 4, '#1d4ed8')
    expect(ramp).toHaveLength(4)
    expect(ramp[0]).toBe('#1d4ed8')
    expect(ramp[3]).not.toBe(ramp[0])
    // Bars and lines stay single-colour.
    expect(chartPointColors('bar', 4, '#1d4ed8')).toEqual(['#1d4ed8', '#1d4ed8', '#1d4ed8', '#1d4ed8'])
  })

  it('formats integers plainly and decimals to one place', () => {
    expect(formatChartValue(4)).toBe('4')
    expect(formatChartValue(4.25)).toBe('4.3')
  })
})

describe('chart geometry', () => {
  it('bars rise from the baseline and label under and above', () => {
    const chart = barChartGeometry(400, 300, ['一', '二'], [2, 4], '#1d4ed8', { showValues: true })
    expect(chart.bars).toHaveLength(2)
    // Taller bar, taller top: the second bar's y is smaller.
    expect(chart.bars[1].y).toBeLessThan(chart.bars[0].y)
    expect(chart.bars[0].y + chart.bars[0].height).toBeCloseTo(chart.baseline.y, 5)
    // Every bar stays inside the box.
    for (const bar of chart.bars) {
      expect(bar.x).toBeGreaterThanOrEqual(0)
      expect(bar.x + bar.width).toBeLessThanOrEqual(400)
      expect(bar.y).toBeGreaterThanOrEqual(0)
    }
    expect(chart.labels.map((label) => label.text)).toEqual(['一', '二'])
    expect(chart.values.map((value) => value.text)).toEqual(['2', '4'])
    // Values are off unless asked for.
    expect(barChartGeometry(400, 300, ['一'], [2], '#1d4ed8', { showValues: false }).values).toEqual([])
  })

  it('a line spans the width with a filled area beneath', () => {
    const chart = lineChartGeometry(400, 300, ['一', '二', '三'], [1, 3, 2], '#1d4ed8', { showValues: true })
    expect(chart.points).toHaveLength(3)
    expect(chart.points[0].x).toBeCloseTo(0, 3)
    expect(chart.points[2].x).toBeCloseTo(400, 3)
    expect(chart.area).toMatch(/^M0 252 L0 180 /)
    expect(chart.dots).toHaveLength(3)
    // A single point has no line or area, just a centred dot.
    const single = lineChartGeometry(400, 300, ['一'], [2], '#1d4ed8', { showValues: false })
    expect(single.area).toBe('')
    expect(single.dots[0].x).toBeCloseTo(200, 3)
  })

  it('a ring splits proportional arcs with labels on big slices', () => {
    const chart = ringChartGeometry([1, 1, 2], '#1d4ed8', { showValues: true })
    expect(chart.segments).toHaveLength(3)
    // Half the ring belongs to the third slice; every slice shares ≥ 10%.
    expect(chart.segments.every((segment) => segment.label)).toBe(true)
    expect(chart.segments[2].label!.text).toBe('50%')
    // An all-zero series draws only the empty track.
    const empty = ringChartGeometry([0, 0], '#1d4ed8', { showValues: true })
    expect(empty.segments).toEqual([])
    // Small slices stay unlabelled even when values are asked for.
    const tiny = ringChartGeometry([95, 5], '#1d4ed8', { showValues: true })
    expect(tiny.segments[0].label).not.toBeNull()
    expect(tiny.segments[1].label).toBeNull()
  })
})

describe('chart element in the document', () => {
  const slide: FreeformSlide = {
    id: 'slide-1',
    name: '第一页',
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    nodes: [],
  }
  const document: FreeformDocument = { documentVersion: 24, activeSlideId: slide.id, slides: [slide] }

  it('creates a centred bar chart with sample data', () => {
    const element = createChartElement(slide)
    expect(element.type).toBe('chart')
    expect(element.chartKind).toBe('bar')
    expect(element.labels).toHaveLength(element.values.length)
    expect(element.accent).toBe(CHART_ACCENT_DEFAULT)
    expect(element.showValues).toBeUndefined()
  })

  it('updates the series through node/update-content', () => {
    const withChart: FreeformDocument = {
      ...document,
      slides: [{ ...slide, nodes: [createChartElement(slide)] }],
    }
    const chart = withChart.slides[0].nodes[0] as FreeformChartElement
    const patched = freeformReducer(withChart, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [chart.id], patch: { labels: ['Q1', 'Q2'], values: [3, 8] } }],
    })
    const next = patched.slides[0].nodes[0] as FreeformChartElement
    expect(next.labels).toEqual(['Q1', 'Q2'])
    expect(next.values).toEqual([3, 8])
    // A ragged series rejects the patch and keeps the element as-is.
    const rejected = freeformReducer(patched, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [chart.id], patch: { labels: ['Q1'], values: [3, 8] } }],
    })
    expect(rejected).toBe(patched)
  })

  it('switches kind, accent, and value labels through node/update-style', () => {
    const withChart: FreeformDocument = {
      ...document,
      slides: [{ ...slide, nodes: [createChartElement(slide)] }],
    }
    const chart = withChart.slides[0].nodes[0] as FreeformChartElement
    const styled = freeformReducer(withChart, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [chart.id], patch: { chartKind: 'ring', accent: '#dc2626', showValues: true } }],
    })
    const next = styled.slides[0].nodes[0] as FreeformChartElement
    expect(next.chartKind).toBe('ring')
    expect(next.accent).toBe('#dc2626')
    expect(next.showValues).toBe(true)
    // `null` restores the default accent and turns the labels off.
    const restored = freeformReducer(styled, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [chart.id], patch: { accent: null, showValues: null } }],
    })
    const back = restored.slides[0].nodes[0] as FreeformChartElement
    expect(back.accent).toBe(CHART_ACCENT_DEFAULT)
    expect('showValues' in back).toBe(false)
    // An unknown kind rejects the patch.
    const badKind = freeformReducer(restored, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [chart.id], patch: { chartKind: 'pie' as 'bar' } }],
    })
    expect(badKind).toBe(restored)
  })

  it('normalizes chart nodes at v24 and rejects them at v23', () => {
    const chartSlide = { ...slide, nodes: [createChartElement(slide)] }
    const v24 = normalizeFreeformDocument({ documentVersion: 24, activeSlideId: slide.id, slides: [chartSlide] })
    expect(v24).not.toBeNull()
    expect((v24!.slides[0].nodes[0] as FreeformChartElement).labels).toHaveLength(4)
    const v23 = normalizeFreeformDocument({ documentVersion: 23, activeSlideId: slide.id, slides: [chartSlide] })
    expect(v23).toBeNull()
  })
})
