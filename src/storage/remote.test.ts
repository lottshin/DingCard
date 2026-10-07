import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SaveDraftInput } from '../drafts'
import { normalizeFreeformDocument } from '../freeform/sceneDocument'
import type { FreeformDocument } from '../freeform/types'

const API_BASE = 'https://api.example'
const TOKEN_KEY = 'slicer.token.v1'
const INLINE_IMAGE = 'data:image/png;base64,aGlzdG9yaWNhbA=='

type FetchCall = [input: string | URL | Request, init?: RequestInit]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function invalidJsonResponse(status = 200): Response {
  return new Response('{not-json', {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function requestUrl(call: FetchCall): string {
  const input = call[0]
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function requestHeaders(call: FetchCall): Headers {
  return new Headers(call[1]?.headers)
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function freeformDocument() {
  return {
    documentVersion: 35 as const,
    activeSlideId: 'page-1',
    slides: [
      {
        id: 'page-1',
        name: 'Page 1',
        width: 1080,
        height: 1440,
        background: { type: 'solid' as const, color: '#ffffff' },
        nodes: [
          {
            id: 'existing-image',
            name: 'Existing image',
            locked: false,
            hidden: false,
            type: 'image' as const,
            x: 10,
            y: 20,
            width: 300,
            height: 200,
            rotation: 0,
            scale: 1,
            src: `${API_BASE}/uploads/existing.png`,
            alt: 'existing',
            fit: 'cover' as const,
            framing: { focusX: 0.2, focusY: 0.75, zoom: 2.5 },
          },
          {
            id: 'historical-fill',
            name: 'Historical fill',
            locked: false,
            hidden: false,
            type: 'shape' as const,
            x: 30,
            y: 40,
            width: 240,
            height: 160,
            rotation: 0,
            scale: 1,
            shape: 'rect' as const,
            fill: {
              type: 'image' as const,
              src: INLINE_IMAGE,
              fit: 'contain' as const,
              framing: { focusX: 0.8, focusY: 0.3, zoom: 3.25 },
            },
            stroke: '#000000',
            strokeWidth: 0,
          },
        ],
      },
    ],
  }
}

function nestedFreeformDocument(): FreeformDocument {
  return {
    documentVersion: 35,
    activeSlideId: 'page-1',
    slides: [{
      id: 'page-1',
      name: 'Page 1',
      width: 1080,
      height: 1440,
      background: { type: 'solid', color: '#ffffff' },
      nodes: [{
        id: 'outer',
        name: 'Outer',
        locked: false,
        hidden: false,
        type: 'group',
        x: 0,
        y: 0,
        rotation: 0,
        scale: 1,
        children: [{
          id: 'existing-image',
          name: 'Existing image',
          locked: false,
          hidden: false,
          type: 'image',
          x: 10,
          y: 20,
          width: 300,
          height: 200,
          rotation: 0,
          scale: 1,
          src: `${API_BASE}/uploads/existing.png`,
          alt: 'existing',
          fit: 'cover',
          framing: { focusX: 0.15, focusY: 0.85, zoom: 2.75 },
        }, {
          id: 'hidden-inner',
          name: 'Hidden inner',
          locked: false,
          hidden: true,
          type: 'group',
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1,
          children: [{
            id: 'historical-fill',
            name: 'Historical fill',
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
              src: INLINE_IMAGE,
              fit: 'contain',
              framing: { focusX: 0.9, focusY: 0.25, zoom: 3.5 },
            },
            stroke: '#000000',
            strokeWidth: 0,
          }],
        }],
      }],
    }],
  }
}

function strictText(id: string) {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'text' as const,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    scale: 1,
    text: id,
    fontSize: 12,
    fontFamily: 'system-ui',
    textFill: { type: 'solid' as const, color: '#111111' },
    align: 'left' as const,
    fontWeight: 'normal' as const,
  }
}

function strictSlide(id: string, nodes: unknown[] = []) {
  return {
    id,
    name: id,
    width: 1024,
    height: 768,
    background: { type: 'solid' as const, color: '#ffffff' },
    nodes,
  }
}

function nestedGroups(depth: number): unknown {
  let node: unknown = strictText(`node-${depth}`)
  for (let level = depth - 1; level >= 1; level -= 1) {
    node = {
      id: `node-${level}`,
      name: `Group ${level}`,
      locked: false,
      hidden: false,
      type: 'group',
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      children: [node],
    }
  }
  return node
}

function savedFreeformDraft(document: unknown) {
  return {
    id: 'draft-1',
    title: 'Page 1',
    schemaVersion: 2,
    updatedAt: 10,
    mode: 'freeform-slide',
    document,
  }
}

function responseForDataUrl(): Response {
  return new Response(new Uint8Array([137, 80, 78, 71]), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  })
}

function jsonRequestBody(call: FetchCall): Record<string, unknown> {
  const body = call[1]?.body
  if (typeof body !== 'string') throw new Error('Expected a JSON request body')
  return JSON.parse(body) as Record<string, unknown>
}

async function expectApiError(
  promise: Promise<unknown>,
  status: number | null,
  message?: string,
) {
  let thrown: unknown
  try {
    await promise
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(Error)
  expect(thrown).toMatchObject({ name: 'ApiError', status })
  if (message) expect((thrown as Error).message).toBe(message)
}

describe('RemoteStore errors and authentication', () => {
  let values: Map<string, string>
  let fetchMock: ReturnType<typeof vi.fn>
  let removeItem: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    values = new Map()
    removeItem = vi.fn((key: string) => values.delete(key))
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem,
    })
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function createStore() {
    const { createRemoteStore } = await import('./remote')
    return createRemoteStore(API_BASE)
  }

  it('reports network failures as ApiError with a null status', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    const store = await createStore()

    await expectApiError(store.drafts.list('user-1'), null)
  })

  it('reports HTTP failures as ApiError with the response status and server message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: '服务暂不可用' }, 503))
    const store = await createStore()

    await expectApiError(store.drafts.list('user-1'), 503, '服务暂不可用')
  })

  it('reports invalid JSON with a stable ApiError message and response status', async () => {
    fetchMock.mockResolvedValueOnce(invalidJsonResponse(200))
    const store = await createStore()

    await expectApiError(store.drafts.list('user-1'), 200, '服务器返回了无效响应')
  })

  it('invalidates and notifies once when a protected request gets 401 for the current token', async () => {
    values.set(TOKEN_KEY, 'current-token')
    fetchMock.mockResolvedValueOnce(invalidJsonResponse(401))
    const store = await createStore()
    const listener = vi.fn()
    const unsubscribe = store.auth.onInvalidated(listener)

    await expectApiError(store.drafts.list('user-1'), 401, '服务器返回了无效响应')

    expect(values.has(TOKEN_KEY)).toBe(false)
    expect(removeItem).toHaveBeenCalledWith(TOKEN_KEY)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('does not let a late 401 for an old token clear a newer login', async () => {
    values.set(TOKEN_KEY, 'old-token')
    const oldRequest = deferred<Response>()
    fetchMock
      .mockImplementationOnce(() => oldRequest.promise)
      .mockResolvedValueOnce(jsonResponse({
        user: { id: 'user-2', username: 'new-user', createdAt: 2 },
        token: 'new-token',
      }))
    const store = await createStore()

    const pendingOldRequest = store.drafts.list('user-1')
    await store.auth.login('new-user', 'password')
    oldRequest.resolve(jsonResponse({ error: '旧 token 已失效' }, 401))

    await expectApiError(pendingOldRequest, 401, '旧 token 已失效')
    expect(values.get(TOKEN_KEY)).toBe('new-token')
  })

  it('does not restore a session when login succeeds after an explicit logout', async () => {
    const pendingLogin = deferred<Response>()
    fetchMock.mockImplementationOnce(() => pendingLogin.promise)
    const store = await createStore()

    const login = store.auth.login('alice', 'password')
    await store.auth.logout()
    pendingLogin.resolve(jsonResponse({
      user: { id: 'user-1', username: 'alice', createdAt: 1 },
      token: 'late-token',
    }))

    await expectApiError(login, null, '认证请求已失效')
    expect(values.has(TOKEN_KEY)).toBe(false)
  })

  it('does not let an older concurrent login overwrite the newer attempt', async () => {
    const firstResponse = deferred<Response>()
    const secondResponse = deferred<Response>()
    fetchMock
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise)
    const store = await createStore()

    const firstLogin = store.auth.login('first-user', 'password')
    const secondLogin = store.auth.login('second-user', 'password')
    secondResponse.resolve(jsonResponse({
      user: { id: 'user-2', username: 'second-user', createdAt: 2 },
      token: 'second-token',
    }))
    await expect(secondLogin).resolves.toMatchObject({ id: 'user-2' })
    firstResponse.resolve(jsonResponse({
      user: { id: 'user-1', username: 'first-user', createdAt: 1 },
      token: 'first-token',
    }))

    await expectApiError(firstLogin, null, '认证请求已失效')
    expect(values.get(TOKEN_KEY)).toBe('second-token')
  })

  it('never sends bearer auth for register or login and their 401 does not invalidate the session', async () => {
    values.set(TOKEN_KEY, 'existing-token')
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ error: '凭据错误' }, 401)))
    const store = await createStore()

    await expectApiError(store.auth.register('new-user', 'wrong'), 401, '凭据错误')
    await expectApiError(store.auth.login('new-user', 'wrong'), 401, '凭据错误')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const call of fetchMock.mock.calls as FetchCall[]) {
      expect(requestHeaders(call).has('authorization')).toBe(false)
    }
    expect(values.get(TOKEN_KEY)).toBe('existing-token')
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('preserves the current token across network, 500, and successful invalid-JSON failures', async () => {
    values.set(TOKEN_KEY, 'stable-token')
    fetchMock
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
      .mockResolvedValueOnce(invalidJsonResponse(200))
    const store = await createStore()

    await expectApiError(store.drafts.list('user-1'), null)
    expect(values.get(TOKEN_KEY)).toBe('stable-token')
    await expectApiError(store.drafts.list('user-1'), 500, 'boom')
    expect(values.get(TOKEN_KEY)).toBe('stable-token')
    await expectApiError(store.drafts.list('user-1'), 200, '服务器返回了无效响应')
    expect(values.get(TOKEN_KEY)).toBe('stable-token')
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('keeps a login token in memory when localStorage throws SecurityError', async () => {
    const blocked = () => {
      throw new DOMException('storage blocked', 'SecurityError')
    }
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(blocked),
      setItem: vi.fn(blocked),
      removeItem: vi.fn(blocked),
    })
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        user: { id: 'user-1', username: 'alice', createdAt: 1 },
        token: 'memory-token',
      }))
      .mockResolvedValueOnce(jsonResponse({
        user: { id: 'user-1', username: 'alice', createdAt: 1 },
      }))
    const store = await createStore()

    await store.auth.login('alice', 'password')
    await expect(store.auth.current()).resolves.toMatchObject({ id: 'user-1' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requestHeaders(fetchMock.mock.calls[0] as FetchCall).has('authorization')).toBe(false)
    expect(requestHeaders(fetchMock.mock.calls[1] as FetchCall).get('authorization')).toBe(
      'Bearer memory-token',
    )
  })

  it('returns null from current when the current token receives 401', async () => {
    values.set(TOKEN_KEY, 'expired-token')
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
    const store = await createStore()

    await expect(store.auth.current()).resolves.toBeNull()
    expect(values.has(TOKEN_KEY)).toBe(false)
  })

  it('returns null when logout happens before a successful current response arrives', async () => {
    values.set(TOKEN_KEY, 'session-token')
    const pendingCurrent = deferred<Response>()
    fetchMock.mockImplementationOnce(() => pendingCurrent.promise)
    const store = await createStore()

    const current = store.auth.current()
    await store.auth.logout()
    pendingCurrent.resolve(jsonResponse({
      user: { id: 'user-1', username: 'alice', createdAt: 1 },
    }))

    await expect(current).resolves.toBeNull()
    expect(values.has(TOKEN_KEY)).toBe(false)
  })

  it('rechecks the newer session when an old current request returns 401 late', async () => {
    values.set(TOKEN_KEY, 'old-token')
    const oldCurrentResponse = deferred<Response>()
    fetchMock
      .mockImplementationOnce(() => oldCurrentResponse.promise)
      .mockResolvedValueOnce(jsonResponse({
        user: { id: 'user-2', username: 'new-user', createdAt: 2 },
        token: 'new-token',
      }))
      .mockResolvedValueOnce(jsonResponse({
        user: { id: 'user-2', username: 'new-user', createdAt: 2 },
      }))
    const store = await createStore()

    const current = store.auth.current()
    await store.auth.login('new-user', 'password')
    oldCurrentResponse.resolve(jsonResponse({ error: 'old token expired' }, 401))

    await expect(current).resolves.toMatchObject({ id: 'user-2' })
    expect(values.get(TOKEN_KEY)).toBe('new-token')
    expect(requestHeaders(fetchMock.mock.calls[2] as FetchCall).get('authorization')).toBe(
      'Bearer new-token',
    )
  })

  it.each([
    ['network failure', () => Promise.reject(new TypeError('offline')), null],
    ['server failure', () => Promise.resolve(jsonResponse({ error: 'boom' }, 500)), 500],
    ['invalid JSON', () => Promise.resolve(invalidJsonResponse(200)), 200],
  ])('rethrows %s from current instead of treating it as logout', async (_name, response, status) => {
    values.set(TOKEN_KEY, 'still-valid-token')
    fetchMock.mockImplementationOnce(response)
    const store = await createStore()

    await expectApiError(store.auth.current(), status)
    expect(values.get(TOKEN_KEY)).toBe('still-valid-token')
  })

  it('sends the token captured for a protected request', async () => {
    values.set(TOKEN_KEY, 'request-token')
    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    const store = await createStore()

    await store.drafts.list('user-1')

    expect(requestUrl(fetchMock.mock.calls[0] as FetchCall)).toBe(`${API_BASE}/api/drafts`)
    expect(requestHeaders(fetchMock.mock.calls[0] as FetchCall).get('authorization')).toBe(
      'Bearer request-token',
    )
  })

  it('keeps logout effective in memory when removing persistent storage fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      user: { id: 'user-1', username: 'alice', createdAt: 1 },
      token: 'token-that-cannot-be-removed',
    }))
    removeItem.mockImplementationOnce(() => {
      throw new DOMException('storage blocked', 'SecurityError')
    })
    const store = await createStore()

    await store.auth.login('alice', 'password')
    await store.auth.logout()

    await expect(store.auth.current()).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('RemoteStore draft normalization and image retention', () => {
  let values: Map<string, string>
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    values = new Map([[TOKEN_KEY, 'draft-token']])
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    })
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function createStore() {
    const { createRemoteStore } = await import('./remote')
    return createRemoteStore(API_BASE)
  }

  it('rejects a non-array draft list response with a stable error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ drafts: [] }))
    const store = await createStore()

    await expectApiError(
      store.drafts.list('user-1'),
      200,
      '服务器返回了无效草稿列表',
    )
  })

  it('drops invalid list items and normalizes legacy markdown and freeform v1 drafts', async () => {
    const profile = {
      nickname: 'A',
      handle: 'a',
      location: '',
      avatarColor: '#000000',
      avatarImage: null,
      verified: false,
      headerFirstPageOnly: false,
    }
    fetchMock.mockResolvedValueOnce(jsonResponse([
      { id: 'broken' },
      {
        id: 'legacy-markdown',
        title: 'Legacy',
        source: '# legacy',
        platformId: 'rednote',
        themeId: 'light',
        fontFamily: 'system-ui, sans-serif',
        profile,
        updatedAt: 1,
      },
      {
        id: 'freeform-v1',
        title: 'Old freeform',
        schemaVersion: 2,
        mode: 'freeform-slide',
        updatedAt: 2,
        document: {
          documentVersion: 1,
          activeSlideId: 'page-1',
          slides: [{
            id: 'page-1',
            name: 'Page 1',
            width: 1080,
            height: 1440,
            background: { type: 'solid', color: '#ffffff' },
            elements: [],
          }],
        },
      },
    ]))
    const store = await createStore()

    const drafts = await store.drafts.list('user-1')

    expect(drafts).toHaveLength(2)
    expect(drafts.map((draft) => [draft.id, draft.mode, draft.schemaVersion])).toEqual([
      ['legacy-markdown', 'markdown-card', 2],
      ['freeform-v1', 'freeform-slide', 2],
    ])
    expect(drafts[1].mode === 'freeform-slide' && drafts[1].document.documentVersion).toBe(35)
    if (drafts[1].mode !== 'freeform-slide') throw new Error('Expected freeform draft')
    expect(drafts[1].document.slides[0].nodes).toEqual([])
  })

  it('preserves non-default v4 framing returned by the remote draft list', async () => {
    const document = freeformDocument()
    fetchMock.mockResolvedValueOnce(jsonResponse([savedFreeformDraft(document)]))
    const store = await createStore()

    const drafts = await store.drafts.list('user-1')

    expect(drafts).toHaveLength(1)
    const draft = drafts[0]
    if (draft.mode !== 'freeform-slide') throw new Error('Expected freeform draft')
    const image = draft.document.slides[0].nodes[0]
    const shape = draft.document.slides[0].nodes[1]
    if (image.type !== 'image' || shape.type !== 'shape' || shape.fill.type !== 'image') {
      throw new Error('Expected image-bearing leaves')
    }
    expect(image.framing).toEqual({ focusX: 0.2, focusY: 0.75, zoom: 2.5 })
    expect(shape.fill.framing).toEqual({ focusX: 0.8, focusY: 0.3, zoom: 3.25 })
  })

  it('rejects an invalid saved draft response instead of returning it to the workspace', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'broken-response' }))
    const store = await createStore()
    const document = freeformDocument()
    document.slides[0].nodes = []

    await expectApiError(store.drafts.save('user-1', {
      mode: 'freeform-slide',
      document,
    }), 200, '服务器返回了无效草稿')
  })

  it('rejects a complete v4 saved response when image framing is missing', async () => {
    const input = freeformDocument()
    input.slides[0].nodes = []
    const malformed = structuredClone(freeformDocument())
    const malformedImage = malformed.slides[0].nodes[0]
    if (malformedImage.type !== 'image') throw new Error('Expected image fixture')
    delete (malformedImage as Partial<typeof malformedImage>).framing
    fetchMock.mockResolvedValueOnce(jsonResponse(savedFreeformDraft(malformed)))
    const store = await createStore()

    await expectApiError(store.drafts.save('user-1', {
      mode: 'freeform-slide',
      document: input,
    }), 200)
  })

  it('rejects invalid save input before any remote mutation', async () => {
    const store = await createStore()
    const invalid = {
      id: 'invalid-freeform',
      mode: 'freeform-slide',
      document: {
        documentVersion: 3,
        activeSlideId: 'missing',
        slides: [strictSlide('slide-1')],
      },
    } as unknown as SaveDraftInput

    await expectApiError(
      store.drafts.save('user-1', invalid),
      null,
      '远程草稿内容无效',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects every strict v3 boundary violation before any remote mutation', async () => {
    const invalidDocuments = [
      {
        documentVersion: 3,
        activeSlideId: 'slide-0',
        slides: Array.from({ length: 501 }, (_, index) => strictSlide(`slide-${index}`)),
      },
      {
        documentVersion: 3,
        activeSlideId: 'slide-1',
        slides: [strictSlide(
          'slide-1',
          Array.from({ length: 5001 }, (_, index) => strictText(`node-${index}`)),
        )],
      },
      {
        documentVersion: 3,
        activeSlideId: 'slide-1',
        slides: [strictSlide('slide-1', [{ ...strictText('text-1'), scale: Number.NaN }])],
      },
      {
        documentVersion: 3,
        activeSlideId: 'slide-1',
        slides: [strictSlide('slide-1', [nestedGroups(33)])],
      },
      {
        documentVersion: 3,
        activeSlideId: 'missing',
        slides: [strictSlide('slide-1')],
      },
    ]
    const store = await createStore()

    for (const [index, document] of invalidDocuments.entries()) {
      await expectApiError(store.drafts.save('user-1', {
        id: `invalid-${index}`,
        mode: 'freeform-slide',
        document,
      } as unknown as SaveDraftInput), null, '远程草稿内容无效')
    }

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('migrates a v2 save before serialization and returns strict v7', async () => {
    const legacy = {
      documentVersion: 2,
      activeSlideId: 'page-1',
      slides: [{
        id: 'page-1',
        name: 'Page 1',
        width: 1024,
        height: 768,
        background: { type: 'solid', color: '#ffffff' },
        elements: [],
      }],
    }
    let submitted: Record<string, unknown> | undefined
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      const url = requestUrl(args)
      if (url !== `${API_BASE}/api/drafts`) throw new Error(`Unexpected request: ${url}`)
      submitted = jsonRequestBody(args)
      return jsonResponse({
        id: 'legacy-draft',
        title: 'Page 1',
        schemaVersion: 2,
        updatedAt: 10,
        ...submitted,
      })
    })
    const store = await createStore()

    const saved = await store.drafts.save('user-1', {
      id: 'legacy-draft',
      mode: 'freeform-slide',
      document: legacy,
    } as unknown as SaveDraftInput)

    expect(submitted?.document).toMatchObject({ documentVersion: 35 })
    expect(JSON.stringify(submitted?.document)).not.toContain('"elements"')
    expect(saved.mode).toBe('freeform-slide')
    if (saved.mode !== 'freeform-slide') throw new Error('Expected freeform draft')
    expect(normalizeFreeformDocument(saved.document)).toEqual(saved.document)
  })

  it('uploads and retains nested hidden v4 image sources atomically', async () => {
    const events: string[] = []
    const retentionBodies: unknown[] = []
    let submitted: Record<string, unknown> | undefined
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      const url = requestUrl(args)
      if (url === INLINE_IMAGE) {
        events.push('decode-inline')
        return responseForDataUrl()
      }
      if (url === `${API_BASE}/api/images/retain`) {
        events.push('retain')
        retentionBodies.push(jsonRequestBody(args).urls)
        return jsonResponse({ retained: 1 })
      }
      if (url === `${API_BASE}/api/images`) {
        events.push('upload-inline')
        return jsonResponse({ ref: 'img:new', url: '/uploads/new.png' })
      }
      if (url === `${API_BASE}/api/drafts`) {
        events.push('post-draft')
        submitted = jsonRequestBody(args)
        return jsonResponse({
          id: 'nested-draft',
          title: 'Page 1',
          schemaVersion: 2,
          updatedAt: 10,
          ...submitted,
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const store = await createStore()
    const input = nestedFreeformDocument()
    const snapshot = structuredClone(input)

    const saved = await store.drafts.save('user-1', {
      id: 'nested-draft',
      mode: 'freeform-slide',
      document: input,
    })

    expect(events).toEqual(['retain', 'decode-inline', 'upload-inline', 'retain', 'post-draft'])
    expect(retentionBodies[0]).toContain(`${API_BASE}/uploads/existing.png`)
    expect(retentionBodies[1]).toEqual(expect.arrayContaining([
      `${API_BASE}/uploads/existing.png`,
      `${API_BASE}/uploads/new.png`,
    ]))
    expect(input).toEqual(snapshot)
    expect(JSON.stringify(submitted)).not.toContain('data:image/')
    expect(JSON.stringify(submitted)).toContain('"hidden":true')
    expect(saved.mode).toBe('freeform-slide')
    if (saved.mode !== 'freeform-slide') throw new Error('Expected freeform draft')
    expect(normalizeFreeformDocument(saved.document)).toEqual(saved.document)
    const savedOuter = saved.document.slides[0].nodes[0]
    if (savedOuter.type !== 'group') throw new Error('Expected nested group')
    const savedImage = savedOuter.children[0]
    const savedInner = savedOuter.children[1]
    if (
      savedImage.type !== 'image'
      || savedInner.type !== 'group'
      || savedInner.children[0].type !== 'shape'
      || savedInner.children[0].fill.type !== 'image'
    ) throw new Error('Expected nested image-bearing leaves')
    expect(savedImage.framing).toEqual({ focusX: 0.15, focusY: 0.85, zoom: 2.75 })
    expect(savedInner.children[0].fill.framing).toEqual({
      focusX: 0.9,
      focusY: 0.25,
      zoom: 3.5,
    })
  })

  it('does not request retention for empty or external-only URLs and forwards same-origin candidates once', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ retained: 3 }))
    const store = await createStore()

    await store.images.retain([
      '',
      'data:image/png;base64,AAAA',
      'img:local-only',
      'https://cdn.example/uploads/external.png',
    ])
    expect(fetchMock).not.toHaveBeenCalled()

    await store.images.retain([
      '/uploads/local.png',
      '/uploads/local.png?cache=1',
      '/media/custom-public-path.png',
      `${API_BASE}/uploads/absolute.png`,
      '//api.example/uploads/absolute.png',
      'https://cdn.example/uploads/external.png',
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0] as FetchCall
    expect(requestUrl(call)).toBe(`${API_BASE}/api/images/retain`)
    const urls = jsonRequestBody(call).urls
    expect(urls).toEqual(expect.arrayContaining([
      '/uploads/local.png',
      '/media/custom-public-path.png',
      `${API_BASE}/uploads/absolute.png`,
    ]))
    expect(urls).not.toContain('https://cdn.example/uploads/external.png')
  })

  it('saves historical inline images in retain-upload-retain-draft order without mutating input', async () => {
    const events: string[] = []
    let retainCount = 0
    const submittedBodies: Record<string, unknown>[] = []
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      const url = requestUrl(args)
      const init = args[1]
      if (url === INLINE_IMAGE) {
        events.push('decode-inline')
        return responseForDataUrl()
      }
      if (url === `${API_BASE}/api/images/retain`) {
        retainCount += 1
        events.push(`retain-${retainCount}`)
        return jsonResponse({ retained: retainCount === 1 ? 1 : 2 })
      }
      if (url === `${API_BASE}/api/images`) {
        expect(init?.body).toBeInstanceOf(FormData)
        events.push('upload-inline')
        return jsonResponse({ ref: 'img:new', url: '/uploads/new.png' })
      }
      if (url === `${API_BASE}/api/drafts`) {
        events.push('post-draft')
        const submitted = jsonRequestBody(args)
        submittedBodies.push(submitted)
        return jsonResponse(savedFreeformDraft(
          (submitted.document as ReturnType<typeof freeformDocument>),
        ))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const store = await createStore()
    const input = freeformDocument()
    const snapshot = structuredClone(input)

    const saved = await store.drafts.save('user-1', {
      mode: 'freeform-slide',
      document: input,
    })

    expect(events).toEqual([
      'retain-1',
      'decode-inline',
      'upload-inline',
      'retain-2',
      'post-draft',
    ])
    expect(input).toEqual(snapshot)
    expect(saved.mode).toBe('freeform-slide')
    if (saved.mode !== 'freeform-slide') throw new Error('Expected a freeform draft')
    const serialized = JSON.stringify(saved.document)
    expect(serialized).not.toContain('data:image/')
    expect(serialized).toContain(`${API_BASE}/uploads/new.png`)
    expect(JSON.stringify(submittedBodies[0])).not.toContain('data:image/')
    const savedImage = saved.document.slides[0].nodes[0]
    const savedShape = saved.document.slides[0].nodes[1]
    if (savedImage.type !== 'image' || savedShape.type !== 'shape' || savedShape.fill.type !== 'image') {
      throw new Error('Expected image-bearing leaves')
    }
    expect(savedImage.framing).toEqual({ focusX: 0.2, focusY: 0.75, zoom: 2.5 })
    expect(savedShape.fill.framing).toEqual({ focusX: 0.8, focusY: 0.3, zoom: 3.25 })
  })

  it.each(['initial-retain', 'upload', 'final-retain'] as const)(
    'does not post a draft when %s fails',
    async (failureStage) => {
      let retainCount = 0
      fetchMock.mockImplementation(async (...args: FetchCall) => {
        const url = requestUrl(args)
        if (url === INLINE_IMAGE) return responseForDataUrl()
        if (url === `${API_BASE}/api/images/retain`) {
          retainCount += 1
          if (failureStage === 'initial-retain' && retainCount === 1) {
            return jsonResponse({ error: 'retain failed' }, 503)
          }
          if (failureStage === 'final-retain' && retainCount === 2) {
            return jsonResponse({ error: 'retain failed' }, 409)
          }
          return jsonResponse({ retained: 1 })
        }
        if (url === `${API_BASE}/api/images`) {
          return failureStage === 'upload'
            ? jsonResponse({ error: 'upload failed' }, 503)
            : jsonResponse({ ref: 'img:new', url: '/uploads/new.png' })
        }
        if (url === `${API_BASE}/api/drafts`) {
          return jsonResponse(savedFreeformDraft(freeformDocument()))
        }
        throw new Error(`Unexpected request: ${url}`)
      })
      const store = await createStore()

      await expect(store.drafts.save('user-1', {
        mode: 'freeform-slide',
        document: freeformDocument(),
      })).rejects.toBeInstanceOf(Error)

      const requestedUrls = (fetchMock.mock.calls as FetchCall[]).map(requestUrl)
      expect(requestedUrls).not.toContain(`${API_BASE}/api/drafts`)
    },
  )

  it('reuploads historical inline images after a failed draft POST', async () => {
    let uploadCount = 0
    let draftPostCount = 0
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      const url = requestUrl(args)
      if (url === INLINE_IMAGE) return responseForDataUrl()
      if (url === `${API_BASE}/api/images`) {
        uploadCount += 1
        return jsonResponse({ ref: `img:${uploadCount}`, url: `/uploads/retry-${uploadCount}.png` })
      }
      if (url === `${API_BASE}/api/images/retain`) return jsonResponse({ retained: 1 })
      if (url === `${API_BASE}/api/drafts`) {
        draftPostCount += 1
        return jsonResponse({ error: 'draft failed' }, 503)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const store = await createStore()
    const input = freeformDocument()

    await expect(store.drafts.save('user-1', {
      mode: 'freeform-slide',
      document: input,
    })).rejects.toBeInstanceOf(Error)
    await expect(store.drafts.save('user-1', {
      mode: 'freeform-slide',
      document: input,
    })).rejects.toBeInstanceOf(Error)

    expect(uploadCount).toBe(2)
    expect(draftPostCount).toBe(2)
  })
})

describe('RemoteStore asset library', () => {
  let values: Map<string, string>
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    values = new Map([[TOKEN_KEY, 'asset-token']])
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    })
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function createStore() {
    const { createRemoteStore } = await import('./remote')
    return createRemoteStore(API_BASE)
  }

  const serverAsset = {
    id: 'asset-1',
    name: '雨夜街道',
    url: '/uploads/street.jpg',
    width: 1200,
    height: 800,
    bytes: 2048,
    createdAt: 50,
  }

  it('uploads the image first, then registers it as an asset with absolute URLs', async () => {
    const events: string[] = []
    let registered: Record<string, unknown> | undefined
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      const url = requestUrl(args)
      if (url === INLINE_IMAGE) return responseForDataUrl()
      if (url === `${API_BASE}/api/images`) {
        events.push('upload')
        return jsonResponse({ ref: 'img:street', url: '/uploads/street.jpg' })
      }
      if (url === `${API_BASE}/api/assets`) {
        events.push('register')
        registered = jsonRequestBody(args)
        expect(requestHeaders(args).get('authorization')).toBe('Bearer asset-token')
        return jsonResponse(serverAsset)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const store = await createStore()

    const asset = await store.assets.add('user-1', {
      dataUrl: INLINE_IMAGE,
      name: '  雨夜街道 ',
      width: 1200,
      height: 800,
    })

    expect(events).toEqual(['upload', 'register'])
    expect(registered).toEqual({
      url: `${API_BASE}/uploads/street.jpg`,
      name: '雨夜街道',
      width: 1200,
      height: 800,
    })
    expect(asset).toEqual({
      id: 'asset-1',
      name: '雨夜街道',
      src: `${API_BASE}/uploads/street.jpg`,
      width: 1200,
      height: 800,
      bytes: 2048,
      createdAt: 50,
    })
  })

  it('drops malformed list items and rejects a non-array list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([
      serverAsset,
      { ...serverAsset, id: 'no-url', url: '' },
      { ...serverAsset, id: 'bad-size', width: -1 },
      { ...serverAsset, id: 'no-bytes', bytes: undefined },
    ]))
    const store = await createStore()

    expect((await store.assets.list('user-1')).map((asset) => [asset.id, asset.bytes])).toEqual([
      ['asset-1', 2048],
      ['no-bytes', 0],
    ])

    fetchMock.mockResolvedValueOnce(jsonResponse({ assets: [] }))
    await expectApiError(store.assets.list('user-1'), 200, '服务器返回了无效素材列表')
  })

  it('renames with PATCH and deletes by id', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ...serverAsset, name: '新名字' }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    const store = await createStore()

    expect(await store.assets.rename('user-1', 'asset/1', ' 新名字 ')).toMatchObject({ name: '新名字' })
    await store.assets.remove('user-1', 'asset/1')

    const [renameCall, removeCall] = fetchMock.mock.calls as FetchCall[]
    expect(requestUrl(renameCall)).toBe(`${API_BASE}/api/assets/asset%2F1`)
    expect(renameCall[1]?.method).toBe('PATCH')
    expect(jsonRequestBody(renameCall)).toEqual({ name: '新名字' })
    expect(requestUrl(removeCall)).toBe(`${API_BASE}/api/assets/asset%2F1`)
    expect(removeCall[1]?.method).toBe('DELETE')
  })

  it('reports an invalid asset response instead of returning a broken asset', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'asset-1' }))
    const store = await createStore()

    await expectApiError(store.assets.rename('user-1', 'asset-1', '名字'), 200, '服务器返回了无效素材')
  })
})

