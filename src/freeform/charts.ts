// Chart element support: data validation and the pure geometry the view
// renders as SVG — bars, a ring, or a line, from one labelled series. Free
// of any package dependency, so the document modules (and the server-side
// MCP renderer bundling them) import it safely.

import type { FreeformChartElement } from './types'

export type ChartKind = FreeformChartElement['chartKind']

/** One labelled series; 1–12 points keeps the small-card charts legible. */
export const CHART_POINTS_MAX = 12
export const CHART_LABEL_MAX_LENGTH = 24
export const CHART_ACCENT_DEFAULT = '#1d4ed8'

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

export function isValidChartSeries(labels: unknown, values: unknown): boolean {
  if (!Array.isArray(labels) || !Array.isArray(values)) return false
  if (labels.length === 0 || labels.length > CHART_POINTS_MAX) return false
  if (labels.length !== values.length) return false
  return labels.every(isValidChartLabel) && values.every(isValidChartValue)
}

/** Mixes a hex colour toward white; 0 stays, 1 is white. */
export function tintTowardWhite(hex: string, amount: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  const channel = (value: number) => Math.round(value + (255 - value) * amount)
  return `#${[channel(r), channel(g), channel(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** The per-point colours: the accent alone, or a ring ramp of tints. */
export function chartPointColors(kind: ChartKind, count: number, accent: string): string[] {
  if (kind !== 'ring' || count <= 1) return Array.from({ length: count }, () => accent)
  return Array.from({ length: count }, (_, index) => tintTowardWhite(accent, index * (0.78 / Math.max(1, count - 1))))
}

export interface ChartBarGeometry {
  /** Bar rectangles, in view-box px. */
  bars: Array<{ x: number; y: number; width: number; height: number; color: string }>
  /** The zero line under the bars. */
  baseline: { y: number }
  /** Category labels centred under each bar. */
  labels: Array<{ x: number; y: number; text: string }>
  /** Value labels above each bar (only when asked for). */
  values: Array<{ x: number; y: number; text: string }>
}

/** A bar chart: bars rise from a baseline, labels sit under, values on top. */
export function barChartGeometry(
  width: number,
  height: number,
  labels: readonly string[],
  values: readonly number[],
  accent: string,
  options: { showValues: boolean },
): ChartBarGeometry {
  const topPad = height * 0.1
  const bottomPad = height * 0.16
  const plotHeight = Math.max(1, height - topPad - bottomPad)
  const max = Math.max(...values, 0)
  const scale = max > 0 ? plotHeight / max : 0
  const slot = width / values.length
  const barWidth = slot * 0.62
  const baselineY = height - bottomPad
  const labelFontSize = Math.min(height * 0.07, width / (values.length * 4), 16)
  return {
    bars: values.map((value, index) => {
      const barHeight = value * scale
      return {
        x: slot * index + (slot - barWidth) / 2,
        y: baselineY - barHeight,
        width: barWidth,
        height: Math.max(0, barHeight),
        color: accent,
      }
    }),
    baseline: { y: baselineY },
    labels: labels.map((text, index) => ({
      x: slot * index + slot / 2,
      y: baselineY + labelFontSize * 1.4,
      text,
    })),
    values: options.showValues
      ? values.map((value, index) => ({
        x: slot * index + slot / 2,
        y: baselineY - value * scale - labelFontSize * 0.45,
        text: formatChartValue(value),
      }))
      : [],
  }
}

export interface ChartLineGeometry {
  /** The polyline through the value points. */
  points: Array<{ x: number; y: number }>
  /** The area polygon under the line (empty when there is only one point). */
  area: string
  dots: Array<{ x: number; y: number; color: string }>
  labels: Array<{ x: number; y: number; text: string }>
  values: Array<{ x: number; y: number; text: string }>
  baseline: { y: number }
}

/** A line chart: a filled slope with a dot per point. */
export function lineChartGeometry(
  width: number,
  height: number,
  labels: readonly string[],
  values: readonly number[],
  accent: string,
  options: { showValues: boolean },
): ChartLineGeometry {
  const topPad = height * 0.12
  const bottomPad = height * 0.16
  const plotHeight = Math.max(1, height - topPad - bottomPad)
  const max = Math.max(...values, 0)
  const scale = max > 0 ? plotHeight / max : 0
  const slot = values.length > 1 ? width / (values.length - 1) : 0
  const xAt = (index: number) => (values.length > 1 ? slot * index : width / 2)
  const yAt = (value: number) => height - bottomPad - value * scale
  const fontSize = Math.min(height * 0.07, width / (values.length * 4), 16)
  const points = values.map((value, index) => ({ x: xAt(index), y: yAt(value) }))
  const area = points.length > 1
    ? `M${points[0].x} ${height - bottomPad} ${points.map((point) => `L${point.x} ${point.y}`).join(' ')} L${points[points.length - 1].x} ${height - bottomPad} Z`
    : ''
  return {
    points,
    area,
    dots: points.map((point) => ({ ...point, color: accent })),
    labels: labels.map((text, index) => ({
      x: xAt(index),
      y: height - bottomPad + fontSize * 1.4,
      text,
    })),
    values: options.showValues
      ? values.map((value, index) => ({
        x: xAt(index),
        y: yAt(value) - fontSize * 0.55,
        text: formatChartValue(value),
      }))
      : [],
    baseline: { y: height - bottomPad },
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
  segments: ChartRingSegment[]
  /** The hole colour, drawn under the segments. */
  track: string
}

/** A ring chart: proportional arcs around a hollow centre. */
export function ringChartGeometry(
  values: readonly number[],
  accent: string,
  options: { showValues: boolean },
): ChartRingGeometry {
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return { segments: [], track: accent }
  const colors = chartPointColors('ring', values.length, accent)
  const center = 50
  const radius = 34
  const strokeWidth = 17
  let angle = -Math.PI / 2
  const segments = values.map((value, index) => {
    const share = value / total
    const sweep = share * Math.PI * 2
    const start = angle
    const end = angle + sweep
    angle = end
    // An annular sector as one path: outer arc, radial edge, inner arc back.
    const outer = radius + strokeWidth / 2
    const inner = radius - strokeWidth / 2
    const x0 = center + outer * Math.cos(start)
    const y0 = center + outer * Math.sin(start)
    const x1 = center + outer * Math.cos(end)
    const y1 = center + outer * Math.sin(end)
    const x2 = center + inner * Math.cos(end)
    const y2 = center + inner * Math.sin(end)
    const x3 = center + inner * Math.cos(start)
    const y3 = center + inner * Math.sin(start)
    const largeArc = sweep > Math.PI ? 1 : 0
    const d = `M${x0.toFixed(2)} ${y0.toFixed(2)} A${outer} ${outer} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} A${inner} ${inner} 0 ${largeArc} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`
    const label = options.showValues && share >= 0.1
      ? {
        x: center + radius * Math.cos((start + end) / 2),
        y: center + radius * Math.sin((start + end) / 2) + 2.6,
        text: `${Math.round(share * 100)}%`,
      }
      : null
    return { d, color: colors[index], label }
  })
  return { segments, track: tintTowardWhite(accent, 0.82) }
}

/** Chart numbers stay short: integers as-is, decimals to one place. */
export function formatChartValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
