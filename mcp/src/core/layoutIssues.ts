// What check_document reports: problems a reader would notice on a rendered
// card, worked out from the document and the render page's measurements of
// it. Each issue names the page and node and says, in plain words, what to do.

import { walkScene } from '../../../src/freeform/sceneTree'
import { progressGeometry } from '../../../src/freeform/progress'
import type { FreeformDocument, FreeformSceneNode, ScenePath } from '../../../src/freeform/types'
import { TEMPLATE_REGISTRY } from '../../../src/templates/registry'
import { FREEFORM_POSTER_SLOTS, FREEFORM_TEMPLATE_SLOTS, posterSampleNames, slotSampleNames } from '../../../src/templates/slots'
import type { FreeformDeckSeriesId, FreeformPosterSeriesId } from '../../../src/templates/types'
import { emWidth } from './textFit'
import type { InspectedSlide } from '../render/renderer'

export type LayoutIssueKind =
  | 'text-overflow'
  | 'text-overlap'
  | 'covered-text'
  | 'off-page'
  | 'low-contrast'
  | 'sample-text'
  | 'empty-text'
  | 'image-failed'
  | 'path-overflow'
  | 'empty-path'
  | 'tiny-qrcode'
  | 'low-contrast-qrcode'
  | 'progress-label-overflow'
  | 'misalignment'
  | 'edge-margin'
  | 'tiny-text'
  | 'too-many-fonts'
  | 'too-many-colors'
  | 'weak-heading'

