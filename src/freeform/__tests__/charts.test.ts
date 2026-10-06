import { describe, expect, it } from 'vitest'

import {
  CHART_ACCENT_DEFAULT,
  CHART_POINTS_MAX,
  CHART_SERIES_MAX,
  barChartGeometry,
  chartLabelFont,
  chartLabelLines,
  chartPointColors,
  formatChartValue,
  isValidChartKind,
  isValidChartSeries,
  isValidChartSeriesList,
  isValidChartSeriesName,
  lineChartGeometry,
  ringChartGeometry,
  tintTowardWhite,
} from '../charts'
import { createChartElement, freeformReducer } from '../document'
import { normalizeFreeformDocument } from '../sceneDocument'
import type { FreeformDocument, FreeformChartElement, FreeformChartSeries, FreeformSceneNode, FreeformSlide } from '../types'

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

  it('takes one to three series, each one value per label', () => {
    const series = (count: number) => Array.from({ length: count }, () => ({ values: [1, 2], color: '#1d4ed8' }))
    expect(isValidChartSeriesList(series(1), 2)).toBe(true)
    expect(isValidChartSeriesList(series(CHART_SERIES_MAX), 2)).toBe(true)
    expect(isValidChartSeriesList(series(CHART_SERIES_MAX + 1), 2)).toBe(false)
    expect(isValidChartSeriesList([], 2)).toBe(false)
    // A series with the wrong point count, a bad colour or a stray key rejects.
    expect(isValidChartSeriesList([{ values: [1], color: '#1d4ed8' }], 2)).toBe(false)
    expect(isValidChartSeriesList([{ values: [1, 2], color: 'blue' }], 2)).toBe(false)
    expect(isValidChartSeriesList([{ values: [1, 2], color: '#1d4ed8', extra: 1 }], 2)).toBe(false)
    expect(isValidChartSeriesList([{ values: [1, 2], color: '#1d4ed8', name: ' ' }], 2)).toBe(false)
    expect(isValidChartSeriesList([{ values: [1, 2], color: '#1d4ed8', name: '销量' }], 2)).toBe(true)
    expect(isValidChartSeriesName('')).toBe(false)
    expect(isValidChartSeriesName('十二个字符以内才行哦哦哦哦哦哦')).toBe(false)
  })
})

