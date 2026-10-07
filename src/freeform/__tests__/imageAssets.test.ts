import { describe, expect, it, vi } from 'vitest'

import {
  collectFreeformImageSources,
  materializeLocalFreeformImages,
  uploadInlineFreeformImages,
} from '../imageAssets'
import { normalizeFreeformDocument } from '../sceneDocument'
import type {
  FreeformDocument,
  FreeformElement,
  FreeformGroupNode,
  FreeformImageElement,
  FreeformSceneLeaf,
  FreeformSceneNode,
  FreeformShapeElement,
  FreeformSlide,
} from '../types'

function image(id: string, src: string): FreeformImageElement {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'image',
    x: 10,
    y: 20,
    width: 300,
    height: 200,
    rotation: 0,
    scale: 1,
    src,
    alt: id,
    fit: 'cover',
    framing: { focusX: 0.2, focusY: 0.75, zoom: 2.5 },
  }
}

function imageShape(id: string, src: string): FreeformShapeElement {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'shape',
    x: 30,
    y: 40,
    width: 240,
    height: 160,
    rotation: 0,
    scale: 1,
    shape: 'rect',
    fill: {
      type: 'image',
      src,
      fit: 'contain',
      framing: { focusX: 0.8, focusY: 0.3, zoom: 3.25 },
    },
    stroke: '#000000',
    strokeWidth: 0,
  }
}

function slide(id: string, nodes: FreeformElement[]): FreeformSlide {
  return {
    id,
    name: id,
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    nodes,
  }
}

function document(...slides: FreeformSlide[]): FreeformDocument {
  return { documentVersion: 32, activeSlideId: slides[0].id, slides }
}

function sceneImage(id: string, src: string): FreeformSceneLeaf {
  return {
    ...image(id, src),
    hidden: true,
  }
}

function sceneImageShape(id: string, src: string): FreeformSceneLeaf {
  return {
    ...imageShape(id, src),
    hidden: true,
  }
}

function sceneGroup(
  id: string,
  children: FreeformSceneNode[],
  hidden = false,
): FreeformGroupNode {
  return {
    id,
    name: id,
    locked: false,
    hidden,
    type: 'group',
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    children,
  }
}

function sceneDocument(nodes: FreeformSceneNode[]): FreeformDocument {
  return {
    documentVersion: 32,
    activeSlideId: 'page-1',
    slides: [{
      id: 'page-1',
      name: 'Page 1',
      width: 1080,
      height: 1440,
      background: { type: 'solid', color: '#ffffff' },
      nodes,
    }],
  }
}

