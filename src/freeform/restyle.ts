// Deck-wide restyling: the colours and fonts a whole document uses, and the
// swaps that change them on every page at once — a curated palette or font
// set, or exact colours and fonts replaced everywhere. The editor's 风格
// panel and the MCP server (document/restyle) share it.

import { isHexColor } from './paint'
import type {
  ColorPaint,
  FreeformDocument,
  FreeformSceneNode,
  FreeformSlide,
  FreeformTextElement,
  ShadowPaint,
  SlideBackground,
} from './types'

/** A curated palette: the page, the words on it, and the colours that stand out. */
export interface Palette {
  id: string
  name: string
  background: string
  text: string
  accents: readonly string[]
}

/** A curated font set: one font for headings, one for everything else. */
export interface FontSet {
  id: string
  name: string
  heading: string
  body: string
}

export const PALETTES: readonly Palette[] = [
  { id: 'paper', name: '纸墨', background: '#f6f3ea', text: '#1c1b19', accents: ['#d94836', '#2f5d50'] },
  { id: 'sea-salt', name: '海盐', background: '#edf4f7', text: '#102a43', accents: ['#1f7a8c', '#e09f1f'] },
  { id: 'pine', name: '松林', background: '#eef2e6', text: '#1f2a1d', accents: ['#3a6b35', '#c98b2b'] },
  { id: 'berry', name: '莓果', background: '#fdf1f3', text: '#3a1d2b', accents: ['#d6336c', '#7048e8'] },
  { id: 'latte', name: '奶咖', background: '#f8f1e7', text: '#3b2a20', accents: ['#b8642e', '#6b8f71'] },
  { id: 'mono', name: '黑白', background: '#ffffff', text: '#111111', accents: ['#111111', '#8a8a8a'] },
  { id: 'night-flight', name: '夜航', background: '#0f172a', text: '#e5e9f0', accents: ['#f5b942', '#4cc9f0'] },
  { id: 'neon', name: '霓虹', background: '#0a0e1a', text: '#eef6ff', accents: ['#22d3ee', '#e879f9'] },
  { id: 'charcoal', name: '墨黑', background: '#161616', text: '#f4f1ea', accents: ['#ff6b35', '#ffd23f'] },
  { id: 'blueprint', name: '蓝图', background: '#10325a', text: '#f2f6fb', accents: ['#7cc6fe', '#ffd166'] },
]

export const FONT_SETS: readonly FontSet[] = [
  { id: 'modern-sans', name: '现代黑体', heading: "'Noto Sans SC', sans-serif", body: "'Noto Sans SC', sans-serif" },
  { id: 'editorial', name: '杂志宋体', heading: "'Noto Serif SC', serif", body: "'Noto Sans SC', sans-serif" },
  { id: 'book', name: '书卷宋体', heading: "'Noto Serif SC', serif", body: "'Noto Serif SC', serif" },
  { id: 'handwritten', name: '手写文楷', heading: "'LXGW WenKai TC', cursive", body: "'LXGW WenKai TC', cursive" },
  { id: 'poster', name: '海报小薇', heading: "'ZCOOL XiaoWei', serif", body: "'Noto Sans SC', sans-serif" },
  { id: 'system', name: '系统苹方', heading: 'PingFang SC', body: 'PingFang SC' },
]

/** What `document/restyle` changes; palette and font set first, then the exact replacements. */
export interface RestyleRequest {
  palette?: string
  fontSet?: string
  /** #RRGGBB → #RRGGBB, keyed by the colours the document has now. */
  colors?: Record<string, string>
  /** Font family → font family, keyed by the families the document has now. */
  fonts?: Record<string, string>
}

/** Texts at least this many times the deck's body size take a font set's heading font. */
export const HEADING_SCALE = 1.4
const MAX_FONT_FAMILY_LENGTH = 200
/** OKLCH chroma below which a colour reads as a tint of the page or the words rather than a colour of its own. */
const NEUTRAL_CHROMA = 0.08
/** How far (in OKLab lightness) a text colour must sit from the page to count as the deck's words. */
const MIN_WORDS_APART = 0.3

// --- Colour maths (OKLab: perceptual, so mixes and lightness compare evenly) ---

interface Lab {
  l: number
  a: number
  b: number
}

function toLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function fromLinear(value: number): number {
  const c = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, c)) * 255)
}

