import { describe, expect, test } from 'vitest'
import { createServerClient, serverClientFromEnv } from './serverClient'

/** A fetch double that answers by path in declaration order, recording calls. */
function fakeFetch(handlers: Array<{ path: string; respond: (init: RequestInit | undefined) => Promise<Response> }>) {
  const calls: Array<{ path: string; init: RequestInit | undefined }> = []
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const path = url.replace('https://cards.example.com', '')
    calls.push({ path, init })
    const handler = handlers.shift()
    if (!handler) throw new Error(`unexpected request: ${url}`)
    if (handler.path !== path) throw new Error(`expected ${handler.path}, got ${path}`)
    return handler.respond(init)
  }
  return { fetchImpl, calls }
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function textBody(init: RequestInit | undefined): string {
  const body = init?.body
  return typeof body === 'string' ? body : ''
}

describe('serverClientFromEnv', () => {
  test('returns null without DINGCARD_SERVER_URL', () => {
    expect(serverClientFromEnv({})).toBeNull()
    expect(serverClientFromEnv({ DINGCARD_SERVER_URL: '   ' })).toBeNull()
  })

  test('builds a client from the environment', () => {
    expect(serverClientFromEnv({
      DINGCARD_SERVER_URL: 'https://cards.example.com/',
      DINGCARD_SERVER_USERNAME: 'a',
      DINGCARD_SERVER_PASSWORD: 'b',
    })).not.toBeNull()
  })

  test('accepts DINGCARD_SERVER_TOKEN alongside the account variables', () => {
    expect(serverClientFromEnv({
      DINGCARD_SERVER_URL: 'https://cards.example.com',
      DINGCARD_SERVER_TOKEN: 'dc_an-api-token',
    })).not.toBeNull()
  })
})