describe('freeform image assets', () => {
  it('collects and deduplicates image element and shape fill sources', () => {
    const input = document(
      slide('page-1', [image('image-1', 'img:shared'), imageShape('shape-1', '/uploads/shape.png')]),
      slide('page-2', [image('image-2', 'img:shared'), imageShape('shape-2', 'https://cdn.example/fill.png')]),
    )

    expect(collectFreeformImageSources(input)).toEqual([
      'img:shared',
      '/uploads/shape.png',
      'https://cdn.example/fill.png',
    ])
  })

  it('collects, maps and materializes a QR code logo like any picture', () => {
    const logoLeaf: FreeformSceneLeaf = {
      ...image('qr-1', 'img:unused'),
      type: 'qrcode',
      id: 'qr-1',
      name: '二维码',
      locked: false,
      hidden: false,
      x: 0,
      y: 0,
      width: 240,
      height: 240,
      rotation: 0,
      scale: 1,
      payload: 'https://dingcard.app',
      dark: '#18181b',
      light: '#ffffff',
      logoSrc: 'img:logo',
    } as unknown as FreeformSceneLeaf
    const input = document(slide('page-1', [logoLeaf]))

    expect(collectFreeformImageSources(input)).toEqual(['img:logo'])

    const output = materializeLocalFreeformImages(input, {
      isRef: (src) => src.startsWith('img:'),
      resolve: (src) => (src === 'img:logo' ? 'data:image/svg+xml;base64,bG9nbw' : ''),
    })
    const outputQr = output.slides[0].nodes[0]
    if (outputQr.type !== 'qrcode') throw new Error('Expected a qrcode leaf')
    expect(outputQr.logoSrc).toBe('data:image/svg+xml;base64,bG9nbw')
    expect((input.slides[0].nodes[0] as { logoSrc?: string }).logoSrc).toBe('img:logo')
  })

  it('materializes local img refs in a clone without mutating the source document', () => {
    const input = document(
      slide('page-1', [image('image-1', 'img:photo'), imageShape('shape-1', 'img:fill')]),
      slide('page-2', [image('image-2', 'img:photo')]),
    )
    const snapshot = structuredClone(input)
    const resolved = new Map([
      ['img:photo', 'data:image/png;base64,photo'],
      ['img:fill', 'data:image/webp;base64,fill'],
    ])

    const output = materializeLocalFreeformImages(input, {
      isRef: (src) => src.startsWith('img:'),
      resolve: (src) => resolved.get(src) ?? '',
    })

    expect(output).not.toBe(input)
    expect(output.slides[0]).not.toBe(input.slides[0])
    expect(output.slides[0].nodes[0]).not.toBe(input.slides[0].nodes[0])
    expect(output.slides[0].nodes[1]).not.toBe(input.slides[0].nodes[1])
    const outputShape = output.slides[0].nodes[1]
    const inputShape = input.slides[0].nodes[1]
    const outputImage = output.slides[0].nodes[0]
    const inputImage = input.slides[0].nodes[0]
    if (
      outputImage.type !== 'image'
      || inputImage.type !== 'image'
      || outputShape.type !== 'shape'
      || inputShape.type !== 'shape'
      || outputShape.fill.type !== 'image'
      || inputShape.fill.type !== 'image'
    ) throw new Error('Expected image-bearing leaves')
    expect(outputImage.framing).toEqual({ focusX: 0.2, focusY: 0.75, zoom: 2.5 })
    expect(outputImage.framing).not.toBe(inputImage.framing)
    expect(outputShape.fill).not.toBe(inputShape.fill)
    expect(outputShape.fill.framing).toEqual({ focusX: 0.8, focusY: 0.3, zoom: 3.25 })
    expect(outputShape.fill.framing).not.toBe(inputShape.fill.framing)
    expect(collectFreeformImageSources(output)).toEqual([
      'data:image/png;base64,photo',
      'data:image/webp;base64,fill',
    ])
    expect(input).toEqual(snapshot)
  })

  it('leaves data, relative, absolute and external URLs unchanged', () => {
    const sources = [
      'data:image/png;base64,inline',
      '/uploads/relative.png',
      'https://app.example/uploads/absolute.png',
      'https://cdn.example/external.png',
    ]
    const input = document(
      slide('page-1', sources.map((src, index) => image(`image-${index}`, src))),
    )
    const resolve = vi.fn<(src: string) => string>()

    const output = materializeLocalFreeformImages(input, {
      isRef: (src) => src.startsWith('img:'),
      resolve,
    })

    expect(collectFreeformImageSources(output)).toEqual(sources)
    expect(resolve).not.toHaveBeenCalled()
    expect(output).not.toBe(input)
  })

  it('throws a stable error when any local img ref cannot resolve', () => {
    const input = document(slide('page-1', [image('image-1', 'img:missing')]))

    expect(() => materializeLocalFreeformImages(input, {
      isRef: (src) => src.startsWith('img:'),
      resolve: () => '',
    })).toThrow('本地图片引用无法解析：img:missing')
  })

  it('uploads duplicate inline data URLs once per remote preparation without mutating input', async () => {
    const inline = 'data:image/png;base64,same'
    const input = document(
      slide('page-1', [image('image-1', inline), imageShape('shape-1', inline)]),
      slide('page-2', [image('image-2', inline), image('relative', '/uploads/already.png')]),
    )
    const snapshot = structuredClone(input)
    const upload = vi.fn(async () => '/uploads/uploaded.png')

    const output = await uploadInlineFreeformImages(input, upload)

    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledWith(inline)
    expect(collectFreeformImageSources(output)).toEqual([
      '/uploads/uploaded.png',
      '/uploads/already.png',
    ])
    const outputImage = output.slides[0].nodes[0]
    const inputImage = input.slides[0].nodes[0]
    const outputShape = output.slides[0].nodes[1]
    const inputShape = input.slides[0].nodes[1]
    if (
      outputImage.type !== 'image'
      || inputImage.type !== 'image'
      || outputShape.type !== 'shape'
      || inputShape.type !== 'shape'
      || outputShape.fill.type !== 'image'
      || inputShape.fill.type !== 'image'
    ) throw new Error('Expected image-bearing leaves')
    expect(outputImage.framing).toEqual(inputImage.framing)
    expect(outputImage.framing).not.toBe(inputImage.framing)
    expect(outputShape.fill.framing).toEqual(inputShape.fill.framing)
    expect(outputShape.fill.framing).not.toBe(inputShape.fill.framing)
    expect(input).toEqual(snapshot)
  })

  it('leaves non-image data, relative, absolute and external URLs unchanged during upload preparation', async () => {
    const sources = [
      'data:text/plain;base64,dGV4dA==',
      '/uploads/relative.png',
      'https://app.example/uploads/absolute.png',
      'https://cdn.example/external.png',
    ]
    const input = document(
      slide('page-1', sources.map((src, index) => image(`image-${index}`, src))),
    )
    const upload = vi.fn<(dataUrl: string) => Promise<string>>()

    const output = await uploadInlineFreeformImages(input, upload)

    expect(collectFreeformImageSources(output)).toEqual(sources)
    expect(upload).not.toHaveBeenCalled()
  })

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['undefined', undefined],
  ])('rejects an %s upload result with a stable error', async (_label, uploadedUrl) => {
    const input = document(slide('page-1', [
      image('image-1', 'data:image/png;base64,invalid-result'),
    ]))
    const upload = vi.fn(async () => uploadedUrl as unknown as string)

    await expect(uploadInlineFreeformImages(input, upload)).rejects.toThrow(
      '图片上传未返回有效地址',
    )
    expect(collectFreeformImageSources(input)).toEqual([
      'data:image/png;base64,invalid-result',
    ])
  })

  it('rejects img refs during remote preparation with a stable error', async () => {
    const input = document(slide('page-1', [
      image('image-1', 'data:image/png;base64,would-upload'),
      imageShape('shape-1', 'img:local-only'),
    ]))
    const upload = vi.fn<(dataUrl: string) => Promise<string>>()

    await expect(uploadInlineFreeformImages(input, upload)).rejects.toThrow(
      '远程保存不支持本地图片引用：img:local-only',
    )
    expect(upload).not.toHaveBeenCalled()
  })

  it('collects and materializes hidden image sources recursively without mutating the source', () => {
    const input = sceneDocument([
      sceneGroup('outer', [
        sceneImage('photo', 'img:photo'),
        sceneGroup('inner', [sceneImageShape('texture', 'img:texture')], true),
      ], true),
    ])
    const snapshot = structuredClone(input)
    const resolved = new Map([
      ['img:photo', 'data:image/png;base64,photo'],
      ['img:texture', 'data:image/webp;base64,texture'],
    ])

    expect(collectFreeformImageSources(input)).toEqual(['img:photo', 'img:texture'])

    const output = materializeLocalFreeformImages(input, {
      isRef: (src) => src.startsWith('img:'),
      resolve: (src) => resolved.get(src) ?? '',
    })

    expect(collectFreeformImageSources(output)).toEqual([
      'data:image/png;base64,photo',
      'data:image/webp;base64,texture',
    ])
    expect(output).not.toBe(input)
    expect(output.slides[0]).not.toBe(input.slides[0])
    expect(output.slides[0].nodes[0]).not.toBe(input.slides[0].nodes[0])
    expect(normalizeFreeformDocument(output)).toEqual(output)
    expect(input).toEqual(snapshot)
  })

  it('throws the stable materialization error for an unresolved nested ref without mutating the source', () => {
    const input = sceneDocument([
      sceneGroup('outer', [
        sceneGroup('inner', [sceneImageShape('missing', 'img:missing')], true),
      ], true),
    ])
    const snapshot = structuredClone(input)

    expect(() => materializeLocalFreeformImages(input, {
      isRef: (src) => src.startsWith('img:'),
      resolve: () => '',
    })).toThrow('本地图片引用无法解析：img:missing')
    expect(input).toEqual(snapshot)
  })

  it('uploads duplicate inline sources once and returns a strict-readable owned document', async () => {
    const inline = 'data:image/png;base64,shared'
    const input = sceneDocument([
      sceneGroup('outer', [
        sceneImage('photo', inline),
        sceneGroup('inner', [sceneImageShape('texture', inline)], true),
      ], true),
    ])
    const snapshot = structuredClone(input)
    const upload = vi.fn(async () => '/uploads/shared.png')

    const output = await uploadInlineFreeformImages(input, upload)

    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledWith(inline)
    expect(collectFreeformImageSources(output)).toEqual(['/uploads/shared.png'])
    expect(normalizeFreeformDocument(output)).toEqual(output)
    expect(input).toEqual(snapshot)
  })

  it('recursively preflights img refs before starting any inline upload', async () => {
    const input = sceneDocument([
      sceneGroup('outer', [
        sceneImage('inline', 'data:image/png;base64,would-upload'),
        sceneGroup('inner', [sceneImageShape('local', 'img:local-only')], true),
      ], true),
    ])
    const upload = vi.fn<(dataUrl: string) => Promise<string>>()

    await expect(uploadInlineFreeformImages(input, upload)).rejects.toThrow(
      '远程保存不支持本地图片引用：img:local-only',
    )
    expect(upload).not.toHaveBeenCalled()
  })

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
  ])('rejects an %s upload result without mutating the source', async (_label, result) => {
    const input = sceneDocument([
      sceneGroup('outer', [sceneImage('photo', 'data:image/png;base64,invalid')], true),
    ])
    const snapshot = structuredClone(input)

    await expect(
      uploadInlineFreeformImages(input, async () => result),
    ).rejects.toThrow('图片上传未返回有效地址')
    expect(input).toEqual(snapshot)
  })

  it('leaves non-image data and URL sources unchanged without calling upload', async () => {
    const sources = [
      'data:text/plain;base64,dGV4dA==',
      '/uploads/relative.png',
      'https://app.example/uploads/absolute.png',
      'https://cdn.example/external.png',
    ]
    const input = sceneDocument([
      sceneGroup('outer', sources.map((source, index) => sceneImage(`image-${index}`, source)), true),
    ])
    const snapshot = structuredClone(input)
    const upload = vi.fn<(dataUrl: string) => Promise<string>>()

    const output = await uploadInlineFreeformImages(input, upload)

    expect(collectFreeformImageSources(output)).toEqual(sources)
    expect(upload).not.toHaveBeenCalled()
    expect(normalizeFreeformDocument(output)).toEqual(output)
    expect(input).toEqual(snapshot)
  })

  it('rejects a failed recursive upload without exposing a partial document or mutating the source', async () => {
    const first = 'data:image/png;base64,first'
    const failing = 'data:image/png;base64,failing'
    const input = sceneDocument([
      sceneGroup('outer', [
        sceneImage('photo', first),
        sceneGroup('inner', [sceneImageShape('texture', failing)], true),
      ], true),
    ])
    const snapshot = structuredClone(input)
    let exposed: FreeformDocument | undefined
    const upload = vi.fn(async (source: string) => {
      if (source === failing) throw new Error('upload failed')
      return '/uploads/first.png'
    })

    await expect(
      uploadInlineFreeformImages(input, upload).then((output) => {
        exposed = output
        return output
      }),
    ).rejects.toThrow('upload failed')

    expect(exposed).toBeUndefined()
    expect(input).toEqual(snapshot)
    expect(collectFreeformImageSources(input)).toEqual([first, failing])
  })
})