export interface LayoutIssue {
  page: number
  slideId: string
  kind: LayoutIssueKind
  nodeId: string | null
  /** The node's layer name; with path, enough to target it in apply_actions. */
  node: string | null
  path: ScenePath | null
  message: string
  /** A font size at which an overflowing text fits. */
  fitFontSize?: number
  /** With 'misalignment': the snap the fix pass would apply. */
  alignment?: {
    axis: 'x' | 'y'
    anchorId: string
    moves: Array<{ path: ScenePath; nodeId: string; from: number; to: number }>
  }
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Shapes at least this opaque hide what lies under them. */
const OPAQUE = 0.7

/** Below this a QR code is more decoration than something a phone can scan. */
const QRCODE_MIN_SCAN = 120

/** Edges that differ by this little to this much are slips a reader feels. */
const SNAP_MIN = 4
const SNAP_MAX = 10
/** A box hovering this close to a page edge (without touching it) looks accidental. */
const EDGE_NEAR = 14
/** Body copy smaller than this is unreadable on a phone at card size. */
const TINY_TEXT = 18
/** What a page's palette can hold before it reads as cluttered. */
const MAX_FONTS = 3
const MAX_TEXT_COLORS = 6
/** A heading has to stand over its body by at least this much. */
const HEADING_RATIO = 1.25
/** A little thing under this share of its neighbour hangs off it on purpose. */
const ORNAMENT_AREA_RATIO = 0.2
/** The most alignment issues a page reports before the rest feels repetitive. */
const ALIGNMENT_ISSUES_PER_PAGE = 3

let templateNodeNames: Set<string> | null = null

/**
 * Every node name the built-in templates draw. A pair whose two names both
 * come from a template carries the template's own geometry — its near-misses
 * are the design, not a slip — while anything an agent added keeps its
 * generated name and stays fair game.
 */
function namesOfTemplateNodes(): Set<string> {
  if (templateNodeNames) return templateNodeNames
  const names = new Set<string>()
  for (const template of TEMPLATE_REGISTRY) {
    if (template.workspace !== 'freeform' || !template.createFreeform) continue
    for (const slide of template.createFreeform().slides) {
      walkScene(slide.nodes, (node) => names.add(node.name))
    }
  }
  templateNodeNames = names
  return names
}

interface TemplateMarks {
  /**
   * Sample text in a slot (copy that must not reach a finished deck), with
   * the names of the template nodes that carry it: the same words written by
   * someone else (a button that says 扫码报名) aren't left-over samples.
   */
  samples: Map<string, Set<string>>
  /** Decoration drawn as the template drew it (page numbers masked): its look is the template's choice. */
  decoration: Set<string>
  /** Text colour on background colour pairs the templates use on purpose. */
  colourPairs: Set<string>
}

let marks: TemplateMarks | null = null

const decorationKey = (node: { name: string; text: string; fontSize: number; width: number; height: number }) => (
  `${node.name}|${node.text.replace(/\d/g, '#')}|${node.fontSize}|${node.width}|${node.height}`
)

const colourKey = (text: string, background: string) => `${text.toLowerCase()}|${background.toLowerCase()}`

/** What the built-in templates draw on purpose, so check_document only reports what changed. */
export function templateMarks(): TemplateMarks {
  if (marks) return marks
  const result: TemplateMarks = { samples: new Map(), decoration: new Set(), colourPairs: new Set() }
  for (const template of TEMPLATE_REGISTRY) {
    if (template.workspace !== 'freeform' || !template.createFreeform) continue
    const document = template.createFreeform()
    const deck = template.kind === 'deck' ? FREEFORM_TEMPLATE_SLOTS[template.series as FreeformDeckSeriesId] : undefined
    const poster = template.kind === 'poster' ? FREEFORM_POSTER_SLOTS[template.series as FreeformPosterSeriesId] : undefined
    const pages: string[][] = deck
      ? [deck.cover, deck.section, deck.ending].map(slotSampleNames)
      : poster ? [posterSampleNames(poster, { labels: false })] : []
    document.slides.forEach((slide, index) => {
      const names = new Set(pages[index] ?? [])
      slide.nodes.forEach((node, order) => {
        if (node.type !== 'text') return
        if (names.has(node.name) && node.text.trim()) {
          const carriers = result.samples.get(node.text.trim()) ?? new Set<string>()
          carriers.add(node.name)
          result.samples.set(node.text.trim(), carriers)
        }
        else result.decoration.add(decorationKey(node))
        // Words that read off their own label or outline don't make their colours a pair to keep.
        if (node.effect?.type === 'background' || node.effect?.type === 'outline') return
        const colour = solidColor(node.textFill)
        if (!colour) return
        const centre = { x: node.x + node.width / 2, y: node.y + node.height / 2 }
        // What the words sit on: a shape or a filled drawing (a badge), else the page.
        const under = slide.nodes.slice(0, order).reverse().find((candidate) => (
          (candidate.type === 'shape' || (candidate.type === 'path' && candidate.fill.type !== 'transparent'))
          && (candidate.opacity ?? 1) >= OPAQUE
          && centre.x >= candidate.x && centre.x <= candidate.x + candidate.width
          && centre.y >= candidate.y && centre.y <= candidate.y + candidate.height
        ))
        const background = under?.type === 'shape' || under?.type === 'path' ? solidColor(under.fill) : solidColor(slide.background)
        if (background) result.colourPairs.add(colourKey(colour, background))
      })
    })
  }
  marks = result
  return result
}

function intersection(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 0 && height > 0 ? width * height : 0
}

function hexChannels(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, '')
  const full = hex.length === 3 || hex.length === 4
    ? hex.slice(0, 3).split('').map((part) => part + part).join('')
    : hex.slice(0, 6)
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16)) as [number, number, number]
}