describe('RemoteStore share links', () => {
  let values: Map<string, string>
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    values = new Map([[TOKEN_KEY, 'share-token']])
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    })
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function createStore() {
    const { createRemoteStore } = await import('./remote')
    return createRemoteStore(API_BASE)
  }

  const serverShare = {
    id: 'share-1',
    title: '一周早餐',
    url: '/share/tok-1',
    createdAt: 100,
    expiresAt: 200,
    imageCount: 3,
    views: 5,
  }

  it('creates a share from managed upload URLs and resolves the page link absolutely', async () => {
    let created: Record<string, unknown> | undefined
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      if (requestUrl(args) === `${API_BASE}/api/shares`) {
        created = jsonRequestBody(args)
        expect(requestHeaders(args).get('authorization')).toBe('Bearer share-token')
        return jsonResponse(serverShare)
      }
      throw new Error(`Unexpected request: ${requestUrl(args)}`)
    })
    const store = await createStore()

    const share = await store.shares.create('user-1', '一周早餐', ['/uploads/page-1.png', `${API_BASE}/uploads/page-2.jpg`], 7)

    expect(created).toEqual({
      title: '一周早餐',
      urls: ['/uploads/page-1.png', `${API_BASE}/uploads/page-2.jpg`],
      expiresInHours: 7,
    })
    expect(share).toEqual({
      id: 'share-1',
      title: '一周早餐',
      url: `${API_BASE}/share/tok-1`,
      createdAt: 100,
      expiresAt: 200,
      imageCount: 3,
      views: 5,
    })
  })

  it('lists shares newest first and drops broken rows', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([
      serverShare,
      { id: 'share-2', url: '/share/tok-2', createdAt: 300, expiresAt: 400, imageCount: 1 },
      { id: 'broken' },
    ]))
    const store = await createStore()

    const shares = await store.shares.list('user-1')

    expect(shares.map((share) => [share.id, share.url, share.imageCount, share.views])).toEqual([
      ['share-1', `${API_BASE}/share/tok-1`, 3, 5],
      ['share-2', `${API_BASE}/share/tok-2`, 1, 0],
    ])
  })

  it('revokes by encoded id and reports invalid envelopes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ id: 'share-1' }))
    const store = await createStore()

    await store.shares.revoke('user-1', 'share/1')
    await expectApiError(store.shares.create('user-1', '早餐', ['/uploads/a.png']), 200, '服务器返回了无效分享')

    const [revokeCall] = fetchMock.mock.calls as FetchCall[]
    expect(requestUrl(revokeCall)).toBe(`${API_BASE}/api/shares/share%2F1`)
    expect(revokeCall[1]?.method).toBe('DELETE')
  })
})

