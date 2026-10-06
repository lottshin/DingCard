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

export function isValidChartKind(value: unknown): value is ChartKind {
  return value === 'bar' || value === 'ring' || value === 'line'
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

/** The legend row across the top: one chip and name per named series. It only
 *  appears once two series or more carry names worth telling apart. */
function legendLayout(
  width: number,
  height: number,
  series: readonly ChartSeriesInput[],
): LegendLayout {
  const named = series.filter((entry) => (entry.name ?? '').trim().length > 0)
  if (named.length < 2) return { items: [], height: 0 }
  const texts = named.map((entry) => entry.name!.trim())
  // Fit the widest row: each item is a chip plus its text, in one line.
  const fontSize = Math.max(8, Math.min(
    height * 0.06,
    width / (texts.reduce((sum, text) => sum + text.length, 0) * 0.62 + named.length * 2.2),
    16,
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
  /** Bar rectangles, in view-box px; grouped side by side per category. */
  bars: Array<{ x: number; y: number; width: number; height: number; color: string }>
  /** The zero line under the bars. */
  baseline: { y: number }
  /** Category labels centred under each group. */
  labels: Array<{ x: number; y: number; text: string }>
  /** Value labels above each bar (only when asked for). */
  values: Array<{ x: number; y: number; text: string }>
  legend: ChartLegendItem[]
}

/** A bar chart: grouped bars rise from a baseline, labels sit under, values on top. */
export function barChartGeometry(
  width: number,
  height: number,
  labels: readonly string[],
  series: readonly ChartSeriesInput[],
  options: { showValues: boolean },
): ChartBarGeometry {
  const legend = legendLayout(width, height, series)
  const topPad = height * 0.1 + legend.height
  const bottomPad = height * 0.16
  const plotHeight = Math.max(1, height - topPad - bottomPad)
  const max = Math.max(...series.flatMap((entry) => entry.values), 0)
  const scale = max > 0 ? plotHeight / max : 0
  const slot = width / labels.length
  const barWidth = (slot * 0.82) / series.length
  const baselineY = height - bottomPad
  const labelFontSize = Math.min(height * 0.07, width / (labels.length * 4), 16)
  const bars: ChartBarGeometry['bars'] = []
  const values: ChartBarGeometry['values'] = []
  series.forEach((entry, seriesIndex) => {
    entry.values.forEach((value, pointIndex) => {
      const barHeight = value * scale
      const x = slot * pointIndex + (slot - barWidth * series.length) / 2 + barWidth * seriesIndex
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
  return {
    bars,
    baseline: { y: baselineY },
    labels: labels.map((text, index) => ({
      x: slot * index + slot / 2,
      y: baselineY + labelFontSize * 1.4,
      text,
    })),
    values,
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
  labels: Array<{ x: number; y: number; text: string }>
  baseline: { y: number }
  legend: ChartLegendItem[]
}

/** A line chart: one filled slope with a dot per point for every series. */
export function lineChartGeometry(
  width: number,
  height: number,
  labels: readonly string[],
  series: readonly ChartSeriesInput[],
  options: { showValues: boolean },
): ChartLineGeometry {
  const legend = legendLayout(width, height, series)
  const topPad = height * 0.12 + legend.height
  const bottomPad = height * 0.16
  const plotHeight = Math.max(1, height - topPad - bottomPad)
  const max = Math.max(...series.flatMap((entry) => entry.values), 0)
  const scale = max > 0 ? plotHeight / max : 0
  const count = labels.length
  const slot = count > 1 ? width / (count - 1) : 0
  const xAt = (index: number) => (count > 1 ? slot * index : width / 2)
  const yAt = (value: number) => height - bottomPad - value * scale
  const fontSize = Math.min(height * 0.07, width / (count * 4), 16)
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
      text,
    })),
    baseline: { y: height - bottomPad },
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
  options: { showValues: boolean },
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
  return { segments, track, legend: ringLegendLayout(series).items }
}

/** The ring's legend sits under the rings, in the same 100-box units. */
function ringLegendLayout(series: readonly ChartSeriesInput[]): { items: ChartLegendItem[] } {
  const named = series.filter((entry) => (entry.name ?? '').trim().length > 0)
  if (named.length < 2) return { items: [] }
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