describe('page background pictures', () => {
  const framing = { focusX: 0.5, focusY: 0.5, zoom: 1 }
  const withBackground = (src: string, nodes: FreeformElement[] = []): FreeformSlide => ({
    ...slide('page-bg', nodes),
    background: { type: 'image', src, fit: 'cover', framing },
  })

  it('collects background pictures with the rest', () => {
    const input = document(withBackground('img:paper', [image('image-1', 'img:paper')]), slide('page-2', [image('image-2', '/uploads/b.png')]))
    expect(collectFreeformImageSources(input)).toEqual(['img:paper', '/uploads/b.png'])
  })

  it('materializes local background refs', () => {
    const input = document(withBackground('img:paper'))
    const output = materializeLocalFreeformImages(input, {
      isRef: (src) => src.startsWith('img:'),
      resolve: () => 'data:image/png;base64,AAAA',
    })
    expect(output.slides[0].background).toEqual({ type: 'image', src: 'data:image/png;base64,AAAA', fit: 'cover', framing })
    expect(input.slides[0].background).toMatchObject({ src: 'img:paper' })
    expect(() => materializeLocalFreeformImages(input, { isRef: () => true, resolve: () => '' })).toThrow('img:paper')
  })

  it('uploads an inline background once, even when a node uses the same picture', async () => {
    const inline = 'data:image/png;base64,BBBB'
    const upload = vi.fn(async () => '/uploads/paper.png')
    const output = await uploadInlineFreeformImages(document(withBackground(inline, [image('image-1', inline)])), upload)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(output.slides[0].background).toMatchObject({ src: '/uploads/paper.png' })
    expect(output.slides[0].nodes[0]).toMatchObject({ src: '/uploads/paper.png' })
    expect(normalizeFreeformDocument(output)).toEqual(output)
  })
})