describe('RemoteStore API tokens', () => {
  let values: Map<string, string>
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    values = new Map([[TOKEN_KEY, 'session-token']])
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    })
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function createStore() {
    const { createRemoteStore } = await import('./remote')
    return createRemoteStore(API_BASE)
  }

  it('creates a token and keeps the one-time value on the minted result', async () => {
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      if (requestUrl(args) === `${API_BASE}/api/tokens` && args[1]?.method !== 'DELETE') {
        expect(requestHeaders(args).get('authorization')).toBe('Bearer session-token')
        expect(jsonRequestBody(args)).toEqual({ name: '我的智能体', scopes: ['shares', 'images'] })
        return jsonResponse({
          id: 'token-1',
          name: '我的智能体',
          scopes: ['shares', 'images'],
          createdAt: 100,
          lastUsedAt: null,
          token: 'dc_minted-value',
        })
      }
      throw new Error(`Unexpected request: ${requestUrl(args)}`)
    })
    const store = await createStore()

    const minted = await store.tokens.create('user-1', '我的智能体', ['shares', 'images'])

    expect(minted).toEqual({
      id: 'token-1',
      name: '我的智能体',
      scopes: ['shares', 'images'],
      createdAt: 100,
      lastUsedAt: null,
      token: 'dc_minted-value',
    })
  })

  it('lists tokens as envelopes without values', async () => {
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      if (requestUrl(args) === `${API_BASE}/api/tokens`) {
        return jsonResponse([
          { id: 'token-1', name: '我的智能体', scopes: ['shares'], createdAt: 100, lastUsedAt: 900 },
          { id: 'token-2', name: 'nightly 脚本', scopes: ['decks', 'shares'], createdAt: 50, lastUsedAt: null },
        ])
      }
      throw new Error(`Unexpected request: ${requestUrl(args)}`)
    })
    const store = await createStore()

    const tokens = await store.tokens.list('user-1')

    expect(tokens).toEqual([
      { id: 'token-1', name: '我的智能体', scopes: ['shares'], createdAt: 100, lastUsedAt: 900 },
      { id: 'token-2', name: 'nightly 脚本', scopes: ['decks', 'shares'], createdAt: 50, lastUsedAt: null },
    ])
    // A list request never carries a body, and the response holds no values.
    for (const call of fetchMock.mock.calls as FetchCall[]) {
      expect(call[1]?.body).toBeUndefined()
    }
  })

  it('drops malformed token rows from the list', async () => {
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      if (requestUrl(args) === `${API_BASE}/api/tokens`) {
        return jsonResponse([
          { id: 'token-1', name: '好的', scopes: ['shares'], createdAt: 100, lastUsedAt: null },
          { name: '没有 id' },
          'not-an-object',
        ])
      }
      throw new Error(`Unexpected request: ${requestUrl(args)}`)
    })
    const store = await createStore()

    const tokens = await store.tokens.list('user-1')

    expect(tokens).toEqual([
      { id: 'token-1', name: '好的', scopes: ['shares'], createdAt: 100, lastUsedAt: null },
    ])
  })

  it('rejects a mint response without a value', async () => {
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      if (requestUrl(args) === `${API_BASE}/api/tokens` && args[1]?.method !== 'DELETE') {
        return jsonResponse({ id: 'token-1', name: 'x', scopes: ['shares'], createdAt: 100, lastUsedAt: null })
      }
      throw new Error(`Unexpected request: ${requestUrl(args)}`)
    })
    const store = await createStore()

    await expect(store.tokens.create('user-1', 'x', ['shares'])).rejects.toThrow('服务器返回了无效令牌')
  })

  it('revokes by id with an encoded path', async () => {
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      if (requestUrl(args) === `${API_BASE}/api/tokens/token%2F1`) {
        expect(args[1]?.method).toBe('DELETE')
        return jsonResponse({ ok: true })
      }
      throw new Error(`Unexpected request: ${requestUrl(args)}`)
    })
    const store = await createStore()

    await expect(store.tokens.revoke('user-1', 'token/1')).resolves.toBeUndefined()
  })
})

