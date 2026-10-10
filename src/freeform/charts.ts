// Chart element support: data validation and the pure geometry the view
// renders as SVG — bars, a ring, or a line, from one to three labelled
// series. Free of any package dependency, so the document modules (and the
// server-side MCP renderer bundling them) import it safely.

import type { FreeformChartElement, FreeformChartSeries } from './types'

export type ChartKind = FreeformChartElement['chartKind']
export type ChartSeries = FreeformChartSeries

/** One labelled series; 1–12 points keeps the small-card charts legible. */
export const CHART_POINTS_MAX = 12
export const CHART_LABEL_MAX_LENGTH = 24
export const CHART_ACCENT_DEFAULT = '#1d4ed8'
/** Up to three series share a chart; more would need a bigger canvas. */
export const CHART_SERIES_MAX = 3
export const CHART_SERIES_NAME_MAX_LENGTH = 12

/** How a bar chart stacks its series (v27); absent means grouped. */
export type ChartBarMode = NonNullable<FreeformChartElement['barMode']>

export function isValidChartBarMode(value: unknown): value is ChartBarMode {
  return value === 'grouped' || value === 'stacked' || value === 'percent'
}

export function isValidChartKind(value: unknown): value is ChartKind {
  return value === 'bar' || value === 'ring' || value === 'line' || value === 'radar'
}

/** Labels: 1–24 non-blank characters each. */
export function isValidChartLabel(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= CHART_LABEL_MAX_LENGTH
}

/** Values: finite and non-negative; decimals are fine. */
export function isValidChartValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** Series names: 1–12 non-blank characters, so legends stay short. */
export function isValidChartSeriesName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= CHART_SERIES_NAME_MAX_LENGTH
}

/** The largest chart text: category labels on a 1080px card. */
export const CHART_FONT_SIZE_MAX = 28

/**
 * The size category labels render at (the view and the layout share it): as
 * large as the chart's height allows (up to CHART_FONT_SIZE_MAX), shrinking
 * only as far as every label fits its slot in two lines (bar, line) or keeps
 * clear of the web (radar). When nothing larger fits, the 15px-capped size
 * charts always had.
 */
export function chartLabelFont(
  height: number,
  width?: number,
  labels?: readonly string[],
  kind: 'bar' | 'line' | 'radar' = 'bar',
): number {
  const largest = Math.max(9, Math.min(height * 0.062, CHART_FONT_SIZE_MAX))
  const floor = Math.max(9, Math.min(height * 0.062, 15))
  if (width === undefined || !labels || labels.length === 0) return floor
  const fits = (fontSize: number) => {
    if (kind === 'radar') return labels.every((text) => chartLabelWidth(text, fontSize) <= width * 0.28)
    const slot = (width / labels.length) * 0.94
    return labels.every((text) => {
      const lines = chartLabelLines(text, slot, fontSize)
      return lines.length <= 2 && lines.every((line) => chartLabelWidth(line, fontSize) <= slot)
    })
  }
  for (let fontSize = Math.floor(largest); fontSize > floor; fontSize -= 1) {
    if (fits(fontSize)) return fontSize
  }
  return floor
}

/** The y-axis tick text size; the view and the axis padding share it. */
export function chartTickFont(height: number): number {
  return Math.max(8, Math.min(height * 0.055, 22))
}

/** A label's rough width: CJK glyphs a full em, the rest a bit over half. */
function chartLabelWidth(text: string, fontSize: number): number {
  let units = 0
  for (const char of text) units += char.charCodeAt(0) > 0x2e7f ? 1 : 0.56
  return units * fontSize
}

/**
 * Split a category label that is wider than its slot into two lines, at a
 * word boundary near the middle when one exists, otherwise in half. Labels
 * that already fit stay on one line.
 */
export function chartLabelLines(text: string, maxWidth: number, fontSize: number): string[] {
  if (!text || chartLabelWidth(text, fontSize) <= maxWidth) return [text]
  const middle = Math.ceil(text.length / 2)
  const boundaries = new Set([' ', '·', '・', '，', '、', '：', ':', '—', '-'])
  let split = middle
  for (let distance = 0; distance < middle; distance += 1) {
    const before = middle - distance
    const after = middle + distance
    if (before > 0 && boundaries.has(text[before - 1])) { split = before; break }
    if (after > 0 && after < text.length && boundaries.has(text[after - 1])) { split = after; break }
  }
  const first = text.slice(0, split).trim()
  const rest = text.slice(split).trim()
  return first && rest ? [first, rest] : [text]
}

