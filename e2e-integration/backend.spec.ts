import { test, expect } from '@playwright/test'
import { installOfflineFontRoutes } from '../e2e/offlineFonts'

/**
 * Backend integration test — the REAL thing end to end.
 *
 * Unlike the unit/e2e suites (which run the app in its default LOCAL mode,
 * backed by localStorage), this suite boots:
 *   - the real Fastify + SQLite server (see playwright.integration.config.ts)
 *   - the frontend dev server built with VITE_API_BASE pointing at that server
 *
 * so the app runs in REMOTE mode and every draft/auth call is a real HTTP
 * request crossing origins (frontend :5273 -> backend :3100). That exercises
 * the parts local mode can't: JWT round-trips, CORS, server-side persistence,
 * and the remote store implementation itself.
 *
 * The decisive assertions aren't just "the UI shows the draft" — they prove the
 * data lives on the SERVER, not in the browser:
 *   - localStorage never gains a `slicer.drafts.*` key (that's the local backend)
 *   - after a full reload the draft is still there (came back from the server)
 *   - a second browser context (fresh storage) sees the same account's drafts
 */

declare global {
  interface Window {
    __cmView?: {
      state: { doc: { toString(): string } }
      dispatch(spec: unknown): void
    }
  }
}

const uniqueName = () => `it-user-${Date.now()}-${Math.floor(Math.random() * 1e4)}`
const API_BASE = 'http://localhost:3100'
const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// The drafts toolbar button reads "草稿" or "草稿 · N" — match from the start so
// it never collides with the "保存草稿" (save) button.
const draftsButton = /^草稿/

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

async function register(page: import('@playwright/test').Page, username: string) {
  await page.getByTestId('account-login').click()
  await expect(page.locator('.form-note')).toContainText('跨设备同步')
  await expect(page.locator('.form-note')).not.toContainText('仅保存在此浏览器本地')
  await page.getByRole('button', { name: '注册' }).click()
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill('1234')
  const registerResponse = page.waitForResponse((response) => (
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/auth/register'
  ))
  await page.getByRole('button', { name: '创建账号' }).click()
  const payload = await (await registerResponse).json() as {
    user: { id: string; username: string; createdAt: number }
  }
  // Header flips to the logout (avatar) button once signed in.
  await expect(page.getByTestId('account-logout')).toBeVisible()
  return payload.user
}

function draftKeys(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('slicer.drafts.')),
  )
}

// Replace the editor's whole document via the exposed CodeMirror view (dev only).
// Driving `.cm-content` with keyboard.type is flaky here — the default sample
// text stays and the marker never lands — so set the doc directly, exactly like
// the IME e2e suite does.
async function setEditorDoc(page: import('@playwright/test').Page, text: string) {
  await page.waitForFunction(() => !!window.__cmView)
  await page.evaluate((t) => {
    const view = window.__cmView!
    const len = view.state.doc.toString().length
    view.dispatch({ changes: { from: 0, to: len, insert: t }, selection: { anchor: t.length } })
  }, text)
}

async function createRemoteMarkdownDraft(
  page: import('@playwright/test').Page,
  token: string,
  source: string,
) {
  const response = await page.request.post(`${API_BASE}/api/drafts`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      mode: 'markdown-card',
      document: {
        source,
        platformId: 'rednote',
        themeId: 'light',
        fontFamily: 'PingFang SC',
        profile: {
          nickname: 'Shinve',
          handle: 'Shinve',
          location: '',
          avatarColor: '#1c1c2e',
          avatarImage: null,
          verified: true,
          headerFirstPageOnly: false,
        },
        radius: 18,
      },
    },
  })
  expect(response.ok()).toBe(true)
  return response.json() as Promise<{ id: string }>
}