describe('RemoteStore draft version history', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'session-token'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    } as unknown as Storage)
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function createStore() {
    const { createRemoteStore } = await import('./remote')
    return createRemoteStore(API_BASE)
  }

  it('lists versions as metadata and reads one back with its document', async () => {
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      if (requestUrl(args) === `${API_BASE}/api/drafts/draft-1/versions`) {
        return jsonResponse([
          { id: 'v-2', title: '第二版', mode: 'markdown-card', schemaVersion: 2, createdAt: 200 },
          'broken',
          { id: 'v-1', title: '第一版', mode: 'markdown-card', schemaVersion: 2, createdAt: 100 },
        ])
      }
      if (requestUrl(args) === `${API_BASE}/api/drafts/draft-1/versions/v-1`) {
        return jsonResponse({ id: 'v-1', title: '第一版', mode: 'markdown-card', schemaVersion: 2, createdAt: 100, document: { source: '# 第一版' } })
      }
      throw new Error(`Unexpected request: ${requestUrl(args)}`)
    })
    const store = await createStore()

    await expect(store.drafts.listVersions('user-1', 'draft-1')).resolves.toEqual([
      { id: 'v-2', title: '第二版', mode: 'markdown-card', schemaVersion: 2, createdAt: 200 },
      { id: 'v-1', title: '第一版', mode: 'markdown-card', schemaVersion: 2, createdAt: 100 },
    ])
    await expect(store.drafts.getVersion('user-1', 'draft-1', 'v-1')).resolves.toEqual({
      id: 'v-1', title: '第一版', mode: 'markdown-card', schemaVersion: 2, createdAt: 100,
      document: { source: '# 第一版' },
    })
  })

  it('restores a version and normalizes the returned draft', async () => {
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      if (requestUrl(args) === `${API_BASE}/api/drafts/draft-1/versions/v-1/restore`) {
        expect(args[1]?.method).toBe('POST')
        return jsonResponse({
          id: 'draft-1', title: '第一版', mode: 'markdown-card', schemaVersion: 2,
          document: {
            source: '# 第一版', platformId: 'rednote', themeId: 'light',
            fontFamily: 'PingFang SC', radius: 18, profile: { nickname: 'a', handle: 'b', location: '', avatarColor: '#111', avatarImage: null, verified: false, headerFirstPageOnly: false },
            images: {},
          },
          updatedAt: 300,
        })
      }
      throw new Error(`Unexpected request: ${requestUrl(args)}`)
    })
    const store = await createStore()

    const restored = await store.drafts.restoreVersion('user-1', 'draft-1', 'v-1')
    expect(restored.id).toBe('draft-1')
    expect(restored.mode).toBe('markdown-card')
    expect((restored as { document: { source: string } }).document.source).toBe('# 第一版')
  })

  it('lists the trash and restores or purges entries by id', async () => {
    const calls: Array<{ url: string, method: string }> = []
    fetchMock.mockImplementation(async (...args: FetchCall) => {
      const url = requestUrl(args)
      calls.push({ url, method: args[1]?.method ?? 'GET' })
      if (url === `${API_BASE}/api/drafts/trash`) {
        return jsonResponse([
          { id: 'd-2', title: '新的', mode: 'freeform-slide', schemaVersion: 2, updatedAt: 400, deletedAt: 2_000 },
          'broken',
          { id: 'd-1', title: '旧的', mode: 'markdown-card', schemaVersion: 2, updatedAt: 100, deletedAt: 1_000 },
        ])
      }
      if (url === `${API_BASE}/api/drafts/trash/d-1/restore`) return jsonResponse({ ok: true, id: 'd-1' })
      if (url === `${API_BASE}/api/drafts/trash/d-2`) return jsonResponse({ ok: true })
      throw new Error(`Unexpected request: ${url}`)
    })
    const store = await createStore()

    await expect(store.drafts.listTrash('user-1')).resolves.toEqual([
      { id: 'd-2', title: '新的', mode: 'freeform-slide', schemaVersion: 2, updatedAt: 400, deletedAt: 2_000 },
      { id: 'd-1', title: '旧的', mode: 'markdown-card', schemaVersion: 2, updatedAt: 100, deletedAt: 1_000 },
    ])
    await store.drafts.restore('user-1', 'd-1')
    await store.drafts.purge('user-1', 'd-2')
    expect(calls.filter((call) => call.url.includes('/trash'))).toEqual([
      { url: `${API_BASE}/api/drafts/trash`, method: 'GET' },
      { url: `${API_BASE}/api/drafts/trash/d-1/restore`, method: 'POST' },
      { url: `${API_BASE}/api/drafts/trash/d-2`, method: 'DELETE' },
    ])
  })
})