/**
 * Read pasted rows as chart data: every non-empty line is a label followed
 * by one number per series, separated by tabs, commas, semicolons, or spaces
 * (a spreadsheet copy arrives tab-separated). Rows past twelve are dropped;
 * a short line pads its missing numbers with zero. A blank label or an
 * unparsable (or negative) number rejects the whole paste.
 */
export function parseChartPaste(
  text: string,
  seriesCount: number,
): { labels: string[]; series: number[][] } | null {
  const count = Math.max(1, Math.min(seriesCount, CHART_SERIES_MAX))
  const rows: Array<{ label: string; values: number[] }> = []
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (rows.length >= CHART_POINTS_MAX) break
    const cells = trimmed.split(/[\t,，;；]+|\s+/).filter((cell) => cell.length > 0)
    const label = cells[0] ?? ''
    const values = cells.slice(1, 1 + count).map(Number)
    if (!isValidChartLabel(label) || values.length === 0) return null
    if (values.some((value) => !isValidChartValue(value))) return null
    rows.push({ label, values: Array.from({ length: count }, (_, index) => values[index] ?? 0) })
  }
  if (rows.length === 0) return null
  return {
    labels: rows.map((row) => row.label),
    series: Array.from({ length: count }, (_, seriesIndex) => rows.map((row) => row.values[seriesIndex])),
  }
}

export function isValidChartSeries(labels: unknown, values: unknown): boolean {
  if (!Array.isArray(labels) || !Array.isArray(values)) return false
  if (labels.length === 0 || labels.length > CHART_POINTS_MAX) return false
  if (labels.length !== values.length) return false
  return labels.every(isValidChartLabel) && values.every(isValidChartValue)
}

/** The series list as the element carries it (v26): 1–3 coloured series,
 *  each with one value per category label. */
export function isValidChartSeriesList(series: unknown, labelCount: number): series is FreeformChartSeries[] {
  if (!Array.isArray(series) || series.length === 0 || series.length > CHART_SERIES_MAX) return false
  return series.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false
    const record = entry as Record<string, unknown>
    const keys = Object.keys(record)
    const nameOk = !('name' in record) || isValidChartSeriesName(record.name)
    const valuesOk = Array.isArray(record.values)
      && record.values.length === labelCount
      && record.values.every(isValidChartValue)
    const colorOk = typeof record.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(record.color)
    const keyOk = keys.every((key) => key === 'name' || key === 'values' || key === 'color')
    return nameOk && valuesOk && colorOk && keyOk
  })
}

