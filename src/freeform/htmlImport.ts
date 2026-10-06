// HTML pages into a freeform document.
//
// htmlImportRun.ts lays the HTML out in an iframe. prepareHtmlDocument makes
// it readable: our fonts stand in for the ones we don't have, ::before and
// ::after become real elements with boxes to measure, and turned or scaled
// elements are set upright. importHtmlDocument then reads the layout back —
// every box, text, picture and SVG drawing becomes a freeform node, in the
// order CSS paints them — and lists what it had to approximate in the notes.

import { randomId } from '../uid'
import { createDefaultImageFraming } from './imageFraming'
import {
  type Affine,
  type CssGradient,
  type CssShadow,
  type Rgba,
  applyAffine,
  applyTextTransform,
  blendModeOf,
  blendOver,
  chooseFont,
  gradientColorAt,
  gradientPaint,
  hexOf,
  individualTransform,
  isBoldWeight,
  isTranslation,
  listMarkerText,
  multiplyAffine,
  parseFilter,
  parseGradient,
  parsePx,
  parseRgb,
  parseShadows,
  parseTransform,
  pseudoContentText,
  similarityOf,
  splitTopLevel,
} from './htmlImportCss'
import { type CornerRadii, ellipsePath, parsePoints, polylinePath, roundedRectPath, svgRectPath, transformPathData } from './htmlImportPaths'
import { pathDataBounds } from './pathData'
import { listIndentEm } from './textLayout'
import type {
  BlendMode,
  ColorPaint,
  FreeformDocument,
  FreeformElement,
  FreeformGroupNode,
  FreeformImageElement,
  FreeformLineElement,
  FreeformPathElement,
  FreeformSceneNode,
  FreeformShapeElement,
  FreeformSlide,
  FreeformTextElement,
  ImageFraming,
  ImagePaint,
  RichTextSpan,
  SceneFilter,
  ShadowPaint,
  SlideBackground,
} from './types'

export interface HtmlImportNote {
  /** 1-based page number. */
  page: number
  /** What it is about: a tag with its id or class, or the start of a text. */
  target: string
  message: string
}

/** A background a paint can't hold (a gradient that fades, a repeating one), to be drawn as a picture. */
export interface RasterRequest {
  backgroundImage: string
  backgroundSize: string
  backgroundPosition: string
  backgroundRepeat: string
  width: number
  height: number
}

export interface HtmlImportOptions {
  /** The size of a page the HTML doesn't size: no <section>, or one without a size. */
  width: number
  height: number
  newId?: () => string
  /** Draws a RasterRequest as a picture (a data URL); without it such backgrounds are approximated. */
  rasterize?: (request: RasterRequest) => Promise<string | null>
}

export interface HtmlImportResult {
  document: FreeformDocument
  notes: HtmlImportNote[]
}

/** Inner padding of a freeform text box (.freeform-preview-textbox). */
const TEXT_PADDING = 8
const PAGE_MIN = 128
const PAGE_MAX = 4096
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 }

const SKIPPED_TAGS = new Set(['HEAD', 'SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META', 'TITLE'])
const REPLACED_TAGS = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'IFRAME', 'INPUT', 'TEXTAREA', 'SELECT', 'OBJECT', 'EMBED', 'PICTURE'])
const SVG_SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])
const SVG_HIDDEN_CONTAINERS = new Set(['defs', 'clipPath', 'mask', 'marker', 'pattern', 'symbol', 'linearGradient', 'radialGradient', 'filter'])

/** What prepareHtmlDocument took off the page, for the import to put back. */
export interface PreparedHtml {
  /** Turned, scaled or skewed elements, now upright: their transform and its origin in their border box. */
  transforms: Map<Element, { matrix: Affine; origin: { x: number; y: number } }>
  /** Families the HTML named that our fonts stand in for. */
  replacedFonts: Set<string>
  /** Elements the import should mention, with why. */
  notes: Array<{ element: Element; message: string }>
}

function styleOf(element: Element): CSSStyleDeclaration {
  return (element.ownerDocument.defaultView as Window).getComputedStyle(element)
}

function isSvgElement(element: Element): element is SVGElement {
  return element.namespaceURI === 'http://www.w3.org/2000/svg'
}

function setImportant(element: Element, name: string, value: string): void {
  ;(element as HTMLElement).style.setProperty(name, value, 'important')
}

function htmlElementsOf(root: Element): Element[] {
  return Array.from(root.querySelectorAll('*')).filter((element) => !SKIPPED_TAGS.has(element.tagName) && !isSvgElement(element))
}

/** Families a browser sets when the page sets none (form controls get their own): the page's default font, unremarked. */
const BROWSER_DEFAULT_FAMILIES = new Set(['times', 'times new roman', 'arial', 'helvetica', 'system-ui', '-webkit-small-control', 'monospace', 'courier', 'courier new'])

/** The family a page gets when it names none, read off the browser itself. */
function browserDefaultFamily(doc: Document): string {
  const probe = doc.createElement('span')
  probe.style.fontFamily = 'initial'
  doc.body.append(probe)
  const family = styleOf(probe).fontFamily
  probe.remove()
  return family
}

