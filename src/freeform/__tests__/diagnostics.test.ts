import { describe, expect, it } from 'vitest'

import { diagnoseFreeformDocument } from '../diagnostics'
import { createFreeformDocument } from '../document'
import { normalizeFreeformDocument } from '../sceneDocument'
import { FREEFORM_DOCUMENT_VERSION, type FreeformSceneNode, type FreeformSlide } from '../types'

const slide: FreeformSlide = {
  id: 'slide-1',
  name: '第 1 页',
  width: 1080,
  height: 1440,
  background: { type: 'solid', color: '#ffffff' },
  nodes: [],
}

function documentWith(nodes: unknown[], version = FREEFORM_DOCUMENT_VERSION) {
  return { documentVersion: version, activeSlideId: slide.id, slides: [{ ...slide, nodes }] }
}

describe('freeform document diagnostics', () => {
  it('stays quiet for a valid document and hands odd shapes to the normalizer', () => {
    expect(diagnoseFreeformDocument(createFreeformDocument())).toBeNull()
    expect(diagnoseFreeformDocument(normalizeFreeformDocument(documentWith([])))).toBeNull()
    expect(diagnoseFreeformDocument(null)).toContain('JSON 对象')
    expect(diagnoseFreeformDocument('nope')).toContain('JSON 对象')
    expect(diagnoseFreeformDocument({})).toContain('documentVersion')
    expect(diagnoseFreeformDocument({ documentVersion: 0, slides: [slide], activeSlideId: slide.id })).toContain('documentVersion 需要')
    expect(diagnoseFreeformDocument({ documentVersion: FREEFORM_DOCUMENT_VERSION + 1, slides: [slide], activeSlideId: slide.id })).toContain('documentVersion 需要')
    expect(diagnoseFreeformDocument({ documentVersion: FREEFORM_DOCUMENT_VERSION, slides: [], activeSlideId: 'x' })).toContain('slides')
    expect(diagnoseFreeformDocument({ documentVersion: FREEFORM_DOCUMENT_VERSION, slides: [slide], activeSlideId: 7 })).toContain('activeSlideId')
  })

  it('names the page and the exact key gap of a node', () => {
    const progress = {
      id: 'progress-1',
      name: '进度',
      locked: false,
      hidden: false,
      type: 'progress',
      x: 100,
      y: 100,
      width: 480,
      height: 96,
      rotation: 0,
      scale: 1,
      progressKind: 'bar',
    }
    const missing = diagnoseFreeformDocument(documentWith([progress]))
    expect(missing).toContain('第 1 页')
    expect(missing).toContain('「进度」')
    expect(missing).toContain('缺少必需的键：value')

    const unknown = diagnoseFreeformDocument(documentWith([{ ...progress, type: 'widget', value: 65 }]))
    expect(unknown).toContain('「widget」')
    expect(unknown).toContain('不是已知的')

    const extra = diagnoseFreeformDocument(documentWith([{ ...progress, value: 65, flavour: 'sweet' }]))
    expect(extra).toContain('多了 v41 的 progress 不接受的键：flavour')

    const noType = diagnoseFreeformDocument(documentWith([{ ...progress, type: undefined, value: 65 }]))
    expect(noType).toContain('没有 type 字段')
  })

  it('names the exact version a node needs', () => {
    const element = {
      id: 'progress-1',
      name: '进度',
      locked: false,
      hidden: false,
      type: 'progress',
      x: 100,
      y: 100,
      width: 480,
      height: 96,
      rotation: 0,
      scale: 1,
      progressKind: 'bar',
      value: 65,
      label: '读书进度',
    }
    // The same node is fine on a v39 document but the label rejects at v38 —
    // the diagnosis says which version to write instead.
    expect(normalizeFreeformDocument(documentWith([element], 39))).not.toBeNull()
    const reason = diagnoseFreeformDocument(documentWith([element], 38))
    expect(reason).toContain('需要 v39 的字段')
    expect(reason).toContain('写的是 v38')
  })

  it('reports bad field values and page-level problems in place', () => {
    const badHex = {
      id: 'progress-1',
      name: '进度',
      locked: false,
      hidden: false,
      type: 'progress',
      x: 0,
      y: 0,
      width: 480,
      height: 96,
      rotation: 0,
      scale: 1,
      progressKind: 'bar',
      value: 65,
      accent: 'blue',
    }
    expect(diagnoseFreeformDocument(documentWith([badHex]))).toContain('某个字段的值不合法')

    const badBackground = { documentVersion: FREEFORM_DOCUMENT_VERSION, activeSlideId: slide.id, slides: [{ ...slide, background: { type: 'solid', color: 'cream' } }] }
    expect(diagnoseFreeformDocument(badBackground)).toContain('background 不合法')

    const badGuides = { documentVersion: FREEFORM_DOCUMENT_VERSION, activeSlideId: slide.id, slides: [{ ...slide, guides: [{ id: 'g1', axis: 'z', position: 4 }] }] }
    expect(diagnoseFreeformDocument(badGuides)).toContain('guides 不合法')

    const badSize = { documentVersion: FREEFORM_DOCUMENT_VERSION, activeSlideId: slide.id, slides: [{ ...slide, width: 50 }] }
    expect(diagnoseFreeformDocument(badSize)).toContain('width / height')

    const strayActive = { documentVersion: FREEFORM_DOCUMENT_VERSION, activeSlideId: 'nowhere', slides: [slide] }
    expect(diagnoseFreeformDocument(strayActive)).toContain('不在 slides 里')

    const duplicatePage = { documentVersion: FREEFORM_DOCUMENT_VERSION, activeSlideId: slide.id, slides: [slide, { ...slide }] }
    expect(diagnoseFreeformDocument(duplicatePage)).toContain('重复')
  })

  it('looks inside groups for the failing child', () => {
    const text = {
      id: 'text-1',
      name: '正文',
      locked: false,
      hidden: false,
      type: 'text',
      x: 0,
      y: 0,
      width: 400,
      height: 80,
      rotation: 0,
      scale: 1,
      text: '你好',
      fontSize: 28,
      fontFamily: 'system',
      textFill: { type: 'solid', color: '#18181b' },
      align: 'left',
      fontWeight: 'normal',
    } as unknown as FreeformSceneNode
    const broken = { ...text, id: 'text-2', fontSize: 'big' } as unknown
    const group = {
      id: 'group-1',
      name: '组',
      locked: false,
      hidden: false,
      type: 'group',
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      children: [text, broken],
    }
    const reason = diagnoseFreeformDocument(documentWith([group]))
    expect(reason).toContain('「组」')
    expect(reason).toContain('第 2 个子节点')
    expect(reason).toContain('某个字段的值不合法')
  })
})
