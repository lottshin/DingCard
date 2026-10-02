// What check_document reports: problems a reader would notice on a rendered
// card, worked out from the document and the render page's measurements of
// it. Each issue names the page and node and says, in plain words, what to do.

import { walkScene } from '../../../src/freeform/sceneTree'
import type { FreeformDocument, FreeformSceneNode, ScenePath } from '../../../src/freeform/types'
import { TEMPLATE_REGISTRY } from '../../../src/templates/registry'
import { FREEFORM_TEMPLATE_SLOTS, slotSampleNames } from '../../../src/templates/slots'
import type { FreeformTemplateSeriesId } from '../../../src/templates/types'
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
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Shapes at least this opaque hide what lies under them. */
const OPAQUE = 0.7

interface TemplateMarks {
  /** Sample text in a slot: copy that must not reach a finished deck. */
  samples: Set<string>
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
  const result: TemplateMarks = { samples: new Set(), decoration: new Set(), colourPairs: new Set() }
  for (const template of TEMPLATE_REGISTRY) {
    if (template.workspace !== 'freeform' || !template.createFreeform) continue
    const slots = FREEFORM_TEMPLATE_SLOTS[template.series as FreeformTemplateSeriesId]
    const document = template.createFreeform()
    const roles = slots ? [slots.cover, slots.section, slots.ending] : []
    document.slides.forEach((slide, index) => {
      const names = new Set(roles[index] ? slotSampleNames(roles[index]) : [])
      slide.nodes.forEach((node, order) => {
        if (node.type !== 'text') return
        if (names.has(node.name) && node.text.trim()) result.samples.add(node.text.trim())
        else result.decoration.add(decorationKey(node))
        // Words that read off their own label or outline don't make their colours a pair to keep.
        if (node.effect?.type === 'background' || node.effect?.type === 'outline') return
        const colour = solidColor(node.textFill)
        if (!colour) return
        const centre = { x: node.x + node.width / 2, y: node.y + node.height / 2 }
        const under = slide.nodes.slice(0, order).reverse().find((candidate) => (
          candidate.type === 'shape' && (candidate.opacity ?? 1) >= OPAQUE
          && centre.x >= candidate.x && centre.x <= candidate.x + candidate.width
          && centre.y >= candidate.y && centre.y <= candidate.y + candidate.height
        ))
        const background = under?.type === 'shape' ? solidColor(under.fill) : solidColor(slide.background)
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
  if (node.type === 'shape') return node.fill.type !== 'transparent'
  if (node.type === 'path') return node.fill.type !== 'transparent'
  return node.type === 'image'
}

const viewBoxNumber = (value: number) => Math.round(value * 100) / 100

export function layoutIssues(document: FreeformDocument, inspected: readonly InspectedSlide[]): LayoutIssue[] {
  const template = templateMarks()
  const knownSamples = template.samples
  const issues: LayoutIssue[] = []
  document.slides.forEach((slide, index) => {
    const page = index + 1
    const measured = inspected.find((entry) => entry.slideId === slide.id)
    const nodes = new Map<string, { node: FreeformSceneNode; path: ScenePath }>()
    walkScene(slide.nodes, (node, path) => { nodes.set(node.id, { node, path: [...path] }) })
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
      else if (knownSamples.has(node.text.trim())) {
        issue('sample-text', node.id, `还是模板里的示例文字「${short(node.text)}」：换成自己的内容或删掉。`)
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
        if (rect && textArea > 0 && intersection(rect, text.area) / textArea > 0.3) {
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
