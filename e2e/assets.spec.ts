import { deflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { installOfflineFontRoutes } from './offlineFonts'

declare global {
  interface Window {
    __cmView?: {
      state: { doc: { toString(): string } }
      dispatch(spec: unknown): void
    }
  }
}

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

function crc32(bytes: Buffer) {
  let value = 0xffffffff
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** A solid-colour RGB PNG, so tests can check real pixel sizes. */
function solidPng(width: number, height: number, [red, green, blue]: [number, number, number]) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x += 1) row.set([red, green, blue], 1 + x * 3)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const STREET = { name: '雨夜街道.png', mimeType: 'image/png', buffer: solidPng(300, 200, [40, 60, 90]) }
const LAKE = { name: '山湖.png', mimeType: 'image/png', buffer: solidPng(200, 300, [200, 120, 80]) }

function uniqueName(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

async function registerOnLoginPage(page: Page) {
  await page.goto('/')
  const login = page.getByTestId('login-page')
  await login.getByRole('button', { name: '注册', exact: true }).click()
  await login.getByLabel('用户名').fill(uniqueName('assets'))
  await login.getByLabel('密码').fill('1234')
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('workbench')).toBeVisible()
}

async function openAssetsPage(page: Page) {
  await page.getByRole('link', { name: /^素材库/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: '素材库' })).toBeVisible()
}

function card(page: Page, name: string) {
  return page.getByTestId('asset-card').filter({ has: page.locator('.asset-name', { hasText: name }) })
}

test('the asset library uploads, finds, renames and deletes images, and keeps them across reloads', async ({ page }) => {
  await registerOnLoginPage(page)
  await openAssetsPage(page)
  await expect(page.getByText('把图片拖到这里，或者直接粘贴截图')).toBeVisible()

  await page.getByTestId('asset-file-input').setInputFiles([STREET, LAKE])
  await expect(page.getByTestId('asset-card')).toHaveCount(2)
  await expect(page.locator('.operation-notice--workbench')).toContainText('已上传 2 张图片')
  await expect(page.getByRole('link', { name: /^素材库/ })).toContainText('2')
  await expect(card(page, '雨夜街道')).toContainText('300 × 200')
  await expect(card(page, '山湖')).toContainText('200 × 300')

  await page.getByRole('searchbox', { name: '搜索素材' }).fill('山')
  await expect(page.getByTestId('asset-card')).toHaveCount(1)
  await page.getByRole('searchbox', { name: '搜索素材' }).fill('')

  await card(page, '山湖').getByRole('button', { name: /更多操作/ }).click()
  await page.getByRole('menuitem', { name: '重命名' }).click()
  const rename = page.getByRole('textbox', { name: '素材名称' })
  await rename.fill('晨雾山湖')
  await rename.press('Enter')
  await expect(card(page, '晨雾山湖')).toHaveCount(1)

  await page.reload()
  await expect(page.getByTestId('asset-card')).toHaveCount(2)
  await expect(card(page, '晨雾山湖')).toHaveCount(1)

  await card(page, '雨夜街道').locator('.asset-thumb').click()
  const preview = page.getByRole('dialog', { name: '雨夜街道' })
  await expect(preview).toContainText('300 × 200 px')
  await expect(preview).toContainText('还没有项目用到')
  await preview.getByRole('button', { name: '删除' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByTestId('asset-card')).toHaveCount(1)
  await expect(page.locator('.operation-notice--workbench')).toContainText('已删除「雨夜街道」')

  await page.getByTestId('asset-file-input').setInputFiles({
    name: 'logo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>'),
  })
  const notice = page.locator('.operation-notice--workbench')
  await expect(notice).toContainText('1 张图片没有上传')
  await expect(notice).toContainText('只支持 PNG、JPG、WebP 图片')
  await expect(page.getByTestId('asset-card')).toHaveCount(1)
})

test('the editor drawer puts library images into both systems', async ({ page }) => {
  await registerOnLoginPage(page)
  await openAssetsPage(page)
  await page.getByTestId('asset-file-input').setInputFiles([STREET])
  await expect(page.getByTestId('asset-card')).toHaveCount(1)

  await page.getByRole('link', { name: '首页' }).click()
  await expect(page.locator('.asset-strip-item')).toHaveCount(1)
  await page.getByTestId('system-freeform').getByRole('button', { name: '3:4', exact: true }).click()
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()

  const toggle = page.getByTestId('editor-assets')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const drawer = page.getByTestId('asset-drawer')
  await expect(drawer).toContainText('点一下，放到当前页的中央')
  await drawer.getByRole('button', { name: '插入 雨夜街道' }).click()

  const image = page.getByTestId('freeform-element').filter({ has: page.locator('.freeform-image') })
  await expect(image).toHaveCount(1)
  const box = await image.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.width / box!.height).toBeCloseTo(1.5, 1)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')

  await page.getByTestId('workspace-tab-markdown').click()
  await expect(drawer).toContainText('点一下，插入到光标所在的位置')
  await page.waitForFunction(() => !!window.__cmView)
  await drawer.getByRole('button', { name: '插入 雨夜街道' }).click()
  await expect.poll(() => page.evaluate(() => window.__cmView!.state.doc.toString()))
    .toMatch(/!\[雨夜街道\]\(img:[a-z0-9]+\)\n/)

  await drawer.getByRole('searchbox', { name: '搜索素材' }).focus()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')

  await toggle.click()
  await drawer.getByRole('button', { name: '管理素材库' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '素材库' })).toBeVisible()
  await card(page, '雨夜街道').locator('.asset-thumb').click()
  await expect(page.getByRole('dialog', { name: '雨夜街道' })).toContainText('1 个项目里')
})

test('guests are asked to sign in before using the asset library', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.getByTestId('editor-assets').click()
  const drawer = page.getByTestId('asset-drawer')
  await expect(drawer).toContainText('登录后使用素材库')
  await drawer.getByRole('button', { name: '登录或注册' }).click()
  const dialog = page.getByRole('dialog', { name: '账户登录与注册' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()

  // Opening an editor link made this visitor a guest, so the workbench opens without the login page.
  await page.getByTestId('editor-home').click()
  await openAssetsPage(page)
  await expect(page.getByText('还没有登录')).toBeVisible()
  await expect(page.getByTestId('asset-upload')).toHaveCount(0)
})