describe('createServerClient', () => {
  test('logs in once, keeps the token, and makes the share absolute', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { path: '/api/auth/login', respond: () => Promise.resolve(jsonResponse(200, { token: 'tok-1', user: { id: 'u1' } })) },
      {
        path: '/api/shares',
        respond: (init) => {
          expect(textBody(init)).toBe(JSON.stringify({ title: '早餐', urls: ['https://cards.example.com/uploads/a.png'] }))
          return Promise.resolve(jsonResponse(200, {
            id: 's1', title: '早餐', url: '/share/tok-1', createdAt: 100, expiresAt: 200, imageCount: 1,
          }))
        },
      },
    ])
    const client = createServerClient({
      serverUrl: 'https://cards.example.com/',
      username: 'user',
      password: 'pass',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    const share = await client.createShare('早餐', ['https://cards.example.com/uploads/a.png'])

    expect(share).toEqual({
      id: 's1', title: '早餐', url: 'https://cards.example.com/share/tok-1', createdAt: 100, expiresAt: 200, imageCount: 1,
    })
    expect(calls[1]?.init?.headers).toMatchObject({ authorization: 'Bearer tok-1' })
  })

  test('send expiresInHours only when given', async () => {
    const seen: string[] = []
    const { fetchImpl } = fakeFetch([
      { path: '/api/auth/login', respond: () => Promise.resolve(jsonResponse(200, { token: 't' })) },
      { path: '/api/shares', respond: (init) => { seen.push(textBody(init)); return Promise.resolve(jsonResponse(200, { id: 's', url: '/share/x', createdAt: 0, expiresAt: 0, imageCount: 1 })) } },
      { path: '/api/shares', respond: (init) => { seen.push(textBody(init)); return Promise.resolve(jsonResponse(200, { id: 's', url: '/share/x', createdAt: 0, expiresAt: 0, imageCount: 1 })) } },
    ])
    const client = createServerClient({ serverUrl: 'https://cards.example.com', username: 'u', password: 'p', fetchImpl: fetchImpl as unknown as typeof fetch })

    await client.createShare('t', ['/uploads/a.png'])
    await client.createShare('t', ['/uploads/a.png'], 6)

    expect(seen[0]).toBe(JSON.stringify({ title: 't', urls: ['/uploads/a.png'] }))
    expect(seen[1]).toBe(JSON.stringify({ title: 't', urls: ['/uploads/a.png'], expiresInHours: 6 }))
  })

  test('a 401 logs in again and retries once', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { path: '/api/auth/login', respond: () => Promise.resolve(jsonResponse(200, { token: 'old' })) },
      { path: '/api/shares', respond: () => Promise.resolve(new Response('expired', { status: 401 })) },
      { path: '/api/auth/login', respond: () => Promise.resolve(jsonResponse(200, { token: 'fresh' })) },
      { path: '/api/shares', respond: () => Promise.resolve(jsonResponse(200, { id: 's', url: '/share/x', createdAt: 0, expiresAt: 0, imageCount: 1 })) },
    ])
    const client = createServerClient({ serverUrl: 'https://cards.example.com', username: 'u', password: 'p', fetchImpl: fetchImpl as unknown as typeof fetch })

    const share = await client.createShare('t', ['/uploads/a.png'])

    expect(share.id).toBe('s')
    expect(calls[3]?.init?.headers).toMatchObject({ authorization: 'Bearer fresh' })
  })

  test('uploads a page as multipart and returns its absolute url', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { path: '/api/auth/login', respond: () => Promise.resolve(jsonResponse(200, { token: 't' })) },
      { path: '/api/images', respond: () => Promise.resolve(jsonResponse(200, { url: '/uploads/page-01.png' })) },
    ])
    const client = createServerClient({ serverUrl: 'https://cards.example.com', username: 'u', password: 'p', fetchImpl: fetchImpl as unknown as typeof fetch })

    const url = await client.uploadImage(new Uint8Array([1, 2, 3]), 'page-01.png')

    expect(url).toBe('https://cards.example.com/uploads/page-01.png')
    const body = calls[1]?.init?.body
    expect(body).toBeInstanceOf(FormData)
    const file = (body as FormData).get('file')
    expect(file).toBeInstanceOf(File)
    expect((file as File).name).toBe('page-01.png')
  })

  test('login failure names the credentials to check', async () => {
    const { fetchImpl } = fakeFetch([
      { path: '/api/auth/login', respond: () => Promise.resolve(jsonResponse(401, { error: '用户名或密码不对' })) },
    ])
    const client = createServerClient({ serverUrl: 'https://cards.example.com', username: 'u', password: 'p', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.listShares()).rejects.toThrow('用户名或密码不对')
  })

  test('missing credentials explain the environment variables', async () => {
    const { fetchImpl } = fakeFetch([])
    const client = createServerClient({ serverUrl: 'https://cards.example.com', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.listShares()).rejects.toThrow('DINGCARD_SERVER_USERNAME')
  })

  test('revoking treats 404 as done and surfaces other failures', async () => {
    const { fetchImpl } = fakeFetch([
      { path: '/api/auth/login', respond: () => Promise.resolve(jsonResponse(200, { token: 't' })) },
      { path: '/api/shares/gone', respond: () => Promise.resolve(new Response('{"error":"分享不存在"}', { status: 404 })) },
      { path: '/api/shares/blocked', respond: () => Promise.resolve(new Response('{"error":"nope"}', { status: 500 })) },
    ])
    const client = createServerClient({ serverUrl: 'https://cards.example.com', username: 'u', password: 'p', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.revokeShare('gone')).resolves.toBeUndefined()
    await expect(client.revokeShare('blocked')).rejects.toThrow('nope')
  })

  test('an API token skips the login and is sent as the bearer', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { path: '/api/shares', respond: () => Promise.resolve(jsonResponse(200, [])) },
    ])
    const client = createServerClient({ serverUrl: 'https://cards.example.com', apiToken: 'dc_an-api-token', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.listShares()).resolves.toEqual([])
    expect(calls).toHaveLength(1)
    expect(calls[0].init?.headers).toMatchObject({ authorization: 'Bearer dc_an-api-token' })
  })

  test('lists drafts and reads one by id, verbatim', async () => {
    const deck = { slides: [{ id: 's1', nodes: [] }] }
    const { fetchImpl, calls } = fakeFetch([
      { path: '/api/auth/login', respond: () => Promise.resolve(jsonResponse(200, { token: 't' })) },
      {
        path: '/api/drafts',
        respond: () => Promise.resolve(jsonResponse(200, [
          { id: 'd1', title: '作品一', schemaVersion: 2, mode: 'freeform-slide', document: deck, updatedAt: 9 },
          'not-a-draft',
          { id: 'd2', title: '', mode: 'markdown-card', document: { source: '# hi' }, updatedAt: 8 },
        ])),
      },
      {
        path: '/api/drafts/d1',
        respond: () => Promise.resolve(jsonResponse(200, { id: 'd1', title: '作品一', schemaVersion: 2, mode: 'freeform-slide', document: deck, updatedAt: 9 })),
      },
    ])
    const client = createServerClient({ serverUrl: 'https://cards.example.com/', username: 'u', password: 'p', fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(client.serverUrl).toBe('https://cards.example.com')

    await expect(client.listDrafts()).resolves.toEqual([
      { id: 'd1', title: '作品一', schemaVersion: 2, mode: 'freeform-slide', document: deck, updatedAt: 9 },
      { id: 'd2', title: '', schemaVersion: 2, mode: 'markdown-card', document: { source: '# hi' }, updatedAt: 8 },
    ])
    await expect(client.getDraft('d1')).resolves.toEqual({
      id: 'd1', title: '作品一', schemaVersion: 2, mode: 'freeform-slide', document: deck, updatedAt: 9,
    })
    expect(calls[2]?.path).toBe('/api/drafts/d1')
  })

  test('a missing draft surfaces the server\'s reason', async () => {
    const { fetchImpl } = fakeFetch([
      { path: '/api/auth/login', respond: () => Promise.resolve(jsonResponse(200, { token: 't' })) },
      { path: '/api/drafts/none', respond: () => Promise.resolve(jsonResponse(404, { error: '草稿不存在' })) },
    ])
    const client = createServerClient({ serverUrl: 'https://cards.example.com', username: 'u', password: 'p', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.getDraft('none')).rejects.toThrow('草稿不存在')
  })

  test('an invalid draft answer is an error, not a made-up draft', async () => {
    const { fetchImpl } = fakeFetch([
      { path: '/api/auth/login', respond: () => Promise.resolve(jsonResponse(200, { token: 't' })) },
      { path: '/api/drafts', respond: () => Promise.resolve(jsonResponse(200, { ok: true })) },
      { path: '/api/drafts/x', respond: () => Promise.resolve(jsonResponse(200, 'nope')) },
    ])
    const client = createServerClient({ serverUrl: 'https://cards.example.com', username: 'u', password: 'p', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.listDrafts()).rejects.toThrow('无效列表')
    await expect(client.getDraft('x')).rejects.toThrow('无效的作品')
  })

  test('saves a draft: created without an id, updated with one', async () => {
    const deck = { slides: [{ id: 's1', nodes: [] }] }
    const { fetchImpl, calls } = fakeFetch([
      { path: '/api/auth/login', respond: () => Promise.resolve(jsonResponse(200, { token: 't' })) },
      { path: '/api/drafts', respond: () => Promise.resolve(jsonResponse(200, { id: 'd1', title: '新作品', schemaVersion: 2, mode: 'freeform-slide', document: deck, updatedAt: 9 })) },
      { path: '/api/drafts', respond: () => Promise.resolve(jsonResponse(200, { id: 'd1', title: '改过的', schemaVersion: 2, mode: 'freeform-slide', document: deck, updatedAt: 10 })) },
    ])
    const client = createServerClient({ serverUrl: 'https://cards.example.com', username: 'u', password: 'p', fetchImpl: fetchImpl as unknown as typeof fetch })

    const created = await client.saveDraft({ mode: 'freeform-slide', title: '新作品', document: deck })
    expect(created).toEqual({ id: 'd1', title: '新作品', schemaVersion: 2, mode: 'freeform-slide', document: deck, updatedAt: 9 })
    expect(JSON.parse(textBody(calls[1]?.init))).toEqual({ mode: 'freeform-slide', title: '新作品', document: deck })

    const updated = await client.saveDraft({ id: 'd1', mode: 'freeform-slide', document: deck })
    expect(updated.updatedAt).toBe(10)
    expect(JSON.parse(textBody(calls[2]?.init))).toEqual({ id: 'd1', mode: 'freeform-slide', document: deck })
  })

  test('a failed save surfaces the server\'s reason', async () => {
    const { fetchImpl } = fakeFetch([
      { path: '/api/auth/login', respond: () => Promise.resolve(jsonResponse(200, { token: 't' })) },
      { path: '/api/drafts', respond: () => Promise.resolve(jsonResponse(413, { error: '请求体过大' })) },
    ])
    const client = createServerClient({ serverUrl: 'https://cards.example.com', username: 'u', password: 'p', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.saveDraft({ mode: 'freeform-slide', document: {} })).rejects.toThrow('作品保存失败')
  })

  test('a rejected API token explains the revocation instead of retrying', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { path: '/api/shares', respond: () => Promise.resolve(jsonResponse(401, { error: '未登录或登录已过期' })) },
    ])
    const client = createServerClient({ serverUrl: 'https://cards.example.com', apiToken: 'dc_revoked', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.listShares()).rejects.toThrow('DINGCARD_SERVER_TOKEN')
    // No login attempt followed the 401: the token is all this client has.
    expect(calls).toHaveLength(1)
  })
})
