// Where a composed page's data drawing goes and how it is coloured. The
// drawing takes the page's own content column (the template's rules or text
// edges), starts under the words above it (as far as they really run, not
// the whole box drawn for them), and borrows the page's ink and accent so a
// chart on a dark or warm deck reads as part of it.

import { mixColor } from '../../../src/freeform/decorations'
import type { FreeformSceneNode, FreeformSlide, FreeformTextElement } from '../../../src/freeform/types'
import { contrastRatio } from './layoutIssues'
import { measureText } from './textFit'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Shapes at least this opaque block a drawing; fainter ones are glows. */
const SEE_THROUGH = 0.7
/** A shape covering this much of the page is its backdrop, not an obstacle. */
const BACKDROP_SHARE = 0.6
/** The room kept between the words above and the drawing. */
const GAP_ABOVE = 40

function solidOf(paint: unknown): string | null {
  return typeof paint === 'object' && paint !== null && (paint as { type?: unknown }).type === 'solid'
    ? String((paint as { color?: unknown }).color)
    : null
}

/** Every leaf node, its page box included (groups add their offset). */
function leaves(nodes: readonly FreeformSceneNode[], offset = { x: 0, y: 0 }): Array<{ node: Exclude<FreeformSceneNode, { type: 'group' }>; box: Box }> {
  const out: Array<{ node: Exclude<FreeformSceneNode, { type: 'group' }>; box: Box }> = []
  for (const node of nodes) {
    if (node.hidden) continue
    if (node.type === 'group') {
      out.push(...leaves(node.children, { x: offset.x + node.x, y: offset.y + node.y }))
      continue
    }
    out.push({ node, box: { x: offset.x + node.x, y: offset.y + node.y, width: node.width, height: node.height } })
  }
  return out
}

/** A shape, drawing or picture spread over most of the page is its ground (a panel, a grid), not an obstacle. */
function isBackdrop(node: FreeformSceneNode, box: Box, slide: FreeformSlide): boolean {
  return (node.type === 'shape' || node.type === 'path' || node.type === 'image')
    && box.width * box.height >= BACKDROP_SHARE * slide.width * slide.height
}

/**
 * The boxes a drawing must keep clear of. A top-aligned text only claims as
 * much of its box as its words run (measured as the composer measures them,
 * with its safety slack); backdrops and faint glows claim nothing.
 */
export function blockingBoxes(slide: FreeformSlide): Box[] {
  const boxes: Box[] = []
  for (const { node, box } of leaves(slide.nodes)) {
    if (node.type === 'shape' && (node.opacity ?? 1) < SEE_THROUGH) continue
    if (isBackdrop(node, box, slide)) continue
    if (node.type === 'text' && !node.vertical && node.verticalAlign === undefined && node.text.trim() !== '') {
      const depth = measureText(node, node.text, node.fontSize).depth
      boxes.push({ ...box, height: Math.min(box.height, Math.ceil(depth) + 16) })
      continue
    }
    boxes.push(box)
  }
  return boxes
}

/**
 * The content column over the free room: the span of the template's rule
 * that runs furthest across that room (its own grid), else the widest span
 * the texts there share. Null when the page draws neither.
 */
export function contentColumn(slide: FreeformSlide, free: Box): { left: number; right: number } | null {
  const all = leaves(slide.nodes)
  const overlap = (box: Box) => Math.min(box.x + box.width, free.x + free.width) - Math.max(box.x, free.x)
  // Rules and the panels the template lays its words on mark its grid.
  const rules = all
    .filter(({ node, box }) => (node.type === 'line' || ((node.type === 'shape' || node.type === 'path') && !isBackdrop(node, box, slide) && box.height >= 48))
      && box.width >= slide.width * 0.3 && overlap(box) >= box.width * 0.8)
    .sort((a, b) => overlap(b.box) - overlap(a.box))
  if (rules.length > 0) return { left: rules[0].box.x, right: rules[0].box.x + rules[0].box.width }
  const texts = all.filter(({ node, box }) => node.type === 'text' && box.width >= free.width * 0.5 && overlap(box) >= box.width * 0.8)
  if (texts.length === 0) return null
  return {
    left: Math.min(...texts.map(({ box }) => box.x)),
    right: Math.max(...texts.map(({ box }) => box.x + box.width)),
  }
}

/** The colours a page's data drawing takes. */
export interface PagePalette {
  /** What the drawing sits on (the page, or the backdrop shape over it). */
  background: string
  /** The page's body words. */
  ink: string
  /** The page's strongest colour that isn't a word or the ground. */
  accent: string
  /** A quiet partner for the accent: the ink faded toward the ground. */
  muted: string
}

/** Whether light words read better on `hex` than dark ones. */
function isDark(hex: string): boolean {
  return (contrastRatio(hex, '#ffffff') ?? 0) > (contrastRatio(hex, '#000000') ?? 0)
}

/** How much hue a colour carries (0 grey – 1 pure): a slate rule has little, a red label a lot. */
function chroma(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => channel / 255)
  return Math.max(...channels) - Math.min(...channels)
}

