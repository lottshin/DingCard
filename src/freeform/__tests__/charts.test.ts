import { describe, expect, it } from 'vitest'

import {
  CHART_ACCENT_DEFAULT,
  CHART_POINTS_MAX,
  CHART_SERIES_MAX,
  barChartGeometry,
  chartLabelFont,
  chartLabelLines,
  parseChartPaste,
  chartPointColors,
  formatChartValue,
  isValidChartKind,
  isValidChartSeries,
  isValidChartSeriesList,
  isValidChartSeriesName,
  legendVisible,
  lineChartGeometry,
  radarChartGeometry,
  ringChartGeometry,
  ticksVisible,
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
  it('reads pasted rows into labels and per-series values', () => {
    // Space-separated lines, one series.
    expect(parseChartPaste('一月 10\n二月 24\n\n三季度 6\n', 1)).toEqual({
      labels: ['一月', '二月', '三季度'],
      series: [[10, 24, 6]],
    })
    // A spreadsheet copy arrives tab-separated with a column per series.
    expect(parseChartPaste('一月\t10\t30\n二月\t24\t12', 2)).toEqual({
      labels: ['一月', '二月'],
      series: [[10, 24], [30, 12]],
    })
    // Commas (half and full width) and semicolons separate too, a short
    // line pads with zero, and rows past twelve drop.
    const thirteen = Array.from({ length: 13 }, (_, index) => `第${index + 1}项 1`).join('\n')
    expect(parseChartPaste(thirteen, 1)!.labels).toHaveLength(12)
    expect(parseChartPaste('一季度 3，2', 2)).toEqual({ labels: ['一季度'], series: [[3], [2]] })
    expect(parseChartPaste('一季度 3', 2)).toEqual({ labels: ['一季度'], series: [[3], [0]] })
    // Numeric labels are legitimate category names.
    expect(parseChartPaste('2023 5\n2024 8', 1)).toEqual({ labels: ['2023', '2024'], series: [[5, 8]] })
    // A missing number, a negative one, or words reject the paste.
    expect(parseChartPaste('一月', 1)).toBeNull()
    expect(parseChartPaste('一月 -3', 1)).toBeNull()
    expect(parseChartPaste('一月 abc', 1)).toBeNull()
    expect(parseChartPaste('   \n', 1)).toBeNull()
  })

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

describe('chart legend switch', () => {
  it('honours the switch across every kind (v31)', () => {
    // One named series stays legend-free by default; `true` names it.
    const single = [{ name: '今年', values: [2, 4], color: '#1d4ed8' }]
    expect(barChartGeometry(400, 300, ['一', '二'], single, { showValues: false }).legend).toEqual([])
    const forced = barChartGeometry(400, 300, ['一', '二'], single, { showValues: false, showLegend: true })
    expect(forced.legend.map((item) => item.text)).toEqual(['今年'])
    expect(lineChartGeometry(400, 300, ['一', '二'], single, { showValues: false, showLegend: true })
      .legend.map((item) => item.text)).toEqual(['今年'])
    expect(radarChartGeometry(400, 320, ['一', '二'], single, { showValues: false, showLegend: true })
      .legend.map((item) => item.text)).toEqual(['今年'])
    expect(ringChartGeometry(single, { showValues: false, showLegend: true })
      .legend.map((item) => item.text)).toEqual(['今年'])
    // `false` hides a legend two named series would otherwise earn, and the
    // plot takes the freed room back.
    const pair = [
      { name: '去年', values: [1, 1], color: '#1d4ed8' },
      { name: '今年', values: [3, 1], color: '#e11d48' },
    ]
    const auto = barChartGeometry(400, 300, ['一', '二'], pair, { showValues: false })
    const hidden = barChartGeometry(400, 300, ['一', '二'], pair, { showValues: false, showLegend: false })
    expect(auto.legend).toHaveLength(2)
    expect(hidden.legend).toEqual([])
    expect(hidden.bars[0].y).toBeLessThan(auto.bars[0].y)
    expect(ringChartGeometry(pair, { showValues: false, showLegend: false }).legend).toEqual([])
    // The switch itself stays readable: false never shows, absent needs two.
    expect(legendVisible(undefined, 2)).toBe(true)
    expect(legendVisible(undefined, 1)).toBe(false)
    expect(legendVisible(true, 1)).toBe(true)
    expect(legendVisible(false, 2)).toBe(false)
  })
})

describe('radar chart geometry', () => {
  it('webs the dimensions and polygons every series against a shared ceiling', () => {
    const chart = radarChartGeometry(400, 320, ['速度', '力量', '技巧', '心态'], [
      { name: '本期', values: [8, 5, 7, 6], color: '#1d4ed8' },
      { name: '上期', values: [4, 6, 3, 5], color: '#e11d48' },
    ], { showValues: true })
    // Four rings at quarter steps, four axes, two named legend entries.
    expect(chart.rings).toHaveLength(4)
    expect(chart.axes).toHaveLength(4)
    expect(chart.legend.map((item) => item.text)).toEqual(['本期', '上期'])
    // The first axis points straight up from the centre.
    expect(chart.axes[0].x2 - chart.axes[0].x1).toBeCloseTo(0, 0)
    expect(chart.axes[0].y2).toBeLessThan(chart.axes[0].y1)
    // Every series closes a polygon with one vertex per dimension.
    for (const entry of chart.series) {
      expect((entry.d.match(/ L/g) ?? []).length).toBe(3)
      expect(entry.d.endsWith('Z')).toBe(true)
      expect(entry.values).toHaveLength(4)
    }
    // Dimension labels sit past their axis ends, wrapped like the x axis.
    expect(chart.labels.map((label) => label.lines.join(''))).toEqual(['速度', '力量', '技巧', '心态'])
    // The nicer ceiling puts both series in the same web.
    const taller = chart.series[0].d
    const flatter = chart.series[1].d
    expect(taller).not.toEqual(flatter)
  })

  it('keeps a small dimension count readable', () => {
    const chart = radarChartGeometry(400, 320, ['甲', '乙', '丙'], [{ values: [2, 4, 6], color: '#1d4ed8' }], { showValues: false })
    expect(chart.axes).toHaveLength(3)
    expect(chart.series[0].values).toEqual([])
    expect(chart.rings).toHaveLength(4)
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
  const document: FreeformDocument = { documentVersion: 36, activeSlideId: slide.id, slides: [slide] }

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

  it('carries the radar kind at v30 and rejects it at v29', () => {
    const radared: FreeformChartElement = { ...createChartElement(slide), chartKind: 'radar' }
    const radarSlide = { ...slide, nodes: [radared as unknown as FreeformSceneNode] }
    const v30 = normalizeFreeformDocument({ documentVersion: 32, activeSlideId: slide.id, slides: [radarSlide] })
    expect(v30).not.toBeNull()
    expect((v30!.slides[0].nodes[0] as FreeformChartElement).chartKind).toBe('radar')
    const v29 = normalizeFreeformDocument({ documentVersion: 29, activeSlideId: slide.id, slides: [radarSlide] })
    expect(v29).toBeNull()
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
      { documentVersion: 36, activeSlideId: slide.id, slides: [{ ...slide, nodes: [base] }] },
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

  it('carries the legend switch at v31 and rejects it at v30', () => {
    const switched: FreeformChartElement = { ...createChartElement(slide), showLegend: false }
    const switchedSlide = { ...slide, nodes: [switched as unknown as FreeformSceneNode] }
    const v31 = normalizeFreeformDocument({ documentVersion: 32, activeSlideId: slide.id, slides: [switchedSlide] })
    expect(v31).not.toBeNull()
    expect((v31!.slides[0].nodes[0] as FreeformChartElement).showLegend).toBe(false)
    const v30 = normalizeFreeformDocument({ documentVersion: 30, activeSlideId: slide.id, slides: [switchedSlide] })
    expect(v30).toBeNull()
    // The style patch sets all three states; null restores the automatic rule.
    const base = createChartElement(slide)
    const hidden = freeformReducer(
      { documentVersion: 36, activeSlideId: slide.id, slides: [{ ...slide, nodes: [base] }] },
      { type: 'node/update-style', slideId: slide.id, updates: [{ path: [base.id], patch: { showLegend: false } }] },
    )
    expect((hidden.slides[0].nodes[0] as FreeformChartElement).showLegend).toBe(false)
    const shown = freeformReducer(hidden, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { showLegend: true } }],
    })
    expect((shown.slides[0].nodes[0] as FreeformChartElement).showLegend).toBe(true)
    const automatic = freeformReducer(shown, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { showLegend: null } }],
    })
    expect('showLegend' in (automatic.slides[0].nodes[0] as FreeformChartElement)).toBe(false)
    // A non-boolean value rejects the patch.
    const bad = freeformReducer(automatic, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { showLegend: 'no' as unknown as boolean } }],
    })
    expect(bad).toBe(automatic)
  })

  it('hides the y-axis ticks at v33 and rejects the switch at v32', () => {
    // Ticks stay drawn unless explicitly turned off; the plot then runs to
    // the left edge with no grid lines or tick labels.
    expect(ticksVisible(undefined)).toBe(true)
    expect(ticksVisible(true)).toBe(true)
    expect(ticksVisible(false)).toBe(false)

    const series = [{ name: '今年', values: [2, 4], color: '#1d4ed8' }]
    const drawn = barChartGeometry(400, 300, ['一', '二'], series, { showValues: false })
    expect(drawn.axis).not.toBeNull()
    expect(drawn.axis!.ticks).toHaveLength(2)
    expect(drawn.axis!.leftPad).toBeGreaterThan(0)
    const cleared = barChartGeometry(400, 300, ['一', '二'], series, { showValues: false, showTicks: false })
    expect(cleared.axis!.ticks).toEqual([])
    expect(cleared.axis!.leftPad).toBe(0)
    expect(cleared.bars).toHaveLength(2)
    const lineCleared = lineChartGeometry(400, 300, ['一', '二'], series, { showValues: false, showTicks: false })
    expect(lineCleared.axis.ticks).toEqual([])
    expect(lineCleared.axis.leftPad).toBe(0)
    // Percent bars tick percentages; the switch clears those too.
    const percentCleared = barChartGeometry(400, 300, ['一', '二'], series, {
      showValues: false, mode: 'percent', showTicks: false,
    })
    expect(percentCleared.axis!.ticks).toEqual([])

    const switched: FreeformChartElement = { ...createChartElement(slide), showTicks: false }
    const switchedSlide = { ...slide, nodes: [switched as unknown as FreeformSceneNode] }
    const v33 = normalizeFreeformDocument({ documentVersion: 33, activeSlideId: slide.id, slides: [switchedSlide] })
    expect(v33).not.toBeNull()
    expect((v33!.slides[0].nodes[0] as FreeformChartElement).showTicks).toBe(false)
    const v32 = normalizeFreeformDocument({ documentVersion: 32, activeSlideId: slide.id, slides: [switchedSlide] })
    expect(v32).toBeNull()

    // The style patch hides and restores; null removes the override again.
    const base = createChartElement(slide)
    const hidden = freeformReducer(
      { documentVersion: 36, activeSlideId: slide.id, slides: [{ ...slide, nodes: [base] }] },
      { type: 'node/update-style', slideId: slide.id, updates: [{ path: [base.id], patch: { showTicks: false } }] },
    )
    expect((hidden.slides[0].nodes[0] as FreeformChartElement).showTicks).toBe(false)
    const restored = freeformReducer(hidden, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { showTicks: null } }],
    })
    expect('showTicks' in (restored.slides[0].nodes[0] as FreeformChartElement)).toBe(false)
    // A non-boolean value rejects the patch.
    const bad = freeformReducer(restored, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { showTicks: 'no' as unknown as boolean } }],
    })
    expect(bad).toBe(restored)
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
