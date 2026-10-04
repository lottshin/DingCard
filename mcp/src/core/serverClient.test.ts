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
})