function backgroundOf(slide: FreeformSlide): string {
  const backdrop = [...leaves(slide.nodes)].reverse()
    .find(({ node, box }) => isBackdrop(node, box, slide) && node.type === 'shape' && (node.opacity ?? 1) >= SEE_THROUGH)
  const backdropColor = backdrop && backdrop.node.type === 'shape' ? solidOf(backdrop.node.fill) : null
  if (backdropColor) return backdropColor
  const background = slide.background
  if (background.type === 'solid') return background.color
  if (background.type === 'pattern') return background.color
  if (background.type === 'linear-gradient') {
    return 'stops' in background ? background.stops[0].color : background.from
  }
  if (background.type === 'radial-gradient') return background.stops[0].color
  return '#ffffff'
}

/**
 * `color` deepened (or, on a dark ground, lifted) until it holds 3:1 against
 * `background`; null when that takes more than a third of the way to black
 * or white (a yellow highlight would turn olive — not the deck's colour).
 */
function readable(color: string, background: string): string | null {
  const toward = isDark(background) ? '#ffffff' : '#000000'
  for (let step = 0; step <= 3; step += 1) {
    const candidate = step === 0 ? color : mixColor(color, toward, step * 0.1)
    if ((contrastRatio(candidate, background) ?? 0) >= 3) return candidate
  }
  return null
}

/**
 * The ink, accent and ground a drawing on `slide` should use: the colour
 * most of the page's smaller words are set in, the page's most saturated
 * colour among its rules, shapes and headings, each kept readable on the
 * ground (or swapped for one that is).
 */
export function pagePalette(slide: FreeformSlide): PagePalette {
  const background = backgroundOf(slide)
  const fallbackInk = isDark(background) ? '#f4f4f5' : '#27272a'
  const all = leaves(slide.nodes)
  const texts = all.filter((entry): entry is { node: FreeformTextElement; box: Box } => entry.node.type === 'text' && entry.node.text.trim() !== '')
  const largest = Math.max(0, ...texts.map(({ node }) => node.fontSize))
  // The words that aren't the page's headline say what its body reads in.
  const weights = new Map<string, number>()
  for (const { node } of texts) {
    const color = solidOf(node.textFill)
    if (!color || (texts.length > 1 && node.fontSize >= largest)) continue
    weights.set(color.toLowerCase(), (weights.get(color.toLowerCase()) ?? 0) + node.text.length)
  }
  const inkCandidate = [...weights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const ink = inkCandidate && (contrastRatio(inkCandidate, background) ?? 0) >= 4.5 ? inkCandidate : fallbackInk
  // The accent: the colours the page draws with some hue, weighted by how
  // much they show; a pale one (a pastel deck) is deepened until it reads.
  const accents = new Map<string, number>()
  const add = (color: string | null, weight: number) => {
    if (!color) return
    const key = color.toLowerCase()
    if (key === ink || key === background.toLowerCase() || chroma(key) < 0.25) return
    accents.set(key, (accents.get(key) ?? 0) + weight)
  }
  // Translucent shapes are glows behind the page, not its marks.
  for (const { node, box } of all) {
    if (node.type === 'line') add(node.stroke, box.width * Math.max(1, node.strokeWidth))
    else if (node.type === 'shape' && !isBackdrop(node, box, slide) && (node.opacity ?? 1) >= 1) add(solidOf(node.fill), Math.sqrt(box.width * box.height) * 2)
    else if (node.type === 'path') add(node.stroke, Math.sqrt(box.width * box.height))
    else if (node.type === 'text') add(solidOf(node.textFill), node.text.length * node.fontSize * 0.5)
  }
  // The most shown colour that reads (or nearly does); a deck without one
  // draws its data in its own ink rather than in a blue it never uses.
  const accent = [...accents.entries()].sort((a, b) => b[1] - a[1])
    .map(([color]) => readable(color, background))
    .find((color): color is string => color !== null) ?? ink
  return { background, ink, accent, muted: mixColor(ink, background, 0.55) }
}

/** The colours a run of `count` chart series takes: quiet ones first, the accent last. */
export function seriesColors(palette: PagePalette, count: number): string[] {
  if (count <= 1) return [palette.accent]
  if (count === 2) return [palette.muted, palette.accent]
  return [palette.muted, mixColor(palette.accent, palette.background, 0.45), palette.accent]
}

/** The box a data drawing wants inside `free`, or null when even its least doesn't fit. */
export function drawingBox(
  slide: FreeformSlide,
  free: Box,
  want: (width: number) => { height: number; minHeight: number; minWidth: number },
): Box | null {
  const column = contentColumn(slide, free)
  // The column's edges, kept inside the free room.
  let left = free.x
  let right = free.x + free.width
  if (column) {
    if (column.left >= free.x - 0.5 && column.left < free.x + free.width / 2) left = column.left
    if (column.right <= free.x + free.width + 0.5 && column.right > free.x + free.width / 2) right = column.right
  }
  const width = Math.round(right - left)
  const { height, minHeight, minWidth } = want(width)
  if (width < minWidth) return null
  // Under the words above, with a breath of room; never past the free room.
  const top = free.y + Math.min(GAP_ABOVE, Math.max(0, free.height - minHeight))
  const room = free.y + free.height - top
  if (room < minHeight) return null
  return { x: Math.round(left), y: Math.round(top), width, height: Math.round(Math.min(height, room)) }
}
