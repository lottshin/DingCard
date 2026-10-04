import { test, expect } from '@playwright/test'
import { insertFreeformShape, insertFreeformText, startWithSettingsPanelOpen } from '../e2e/freeformTools'
import { installOfflineFontRoutes } from '../e2e/offlineFonts'
import { API_BASE } from './ports'

/**
 * Backend integration test — the REAL thing end to end.
 *
 * Unlike the unit/e2e suites (which run the app in its default LOCAL mode,
 * backed by localStorage), this suite boots:
 *   - the real Fastify + SQLite server (see playwright.integration.config.ts)
 *   - the frontend dev server built with VITE_API_BASE pointing at that server
 *
 * so the app runs in REMOTE mode and every draft/auth call is a real HTTP
 * request crossing origins (frontend :5273 -> backend :5310). That exercises
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
const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  await startWithSettingsPanelOpen(page)
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
  // The top bar swaps 登录 for the account (avatar) menu once signed in.
  await expect(page.getByTestId('account-menu')).toBeVisible()
  return payload.user
}

async function signIn(page: import('@playwright/test').Page, username: string) {
  await page.getByTestId('account-login').click()
  // The account already exists — the modal opens on the 登录 tab by default,
  // so fill the fields and click the submit button (.accent) in the modal footer.
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill('1234')
  await page.locator('.sheet-foot button.accent').click()
  await expect(page.getByTestId('account-menu')).toBeVisible()
}

async function expectSaved(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
}

async function serverDrafts(page: import('@playwright/test').Page) {
  const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
  const response = await page.request.get(`${API_BASE}/api/drafts`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(response.ok()).toBe(true)
  return response.json() as Promise<Array<{ id: string; title: string; mode: string }>>
}

/** Open a server project by (part of) its title, the way a project card does. */
async function openServerDraft(page: import('@playwright/test').Page, title: string) {
  const draft = (await serverDrafts(page)).find((candidate) => candidate.title.includes(title))
  if (!draft) throw new Error(`no server project titled ${title}`)
  const system = draft.mode === 'markdown-card' ? 'md' : 'canvas'
  await page.goto(`/#/edit/${system}/${encodeURIComponent(draft.id)}`)
  await expect(page.getByTestId('editor-title')).toHaveText(draft.title)
  return draft
}

/** The workbench list of the signed-in user's projects. */
async function openProjectsPage(page: import('@playwright/test').Page) {
  await page.goto('/#/projects')
  await expect(page.getByRole('heading', { level: 1, name: '我的项目' })).toBeVisible()
}

async function openExportMenu(page: import('@playwright/test').Page) {
  const panel = page.getByTestId('freeform-export-options')
  if (!(await panel.isVisible())) await page.getByTestId('freeform-export').click()
  await expect(panel).toBeVisible()
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

  await insertFreeformShape(page, '矩形')
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

  await expect.poll(() => page.getByTestId('freeform-shape-image-fill')
    .locator('[data-framed-image-content="true"]')
    .evaluate(async (node) => {
    const image = node as HTMLImageElement
    try {
      await image.decode()
      return image.naturalWidth > 0 && image.naturalHeight > 0
    } catch {
      return false
    }
  })).toBe(true)
}

async function readCropOverlayDraft(page: import('@playwright/test').Page) {
  return page.getByTestId('freeform-image-crop-overlay').evaluate((overlay) => {
    const readBounds = (prefix: 'Frame' | 'Image') => {
      const read = (edge: 'Left' | 'Top' | 'Right' | 'Bottom') => {
        const value = (overlay as HTMLElement).dataset[`crop${prefix}${edge}`]
        if (value === undefined) throw new Error(`crop ${prefix} ${edge} missing`)
        return Number(value)
      }
      return {
        left: read('Left'),
        top: read('Top'),
        right: read('Right'),
        bottom: read('Bottom'),
      }
    }
    return { frame: readBounds('Frame'), image: readBounds('Image') }
  })
}

async function dispatchCropPointerGesture(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
  pointerId: number,
  delta: { x: number; y: number },
) {
  const box = await locator.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  const end = { x: start.x + delta.x, y: start.y + delta.y }
  await locator.dispatchEvent('pointerdown', {
    pointerId,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ id, point }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: id,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: 1,
      clientX: point.x,
      clientY: point.y,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: id,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: point.x,
      clientY: point.y,
    }))
  }, { id: pointerId, point: end })
}

async function uploadManagedImage(
  page: import('@playwright/test').Page,
  token: string,
  name: string,
) {
  const response = await page.request.post(`${API_BASE}/api/images`, {
    headers: { authorization: `Bearer ${token}` },
    multipart: {
      file: {
        name,
        mimeType: 'image/png',
        buffer: TEST_PNG,
      },
    },
  })
  expect(response.ok()).toBe(true)
  return response.json() as Promise<{ ref: string; url: string }>
}