function hexToLab(hex: string): Lab {
  const r = toLinear(Number.parseInt(hex.slice(1, 3), 16))
  const g = toLinear(Number.parseInt(hex.slice(3, 5), 16))
  const b = toLinear(Number.parseInt(hex.slice(5, 7), 16))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

function labToHex({ l, a, b }: Lab): string {
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const channels = [
    4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
    -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
    -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1,
  ]
  return `#${channels.map((channel) => fromLinear(channel).toString(16).padStart(2, '0')).join('')}`
}

function mix(from: string, to: string, amount: number): string {
  const a = hexToLab(from)
  const b = hexToLab(to)
  return labToHex({
    l: a.l + (b.l - a.l) * amount,
    a: a.a + (b.a - a.a) * amount,
    b: a.b + (b.b - a.b) * amount,
  })
}

function chroma(hex: string): number {
  const { a, b } = hexToLab(hex)
  return Math.hypot(a, b)
}

// --- Walking every colour and font in a document ---

type Recolor = (color: string) => string

/** Rebuild a value only where `recolor` changes something; untouched parts keep their identity. */
function recolorPaint<T extends ColorPaint>(paint: T, recolor: Recolor): T {
  if (paint.type === 'solid') {
    const color = recolor(paint.color)
    return color === paint.color ? paint : { ...paint, color }
  }
  if ('stops' in paint) {
    const stops = paint.stops.map((stop) => {
      const color = recolor(stop.color)
      return color === stop.color ? stop : { ...stop, color }
    })
    return stops.every((stop, index) => stop === paint.stops[index]) ? paint : { ...paint, stops }
  }
  const from = recolor(paint.from)
  const to = recolor(paint.to)
  return from === paint.from && to === paint.to ? paint : { ...paint, from, to }
}

/** Page backgrounds and shape fills: colour paints change, pictures and "none" don't. */
function recolorFill(fill: SlideBackground, recolor: Recolor): SlideBackground {
  return fill.type === 'transparent' || fill.type === 'image' ? fill : recolorPaint(fill, recolor)
}

function recolorShadow(shadow: ShadowPaint | undefined, recolor: Recolor): ShadowPaint | undefined {
  if (!shadow) return shadow
  const color = recolor(shadow.color)
  return color === shadow.color ? shadow : { ...shadow, color }
}

/** Apply a patch, or keep the node when nothing in it changed; undefined entries are left out, never written. */
function patched<T extends object>(node: T, patch: Partial<T>): T {
  const keys = (Object.keys(patch) as Array<keyof T>).filter((key) => patch[key] !== undefined)
  if (keys.every((key) => patch[key] === node[key])) return node
  const next = { ...node }
  for (const key of keys) next[key] = patch[key] as T[keyof T]
  return next
}

function recolorNode(node: FreeformSceneNode, recolor: Recolor): FreeformSceneNode {
  switch (node.type) {
    case 'group': {
      const children = node.children.map((child) => recolorNode(child, recolor))
      return children.every((child, index) => child === node.children[index]) ? node : { ...node, children }
    }
    case 'text': {
      const spans = node.spans?.map((span) => {
        const color = span.color === undefined ? undefined : recolor(span.color)
        const highlight = span.highlight === undefined ? undefined : recolor(span.highlight)
        return color === span.color && highlight === span.highlight
          ? span
          : { ...span, ...(color ? { color } : {}), ...(highlight ? { highlight } : {}) }
      })
      return patched(node, {
        textFill: recolorPaint(node.textFill, recolor),
        shadow: recolorShadow(node.shadow, recolor),
        ...(node.stroke !== undefined ? { stroke: recolor(node.stroke) } : {}),
        ...(spans && spans.some((span, index) => span !== node.spans![index]) ? { spans } : {}),
      })
    }
    case 'shape':
      return patched(node, {
        fill: recolorFill(node.fill, recolor),
        stroke: recolor(node.stroke),
        shadow: recolorShadow(node.shadow, recolor),
      })
    case 'line':
      return patched(node, { stroke: recolor(node.stroke), shadow: recolorShadow(node.shadow, recolor) })
    case 'path':
      return patched(node, {
        fill: node.fill.type === 'transparent' ? node.fill : recolorPaint(node.fill, recolor),
        stroke: recolor(node.stroke),
        shadow: recolorShadow(node.shadow, recolor),
      })
    case 'image':
      return patched(node, { shadow: recolorShadow(node.shadow, recolor) })
  }
}

function recolorDocument(document: FreeformDocument, recolor: Recolor): FreeformDocument {
  const slides = document.slides.map((slide) => {
    const nodes = slide.nodes.map((node) => recolorNode(node, recolor))
    return patched(slide, {
      background: recolorFill(slide.background, recolor),
      ...(nodes.some((node, index) => node !== slide.nodes[index]) ? { nodes } : {}),
    })
  })
  return slides.some((slide, index) => slide !== document.slides[index]) ? { ...document, slides } : document
}

function refontNode(node: FreeformSceneNode, refont: (fontFamily: string, size: number) => string, scale: number): FreeformSceneNode {
  if (node.type === 'group') {
    const children = node.children.map((child) => refontNode(child, refont, scale * node.scale))
    return children.every((child, index) => child === node.children[index]) ? node : { ...node, children }
  }
  if (node.type !== 'text') return node
  return patched(node, { fontFamily: refont(node.fontFamily, node.fontSize * scale * node.scale) })
}

function refontDocument(document: FreeformDocument, refont: (fontFamily: string, size: number) => string): FreeformDocument {
  const slides = document.slides.map((slide) => {
    const nodes = slide.nodes.map((node) => refontNode(node, refont, 1))
    return nodes.every((node, index) => node === slide.nodes[index]) ? slide : { ...slide, nodes }
  })
  return slides.some((slide, index) => slide !== document.slides[index]) ? { ...document, slides } : document
}

// --- What a deck uses ---

/** Where a colour shows, weighed roughly by the area it covers on the pages. */
export interface DeckColor {
  color: string
  /** Total weight, the sum of the uses below. */
  weight: number
  background: number
  fill: number
  text: number
  line: number
  shadow: number
}

export interface DeckFont {
  fontFamily: string
  /** How many texts use it. */
  texts: number
  /** The largest size it is set in, in page pixels. */
  largest: number
}

type ColorRole = 'background' | 'fill' | 'text' | 'line' | 'shadow'

function paintColors(paint: SlideBackground): string[] {
  if (paint.type === 'transparent' || paint.type === 'image') return []
  if (paint.type === 'solid') return [paint.color]
  return 'stops' in paint ? paint.stops.map((stop) => stop.color) : [paint.from, paint.to]
}

function visitColors(
  document: FreeformDocument,
  visit: (color: string, role: ColorRole, weight: number, slide: FreeformSlide) => void,
): void {
  for (const slide of document.slides) {
    const page = slide.width * slide.height
    const add = (colors: string[], role: ColorRole, weight: number) => {
      for (const color of colors) visit(color.toLowerCase(), role, weight / colors.length, slide)
    }
    add(paintColors(slide.background), 'background', page)
    const walk = (nodes: readonly FreeformSceneNode[], scale: number) => {
      for (const node of nodes) {
        if (node.hidden) continue
        if (node.type === 'group') {
          walk(node.children, scale * node.scale)
          continue
        }
        const factor = scale * node.scale
        const area = node.width * node.height * factor * factor * (node.opacity ?? 1)
        if (node.shadow) add([node.shadow.color], 'shadow', area * 0.1)
        if (node.type === 'text') {
          const glyphs = [...node.text].length * (node.fontSize * factor) ** 2
          add(paintColors(node.textFill), 'text', glyphs)
          if (node.stroke !== undefined && (node.strokeWidth ?? 1) > 0) add([node.stroke], 'line', glyphs * 0.2)
          for (const span of node.spans ?? []) {
            const share = (span.end - span.start) * (node.fontSize * factor) ** 2
            if (span.color) add([span.color], 'text', share)
            if (span.highlight) add([span.highlight], 'fill', share * 1.3)
          }
        } else if (node.type === 'shape') {
          // A shape covering most of the page is its backdrop.
          add(paintColors(node.fill), area >= page * 0.6 ? 'background' : 'fill', area)
          if (node.strokeWidth > 0) add([node.stroke], 'line', (node.width + node.height) * 2 * node.strokeWidth * factor * factor)
        } else if (node.type === 'line') {
          if (node.strokeWidth > 0) add([node.stroke], 'line', node.width * node.strokeWidth * factor * factor)
        } else if (node.type === 'path') {
          add(paintColors(node.fill), 'fill', area * 0.5)
          if (node.strokeWidth > 0) add([node.stroke], 'line', area * 0.15)
        }
      }
    }
    walk(slide.nodes, 1)
  }
}

/** The colours a deck shows, the most prominent first. */
export function deckColors(document: FreeformDocument): DeckColor[] {
  const colors = new Map<string, DeckColor>()
  visitColors(document, (color, role, weight) => {
    let entry = colors.get(color)
    if (!entry) {
      entry = { color, weight: 0, background: 0, fill: 0, text: 0, line: 0, shadow: 0 }
      colors.set(color, entry)
    }
    entry[role] += weight
    entry.weight += weight
  })
  return [...colors.values()].sort((a, b) => b.weight - a.weight)
}

/** Every visible text in a deck, with its size in page pixels (group scale included). */
function eachText(document: FreeformDocument, visit: (node: FreeformTextElement, size: number) => void): void {
  const walk = (nodes: readonly FreeformSceneNode[], scale: number) => {
    for (const node of nodes) {
      if (node.hidden) continue
      if (node.type === 'group') walk(node.children, scale * node.scale)
      else if (node.type === 'text') visit(node, node.fontSize * scale * node.scale)
    }
  }
  for (const slide of document.slides) walk(slide.nodes, 1)
}

/** The fonts a deck uses, the one set largest first. */
export function deckFonts(document: FreeformDocument): DeckFont[] {
  const fonts = new Map<string, DeckFont>()
  eachText(document, (node, size) => {
    const entry = fonts.get(node.fontFamily) ?? { fontFamily: node.fontFamily, texts: 0, largest: 0 }
    entry.texts += 1
    entry.largest = Math.max(entry.largest, size)
    fonts.set(node.fontFamily, entry)
  })
  return [...fonts.values()].sort((a, b) => b.largest - a.largest || b.texts - a.texts)
}

/** The size most of a deck's characters are set in (the median by character), or null without text. */
export function deckBodySize(document: FreeformDocument): number | null {
  const sizes: Array<{ size: number; chars: number }> = []
  eachText(document, (node, size) => {
    const chars = [...node.text.replace(/\s/g, '')].length
    if (chars > 0) sizes.push({ size, chars })
  })
  const total = sizes.reduce((sum, entry) => sum + entry.chars, 0)
  if (total === 0) return null
  sizes.sort((a, b) => a.size - b.size)
  let seen = 0
  for (const entry of sizes) {
    seen += entry.chars
    if (seen * 2 >= total) return entry.size
  }
  return sizes[sizes.length - 1].size
}

// --- Keeping words readable ---

/** WCAG relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => toLinear(Number.parseInt(hex.slice(offset, offset + 2), 16)))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/** WCAG contrast ratio of two #RRGGBB colours. */
function contrast(first: string, second: string): number {
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** The contrast check_document asks of a text: 3:1 for large text, 4.5:1 otherwise. */
function contrastNeeded(node: FreeformTextElement): number {
  return node.fontSize >= 48 || (node.fontWeight === 'bold' && node.fontSize >= 40) ? 3 : 4.5
}

/** Headroom over the threshold, so the rendered page clears it too. */
const CONTRAST_MARGIN = 0.25

/**
 * The colour moved toward black or white, whichever stands out more against
 * `background`, just far enough to reach `needed`; its hue stays.
 */
function readableOn(color: string, background: string, needed: number): string {
  if (contrast(color, background) >= needed) return color
  const lab = hexToLab(color)
  const target = contrast('#000000', background) >= contrast('#ffffff', background) ? 0 : 1
  let near = 0
  let far = 1
  for (let step = 0; step < 24; step += 1) {
    const amount = (near + far) / 2
    const candidate = labToHex({
      l: lab.l + (target - lab.l) * amount,
      a: lab.a * (1 - amount),
      b: lab.b * (1 - amount),
    })
    if (contrast(candidate, background) >= needed) far = amount
    else near = amount
  }
  return labToHex({ l: lab.l + (target - lab.l) * far, a: lab.a * (1 - far), b: lab.b * (1 - far) })
}

function solidOf(paint: SlideBackground): string | null {
  return paint.type === 'solid' ? paint.color.toLowerCase() : null
}

interface PlacedLeaf {
  node: Exclude<FreeformSceneNode, { type: 'group' }>
  box: { x: number; y: number; width: number; height: number }
}

/** A slide's leaves bottom to top, with their boxes on the page (group offsets and scale applied, rotation ignored). */
function placedLeaves(slide: FreeformSlide): PlacedLeaf[] {
  const leaves: PlacedLeaf[] = []
  const walk = (nodes: readonly FreeformSceneNode[], originX: number, originY: number, scale: number) => {
    for (const node of nodes) {
      if (node.hidden) continue
      if (node.type === 'group') {
        walk(node.children, originX + node.x * scale, originY + node.y * scale, scale * node.scale)
        continue
      }
      const factor = scale * node.scale
      leaves.push({
        node,
        box: { x: originX + node.x * scale, y: originY + node.y * scale, width: node.width * factor, height: node.height * factor },
      })
    }
  }
  walk(slide.nodes, 0, 0, 1)
  return leaves
}

/**
 * Words a new palette left too faint against what they sit on — the nearest
 * opaque fill under the text's centre, else the page — take a lighter or
 * darker shade of their colour, as check_document would ask. Pictures and
 * gradients behind the words are left alone.
 */
function keepWordsReadable(document: FreeformDocument): FreeformDocument {
  const fixes = new Map<FreeformTextElement, FreeformTextElement>()
  for (const slide of document.slides) {
    const leaves = placedLeaves(slide)
    leaves.forEach(({ node, box }, index) => {
      if (node.type !== 'text' || (node.opacity ?? 1) < 0.7) return
      const centreX = box.x + box.width / 2
      const centreY = box.y + box.height / 2
      let background: string | null = solidOf(slide.background)
      for (const below of leaves.slice(0, index).reverse()) {
        const under = below.node
        if (under.type === 'text' || under.type === 'line') continue
        if (under.type === 'path' && under.fill.type === 'transparent') continue
        if (centreX < below.box.x || centreX > below.box.x + below.box.width) continue
        if (centreY < below.box.y || centreY > below.box.y + below.box.height) continue
        if ((under.opacity ?? 1) < 0.7) continue
        background = under.type === 'image' ? null : solidOf(under.fill)
        break
      }
      const needed = contrastNeeded(node) + CONTRAST_MARGIN
      const words = solidOf(node.textFill)
      let next = node
      if (background && words) {
        const color = readableOn(words, background, needed)
        if (color !== words) next = { ...next, textFill: { type: 'solid', color } }
      }
      if (node.spans) {
        const spans = node.spans.map((span) => {
          const behind = span.highlight ?? background
          const own = span.color ?? (span.highlight ? solidOf(next.textFill) : null)
          if (!behind || !own) return span
          const color = readableOn(own.toLowerCase(), behind.toLowerCase(), needed)
          return color === own.toLowerCase() ? span : { ...span, color }
        })
        if (spans.some((span, at) => span !== node.spans![at])) next = { ...next, spans }
      }
      if (next !== node) fixes.set(node, next)
    })
  }
  if (fixes.size === 0) return document
  const swap = (node: FreeformSceneNode): FreeformSceneNode => {
    if (node.type === 'group') {
      const children = node.children.map(swap)
      return children.every((child, at) => child === node.children[at]) ? node : { ...node, children }
    }
    return node.type === 'text' ? fixes.get(node) ?? node : node
  }
  return {
    ...document,
    slides: document.slides.map((slide) => {
      const nodes = slide.nodes.map(swap)
      return nodes.every((node, at) => node === slide.nodes[at]) ? slide : { ...slide, nodes }
    }),
  }
}

// --- Swaps ---

/**
 * How a palette lands on a deck. The deck's page colour becomes the
 * palette's page colour and its main text colour the palette's text colour;
 * every other near-neutral colour (tints, greys, rules, cards) keeps its place
 * between the two, so a card that was a shade off the page stays a shade off
 * it; colours of their own take the palette's accents, the most prominent
 * first. (restyleDocument then shades any words this leaves too faint.)
 */
export function paletteColorMap(document: FreeformDocument, palette: Palette): Map<string, string> {
  const colors = deckColors(document)
  const map = new Map<string, string>()
  if (colors.length === 0) return map
  const byBackground = [...colors].sort((a, b) => b.background - a.background)[0]
  const page = byBackground.background > 0 ? byBackground : colors[0]
  const pageLightness = hexToLab(page.color).l
  const apart = (entry: DeckColor) => Math.abs(hexToLab(entry.color).l - pageLightness)
  // The words: the text colour most used among those that stand off the page (light text on a dark
  // closing page doesn't count); failing that, whatever stands off it most.
  const words = colors.filter((entry) => entry.text > 0 && apart(entry) >= MIN_WORDS_APART)
    .sort((a, b) => b.text - a.text)[0]
    ?? colors.filter((entry) => entry !== page).sort((a, b) => apart(b) - apart(a))[0]
  map.set(page.color, palette.background)
  if (words) map.set(words.color, palette.text)
  const from = pageLightness
  const to = words ? hexToLab(words.color).l : (from > 0.5 ? 0 : 1)
  let accent = 0
  for (const entry of colors) {
    if (map.has(entry.color)) continue
    if (chroma(entry.color) < NEUTRAL_CHROMA || palette.accents.length === 0) {
      // Its place between page and words; one beyond the page moves the same distance toward the words.
      const position = to === from ? 0 : (hexToLab(entry.color).l - from) / (to - from)
      map.set(entry.color, mix(palette.background, palette.text, Math.min(1, Math.abs(position))))
    } else {
      map.set(entry.color, palette.accents[accent % palette.accents.length])
      accent += 1
    }
  }
  return map
}

function validFamily(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_FONT_FAMILY_LENGTH
}

/**
 * Whether a restyle request is well formed: known palette and font set ids,
 * #RRGGBB colours on both sides, non-empty font families. Returns the
 * problem, or null.
 */
export function restyleRequestProblem(request: RestyleRequest): string | null {
  if (request.palette !== undefined && !PALETTES.some((palette) => palette.id === request.palette)) {
    return `未知的配色 palette：${String(request.palette)}`
  }
  if (request.fontSet !== undefined && !FONT_SETS.some((set) => set.id === request.fontSet)) {
    return `未知的字体组合 fontSet：${String(request.fontSet)}`
  }
  if (request.colors !== undefined) {
    if (typeof request.colors !== 'object' || request.colors === null || Array.isArray(request.colors)) return 'colors 必须是 { "#原色": "#新色" } 对象'
    for (const [from, to] of Object.entries(request.colors)) {
      if (!isHexColor(from) || !isHexColor(to)) return `colors 里的颜色必须是 #RRGGBB：${from} → ${String(to)}`
    }
  }
  if (request.fonts !== undefined) {
    if (typeof request.fonts !== 'object' || request.fonts === null || Array.isArray(request.fonts)) return 'fonts 必须是 { "原字体": "新字体" } 对象'
    for (const [from, to] of Object.entries(request.fonts)) {
      if (!validFamily(from) || !validFamily(to)) return `fonts 里的字体名不能为空：${from} → ${String(to)}`
    }
  }
  if (request.palette === undefined && request.fontSet === undefined && request.colors === undefined && request.fonts === undefined) {
    return 'document/restyle 至少要给 palette、fontSet、colors、fonts 之一'
  }
  return null
}

/** Restyle every page; the document itself when the request is malformed or changes nothing. */
export function restyleDocument(document: FreeformDocument, request: RestyleRequest): FreeformDocument {
  if (restyleRequestProblem(request)) return document
  let next = document

  const colors = new Map<string, string>()
  const palette = PALETTES.find((candidate) => candidate.id === request.palette)
  if (palette) paletteColorMap(document, palette).forEach((to, from) => colors.set(from, to))
  for (const [from, to] of Object.entries(request.colors ?? {})) colors.set(from.toLowerCase(), to.toLowerCase())
  if (colors.size > 0) {
    next = recolorDocument(next, (color) => {
      const to = colors.get(color.toLowerCase())
      return to === undefined || to === color.toLowerCase() ? color : to
    })
  }
  // A palette is a suggestion and keeps the words legible; exact replacements are taken as given.
  if (palette) next = keepWordsReadable(next)

  const fontSet = FONT_SETS.find((candidate) => candidate.id === request.fontSet)
  const bodySize = fontSet ? deckBodySize(document) : null
  const fonts = request.fonts ?? {}
  if (fontSet || Object.keys(fonts).length > 0) {
    next = refontDocument(next, (fontFamily, size) => {
      if (Object.prototype.hasOwnProperty.call(fonts, fontFamily)) return fonts[fontFamily]
      if (!fontSet) return fontFamily
      return bodySize !== null && size >= bodySize * HEADING_SCALE ? fontSet.heading : fontSet.body
    })
  }
  return next
}
