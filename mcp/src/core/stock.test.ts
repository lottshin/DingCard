// Stock image search through both paths: the deployed server's proxy (its
// normalized hits) and keyless Openverse (CC0 only). The network is stubbed
// everywhere; these tests pin the mapping, the validation and the errors.

import { describe, expect, test } from 'vitest'
import { importStockImage, searchStockImages } from './stock'
import type { DingcardServer } from './serverClient'

function fakeServer(answers: { get?: unknown; post?: unknown; getError?: Error; postError?: Error }): DingcardServer {
  return {
    serverUrl: 'https://cards.example.com',
    apiGet: async () => {
      if (answers.getError) throw answers.getError
      return answers.get
    },
    apiPost: async () => {
      if (answers.postError) throw answers.postError
      return answers.post
    },
    uploadImage: async () => '',
    createShare: async () => { throw new Error('unused') },
    listShares: async () => [],
    revokeShare: async () => {},
    listDrafts: async () => [],
    getDraft: async () => { throw new Error('unused') },
    saveDraft: async () => { throw new Error('unused') },
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('searchStockImages', () => {
  test('asks Openverse directly without a server, CC0 only, mapping every field', async () => {
    const calls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return jsonResponse({
        result_count: 42,
        results: [
          {
            id: 'abc-123',
            thumbnail: 'https://api.openverse.org/v1/images/abc-123/thumb/',
            url: 'https://cdn.example.com/photos/abc-123.jpg',
            width: 1920,
            height: 1080,
            creator: '一位摄影师',
            license: 'cc0',
          },
          { id: '', thumbnail: '', url: 'x' },
          'not a hit',
        ],
      })
    }) as unknown as typeof fetch
    const result = await searchStockImages('城市 夜景', { page: 2, server: null, fetchImpl })
    expect(result).toEqual({
      ok: true,
      server: false,
      source: 'openverse',
      page: 2,
      total: 42,
      hits: [{
        id: 'abc-123',
        thumb: 'https://api.openverse.org/v1/images/abc-123/thumb/',
        url: 'https://cdn.example.com/photos/abc-123.jpg',
        width: 1920,
        height: 1080,
        author: '一位摄影师',
        license: 'cc0',
      }],
    })
    expect(calls[0]).toContain('q=')
    expect(calls[0]).toContain('page=2')
    expect(calls[0]).toContain('license=cc0')
    expect(calls[0]).toContain('page_size=12')
  })

  test('goes through the server proxy when one is configured', async () => {
    const server = fakeServer({
      get: { source: 'pixabay', page: 1, total: 7, results: [{ id: 'px-1', thumb: 'https://pix.example/1.jpg', width: 800, height: 600, author: 'Pix' }] },
    })
    const result = await searchStockImages('咖啡', { source: 'pixabay', server })
    expect(result).toEqual({
      ok: true,
      server: true,
      source: 'pixabay',
      page: 1,
      total: 7,
      hits: [{ id: 'px-1', thumb: 'https://pix.example/1.jpg', width: 800, height: 600, author: 'Pix' }],
    })
  })

  test('rejects empty and over-long queries, and reports upstream failures readably', async () => {
    expect((await searchStockImages('   ', { server: null })).ok).toBe(false)
    expect((await searchStockImages('a'.repeat(65), { server: null })).ok).toBe(false)
    const failing = fakeServer({ getError: new Error('服务器返回 502：图库暂时不可用') })
    const result = await searchStockImages('咖啡', { server: failing })
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('图库暂时不可用') })
    const offline = await searchStockImages('咖啡', {
      server: null,
      fetchImpl: (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch,
    })
    expect(offline).toMatchObject({ ok: false, error: expect.stringContaining('Openverse 搜索失败') })
  })
})

describe('importStockImage', () => {
  test('imports through the server and returns the stable URL', async () => {
    const server = fakeServer({ post: { url: 'https://cards.example.com/api/images/img-1.png', alt: '一位摄影师 / Pixabay' } })
    expect(await importStockImage('pixabay', 'px-1', { server })).toEqual({
      ok: true,
      url: 'https://cards.example.com/api/images/img-1.png',
      alt: '一位摄影师 / Pixabay',
    })
  })

  test('explains that no server means no import, and that both ids are required', async () => {
    expect(await importStockImage('pixabay', 'px-1', { server: null })).toMatchObject({
      ok: false,
      error: expect.stringContaining('需要部署的服务端'),
    })
    expect(await importStockImage(' ', '', { server: fakeServer({}) })).toMatchObject({
      ok: false,
      error: expect.stringContaining('source 和 id'),
    })
  })
})