function remoteNestedScene(imageUrl: string, shapeUrl: string) {
  return {
    documentVersion: 3 as const,
    activeSlideId: 'remote-slide',
    slides: [{
      id: 'remote-slide',
      name: 'Nested remote scene',
      width: 800,
      height: 600,
      background: { type: 'solid' as const, color: '#ffffff' },
      nodes: [{
        id: 'remote-hidden-group',
        name: 'Remote hidden group',
        locked: false,
        hidden: true,
        type: 'group' as const,
        x: 380,
        y: 280,
        rotation: 18,
        scale: 1.25,
        children: [{
          id: 'remote-image',
          name: 'Remote nested image',
          locked: false,
          hidden: false,
          type: 'image' as const,
          x: -180,
          y: -90,
          width: 160,
          height: 120,
          rotation: -8,
          scale: 0.9,
          src: imageUrl,
          alt: 'Remote nested image',
          fit: 'cover' as const,
        }, {
          id: 'remote-shape',
          name: 'Remote locked shape',
          locked: true,
          hidden: false,
          type: 'shape' as const,
          x: 20,
          y: -80,
          width: 180,
          height: 140,
          rotation: 12,
          scale: 1.1,
          shape: 'rect' as const,
          fill: { type: 'image' as const, src: shapeUrl, fit: 'cover' as const },
          stroke: '#111827',
          strokeWidth: 3,
        }],
      }],
    }],
  }
}

function remoteAuthorityScene(prefix: string, slideName: string) {
  return {
    documentVersion: 3 as const,
    activeSlideId: `${prefix}-slide`,
    slides: [{
      id: `${prefix}-slide`,
      name: slideName,
      width: 800,
      height: 600,
      background: { type: 'solid' as const, color: '#ffffff' },
      nodes: [{
        id: `${prefix}-outer`,
        name: `${prefix} outer`,
        locked: false,
        hidden: false,
        type: 'group' as const,
        x: 260,
        y: 180,
        rotation: 20,
        scale: 1.2,
        children: [{
          id: `${prefix}-leaf`,
          name: `${prefix} leaf`,
          locked: false,
          hidden: false,
          type: 'shape' as const,
          x: -80,
          y: -50,
          width: 180,
          height: 120,
          rotation: -10,
          scale: 0.9,
          shape: 'rect' as const,
          fill: { type: 'solid' as const, color: '#22c55e' },
          stroke: '#166534',
          strokeWidth: 2,
        }],
      }],
    }],
  }
}