function luminance([red, green, blue]: [number, number, number]): number {
  const channel = (value: number) => {
    const scaled = value / 255
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
}

export function contrastRatio(first: string, second: string): number | null {
  const a = hexChannels(first)
  const b = hexChannels(second)
  if (!a || !b) return null
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

const solidColor = (paint: unknown): string | null => (
  typeof paint === 'object' && paint !== null && (paint as { type?: unknown }).type === 'solid'
    ? String((paint as { color?: unknown }).color ?? '')
    : null
)

function short(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 16 ? `${flat.slice(0, 16)}…` : flat
}

/** Whether a node hides what lies under its box: opaque shapes, and paths with a fill. */
function coversBelow(node: FreeformSceneNode): boolean {
  // Multiplied (a highlighter stroke) or darkened, dark words show through.
  if (node.type !== 'group' && (node.blendMode === 'multiply' || node.blendMode === 'darken')) return false
  if (node.type === 'shape') return node.fill.type !== 'transparent'
  if (node.type === 'path') return node.fill.type !== 'transparent'
  return node.type === 'image'
}

const viewBoxNumber = (value: number) => Math.round(value * 100) / 100

/** Whether a page point falls on what a path paints, by its paint mask over its (upright) box. */
function paintsAt(mask: string, rect: Rect, x: number, y: number): boolean {
  const grid = Math.round(Math.sqrt(mask.length))
  if (grid === 0 || x < rect.x || y < rect.y || x >= rect.x + rect.width || y >= rect.y + rect.height) return false
  const column = Math.min(grid - 1, Math.floor(((x - rect.x) / rect.width) * grid))
  const row = Math.min(grid - 1, Math.floor(((y - rect.y) / rect.height) * grid))
  return mask[row * grid + column] === '1'
}

/** The share of a text's lines a path paints over: a ring round a word paints little of it, a blob all of it. */
function paintedShare(mask: string, rect: Rect, area: Rect): number {
  const across = 8
  const down = 4
  let painted = 0
  for (let column = 0; column < across; column += 1) {
    for (let row = 0; row < down; row += 1) {
      if (paintsAt(mask, rect, area.x + ((column + 0.5) * area.width) / across, area.y + ((row + 0.5) * area.height) / down)) painted += 1
    }
  }
  return painted / (across * down)
}

export function layoutIssues(document: FreeformDocument, inspected: readonly InspectedSlide[]): LayoutIssue[] {
  const template = templateMarks()
  const knownSamples = template.samples
  const issues: LayoutIssue[] = []
  document.slides.forEach((slide, index) => {
    const page = index + 1
    const measured = inspected.find((entry) => entry.slideId === slide.id)
    const nodes = new Map<string, { node: FreeformSceneNode; path: ScenePath }>()
    walkScene(slide.nodes, (node, path) => { nodes.set(node.id, { node, path: [...path] }) })
    // A path's paint mask stands for it only while nothing turns it (its box is then its rect on the page).
    const masks = new Map<string, string>()
    for (const drawn of measured?.paths ?? []) {
      const entry = nodes.get(drawn.nodeId)
      const turned = entry?.path.some((id) => (nodes.get(id)?.node.rotation ?? 0) % 360 !== 0)
      if (drawn.mask && entry && !turned) masks.set(drawn.nodeId, drawn.mask)
    }
    const issue = (kind: LayoutIssueKind, nodeId: string | null, message: string, extra: Partial<LayoutIssue> = {}) => {
      const entry = nodeId ? nodes.get(nodeId) : undefined
      issues.push({
        page,
        slideId: slide.id,
        kind,
        nodeId,
        node: entry?.node.name ?? null,
        path: entry?.path ?? null,
        message,
        ...extra,
      })
    }

    for (const { node } of nodes.values()) {
      if (node.type === 'path' && !node.hidden && node.fill.type === 'transparent' && node.strokeWidth === 0) {
        issue('empty-path', node.id, '图形既没有填充也没有描边，看不见：给 fill 一个颜色，或把 strokeWidth 设成大于 0。')
      }
      if (node.type !== 'text' || node.hidden) continue
      // Highlighted words sit on their own colour, whatever is behind the text.
      const large = node.fontSize >= 48 || (node.fontWeight === 'bold' && node.fontSize >= 40)
      for (const span of node.spans ?? []) {
        const words = span.color ?? solidColor(node.textFill)
        if (!span.highlight || !words) continue
        const ratio = contrastRatio(words, span.highlight)
        if (ratio !== null && ratio < (large ? 3 : 4.5)) {
          issue('low-contrast', node.id, `高亮的「${short(node.text.slice(span.start, span.end))}」字色和高亮色太接近（对比度 ${ratio.toFixed(1)}:1），看不清：换一个和字色反差大的高亮色，或改这几个字的颜色。`)
          break
        }
      }
      if (!node.text.trim()) issue('empty-text', node.id, '文字是空的：填上内容或删掉这个文本框。')
      else if (knownSamples.get(node.text.trim())?.has(node.name)) {
        issue('sample-text', node.id, `还是模板里的示例文字「${short(node.text)}」：换成自己的内容或删掉。`)
      }
    }

    // Checks that read the document itself, no measurements needed.
    walkScene(slide.nodes, (node) => {
      if (node.type === 'qrcode') {
        if (Math.min(node.width, node.height) < QRCODE_MIN_SCAN) {
          issue('tiny-qrcode', node.id, `二维码只有 ${Math.round(node.width)}×${Math.round(node.height)}px，手机很难扫：至少 ${QRCODE_MIN_SCAN}×${QRCODE_MIN_SCAN}，或把导出倍率开到 2。`)
        }
        const contrast = contrastRatio(node.dark, node.light)
        if (contrast !== null && contrast < 3) {
          issue('low-contrast-qrcode', node.id, `码点色和背景色太接近（对比度 ${contrast.toFixed(1)}:1），扫码不稳：把 dark 和 light 拉开（如 #18181b 和 #ffffff）。`)
        }
      }
      if (node.type === 'progress' && node.label !== undefined) {
        const geometry = progressGeometry(node.width, node.height, node.progressKind, node.value, { label: true })
        if (geometry.label) {
          const labelWidth = emWidth(node.label) * geometry.label.fontSize
          if (labelWidth > node.width) {
            issue('progress-label-overflow', node.id, `标签「${node.label}」比元素宽（约 ${Math.round(labelWidth)}px > ${Math.round(node.width)}px）：缩短标签，或把元素加宽。`)
          }
        }
      }
    })

    // Design-quality checks, read off the document itself.
    type LeafNode = Exclude<FreeformSceneNode, { type: 'group' }>
    const boxes: Array<{ node: LeafNode; index: number; box: { x: number; y: number; width: number; height: number } }> = []
    slide.nodes.forEach((node, index) => {
      if (node.type === 'group' || node.hidden) return
      if (Math.round(node.rotation) % 360 !== 0) return
      boxes.push({ node, index, box: { x: node.x, y: node.y, width: node.width, height: node.height } })
    })
    // Alignment targets are the substantial things a reader lines up; thin
    // rules and little ornaments hang off them on purpose.
    const alignmentTargets = boxes.filter(({ box }) => box.width >= 24 && box.height >= 24)
    // The texts the page is really made of: its own words, not template ornaments.
    const ownTexts = boxes
      .map((entry) => entry.node)
      .filter((node) => node.type === 'text' && node.text.trim() !== '' && !template.decoration.has(decorationKey(node)))
      .filter((node): node is Extract<FreeformSceneNode, { type: 'text' }> => node.type === 'text')

    // Near-but-not-touching edges look like a slip; a bleed (touching or
    // past the edge) is a choice, and so is a roomy margin.
    for (const { node, box } of boxes) {
      if (box.width * box.height > 0.4 * slide.width * slide.height) continue
      const distances: Array<[string, number]> = [
        ['左', box.x],
        ['上', box.y],
        ['右', slide.width - box.x - box.width],
        ['下', slide.height - box.y - box.height],
      ]
      for (const [edge, distance] of distances) {
        if (distance > 2 && distance < EDGE_NEAR) {
          issue('edge-margin', node.id, `「${node.name}」离${edge}页边只有 ${Math.round(distance)}px，不上不下看着像失手：要么贴边出血，要么留出 24px 以上的边距。`)
          break
        }
      }
    }

    // Body copy a phone can barely show.
    for (const node of ownTexts) {
      if (node.fontSize < TINY_TEXT) {
        issue('tiny-text', node.id, `「${short(node.text)}」只有 ${Math.round(node.fontSize)}px，手机上看不清：正文至少 ${TINY_TEXT}px，或把内容删短。`)
      }
    }

    // A palette the page can hold, and a heading that stands over its body.
    if (ownTexts.length > 0) {
      const fonts = new Set(ownTexts.map((node) => node.fontFamily))
      if (fonts.size > MAX_FONTS) {
        issue('too-many-fonts', null, `这一页用了 ${fonts.size} 种字体（${[...fonts].slice(0, 4).map(short).join('、')}${fonts.size > 4 ? '…' : ''}）：两种以内最好，标题一种、正文一种。`)
      }
      const colours = new Set<string>()
      for (const node of ownTexts) {
        const fill = node.textFill
        if (fill.type === 'solid') colours.add(fill.color.toLowerCase())
        else if (fill.type === 'radial-gradient') fill.stops.forEach((stop: { color: string }) => colours.add(stop.color.toLowerCase()))
        else if (fill.type === 'linear-gradient') {
          if ('stops' in fill) fill.stops.forEach((stop: { color: string }) => colours.add(stop.color.toLowerCase()))
          else {
            colours.add(fill.from.toLowerCase())
            colours.add(fill.to.toLowerCase())
          }
        }
      }
      if (colours.size > MAX_TEXT_COLORS) {
        issue('too-many-colors', null, `这一页的文字用了 ${colours.size} 种颜色：一页 3–4 种以内最好，其余用深浅变化。`)
      }
      if (ownTexts.length >= 3) {
        const sizes = ownTexts.map((node) => node.fontSize).sort((a, b) => b - a)
        const body = sizes.slice(1)
        const median = body[Math.floor(body.length / 2)]
        if (sizes[0] < HEADING_RATIO * median) {
          issue('weak-heading', null, `这一页最大的字只有 ${Math.round(sizes[0])}px，和正文（约 ${Math.round(median)}px）拉不开：标题放大到 1.4 倍以上，或正文缩小。`)
        }
      }
    }

    // Edges that almost line up: the slips a reader feels, snap-fixable.
    for (const axis of ['x', 'y'] as const) {
      const clusters: Array<Array<{ node: LeafNode; index: number; box: { x: number; y: number; width: number; height: number }; edge: number }>> = []
      const sorted = [...alignmentTargets]
        .map((entry) => ({ ...entry, edge: axis === 'x' ? entry.box.x : entry.box.y }))
        .sort((a, b) => a.edge - b.edge)
      for (const item of sorted) {
        const last = clusters[clusters.length - 1]
        if (last && item.edge - last[last.length - 1].edge <= SNAP_MAX) last.push(item)
        else clusters.push([item])
      }
      let reported = 0
      for (const cluster of clusters) {
        if (cluster.length < 2) continue
        const span = cluster[cluster.length - 1].edge - cluster[0].edge
        if (span < SNAP_MIN) continue
        if (reported >= ALIGNMENT_ISSUES_PER_PAGE) break
        // The biggest node leads; the rest snap to its edge. A little thing
        // hanging off a big one is usually an ornament doing it on purpose.
        const anchor = [...cluster].sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0]
        const anchorArea = anchor.box.width * anchor.box.height
        const templateNames = namesOfTemplateNodes()
        const clusterWith = cluster.filter((item) => item.node.id === anchor.node.id
          || (item.box.width * item.box.height >= ORNAMENT_AREA_RATIO * anchorArea
            && !(templateNames.has(item.node.name) && templateNames.has(anchor.node.name))))
        const spanWith = clusterWith.length >= 2
          ? clusterWith[clusterWith.length - 1].edge - clusterWith[0].edge
          : 0
        if (spanWith < SNAP_MIN) continue
        reported += 1
        const moves = clusterWith
          .filter((item) => item.node.id !== anchor.node.id && Math.abs(item.edge - anchor.edge) >= SNAP_MIN)
          .map((item) => ({
            path: [item.node.id] as ScenePath,
            nodeId: item.node.id,
            from: item.edge,
            to: anchor.edge,
          }))
        if (moves.length === 0) continue
        const away = moves.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))[0]
        const awayNode = cluster.find((item) => item.node.id === away.nodeId)!
        const word = axis === 'x' ? '左边' : '上边'
        issue('misalignment', anchor.node.id,
          `「${awayNode.node.name}」和「${anchor.node.name}」的${word}差 ${Math.round(Math.abs(away.to - away.from))}px：对齐到一起更整齐。`,
          { alignment: { axis, anchorId: anchor.node.id, moves } })
      }
    }

    if (!measured) return
    if (measured.imageError) issue('image-failed', null, `${measured.imageError}：检查图片地址是否能打开。`)

    for (const drawn of measured.paths ?? []) {
      const node = nodes.get(drawn.nodeId)?.node
      if (!node || node.type !== 'path') continue
      const { bounds } = drawn
      const overflow = Math.max(-bounds.x, -bounds.y, bounds.x + bounds.width - node.width, bounds.y + bounds.height - node.height)
      if (overflow <= Math.max(2, Math.max(node.width, node.height) * 0.05)) continue
      // The viewBox that would hold the drawing exactly, in the drawing's own coordinates.
      const sx = node.width / node.viewBox.width
      const sy = node.height / node.viewBox.height
      const fitted = {
        x: viewBoxNumber(node.viewBox.x + bounds.x / sx),
        y: viewBoxNumber(node.viewBox.y + bounds.y / sy),
        width: viewBoxNumber(Math.max(bounds.width / sx, 0.01)),
        height: viewBoxNumber(Math.max(bounds.height / sy, 0.01)),
      }
      issue('path-overflow', node.id, `图形画到了自己的框外（超出约 ${Math.round(overflow)}px）：viewBox 没有包住 d 用到的坐标。`
        + `把 viewBox 改成 { x: ${fitted.x}, y: ${fitted.y}, width: ${fitted.width}, height: ${fitted.height} } 正好包住图形，`
        + '再按需要调整节点盒的宽高比；或者改 d 让坐标落在原 viewBox 里。')
    }

    const order = measured.nodes.map((entry) => entry.nodeId)
    const rectOf = new Map(measured.nodes.map((entry) => [entry.nodeId, entry.rect]))
    const texts = measured.texts.filter((text) => nodes.get(text.nodeId)?.node.type === 'text')

    for (const text of texts) {
      const node = nodes.get(text.nodeId)!.node
      if (node.type !== 'text') continue
      // The template's own decoration, untouched: how it sits is the template's choice.
      if (template.decoration.has(decorationKey(node))) continue
      if (text.overflowY > 2 || text.overflowX > 2) {
        const amount = Math.round(Math.max(text.overflowY, text.overflowX))
        issue('text-overflow', node.id, text.fitFontSize
          ? `文字放不下，多出 ${amount}px 被裁掉了：字号改成 ${text.fitFontSize} 就能放下，或者删短一些。`
          : `文字放不下，多出 ${amount}px 被裁掉了：删短一些或把文本框加大。`,
        text.fitFontSize ? { fitFontSize: text.fitFontSize } : {})
      }
      const area = text.area
      if (!area) continue
      if (area.x < -2 || area.y < -2 || area.x + area.width > slide.width + 2 || area.y + area.height > slide.height + 2) {
        issue('off-page', node.id, '文字跑出了页面边缘：把它移回页面里。')
      }
    }

    for (const [firstIndex, first] of texts.entries()) {
      for (const second of texts.slice(firstIndex + 1)) {
        if (!first.area || !second.area) continue
        if (intersection(first.area, second.area) > 24) {
          const other = nodes.get(second.nodeId)!.node
          issue('text-overlap', first.nodeId, `和「${other.name}」的文字叠在一起了：挪开其中一个，或者删短。`)
        }
      }
    }

    for (const text of texts) {
      if (!text.area) continue
      const textAt = order.indexOf(text.nodeId)
      const textArea = text.area.width * text.area.height
      for (const above of order.slice(textAt + 1)) {
        const entry = nodes.get(above)
        if (!entry || entry.node.type === 'text' || entry.node.type === 'group') continue
        const node = entry.node
        if ((node.opacity ?? 1) < OPAQUE) continue
        if (!coversBelow(node)) continue
        const rect = rectOf.get(above)
        const mask = masks.get(above)
        const covered = rect && textArea > 0 && (mask
          ? paintedShare(mask, rect, text.area) > 0.3
          : intersection(rect, text.area) / textArea > 0.3)
        if (covered) {
          issue('covered-text', text.nodeId, `被上面的「${node.name}」挡住了：把文字移到它上层，或者挪开。`)
          break
        }
      }
    }

    for (const text of texts) {
      const node = nodes.get(text.nodeId)!.node
      if (node.type !== 'text' || !text.area || (node.opacity ?? 1) < OPAQUE) continue
      const color = solidColor(node.textFill)
      if (!color) continue
      const centre = { x: text.area.x + text.area.width / 2, y: text.area.y + text.area.height / 2 }
      const textAt = order.indexOf(text.nodeId)
      // A label effect puts the words on their own block of colour.
      let background: string | null | undefined = node.effect?.type === 'background' ? node.effect.color : undefined
      const onLabel = background !== undefined
      for (const below of onLabel ? [] : order.slice(0, textAt).reverse()) {
        const entry = nodes.get(below)
        if (!entry || entry.node.type === 'group' || entry.node.type === 'line' || entry.node.type === 'text') continue
        // An outline-only path leaves the colour under it showing.
        if (entry.node.type === 'path' && entry.node.fill.type === 'transparent') continue
        const rect = rectOf.get(below)
        if (!rect || centre.x < rect.x || centre.x > rect.x + rect.width || centre.y < rect.y || centre.y > rect.y + rect.height) continue
        // A drawing is behind the words only where it paints (not inside a ring round them).
        const mask = masks.get(below)
        if (mask && !paintsAt(mask, rect, centre.x, centre.y)) continue
        if ((entry.node.opacity ?? 1) < OPAQUE) continue
        background = entry.node.type === 'shape' || entry.node.type === 'path' ? solidColor(entry.node.fill) : null
        break
      }
      // Down to the page: its colour, or on a picture the picture's colour behind the words.
      const onPicture = background === undefined && slide.background.type === 'image'
      if (background === undefined) {
        background = onPicture
          ? measured.backdrops?.find((entry) => entry.nodeId === node.id)?.color ?? null
          : solidColor(slide.background)
      }
      if (!background || template.colourPairs.has(colourKey(color, background))) continue
      const ratio = contrastRatio(color, background)
      const large = node.fontSize >= 48 || (node.fontWeight === 'bold' && node.fontSize >= 40)
      const needed = large ? 3 : 4.5
      // An outline that stands off the words keeps them readable on any page.
      const outlined = node.effect?.type === 'outline' && (contrastRatio(color, node.effect.color) ?? 0) >= needed
      if (ratio !== null && ratio < needed && !outlined) {
        issue('low-contrast', node.id, onLabel
          ? `文字颜色和它的底色块太接近（对比度 ${ratio.toFixed(1)}:1），看不清：换一个和底色块反差大的颜色。`
          : onPicture
            ? `文字压在背景图上，和身后那块颜色太接近（对比度 ${ratio.toFixed(1)}:1），看不清：换一个和照片反差大的颜色，或在文字下面垫一块半透明色块。`
            : `文字颜色和底色太接近（对比度 ${ratio.toFixed(1)}:1），手机上看不清：换深一点或浅一点的颜色。`)
      }
    }
  })
  return issues
}
