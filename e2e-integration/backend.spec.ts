import { test, expect } from '@playwright/test'

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

// The drafts toolbar button reads "草稿" or "草稿 · N" — match from the start so
// it never collides with the "保存草稿" (save) button.
const draftsButton = /^草稿/

async function register(page: import('@playwright/test').Page, username: string) {
  await page.getByTestId('account-login').click()
  await page.getByRole('button', { name: '注册' }).click()
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill('1234')
  await page.getByRole('button', { name: '创建账号' }).click()
  // Header flips to the logout (avatar) button once signed in.
  await expect(page.getByTestId('account-logout')).toBeVisible()
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

  test('a second browser context sees the same server drafts after login', async ({ browser }) => {
    // First context: register + save.
    const ctxA = await browser.newContext()
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
})