async function createRemoteFreeformDraft(
  page: import('@playwright/test').Page,
  token: string,
  document: ReturnType<typeof remoteAuthorityScene>,
) {
  const response = await page.request.post(`${API_BASE}/api/drafts`, {
    headers: { authorization: `Bearer ${token}` },
    data: { mode: 'freeform-slide', document },
  })
  expect(response.ok()).toBe(true)
  return response.json() as Promise<{ id: string; title: string }>
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
    await page.goto('/#/edit')

    // A token from a previous run must not leak in; start signed-out.
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    const username = uniqueName()
    await register(page, username)

    // Put an identifiable H1 in the editor — its first line becomes the draft title.
    const marker = `服务器草稿 ${Date.now()}`
    await setEditorDoc(page, `# ${marker}`)

    // Autosave. In remote mode this POSTs to /api/drafts.
    await expectSaved(page)

    // The workbench's 我的项目 lists the new project.
    await openProjectsPage(page)
    await expect(page.getByTestId('project-card').filter({ hasText: marker })).toBeVisible()

    // DECISIVE: the draft must NOT be in localStorage — it lives on the server.
    expect(await draftKeys(page)).toHaveLength(0)

    // Full reload: the app re-fetches /api/auth/me (token persisted) and
    // /api/drafts. The project must come back from the server.
    await page.reload()
    await expect(page.getByTestId('project-card').filter({ hasText: marker })).toBeVisible()
    await page.goto('/#/edit/md')
    await expect(page.getByTestId('editor-title')).toHaveText(marker)
    await expectSaved(page)
  })

  test('uploads and restores remote freeform images', async ({ page }) => {
    const imagePosts: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/images') {
        imagePosts.push(request.url())
      }
    })

    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    await page.goto('/#/edit/canvas')

    await insertRemoteImageElementAndShapeFill(page)
    await expectRemoteFreeformImagesDecoded(page)
    await expect.poll(() => imagePosts.length).toBe(2)

    const imageSource = await page.locator('.freeform-image').getAttribute('src')
    expect(imageSource).toMatch(`${API_BASE}/uploads/`)
    const shapeSource = await page.getByTestId('freeform-shape-image-fill')
      .locator('[data-framed-image-content="true"]')
      .getAttribute('src')
    expect(shapeSource).toContain(`${API_BASE}/uploads/`)

    await expectSaved(page)

    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()
    const response = await page.request.get(`${API_BASE}/api/drafts`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.ok()).toBe(true)
    const serializedDrafts = JSON.stringify(await response.json())
    expect(serializedDrafts).toContain('/uploads/')
    expect(serializedDrafts).not.toContain('data:image/')

    // Reloading the editor reopens the project from the server.
    await page.reload()
    await expect(page.getByTestId('account-menu')).toBeVisible()
    await expectSaved(page)
    await expectRemoteFreeformImagesDecoded(page)

    await openExportMenu(page)
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('freeform-primary-export').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('slide-01.png')
  })

  test('shares the deck as a link with a QR code, then revokes it', async ({ page }) => {
    const pageErrors = collectPageErrors(page)
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    await page.goto('/#/edit/canvas')

    await openExportMenu(page)
    await page.getByTestId('freeform-export-share').click()

    // The share dialog carries the QR code and the absolute page link.
    const dialog = page.getByTestId('freeform-share-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('share-qr')).toHaveAttribute('src', /^data:image\/png;base64,/)
    const link = await page.getByTestId('share-link-input').inputValue()
    expect(link).toMatch(/\/share\/[A-Za-z0-9_-]+$/)

    // The public page renders the deck's exported picture, no account needed.
    const shared = await page.request.get(link)
    expect(shared.status()).toBe(200)
    const html = await shared.text()
    expect(html).toContain('长按图片保存到相册')
    expect(html).toMatch(/<img src="[^"]*\/uploads\//)

    // The share shows up in the owner's list, and revoking closes the page.
    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    const list = await page.request.get(`${API_BASE}/api/shares`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(await list.json()).toHaveLength(1)

    await page.getByTestId('share-revoke').click()
    await expect(dialog).toHaveCount(0)
    await expect((await page.request.get(link)).status()).toBe(404)
    expect(pageErrors).toEqual([])
  })

  test('round-trips a nested v3 scene and preserves hidden image references through GC', async ({
    browser,
    page,
  }) => {
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    const username = uniqueName()
    await register(page, username)
    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()

    const image = await uploadManagedImage(page, token!, 'nested-image.png')
    const shape = await uploadManagedImage(page, token!, 'nested-shape.png')
    const orphan = await uploadManagedImage(page, token!, 'expired-orphan.png')
    const document = remoteNestedScene(
      `${API_BASE}${image.url}`,
      `${API_BASE}${shape.url}`,
    )
    const saveResponse = await page.request.post(`${API_BASE}/api/drafts`, {
      headers: { authorization: `Bearer ${token}` },
      data: { mode: 'freeform-slide', document },
    })
    expect(saveResponse.ok()).toBe(true)

    await page.waitForTimeout(1_300)
    const trigger = await uploadManagedImage(page, token!, 'gc-trigger.png')
    for (const url of [image.url, shape.url, trigger.url]) {
      expect((await page.request.get(`${API_BASE}${url}`)).status()).toBe(200)
    }
    expect((await page.request.get(`${API_BASE}${orphan.url}`)).status()).toBe(404)

    const draftsResponse = await page.request.get(`${API_BASE}/api/drafts`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(draftsResponse.ok()).toBe(true)
    const [stored] = await draftsResponse.json() as Array<{
      document: typeof document & { elements?: unknown }
    }>
    expect(stored.document.documentVersion).toBe(3)
    expect(stored.document.slides[0]).not.toHaveProperty('elements')
    expect(stored.document.slides[0].nodes[0]).toEqual(expect.objectContaining({
      name: 'Remote hidden group',
      hidden: true,
      rotation: 18,
      scale: 1.25,
    }))

    const secondContext = await browser.newContext()
    await installOfflineFontRoutes(secondContext)
    const secondPage = await secondContext.newPage()
    await startWithSettingsPanelOpen(secondPage)
    await secondPage.goto('/#/edit/canvas')
    await signIn(secondPage, username)
    await openServerDraft(secondPage, 'Nested remote scene')
    await secondPage.getByRole('tab', { name: '图层', exact: true }).click()
    const tree = secondPage.getByRole('tree', { name: '图层树' })
    const hiddenGroup = tree.getByRole('treeitem', { name: 'Remote hidden group' })
    await expect(hiddenGroup.getByRole('button', { name: '隐藏图层 Remote hidden group' }))
      .toHaveAttribute('aria-pressed', 'true')
    await expect(tree.getByRole('treeitem', { name: 'Remote locked shape' })
      .getByRole('button', { name: '锁定图层 Remote locked shape' }))
      .toHaveAttribute('aria-pressed', 'true')
    await hiddenGroup.getByRole('button', { name: '隐藏图层 Remote hidden group' }).click()
    await expectRemoteFreeformImagesDecoded(secondPage)
    expect(await draftKeys(secondPage)).toHaveLength(0)
    await secondContext.close()
  })

  test('migrates a nested v3 image frame and persists it as v4', async ({ page }) => {
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()

    const image = await uploadManagedImage(page, token!, 'framing-migration-image.png')
    const shape = await uploadManagedImage(page, token!, 'framing-migration-shape.png')
    const createResponse = await page.request.post(`${API_BASE}/api/drafts`, {
      headers: { authorization: `Bearer ${token}` },
      data: {
        mode: 'freeform-slide',
        document: remoteNestedScene(`${API_BASE}${image.url}`, `${API_BASE}${shape.url}`),
      },
    })
    expect(createResponse.ok()).toBe(true)
    const created = await createResponse.json() as { id: string }

    await page.reload()
    await expect(page.getByTestId('account-menu')).toBeVisible()
    await openServerDraft(page, 'Nested remote scene')
    await page.getByRole('tab', { name: '图层', exact: true }).click()
    const tree = page.getByRole('tree', { name: '图层树' })
    const hiddenGroup = tree.getByRole('treeitem', { name: 'Remote hidden group' })
    await hiddenGroup.getByRole('button', { name: '隐藏图层 Remote hidden group' }).click()
    await expectRemoteFreeformImagesDecoded(page)

    await tree.getByRole('treeitem', { name: 'Remote nested image' }).click()
    await expect(page.getByTestId('freeform-canvas'))
      .toHaveAttribute('data-active-group-path', 'remote-hidden-group')
    await page.getByRole('tab', { name: '属性', exact: true }).click()
    await page.getByTestId('freeform-crop-image').click()
    const overlay = page.getByTestId('freeform-image-crop-overlay')
    await dispatchCropPointerGesture(
      page,
      overlay.locator('.freeform-image-crop-dim'),
      501,
      { x: 0, y: 8 },
    )
    await dispatchCropPointerGesture(
      page,
      overlay.locator('[data-crop-handle="e"]'),
      502,
      { x: -24, y: 0 },
    )
    const expectedDraft = await readCropOverlayDraft(page)
    await page.getByTestId('freeform-image-crop-done').click()
    const expectedGeometry = await page.locator('[data-scene-node-id="remote-image"]')
      .evaluate((node) => {
        const element = node as HTMLElement
        return {
          x: Number.parseFloat(element.style.left),
          y: Number.parseFloat(element.style.top),
          width: Number.parseFloat(element.style.width),
          height: Number.parseFloat(element.style.height),
        }
      })
    await expectSaved(page)

    const draftsResponse = await page.request.get(`${API_BASE}/api/drafts`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(draftsResponse.ok()).toBe(true)
    const savedDrafts = await draftsResponse.json() as Array<{
      id: string
      document: {
        documentVersion: number
        slides: Array<{
          nodes: Array<{
            id: string
            type: string
            children?: Array<{
              id: string
              type: string
              x?: number
              y?: number
              width?: number
              height?: number
              framing?: { focusX: number; focusY: number; zoom: number }
            }>
          }>
        }>
      }
    }>
    const saved = savedDrafts.find((draft) => draft.id === created.id)
    expect(saved?.document.documentVersion).toBe(20)
    const group = saved?.document.slides[0].nodes.find((node) => node.id === 'remote-hidden-group')
    const savedImage = group?.children?.find((node) => node.id === 'remote-image')
    expect(savedImage).toBeDefined()
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(savedImage?.[key]).toBeCloseTo(expectedGeometry[key], 3)
    }
    expect(savedImage?.framing).not.toEqual({ focusX: 0.5, focusY: 0.5, zoom: 1 })
    if (!savedImage?.framing) throw new Error('saved image framing missing')
    const expectedFrame = { ...savedImage.framing }

    await page.reload()
    await expect(page.getByTestId('account-menu')).toBeVisible()
    await expectSaved(page)
    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await page.getByRole('tree', { name: '图层树' })
      .getByRole('treeitem', { name: 'Remote nested image' })
      .click()
    await page.getByRole('tab', { name: '属性', exact: true }).click()
    await expect(page.locator(
      '[data-scene-node-id="remote-image"] [data-framed-image="true"]',
    ))
      .toHaveAttribute('data-image-load-state', 'ready')
    const restoredGeometry = await page.locator('[data-scene-node-id="remote-image"]')
      .evaluate((node) => {
        const element = node as HTMLElement
        return {
          x: Number.parseFloat(element.style.left),
          y: Number.parseFloat(element.style.top),
          width: Number.parseFloat(element.style.width),
          height: Number.parseFloat(element.style.height),
        }
      })
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(restoredGeometry[key]).toBeCloseTo(expectedGeometry[key], 3)
    }
    const reloadedDraftsResponse = await page.request.get(`${API_BASE}/api/drafts`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(reloadedDraftsResponse.ok()).toBe(true)
    const reloadedDrafts = await reloadedDraftsResponse.json() as Array<{
      id: string
      document: {
        documentVersion: number
        slides: Array<{
          nodes: Array<{
            id: string
            children?: Array<{
              id: string
              x?: number
              y?: number
              width?: number
              height?: number
              framing?: { focusX: number; focusY: number; zoom: number }
            }>
          }>
        }>
      }
    }>
    const reloaded = reloadedDrafts.find((draft) => draft.id === created.id)
    expect(reloaded?.document.documentVersion).toBe(20)
    const reloadedGroup = reloaded?.document.slides[0].nodes
      .find((node) => node.id === 'remote-hidden-group')
    const reloadedImage = reloadedGroup?.children?.find((node) => node.id === 'remote-image')
    expect(reloadedImage).toBeDefined()
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(reloadedImage?.[key]).toBeCloseTo(expectedGeometry[key], 3)
    }
    expect(reloadedImage?.framing).toEqual(expectedFrame)
    await page.getByTestId('freeform-crop-image').click()
    // The crop is rebuilt from the stored node, so allow floating-point noise.
    const restoredDraft = await readCropOverlayDraft(page)
    for (const bounds of ['frame', 'image'] as const) {
      for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
        expect(restoredDraft[bounds][edge]).toBeCloseTo(expectedDraft[bounds][edge], 9)
      }
    }
    await page.getByTestId('freeform-image-crop-done').click()
  })

  test('keeps a newer draft at root scope when an older nested save resolves late', async ({ page }) => {
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()

    const draftA = await createRemoteFreeformDraft(
      page,
      token!,
      remoteAuthorityScene('authority-a', 'Authority nested A'),
    )
    const draftB = await createRemoteFreeformDraft(
      page,
      token!,
      remoteAuthorityScene('authority-b', 'Authority root B'),
    )

    await page.reload()
    await openServerDraft(page, draftA.title)
    await page.locator('[data-scene-node-id="authority-a-leaf"]').dblclick()
    await expect(page.getByTestId('freeform-canvas'))
      .toHaveAttribute('data-active-group-path', 'authority-a-outer')
    await insertFreeformText(page)

    let delayedSaveRoute: import('@playwright/test').Route | null = null
    await page.route(`${API_BASE}/api/drafts`, async (route) => {
      if (route.request().method() === 'POST' && !delayedSaveRoute) {
        delayedSaveRoute = route
        return
      }
      await route.continue()
    })

    // The inserted text autosaves; hold that request while another project opens.
    await expect.poll(() => delayedSaveRoute !== null).toBe(true)
    await openServerDraft(page, draftB.title)
    await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', '')
    await expect(page.locator('[data-scene-node-id="authority-b-leaf"]')).toHaveCount(1)
    await expect(page.getByTestId('freeform-canvas').locator('[data-selected="true"]')).toHaveCount(0)

    const delayedResponse = page.waitForResponse((response) => (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/drafts'
    ))
    await delayedSaveRoute!.continue()
    await delayedResponse
    await expect(page.locator('[data-scene-node-id="authority-b-leaf"]')).toHaveCount(1)
    await expect(page.locator('[data-scene-node-id="authority-a-leaf"]')).toHaveCount(0)
    await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', '')
    await expect(page.getByTestId('freeform-canvas').locator('[data-selected="true"]')).toHaveCount(0)
  })

  test('keeps remote save authority coherent across pointerup and pointercancel', async ({ page }) => {
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()
    const draft = await createRemoteFreeformDraft(
      page,
      token!,
      remoteAuthorityScene('history-authority', 'History authority scene'),
    )

    await page.reload()
    await openServerDraft(page, draft.title)
    await page.locator('[data-scene-node-id="history-authority-leaf"]').dblclick()
    await expect(page.getByTestId('freeform-canvas'))
      .toHaveAttribute('data-active-group-path', 'history-authority-outer')
    await insertFreeformText(page)

    const heldSaveRoutes: import('@playwright/test').Route[] = []
    await page.route(`${API_BASE}/api/drafts`, async (route) => {
      if (route.request().method() === 'POST') {
        heldSaveRoutes.push(route)
        return
      }
      await route.continue()
    })

    const workspace = page.locator('.freeform-workspace')
    const historyAfterInsert = Number(await workspace.getAttribute('data-history-depth'))
    const moveHandle = page.getByTestId('freeform-selection-move')

    // The inserted text autosaves; its request is held.
    await expect.poll(() => heldSaveRoutes.length).toBe(1)
    const firstMoveBox = await moveHandle.boundingBox()
    expect(firstMoveBox).toBeTruthy()
    const firstStart = {
      x: firstMoveBox!.x + firstMoveBox!.width / 2,
      y: firstMoveBox!.y + firstMoveBox!.height / 2,
    }
    await moveHandle.dispatchEvent('pointerdown', {
      pointerId: 201,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: firstStart.x,
      clientY: firstStart.y,
    })
    await page.evaluate(({ x, y }) => {
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 201,
        pointerType: 'touch',
        clientX: x + 36,
        clientY: y + 24,
      }))
    }, firstStart)
    await expect(page.getByTestId('freeform-selection-overlay'))
      .toHaveAttribute('data-live-interaction', 'move')
    await heldSaveRoutes[0].continue()
    await expect.poll(() => heldSaveRoutes[0].request().response()).not.toBeNull()
    await expect(workspace).toHaveAttribute('data-history-depth', String(historyAfterInsert))
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 201,
        pointerType: 'touch',
      }))
    })
    await expect(workspace).toHaveAttribute('data-history-depth', String(historyAfterInsert + 1))
    // The committed move is newer than the held save, so it is not saved yet…
    await expect(page.getByTestId('editor-save-state')).toHaveText('保存中…')

    // …until its own autosave request goes out (held too).
    await expect.poll(() => heldSaveRoutes.length).toBe(2)
    const secondMoveBox = await moveHandle.boundingBox()
    expect(secondMoveBox).toBeTruthy()
    const secondStart = {
      x: secondMoveBox!.x + secondMoveBox!.width / 2,
      y: secondMoveBox!.y + secondMoveBox!.height / 2,
    }
    await moveHandle.dispatchEvent('pointerdown', {
      pointerId: 202,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: secondStart.x,
      clientY: secondStart.y,
    })
    await page.evaluate(({ x, y }) => {
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 202,
        pointerType: 'touch',
        clientX: x - 28,
        clientY: y + 18,
      }))
    }, secondStart)
    await heldSaveRoutes[1].continue()
    await expect.poll(() => heldSaveRoutes[1].request().response()).not.toBeNull()
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointercancel', {
        bubbles: true,
        pointerId: 202,
        pointerType: 'touch',
      }))
    })
    await expect(workspace).toHaveAttribute('data-history-depth', String(historyAfterInsert + 1))
    await expectSaved(page)
    await expect(page.getByTestId('freeform-canvas'))
      .toHaveAttribute('data-active-group-path', 'history-authority-outer')
    await expect(page.getByTestId('freeform-canvas').locator('[data-selected="true"]')).toHaveCount(1)
  })

  test('a second browser context sees the same server drafts after login', async ({ browser }) => {
    // First context: register + save.
    const ctxA = await browser.newContext()
    await installOfflineFontRoutes(ctxA)
    const pageA = await ctxA.newPage()
    await pageA.goto('/#/edit')
    await pageA.evaluate(() => localStorage.clear())
    await pageA.reload()

    const username = uniqueName()
    await register(pageA, username)
    const marker = `跨设备 ${Date.now()}`
    await setEditorDoc(pageA, `# ${marker}`)
    await expectSaved(pageA)
    await ctxA.close()

    // Second context: totally fresh storage (simulates another device). Logging
    // in with the same account must surface the draft saved from context A.
    const ctxB = await browser.newContext()
    await installOfflineFontRoutes(ctxB)
    const pageB = await ctxB.newPage()
    await pageB.goto('/#/edit')
    await signIn(pageB, username)

    await openProjectsPage(pageB)
    await expect(pageB.getByTestId('project-card').filter({ hasText: marker })).toBeVisible()
    expect(await draftKeys(pageB)).toHaveLength(0)
    await ctxB.close()
  })

  test('keeps the opened Markdown draft identity when an older save resolves late', async ({ page }) => {
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())

    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()
    const draftB = await createRemoteMarkdownDraft(page, token!, '# 草稿 B')

    await page.reload()
    await expect(page.getByTestId('account-menu')).toBeVisible()

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

    // A new document autosaves (held) while project B opens.
    await page.goto('/#/edit/md/new')
    const draftAMarker = `迟到保存 A ${Date.now()}`
    await setEditorDoc(page, `# ${draftAMarker}`)
    await saveCaptured

    await openServerDraft(page, '草稿 B')
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
    await expect.poll(() => postBodies.length).toBe(2)
    expect(postBodies[1].id).toBe(draftB.id)
    await expectSaved(page)
  })

  test('keeps a newly opened Markdown draft active when an older delete resolves late', async ({ page }) => {
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())

    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()
    const draftA = await createRemoteMarkdownDraft(page, token!, '# 删除中的草稿 A')
    const draftB = await createRemoteMarkdownDraft(page, token!, '# 保留的草稿 B')

    await page.reload()
    await expect(page.getByTestId('account-menu')).toBeVisible()
    await openServerDraft(page, '删除中的草稿 A')

    let delayedDeleteRoute: import('@playwright/test').Route | null = null
    let markDeleteCaptured: () => void = () => {}
    const deleteCaptured = new Promise<void>((resolve) => {
      markDeleteCaptured = resolve
    })
    await page.route(`${API_BASE}/api/drafts/${draftA.id}`, async (route) => {
      delayedDeleteRoute = route
      markDeleteCaptured()
    })

    // Delete A from the workbench, and open B before the delete answers.
    await openProjectsPage(page)
    const cardA = page.getByTestId('project-card').filter({ hasText: '删除中的草稿 A' })
    await cardA.getByRole('button', { name: /更多操作/ }).click()
    await page.getByRole('menuitem', { name: '删除' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
    await deleteCaptured
    await page.getByTestId('project-card').filter({ hasText: '保留的草稿 B' })
      .getByRole('button', { name: /^打开/ }).click()
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
    const saveBody = (await nextSaveRequest).postDataJSON() as Record<string, unknown>
    expect(saveBody.id).toBe(draftB.id)
    await expect.poll(() => page.evaluate(() => window.__cmView?.state.doc.toString()))
      .toBe('# 保留的草稿 B 更新后')
  })

  test('serializes Markdown autosaves and keeps the saved marker tied to the full document', async ({ page }) => {
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    expect(token).toBeTruthy()
    await createRemoteMarkdownDraft(page, token!, '# 串行保存草稿')

    await page.reload()
    await expect(page.getByTestId('account-menu')).toBeVisible()
    const opened = await openServerDraft(page, '串行保存草稿')

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
    await saveCaptured
    const saveState = page.getByTestId('editor-save-state')
    await expect(saveState).toHaveText('保存中…')

    // An edit made while the first request is out waits for it instead of racing it.
    await page.locator('.sel[title="主题"] .sel-trigger').click()
    await page.getByRole('option', { name: '暖米色' }).click()
    await page.waitForTimeout(1_200)
    expect(postBodies).toHaveLength(1)
    await expect(saveState).toHaveText('保存中…')

    const delayedResponse = page.waitForResponse((response) => (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/drafts'
    ))
    await delayedSaveRoute!.continue()
    await delayedResponse

    await expect.poll(() => postBodies.length).toBe(2)
    expect(postBodies[0].id).toBe(opened.id)
    expect(postBodies[1].id).toBe(opened.id)
    const secondDocument = postBodies[1].document as Record<string, unknown>
    expect(secondDocument.themeId).toBe('warm')
    expect(secondDocument.source).toBe('# 串行保存 v1')
    await expectSaved(page)

    await page.locator('.sel[title="主题"] .sel-trigger').click()
    await page.getByRole('option', { name: '简约白' }).click()
    await expect.poll(() => postBodies.length).toBe(3)
    expect((postBodies[2].document as Record<string, unknown>).themeId).toBe('light')
    await expectSaved(page)
  })

  test('ignores a freeform save failure after another project is opened', async ({ page }) => {
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    await page.goto('/#/edit/canvas')
    await insertFreeformText(page)
    await expectSaved(page)

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

    // Reloading reopens project A.
    await page.reload()
    await expect(page.getByTestId('account-menu')).toBeVisible()
    await expect(page.getByTestId('editor-title')).toHaveText(draftA.title)

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

    await insertFreeformText(page)
    await saveCaptured
    await openServerDraft(page, '另一个自由编辑草稿 B')

    await fulfillJsonError(delayedSaveRoute!, 500, '测试：迟到的保存失败')
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    await expect(page.locator('#workspace-panel-freeform').getByRole('alert')).toHaveCount(0)
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  })

  test('serializes freeform autosaves so a newer document cannot be overwritten by an older request', async ({ page }) => {
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    await page.goto('/#/edit/canvas')
    await insertFreeformText(page)
    await expectSaved(page)

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

    await insertFreeformShape(page, '矩形')
    await saveCaptured

    // A newer edit while that request is out waits for it rather than racing it.
    await insertFreeformShape(page, '圆形')
    await page.waitForTimeout(1_200)
    expect(postBodies).toHaveLength(1)
    await expect(page.getByTestId('editor-save-state')).toHaveText('保存中…')

    const firstDocument = postBodies[0].document as { slides: Array<{ nodes: unknown[] }> }
    expect(firstDocument.slides[0].nodes).toHaveLength(2)
    const delayedResponse = page.waitForResponse((response) => (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/drafts'
    ))
    const secondSaveResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/drafts' &&
      (response.request().postData()?.includes('"shape":"ellipse"') ?? false)
    ))
    await delayedSaveRoute!.continue()
    await delayedResponse
    const secondSaveResponse = await secondSaveResponsePromise
    expect(secondSaveResponse.ok()).toBe(true)
    await expect.poll(() => postBodies.length).toBe(2)
    expect(postBodies[1].id).toBe(postBodies[0].id)
    const secondDocument = postBodies[1].document as {
      documentVersion: unknown
      slides: Array<{ nodes: unknown[]; elements?: unknown }>
    }
    expect(secondDocument.documentVersion).toBe(20)
    expect(secondDocument.slides[0]).not.toHaveProperty('elements')
    expect(secondDocument.slides[0].nodes).toHaveLength(3)

    const secondSavedDraft = await secondSaveResponse.json() as {
      document: {
        documentVersion: unknown
        slides: Array<{ nodes: unknown[]; elements?: unknown }>
      }
    }
    expect(secondSavedDraft.document.documentVersion).toBe(20)
    expect(secondSavedDraft.document.slides[0]).not.toHaveProperty('elements')
    expect(secondSavedDraft.document.slides[0].nodes).toHaveLength(3)
    await expectSaved(page)
  })

  test('deleting the open freeform project from the workbench clears the editor', async ({ page }) => {
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    await page.goto('/#/edit/canvas')

    await insertFreeformText(page)
    await expectSaved(page)
    await openProjectsPage(page)
    const card = page.getByTestId('project-card')
    await card.getByRole('button', { name: /更多操作/ }).click()
    await page.getByRole('menuitem', { name: '删除' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
    await expect(card).toHaveCount(0)
    expect(await serverDrafts(page)).toHaveLength(0)

    // The editor starts over instead of saving the deleted project back.
    await page.goto('/#/edit/canvas')
    await expect(page.getByTestId('freeform-element')).toHaveCount(0)
    await expect(page.getByTestId('editor-save-state')).toHaveCount(0)
    expect(await serverDrafts(page)).toHaveLength(0)
  })

  test('retains active images and blocks a new upload when pre-retain fails', async ({ page }) => {
    const pageErrors = collectPageErrors(page)
    const imagePosts: string[] = []
    const retainRequests: string[] = []
    let failRetain = false

    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (request.method() === 'POST' && path === '/api/images') imagePosts.push(request.url())
    })
    await page.route(`${API_BASE}/api/images/retain`, async (route) => {
      retainRequests.push(route.request().url())
      if (failRetain) {
        await fulfillJsonError(route, 500, '测试：图片续租失败')
        return
      }
      await route.continue()
    })

    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())
    await page.goto('/#/edit/canvas')

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

    await expectSaved(page)
    expect(await serverDrafts(page)).toHaveLength(1)

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
    // The blocked upload changed nothing, so the saved project is untouched.
    await expectSaved(page)
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

    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await register(page, uniqueName())

    // A failed autosave says so in the top bar and can be retried.
    draftFailure = 'save'
    const marker = `错误恢复草稿 ${Date.now()}`
    await setEditorDoc(page, `# ${marker}`)
    const saveState = page.getByTestId('editor-save-state')
    await expect(saveState).toHaveText(/保存失败/)
    await expect(saveState).toHaveAttribute('title', '测试：草稿保存失败')
    draftFailure = null
    await page.getByTestId('editor-save-retry').click()
    await expectSaved(page)

    // A failed project list offers a retry on 我的项目.
    draftFailure = 'list'
    await openProjectsPage(page)
    await expect(page.getByText('项目读取失败')).toBeVisible()
    await expect(page.getByText('测试：草稿列表失败')).toBeVisible()
    draftFailure = null
    await page.getByRole('button', { name: '重试', exact: true }).click()
    const card = page.getByTestId('project-card').filter({ hasText: marker })
    await expect(card).toBeVisible()

    // A failed delete keeps the project and says why.
    draftFailure = 'delete'
    await card.getByRole('button', { name: /更多操作/ }).click()
    await page.getByRole('menuitem', { name: '删除' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
    const workbenchNotice = page.getByRole('alert')
    await expect(workbenchNotice).toContainText('删除失败')
    await expect(workbenchNotice).toContainText('测试：草稿删除失败')
    await expect(card).toBeVisible()

    // Pasted pictures that fail to upload report it in the editor.
    draftFailure = null
    imageUploadFailure = true
    await card.getByRole('button', { name: /^打开/ }).click()
    await expect(page.getByTestId('editor-title')).toHaveText(marker)
    await pasteMarkdownImage(page)
    await expect(page.locator('#workspace-panel-markdown').getByRole('alert')).toContainText('测试：Markdown 图片上传失败')
    expect(pageErrors).toEqual([])
  })

  test('invalidates expired session after a recoverable auth check failure', async ({ page }) => {
    const pageErrors = collectPageErrors(page)

    await page.goto('/#/edit')
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
    await expect(page.getByTestId('account-menu')).toBeVisible()

    // One save goes through, so the text below belongs to an existing project.
    await setEditorDoc(page, `# 过期前的项目 ${Date.now()}`)
    await expectSaved(page)
    const [project] = await serverDrafts(page)

    await page.route(`${API_BASE}/api/drafts`, async (route) => {
      if (route.request().method() === 'POST') {
        await fulfillJsonError(route, 401, '测试：会话已过期')
        return
      }
      await route.continue()
    })
    // The next autosave learns the session is gone.
    const unsavedLine = `过期前写的一句 ${Date.now()}`
    await setEditorDoc(page, `# ${unsavedLine}`)

    await expect(page.getByTestId('account-login')).toBeVisible()
    // The unsaved text stays on screen for the next sign-in.
    await expect.poll(() => page.evaluate(() => window.__cmView?.state.doc.toString())).toBe(`# ${unsavedLine}`)
    await expect(page.getByTestId('editor-save-state')).toHaveText('登录后继续保存')
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(page.getByRole('alert')).toContainText('登录已过期')
    expect(await page.evaluate(() => localStorage.getItem('slicer.token.v1'))).toBeNull()

    // Signing back in saves the kept text into the same project, not a copy.
    await page.unroute(`${API_BASE}/api/drafts`)
    await page.unroute(`${API_BASE}/api/auth/me`)
    await signIn(page, registeredUser.username)
    await expectSaved(page)
    const after = await serverDrafts(page)
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe(project.id)
    expect(after[0].title).toBe(unsavedLine)
    expect(pageErrors).toEqual([])
  })

  test('keeps library uploads through image GC until the asset is deleted', async ({ page }) => {
    const pageErrors = collectPageErrors(page)

    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    const login = page.getByTestId('login-page')
    await expect(login).toContainText('账号保存在你部署的服务器上')
    await login.getByRole('button', { name: '注册', exact: true }).click()
    await login.getByLabel('用户名').fill(uniqueName())
    await login.getByLabel('密码').fill('1234')
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('workbench')).toBeVisible()

    await page.getByRole('link', { name: /^素材库/ }).click()
    const cards = page.getByTestId('asset-card')
    await page.getByTestId('asset-file-input').setInputFiles({ name: '封面.png', mimeType: 'image/png', buffer: TEST_PNG })
    await expect(cards).toHaveCount(1)
    const coverSrc = await cards.first().locator('img').getAttribute('src')
    expect(coverSrc).toMatch(new RegExp(`^${API_BASE}/uploads/`))

    // Leases last 500 ms in this suite, and every upload runs image GC first.
    await page.waitForTimeout(700)
    await page.getByTestId('asset-file-input').setInputFiles({ name: '第二张.png', mimeType: 'image/png', buffer: TEST_PNG })
    await expect(cards).toHaveCount(2)
    expect((await page.request.get(coverSrc!)).status()).toBe(200)

    await page.reload()
    await expect(cards).toHaveCount(2)

    const cover = cards.filter({ has: page.locator('.asset-name', { hasText: '封面' }) })
    await cover.getByRole('button', { name: /更多操作/ }).click()
    await page.getByRole('menuitem', { name: '删除' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
    await expect(cards).toHaveCount(1)
    // Deleting the asset runs GC: the upload is past its lease and no draft uses it.
    await expect.poll(async () => (await page.request.get(coverSrc!)).status()).toBe(404)
    expect(pageErrors).toEqual([])
  })

  test('a guest works on this device, then moves the project and its pictures into a new account', async ({ page }) => {
    const pageErrors = collectPageErrors(page)
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.goto('/#/edit/md')
    await expect(page.getByTestId('markdown-toolbar')).toBeVisible()

    // Without an account, the library and the project stay in this browser.
    const title = `访客的长文 ${Date.now()}`
    await setEditorDoc(page, `# ${title}\n\n`)
    await page.getByTestId('editor-assets').click()
    await page.getByTestId('asset-drawer-file-input').setInputFiles({ name: '题图.png', mimeType: 'image/png', buffer: TEST_PNG })
    await page.getByTestId('asset-pick').first().click()
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存到本机')
    expect(await page.evaluate(() => window.__cmView?.state.doc.toString())).toMatch(/\(img:[a-z0-9]+\)/)

    await page.getByTestId('account-login').click()
    await page.getByRole('button', { name: '注册' }).click()
    await page.getByLabel('用户名').fill(uniqueName())
    await page.getByLabel('密码').fill('1234')
    await page.getByRole('button', { name: '创建账号' }).click()
    const offer = page.getByTestId('guest-move-dialog')
    await expect(offer).toContainText('换一台设备登录也能继续编辑')
    await offer.getByTestId('guest-move-confirm').click()
    await expect(offer).toHaveCount(0)
    await expectSaved(page)

    // The server has the project, pointing at its own copy of the picture.
    const drafts = await serverDrafts(page)
    expect(drafts).toHaveLength(1)
    const document = drafts[0].document as { source: string; images?: Record<string, string> }
    expect(document.source).toContain(title)
    expect(document.source).not.toMatch(/img:/)
    const upload = /\((https?:[^)]+\/uploads\/[^)]+)\)/.exec(document.source)?.[1]
    expect(upload).toBeTruthy()
    expect((await page.request.get(upload!)).status()).toBe(200)
    await expect.poll(() => page.evaluate(() => window.__cmView?.state.doc.toString() ?? '')).toContain('/uploads/')

    // And the library came along; nothing is left on the device.
    const token = await page.evaluate(() => localStorage.getItem('slicer.token.v1'))
    const assets = await page.request.get(`${API_BASE}/api/assets`, { headers: { authorization: `Bearer ${token}` } })
    expect(await assets.json()).toHaveLength(1)
    expect(await page.evaluate(() => localStorage.getItem('slicer.drafts.local-guest'))).toBeNull()
    expect(pageErrors).toEqual([])
  })
})
