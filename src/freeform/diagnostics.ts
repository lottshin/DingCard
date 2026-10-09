// Explains, in the reader's own words, why a document fails strict
// validation: which page, which node, which keys, and which version the
// document should have been. The normalizer itself stays a pure null-on-
// failure function; this module finds the answer by probing it with
// smaller documents — one page, one node, one child — until the failing
// piece is alone, then describing it with the same key sets the strict
// validator uses.

import { FREEFORM_DOCUMENT_VERSION } from './types'
import { describeNodeKeyProblem, normalizeFreeformDocument } from './sceneDocument'

type StrictVersion = Parameters<typeof describeNodeKeyProblem>[1]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `第 2 页（id cover）` — the id is only named when it is a usable string. */
function pageWhere(index: number, slide: unknown): string {
  const id = isRecord(slide) && typeof slide.id === 'string' ? `（id ${slide.id}）` : ''
  return `第 ${index + 1} 页${id}`
}

/** `第 2 页（id cover）的第 3 个节点「图表」` — the name only when readable. */
function nodeWhere(page: string, index: number, node: unknown): string {
  const name = isRecord(node) && typeof node.name === 'string' && node.name !== ''
    ? `「${node.name}」`
    : ''
  return `${page}的第 ${index + 1} 个节点${name}`
}

/** Does `node` alone pass at `version`, on an otherwise clean page? */
function nodePassesAt(node: unknown, version: number, width: number, height: number): boolean {
  return normalizeFreeformDocument({
    documentVersion: version,
    activeSlideId: 'probe-slide',
    slides: [{
      id: 'probe-slide',
      name: 'probe',
      width,
      height,
      background: { type: 'solid', color: '#ffffff' },
      nodes: [node],
    }],
  }) !== null
}

/** The smallest version from `from` that accepts `node`; null when none does. */
function smallestAcceptingVersion(node: unknown, from: number, width: number, height: number): number | null {
  for (let version = from; version <= FREEFORM_DOCUMENT_VERSION; version += 1) {
    if (nodePassesAt(node, version, width, height)) return version
  }
  return null
}

/**
 * Find the failing node inside `slide` and say what is wrong with it.
 * `page` carries the already-localized page position for the message.
 */
function diagnoseNode(page: string, slide: Record<string, unknown>, claimedVersion: number): string | null {
  const width = isFiniteNumber(slide.width) ? slide.width : 1080
  const height = isFiniteNumber(slide.height) ? slide.height : 1440
  const nodes = Array.isArray(slide.nodes) ? slide.nodes : []
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const where = nodeWhere(page, index, node)
    if (!isRecord(node)) return `${where}不是对象`
    if (nodePassesAt(node, claimedVersion, width, height)) continue
    // A group is only as valid as its children; try each one on its own.
    if (node.type === 'group' && Array.isArray(node.children)) {
      const children = node.children
      for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
        const child = children[childIndex]
        const childWhere = `${where}里的第 ${childIndex + 1} 个子节点`
        if (!isRecord(child)) return `${childWhere}不是对象`
        const alone = nodePassesAt({ ...node, children: [child] }, claimedVersion, width, height)
        if (alone) continue
        const childReason = diagnoseChild(child, childWhere, claimedVersion, width, height)
        if (childReason) return childReason
      }
    }
    const reason = diagnoseChild(node, where, claimedVersion, width, height)
    if (reason) return reason
  }
  return null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Describe one already-failing node: key problem, version gap, or bad value. */
function diagnoseChild(
  node: Record<string, unknown>,
  where: string,
  claimedVersion: number,
  width: number,
  height: number,
): string | null {
  const keyProblem = describeNodeKeyProblem(node, claimedVersion as StrictVersion)
  // A key gap that a higher version fills is worth the exact version.
  if (claimedVersion < FREEFORM_DOCUMENT_VERSION) {
    const accepting = smallestAcceptingVersion(node, claimedVersion + 1, width, height)
    if (accepting !== null) {
      return `${where}用了需要 v${accepting} 的字段，但这份文档写的是 v${claimedVersion}：把 documentVersion 改成 ${accepting}（或 ${FREEFORM_DOCUMENT_VERSION}）即可`
    }
  }
  if (keyProblem) return `${where}${keyProblem}`
  return `${where}的键与类型匹配，但某个字段的值不合法（检查数值范围、#RRGGBB 颜色、枚举值和文本长度）`
}

/**
 * Why `value` fails strict validation, in one readable Chinese sentence;
 * `null` when it is a valid document (the normalizer is the authority).
 */
export function diagnoseFreeformDocument(value: unknown): string | null {
  if (normalizeFreeformDocument(value)) return null
  if (!isRecord(value)) return '文档必须是 JSON 对象（{ documentVersion, slides, activeSlideId }）'
  const claimedVersion = value.documentVersion
  if (
    typeof claimedVersion !== 'number'
    || !Number.isInteger(claimedVersion)
    || claimedVersion < 1
    || claimedVersion > FREEFORM_DOCUMENT_VERSION
  ) {
    return `documentVersion 需要是 1–${FREEFORM_DOCUMENT_VERSION} 的整数，收到 ${JSON.stringify(claimedVersion) ?? '缺失'}`
  }
  if (!Array.isArray(value.slides) || value.slides.length === 0) {
    return `slides 必须是 1–500 页的非空数组，收到 ${Array.isArray(value.slides) ? '空数组' : JSON.stringify(value.slides)}`
  }
  if (typeof value.activeSlideId !== 'string') return 'activeSlideId 必须是字符串（当前页的 id）'

  for (let index = 0; index < value.slides.length; index += 1) {
    const slide = value.slides[index]
    const page = pageWhere(index, slide)
    if (!isRecord(slide)) return `${page}不是对象`
    const single = { documentVersion: claimedVersion, activeSlideId: slide.id, slides: [slide] }
    if (normalizeFreeformDocument(single)) continue
    if (isRecord(slide.background)) {
      const bare = { ...single, slides: [{ ...slide, background: { type: 'solid', color: '#ffffff' } }] }
      if (normalizeFreeformDocument(bare)) {
        return `${page}的 background 不合法（solid / linear-gradient / radial-gradient / transparent / image / pattern 之一，颜色写 #RRGGBB）`
      }
    }
    if ('guides' in slide) {
      const noGuides = { ...single, slides: [{ ...slide, guides: [] }] }
      if (normalizeFreeformDocument(noGuides)) {
        return `${page}的 guides 不合法（[{ id, axis: 'x'|'y', position }]，每页至多 64 条、id 不重复、位置在页面内）`
      }
    }
    if (!isFiniteNumber(slide.width) || !isFiniteNumber(slide.height)
      || slide.width < 128 || slide.width > 4096 || slide.height < 128 || slide.height > 4096) {
      return `${page}的 width / height 必须在 128–4096 px 之间`
    }
    const nodeProblem = diagnoseNode(page, slide, claimedVersion)
    if (nodeProblem) return nodeProblem
    return `${page}未通过校验（检查 id、name、nodes 和每页的节点 id 是否重复）`
  }
  if (!value.slides.some((slide) => isRecord(slide) && slide.id === value.activeSlideId)) {
    return `activeSlideId「${value.activeSlideId}」不在 slides 里`
  }
  const seen = new Set<string>()
  for (let index = 0; index < value.slides.length; index += 1) {
    const slide = value.slides[index]
    if (!isRecord(slide) || typeof slide.id !== 'string') continue
    if (seen.has(slide.id)) return `第 ${index + 1} 页的 id「${slide.id}」和前面的页重复`
    seen.add(slide.id)
  }
  return null
}