async function insertRemoteImageElementAndShapeFill(page: import('@playwright/test').Page) {
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'remote-image-element.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expect(page.locator('.freeform-image')).toHaveCount(1)

  await page.getByTestId('insert-shape').click()
  await page
    .getByRole('menu', { name: '形状' })
    .getByRole('menuitem', { name: '矩形', exact: true })
    .click()
  await page.locator('input.freeform-file').nth(1).setInputFiles({
    name: 'remote-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(1)
}

async function expectRemoteFreeformImagesDecoded(page: import('@playwright/test').Page) {
  await expect.poll(() => page.locator('.freeform-image').evaluate(async (node) => {
    const image = node as HTMLImageElement
    try {
      await image.decode()
      return image.naturalWidth > 0 && image.naturalHeight > 0
    } catch {
      return false
    }
  })).toBe(true)

  await expect.poll(() => page.getByTestId('freeform-shape-image-fill').evaluate(async (node) => {
    const background = getComputedStyle(node).backgroundImage
    const match = background.match(/^url\(["']?(.*?)["']?\)$/)
    if (!match) return false
    const image = new Image()
    image.src = match[1]
    try {
      await image.decode()
      return image.naturalWidth > 0 && image.naturalHeight > 0
    } catch {
      return false
    }
  })).toBe(true)
}

function collectPageErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function fulfillJsonError(
  route: import('@playwright/test').Route,
  status: number,
  error: string,
) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ error }),
  })
}

async function pasteMarkdownImage(page: import('@playwright/test').Page) {
  await page.locator('#workspace-panel-markdown .cm-content').evaluate((node, base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const file = new File([bytes], 'clipboard-image.png', { type: 'image/png' })
    const clipboardData = new DataTransfer()
    clipboardData.items.add(file)
    node.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData,
    }))
  }, TEST_PNG.toString('base64'))
}