describe('RemoteStore stock library', () => {
  let values: Map<string, string>
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    values = new Map()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    })
    values.set(TOKEN_KEY, 'stock-token')
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function createStore() {
    const { createRemoteStore } = await import('./remote')
    return createRemoteStore(API_BASE)
  }

  it('loads the source list with the session token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      sources: [
        { id: 'pixabay', label: 'Pixabay', available: false },
        { id: 'openverse', label: 'Openverse', available: true },
      ],
      preferred: 'openverse',
    }))
    const store = await createStore()

    const info = await store.stock!.sources()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestUrl(fetchMock.mock.calls[0] as FetchCall)).toBe(`${API_BASE}/api/stock/sources`)
    expect(requestHeaders(fetchMock.mock.calls[0] as FetchCall).get('authorization')).toBe('Bearer stock-token')
    expect(info.preferred).toBe('openverse')
    expect(info.sources).toEqual([
      { id: 'pixabay', label: 'Pixabay', available: false },
      { id: 'openverse', label: 'Openverse', available: true },
    ])
  })

  it('rejects malformed source lists', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ sources: 'nope' }))
    const store = await createStore()

    await expectApiError(store.stock!.sources(), 200, '服务器返回了无效的图库响应')
  })

  it('searches with encoded query params and drops malformed hits', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      source: 'openverse',
      page: 2,
      total: 42,
      results: [
        { id: 'a-1', thumb: 'https://t/1.jpg', width: 800, height: 600, author: 'Ann' },
        { id: '', thumb: 'https://t/2.jpg' },
        { id: 'a-3', thumb: 'https://t/3.jpg', width: 'wide', height: 0 },
        'not-a-hit',
      ],
    }))
    const store = await createStore()

    const page = await store.stock!.search('雪山 日出', 'openverse', 2)

    const url = new URL(requestUrl(fetchMock.mock.calls[0] as FetchCall))
    expect(url.pathname).toBe('/api/stock/search')
    expect(url.searchParams.get('q')).toBe('雪山 日出')
    expect(url.searchParams.get('source')).toBe('openverse')
    expect(url.searchParams.get('page')).toBe('2')
    expect(page).toEqual({
      source: 'openverse',
      page: 2,
      total: 42,
      results: [
        { id: 'a-1', thumb: 'https://t/1.jpg', width: 800, height: 600, author: 'Ann' },
        { id: 'a-3', thumb: 'https://t/3.jpg', width: 0, height: 0, author: '' },
      ],
    })
  })

  it('omits the page param for the first page and passes errors through', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: '图库源 Openverse 未配置访问密钥' }, 400))
    const store = await createStore()

    await expectApiError(store.stock!.search('x'), 400, '图库源 Openverse 未配置访问密钥')
    const url = new URL(requestUrl(fetchMock.mock.calls[0] as FetchCall))
    expect(url.searchParams.has('page')).toBe(false)
    expect(url.searchParams.has('source')).toBe(false)
  })

  it('imports by source and id and resolves the upload url against the base', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      ref: 'img:abc123',
      url: '/uploads/abc123.jpg',
      alt: 'Unsplash · Ann',
    }))
    const store = await createStore()

    const imported = await store.stock!.importImage('unsplash', 'abc-123')

    const [callUrl, init] = fetchMock.mock.calls[0]
    expect(callUrl).toBe(`${API_BASE}/api/stock/import`)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ source: 'unsplash', id: 'abc-123' })
    expect(imported).toEqual({
      ref: 'img:abc123',
      url: `${API_BASE}/uploads/abc123.jpg`,
      alt: 'Unsplash · Ann',
    })
  })

  it('rejects imports without a usable ref or url', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ref: 'img:abc123', alt: 'x' }, 200))
    const store = await createStore()

    await expectApiError(store.stock!.importImage('openverse', 'a-1'), 200, '服务器返回了无效的图库响应')
  })

  it('has no stock library on the local backend', async () => {
    const { createLocalStore } = await import('./local')
    const store = createLocalStore()
    expect(store.stock).toBeNull()
    expect(store.remote).toBe(false)
  })
})