/** Our fonts in place of the stack each element asks for, and weights cut to regular and bold. */
function normalizeFonts(elements: readonly Element[], prepared: PreparedHtml): void {
  if (elements.length === 0) return
  const fallback = browserDefaultFamily(elements[0].ownerDocument)
  // Read everything first: setting a font changes what descendants inherit.
  const readings = elements.map((element) => {
    const style = styleOf(element)
    return { element, family: style.fontFamily, bold: isBoldWeight(style.fontWeight) }
  })
  for (const { element, family, bold } of readings) {
    // A family the page never chose (the browser's default, a button's own) is our default sans.
    const unchosen = family === fallback || (!family.includes(',') && BROWSER_DEFAULT_FAMILIES.has(family.replace(/^['"]|['"]$/g, '').toLowerCase()))
    const choice = unchosen ? chooseFont('sans-serif') : chooseFont(family)
    const hasWords = Array.from(element.childNodes).some((node) => node.nodeType === 3 && (node.textContent ?? '').trim())
    if (choice.replaced && hasWords) prepared.replacedFonts.add(choice.replaced)
    setImportant(element, 'font-family', choice.fontFamily)
    setImportant(element, 'font-weight', bold ? '700' : '400')
  }
}

function snapshot(style: CSSStyleDeclaration): Array<[string, string]> {
  const entries: Array<[string, string]> = []
  for (let index = 0; index < style.length; index += 1) {
    const name = style[index]
    entries.push([name, style.getPropertyValue(name)])
  }
  return entries
}

/**
 * ::before and ::after as real elements carrying the pseudo-element's style,
 * so the import can measure them. The element's children are frozen in
 * their current style first: a new first or last child would otherwise
 * change what :first-child and the like select.
 */
function materializePseudoElements(doc: Document, prepared: PreparedHtml): Element[] {
  const view = doc.defaultView as Window
  const pending: Array<{ element: Element; which: 'before' | 'after'; style: Array<[string, string]>; content: { text: string } | { image: string } }> = []
  for (const element of htmlElementsOf(doc.body)) {
    if (REPLACED_TAGS.has(element.tagName)) continue
    for (const which of ['before', 'after'] as const) {
      const style = view.getComputedStyle(element, `::${which}`)
      const content = pseudoContentText(style.content, (name) => element.getAttribute(name))
      if (!content || style.display === 'none') continue
      if ('unsupported' in content) {
        prepared.notes.push({ element, message: `::${which} 的 content 用了 ${content.unsupported}，没有转` })
        continue
      }
      pending.push({ element, which, style: snapshot(style), content })
    }
  }
  if (pending.length === 0) return []
  const owners = new Set(pending.map((entry) => entry.element))
  const frozen = new Map<Element, Array<[string, string]>>()
  for (const owner of owners) {
    for (const element of [owner, ...Array.from(owner.querySelectorAll('*'))]) {
      if (!frozen.has(element) && !SKIPPED_TAGS.has(element.tagName)) frozen.set(element, snapshot(styleOf(element)))
    }
  }
  for (const [element, entries] of frozen) {
    for (const [name, value] of entries) setImportant(element, name, value)
  }
  const created: Element[] = []
  for (const { element, which, style, content } of pending) {
    const box = 'image' in content ? doc.createElement('img') : doc.createElement('span')
    for (const [name, value] of style) setImportant(box, name, value)
    if ('image' in content) (box as HTMLImageElement).src = content.image
    else box.textContent = content.text
    box.setAttribute('data-dc-pseudo', which)
    element.setAttribute(`data-dc-${which}`, '')
    if (which === 'before') element.prepend(box)
    else element.append(box)
    created.push(box)
  }
  const off = doc.createElement('style')
  off.textContent = '[data-dc-before]::before{content:none!important}[data-dc-after]::after{content:none!important}'
  doc.head.append(off)
  return created
}

function transformOf(element: Element, style: CSSStyleDeclaration): Affine | null {
  // Percentages in `translate` are of the untransformed box.
  // (The document is another frame's: its elements fail `instanceof` against ours.)
  const box = 'offsetWidth' in element
    ? { width: (element as HTMLElement).offsetWidth, height: (element as HTMLElement).offsetHeight }
    : { width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }
  const individual = individualTransform(style.translate, style.rotate, style.scale, box)
  const transform = parseTransform(style.transform)
  if (!individual || !transform) return null
  return multiplyAffine(individual, transform)
}

/** Takes turns, scales and skews off (translations stay, they move boxes exactly), recording each. */
function uprightTransforms(elements: readonly Element[], prepared: PreparedHtml): void {
  const readings = elements.map((element) => {
    const style = styleOf(element)
    return { element, matrix: transformOf(element, style), origin: style.transformOrigin }
  })
  for (const { element, matrix, origin } of readings) {
    if (matrix && isTranslation(matrix)) continue
    if (!matrix) {
      prepared.notes.push({ element, message: '3D 变换没法还原，按不变换处理' })
    } else {
      const [x = '0', y = '0'] = origin.split(/\s+/)
      prepared.transforms.set(element, { matrix, origin: { x: parsePx(x) ?? 0, y: parsePx(y) ?? 0 } })
    }
    for (const name of ['transform', 'rotate', 'scale', 'translate']) setImportant(element, name, 'none')
  }
}

/** Lays the document out again and waits for the fonts that layout asked for. */
export async function settleLayout(doc: Document): Promise<void> {
  const view = doc.defaultView as Window
  const frame = () => new Promise<void>((resolve) => {
    // A frame, or a short wait where frames don't run.
    const timer = view.setTimeout(resolve, 100)
    view.requestAnimationFrame(() => {
      view.clearTimeout(timer)
      resolve()
    })
  })
  doc.body.getBoundingClientRect()
  await doc.fonts.ready
  await frame()
  await frame()
  doc.body.getBoundingClientRect()
  await doc.fonts.ready
}

/**
 * Makes a laid-out HTML document readable by importHtmlDocument. Fonts are
 * swapped first and allowed to load, since the ::before / ::after copies
 * freeze the sizes their neighbours have at that point.
 */
export async function prepareHtmlDocument(doc: Document): Promise<PreparedHtml> {
  const prepared: PreparedHtml = { transforms: new Map(), replacedFonts: new Set(), notes: [] }
  normalizeFonts([doc.body, ...htmlElementsOf(doc.body), ...Array.from(doc.body.querySelectorAll('svg text, svg tspan'))], prepared)
  await settleLayout(doc)
  const created = materializePseudoElements(doc, prepared)
  normalizeFonts(created, prepared)
  await settleLayout(doc)
  uprightTransforms([...htmlElementsOf(doc.body), ...Array.from(doc.body.querySelectorAll('svg'))], prepared)
  await settleLayout(doc)
  return prepared
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface InlineGroup {
  /** The block whose lines hold these nodes. */
  container: Element
  nodes: Node[]
  /** A box painted on its own (an inline-block) sits just before / after these words, maybe on their line. */
  afterBox?: boolean
  beforeBox?: boolean
}

type PaintOp =
  | { kind: 'box'; element: Element }
  | { kind: 'text'; group: InlineGroup }
  | { kind: 'replaced'; element: Element }
  | { kind: 'marker'; element: Element }
  /** A <ul> / <ol> held as one list text (v20). */
  | { kind: 'list'; element: Element }
  /** A turned element, or one asked to stay together (data-group): its nodes become a group. */
  | { kind: 'context'; element: Element; ops: PaintOp[] }

type ElementKind = 'skip' | 'layer' | 'atomic' | 'block' | 'inline' | 'br' | 'contents'

export interface Run {
  text: string
  node: Text | null
  element: Element
  /** [start, end) in `text` ↔ [start, end) in the node's data, chunk by chunk. */
  map: Array<[number, number, number, number]>
}

/** East Asian wide characters, between which a source line break may vanish. */
const WIDE = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/

/** Collapsing white space of `white-space: normal / nowrap / pre-line` runs. */
function collapses(whiteSpace: string): boolean {
  return whiteSpace !== 'pre' && whiteSpace !== 'pre-wrap' && whiteSpace !== 'break-spaces'
}

/**
 * Spaces as CSS collapses them across a line of runs: one where several
 * meet, none at the start, at the end, or beside a line break.
 */
export function collapseSpaces(runs: readonly Run[], collapsible: (run: Run) => boolean): Run[] {
  // Each run's characters: kept or dropped.
  const keep = runs.map((run) => Array.from(run.text, () => true))
  let previousSpace: { run: number; index: number } | null = null
  let atLineStart = true
  for (const [runIndex, run] of runs.entries()) {
    const free = collapsible(run)
    for (let index = 0; index < run.text.length; index += 1) {
      const char = run.text[index]
      if (char === '\n') {
        if (previousSpace) keep[previousSpace.run][previousSpace.index] = false
        previousSpace = null
        atLineStart = true
        continue
      }
      if (char === ' ' && free) {
        if (atLineStart || previousSpace) keep[runIndex][index] = false
        else previousSpace = { run: runIndex, index }
        continue
      }
      previousSpace = null
      atLineStart = false
    }
  }
  if (previousSpace) keep[previousSpace.run][previousSpace.index] = false
  return runs.map((run, runIndex) => {
    if (keep[runIndex].every(Boolean)) return run
    let text = ''
    const map: Run['map'] = []
    for (const [start, end, domStart, domEnd] of run.map) {
      let piece = ''
      for (let index = start; index < end; index += 1) if (keep[runIndex][index]) piece += run.text[index]
      if (!piece) continue
      map.push([text.length, text.length + piece.length, domStart, domEnd])
      text += piece
    }
    return { ...run, text, map }
  }).filter((run) => run.text.length > 0)
}

/** The part of a run between two offsets in its text. */
function sliceRun(run: Run, from: number, to: number): Run {
  const map: Run['map'] = []
  for (const [start, end, domStart, domEnd] of run.map) {
    const a = Math.max(start, from)
    const b = Math.min(end, to)
    if (b <= a) continue
    // A chunk drawn letter for letter is cut in step; a collapsed space keeps its whole run.
    const even = end - start === domEnd - domStart
    map.push([a - from, b - from, even ? domStart + (a - start) : domStart, even ? domStart + (b - start) : domEnd])
  }
  return { ...run, text: run.text.slice(from, to), map }
}

type Area = Rect & { radii: CornerRadii }

const NO_RADII: CornerRadii = { topLeft: [0, 0], topRight: [0, 0], bottomRight: [0, 0], bottomLeft: [0, 0] }

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return right - x > 0.01 && bottom - y > 0.01 ? { x, y, width: right - x, height: bottom - y } : null
}

function sameRect(a: Rect, b: Rect, tolerance = 1): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance
    && Math.abs(a.width - b.width) <= tolerance && Math.abs(a.height - b.height) <= tolerance
}

function hasRadius(radii: CornerRadii): boolean {
  return [radii.topLeft, radii.topRight, radii.bottomRight, radii.bottomLeft].some(([x, y]) => x > 0.01 && y > 0.01)
}

function insetRadii(radii: CornerRadii, top: number, right: number, bottom: number, left: number): CornerRadii {
  const shrink = (corner: [number, number], horizontal: number, vertical: number): [number, number] => [
    Math.max(0, corner[0] - horizontal),
    Math.max(0, corner[1] - vertical),
  ]
  return {
    topLeft: shrink(radii.topLeft, left, top),
    topRight: shrink(radii.topRight, right, top),
    bottomRight: shrink(radii.bottomRight, right, bottom),
    bottomLeft: shrink(radii.bottomLeft, left, bottom),
  }
}

function describe(element: Element): string {
  const pseudo = element.getAttribute('data-dc-pseudo')
  if (pseudo && element.parentElement) return `${describe(element.parentElement)}::${pseudo}`
  if (element.getAttribute('data-name')) return element.getAttribute('data-name') as string
  const tag = element.tagName.toLowerCase()
  if (element.id) return `${tag}#${element.id}`
  const className = typeof element.className === 'string' ? element.className.trim().split(/\s+/)[0] : ''
  if (className) return `${tag}.${className}`
  const text = (element.textContent ?? '').trim().replace(/\s+/g, ' ')
  return text ? `${tag}「${text.slice(0, 12)}${text.length > 12 ? '…' : ''}」` : tag
}

function textName(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 16 ? `${flat.slice(0, 16)}…` : flat || '文本'
}

/** Reads one page of a prepared HTML document. */
class PageReader {
  private readonly styles = new Map<Element, CSSStyleDeclaration>()
  private readonly opacities = new Map<Element, number>()
  private readonly normalLineHeights = new Map<string, number>()
  private readonly view: Window

  constructor(
    private readonly doc: Document,
    private readonly page: Element,
    private readonly origin: { x: number; y: number },
    private readonly size: { width: number; height: number },
    private readonly prepared: PreparedHtml,
    private readonly options: Required<Pick<HtmlImportOptions, 'newId'>> & HtmlImportOptions,
    private readonly note: (element: Element | null, message: string) => void,
    private readonly pictureSize: (src: string) => { width: number; height: number } | null,
  ) {
    this.view = doc.defaultView as Window
  }

  style(element: Element): CSSStyleDeclaration {
    let style = this.styles.get(element)
    if (!style) {
      style = this.view.getComputedStyle(element)
      this.styles.set(element, style)
    }
    return style
  }

  color(value: string | null | undefined): Rgba | null {
    if (!value) return null
    const parsed = parseRgb(value)
    if (parsed) return parsed
    // A colour space the parser doesn't read: let the browser say what it is.
    const css = (this.view as unknown as { CSS?: { supports(property: string, value: string): boolean } }).CSS
    if (!css?.supports('color', value)) return null
    const probe = this.doc.createElement('span')
    probe.style.color = value
    this.doc.body.append(probe)
    const resolved = parseRgb(this.view.getComputedStyle(probe).color)
    probe.remove()
    return resolved
  }

  private readonly resolveColor = (value: string) => this.color(value)

  /** A viewport rect in page coordinates. */
  rel(rect: DOMRect | Rect): Rect {
    const x = 'left' in rect ? rect.left : rect.x
    const y = 'top' in rect ? rect.top : rect.y
    return { x: x - this.origin.x, y: y - this.origin.y, width: rect.width, height: rect.height }
  }

  private pageRect(): Rect {
    return { x: 0, y: 0, width: this.size.width, height: this.size.height }
  }

  /** Opacity down the chain of ancestors (CSS fades a whole subtree; each node carries its share). */
  opacityOf(element: Element): number {
    const cached = this.opacities.get(element)
    if (cached !== undefined) return cached
    const own = Number.parseFloat(this.style(element).opacity)
    const parent = element === this.page || !element.parentElement ? 1 : this.opacityOf(element.parentElement)
    const filterOpacity = parseFilter(this.style(element).filter, this.resolveColor).opacity
    const value = (Number.isFinite(own) ? own : 1) * filterOpacity * parent
    this.opacities.set(element, value)
    return value
  }

  /** The nearest filter and blend mode up the chain: both act on everything under them. */
  private appearanceOf(element: Element): { filter?: SceneFilter; blendMode?: BlendMode; dropShadow: CssShadow | null } {
    let filter: SceneFilter | undefined
    let blendMode: BlendMode | undefined
    let dropShadow: CssShadow | null = null
    for (let current: Element | null = element; current; current = current === this.page ? null : current.parentElement) {
      const style = this.style(current)
      if (!filter && style.filter && style.filter !== 'none') {
        const reading = parseFilter(style.filter, this.resolveColor)
        if (Object.keys(reading.filter).length > 0) filter = reading.filter
        if (reading.dropShadow && current === element) dropShadow = reading.dropShadow
        if (reading.unsupported.length > 0) this.note(current, `滤镜 ${reading.unsupported.join('、')} 没有对应的设置，去掉了`)
      }
      if (!blendMode && style.mixBlendMode && style.mixBlendMode !== 'normal') {
        const mode = blendModeOf(style.mixBlendMode)
        if (mode) blendMode = mode
        else this.note(current, `混合模式 ${style.mixBlendMode} 没有对应的设置`)
      }
      if (current === element) {
        if (style.backdropFilter && style.backdropFilter !== 'none') this.note(current, '背景模糊（backdrop-filter）没法还原，去掉了')
        if (style.clipPath && style.clipPath !== 'none') this.note(current, '裁切形状（clip-path）没法还原，按原来的方框画出')
        const mask = style.getPropertyValue('mask-image') || style.getPropertyValue('-webkit-mask-image')
        if (mask && mask !== 'none') this.note(current, '遮罩（mask）没法还原，去掉了')
      }
    }
    return { ...(filter ? { filter } : {}), ...(blendMode ? { blendMode } : {}), dropShadow }
  }

  /** What shows through behind an element: the nearest opaque background up the chain, else the page's. */
  backdropOf(element: Element): Rgba {
    for (let current = element.parentElement; current; current = current === this.page ? null : current.parentElement) {
      const style = this.style(current)
      const color = this.color(style.backgroundColor)
      if (color && color.a > 0.98) return color
      const firstLayer = splitTopLevel(style.backgroundImage)[0]
      if (firstLayer && firstLayer !== 'none') {
        const rect = current.getBoundingClientRect()
        const gradient = parseGradient(firstLayer, rect.width, rect.height, this.resolveColor)
        if (gradient) return blendOver(gradientColorAt(gradient.stops, 0.5), WHITE)
      }
    }
    return this.pageBackdrop
  }

  pageBackdrop: Rgba = WHITE

  private isFlexOrGridItem(element: Element): boolean {
    const parent = element.parentElement
    if (!parent) return false
    const display = this.style(parent).display
    return display.includes('flex') || display.includes('grid')
  }

  private createsContext(element: Element, style: CSSStyleDeclaration): boolean {
    if (this.prepared.transforms.has(element) || element.hasAttribute('data-group')) return true
    const positioned = style.position !== 'static'
    const zAuto = style.zIndex === 'auto'
    if (style.position === 'fixed' || style.position === 'sticky') return true
    if (positioned && !zAuto) return true
    if (!zAuto && this.isFlexOrGridItem(element)) return true
    if (Number.parseFloat(style.opacity) < 1) return true
    if (style.transform !== 'none' || style.translate !== 'none' || style.rotate !== 'none' || style.scale !== 'none') return true
    if (style.filter !== 'none' || style.mixBlendMode !== 'normal' || style.isolation === 'isolate') return true
    if (style.clipPath !== 'none' || style.backdropFilter !== 'none') return true
    const mask = style.getPropertyValue('mask-image') || style.getPropertyValue('-webkit-mask-image')
    if (mask && mask !== 'none') return true
    return /transform|opacity|filter/.test(style.willChange)
  }

  private zOf(style: CSSStyleDeclaration): number {
    const z = Number.parseInt(style.zIndex, 10)
    return Number.isFinite(z) ? z : 0
  }

  private isReplaced(element: Element): boolean {
    return REPLACED_TAGS.has(element.tagName.toUpperCase())
  }

  classify(element: Element): ElementKind {
    if (SKIPPED_TAGS.has(element.tagName.toUpperCase())) return 'skip'
    const style = this.style(element)
    if (style.display === 'none') return 'skip'
    if (Number.parseFloat(style.opacity) === 0) return 'skip'
    if (element.tagName === 'BR') return 'br'
    if (style.display === 'contents') return 'contents'
    if (style.position !== 'static' || this.createsContext(element, style)) return 'layer'
    if (this.isReplaced(element)) return 'atomic'
    const display = style.display
    if (display === 'inline-block' || display === 'inline-flex' || display === 'inline-grid' || display === 'inline-table') return 'atomic'
    if (this.isFlexOrGridItem(element)) return 'atomic'
    if (display === 'inline' || display.startsWith('ruby')) return 'inline'
    return 'block'
  }

  /** Child nodes as the box tree sees them: display: contents elements give way to their children. */
  private flowChildren(element: Element): Node[] {
    const out: Node[] = []
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE && this.classify(node as Element) === 'contents') out.push(...this.flowChildren(node as Element))
      else out.push(node)
    }
    return out
  }

  /** The painting order of a stacking context's content (CSS 2.1 Appendix E, simplified). */
  paint(root: Element): PaintOp[] {
    const negative: Array<{ z: number; order: number; element: Element }> = []
    const layers: Array<{ z: number; order: number; element: Element }> = []
    const blocks: Element[] = []
    const inline: Array<{ kind: 'text'; group: InlineGroup } | { kind: 'atomic'; element: Element } | { kind: 'marker' | 'list'; element: Element }> = []
    let order = 0
    const layer = (element: Element) => {
      const style = this.style(element)
      const entry = { z: this.createsContext(element, style) ? this.zOf(style) : 0, order: order++, element }
      if (entry.z < 0) negative.push(entry)
      else layers.push(entry)
    }
    // Inside inline content, boxes of their own are painted apart from the words.
    const scanInline = (element: Element) => {
      for (const child of Array.from(element.children)) {
        const kind = this.classify(child)
        if (kind === 'skip' || kind === 'br') continue
        if (kind === 'layer') layer(child)
        else if (kind === 'atomic') inline.push({ kind: 'atomic', element: child })
        else if (kind === 'block') {
          blocks.push(child)
          visit(child)
        } else scanInline(child)
      }
    }
    const visit = (container: Element) => {
      const pending: Node[] = []
      let afterBox = false
      const flush = (beforeBox = false) => {
        if (pending.some((node) => (node.textContent ?? '').trim().length > 0)) {
          inline.push({ kind: 'text', group: { container, nodes: [...pending], afterBox, beforeBox } })
        }
        pending.length = 0
        afterBox = false
      }
      if (this.style(container).display === 'list-item') inline.push({ kind: 'marker', element: container })
      for (const node of this.flowChildren(container)) {
        if (node.nodeType === Node.TEXT_NODE) {
          pending.push(node)
          continue
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        const element = node as Element
        const kind = this.classify(element)
        if (kind === 'skip') continue
        if (kind === 'layer') {
          // Out of the flow: the words around it carry on.
          layer(element)
          continue
        }
        if (kind === 'br' || kind === 'inline') {
          pending.push(element)
          if (kind === 'inline') scanInline(element)
          continue
        }
        const sharesLine = kind === 'atomic' && !this.isFlexOrGridItem(element)
        flush(sharesLine)
        if (kind === 'atomic') {
          inline.push({ kind: 'atomic', element })
          afterBox = sharesLine
        } else if (this.simpleList(element)) {
          // Its box paints with the blocks, its words as one list text with the inline content.
          blocks.push(element)
          inline.push({ kind: 'list', element })
        } else {
          blocks.push(element)
          visit(element)
        }
      }
      flush()
    }
    // A list painted on its own (positioned, say) is still one list text.
    if (this.simpleList(root)) inline.push({ kind: 'list', element: root })
    else visit(root)
    const byZ = (a: { z: number; order: number }, b: { z: number; order: number }) => a.z - b.z || a.order - b.order
    negative.sort(byZ)
    layers.sort(byZ)
    // A page that isn't a stacking context paints its background over its z-index < 0 content.
    const buried = root === this.page && !this.createsContext(root, this.style(root))
    return [
      ...(buried ? [] : negative.flatMap((entry) => this.paintAsContext(entry.element))),
      ...blocks.map((element): PaintOp => ({ kind: 'box', element })),
      ...inline.flatMap((item): PaintOp[] => {
        if (item.kind === 'text') return [{ kind: 'text', group: item.group }]
        if (item.kind === 'marker' || item.kind === 'list') return [{ kind: item.kind, element: item.element }]
        return this.paintAsContext(item.element)
      }),
      ...layers.flatMap((entry) => this.paintAsContext(entry.element)),
    ]
  }

  /** An element painted whole: its own box, then its content. */
  private paintAsContext(element: Element): PaintOp[] {
    const ops: PaintOp[] = this.isReplaced(element)
      ? [{ kind: 'box', element }, { kind: 'replaced', element }]
      : [{ kind: 'box', element }, ...this.paint(element)]
    return this.prepared.transforms.has(element) || element.hasAttribute('data-group')
      ? [{ kind: 'context', element, ops }]
      : ops
  }

  async nodesOf(ops: readonly PaintOp[]): Promise<FreeformSceneNode[]> {
    const nodes: FreeformSceneNode[] = []
    for (const op of ops) {
      if (op.kind === 'box') nodes.push(...await this.boxNodes(op.element))
      else if (op.kind === 'text') nodes.push(...await this.inlineBoxes(op.group), ...this.textNodes(op.group))
      else if (op.kind === 'replaced') nodes.push(...this.replacedNodes(op.element))
      else if (op.kind === 'marker') nodes.push(...this.markerNodes(op.element))
      else if (op.kind === 'list') nodes.push(...this.listNodes(op.element))
      else nodes.push(...this.wrap(op.element, await this.nodesOf(op.ops)))
    }
    return nodes
  }

  private id(): string {
    return this.options.newId()
  }

  private base(name: string, rect: Rect) {
    return {
      id: this.id(),
      name,
      locked: false,
      hidden: false,
      x: rounded(rect.x),
      y: rounded(rect.y),
      width: Math.max(0.01, rounded(rect.width)),
      height: Math.max(0.01, rounded(rect.height)),
      rotation: 0,
      scale: 1,
    }
  }

  private shadowOf(shadow: CssShadow | null | undefined, backdrop: Rgba): ShadowPaint | undefined {
    if (!shadow || shadow.color.a <= 0.01) return undefined
    // A shadow paints one opaque colour: a faint one is that colour over what lies behind.
    const color = shadow.color.a < 1 ? blendOver(shadow.color, backdrop) : shadow.color
    return {
      color: hexOf(color),
      blur: Math.min(400, rounded(shadow.blur)),
      offsetX: Math.max(-1000, Math.min(1000, rounded(shadow.x))),
      offsetY: Math.max(-1000, Math.min(1000, rounded(shadow.y))),
    }
  }

  private finishLeaf<T extends FreeformElement>(
    node: T,
    element: Element,
    alpha: number,
    extras: { shadow?: ShadowPaint; appearance?: { filter?: SceneFilter; blendMode?: BlendMode } } = {},
  ): T {
    const opacity = Math.max(0, Math.min(1, alpha * this.opacityOf(element)))
    const appearance = extras.appearance ?? this.appearanceOf(element)
    return {
      ...node,
      ...(opacity < 0.999 ? { opacity: Math.round(opacity * 1000) / 1000 } : {}),
      ...(extras.shadow ? { shadow: extras.shadow } : {}),
      ...(appearance.filter ? { filter: appearance.filter } : {}),
      ...(appearance.blendMode ? { blendMode: appearance.blendMode } : {}),
    }
  }

  /** A rect, rounded rect, ellipse or path filled with `fill`, outlined inside its edge by `stroke`. */
  private shape(
    name: string,
    area: Area,
    fill: FreeformShapeElement['fill'],
    stroke: { color: string; width: number } | null,
  ): FreeformShapeElement | FreeformPathElement {
    const { topLeft, topRight, bottomRight, bottomLeft } = area.radii
    const corners = [topLeft, topRight, bottomRight, bottomLeft]
    const circular = corners.every(([x, y]) => Math.abs(x - y) < 0.5)
    const even = corners.every(([x, y]) => Math.abs(x - topLeft[0]) < 0.5 && Math.abs(y - topLeft[1]) < 0.5)
    const strokeWidth = stroke?.width ?? 0
    const strokeColor = stroke?.color ?? '#000000'
    if (circular && even) {
      const radius = topLeft[0]
      const round = Math.abs(area.width - area.height) < 0.5 && radius >= area.width / 2 - 0.5
      return {
        ...this.base(name, area),
        type: 'shape',
        shape: round ? 'ellipse' : 'rect',
        fill,
        stroke: strokeColor,
        strokeWidth: rounded(strokeWidth),
        ...(round ? {} : { cornerRadius: Math.min(2000, rounded(radius)) }),
      }
    }
    // Corners a rect can't draw: the outline as a path, the stroke kept inside it as CSS borders are.
    const inset = strokeWidth / 2
    const ellipse = even && topLeft[0] >= area.width / 2 - 0.5 && topLeft[1] >= area.height / 2 - 0.5
    const d = ellipse
      ? ellipsePath(area.x + area.width / 2, area.y + area.height / 2, area.width / 2 - inset, area.height / 2 - inset)
      : roundedRectPath(area.x + inset, area.y + inset, area.width - strokeWidth, area.height - strokeWidth, insetRadii(area.radii, inset, inset, inset, inset))
    return {
      ...this.base(name, area),
      type: 'path',
      d,
      viewBox: { x: rounded(area.x), y: rounded(area.y), width: Math.max(0.01, rounded(area.width)), height: Math.max(0.01, rounded(area.height)) },
      fill,
      stroke: strokeColor,
      strokeWidth: rounded(strokeWidth),
    }
  }

  private radiiOf(style: CSSStyleDeclaration, rect: Rect): CornerRadii {
    const corner = (value: string): [number, number] => {
      const [horizontal = '0', vertical = horizontal] = value.trim().split(/\s+/)
      const resolve = (part: string, size: number) => {
        const number = Number.parseFloat(part)
        if (!Number.isFinite(number)) return 0
        return part.endsWith('%') ? (number / 100) * size : number
      }
      return [resolve(horizontal, rect.width), resolve(vertical, rect.height)]
    }
    return {
      topLeft: corner(style.borderTopLeftRadius),
      topRight: corner(style.borderTopRightRadius),
      bottomRight: corner(style.borderBottomRightRadius),
      bottomLeft: corner(style.borderBottomLeftRadius),
    }
  }

  private bordersOf(style: CSSStyleDeclaration) {
    const side = (name: 'Top' | 'Right' | 'Bottom' | 'Left') => {
      const lineStyle = style.getPropertyValue(`border-${name.toLowerCase()}-style`)
      const width = lineStyle === 'none' || lineStyle === 'hidden' ? 0 : parsePx(style.getPropertyValue(`border-${name.toLowerCase()}-width`)) ?? 0
      return { width, style: lineStyle, color: this.color(style.getPropertyValue(`border-${name.toLowerCase()}-color`)) }
    }
    return { top: side('Top'), right: side('Right'), bottom: side('Bottom'), left: side('Left') }
  }

  /** A box's own painting: shadow and background colour, background layers, then its borders. `box` is one line's fragment of an inline box. */
  private async boxNodes(element: Element, box?: Rect): Promise<FreeformSceneNode[]> {
    if (element === this.page || ['IFRAME', 'INPUT', 'TEXTAREA', 'SELECT', 'OBJECT', 'EMBED'].includes(element.tagName.toUpperCase())) return []
    const style = this.style(element)
    if (style.visibility !== 'visible') return []
    // An inline box is drawn per line fragment, by inlineBoxes.
    if (!box && style.display === 'inline' && !this.isReplaced(element)) return []
    const border = box ?? this.rel(element.getBoundingClientRect())
    if (border.width <= 0.01 || border.height <= 0.01 || !intersect(border, this.pageRect())) return []
    const name = element.getAttribute('data-name') ?? '形状'
    const radii = this.radiiOf(style, border)
    const borders = this.bordersOf(style)
    const padding: Area = {
      x: border.x + borders.left.width,
      y: border.y + borders.top.width,
      width: Math.max(0, border.width - borders.left.width - borders.right.width),
      height: Math.max(0, border.height - borders.top.width - borders.bottom.width),
      radii: insetRadii(radii, borders.top.width, borders.right.width, borders.bottom.width, borders.left.width),
    }
    const paddings = {
      top: parsePx(style.paddingTop) ?? 0,
      right: parsePx(style.paddingRight) ?? 0,
      bottom: parsePx(style.paddingBottom) ?? 0,
      left: parsePx(style.paddingLeft) ?? 0,
    }
    const content: Area = {
      x: padding.x + paddings.left,
      y: padding.y + paddings.top,
      width: Math.max(0, padding.width - paddings.left - paddings.right),
      height: Math.max(0, padding.height - paddings.top - paddings.bottom),
      radii: insetRadii(padding.radii, paddings.top, paddings.right, paddings.bottom, paddings.left),
    }
    const areaOf = (box: string): Area => (box === 'padding-box' ? padding : box === 'content-box' ? content : { ...border, radii })
    const appearance = this.appearanceOf(element)
    const backdrop = this.backdropOf(element)
    const nodes: FreeformSceneNode[] = []

    const clips = splitTopLevel(style.backgroundClip || 'border-box')
    const clipText = clips.includes('text') || style.getPropertyValue('-webkit-background-clip') === 'text'
    const shadows = parseShadows(style.boxShadow, this.resolveColor)
    const outer = shadows.filter((shadow) => !shadow.inset)
    if (shadows.some((shadow) => shadow.inset)) this.note(element, '内阴影（inset）没法还原，去掉了')
    if (outer.length > 1) this.note(element, '有多层阴影，只保留了第一层')
    if (outer[0] && Math.abs(outer[0].spread) > 2) this.note(element, '阴影的扩展（spread）没法还原')
    // A picture carries its own shadow (imageNodes); here it would fall under the picture's box.
    const shadow = element.tagName.toUpperCase() === 'IMG'
      ? undefined
      : this.shadowOf(outer[0] ?? (style.boxShadow === 'none' ? appearance.dropShadow : null), backdrop)

    // The background colour, under the layers; the shadow goes with it.
    const background = clipText ? null : this.color(style.backgroundColor)
    const colorArea = areaOf(clips[clips.length - 1] ?? 'border-box')
    const uniform = this.uniformBorder(borders)
    let strokeTaken = false
    if ((background && background.a > 0.004) || shadow) {
      const opaque = !background || background.a > 0.996
      if (shadow && background && !opaque) {
        // The shadow stays at full strength while the fill fades: two nodes.
        nodes.push(this.finishLeaf(this.shape(name, { ...border, radii }, { type: 'transparent' }, null), element, 1, { shadow, appearance }))
      }
      const fill: FreeformShapeElement['fill'] = background && background.a > 0.004 ? { type: 'solid', color: hexOf(background) } : { type: 'transparent' }
      const stroke = uniform && uniform.color.a > 0.996 && opaque && colorArea.width === border.width
        ? { color: hexOf(uniform.color), width: uniform.width }
        : null
      strokeTaken = stroke !== null
      const node = this.shape(name, stroke ? { ...border, radii } : colorArea, fill, stroke)
      nodes.push(this.finishLeaf(node, element, background && background.a > 0.004 ? background.a : 1, {
        shadow: shadow && (opaque || !background) ? shadow : undefined,
        appearance,
      }))
    }

    // Background layers, the last one listed at the bottom.
    if (!clipText) nodes.push(...await this.backgroundLayers(element, style, name, areaOf, appearance, backdrop))

    // Borders on top.
    if (!strokeTaken) nodes.push(...this.borderNodes(element, name, border, radii, borders, appearance))
    return nodes
  }

  private uniformBorder(borders: ReturnType<PageReader['bordersOf']>): { width: number; color: Rgba } | null {
    const sides = [borders.top, borders.right, borders.bottom, borders.left]
    const first = sides[0]
    if (first.width <= 0 || !first.color) return null
    const solid = (lineStyle: string) => !['dashed', 'dotted'].includes(lineStyle)
    const same = sides.every((side) => Math.abs(side.width - first.width) < 0.01 && side.color
      && hexOf(side.color) === hexOf(first.color as Rgba) && Math.abs(side.color.a - (first.color as Rgba).a) < 0.01 && solid(side.style))
    return same ? { width: first.width, color: first.color } : null
  }

  private borderNodes(
    element: Element,
    name: string,
    border: Rect,
    radii: CornerRadii,
    borders: ReturnType<PageReader['bordersOf']>,
    appearance: { filter?: SceneFilter; blendMode?: BlendMode },
  ): FreeformSceneNode[] {
    const uniform = this.uniformBorder(borders)
    if (uniform) {
      const node = this.shape(name, { ...border, radii }, { type: 'transparent' }, { color: hexOf(uniform.color), width: uniform.width })
      return [this.finishLeaf(node, element, uniform.color.a, { appearance })]
    }
    const sidesAll = [borders.top, borders.right, borders.bottom, borders.left]
    const first = sidesAll[0]
    const dashedAll = first.width > 0 && first.color && (first.style === 'dashed' || first.style === 'dotted')
      && sidesAll.every((side) => side.style === first.style && Math.abs(side.width - first.width) < 0.01
        && side.color && hexOf(side.color) === hexOf(first.color as Rgba) && Math.abs(side.color.a - (first.color as Rgba).a) < 0.01)
    if (dashedAll && first.color) {
      const width = first.width
      const half = width / 2
      const node: FreeformPathElement = {
        ...this.base(name, border),
        type: 'path',
        d: roundedRectPath(border.x + half, border.y + half, border.width - width, border.height - width, insetRadii(radii, half, half, half, half)),
        viewBox: { x: rounded(border.x), y: rounded(border.y), width: Math.max(0.01, rounded(border.width)), height: Math.max(0.01, rounded(border.height)) },
        fill: { type: 'transparent' },
        stroke: hexOf(first.color),
        strokeWidth: rounded(width),
        dash: rounded(first.style === 'dotted' ? width : width * 3),
        cap: 'butt',
        join: 'miter',
      }
      return [this.finishLeaf(node, element, first.color.a, { appearance })]
    }
    const nodes: FreeformSceneNode[] = []
    const sides: Array<[typeof borders.top, Rect]> = [
      [borders.top, { x: border.x, y: border.y, width: border.width, height: borders.top.width }],
      [borders.right, { x: border.x + border.width - borders.right.width, y: border.y, width: borders.right.width, height: border.height }],
      [borders.bottom, { x: border.x, y: border.y + border.height - borders.bottom.width, width: border.width, height: borders.bottom.width }],
      [borders.left, { x: border.x, y: border.y, width: borders.left.width, height: border.height }],
    ]
    let dashed = false
    for (const [side, rect] of sides) {
      if (side.width <= 0 || !side.color || side.color.a <= 0.004) continue
      if (side.style === 'dashed' || side.style === 'dotted') {
        dashed = true
        nodes.push(this.finishLeaf(this.dashedLine(name, rect, side.width, hexOf(side.color), side.style === 'dotted'), element, side.color.a, { appearance }))
        continue
      }
      nodes.push(this.finishLeaf(this.shape(name, { ...rect, radii: NO_RADII }, { type: 'solid', color: hexOf(side.color) }, null), element, side.color.a, { appearance }))
    }
    if (nodes.length > 0 && hasRadius(radii)) this.note(element, '圆角边框按直边画出')
    if (dashed && hasRadius(radii)) this.note(element, '虚线边框按直线画出')
    return nodes
  }

  private dashedLine(name: string, rect: Rect, width: number, color: string, dotted: boolean): FreeformLineElement {
    const horizontal = rect.width >= rect.height
    const length = horizontal ? rect.width : rect.height
    // A line node is a horizontal segment turned about its centre.
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    const box = { x: center.x - length / 2, y: center.y - width / 2, width: length, height: Math.max(width, 0.5) }
    return {
      ...this.base(name === '形状' ? '线条' : name, box),
      type: 'line',
      rotation: horizontal ? 0 : 90,
      lineKind: 'line',
      stroke: color,
      strokeWidth: rounded(width),
      dash: Math.max(1, Math.min(500, rounded(dotted ? width : width * 3))),
      cap: dotted ? 'round' : 'butt',
    }
  }

  /** Where a background layer's tile lands: its size and position resolved against the positioning area. */
  private tileRect(area: Rect, size: string, position: string, natural: { width: number; height: number } | null): Rect {
    const nw = natural?.width ?? area.width
    const nh = natural?.height ?? area.height
    let width: number
    let height: number
    if (size === 'cover' || size === 'contain') {
      const scale = size === 'cover' ? Math.max(area.width / nw, area.height / nh) : Math.min(area.width / nw, area.height / nh)
      width = nw * scale
      height = nh * scale
    } else {
      const [widthPart = 'auto', heightPart = 'auto'] = splitTopLevel(size, ' ')
      const resolve = (part: string, extent: number) => {
        if (part === 'auto') return null
        const number = Number.parseFloat(part)
        if (!Number.isFinite(number)) return null
        return part.endsWith('%') ? (number / 100) * extent : number
      }
      const w = resolve(widthPart, area.width)
      const h = resolve(heightPart, area.height)
      width = w ?? (h !== null ? (h * nw) / nh : nw)
      height = h ?? (w !== null ? (w * nh) / nw : nh)
    }
    const [xPart = '0%', yPart = '0%'] = splitTopLevel(position, ' ')
    return {
      x: area.x + this.offsetIn(xPart, area.width - width),
      y: area.y + this.offsetIn(yPart, area.height - height),
      width,
      height,
    }
  }

  /** A computed position ("50%", "12px", "calc(100% - 12px)") within `free` px of room. */
  private offsetIn(value: string, free: number): number {
    const calc = /^calc\((-?[\d.]+)%\s*([+-])\s*(-?[\d.]+)px\)$/.exec(value)
    if (calc) return (Number.parseFloat(calc[1]) / 100) * free + (calc[2] === '-' ? -1 : 1) * Number.parseFloat(calc[3])
    const number = Number.parseFloat(value)
    if (!Number.isFinite(number)) return free / 2
    return value.endsWith('%') ? (number / 100) * free : number
  }

  /** The framing that shows `drawn` (the whole picture's box) through `frame`. */
  private framingFor(natural: { width: number; height: number }, frame: Rect, drawn: Rect, element: Element | null): ImageFraming {
    const base = Math.max(frame.width / natural.width, frame.height / natural.height)
    const scale = Math.max(drawn.width / natural.width, drawn.height / natural.height)
    if (scale / base > 4.01 && element) this.note(element, '图片放大超过 4 倍，按 4 倍取景')
    const zoom = Math.max(1, Math.min(4, scale / base))
    const width = natural.width * base * zoom
    const height = natural.height * base * zoom
    const left = drawn.x + drawn.width / 2 - frame.x - width / 2
    const top = drawn.y + drawn.height / 2 - frame.y - height / 2
    const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
    return {
      focusX: Math.round(clamp01((frame.width / 2 - left) / width) * 10000) / 10000,
      focusY: Math.round(clamp01((frame.height / 2 - top) / height) * 10000) / 10000,
      zoom: Math.round(zoom * 10000) / 10000,
    }
  }

  private async backgroundLayers(
    element: Element,
    style: CSSStyleDeclaration,
    name: string,
    areaOf: (box: string) => Area,
    appearance: { filter?: SceneFilter; blendMode?: BlendMode },
    backdrop: Rgba,
  ): Promise<FreeformSceneNode[]> {
    const images = splitTopLevel(style.backgroundImage)
    if (images.length === 0 || images.every((layer) => layer === 'none')) return []
    const pick = (list: string[], index: number, fallback: string) => (list.length > 0 ? list[index % list.length] : fallback)
    const sizes = splitTopLevel(style.backgroundSize)
    const positions = splitTopLevel(style.backgroundPosition)
    const repeats = splitTopLevel(style.backgroundRepeat)
    const origins = splitTopLevel(style.backgroundOrigin)
    const clips = splitTopLevel(style.backgroundClip)
    const nodes: FreeformSceneNode[] = []
    for (let index = images.length - 1; index >= 0; index -= 1) {
      const layer = images[index]
      if (layer === 'none') continue
      const clip = areaOf(pick(clips, index, 'border-box'))
      const origin = areaOf(pick(origins, index, 'padding-box'))
      if (clip.width <= 0.01 || clip.height <= 0.01) continue
      const url = /^url\((['"]?)(.*)\1\)$/s.exec(layer)
      const natural = url ? this.pictureSize(url[2]) : null
      const tile = this.tileRect(origin, pick(sizes, index, 'auto'), pick(positions, index, '0% 0%'), natural)
      const repeat = pick(repeats, index, 'repeat')
      const covers = tile.x <= clip.x + 0.5 && tile.y <= clip.y + 0.5
        && tile.x + tile.width >= clip.x + clip.width - 0.5 && tile.y + tile.height >= clip.y + clip.height - 0.5
      const tiles = !covers && repeat !== 'no-repeat' && repeat !== 'no-repeat no-repeat'
      const frame = tiles ? clip : intersect(clip, tile)
      if (!frame) continue
      const radii = sameRect(frame, clip) ? clip.radii : NO_RADII
      const layerName = name === '形状' ? (url ? '背景图' : '渐变') : name
      if (!tiles && url) {
        if (!natural) this.note(element, '背景图没有加载出来，按铺满处理')
        const fill: ImagePaint = {
          type: 'image',
          src: url[2],
          fit: 'cover',
          framing: natural ? this.framingFor(natural, frame, tile, element) : createDefaultImageFraming(),
        }
        nodes.push(this.finishLeaf(this.shape(layerName, { ...frame, radii }, fill, null), element, 1, { appearance }))
        continue
      }
      const gradient: CssGradient | null = !tiles && !url ? parseGradient(layer, tile.width, tile.height, this.resolveColor) : null
      const bands = gradient ? this.solidBands(gradient, tile) : null
      if (bands) {
        for (const band of bands.rects) {
          const visible = intersect(band, clip)
          if (visible) nodes.push(this.finishLeaf(this.shape(layerName, { ...visible, radii: sameRect(visible, clip) ? clip.radii : NO_RADII }, { type: 'solid', color: bands.color }, null), element, bands.alpha, { appearance }))
        }
        continue
      }
      const native = gradient ? gradientPaint(gradient) : null
      if (native) {
        nodes.push(this.finishLeaf(this.shape(layerName, { ...frame, radii }, native.paint, null), element, native.alpha, { appearance }))
        continue
      }
      // A paint can't hold it (stops that fade by different amounts, a repeat, a conic sweep): a picture of it.
      const picture = this.options.rasterize
        ? await this.options.rasterize({
          backgroundImage: layer,
          backgroundSize: `${rounded(tile.width)}px ${rounded(tile.height)}px`,
          backgroundPosition: `${rounded(tile.x - frame.x)}px ${rounded(tile.y - frame.y)}px`,
          backgroundRepeat: repeat,
          width: Math.max(1, Math.round(frame.width)),
          height: Math.max(1, Math.round(frame.height)),
        }).catch(() => null)
        : null
      if (picture) {
        const fill: ImagePaint = { type: 'image', src: picture, fit: 'cover', framing: createDefaultImageFraming() }
        nodes.push(this.finishLeaf(this.shape(layerName, { ...frame, radii }, fill, null), element, 1, { appearance }))
        this.note(element, '这层背景画成了一张图（渐变透明度不一或平铺）')
        continue
      }
      if (gradient) {
        // Last resort: the gradient over what lies behind it, opaque.
        const flattened = { ...gradient, stops: gradient.stops.map((stop) => ({ ...stop, color: blendOver(stop.color, backdrop) })) }
        const approximate = gradientPaint(flattened.kind === 'radial' ? { ...flattened, exact: true } : flattened)
        if (approximate) {
          nodes.push(this.finishLeaf(this.shape(layerName, { ...frame, radii }, approximate.paint, null), element, 1, { appearance }))
          this.note(element, '渐变按背后的颜色近似成不透明的')
          continue
        }
      }
      this.note(element, `背景 ${layer.slice(0, 40)} 没有转`)
    }
    return nodes
  }

  /**
   * A straight gradient that is only clear stretches and hard-edged bands of
   * one colour (`transparent 60%, #ffe066 60%`): those bands as rects.
   */
  private solidBands(gradient: CssGradient, tile: Rect): { rects: Rect[]; color: string; alpha: number } | null {
    if (gradient.kind !== 'linear') return null
    const angle = Math.round(gradient.angle) % 360
    if (![0, 90, 180, 270].includes(angle)) return null
    const stops = gradient.stops
    const opaque = stops.filter((stop) => stop.color.a > 0.004)
    if (opaque.length === 0 || opaque.length === stops.length) return null
    const first = opaque[0].color
    if (opaque.some((stop) => hexOf(stop.color) !== hexOf(first) || Math.abs(stop.color.a - first.a) > 0.01)) return null
    // Every change between clear and coloured must be a hard edge (two stops at one place).
    for (let index = 1; index < stops.length; index += 1) {
      const changes = (stops[index].color.a > 0.004) !== (stops[index - 1].color.a > 0.004)
      if (changes && Math.abs(stops[index].offset - stops[index - 1].offset) > 1e-4) return null
    }
    const intervals: Array<[number, number]> = []
    for (let index = 0; index < stops.length; index += 1) {
      if (stops[index].color.a <= 0.004) continue
      const from = index === 0 ? Math.min(0, stops[0].offset) : stops[index].offset
      let to = stops[index].offset
      while (index + 1 < stops.length && stops[index + 1].color.a > 0.004) {
        index += 1
        to = stops[index].offset
      }
      if (index === stops.length - 1) to = Math.max(1, to)
      intervals.push([Math.max(0, from), Math.min(1, to)])
    }
    const rects = intervals.filter(([from, to]) => to - from > 1e-4).map(([from, to]): Rect => {
      // 180° runs top to bottom, 0° bottom to top, 90° left to right, 270° right to left.
      if (angle === 180) return { x: tile.x, y: tile.y + from * tile.height, width: tile.width, height: (to - from) * tile.height }
      if (angle === 0) return { x: tile.x, y: tile.y + (1 - to) * tile.height, width: tile.width, height: (to - from) * tile.height }
      if (angle === 90) return { x: tile.x + from * tile.width, y: tile.y, width: (to - from) * tile.width, height: tile.height }
      return { x: tile.x + (1 - to) * tile.width, y: tile.y, width: (to - from) * tile.width, height: tile.height }
    })
    return rects.length > 0 ? { rects, color: hexOf(first), alpha: first.a } : null
  }

  /**
   * A text node's words as CSS sets them: each run of whitespace one space
   * (the spaces around it collapse later, in collapseSpaces), a source line
   * break between Chinese characters kept only if the layout shows a space
   * there, text-transform applied — and where each chunk came from.
   */
  private renderedText(node: Text): { text: string; map: Run['map'] } {
    const parent = node.parentElement
    if (!parent) return { text: '', map: [] }
    const style = this.style(parent)
    const whiteSpace = style.whiteSpace
    const transform = style.textTransform
    if (whiteSpace === 'pre' || whiteSpace === 'pre-wrap' || whiteSpace === 'break-spaces') {
      const text = applyTextTransform(node.data, transform)
      return { text, map: [[0, text.length, 0, node.data.length]] }
    }
    let text = ''
    const map: Run['map'] = []
    const range = this.doc.createRange()
    const pattern = /[ \t\n\r\f]+|[^ \t\n\r\f]+/g
    for (let match = pattern.exec(node.data); match; match = pattern.exec(node.data)) {
      const chunk = match[0]
      const domStart = match.index
      const domEnd = match.index + chunk.length
      let shown: string
      if (!/^[ \t\n\r\f]/.test(chunk)) {
        shown = applyTextTransform(chunk, transform)
      } else if (whiteSpace === 'pre-line' && chunk.includes('\n')) {
        shown = '\n'.repeat((chunk.match(/\n/g) ?? []).length)
      } else if (chunk.includes('\n') && WIDE.test(node.data[domStart - 1] ?? '') && WIDE.test(node.data[domEnd] ?? '')) {
        // A line break in the source between two Chinese characters: browsers differ; ask the layout.
        range.setStart(node, domStart)
        range.setEnd(node, domEnd)
        shown = Array.from(range.getClientRects()).some((rect) => rect.width > 0.01) ? ' ' : ''
      } else {
        shown = ' '
      }
      if (!shown) continue
      map.push([text.length, text.length + shown.length, domStart, domEnd])
      text += shown
    }
    return { text, map }
  }

  /** The boxes of a run's characters as laid out. */
  private runRects(run: Run): DOMRect[] {
    if (!run.node || run.map.length === 0) return []
    const range = this.doc.createRange()
    range.setStart(run.node, run.map[0][2])
    range.setEnd(run.node, run.map[run.map.length - 1][3])
    return Array.from(range.getClientRects()).filter((rect) => rect.width > 0.01 && rect.height > 0.01)
  }

  /**
   * Offsets in the joined text where a new line starts, read letter by
   * letter: a letter is on the previous one's line when their boxes overlap
   * by half the smaller one (big and small letters on one baseline do; lines
   * set tight overlap less).
   */
  private lineStarts(runs: readonly Run[], vertical: boolean): number[] {
    const starts: number[] = []
    const range = this.doc.createRange()
    let previous: { from: number; to: number } | null = null
    let base = 0
    for (const run of runs) {
      if (run.node) {
        for (const [start, end, domStart, domEnd] of run.map) {
          if (end - start !== domEnd - domStart || !run.text.slice(start, end).trim()) continue
          for (let offset = 0; offset < end - start; offset += 1) {
            const code = run.node.data.charCodeAt(domStart + offset)
            const width = code >= 0xd800 && code <= 0xdbff ? 2 : 1
            range.setStart(run.node, domStart + offset)
            range.setEnd(run.node, Math.min(domEnd, domStart + offset + width))
            const rect = range.getBoundingClientRect()
            if (rect.width > 0.01 || rect.height > 0.01) {
              const band = vertical ? { from: rect.left, to: rect.right } : { from: rect.top, to: rect.bottom }
              if (previous) {
                const overlap = Math.min(previous.to, band.to) - Math.max(previous.from, band.from)
                if (overlap < 0.5 * Math.min(previous.to - previous.from, band.to - band.from)) starts.push(base + start + offset)
              }
              previous = band
            }
            if (width === 2) offset += 1
          }
        }
      }
      base += run.text.length
    }
    return starts
  }

  private normalLineHeight(style: CSSStyleDeclaration): number {
    const key = `${style.fontFamily}|${style.fontSize}|${style.fontWeight}|${style.fontStyle}`
    const cached = this.normalLineHeights.get(key)
    if (cached !== undefined) return cached
    const probe = this.doc.createElement('span')
    probe.textContent = '国Ag'
    for (const [name, value] of [
      ['position', 'absolute'], ['visibility', 'hidden'], ['display', 'block'], ['white-space', 'nowrap'],
      ['line-height', 'normal'], ['font-family', style.fontFamily], ['font-size', style.fontSize],
      ['font-weight', style.fontWeight], ['font-style', style.fontStyle], ['padding', '0'], ['border', '0'], ['margin', '0'],
    ]) setImportant(probe, name, value)
    this.doc.body.append(probe)
    const height = probe.getBoundingClientRect().height
    probe.remove()
    const value = height > 0 ? height : (parsePx(style.fontSize) ?? 16) * 1.2
    this.normalLineHeights.set(key, value)
    return value
  }

  private textWidth(style: CSSStyleDeclaration, text: string): number {
    const probe = this.doc.createElement('span')
    probe.textContent = text
    for (const [name, value] of [
      ['position', 'absolute'], ['visibility', 'hidden'], ['white-space', 'pre'], ['font-family', style.fontFamily],
      ['font-size', style.fontSize], ['font-weight', style.fontWeight], ['font-style', style.fontStyle],
      ['letter-spacing', style.letterSpacing], ['padding', '0'], ['border', '0'], ['margin', '0'],
    ]) setImportant(probe, name, value)
    this.doc.body.append(probe)
    const width = probe.getBoundingClientRect().width
    probe.remove()
    return width
  }

  /** Inline elements whose box a highlight span can't stand for: a picture or gradient, a border, rounded padding. */
  private readonly decoratedInlines = new Set<Element>()

  private isDecoratedInline(element: Element): boolean {
    const style = this.style(element)
    if (style.backgroundImage !== 'none' && !splitTopLevel(style.backgroundClip).includes('text')) return true
    const borders = this.bordersOf(style)
    if ([borders.top, borders.right, borders.bottom, borders.left].some((side) => side.width > 0 && side.color && side.color.a > 0.004)) return true
    const background = this.color(style.backgroundColor)
    if (!background || background.a <= 0.004) return false
    const padded = ['padding-left', 'padding-right', 'padding-top', 'padding-bottom'].some((name) => (parsePx(style.getPropertyValue(name)) ?? 0) > 0.5)
    const rect = element.getBoundingClientRect()
    return padded || hasRadius(this.radiiOf(style, { x: 0, y: 0, width: rect.width, height: rect.height }))
  }

  /** The boxes of a group's decorated inline elements, one per line fragment, to go under its words. */
  private async inlineBoxes(group: InlineGroup): Promise<FreeformSceneNode[]> {
    const nodes: FreeformSceneNode[] = []
    const visit = async (node: Node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const element = node as Element
      if (this.classify(element) !== 'inline') return
      if (this.isDecoratedInline(element)) {
        this.decoratedInlines.add(element)
        for (const fragment of Array.from(element.getClientRects())) {
          if (fragment.width > 0.01 && fragment.height > 0.01) nodes.push(...await this.boxNodes(element, this.rel(fragment)))
        }
      }
      for (const child of Array.from(element.childNodes)) await visit(child)
    }
    for (const node of group.nodes) await visit(node)
    return nodes
  }

  private textNodes(group: InlineGroup): FreeformSceneNode[] {
    // Boxes inside the line (an inline-block badge) are painted on their own; the words around them part.
    const segments: Run[][] = [[]]
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const { text, map } = this.renderedText(node as Text)
        if (text) segments[segments.length - 1].push({ text, node: node as Text, element: (node as Text).parentElement as Element, map })
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const element = node as Element
      const kind = this.classify(element)
      if (kind === 'br') {
        segments[segments.length - 1].push({ text: '\n', node: null, element: element.parentElement ?? group.container, map: [] })
        return
      }
      if (kind === 'skip' || kind === 'layer') return
      if (kind === 'atomic' || kind === 'block') {
        segments.push([])
        return
      }
      if (this.style(element).visibility !== 'visible' && element.children.length === 0) return
      for (const child of this.flowChildren(element)) walk(child)
    }
    for (const node of group.nodes) walk(node)
    const collapsible = (run: Run) => (run.node ? collapses(this.style(run.element).whiteSpace) : false)
    const filled = segments.map((runs) => collapseSpaces(runs, collapsible)).filter((runs) => runs.some((run) => run.text.trim()))
    const whole = filled.length === 1 && !group.afterBox && !group.beforeBox && this.fillsBlock(group)
    return filled.flatMap((runs, index) => this.textFromRuns(
      group.container,
      runs,
      index > 0 || group.afterBox === true,
      index < filled.length - 1 || group.beforeBox === true,
      whole,
    ))
  }

  /** Words that are everything their block holds, in its own lines (not an anonymous flex item). */
  private fillsBlock(group: InlineGroup): boolean {
    const display = this.style(group.container).display
    if (display.includes('flex') || display.includes('grid')) return false
    const content = this.flowChildren(group.container).filter((node) => node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim())
    return content.every((node) => group.nodes.includes(node))
  }

  /**
   * One text node for a run of words, or more when it shares lines with a
   * box painted on its own (an inline-block badge): a line that starts after
   * the box, or (centred or right-aligned) ends before it, becomes a text of
   * its own, so every line stays where the browser put it.
   */
  private textFromRuns(container: Element, runs: Run[], afterBox: boolean, beforeBox: boolean, whole = false): FreeformSceneNode[] {
    if (this.inColumns(container)) return this.textBySize(container, runs, runs.map((run) => parsePx(this.style(run.element).fontSize) ?? 16))
    if (!afterBox && !beforeBox) return this.textFromRunsWhole(container, runs, whole)
    const sample = runs.find((run) => run.node) ?? runs[0]
    const style = this.style(sample.element)
    const vertical = style.writingMode.startsWith('vertical') || style.writingMode.startsWith('tb')
    const starts = this.lineStarts(runs, vertical)
    const textAlign = this.style(container).textAlign
    const splitFirst = afterBox && starts.length > 0
    const splitLast = beforeBox && starts.length > 0 && textAlign !== 'left' && textAlign !== 'start'
    if (!splitFirst && !splitLast) return this.textFromRunsWhole(container, runs)
    const total = runs.reduce((sum, run) => sum + run.text.length, 0)
    const cuts = [0, ...(splitFirst ? [starts[0]] : []), ...(splitLast && starts[starts.length - 1] !== (splitFirst ? starts[0] : -1) ? [starts[starts.length - 1]] : []), total]
    const nodes: FreeformSceneNode[] = []
    for (let index = 0; index + 1 < cuts.length; index += 1) {
      const part = this.cutRuns(runs, cuts[index], cuts[index + 1])
      if (part.some((run) => run.text.trim())) nodes.push(...this.textFromRunsWhole(container, part))
    }
    return nodes
  }

  /** Words in more than one size: each line cut where the size changes, every part a text of its own. */
  private textBySize(container: Element, runs: Run[], sizes: number[]): FreeformSceneNode[] {
    const vertical = this.style(runs[0].element).writingMode.startsWith('vertical')
    const total = runs.reduce((sum, run) => sum + run.text.length, 0)
    const cuts = new Set<number>([0, total, ...this.lineStarts(runs, vertical)])
    let base = 0
    for (const [index, run] of runs.entries()) {
      if (index > 0 && Math.abs(sizes[index] - sizes[index - 1]) > 0.5) cuts.add(base)
      base += run.text.length
    }
    const ordered = Array.from(cuts).sort((a, b) => a - b)
    const nodes: FreeformSceneNode[] = []
    for (let index = 0; index + 1 < ordered.length; index += 1) {
      const part = this.cutRuns(runs, ordered[index], ordered[index + 1])
      // The space a line wraps at, or between sizes, stays with the part before it.
      if (part.some((run) => run.text.trim())) nodes.push(...this.textFromRunsWhole(container, part))
    }
    return nodes
  }

  /** Words laid out in columns (CSS multi-column): a text box can't flow from one into the next. */
  private inColumns(element: Element): boolean {
    for (let current: Element | null = element; current; current = current === this.page ? null : current.parentElement) {
      const style = this.style(current)
      if (style.columnCount !== 'auto' || style.columnWidth !== 'auto') return true
    }
    return false
  }

  private cutRuns(runs: readonly Run[], from: number, to: number): Run[] {
    const out: Run[] = []
    let base = 0
    for (const run of runs) {
      const start = Math.max(from, base)
      const end = Math.min(to, base + run.text.length)
      if (end > start) out.push(sliceRun(run, start - base, end - base))
      base += run.text.length
    }
    return out
  }

  private lookOf(run: Run, container: Element) {
    const style = this.style(run.element)
    let highlight: Rgba | null = null
    let underline = false
    let strike = false
    for (let current: Element | null = run.element; current; current = current.parentElement) {
      const lines = this.style(current).textDecorationLine
      if (lines.includes('underline')) underline = true
      if (lines.includes('line-through')) strike = true
      if (current === container || current === this.page) break
      if (!highlight && !this.decoratedInlines.has(current)) {
        const background = this.color(this.style(current).backgroundColor)
        if (background && background.a > 0.004 && !splitTopLevel(this.style(current).backgroundClip).includes('text')) highlight = background
      }
    }
    const color = this.color(style.color) ?? { r: 0, g: 0, b: 0, a: 1 }
    const fill = this.color(style.getPropertyValue('-webkit-text-fill-color'))
    return {
      size: parsePx(style.fontSize) ?? 16,
      family: style.fontFamily,
      bold: isBoldWeight(style.fontWeight),
      italic: style.fontStyle !== 'normal',
      color: fill ?? color,
      highlight,
      underline,
      strike,
    }
  }

  /** A gradient the words are cut out of (background-clip: text), from the run up to its block. */
  private gradientTextOf(element: Element, container: Element): { paint: ColorPaint; alpha: number } | null {
    for (let current: Element | null = element; current; current = current.parentElement) {
      const style = this.style(current)
      const clipText = splitTopLevel(style.backgroundClip).includes('text') || style.getPropertyValue('-webkit-background-clip') === 'text'
      if (clipText) {
        const rect = current.getBoundingClientRect()
        const layer = splitTopLevel(style.backgroundImage).find((value) => value.includes('gradient('))
        const gradient = layer ? parseGradient(layer, rect.width, rect.height, this.resolveColor) : null
        if (gradient) {
          const native = gradientPaint(gradient)
          if (native) return native
          this.note(current, '渐变文字的透明度不一，按不透明处理')
          return gradientPaint({ ...gradient, ...(gradient.kind === 'radial' ? { exact: true } : {}), stops: gradient.stops.map((stop) => ({ ...stop, color: { ...stop.color, a: 1 } })) } as CssGradient)
        }
      }
      if (current === container || current === this.page) break
    }
    return null
  }

  private textFromRunsWhole(container: Element, runs: Run[], wholeBlock = false): FreeformSceneNode[] {
    if (runs.length === 0) return []
    const pieces: Array<{ start: number; end: number; run: Run; look: ReturnType<PageReader['lookOf']> }> = []
    let text = ''
    for (const run of runs) {
      pieces.push({ start: text.length, end: text.length + run.text.length, run, look: this.lookOf(run, container) })
      text += run.text
    }
    // A line break at the very end makes no line of its own in HTML.
    if (text.endsWith('\n')) text = text.slice(0, -1)
    if (!text.trim()) return []
    const weight = (piece: (typeof pieces)[number]) => piece.run.text.replace(/\s/g, '').length
    const dominantPiece = pieces.reduce((best, piece) => (weight(piece) > weight(best) ? piece : best), pieces[0])
    const dominant = dominantPiece.look
    const style = this.style(dominantPiece.run.element)
    const containerStyle = this.style(container)
    const visible = pieces.filter((piece) => piece.run.text.trim().length > 0)
    const allBold = visible.every((piece) => piece.look.bold)
    const vertical = style.writingMode.startsWith('vertical') || style.writingMode.startsWith('tb')
    // Words in more than one size stay one text (sized spans, v20) when they fill their block and
    // every size keeps the same line-height multiplier — then the lines fall as they did. Else: a text per size.
    let sized = false
    if (visible.some((piece) => Math.abs(piece.look.size - dominant.size) > 0.5)) {
      const multiplier = (element: Element) => {
        const runStyle = this.style(element)
        return (parsePx(runStyle.lineHeight) ?? this.normalLineHeight(runStyle)) / (parsePx(runStyle.fontSize) ?? 16)
      }
      const base = multiplier(dominantPiece.run.element)
      const proportional = visible.every((piece) => Math.abs(multiplier(piece.run.element) - base) < 0.02)
      if (!wholeBlock || vertical || !proportional) return this.textBySize(container, runs, pieces.map((piece) => piece.look.size))
      sized = true
    }
    if (visible.some((piece) => piece.look.family !== dominant.family)) this.note(container, '一段文字里有不同字体，统一成一种')
    if (visible.some((piece) => piece.look.italic !== dominant.italic)) this.note(container, '一段文字里只有部分斜体，统一处理')

    const backdrop = this.backdropOf(dominantPiece.run.element)
    const gradientText = this.gradientTextOf(dominantPiece.run.element, container)
    // The text's colour is the one most of its words are in: a struck-out price keeps its grey as a span.
    const colorWeights = new Map<string, { color: Rgba; weight: number }>()
    for (const piece of visible) {
      const key = `${hexOf(piece.look.color)}/${piece.look.color.a}`
      const entry = colorWeights.get(key) ?? { color: piece.look.color, weight: 0 }
      entry.weight += weight(piece)
      colorWeights.set(key, entry)
    }
    const textColor = [...colorWeights.values()].reduce((best, entry) => (entry.weight > best.weight ? entry : best), { color: dominant.color, weight: 0 }).color
    const sharedAlpha = visible.every((piece) => Math.abs(piece.look.color.a - textColor.a) < 0.01)
    const alpha = gradientText ? gradientText.alpha : sharedAlpha ? textColor.a : 1
    const solid = (color: Rgba) => hexOf(sharedAlpha || color.a > 0.996 ? color : blendOver(color, backdrop))
    const baseColor = solid(textColor)

    // Spans for what differs from the base: bold, colour, highlight, underline, strike, size.
    const spans: RichTextSpan[] = []
    for (const piece of pieces) {
      const start = piece.start
      const end = Math.min(piece.end, text.length)
      if (end <= start) continue
      const span: RichTextSpan = { start, end }
      if (piece.look.bold && !allBold) span.bold = true
      const color = solid(piece.look.color)
      if (!gradientText && color !== baseColor) span.color = color
      if (piece.look.highlight) span.highlight = hexOf(blendOver(piece.look.highlight, backdrop))
      if (piece.look.underline) span.underline = true
      if (piece.look.strike) span.strike = true
      if (sized && Math.abs(piece.look.size - dominant.size) > 0.5) span.fontSize = rounded(piece.look.size)
      if (span.bold || span.color || span.highlight || span.underline || span.strike || span.fontSize !== undefined) spans.push(span)
    }
    const merged: RichTextSpan[] = []
    for (const span of spans) {
      const last = merged[merged.length - 1]
      if (last && last.end === span.start && last.bold === span.bold && last.color === span.color
        && last.highlight === span.highlight && last.underline === span.underline
        && last.strike === span.strike && last.fontSize === span.fontSize) last.end = span.end
      else merged.push({ ...span })
    }

    // Where the lines are: the words' boxes, a line height apart.
    const rects = pieces.flatMap((piece) => this.runRects(piece.run))
    if (rects.length === 0) return []
    const fontSize = dominant.size
    const lineHeight = parsePx(style.lineHeight) ?? this.normalLineHeight(style)
    if (style.writingMode === 'vertical-lr') this.note(container, '竖排文字按从右往左排')
    const leading = (/^\n*/.exec(text)?.[0].length ?? 0)
    const trailing = (/\n*$/.exec(text)?.[0].length ?? 0)
    const textAlign = containerStyle.textAlign
    const align: FreeformTextElement['align'] = textAlign === 'center' || textAlign === '-webkit-center'
      ? 'center'
      : textAlign === 'right' || textAlign === 'end' || textAlign === '-webkit-right'
        ? 'right'
        : textAlign === 'justify' ? 'justify' : 'left'
    let box: Rect
    let lines: number
    // How far the words' own boxes reach past a tight line (line-height 1 on big type).
    const reach = Math.max(0, (Math.max(...rects.map((rect) => (vertical ? rect.width : rect.height))) - lineHeight) / 2)
    let lineHeightUsed = lineHeight
    if (sized) {
      // Lines of mixed heights: the block's own content box holds them exactly.
      const content = this.contentBox(container)
      const shift = align === 'center' ? 0.5 : align === 'right' ? 1 : 0
      lines = 1 + (text.match(/\n/g) ?? []).length
      box = {
        x: content.x - TEXT_PADDING - shift,
        y: content.y - TEXT_PADDING,
        width: content.width + 1 + TEXT_PADDING * 2,
        height: content.height + TEXT_PADDING * 2 + 1,
      }
    } else if (!vertical) {
      const centers = rects.map((rect) => rect.top + rect.height / 2).sort((a, b) => a - b)
      lines = Math.round((centers[centers.length - 1] - centers[0]) / lineHeight) + 1 + leading + trailing
      // One line can take the taller line its words need, centred where it was: nothing moves, nothing is cut.
      if (lines === 1 && reach > 0) lineHeightUsed = lineHeight + reach * 2
      const top = centers[0] - lineHeightUsed / 2 - leading * lineHeight
      const left = Math.min(...rects.map((rect) => rect.left))
      const right = Math.max(...rects.map((rect) => rect.right))
      // One px of room so the longest line can't wrap on rounding; it goes where the alignment leaves space.
      const shift = align === 'center' ? 0.5 : align === 'right' ? 1 : 0
      // More lines keep their spacing; the box only reaches further down for what hangs below the last.
      const below = lines > 1 ? Math.max(0, reach - TEXT_PADDING) : 0
      box = this.rel({
        x: left - TEXT_PADDING - shift,
        y: top - TEXT_PADDING,
        width: right - left + 1 + TEXT_PADDING * 2,
        height: (lines === 1 ? lineHeightUsed : lines * lineHeight) + TEXT_PADDING * 2 + 1 + below,
      })
    } else {
      const centers = rects.map((rect) => rect.left + rect.width / 2).sort((a, b) => b - a)
      lines = Math.round((centers[0] - centers[centers.length - 1]) / lineHeight) + 1 + leading + trailing
      const right = centers[0] + lineHeight / 2 + leading * lineHeight
      const top = Math.min(...rects.map((rect) => rect.top))
      const bottom = Math.max(...rects.map((rect) => rect.bottom))
      const shift = align === 'center' ? 0.5 : align === 'right' ? 1 : 0
      box = this.rel({
        x: right - lines * lineHeight - TEXT_PADDING,
        y: top - TEXT_PADDING - shift,
        width: lines * lineHeight + TEXT_PADDING * 2 + 1,
        height: bottom - top + 1 + TEXT_PADDING * 2,
      })
    }

    const letterSpacing = parsePx(style.letterSpacing)
    const strokeWidth = parsePx(style.getPropertyValue('-webkit-text-stroke-width')) ?? 0
    const strokeColor = this.color(style.getPropertyValue('-webkit-text-stroke-color'))
    const textShadow = parseShadows(style.textShadow, this.resolveColor)[0]
    const whole = pieces.every((piece) => piece.run.element === container || container.contains(piece.run.element))
      && container.getAttribute('data-name')
    const node: FreeformTextElement = {
      ...this.base(whole ? (container.getAttribute('data-name') as string) : textName(text), box),
      type: 'text',
      text,
      ...(merged.length > 0 ? { spans: merged } : {}),
      fontSize: rounded(fontSize),
      fontFamily: chooseFont(style.fontFamily).fontFamily,
      textFill: gradientText ? gradientText.paint : { type: 'solid', color: baseColor },
      align,
      fontWeight: allBold ? 'bold' : 'normal',
      lineHeight: Math.max(0.5, Math.min(4, Math.round((lineHeightUsed / fontSize) * 10000) / 10000)),
      ...(letterSpacing !== null && Math.abs(letterSpacing) > 0.001 ? { letterSpacing: Math.max(-50, Math.min(200, rounded(letterSpacing))) } : {}),
      ...(dominant.italic ? { italic: true as const } : {}),
      ...(vertical ? { vertical: true as const } : {}),
      ...(strokeWidth > 0.01 && strokeColor
        ? { stroke: hexOf(strokeColor.a < 1 ? blendOver(strokeColor, backdrop) : strokeColor), strokeWidth: Math.max(0.5, Math.min(100, rounded(strokeWidth))) }
        : {}),
    }
    return [this.finishLeaf(node, dominantPiece.run.element, alpha, { shadow: this.shadowOf(textShadow, backdrop) })]
  }

  /**
   * A list the editor can hold as one text (v20 lists): a <ul> or <ol> of
   * items that are only words, all in one size, font and colour, with one
   * marker style outside and even gaps. Null for anything else, which is read
   * item by item.
   */
  private simpleList(list: Element): { items: Element[]; list: 'bullet' | 'number'; spacing: number } | null {
    if (list.tagName !== 'UL' && list.tagName !== 'OL') return null
    if (list.hasAttribute('reversed') || (list.getAttribute('start') ?? '1') !== '1') return null
    const children = this.flowChildren(list).filter((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim())
    if (children.length < 2 || children.some((node) => node.nodeType !== Node.ELEMENT_NODE)) return null
    const items = children as Element[]
    const first = this.style(items[0])
    const markers: Record<string, 'bullet' | 'number'> = { disc: 'bullet', circle: 'bullet', square: 'bullet', decimal: 'number' }
    const kind = markers[first.listStyleType]
    if (!kind) return null
    const look = (style: CSSStyleDeclaration) => [style.fontSize, style.fontFamily, style.fontWeight, style.fontStyle, style.lineHeight, style.color, style.letterSpacing, style.textAlign].join('|')
    for (const item of items) {
      const style = this.style(item)
      if (style.display !== 'list-item' || item.hasAttribute('value') || this.classify(item) !== 'block') return null
      if (style.listStyleType !== first.listStyleType || style.listStylePosition !== 'outside' || style.listStyleImage !== 'none') return null
      if (look(style) !== look(first)) return null
      // An item with its own box would lose it in a text.
      const background = this.color(style.backgroundColor)
      if ((background && background.a > 0.004) || style.backgroundImage !== 'none' || style.boxShadow !== 'none') return null
      if (['top', 'right', 'bottom', 'left'].some((side) => (parsePx(style.getPropertyValue(`border-${side}-width`)) ?? 0) > 0)) return null
      // Only words inside, in the item's own size.
      for (const descendant of Array.from(item.querySelectorAll('*'))) {
        const kindOf = this.classify(descendant)
        if (kindOf !== 'inline' && kindOf !== 'br' && kindOf !== 'skip') return null
        if (this.style(descendant).fontSize !== first.fontSize) return null
      }
    }
    const boxes = items.map((item) => this.contentBox(item))
    const gaps = boxes.slice(1).map((box, index) => box.y - (boxes[index].y + boxes[index].height))
    if (gaps.some((gap) => gap < -0.5 || Math.abs(gap - gaps[0]) > 1)) return null
    if (boxes.some((box) => Math.abs(box.x - boxes[0].x) > 0.5 || Math.abs(box.width - boxes[0].width) > 0.5)) return null
    return { items, list: kind, spacing: Math.max(0, gaps[0] ?? 0) }
  }

  /** A simple list (simpleList) as one list text: its items' words a paragraph each, where they were. */
  private listNodes(listElement: Element): FreeformSceneNode[] {
    const found = this.simpleList(listElement)
    if (!found) return []
    const runs: Run[] = []
    for (const [index, item] of found.items.entries()) {
      if (index > 0) runs.push({ text: '\n', node: null, element: listElement, map: [] })
      const itemRuns: Run[] = []
      const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const { text, map } = this.renderedText(node as Text)
          if (text) itemRuns.push({ text, node: node as Text, element: (node as Text).parentElement as Element, map })
          return
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return
        const kind = this.classify(node as Element)
        if (kind === 'br') itemRuns.push({ text: '\n', node: null, element: item, map: [] })
        else if (kind === 'inline') for (const child of this.flowChildren(node as Element)) walk(child)
      }
      for (const child of this.flowChildren(item)) walk(child)
      runs.push(...collapseSpaces(itemRuns, (run) => (run.node ? collapses(this.style(run.element).whiteSpace) : false)))
    }
    const built = this.textFromRunsWhole(found.items[0], runs)
    if (built.length !== 1 || built[0].type !== 'text') return built
    const node = built[0]
    const boxes = found.items.map((item) => this.contentBox(item))
    const top = boxes[0].y
    const bottom = boxes[boxes.length - 1].y + boxes[boxes.length - 1].height
    const indent = listIndentEm(found.list, found.items.length) * node.fontSize
    const shift = node.align === 'center' ? 0.5 : node.align === 'right' ? 1 : 0
    return [{
      ...node,
      name: listElement.getAttribute('data-name') ?? node.name,
      x: rounded(boxes[0].x - indent - TEXT_PADDING - shift),
      y: rounded(top - TEXT_PADDING),
      width: rounded(boxes[0].width + indent + 1 + TEXT_PADDING * 2),
      height: rounded(bottom - top + TEXT_PADDING * 2 + 1),
      list: found.list,
      ...(found.spacing > 0.5 ? { paragraphSpacing: Math.min(1000, rounded(found.spacing)) } : {}),
    }]
  }

  private markerNodes(item: Element): FreeformSceneNode[] {
    const style = this.style(item)
    if (style.listStyleType === 'none') return []
    if (style.listStyleImage && style.listStyleImage !== 'none') {
      this.note(item, '列表项目符号图片没有转')
      return []
    }
    if (style.listStylePosition === 'inside') {
      this.note(item, '行内的列表编号（list-style-position: inside）没有转')
      return []
    }
    const parent = item.parentElement
    let index = Number.parseInt(item.getAttribute('value') ?? '', 10)
    if (!Number.isFinite(index)) {
      index = Number.parseInt(parent?.getAttribute('start') ?? '1', 10) || 1
      for (let sibling = item.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        if (this.style(sibling).display === 'list-item') index += 1
      }
    }
    const text = listMarkerText(style.listStyleType, index)
    if (!text) {
      this.note(item, `列表样式 ${style.listStyleType} 没有转`)
      return []
    }
    const range = this.doc.createRange()
    range.selectNodeContents(item)
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0.01 && rect.height > 0.01)
    if (rects.length === 0) return []
    const lineHeight = parsePx(style.lineHeight) ?? this.normalLineHeight(style)
    const firstTop = Math.min(...rects.map((rect) => rect.top))
    const firstLine = rects.filter((rect) => rect.top < firstTop + lineHeight * 0.5)
    const center = firstLine.reduce((sum, rect) => sum + rect.top + rect.height / 2, 0) / firstLine.length
    const markerStyle = this.view.getComputedStyle(item, '::marker')
    const color = this.color(markerStyle.color) ?? this.color(style.color) ?? { r: 0, g: 0, b: 0, a: 1 }
    const width = this.textWidth(style, text)
    const space = this.textWidth(style, ' ')
    const itemRect = item.getBoundingClientRect()
    const contentLeft = itemRect.left + (parsePx(style.borderLeftWidth) ?? 0) + (parsePx(style.paddingLeft) ?? 0)
    const box = this.rel({
      x: contentLeft - space - width - 1 - TEXT_PADDING,
      y: center - lineHeight / 2 - TEXT_PADDING,
      width: width + 1 + TEXT_PADDING * 2,
      height: lineHeight + TEXT_PADDING * 2 + 1,
    })
    const fontSize = parsePx(style.fontSize) ?? 16
    const node: FreeformTextElement = {
      ...this.base(text, box),
      type: 'text',
      text,
      fontSize: rounded(fontSize),
      fontFamily: chooseFont(style.fontFamily).fontFamily,
      textFill: { type: 'solid', color: hexOf(color.a < 1 ? blendOver(color, this.backdropOf(item)) : color) },
      align: 'right',
      fontWeight: isBoldWeight(style.fontWeight) ? 'bold' : 'normal',
      lineHeight: Math.max(0.5, Math.min(4, Math.round((lineHeight / fontSize) * 10000) / 10000)),
    }
    return [this.finishLeaf(node, item, 1)]
  }

  private replacedNodes(element: Element): FreeformSceneNode[] {
    const tag = element.tagName.toUpperCase()
    if (tag === 'IMG') return this.imageNodes(element as HTMLImageElement)
    if (tag === 'PICTURE') {
      const image = element.querySelector('img')
      return image ? this.imageNodes(image) : []
    }
    if (tag === 'SVG') return this.svgNodes(element as SVGSVGElement)
    if (tag === 'CANVAS') {
      try {
        const src = (element as HTMLCanvasElement).toDataURL('image/png')
        return this.pictureNodes(element, src, { width: (element as HTMLCanvasElement).width, height: (element as HTMLCanvasElement).height })
      } catch {
        this.note(element, '画布内容读不出来，没有转')
        return []
      }
    }
    if (tag === 'VIDEO') {
      const poster = element.getAttribute('poster')
      const natural = poster ? this.pictureSize(poster) : null
      if (poster && natural) return this.pictureNodes(element, poster, natural)
      this.note(element, '视频没有封面图，没有转')
      return []
    }
    this.note(element, `<${tag.toLowerCase()}> 没有转`)
    return []
  }

  private imageNodes(image: HTMLImageElement): FreeformSceneNode[] {
    const src = image.currentSrc || image.getAttribute('src') || ''
    if (!src) return []
    if (!image.naturalWidth || !image.naturalHeight) {
      this.note(image, '图片没有加载出来，没有转')
      return []
    }
    return this.pictureNodes(image, src, { width: image.naturalWidth, height: image.naturalHeight })
  }

  /** The box drawn by object-fit / object-position inside a content box. */
  private objectRect(content: Rect, natural: { width: number; height: number }, fit: string, position: string, element: Element): Rect {
    const scaleX = content.width / natural.width
    const scaleY = content.height / natural.height
    let width = content.width
    let height = content.height
    if (fit === 'contain' || fit === 'cover' || fit === 'scale-down' || fit === 'none') {
      const scale = fit === 'contain'
        ? Math.min(scaleX, scaleY)
        : fit === 'cover'
          ? Math.max(scaleX, scaleY)
          : fit === 'none'
            ? 1
            : Math.min(1, Math.min(scaleX, scaleY))
      width = natural.width * scale
      height = natural.height * scale
    } else if (Math.abs(scaleX / scaleY - 1) > 0.02) {
      this.note(element, '图片在网页里被拉伸变形，转换后按铺满裁切')
    }
    const [xPart = '50%', yPart = '50%'] = splitTopLevel(position, ' ')
    return {
      x: content.x + this.offsetIn(xPart, content.width - width),
      y: content.y + this.offsetIn(yPart, content.height - height),
      width,
      height,
    }
  }

  /** The part of `frame` its overflow-clipping ancestors (and the page) leave visible. */
  private clippedByAncestors(element: Element, frame: Rect): Rect | null {
    let visible: Rect | null = intersect(frame, this.pageRect())
    for (let current = element.parentElement; current && visible; current = current === this.page ? null : current.parentElement) {
      const style = this.style(current)
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
      visible = intersect(visible, this.paddingBox(current))
    }
    return visible
  }

  private paddingBox(element: Element): Area {
    const style = this.style(element)
    const border = this.rel(element.getBoundingClientRect())
    const borders = this.bordersOf(style)
    return {
      x: border.x + borders.left.width,
      y: border.y + borders.top.width,
      width: Math.max(0, border.width - borders.left.width - borders.right.width),
      height: Math.max(0, border.height - borders.top.width - borders.bottom.width),
      radii: insetRadii(this.radiiOf(style, border), borders.top.width, borders.right.width, borders.bottom.width, borders.left.width),
    }
  }

  /** An element's content box (inside its borders and padding), in page coordinates. */
  private contentBox(element: Element): Rect {
    const style = this.style(element)
    const border = this.rel(element.getBoundingClientRect())
    const side = (name: string) => parsePx(style.getPropertyValue(name)) ?? 0
    const left = side('border-left-width') + side('padding-left')
    const top = side('border-top-width') + side('padding-top')
    return {
      x: border.x + left,
      y: border.y + top,
      width: Math.max(0, border.width - left - side('border-right-width') - side('padding-right')),
      height: Math.max(0, border.height - top - side('border-bottom-width') - side('padding-bottom')),
    }
  }

  /** Rounded corners a clipping ancestor cuts into a picture that fills it. */
  private roundedClipper(element: Element, frame: Rect): CornerRadii | null {
    for (let current = element.parentElement; current; current = current === this.page ? null : current.parentElement) {
      const style = this.style(current)
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
      const box = this.paddingBox(current)
      if (sameRect(box, frame) && hasRadius(box.radii)) return box.radii
      if (!sameRect(box, frame, 2)) break
    }
    return null
  }

  private pictureNodes(element: Element, src: string, natural: { width: number; height: number }): FreeformSceneNode[] {
    const style = this.style(element)
    if (style.visibility !== 'visible') return []
    const border = this.rel(element.getBoundingClientRect())
    const borders = this.bordersOf(style)
    const pad = (name: string) => parsePx(style.getPropertyValue(name)) ?? 0
    const content: Rect = {
      x: border.x + borders.left.width + pad('padding-left'),
      y: border.y + borders.top.width + pad('padding-top'),
      width: Math.max(0, border.width - borders.left.width - borders.right.width - pad('padding-left') - pad('padding-right')),
      height: Math.max(0, border.height - borders.top.width - borders.bottom.width - pad('padding-top') - pad('padding-bottom')),
    }
    if (content.width <= 0.01 || content.height <= 0.01) return []
    const drawn = this.objectRect(content, natural, style.objectFit, style.objectPosition, element)
    const inside = intersect(content, drawn)
    const frame = inside ? this.clippedByAncestors(element, inside) : null
    if (!frame) return []
    const radii = this.radiiOf(style, border)
    const contentRadii = insetRadii(
      radii,
      borders.top.width + pad('padding-top'),
      borders.right.width + pad('padding-right'),
      borders.bottom.width + pad('padding-bottom'),
      borders.left.width + pad('padding-left'),
    )
    const corners = hasRadius(contentRadii) && sameRect(frame, content) ? contentRadii : this.roundedClipper(element, frame) ?? NO_RADII
    const framing = this.framingFor(natural, frame, drawn, element)
    const backdrop = this.backdropOf(element)
    const shadow = this.shadowOf(parseShadows(style.boxShadow, this.resolveColor).find((entry) => !entry.inset), backdrop)
    const name = element.getAttribute('data-name') ?? (element.getAttribute('alt') || '图片')
    if (!hasRadius(corners)) {
      const node: FreeformImageElement = {
        ...this.base(name, frame),
        type: 'image',
        src,
        alt: element.getAttribute('alt') ?? '',
        fit: 'cover',
        framing,
      }
      return [this.finishLeaf(node, element, 1, { shadow })]
    }
    const fill: ImagePaint = { type: 'image', src, fit: 'cover', framing }
    return [this.finishLeaf(this.shape(name, { ...frame, radii: corners }, fill, null), element, 1, { shadow })]
  }

  private svgGeometry(element: SVGGraphicsElement): string | null {
    const length = (value: SVGAnimatedLength | undefined) => value?.baseVal.value ?? 0
    switch (element.localName) {
      case 'path':
        return element.getAttribute('d')
      case 'rect': {
        const rect = element as SVGRectElement
        return svgRectPath(
          length(rect.x), length(rect.y), length(rect.width), length(rect.height),
          rect.hasAttribute('rx') ? length(rect.rx) : null,
          rect.hasAttribute('ry') ? length(rect.ry) : null,
        )
      }
      case 'circle': {
        const circle = element as SVGCircleElement
        return length(circle.r) > 0 ? ellipsePath(length(circle.cx), length(circle.cy), length(circle.r), length(circle.r)) : null
      }
      case 'ellipse': {
        const ellipse = element as SVGEllipseElement
        return length(ellipse.rx) > 0 && length(ellipse.ry) > 0
          ? ellipsePath(length(ellipse.cx), length(ellipse.cy), length(ellipse.rx), length(ellipse.ry))
          : null
      }
      case 'line': {
        const line = element as SVGLineElement
        return `M ${length(line.x1)} ${length(line.y1)} L ${length(line.x2)} ${length(line.y2)}`
      }
      case 'polyline':
      case 'polygon':
        return polylinePath(parsePoints(element.getAttribute('points') ?? ''), element.localName === 'polygon')
      default:
        return null
    }
  }

  /** An SVG fill or stroke: a colour, or a gradient a paint can roughly follow. */
  private svgPaint(value: string, element: Element): { paint: ColorPaint; alpha: number } | null {
    if (!value || value === 'none') return null
    const reference = /url\((['"]?)#([^'")]+)\1\)/.exec(value)
    if (reference) {
      const gradient = element.ownerDocument.getElementById(reference[2])
      const paint = gradient ? this.svgGradient(gradient, element) : null
      if (paint) return paint
      const fallback = this.color(value.replace(reference[0], '').trim())
      return fallback && fallback.a > 0 ? { paint: { type: 'solid', color: hexOf(fallback) }, alpha: fallback.a } : null
    }
    const color = this.color(value)
    return color && color.a > 0.004 ? { paint: { type: 'solid', color: hexOf(color) }, alpha: color.a } : null
  }

  private svgGradient(gradient: Element, user: Element): { paint: ColorPaint; alpha: number } | null {
    let stopsOwner: Element | null = gradient
    for (let hops = 0; stopsOwner && stopsOwner.querySelectorAll('stop').length === 0 && hops < 4; hops += 1) {
      const href: string | null = stopsOwner.getAttribute('href') ?? stopsOwner.getAttribute('xlink:href')
      stopsOwner = href?.startsWith('#') ? gradient.ownerDocument.getElementById(href.slice(1)) : null
    }
    const stops = stopsOwner ? Array.from(stopsOwner.querySelectorAll('stop')) : []
    if (stops.length === 0) return null
    const read = stops.map((stop) => {
      const offsetText = stop.getAttribute('offset') ?? '0'
      const offset = Number.parseFloat(offsetText) / (offsetText.endsWith('%') ? 100 : 1)
      const stopStyle = styleOf(stop)
      const color = this.color(stopStyle.getPropertyValue('stop-color')) ?? { r: 0, g: 0, b: 0, a: 1 }
      const opacity = Number.parseFloat(stopStyle.getPropertyValue('stop-opacity'))
      return { offset: Math.max(0, Math.min(1, Number.isFinite(offset) ? offset : 0)), color: { ...color, a: color.a * (Number.isFinite(opacity) ? opacity : 1) } }
    })
    if (gradient.hasAttribute('gradientTransform') || gradient.getAttribute('gradientUnits') === 'userSpaceOnUse') {
      this.note(user, 'SVG 渐变的坐标设置按图形自身的范围近似')
    }
    let css: CssGradient
    if (gradient.localName === 'linearGradient') {
      const coordinate = (name: string, fallback: number) => {
        const raw = gradient.getAttribute(name)
        if (raw === null) return fallback
        const number = Number.parseFloat(raw)
        return raw.endsWith('%') ? number / 100 : number
      }
      const box = (user as SVGGraphicsElement).getBBox?.() ?? { width: 1, height: 1 }
      const dx = (coordinate('x2', 1) - coordinate('x1', 0)) * box.width
      const dy = (coordinate('y2', 0) - coordinate('y1', 0)) * box.height
      const angle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
      css = { kind: 'linear', angle, stops: read }
    } else {
      css = { kind: 'radial', exact: true, stops: read }
    }
    const native = gradientPaint(css)
    if (native) return native
    const backdrop = this.backdropOf(user.closest('svg') ?? user)
    return gradientPaint({ ...css, stops: read.map((stop) => ({ ...stop, color: blendOver(stop.color, backdrop) })) })
  }

  private svgNodes(svg: SVGSVGElement): FreeformSceneNode[] {
    if (this.style(svg).visibility === 'hidden') return []
    const nodes: FreeformSceneNode[] = []
    const opacityWithin = (element: Element) => {
      let opacity = 1
      for (let current: Element | null = element; current && current !== svg; current = current.parentElement) {
        const value = Number.parseFloat(styleOf(current).opacity)
        if (Number.isFinite(value)) opacity *= value
      }
      return opacity
    }
    const walk = (parent: Element) => {
      for (const child of Array.from(parent.children)) {
        const name = child.localName
        if (SVG_HIDDEN_CONTAINERS.has(name)) continue
        const childStyle = styleOf(child)
        if (childStyle.display === 'none') continue
        if (name === 'g' || name === 'a' || name === 'svg' || name === 'switch') {
          walk(child)
          continue
        }
        if (SVG_SHAPES.has(name)) {
          if (childStyle.visibility !== 'hidden') {
            const node = this.svgShape(child as SVGGraphicsElement, svg, opacityWithin(child))
            if (node) nodes.push(node)
          }
          continue
        }
        if (name === 'image') {
          const href = child.getAttribute('href') ?? child.getAttribute('xlink:href')
          const natural = href ? this.pictureSize(href) : null
          if (href && natural) {
            const rect = this.rel(child.getBoundingClientRect())
            const drawn = this.objectRect(rect, natural, 'contain', '50% 50%', child)
            const frame = intersect(rect, drawn)
            if (frame) {
              const node: FreeformImageElement = {
                ...this.base('图片', frame),
                type: 'image',
                src: href,
                alt: '',
                fit: 'cover',
                framing: this.framingFor(natural, frame, drawn, child),
              }
              nodes.push(this.finishLeaf(node, svg, opacityWithin(child)))
            }
          }
          continue
        }
        if (name === 'text') {
          if (childStyle.visibility !== 'hidden') {
            const node = this.svgText(child as SVGTextElement, svg, opacityWithin(child))
            if (node) nodes.push(node)
          }
        } else if (name === 'use') this.note(svg, 'SVG 的 <use> 引用没有转，请把图形直接写进来')
        else if (name === 'foreignObject') this.note(svg, 'SVG 的 foreignObject 没有转')
      }
    }
    walk(svg)
    const name = svg.getAttribute('data-name') ?? '图形'
    if (nodes.length === 1) return [{ ...nodes[0], name }]
    if (nodes.length === 0) return []
    const corner = this.rel(svg.getBoundingClientRect())
    return [this.group(name, { x: corner.x, y: corner.y }, nodes, 0, 1)]
  }

  private svgShape(element: SVGGraphicsElement, svg: SVGSVGElement, opacity: number): FreeformSceneNode | null {
    const d = this.svgGeometry(element)
    const screen = element.getScreenCTM()
    if (!d || !screen) return null
    const matrix: Affine = [screen.a, screen.b, screen.c, screen.d, screen.e - this.origin.x, screen.f - this.origin.y]
    const pattern = this.unevenDashes(element)
    const mapped = pattern ? this.dashedOutline(element as SVGGeometryElement, pattern, matrix) : transformPathData(d, matrix)
    if (!mapped) {
      this.note(svg, '有一段 SVG 路径太长或写法不对，没有转')
      return null
    }
    const bounds = pathDataBounds(mapped)
    if (!bounds) return null
    const style = styleOf(element)
    const fill = this.svgPaint(style.fill, element)
    const stroke = this.svgPaint(style.stroke, element)
    if (!fill && !stroke) return null
    const scale = Math.sqrt(Math.abs(screen.a * screen.d - screen.b * screen.c))
    const nonScaling = style.getPropertyValue('vector-effect') === 'non-scaling-stroke'
    const strokeWidth = stroke ? (parsePx(style.strokeWidth) ?? 1) * (nonScaling ? 1 : scale) : 0
    const half = strokeWidth / 2
    const box: Rect = {
      x: bounds.x - half,
      y: bounds.y - half,
      width: Math.max(0.01, bounds.width + strokeWidth),
      height: Math.max(0.01, bounds.height + strokeWidth),
    }
    const fillOpacity = Number.parseFloat(style.fillOpacity)
    const strokeOpacity = Number.parseFloat(style.strokeOpacity)
    const alpha = fill
      ? fill.alpha * (Number.isFinite(fillOpacity) ? fillOpacity : 1)
      : (stroke as { alpha: number }).alpha * (Number.isFinite(strokeOpacity) ? strokeOpacity : 1)
    const dashes = !pattern && style.strokeDasharray && style.strokeDasharray !== 'none' ? parsePx(splitTopLevel(style.strokeDasharray)[0]) : null
    const cap = style.strokeLinecap === 'round' || style.strokeLinecap === 'square' ? style.strokeLinecap : 'butt'
    const join = style.strokeLinejoin === 'round' || style.strokeLinejoin === 'bevel' ? style.strokeLinejoin : 'miter'
    const node: FreeformPathElement = {
      ...this.base('图形', box),
      type: 'path',
      d: mapped,
      viewBox: { x: rounded(box.x), y: rounded(box.y), width: Math.max(0.01, rounded(box.width)), height: Math.max(0.01, rounded(box.height)) },
      fill: fill ? fill.paint : { type: 'transparent' },
      stroke: stroke && stroke.paint.type === 'solid' ? stroke.paint.color : '#000000',
      strokeWidth: rounded(Math.min(10000, strokeWidth)),
      ...(dashes && dashes > 0 ? { dash: rounded(dashes * (nonScaling ? 1 : scale)) } : {}),
      cap,
      join,
      ...(style.fillRule === 'evenodd' ? { fillRule: 'evenodd' as const } : {}),
    }
    return this.finishLeaf(node, svg, alpha * opacity)
  }

  /** A dash pattern a path's single even dash can't draw (dash and gap differ, or it is shifted); null otherwise. */
  private unevenDashes(element: Element): { lengths: number[]; offset: number } | null {
    const style = styleOf(element)
    if (!style.strokeDasharray || style.strokeDasharray === 'none' || style.stroke === 'none') return null
    let lengths = style.strokeDasharray.split(/[\s,]+/).map((part) => parsePx(part) ?? 0).filter((value) => value >= 0)
    if (lengths.length === 0 || lengths.every((value) => value === 0)) return null
    if (lengths.length % 2 === 1) lengths = [...lengths, ...lengths]
    const offset = parsePx(style.strokeDashoffset) ?? 0
    const even = lengths.every((value) => Math.abs(value - lengths[0]) < 1e-6)
    return even && Math.abs(offset) < 1e-6 ? null : { lengths, offset }
  }

  /** The visible dashes of a dashed SVG stroke, each traced as a sub-path of short segments. */
  private dashedOutline(element: SVGGeometryElement, pattern: { lengths: number[]; offset: number }, matrix: Affine): string | null {
    const total = element.getTotalLength?.() ?? 0
    if (!(total > 0)) return null
    const cycle = pattern.lengths.reduce((sum, value) => sum + value, 0)
    if (!(cycle > 0)) return null
    const dashes: Array<[number, number]> = []
    let distance = -(((pattern.offset % cycle) + cycle) % cycle)
    for (let index = 0; distance < total && dashes.length < 400; index += 1) {
      const length = pattern.lengths[index % pattern.lengths.length]
      if (index % 2 === 0) {
        const from = Math.max(0, distance)
        const to = Math.min(total, distance + length)
        if (to > from) dashes.push([from, to])
      }
      distance += length
    }
    const scale = Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])) || 1
    const parts: string[] = []
    for (const [from, to] of dashes) {
      // About one point per 2 px on screen.
      const steps = Math.max(1, Math.min(160, Math.ceil(((to - from) * scale) / 2)))
      const points: string[] = []
      for (let step = 0; step <= steps; step += 1) {
        const point = element.getPointAtLength(from + ((to - from) * step) / steps)
        const mapped = applyAffine(matrix, point.x, point.y)
        points.push(`${rounded(mapped.x)} ${rounded(mapped.y)}`)
      }
      parts.push(`M ${points[0]}${points.slice(1).map((point) => ` L ${point}`).join('')}`)
    }
    const d = parts.join(' ')
    return d.length > 0 && d.length <= 20_000 ? d : null
  }

  /** An SVG <text> as a one-line text box where the browser drew it. */
  private svgText(element: SVGTextElement, svg: SVGSVGElement, opacity: number): FreeformSceneNode | null {
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
    const screen = element.getScreenCTM()
    if (!text || !screen) return null
    const style = styleOf(element)
    const fill = this.svgPaint(style.fill, element)
    if (!fill) return null
    const scale = Math.sqrt(Math.abs(screen.a * screen.d - screen.b * screen.c)) || 1
    const rotation = Math.round(((((Math.atan2(screen.b, screen.a) * 180) / Math.PI) % 360) + 360) % 360 * 1000) / 1000
    const fontSize = (parsePx(style.fontSize) ?? 16) * scale
    const anchor = style.textAnchor
    const align: FreeformTextElement['align'] = anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left'
    // The upright box, centred where the drawn words are.
    const bounds = element.getBBox()
    const width = bounds.width * scale
    const lineHeight = fontSize * 1.2
    const drawn = this.rel(element.getBoundingClientRect())
    const center = { x: drawn.x + drawn.width / 2, y: drawn.y + drawn.height / 2 }
    const box: Rect = {
      x: center.x - width / 2 - TEXT_PADDING - 1,
      y: center.y - lineHeight / 2 - TEXT_PADDING,
      width: width + 2 + TEXT_PADDING * 2,
      height: lineHeight + TEXT_PADDING * 2 + 1,
    }
    const letterSpacing = parsePx(style.letterSpacing)
    const node: FreeformTextElement = {
      ...this.base(textName(text), box),
      rotation,
      type: 'text',
      text,
      fontSize: rounded(fontSize),
      fontFamily: chooseFont(style.fontFamily).fontFamily,
      textFill: fill.paint,
      align,
      fontWeight: isBoldWeight(style.fontWeight) ? 'bold' : 'normal',
      lineHeight: 1.2,
      ...(letterSpacing !== null && Math.abs(letterSpacing) > 0.001 ? { letterSpacing: Math.max(-50, Math.min(200, rounded(letterSpacing * scale))) } : {}),
      ...(style.fontStyle !== 'normal' ? { italic: true as const } : {}),
    }
    const fillOpacity = Number.parseFloat(style.fillOpacity)
    return this.finishLeaf(node, svg, fill.alpha * (Number.isFinite(fillOpacity) ? fillOpacity : 1) * opacity)
  }

  private group(name: string, pivot: { x: number; y: number }, children: FreeformSceneNode[], rotation: number, scale: number, at = pivot): FreeformGroupNode {
    return {
      id: this.id(),
      name,
      locked: false,
      hidden: false,
      type: 'group',
      x: rounded(at.x),
      y: rounded(at.y),
      rotation,
      scale,
      children: children.map((child) => ({ ...child, x: rounded(child.x - pivot.x), y: rounded(child.y - pivot.y) })),
    }
  }

  /** A turned element's nodes: one node turns about its own centre, more go into a turned group. */
  private wrap(element: Element, nodes: FreeformSceneNode[]): FreeformSceneNode[] {
    if (nodes.length === 0) return []
    const name = element.getAttribute('data-name') ?? '组合'
    const transform = this.prepared.transforms.get(element)
    if (!transform) {
      if (!element.hasAttribute('data-group')) return nodes
      const corner = this.rel(element.getBoundingClientRect())
      return [this.group(name, { x: corner.x, y: corner.y }, nodes, 0, 1)]
    }
    const rect = this.rel(element.getBoundingClientRect())
    const pivot = { x: rect.x + transform.origin.x, y: rect.y + transform.origin.y }
    const { rotation, scale, exact } = similarityOf(transform.matrix)
    if (!exact) this.note(element, '斜切或长宽不等比的缩放按等比缩放近似')
    const linear: Affine = [transform.matrix[0], transform.matrix[1], transform.matrix[2], transform.matrix[3], 0, 0]
    const moved = { x: pivot.x + transform.matrix[4], y: pivot.y + transform.matrix[5] }
    if (nodes.length === 1 && nodes[0].type !== 'group') {
      const leaf = nodes[0]
      const center = applyAffine(linear, leaf.x + leaf.width / 2 - pivot.x, leaf.y + leaf.height / 2 - pivot.y)
      return [{
        ...leaf,
        x: rounded(moved.x + center.x - leaf.width / 2),
        y: rounded(moved.y + center.y - leaf.height / 2),
        rotation: Math.round((((leaf.rotation + rotation) % 360) + 360) % 360 * 1000) / 1000,
        scale: leaf.scale * scale,
      }]
    }
    return [this.group(name, pivot, nodes, rotation, scale, moved)]
  }

  /** The page's own background: a colour or a picture covering it, with any other layers as nodes. */
  async background(): Promise<{ background: SlideBackground; nodes: FreeformSceneNode[] }> {
    const style = this.style(this.page)
    let color = this.color(style.backgroundColor)
    // A transparent page shows what is behind it in the browser.
    for (let current = this.page.parentElement; (!color || color.a < 0.004) && current; current = current.parentElement) {
      color = this.color(this.style(current).backgroundColor)
    }
    const backdrop = color && color.a > 0.004 ? blendOver(color, WHITE) : WHITE
    this.pageBackdrop = backdrop
    const layers = splitTopLevel(style.backgroundImage).filter((layer) => layer !== 'none')
    const page: Area = { ...this.pageRect(), radii: NO_RADII }
    const solid: SlideBackground = { type: 'solid', color: hexOf(backdrop) }
    if (layers.length === 0) return { background: solid, nodes: [] }
    if (layers.length === 1) {
      const url = /^url\((['"]?)(.*)\1\)$/s.exec(layers[0])
      const natural = url ? this.pictureSize(url[2]) : null
      const size = splitTopLevel(style.backgroundSize)[0] ?? 'auto'
      if (url && natural) {
        const tile = this.tileRect(page, size, splitTopLevel(style.backgroundPosition)[0] ?? '0% 0%', natural)
        if (tile.width >= page.width - 0.5 && tile.height >= page.height - 0.5) {
          return { background: { type: 'image', src: url[2], fit: 'cover', framing: this.framingFor(natural, page, tile, this.page) }, nodes: [] }
        }
      }
      const gradient = url ? null : parseGradient(layers[0], page.width, page.height, this.resolveColor)
      const native = gradient ? gradientPaint(gradient) : null
      if (native && native.alpha > 0.996) return { background: native.paint, nodes: [] }
    }
    const nodes = await this.backgroundLayers(this.page, style, '页面背景', () => page, {}, backdrop)
    return { background: solid, nodes }
  }
}

/** Every picture the page names in CSS or SVG, loaded once for its size. */
async function pictureSizes(doc: Document): Promise<Map<string, { width: number; height: number }>> {
  const view = doc.defaultView as Window
  const sources = new Set<string>()
  for (const element of Array.from(doc.body.querySelectorAll('*'))) {
    const style = view.getComputedStyle(element)
    for (const layer of splitTopLevel(style.backgroundImage)) {
      const url = /^url\((['"]?)(.*)\1\)$/s.exec(layer)
      if (url) sources.add(url[2])
    }
    if (element.localName === 'image') {
      const href = element.getAttribute('href') ?? element.getAttribute('xlink:href')
      if (href) sources.add(href)
    }
    if (element.tagName === 'VIDEO' && element.getAttribute('poster')) sources.add(element.getAttribute('poster') as string)
  }
  for (const element of [doc.body, doc.documentElement]) {
    for (const layer of splitTopLevel(view.getComputedStyle(element).backgroundImage)) {
      const url = /^url\((['"]?)(.*)\1\)$/s.exec(layer)
      if (url) sources.add(url[2])
    }
  }
  const sizes = new Map<string, { width: number; height: number }>()
  await Promise.all(Array.from(sources, (src) => new Promise<void>((resolve) => {
    const image = new (view as unknown as { Image: typeof Image }).Image()
    const done = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) sizes.set(src, { width: image.naturalWidth, height: image.naturalHeight })
      resolve()
    }
    const timer = view.setTimeout(done, 8000)
    image.onload = () => {
      view.clearTimeout(timer)
      done()
    }
    image.onerror = () => {
      view.clearTimeout(timer)
      resolve()
    }
    image.src = src
  })))
  return sizes
}

/**
 * The pages of a prepared HTML document as a freeform document: each
 * <section> directly under <body> is a page (else the body is one page of
 * `options.width` × `options.height`). Notes on page 0 are about the whole
 * document.
 */
export async function importHtmlDocument(doc: Document, prepared: PreparedHtml, options: HtmlImportOptions): Promise<HtmlImportResult> {
  const newId = options.newId ?? (() => randomId())
  // One note per page and message, counting the elements it is about (an element read twice counts once).
  const notes = new Map<string, HtmlImportNote & { targets: Set<unknown> }>()
  const addNote = (page: number, target: string, message: string, about: unknown = target) => {
    const key = `${page}|${message}`
    const existing = notes.get(key)
    if (existing) existing.targets.add(about)
    else notes.set(key, { page, target, message, targets: new Set([about]) })
  }
  const view = doc.defaultView as Window
  const sections = Array.from(doc.body.children).filter((element) => element.tagName === 'SECTION' && view.getComputedStyle(element).display !== 'none')
  const pages = sections.length > 0 ? sections : [doc.body]
  const pageOf = (element: Element) => Math.max(1, pages.findIndex((page) => page === element || page.contains(element)) + 1)
  const sizes = await pictureSizes(doc)
  const slides: FreeformSlide[] = []
  for (const [index, page] of pages.entries()) {
    const rect = page === doc.body
      ? { x: 0, y: 0, width: options.width, height: options.height }
      : (() => {
        const box = page.getBoundingClientRect()
        return { x: box.left, y: box.top, width: box.width, height: box.height }
      })()
    const width = Math.round(rect.width)
    const height = Math.round(rect.height)
    const clampedWidth = Math.max(PAGE_MIN, Math.min(PAGE_MAX, width))
    const clampedHeight = Math.max(PAGE_MIN, Math.min(PAGE_MAX, height))
    if (clampedWidth !== width || clampedHeight !== height) {
      addNote(index + 1, describe(page), `页面 ${width}×${height} 超出 128–4096，改成了 ${clampedWidth}×${clampedHeight}`)
    }
    const reader = new PageReader(
      doc,
      page,
      { x: rect.x, y: rect.y },
      { width: clampedWidth, height: clampedHeight },
      prepared,
      { ...options, newId },
      (element, message) => addNote(index + 1, element ? describe(element) : '', message, element ?? undefined),
      (src) => sizes.get(src) ?? null,
    )
    const { background, nodes: backgroundNodes } = await reader.background()
    const nodes = [...backgroundNodes, ...await reader.nodesOf(reader.paint(page))]
    slides.push({
      id: newId(),
      name: page.getAttribute('data-name') ?? `Page ${index + 1}`,
      width: clampedWidth,
      height: clampedHeight,
      background,
      nodes,
    })
  }
  for (const { element, message } of prepared.notes) addNote(pageOf(element), describe(element), message, element)
  for (const family of prepared.replacedFonts) addNote(0, family, `没有 ${family} 这款字体，换成了相近的内置字体`)
  return {
    document: { documentVersion: 24, slides, activeSlideId: slides[0].id },
    notes: Array.from(notes.values(), ({ targets, ...note }) => (targets.size > 1 ? { ...note, message: `${note.message}（${targets.size} 处）` } : note)),
  }
}