test.describe('remote backend integration', () => {
  test('registers, saves a markdown draft to the server, and restores it after reload', async ({
    page,
  }) => {
    await page.goto('/')

    // A token from a previous run must not leak in; start signed-out.
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    const username = uniqueName()
    await register(page, username)

    // Put an identifiable H1 in the editor — its first line becomes the draft title.
    const marker = `服务器草稿 ${Date.now()}`
    await setEditorDoc(page, `# ${marker}`)

    // Save. In remote mode this POSTs to /api/drafts.
    await page.getByRole('button', { name: '保存草稿' }).click()
    // The editor pane footer shows "· 已保存" once the save resolves.
    await expect(page.getByText('已保存')).toBeVisible()

    // The draft list (opened from the toolbar) should show our new draft.
    await page.getByRole('button', { name: draftsButton }).click()
    await expect(page.getByText(marker).first()).toBeVisible()

    // DECISIVE: the draft must NOT be in localStorage — it lives on the server.
    expect(await draftKeys(page)).toHaveLength(0)

    // Full reload: the app re-fetches /api/auth/me (token persisted) and
    // /api/drafts. The draft must come back from the server.
    await page.reload()
    await expect(page.getByTestId('account-logout')).toBeVisible()
    await page.getByRole('button', { name: draftsButton }).click()
    await expect(page.getByText(marker).first()).toBeVisible()
  })

  test('uploads and restores remote freeform images', async ({ page }) => {
    const imagePosts: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/images') {
        imagePosts.push(request.url())
      }
    })

    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    await page.getByTestId('workspace-tab-freeform').click()

    await insertRemoteImageElementAndShapeFill(page)
    await expectRemoteFreeformImagesDecoded(page)
    await expect.poll(() => imagePosts.length).toBe(2)

    const imageSource = await page.locator('.freeform-image').getAttribute('src')
    expect(imageSource).toMatch(`${API_BASE}/uploads/`)
    const shapeBackground = await page.getByTestId('freeform-shape-image-fill').evaluate((node) => (
      getComputedStyle(node).backgroundImage
    ))
    expect(shapeBackground).toContain(`${API_BASE}/uploads/`)

    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')

    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()
    const response = await page.request.get(`${API_BASE}/api/drafts`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.ok()).toBe(true)
    const serializedDrafts = JSON.stringify(await response.json())
    expect(serializedDrafts).toContain('/uploads/')
    expect(serializedDrafts).not.toContain('data:image/')

    await page.reload()
    await expect(page.getByTestId('account-logout')).toBeVisible()
    await page.getByTestId('workspace-tab-freeform').click()
    await page.getByRole('button', { name: draftsButton }).click()
    await page.locator('.draft-item', { hasText: 'Page 1' }).click()
    await expectRemoteFreeformImagesDecoded(page)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出当前页', exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('slide-01.png')
  })

  test('a second browser context sees the same server drafts after login', async ({ browser }) => {
    // First context: register + save.
    const ctxA = await browser.newContext()
    await installOfflineFontRoutes(ctxA)
    const pageA = await ctxA.newPage()
    await pageA.goto('/')
    await pageA.evaluate(() => localStorage.clear())
    await pageA.reload()

    const username = uniqueName()
    await register(pageA, username)
    const marker = `跨设备 ${Date.now()}`
    await setEditorDoc(pageA, `# ${marker}`)
    await pageA.getByRole('button', { name: '保存草稿' }).click()
    await expect(pageA.getByText('已保存')).toBeVisible()
    await ctxA.close()

    // Second context: totally fresh storage (simulates another device). Logging
    // in with the same account must surface the draft saved from context A.
    const ctxB = await browser.newContext()
    await installOfflineFontRoutes(ctxB)
    const pageB = await ctxB.newPage()
    await pageB.goto('/')

    await pageB.getByTestId('account-login').click()
    // This account already exists — the modal opens on the 登录 tab by default,
    // so just fill the fields and click the submit button (.accent), scoped to
    // the modal footer to avoid matching the 登录 tab of the same name.
    await pageB.getByLabel('用户名').fill(username)
    await pageB.getByLabel('密码').fill('1234')
    await pageB.locator('.sheet-foot button.accent').click()
    await expect(pageB.getByTestId('account-logout')).toBeVisible()

    await pageB.getByRole('button', { name: draftsButton }).click()
    await expect(pageB.getByText(marker).first()).toBeVisible()
    expect(await draftKeys(pageB)).toHaveLength(0)
    await ctxB.close()
  })

  test('keeps the opened Markdown draft identity when an older save resolves late', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())

    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()
    const draftB = await createRemoteMarkdownDraft(page, token!, '# 草稿 B')

    await page.reload()
    await expect(page.getByTestId('account-logout')).toBeVisible()
    await expect(page.getByRole('button', { name: /^草稿 · 1$/ })).toBeVisible()

    let delayedSaveRoute: import('@playwright/test').Route | null = null
    let markSaveCaptured: () => void = () => {}
    const saveCaptured = new Promise<void>((resolve) => {
      markSaveCaptured = resolve
    })
    const postBodies: Array<Record<string, unknown>> = []
    await page.route(`${API_BASE}/api/drafts`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      const body = route.request().postDataJSON() as Record<string, unknown>
      postBodies.push(body)
      if (!delayedSaveRoute) {
        delayedSaveRoute = route
        markSaveCaptured()
        return
      }
      await route.continue()
    })

    const draftAMarker = `迟到保存 A ${Date.now()}`
    await setEditorDoc(page, `# ${draftAMarker}`)
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await saveCaptured

    await page.getByRole('button', { name: draftsButton }).click()
    await page.locator('.draft-item', { hasText: '草稿 B' }).click()
    await expect.poll(() => page.evaluate(() => window.__cmView?.state.doc.toString())).toBe('# 草稿 B')

    const delayedSaveResponse = page.waitForResponse((response) => {
      if (response.request().method() !== 'POST') return false
      if (new URL(response.url()).pathname !== '/api/drafts') return false
      return response.request().postData()?.includes(draftAMarker) ?? false
    })
    await delayedSaveRoute!.continue()
    await delayedSaveResponse
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))

    await setEditorDoc(page, '# 草稿 B 更新后')
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect.poll(() => postBodies.length).toBe(2)
    expect(postBodies[1].id).toBe(draftB.id)
  })

  test('keeps a newly opened Markdown draft active when an older delete resolves late', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())

    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()
    const draftA = await createRemoteMarkdownDraft(page, token!, '# 删除中的草稿 A')
    const draftB = await createRemoteMarkdownDraft(page, token!, '# 保留的草稿 B')

    await page.reload()
    await expect(page.getByTestId('account-logout')).toBeVisible()
    await expect(page.getByRole('button', { name: /^草稿 · 2$/ })).toBeVisible()
    await page.getByRole('button', { name: draftsButton }).click()
    await page.locator('.draft-item', { hasText: '删除中的草稿 A' }).click()

    let delayedDeleteRoute: import('@playwright/test').Route | null = null
    let markDeleteCaptured: () => void = () => {}
    const deleteCaptured = new Promise<void>((resolve) => {
      markDeleteCaptured = resolve
    })
    await page.route(`${API_BASE}/api/drafts/${draftA.id}`, async (route) => {
      delayedDeleteRoute = route
      markDeleteCaptured()
    })

    await page.getByRole('button', { name: draftsButton }).click()
    await page
      .locator('.draft-item', { hasText: '删除中的草稿 A' })
      .getByRole('button', { name: '删除草稿' })
      .click()
    await deleteCaptured
    await page.locator('.draft-item', { hasText: '保留的草稿 B' }).click()
    await expect.poll(() => page.evaluate(() => window.__cmView?.state.doc.toString()))
      .toBe('# 保留的草稿 B')

    const delayedDeleteResponse = page.waitForResponse((response) => (
      response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname === `/api/drafts/${draftA.id}`
    ))
    await delayedDeleteRoute!.continue()
    await delayedDeleteResponse
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))

    const nextSaveRequest = page.waitForRequest((request) => (
      request.method() === 'POST' && new URL(request.url()).pathname === '/api/drafts'
    ))
    await setEditorDoc(page, '# 保留的草稿 B 更新后')
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    const saveBody = (await nextSaveRequest).postDataJSON() as Record<string, unknown>
    expect(saveBody.id).toBe(draftB.id)
  })

  test('serializes Markdown saves and keeps the saved marker tied to the full document', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()
    await createRemoteMarkdownDraft(page, token!, '# 串行保存草稿')

    await page.reload()
    await expect(page.getByTestId('account-logout')).toBeVisible()
    await page.getByRole('button', { name: /^草稿 · 1$/ }).click()
    await page.locator('.draft-item', { hasText: '串行保存草稿' }).click()

    let delayedSaveRoute: import('@playwright/test').Route | null = null
    let markSaveCaptured: () => void = () => {}
    const saveCaptured = new Promise<void>((resolve) => {
      markSaveCaptured = resolve
    })
    const postBodies: Array<Record<string, unknown>> = []
    await page.route(`${API_BASE}/api/drafts`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      postBodies.push(route.request().postDataJSON() as Record<string, unknown>)
      if (!delayedSaveRoute) {
        delayedSaveRoute = route
        markSaveCaptured()
        return
      }
      await route.continue()
    })

    await setEditorDoc(page, '# 串行保存 v1')
    const saveButton = page.getByTestId('markdown-toolbar').locator('button').filter({ hasText: /保存/ })
    await saveButton.click()
    await saveCaptured
    await expect(saveButton).toBeDisabled()
    await saveButton.evaluate((button) => (button as HTMLButtonElement).click())
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    expect(postBodies).toHaveLength(1)

    await page.locator('.sel[title="主题"] .sel-trigger').click()
    await page.getByRole('option', { name: '暖米色' }).click()
    const delayedResponse = page.waitForResponse((response) => (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/drafts'
    ))
    await delayedSaveRoute!.continue()
    await delayedResponse
    await expect(saveButton).toBeEnabled()
    await expect(page.locator('.pane-editor .pane-sub')).not.toContainText('已保存')

    await saveButton.click()
    await expect.poll(() => postBodies.length).toBe(2)
    const secondDocument = postBodies[1].document as Record<string, unknown>
    expect(secondDocument.themeId).toBe('warm')
    const markdownMeta = page.locator('.pane-editor .pane-sub')
    await expect(markdownMeta).toContainText('已保存')
    await page.locator('.sel[title="主题"] .sel-trigger').click()
    await page.getByRole('option', { name: '简约白' }).click()
    await expect(markdownMeta).not.toContainText('已保存')
  })

  test('ignores stale freeform draft lists that resolve after a newer refresh', async ({ page }) => {
    const staleListRoutes: import('@playwright/test').Route[] = []
    await page.route(`${API_BASE}/api/drafts`, async (route) => {
      if (route.request().method() === 'GET' && staleListRoutes.length < 2) {
        staleListRoutes.push(route)
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    await expect.poll(() => staleListRoutes.length).toBe(2)
    await page.getByTestId('workspace-tab-freeform').click()

    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')
    await expect(page.getByRole('button', { name: /^草稿 · 1$/ })).toBeVisible()

    await Promise.all(staleListRoutes.map((route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    })))
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))

    await expect(page.getByRole('button', { name: /^草稿 · 1$/ })).toBeVisible()
  })

  test('ignores a freeform save failure after another draft is opened', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    await page.getByTestId('workspace-tab-freeform').click()
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')

    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()
    const listResponse = await page.request.get(`${API_BASE}/api/drafts`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const [draftA] = await listResponse.json() as Array<{
      id: string
      title: string
      document: { slides: Array<{ name: string }> }
    }>
    const documentB = JSON.parse(JSON.stringify(draftA.document)) as typeof draftA.document
    documentB.slides[0].name = '另一个自由编辑草稿 B'
    const createBResponse = await page.request.post(`${API_BASE}/api/drafts`, {
      headers: { authorization: `Bearer ${token}` },
      data: { mode: 'freeform-slide', document: documentB },
    })
    expect(createBResponse.ok()).toBe(true)

    await page.reload()
    await expect(page.getByTestId('account-logout')).toBeVisible()
    await page.getByTestId('workspace-tab-freeform').click()
    await expect(page.getByRole('button', { name: /^草稿 · 2$/ })).toBeVisible()
    await page.getByRole('button', { name: draftsButton }).click()
    await page.locator('.draft-item', { hasText: draftA.title }).click()

    let delayedSaveRoute: import('@playwright/test').Route | null = null
    let markSaveCaptured: () => void = () => {}
    const saveCaptured = new Promise<void>((resolve) => {
      markSaveCaptured = resolve
    })
    await page.route(`${API_BASE}/api/drafts`, async (route) => {
      if (route.request().method() === 'POST' && !delayedSaveRoute) {
        delayedSaveRoute = route
        markSaveCaptured()
        return
      }
      await route.continue()
    })

    await page.getByTestId('insert-text').click()
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await saveCaptured
    await page.getByRole('button', { name: draftsButton }).click()
    await page.locator('.draft-item', { hasText: '另一个自由编辑草稿 B' }).click()

    await fulfillJsonError(delayedSaveRoute!, 500, '测试：迟到的保存失败')
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    await expect(page.locator('#workspace-panel-freeform').getByRole('alert')).toHaveCount(0)
  })

  test('serializes freeform saves so a newer document cannot be overwritten by an older request', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    await page.getByTestId('workspace-tab-freeform').click()
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')

    let delayedSaveRoute: import('@playwright/test').Route | null = null
    let markSaveCaptured: () => void = () => {}
    const saveCaptured = new Promise<void>((resolve) => {
      markSaveCaptured = resolve
    })
    const postBodies: Array<Record<string, unknown>> = []
    await page.route(`${API_BASE}/api/drafts`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      postBodies.push(route.request().postDataJSON() as Record<string, unknown>)
      if (!delayedSaveRoute) {
        delayedSaveRoute = route
        markSaveCaptured()
        return
      }
      await route.continue()
    })

    await page.getByTestId('insert-text').click()
    const saveButton = page.getByTestId('freeform-toolbar').locator('button').filter({ hasText: /保存/ })
    await saveButton.click()
    await saveCaptured
    await expect(saveButton).toBeDisabled()
    await saveButton.evaluate((button) => (button as HTMLButtonElement).click())
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    expect(postBodies).toHaveLength(1)

    await page.getByTestId('insert-shape').click()
    await page.getByRole('menuitem', { name: '矩形', exact: true }).click()
    const delayedResponse = page.waitForResponse((response) => (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/drafts'
    ))
    await delayedSaveRoute!.continue()
    await delayedResponse
    await expect(saveButton).toBeEnabled()
    await expect(page.getByTestId('freeform-slide-meta')).not.toContainText('已保存')

    await saveButton.click()
    await expect.poll(() => postBodies.length).toBe(2)
    const secondDocument = postBodies[1].document as {
      slides: Array<{ elements: unknown[] }>
    }
    expect(secondDocument.slides[0].elements).toHaveLength(2)
  })

  test('clears the saved marker after deleting the active freeform draft', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    await page.getByTestId('workspace-tab-freeform').click()

    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    const slideMeta = page.getByTestId('freeform-slide-meta')
    await expect(slideMeta).toContainText('已保存')
    await page.getByRole('button', { name: /^草稿 · 1$/ }).click()
    await page
      .locator('.draft-item', { hasText: 'Page 1' })
      .getByRole('button', { name: '删除草稿' })
      .click()

    await expect(slideMeta).not.toContainText('已保存')
    await expect(page.getByRole('button', { name: /^草稿$/ })).toBeVisible()
  })

  test('retains active images and blocks a new upload when pre-retain fails', async ({ page }) => {
    const pageErrors = collectPageErrors(page)
    const imagePosts: string[] = []
    const retainRequests: string[] = []
    const deleteRequests: string[] = []
    let failRetain = false

    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (request.method() === 'POST' && path === '/api/images') imagePosts.push(request.url())
      if (request.method() === 'DELETE' && path.startsWith('/api/drafts/')) {
        deleteRequests.push(request.url())
      }
    })
    await page.route(`${API_BASE}/api/images/retain`, async (route) => {
      retainRequests.push(route.request().url())
      if (failRetain) {
        await fulfillJsonError(route, 500, '测试：图片续租失败')
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    await page.getByTestId('workspace-tab-freeform').click()

    const firstRetainResponse = page.waitForResponse((response) => (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/images/retain'
    ))
    await page.locator('input.freeform-file').first().setInputFiles({
      name: 'leased-image.png',
      mimeType: 'image/png',
      buffer: TEST_PNG,
    })
    await expect(page.locator('.freeform-image')).toHaveCount(1)
    expect((await firstRetainResponse).ok()).toBe(true)
    expect(imagePosts).toHaveLength(1)

    const retainsBeforeOnline = retainRequests.length
    const onlineRetainResponse = page.waitForResponse((response) => (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/images/retain'
    ))
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    expect((await onlineRetainResponse).ok()).toBe(true)
    expect(retainRequests.length).toBeGreaterThan(retainsBeforeOnline)

    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')
    await expect(page.getByRole('button', { name: /^草稿 · 1$/ })).toBeVisible()

    failRetain = true
    const imagePostsBeforeBlockedUpload = imagePosts.length
    await page.locator('input.freeform-file').first().setInputFiles({
      name: 'must-not-upload.png',
      mimeType: 'image/png',
      buffer: TEST_PNG,
    })

    const freeformPanel = page.locator('#workspace-panel-freeform')
    const freeformNotice = freeformPanel.getByRole('alert')
    await expect(freeformNotice).toContainText('测试：图片续租失败')
    const [noticeBox, toolbarBox] = await Promise.all([
      freeformNotice.boundingBox(),
      page.getByTestId('freeform-toolbar').boundingBox(),
    ])
    expect(noticeBox).not.toBeNull()
    expect(toolbarBox).not.toBeNull()
    expect(noticeBox!.y).toBeGreaterThanOrEqual(toolbarBox!.y + toolbarBox!.height + 4)
    expect(imagePosts).toHaveLength(imagePostsBeforeBlockedUpload)
    await expect(page.locator('.freeform-image')).toHaveCount(1)

    await freeformNotice.getByRole('button', { name: '关闭提示' }).click()
    await expect(freeformPanel.getByRole('alert')).toHaveCount(0)
    await page.getByRole('button', { name: draftsButton }).click()
    const savedDraft = page.locator('.draft-item', { hasText: 'Page 1' })
    const retainsBeforeDelete = retainRequests.length
    const deleteRetainResponse = page.waitForResponse((response) => (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/images/retain'
    ))
    await savedDraft.getByRole('button', { name: '删除草稿' }).click()
    expect((await deleteRetainResponse).status()).toBe(500)
    expect(retainRequests).toHaveLength(retainsBeforeDelete + 1)
    await expect(freeformNotice).toContainText('测试：图片续租失败')
    expect(deleteRequests).toHaveLength(0)
    await expect(savedDraft).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('shows recoverable remote errors for drafts and Markdown image paste', async ({ page }) => {
    const pageErrors = collectPageErrors(page)
    let draftFailure: 'list' | 'save' | 'delete' | null = 'list'
    let imageUploadFailure = false

    await page.route(`${API_BASE}/api/drafts**`, async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (draftFailure === 'list' && request.method() === 'GET' && path === '/api/drafts') {
        await fulfillJsonError(route, 500, '测试：草稿列表失败')
        return
      }
      if (draftFailure === 'save' && request.method() === 'POST' && path === '/api/drafts') {
        await fulfillJsonError(route, 500, '测试：草稿保存失败')
        return
      }
      if (draftFailure === 'delete' && request.method() === 'DELETE' && path.startsWith('/api/drafts/')) {
        await fulfillJsonError(route, 500, '测试：草稿删除失败')
        return
      }
      await route.continue()
    })
    await page.route(`${API_BASE}/api/images`, async (route) => {
      if (imageUploadFailure && route.request().method() === 'POST') {
        await fulfillJsonError(route, 500, '测试：Markdown 图片上传失败')
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())

    const markdownPanel = page.locator('#workspace-panel-markdown')
    const notice = markdownPanel.getByRole('alert')
    await expect(notice).toContainText('测试：草稿列表失败')

    await notice.getByRole('button', { name: /关闭/ }).click()
    draftFailure = 'save'
    const marker = `错误恢复草稿 ${Date.now()}`
    await setEditorDoc(page, `# ${marker}`)
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(notice).toContainText('测试：草稿保存失败')

    await notice.getByRole('button', { name: /关闭/ }).click()
    draftFailure = null
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(page.getByText('已保存')).toBeVisible()
    await page.getByRole('button', { name: draftsButton }).click()
    await expect(page.getByText(marker).first()).toBeVisible()

    draftFailure = 'delete'
    await page.locator('.draft-item', { hasText: marker }).getByRole('button', { name: '删除草稿' }).click()
    await expect(notice).toContainText('测试：草稿删除失败')
    await expect(page.locator('.draft-item', { hasText: marker })).toBeVisible()

    await page.getByRole('button', { name: '关闭', exact: true }).click()
    draftFailure = null
    imageUploadFailure = true
    await pasteMarkdownImage(page)
    await expect(notice).toContainText('测试：Markdown 图片上传失败')
    expect(pageErrors).toEqual([])
  })

  test('invalidates expired session after a recoverable auth check failure', async ({ page }) => {
    const pageErrors = collectPageErrors(page)

    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    const registeredUser = await register(page, uniqueName())
    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()

    let failMeRequests = true
    await page.route(`${API_BASE}/api/auth/me`, async (route) => {
      if (failMeRequests) {
        await route.abort('failed')
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: registeredUser }),
      })
    })
    await page.reload()

    expect(await page.evaluate(() => localStorage.getItem('slicer.token.v1'))).toBe(token)
    await expect(page.getByRole('alert')).toContainText('登录状态尚未确认')
    failMeRequests = false
    await page.getByRole('button', { name: /重试/ }).click()
    await expect(page.getByTestId('account-logout')).toBeVisible()

    await page.route(`${API_BASE}/api/drafts`, async (route) => {
      if (route.request().method() === 'POST') {
        await fulfillJsonError(route, 401, '测试：会话已过期')
        return
      }
      await route.continue()
    })
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()

    await expect(page.getByTestId('account-login')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(page.getByRole('alert')).toContainText('登录已过期')
    expect(await page.evaluate(() => localStorage.getItem('slicer.token.v1'))).toBeNull()
    expect(pageErrors).toEqual([])
  })
})
