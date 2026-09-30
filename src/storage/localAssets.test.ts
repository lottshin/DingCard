import { describe, expect, it } from 'vitest'

import { createLocalAssetStore, createMemoryAssetBackend } from './localAssets'

const PNG = 'data:image/png;base64,aGlzdG9yaWNhbA=='

function createStore() {
  let clock = 100
  return createLocalAssetStore(createMemoryAssetBackend(), () => ++clock)
}

describe('local asset store', () => {
  it('keeps each user\'s assets apart and lists them newest first', async () => {
    const store = createStore()
    const first = await store.add('user-1', { dataUrl: PNG, name: ' 雨夜 街道 ', width: 1200, height: 800 })
    const second = await store.add('user-1', { dataUrl: PNG, name: '山湖', width: 800, height: 1200 })
    await store.add('user-2', { dataUrl: PNG, name: '别人的', width: 10, height: 10 })

    expect(first).toMatchObject({ name: '雨夜 街道', src: PNG, width: 1200, height: 800, bytes: 10 })
    expect(first).not.toHaveProperty('userId')
    expect((await store.list('user-1')).map((asset) => asset.id)).toEqual([second.id, first.id])
    expect(await store.list('user-3')).toEqual([])
  })

  it('rejects formats and sizes the server would also reject', async () => {
    const store = createStore()
    await expect(store.add('user-1', { dataUrl: 'data:image/gif;base64,R0lG', name: 'gif', width: 1, height: 1 }))
      .rejects.toThrow('仅支持 PNG、JPG、WebP 图片')
    await expect(store.add('user-1', { dataUrl: 'https://example.com/a.png', name: 'url', width: 1, height: 1 }))
      .rejects.toThrow('仅支持 PNG、JPG、WebP 图片')
    await expect(store.add('user-1', { dataUrl: PNG, name: 'zero', width: 0, height: 10 }))
      .rejects.toThrow('图片尺寸无效')
    expect(await store.list('user-1')).toEqual([])
  })

  it('renames only the owner\'s asset and keeps the old name for a blank one', async () => {
    const store = createStore()
    const asset = await store.add('user-1', { dataUrl: PNG, name: '封面', width: 10, height: 10 })

    expect(await store.rename('user-1', asset.id, '  新封面 ')).toMatchObject({ id: asset.id, name: '新封面' })
    expect(await store.rename('user-1', asset.id, '   ')).toMatchObject({ name: '新封面' })
    await expect(store.rename('user-2', asset.id, '抢走')).rejects.toThrow('素材不存在')
    await expect(store.rename('user-1', 'missing', '名字')).rejects.toThrow('素材不存在')
    expect((await store.list('user-1'))[0].name).toBe('新封面')
  })

  it('removes idempotently and never removes another user\'s asset', async () => {
    const store = createStore()
    const mine = await store.add('user-1', { dataUrl: PNG, name: '我的', width: 10, height: 10 })
    const theirs = await store.add('user-2', { dataUrl: PNG, name: '别人的', width: 10, height: 10 })

    await store.remove('user-1', theirs.id)
    await store.remove('user-1', mine.id)
    await store.remove('user-1', mine.id)

    expect(await store.list('user-1')).toEqual([])
    expect((await store.list('user-2')).map((asset) => asset.id)).toEqual([theirs.id])
  })
})
