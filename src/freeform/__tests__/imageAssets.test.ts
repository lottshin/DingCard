import { describe, expect, it, vi } from 'vitest'

import {
  collectFreeformImageSources,
  materializeLocalFreeformImages,
  uploadInlineFreeformImages,
} from '../imageAssets'
import type {
  FreeformDocument,
  FreeformElement,
  FreeformImageElement,
  FreeformShapeElement,
  FreeformSlide,
} from '../types'

function image(id: string, src: string): FreeformImageElement {
  return {
    id,
    type: 'image',
    x: 10,
    y: 20,
    width: 300,
    height: 200,
    rotation: 0,
    src,
    alt: id,
    fit: 'cover',
  }
}

function imageShape(id: string, src: string): FreeformShapeElement {
  return {
    id,
    type: 'shape',
    x: 30,
    y: 40,
    width: 240,
    height: 160,
    rotation: 0,
    shape: 'rect',
    fill: { type: 'image', src, fit: 'contain' },
    stroke: '#000000',
    strokeWidth: 0,
  }
}

function slide(id: string, elements: FreeformElement[]): FreeformSlide {
  return {
    id,
    name: id,
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    elements,
  }
}

function document(...slides: FreeformSlide[]): FreeformDocument {
  return { documentVersion: 2, activeSlideId: slides[0].id, slides }
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
    expect(output.slides[0].elements[0]).not.toBe(input.slides[0].elements[0])
    expect(output.slides[0].elements[1]).not.toBe(input.slides[0].elements[1])
    const outputShape = output.slides[0].elements[1]
    const inputShape = input.slides[0].elements[1]
    if (outputShape.type !== 'shape' || inputShape.type !== 'shape') throw new Error('Expected shapes')
    expect(outputShape.fill).not.toBe(inputShape.fill)
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
})
