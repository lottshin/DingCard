import { describe, expect, it } from 'vitest'

import {
  assetNameFromFile,
  dataUrlBytes,
  dataUrlMime,
  formatBytes,
  isAsset,
  normalizeAssetName,
  sortAssets,
  type Asset,
} from './assets'

function asset(overrides: Partial<Asset>): Asset {
  return {
    id: 'a',
    name: '图片',
    src: 'data:image/png;base64,AAAA',
    width: 100,
    height: 80,
    bytes: 3,
    createdAt: 1,
    ...overrides,
  }
}

describe('asset model', () => {
  it('collapses whitespace, falls back when blank, and caps names by characters', () => {
    expect(normalizeAssetName('  雨夜\n  街道  ')).toBe('雨夜 街道')
    expect(normalizeAssetName('   ')).toBe('未命名图片')
    expect(normalizeAssetName('', '旧名字')).toBe('旧名字')
    expect(Array.from(normalizeAssetName('😀'.repeat(80)))).toHaveLength(60)
  })

  it('names assets after the file without its extension', () => {
    expect(assetNameFromFile('photo-street.final.jpg')).toBe('photo-street.final')
    expect(assetNameFromFile('截图.PNG')).toBe('截图')
    expect(assetNameFromFile('.png')).toBe('未命名图片')
  })

  it('reads the MIME type and decoded size of a data URL', () => {
    expect(dataUrlMime('data:image/JPEG;base64,AAAA')).toBe('image/jpeg')
    expect(dataUrlMime('https://example.com/a.png')).toBeNull()
    expect(dataUrlBytes('data:image/png;base64,aGlzdG9yaWNhbA==')).toBe(10)
    expect(dataUrlBytes('data:image/png;base64,aGk=')).toBe(2)
    expect(dataUrlBytes('not a data url')).toBe(0)
  })

  it('accepts only complete assets', () => {
    expect(isAsset(asset({}))).toBe(true)
    expect(isAsset(asset({ width: 0 }))).toBe(false)
    expect(isAsset(asset({ height: 1.5 }))).toBe(false)
    expect(isAsset(asset({ src: '' }))).toBe(false)
    expect(isAsset({ ...asset({}), bytes: undefined })).toBe(false)
  })

  it('sorts newest first by default and by natural name order on request', () => {
    const items = [
      asset({ id: '1', name: '图 10', createdAt: 3 }),
      asset({ id: '2', name: '图 2', createdAt: 1 }),
      asset({ id: '3', name: '图 1', createdAt: 2 }),
    ]
    expect(sortAssets(items).map((item) => item.id)).toEqual(['1', '3', '2'])
    expect(sortAssets(items, 'name').map((item) => item.name)).toEqual(['图 1', '图 2', '图 10'])
    expect(items.map((item) => item.id)).toEqual(['1', '2', '3'])
  })

  it('formats byte counts for people', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(320 * 1024)).toBe('320 KB')
    expect(formatBytes(8.44 * 1024 * 1024)).toBe('8.4 MB')
  })
})