/** Mixes a hex colour toward white; 0 stays, 1 is white. */
export function tintTowardWhite(hex: string, amount: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  const channel = (value: number) => Math.round(value + (255 - value) * amount)
  return `#${[channel(r), channel(g), channel(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** The per-point colours within one series: the colour alone, or a ring ramp of tints. */
export function chartPointColors(kind: ChartKind, count: number, color: string): string[] {
  if (kind !== 'ring' || count <= 1) return Array.from({ length: count }, () => color)
  return Array.from({ length: count }, (_, index) => tintTowardWhite(color, index * (0.78 / Math.max(1, count - 1))))
}

/** The smallest round ceiling at least `max`: 1, 2, 4, 5 or 8 × 10^k. */
export function niceChartCeiling(max: number): number {
  if (!(max > 0)) return 1
  const power = 10 ** Math.floor(Math.log(max) / Math.LN10)
  for (const step of [1, 2, 4, 5, 8, 10]) {
    if (step * power >= max - 1e-9) return step * power
  }
  return 10 * power
}

/** The y-axis a bar or line chart draws against: a round ceiling, grid lines
 *  at 0, half and the top, each with its tick text. */
export interface ChartAxis {
  /** The value at the top grid line. */
  max: number
  /** Grid line positions with their tick labels (the 0 line is the baseline). */
  ticks: Array<{ y: number; text: string }>
  /** The room the tick labels take off the plot's left edge. */
  leftPad: number
}

function chartAxis(
  height: number,
  topPad: number,
  bottomPad: number,
  max: number,
  showTicks?: boolean,
): ChartAxis {
  const ceiling = niceChartCeiling(max)
  // Ticks off (v33) still needs the ceiling for scaling, but the plot then
  // runs to the left edge: no grid lines, no tick labels, no left pad.
  if (!ticksVisible(showTicks)) {
    return { max: ceiling, ticks: [], leftPad: 0 }
  }
  const plotHeight = Math.max(1, height - topPad - bottomPad)
  const tickFont = chartTickFont(height)
  const yAt = (value: number) => height - bottomPad - (value / ceiling) * plotHeight
  return {
    max: ceiling,
    ticks: [ceiling, ceiling / 2].map((value) => ({
      y: yAt(value),
      text: formatChartValue(value),
    })),
    leftPad: Math.ceil(tickFont * 2.6),
  }
}

/** One legend entry: a colour chip beside its series' name. */
export interface ChartLegendItem {
  x: number
  y: number
  color: string
  text: string
}

/** A chart's own series, as the geometry helpers take them. */
export type ChartSeriesInput = Pick<FreeformChartSeries, 'values' | 'color'> & Partial<Pick<FreeformChartSeries, 'name'>>

interface LegendLayout {
  items: ChartLegendItem[]
  /** The height the legend row takes off the plot, 0 when it stays hidden. */
  height: number
}

/** The legend rule (v31): `false` never shows one, `true` shows it from the
 *  first named series, absent keeps the automatic behaviour — a legend once
 *  two series or more carry names worth telling apart. */
export function legendVisible(
  showLegend: boolean | undefined,
  namedCount: number,
): boolean {
  if (showLegend === false) return false
  if (showLegend === true) return namedCount >= 1
  return namedCount >= 2
}

/** The axis-tick rule (v33): ticks stay drawn unless explicitly turned off —
 *  absent and `true` both keep the grid lines and tick labels. */
export function ticksVisible(showTicks: boolean | undefined): boolean {
  return showTicks !== false
}

/** The legend row across the top: one chip and name per named series. */
function legendLayout(
  width: number,
  height: number,
  series: readonly ChartSeriesInput[],
  showLegend?: boolean,
): LegendLayout {
  const named = series.filter((entry) => (entry.name ?? '').trim().length > 0)
  if (!legendVisible(showLegend, named.length)) return { items: [], height: 0 }
  const texts = named.map((entry) => entry.name!.trim())
  // Fit the widest row: each item is a chip plus its text, in one line.
  const fontSize = Math.max(8, Math.min(
    height * 0.06,
    width / (texts.reduce((sum, text) => sum + text.length, 0) * 0.62 + named.length * 2.2),
    CHART_FONT_SIZE_MAX,
  ))
  const chip = Math.max(6, fontSize * 0.62)
  const gap = fontSize * 0.9
  const itemWidths = texts.map((text) => chip + fontSize * 0.34 + text.length * fontSize * 0.62 + gap)
  const rowWidth = itemWidths.reduce((sum, item) => sum + item, 0) - gap
  let x = Math.max(0, (width - rowWidth) / 2)
  const y = fontSize
  const items = named.map((entry, index) => {
    const item = { x, y, color: entry.color, text: texts[index] }
    x += itemWidths[index]
    return item
  })
  return { items, height: fontSize * 2.4 }
}

export interface ChartBarGeometry {
  /** Bar rectangles, in view-box px; grouped side by side, or stacked into one column. */
  bars: Array<{ x: number; y: number; width: number; height: number; color: string }>
  /** The zero line under the bars. */
  baseline: { y: number }
  /** Category labels centred under each group, wrapped when too wide. */
  labels: Array<{ x: number; y: number; lines: string[] }>
  /** Value labels: above each bar or column total (only when asked for). */
  values: Array<{ x: number; y: number; text: string }>
  /** Percentage labels inside stacked segments (percent mode, only when asked for). */
  percents: Array<{ x: number; y: number; text: string }>
  /** The y-axis grid lines and ticks (bar and line charts draw them). */
  axis: ChartAxis | null
  legend: ChartLegendItem[]
}

/** A bar chart: bars rise from a baseline — grouped side by side per category,
 *  stacked into one column per category, or stacked as shares of 100%. */
export function barChartGeometry(
  width: number,
  height: number,
  labels: readonly string[],
  series: readonly ChartSeriesInput[],
  options: { showValues: boolean; mode?: ChartBarMode; showLegend?: boolean; showTicks?: boolean },
): ChartBarGeometry {
  const mode = options.mode ?? 'grouped'
  const legend = legendLayout(width, height, series, options.showLegend)
  const topPad = height * 0.1 + legend.height
  const bottomPad = height * 0.16
  const plotHeight = Math.max(1, height - topPad - bottomPad)
  const labelFontSize = Math.min(height * 0.07, width / (labels.length * 4), CHART_FONT_SIZE_MAX)
  const totals = labels.map((_, index) => series.reduce((sum, entry) => sum + (entry.values[index] ?? 0), 0))
  const max = mode === 'percent'
    ? 1
    : mode === 'stacked'
      ? Math.max(...totals, 0)
      : Math.max(...series.flatMap((entry) => entry.values), 0)
  const axis = mode === 'percent'
    ? {
      ...chartAxis(height, topPad, bottomPad, 0, options.showTicks),
      ticks: chartAxis(height, topPad, bottomPad, 0, options.showTicks).ticks.map((tick, index) => (
        { ...tick, text: index === 0 ? '100%' : '50%' }
      )),
    }
    : chartAxis(height, topPad, bottomPad, max, options.showTicks)
  const ceiling = mode === 'percent' ? 1 : axis.max
  const scale = ceiling > 0 ? plotHeight / ceiling : 0
  const baselineY = height - bottomPad
  const plotWidth = width - axis.leftPad
  const slot = plotWidth / labels.length
  const bars: ChartBarGeometry['bars'] = []
  const values: ChartBarGeometry['values'] = []
  const percents: ChartBarGeometry['percents'] = []

  if (mode === 'grouped') {
    const barWidth = (slot * 0.82) / series.length
    series.forEach((entry, seriesIndex) => {
      entry.values.forEach((value, pointIndex) => {
        const barHeight = value * scale
        const x = axis.leftPad + slot * pointIndex + (slot - barWidth * series.length) / 2 + barWidth * seriesIndex
        bars.push({
          x,
          y: baselineY - barHeight,
          width: barWidth,
          height: Math.max(0, barHeight),
          color: entry.color,
        })
        if (options.showValues) {
          values.push({
            x: x + barWidth / 2,
            y: baselineY - barHeight - labelFontSize * 0.45,
            text: formatChartValue(value),
          })
        }
      })
    })
  } else {
    // Stacked and percent share one column per category; percent normalises it.
    const barWidth = slot * 0.62
    labels.forEach((_, pointIndex) => {
      const total = totals[pointIndex]
      const columnScale = mode === 'percent' ? plotHeight : scale
      let top = baselineY
      series.forEach((entry) => {
        const value = entry.values[pointIndex] ?? 0
        const share = total > 0 ? value / total : 0
        const barHeight = mode === 'percent' ? share * columnScale : value * columnScale
        const y = top - Math.max(0, barHeight)
        const x = axis.leftPad + slot * pointIndex + (slot - barWidth) / 2
        bars.push({ x, y, width: barWidth, height: Math.max(0, barHeight), color: entry.color })
        top = y
        if (options.showValues && mode === 'percent' && share >= 0.1) {
          percents.push({
            x: x + barWidth / 2,
            y: y + barHeight / 2 + labelFontSize * 0.35,
            text: `${Math.round(share * 100)}%`,
          })
        }
      })
      if (options.showValues && mode === 'stacked') {
        values.push({
          x: axis.leftPad + slot * pointIndex + slot / 2,
          y: top - labelFontSize * 0.45,
          text: formatChartValue(total),
        })
      }
    })
  }

  return {
    bars,
    baseline: { y: baselineY },
    labels: labels.map((text, index) => ({
      x: axis.leftPad + slot * index + slot / 2,
      y: baselineY + labelFontSize * 1.4,
      lines: chartLabelLines(text, slot * 0.94, chartLabelFont(height, width, labels, 'bar')),
    })),
    values,
    percents,
    axis,
    legend: legend.items,
  }
}

/** One series' slope: its polyline, the area under it and a dot per point. */
export interface ChartLineSeriesGeometry {
  points: Array<{ x: number; y: number }>
  area: string
  dots: Array<{ x: number; y: number }>
  color: string
  values: Array<{ x: number; y: number; text: string }>
}

export interface ChartLineGeometry {
  lines: ChartLineSeriesGeometry[]
  labels: Array<{ x: number; y: number; lines: string[] }>
  baseline: { y: number }
  /** The y-axis grid lines and ticks, sharing the bars' layout. */
  axis: ChartAxis
  legend: ChartLegendItem[]
}

/** A line chart: one filled slope with a dot per point for every series. */
export function lineChartGeometry(
  width: number,
  height: number,
  labels: readonly string[],
  series: readonly ChartSeriesInput[],
  options: { showValues: boolean; showLegend?: boolean; showTicks?: boolean },
): ChartLineGeometry {
  const legend = legendLayout(width, height, series, options.showLegend)
  const topPad = height * 0.12 + legend.height
  const bottomPad = height * 0.16
  const plotHeight = Math.max(1, height - topPad - bottomPad)
  const max = Math.max(...series.flatMap((entry) => entry.values), 0)
  const axis = chartAxis(height, topPad, bottomPad, max, options.showTicks)
  const scale = axis.max > 0 ? plotHeight / axis.max : 0
  const count = labels.length
  const plotWidth = width - axis.leftPad
  const slot = count > 1 ? plotWidth / (count - 1) : 0
  const xAt = (index: number) => (count > 1 ? axis.leftPad + slot * index : axis.leftPad + plotWidth / 2)
  const yAt = (value: number) => height - bottomPad - value * scale
  const fontSize = Math.min(height * 0.07, width / (count * 4), CHART_FONT_SIZE_MAX)
  const lines = series.map((entry) => {
    const points = entry.values.map((value, index) => ({ x: xAt(index), y: yAt(value) }))
    const area = points.length > 1
      ? `M${points[0].x} ${height - bottomPad} ${points.map((point) => `L${point.x} ${point.y}`).join(' ')} L${points[points.length - 1].x} ${height - bottomPad} Z`
      : ''
    return {
      points,
      area,
      dots: points,
      color: entry.color,
      values: options.showValues
        ? entry.values.map((value, index) => ({
          x: xAt(index),
          y: yAt(value) - fontSize * 0.55,
          text: formatChartValue(value),
        }))
        : [],
    }
  })
  return {
    lines,
    labels: labels.map((text, index) => ({
      x: xAt(index),
      y: height - bottomPad + fontSize * 1.4,
      lines: chartLabelLines(text, (count > 1 ? slot : plotWidth) * 0.94, chartLabelFont(height, width, labels, 'line')),
    })),
    baseline: { y: height - bottomPad },
    axis,
    legend: legend.items,
  }
}

export interface ChartRingSegment {
  /** Arc path in a 100×100 view box. */
  d: string
  color: string
  /** Where the percentage label sits, when the slice is big enough for one. */
  label: { x: number; y: number; text: string } | null
}

export interface ChartRadarSeriesGeometry {
  /** The closed polygon path through the series' points. */
  d: string
  color: string
  /** Value labels at the vertices (only when asked for). */
  values: Array<{ x: number; y: number; text: string }>
}

export interface ChartRadarGeometry {
  /** One polygon per series, the first drawn on top of the web. */
  series: ChartRadarSeriesGeometry[]
  /** The web rings at 1/4 steps, outermost first, as closed polygons. */
  rings: string[]
  /** Axis lines from the centre to the outer ring's vertices. */
  axes: Array<{ x1: number; y1: number; x2: number; y2: number }>
  /** Dimension labels centred past each axis end, wrapped when too wide. */
  labels: Array<{ x: number; y: number; lines: string[] }>
  legend: ChartLegendItem[]
}

/**
 * A radar chart: one polygon per series over a shared web, the first axis
 * pointing up. The outer ring sits at the nice ceiling of every value, so
 * shapes stay comparable across series.
 */
export function radarChartGeometry(
  width: number,
  height: number,
  labels: readonly string[],
  series: readonly ChartSeriesInput[],
  options: { showValues: boolean; showLegend?: boolean },
): ChartRadarGeometry {
  const legend = legendLayout(width, height, series, options.showLegend)
  const count = Math.max(3, labels.length)
  const fontSize = chartLabelFont(height, width, labels, 'radar')
  const center = { x: width / 2, y: height * 0.46 + legend.height / 2 }
  const radius = Math.max(1, Math.min(width / 2, height * 0.42) - fontSize * 1.6)
  const angleAt = (index: number) => -Math.PI / 2 + (index * 2 * Math.PI) / count
  const pointAt = (index: number, distance: number) => ({
    x: center.x + Math.cos(angleAt(index)) * distance,
    y: center.y + Math.sin(angleAt(index)) * distance,
  })
  const polygon = (distance: number) => labels
    .map((_, index) => {
      const point = pointAt(index, distance)
      return `${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    })
    .join(' L')
  const rings = [1, 0.75, 0.5, 0.25].map((share) => `M${polygon(radius * share)} Z`)
  const axes = labels.map((_, index) => {
    const point = pointAt(index, radius)
    return { x1: center.x, y1: center.y, x2: point.x, y2: point.y }
  })
  const max = niceChartCeiling(Math.max(...series.flatMap((entry) => entry.values), 0))
  const scale = max > 0 ? radius / max : 0
  return {
    series: series.map((entry) => {
      const points = labels.map((_, index) => pointAt(index, (entry.values[index] ?? 0) * scale))
      return {
        d: `M${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L')} Z`,
        color: entry.color,
        values: options.showValues
          ? points.map((point, index) => ({
            x: point.x,
            y: point.y - fontSize * 0.55,
            text: formatChartValue(entry.values[index] ?? 0),
          }))
          : [],
      }
    }),
    rings,
    axes,
    labels: labels.map((text, index) => {
      const anchor = pointAt(index, radius + fontSize * 1.1)
      const slot = (2 * Math.PI * (radius + fontSize)) / count
      return {
        x: anchor.x,
        y: anchor.y + fontSize * 0.35,
        lines: chartLabelLines(text, Math.max(slot * 0.94, fontSize * 2), fontSize),
      }
    }),
    legend: legend.items,
  }
}

