// The QR code element (v22): insert, encode a payload, restyle its colours
// and correction level, and round-trip documents that carry one.

import { expect, test } from '@playwright/test'
import {
  insertShape,
  openFreeform,
  openStoredDrafts,
  registerUser,
  startWithSettingsPanelOpen,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

/** Selects the QR element: through its wrapper, or via the layer tree when
 *  another element covers it (the svg itself never takes pointer events). */
async function clickQrCode(page: import('@playwright/test').Page) {
  const wrapper = page.getByTestId('freeform-element')
    .filter({ has: page.getByTestId('freeform-qrcode') })
  try {
    await wrapper.click({ timeout: 3000 })
  } catch {
    const tablist = page.getByRole('tablist', { name: '自由编辑面板' })
    await tablist.getByRole('tab', { name: '图层', exact: true }).click()
    await page.getByRole('tabpanel', { name: '图层' })
      .getByRole('treeitem', { name: '二维码' })
      .click()
    await tablist.getByRole('tab', { name: '属性', exact: true }).click()
  }
}

/** The number of dark modules the rendered code draws. */
async function darkModuleCount(page: import('@playwright/test').Page) {
  return page.getByTestId('freeform-qrcode').locator('path').evaluate((node) =>
    (node.getAttribute('d') ?? '').split('M').length - 1)
}

async function insertQrCode(page: import('@playwright/test').Page) {
  await page.getByTestId('freeform-elements-tool').click()
  await page.getByTestId('insert-qrcode').click()
  await page.getByTestId('freeform-elements-tool').click()
  await expect(page.getByTestId('freeform-qrcode')).toBeVisible()
}

test('inserts a QR code that renders its payload as modules', async ({ page }) => {
  await openFreeform(page)

  await insertQrCode(page)
  const code = page.getByTestId('freeform-qrcode')
  // The default link encodes as a version-2 code: 25 modules plus the
  // two-module quiet zone on each side.
  await expect(code).toHaveAttribute('viewBox', '0 0 29 29')
  expect(await darkModuleCount(page)).toBeGreaterThan(60)
  // The light background covers the whole quiet zone.
  await expect(code.locator('rect')).toHaveAttribute('fill', '#ffffff')
  await expect(code.locator('path')).toHaveAttribute('fill', '#18181b')

  // The layer list names it and the context toolbar chips it.
  const tablist = page.getByRole('tablist', { name: '自由编辑面板' })
  await tablist.getByRole('tab', { name: '图层', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '图层' }).locator('.freeform-layer-name')
    .filter({ hasText: '二维码' })).toBeVisible()
  await expect(page.getByTestId('freeform-context-toolbar').getByText('二维码')).toBeVisible()
})

test('encodes a new payload through the inspector field', async ({ page }) => {
  await openFreeform(page)
  await insertQrCode(page)
  const before = await darkModuleCount(page)

  const field = page.getByLabel('二维码内容', { exact: true })
  await expect(field).toHaveValue(/https?:\/\//)
  await field.fill('https://dingcard.app/docs?qrcode')
  await field.press('Enter')

  // A longer payload grows the code to the next version.
  await expect.poll(() => darkModuleCount(page)).toBeGreaterThan(before)
  await expect(page.getByTestId('freeform-qrcode')).toHaveAttribute('viewBox', '0 0 33 33')

  // The payload edit is one history entry; undo restores the first code.
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect.poll(() => darkModuleCount(page)).toBe(before)

  // A blank payload never lands: the field keeps the last valid content.
  await page.getByLabel('二维码内容', { exact: true }).fill('   ')
  await page.getByLabel('二维码内容', { exact: true }).press('Enter')
  await expect.poll(() => darkModuleCount(page)).toBe(before)
})

test('switches the correction level and recolours the code', async ({ page }) => {
  await openFreeform(page)
  await insertQrCode(page)

  // M is the default, shown pressed; H raises the correction level.
  await expect(page.getByTestId('qr-ecl-M')).toHaveClass(/on/)
  await page.getByTestId('qr-ecl-H').click()
  await expect(page.getByTestId('qr-ecl-H')).toHaveClass(/on/)
  await expect(page.getByTestId('qr-ecl-M')).not.toHaveClass(/on/)

  // Recolour through the two pickers' hex fields.
  for (const [label, color, target] of [
    ['码点颜色', '#1d4ed8', 'path'],
    ['背景颜色', '#fef9c3', 'rect'],
  ] as const) {
    await page.getByRole('button', { name: label, exact: true }).click()
    const hex = page.getByLabel(`${label} 自定义 HEX`, { exact: true })
    await hex.fill(color)
    await hex.press('Enter')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('freeform-qrcode').locator(target)).toHaveAttribute('fill', color)
  }

  // Style edits undo one at a time, landing back on ink black and white.
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByTestId('freeform-qrcode').locator('rect')).toHaveAttribute('fill', '#ffffff')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByTestId('freeform-qrcode').locator('path')).toHaveAttribute('fill', '#18181b')
})

test('keeps the QR code editable alongside other elements', async ({ page }) => {
  await openFreeform(page)
  await insertQrCode(page)

  // A shape inserted afterwards selects cleanly; the QR stays rendered.
  await insertShape(page)
  await expect(page.getByTestId('freeform-shape')).toBeVisible()
  await expect(page.getByTestId('freeform-qrcode')).toBeVisible()

  // Re-selecting the QR brings its inspector section back.
  await clickQrCode(page)
  await expect(page.getByLabel('二维码内容', { exact: true })).toBeVisible()
})

test('round-trips a saved v22 QR code and rejects it at v21', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('account-login').click()
  await registerUser(page, `qr-roundtrip-${Date.now()}`)
  await expect(page.getByTestId('account-menu')).toBeVisible()

  const slide = {
    id: 'qr-slide',
    name: 'QR slide',
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    nodes: [{
      id: 'qr-1',
      name: '二维码',
      locked: false,
      hidden: false,
      type: 'qrcode',
      x: 420,
      y: 600,
      width: 240,
      height: 240,
      rotation: 0,
      scale: 1,
      payload: 'https://dingcard.app',
      dark: '#1d4ed8',
      light: '#fef9c3',
      ecl: 'H',
    }],
  }
  await openStoredDrafts(page, [{
    id: 'qr-draft',
    title: 'QR draft',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: Date.now(),
    document: { documentVersion: 22, activeSlideId: slide.id, slides: [slide] },
  }])

  const code = page.getByTestId('freeform-qrcode')
  await expect(code).toBeVisible()
  await expect(code.locator('rect')).toHaveAttribute('fill', '#fef9c3')
  await expect(code.locator('path')).toHaveAttribute('fill', '#1d4ed8')
  await clickQrCode(page)
  await expect(page.getByLabel('二维码内容', { exact: true })).toHaveValue('https://dingcard.app')
  await expect(page.getByTestId('qr-ecl-H')).toHaveClass(/on/)

  // The same node at v21 never loads: the draft is rejected whole.
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('account-login').click()
  await registerUser(page, `qr-v21-${Date.now()}`)
  await expect(page.getByTestId('account-menu')).toBeVisible()
  await openStoredDrafts(page, [{
    id: 'qr-v21-draft',
    title: 'QR v21 draft',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: Date.now(),
    document: { documentVersion: 21, activeSlideId: slide.id, slides: [slide] },
  }]).catch(() => {})
  await expect(page.getByText('没有找到这个项目，它可能已经被删除了')).toBeVisible()
})