describe('chart colours', () => {
  it('tints toward white and ramps ring slices from the series colour', () => {
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
  it('wraps a category label that outgrows its slot into two lines', () => {
    const font = chartLabelFont(300)
    // A label that fits stays whole.
    expect(chartLabelLines('一月', 100, font)).toEqual(['一月'])
    // A wide CJK label splits in half near the middle.
    expect(chartLabelLines('第一季度营收小结', 100, font)).toHaveLength(2)
    const [first, second] = chartLabelLines('第一季度营收小结', 100, font)
    expect(first + second).toBe('第一季度营收小结')
    expect(Math.abs(first.length - second.length)).toBeLessThanOrEqual(1)
    // A separator near the middle wins over the exact half.
    expect(chartLabelLines('华东 · 华南大区', 60, font)).toEqual(['华东 ·', '华南大区'])
    // Two lines is the limit: a very long label never becomes three.
    expect(chartLabelLines('这是一个特别特别特别特别长的类目名称', 40, font)).toHaveLength(2)
  })

  it('bars rise from the baseline and label under and above', () => {
    const chart = barChartGeometry(400, 300, ['一', '二'], [{ values: [2, 4], color: '#1d4ed8' }], { showValues: true })
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
    expect(chart.labels.map((label) => label.lines.join(''))).toEqual(['一', '二'])
    // Short labels stay on one line.
    expect(chart.labels.every((label) => label.lines.length === 1)).toBe(true)
    expect(chart.values.map((value) => value.text)).toEqual(['2', '4'])
    // Values are off unless asked for.
    expect(barChartGeometry(400, 300, ['一'], [{ values: [2], color: '#1d4ed8' }], { showValues: false }).values).toEqual([])
  })

  it('two series group their bars side by side and name a legend', () => {
    const chart = barChartGeometry(400, 300, ['一', '二'], [
      { name: '去年', values: [2, 4], color: '#1d4ed8' },
      { name: '今年', values: [3, 3], color: '#e11d48' },
    ], { showValues: false })
    expect(chart.bars).toHaveLength(4)
    // Bars come series by series; within a category both series share the slot.
    expect(chart.bars[0].color).toBe('#1d4ed8')
    expect(chart.bars[2].color).toBe('#e11d48')
    expect(chart.bars[0].x).toBeLessThan(chart.bars[1].x)
    expect(chart.bars[2].x).toBeLessThan(chart.bars[3].x)
    // The second series' first bar sits beside the first series', inside the
    // opening category slot (the canvas is 400 wide, two labels: 200 a slot).
    expect(chart.bars[2].x).toBeGreaterThan(chart.bars[0].x)
    expect(chart.bars[2].x + chart.bars[2].width).toBeLessThanOrEqual(200)
    expect(chart.bars[3].x + chart.bars[3].width).toBeLessThanOrEqual(400)
    // The legend names both series and the plot keeps room for it.
    expect(chart.legend.map((item) => item.text)).toEqual(['去年', '今年'])
    expect(chart.bars.every((bar) => bar.y >= chart.legend[0].y)).toBe(true)
    // One unnamed series stays legend-free.
    const single = barChartGeometry(400, 300, ['一'], [{ values: [2], color: '#1d4ed8' }], { showValues: false })
    expect(single.legend).toEqual([])
  })

  it('a line spans the plot with a filled area beneath and axis ticks', () => {
    const chart = lineChartGeometry(400, 300, ['一', '二', '三'], [{ values: [1, 3, 2], color: '#1d4ed8' }], { showValues: true })
    expect(chart.lines).toHaveLength(1)
    const line = chart.lines[0]
    expect(line.points).toHaveLength(3)
    // The tick labels take the left edge: the slope starts after them and
    // still ends at the right edge.
    expect(line.points[0].x).toBeGreaterThan(0)
    expect(line.points[0].x).toBeLessThan(400 * 0.2)
    expect(line.points[2].x).toBeCloseTo(400, 3)
    expect(line.area).toMatch(new RegExp(`^M${chart.axis.leftPad} 252 L${chart.axis.leftPad} 198 `))
    expect(line.dots).toHaveLength(3)
    expect(line.values.map((value) => value.text)).toEqual(['1', '3', '2'])
    // The axis rounds the top to a nice ceiling (3 -> 4) and ticks half way.
    expect(chart.axis.max).toBe(4)
    expect(chart.axis.ticks.map((tick) => tick.text)).toEqual(['4', '2'])
    // A single point has no line or area, just a centred dot in the plot.
    const single = lineChartGeometry(400, 300, ['一'], [{ values: [2], color: '#1d4ed8' }], { showValues: false })
    expect(single.lines[0].area).toBe('')
    expect(single.lines[0].dots[0].x).toBeGreaterThan(single.axis.leftPad)
    expect(single.lines[0].dots[0].x).toBeLessThan(400)
  })

  it('stacked bars pile one column per category and total it', () => {
    const chart = barChartGeometry(400, 300, ['一', '二'], [
      { name: '甲', values: [2, 1], color: '#1d4ed8' },
      { name: '乙', values: [1, 3], color: '#e11d48' },
    ], { showValues: true, mode: 'stacked' })
    // Bars come column by column: the first two segments share one column.
    expect(chart.bars).toHaveLength(4)
    expect(chart.bars[0].x).toBeCloseTo(chart.bars[1].x, 3)
    expect(chart.bars[2].x).toBeCloseTo(chart.bars[3].x, 3)
    expect(chart.bars[2].x).toBeGreaterThan(chart.bars[0].x)
    // The first segment sits on the baseline; the second stacks on its top.
    expect(chart.bars[0].y + chart.bars[0].height).toBeCloseTo(chart.baseline.y, 5)
    expect(chart.bars[1].y + chart.bars[1].height).toBeCloseTo(chart.bars[0].y, 5)
    // The totals label each column: 3 and 4, against a nice ceiling of 4.
    expect(chart.values.map((value) => value.text)).toEqual(['3', '4'])
    expect(chart.axis!.max).toBe(4)
  })

  it('percent bars fill the plot and label big shares', () => {
    const chart = barChartGeometry(400, 300, ['一'], [
      { name: '甲', values: [3], color: '#1d4ed8' },
      { name: '乙', values: [1], color: '#e11d48' },
    ], { showValues: true, mode: 'percent' })
    // Two segments, one column at full plot height.
    expect(chart.bars).toHaveLength(2)
    expect(chart.bars[0].y + chart.bars[0].height).toBeCloseTo(chart.baseline.y, 5)
    expect(chart.bars[0].height).toBeCloseTo(chart.bars[1].height * 3, 3)
    expect(chart.percents.map((percent) => percent.text)).toEqual(['75%', '25%'])
    // The axis ticks in percentages; totals stay unlabelled.
    expect(chart.axis!.ticks.map((tick) => tick.text)).toEqual(['100%', '50%'])
    expect(chart.values).toEqual([])
  })

  it('every series keeps its own slope and legend entry', () => {
    const chart = lineChartGeometry(400, 300, ['一', '二'], [
      { name: '甲', values: [1, 3], color: '#1d4ed8' },
      { name: '乙', values: [3, 1], color: '#e11d48' },
    ], { showValues: false })
    expect(chart.lines).toHaveLength(2)
    expect(chart.lines[0].color).toBe('#1d4ed8')
    expect(chart.lines[1].color).toBe('#e11d48')
    // Both slopes share the same scale: the same value lands at the same y.
    expect(chart.lines[0].points[0].y).toBeCloseTo(chart.lines[1].points[1].y, 5)
    expect(chart.legend.map((item) => item.text)).toEqual(['甲', '乙'])
  })

  it('a ring splits proportional arcs with labels on big slices', () => {
    const chart = ringChartGeometry([{ values: [1, 1, 2], color: '#1d4ed8' }], { showValues: true })
    expect(chart.segments).toHaveLength(3)
    // Half the ring belongs to the third slice; every slice shares ≥ 10%.
    expect(chart.segments.every((segment) => segment.label)).toBe(true)
    expect(chart.segments[2].label!.text).toBe('50%')
    // An all-zero series draws only the empty track.
    const empty = ringChartGeometry([{ values: [0, 0], color: '#1d4ed8' }], { showValues: true })
    expect(empty.segments).toEqual([])
    // Small slices stay unlabelled even when values are asked for.
    const tiny = ringChartGeometry([{ values: [95, 5], color: '#1d4ed8' }], { showValues: true })
    expect(tiny.segments[0].label).not.toBeNull()
    expect(tiny.segments[1].label).toBeNull()
  })

  it('two series nest a second ring inside the first', () => {
    const chart = ringChartGeometry([
      { name: '去年', values: [1, 1], color: '#1d4ed8' },
      { name: '今年', values: [3, 1], color: '#e11d48' },
    ], { showValues: true })
    // Both rings split their own shares: 2 + 4 segments.
    expect(chart.segments).toHaveLength(4)
    expect(chart.segments[0].label!.text).toBe('50%')
    expect(chart.segments[2].label!.text).toBe('75%')
    expect(chart.legend.map((item) => item.text)).toEqual(['去年', '今年'])
    // The inner ring's path reaches closer to the centre than the outer's.
    const ys = chart.segments.map((segment) => Number.parseFloat(segment.d.split(' ')[segment.d.split(' ').length - 2]))
    expect(Math.min(...ys)).toBeGreaterThan(0)
    expect(chart.track).toBe(tintTowardWhite('#1d4ed8', 0.82))
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
  const document: FreeformDocument = { documentVersion: 29, activeSlideId: slide.id, slides: [slide] }

  it('creates a centred bar chart with one sample series', () => {
    const element = createChartElement(slide)
    expect(element.type).toBe('chart')
    expect(element.chartKind).toBe('bar')
    expect(element.series).toHaveLength(1)
    expect(element.series[0].values).toHaveLength(element.labels.length)
    expect(element.series[0].color).toBe(CHART_ACCENT_DEFAULT)
    expect(element.showValues).toBeUndefined()
  })

  it('updates labels and series through node/update-content', () => {
    const withChart: FreeformDocument = {
      ...document,
      slides: [{ ...slide, nodes: [createChartElement(slide)] }],
    }
    const chart = withChart.slides[0].nodes[0] as FreeformChartElement
    const patched = freeformReducer(withChart, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{
        path: [chart.id],
        patch: {
          labels: ['Q1', 'Q2'],
          series: [
            { name: '去年', values: [3, 8], color: '#1d4ed8' },
            { name: '今年', values: [4, 9], color: '#e11d48' },
          ],
        },
      }],
    })
    const next = patched.slides[0].nodes[0] as FreeformChartElement
    expect(next.labels).toEqual(['Q1', 'Q2'])
    expect(next.series.map((entry) => entry.values)).toEqual([[3, 8], [4, 9]])
    // A ragged series rejects the patch and keeps the element as-is.
    const rejected = freeformReducer(patched, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [chart.id], patch: { labels: ['Q1'], series: next.series } }],
    })
    expect(rejected).toBe(patched)
    // Labels alone still replace, against the series the element carries.
    const relabelled = freeformReducer(patched, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [chart.id], patch: { labels: ['一季度', '二季度'] } }],
    })
    expect((relabelled.slides[0].nodes[0] as FreeformChartElement).labels).toEqual(['一季度', '二季度'])
  })

  it('switches kind and value labels, and recolours every series through accent', () => {
    const withChart: FreeformDocument = {
      ...document,
      slides: [{
        ...slide,
        nodes: [{
          ...createChartElement(slide),
          series: [
            { name: '去年', values: [1, 2, 3, 4], color: '#1d4ed8' },
            { name: '今年', values: [2, 3, 4, 5], color: '#e11d48' },
          ],
        }],
      }],
    }
    const chart = withChart.slides[0].nodes[0] as FreeformChartElement
    const styled = freeformReducer(withChart, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [chart.id], patch: { chartKind: 'ring', accent: '#dc2626', showValues: true } }],
    })
    const next = styled.slides[0].nodes[0] as FreeformChartElement
    expect(next.chartKind).toBe('ring')
    expect(next.showValues).toBe(true)
    // The v24 accent habit recolours every series at once.
    expect(next.series.every((entry) => entry.color === '#dc2626')).toBe(true)
    // `null` restores the default blue on each and turns the labels off.
    const restored = freeformReducer(styled, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [chart.id], patch: { accent: null, showValues: null } }],
    })
    const back = restored.slides[0].nodes[0] as FreeformChartElement
    expect(back.series.every((entry) => entry.color === CHART_ACCENT_DEFAULT)).toBe(true)
    expect('showValues' in back).toBe(false)
    // An unknown kind rejects the patch.
    const badKind = freeformReducer(restored, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [chart.id], patch: { chartKind: 'pie' as 'bar' } }],
    })
    expect(badKind).toBe(restored)
  })

  /** A chart as v24–v25 wrote it: values and colour on the element itself. */
  function legacyChart(): FreeformChartElement {
    const { series: _series, ...rest } = createChartElement(slide)
    return {
      ...rest,
      values: [4, 7, 5, 9],
      accent: '#b45309',
    } as unknown as FreeformChartElement
  }

  it('normalizes chart nodes at v24 and rejects them at v23', () => {
    const chartSlide = { ...slide, nodes: [legacyChart() as unknown as FreeformSceneNode] }
    const v24 = normalizeFreeformDocument({ documentVersion: 24, activeSlideId: slide.id, slides: [chartSlide] })
    expect(v24).not.toBeNull()
    expect((v24!.slides[0].nodes[0] as FreeformChartElement).labels).toHaveLength(4)
    const v23 = normalizeFreeformDocument({ documentVersion: 23, activeSlideId: slide.id, slides: [chartSlide] })
    expect(v23).toBeNull()
  })

  it('carries bar stacking at v27 and rejects it at v26', () => {
    const stacked: FreeformChartElement = { ...createChartElement(slide), barMode: 'percent' }
    const stackedSlide = { ...slide, nodes: [stacked as unknown as FreeformSceneNode] }
    const v27 = normalizeFreeformDocument({ documentVersion: 27, activeSlideId: slide.id, slides: [stackedSlide] })
    expect(v27).not.toBeNull()
    expect((v27!.slides[0].nodes[0] as FreeformChartElement).barMode).toBe('percent')
    const v26 = normalizeFreeformDocument({ documentVersion: 26, activeSlideId: slide.id, slides: [stackedSlide] })
    expect(v26).toBeNull()
    // The style patch switches modes; null restores grouped by removal.
    const base = createChartElement(slide)
    const withMode = freeformReducer(
      { documentVersion: 29, activeSlideId: slide.id, slides: [{ ...slide, nodes: [base] }] },
      { type: 'node/update-style', slideId: slide.id, updates: [{ path: [base.id], patch: { barMode: 'stacked' } }] },
    )
    expect((withMode.slides[0].nodes[0] as FreeformChartElement).barMode).toBe('stacked')
    const grouped = freeformReducer(withMode, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { barMode: null } }],
    })
    expect('barMode' in (grouped.slides[0].nodes[0] as FreeformChartElement)).toBe(false)
  })

  it('migrates a v24 chart onto one series and takes three at v26', () => {
    // A v24 document carries its values and accent on the element.
    const legacySlide = { ...slide, nodes: [legacyChart() as unknown as FreeformSceneNode] }
    const migrated = normalizeFreeformDocument({ documentVersion: 24, activeSlideId: slide.id, slides: [legacySlide] })
    expect(migrated).not.toBeNull()
    const upgraded = migrated!.slides[0].nodes[0] as FreeformChartElement
    expect(upgraded.series).toHaveLength(1)
    expect(upgraded.series[0]).toEqual({ values: [4, 7, 5, 9], color: '#b45309' } satisfies FreeformChartSeries)

    // A v26 document carries its series and rejects the v24 fields.
    const seriesChart: FreeformChartElement = {
      ...createChartElement(slide),
      series: [
        { name: '去年', values: [1, 2, 3, 4], color: '#1d4ed8' },
        { name: '今年', values: [2, 3, 4, 5], color: '#e11d48' },
        { values: [3, 4, 5, 6], color: '#f59e0b' },
      ],
    }
    const current = normalizeFreeformDocument({
      documentVersion: 26,
      activeSlideId: slide.id,
      slides: [{ ...slide, nodes: [seriesChart] }],
    })
    expect(current).not.toBeNull()
    expect((current!.slides[0].nodes[0] as FreeformChartElement).series).toHaveLength(3)
    const tooMany = normalizeFreeformDocument({
      documentVersion: 26,
      activeSlideId: slide.id,
      slides: [{
        ...slide,
        nodes: [{
          ...seriesChart,
          series: [...seriesChart.series, { values: [1, 2, 3, 4], color: '#111111' }],
        }],
      }],
    })
    expect(tooMany).toBeNull()
  })
})