export interface ChartRingGeometry {
  /** One flat list: the outermost series' segments first. */
  segments: ChartRingSegment[]
  /** The hole colour, drawn under the segments. */
  track: string
  legend: ChartLegendItem[]
}

/** A ring chart: proportional arcs around a hollow centre; every series adds
 *  another ring, the first on the outside. */
export function ringChartGeometry(
  series: readonly ChartSeriesInput[],
  options: { showValues: boolean; showLegend?: boolean },
): ChartRingGeometry {
  const colors = series.map((entry) => entry.color)
  const track = tintTowardWhite(colors[0], 0.82)
  const center = 50
  // The single-series ring keeps its v24 shape: a 17-unit band at radius 34.
  const outerEdge = 42.5
  const gap = 1.5
  const hole = 8
  const band = Math.min(17, (outerEdge - hole - (series.length - 1) * gap) / series.length)
  const segments: ChartRingSegment[] = []
  series.forEach((entry, seriesIndex) => {
    const outer = outerEdge - seriesIndex * (band + gap)
    const inner = outer - band
    const radius = (outer + inner) / 2
    const values = entry.values
    const total = values.reduce((sum, value) => sum + value, 0)
    if (total <= 0) return
    const pointColors = chartPointColors('ring', values.length, entry.color)
    let angle = -Math.PI / 2
    values.forEach((value, pointIndex) => {
      const share = value / total
      const sweep = share * Math.PI * 2
      const start = angle
      const end = angle + sweep
      angle = end
      const x0 = center + outer * Math.cos(start)
      const y0 = center + outer * Math.sin(start)
      const x1 = center + outer * Math.cos(end)
      const y1 = center + outer * Math.sin(end)
      const x2 = center + inner * Math.cos(end)
      const y2 = center + inner * Math.sin(end)
      const x3 = center + inner * Math.cos(start)
      const y3 = center + inner * Math.sin(start)
      const largeArc = sweep > Math.PI ? 1 : 0
      const d = `M${x0.toFixed(2)} ${y0.toFixed(2)} A${outer.toFixed(2)} ${outer.toFixed(2)} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} A${inner.toFixed(2)} ${inner.toFixed(2)} 0 ${largeArc} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`
      const label = options.showValues && share >= 0.1
        ? {
          x: center + radius * Math.cos((start + end) / 2),
          y: center + radius * Math.sin((start + end) / 2) + 2.6,
          text: `${Math.round(share * 100)}%`,
        }
        : null
      segments.push({ d, color: pointColors[pointIndex], label })
    })
  })
  return { segments, track, legend: ringLegendLayout(series, options.showLegend).items }
}

/** The ring's legend sits under the rings, in the same 100-box units. */
function ringLegendLayout(
  series: readonly ChartSeriesInput[],
  showLegend?: boolean,
): { items: ChartLegendItem[] } {
  const named = series.filter((entry) => (entry.name ?? '').trim().length > 0)
  if (!legendVisible(showLegend, named.length)) return { items: [] }
  const texts = named.map((entry) => entry.name!.trim())
  const fontSize = 6.5
  const chip = 4.2
  const gap = 4
  const itemWidths = texts.map((text) => chip + 1.6 + text.length * fontSize * 0.62 + gap)
  const rowWidth = itemWidths.reduce((sum, item) => sum + item, 0) - gap
  let x = Math.max(2, 50 - rowWidth / 2)
  const y = 97
  const items = named.map((entry, index) => {
    const item = { x, y, color: entry.color, text: texts[index] }
    x += itemWidths[index]
    return item
  })
  return { items }
}

/** Chart numbers stay short: integers as-is, decimals to one place. */
export function formatChartValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
