import { expect, test, type Page } from '@playwright/test'
import { openToolPanel, startWithSettingsPanelOpen } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'
import { makeTestFont } from './testFont'

// 导入字体… in a text's font menu keeps a font file in this browser and sets
// the selected text in it; every font menu lists it after the built-in
// fonts, and 素材库 · 字体 shows and removes the fonts imported here. It
// draws on the canvas, in thumbnails and in exports.

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  await startWithSettingsPanelOpen(page)
})

const FONT_FILE = { name: 'DingCardTest.ttf', mimeType: 'font/ttf', buffer: makeTestFont() }

/** Whether the page has the test font registered (document.fonts.check is true for unknown families too). */
const fontRegistered = (page: Page) => page.evaluate(() => [...document.fonts].some((face) => face.family.replace(/["']/g, '') === '叮卡测试体' && face.status === 'loaded'))

async function addHeading(page: Page) {
  await openToolPanel(page, 'text')
  await page.getByTestId('freeform-text-drawer').getByTestId('insert-text-heading').click()
  await expect(page.getByTestId('freeform-textbox')).toHaveCount(1)
}

test('a font imported from the font menu sets the text, joins every font menu, stays after a reload, and is removed in 素材库', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await addHeading(page)
  await page.getByTestId('freeform-textbox').click()
  // The default text font goes by its name, not its stack.
  await expect(page.getByTestId('freeform-font-select')).toHaveText('苹方 PingFang')

  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('freeform-font-select').click()
  await page.getByRole('option', { name: '导入字体…' }).click()
  await (await chooser).setFiles(FONT_FILE)
  await expect(page.getByTestId('freeform-textbox')).toHaveCSS('font-family', /叮卡测试体/)
  await expect(page.getByTestId('freeform-font-select')).toHaveText('叮卡测试体')
  await expect.poll(() => fontRegistered(page)).toBe(true)

  // The 风格 panel keeps to whole-deck looks: no import there.
  await openToolPanel(page, 'styles')
  await expect(page.getByTestId('freeform-styles-drawer').getByText('导入字体')).toHaveCount(0)

  await page.reload()
  await expect(page.getByTestId('freeform-textbox')).toHaveCSS('font-family', /叮卡测试体/)
  await expect.poll(() => fontRegistered(page)).toBe(true)

  // 素材库 · 字体 lists it in its own face and removes it.
  await page.goto('/#/assets')
  await page.getByTestId('asset-kind-fonts').click()
  const card = page.getByTestId('font-card')
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('叮卡测试体')
  await expect(card).toContainText('TTF')
  await card.getByRole('button', { name: '删除字体 叮卡测试体' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(card).toHaveCount(0)
  await expect.poll(() => fontRegistered(page)).toBe(false)
})

test('素材库 imports fonts too, and says why a file is turned away', async ({ page }) => {
  // Start as a guest from the editor, then open the library.
  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()
  await page.goto('/#/assets')
  await page.getByTestId('asset-kind-fonts').click()
  await page.getByTestId('font-file-input').setInputFiles(FONT_FILE)
  await expect(page.getByTestId('font-card')).toHaveCount(1)
  await page.getByTestId('font-file-input').setInputFiles({ name: 'logo.ttf', mimeType: 'font/ttf', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') })
  await expect(page.getByRole('alert')).toHaveText('不是可用的字体文件，请选 TTF、OTF、WOFF 或 WOFF2')
  await expect(page.getByTestId('font-card')).toHaveCount(1)
})

test('importing from a text font menu sets the selected text in the font; a file that is not a font is turned away', async ({ page }) => {
  // Wide enough for the context bar to show its font menu beside the open settings panel.
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/#/edit/canvas')
  await addHeading(page)
  await page.getByTestId('freeform-textbox').click()
  await expect(page.getByTestId('freeform-context-toolbar')).toHaveAttribute('data-subject', 'text')

  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('ctx-font-select').click()
  await page.getByRole('option', { name: '导入字体…' }).click()
  await (await chooser).setFiles(FONT_FILE)
  await expect(page.getByTestId('freeform-textbox')).toHaveCSS('font-family', /叮卡测试体/)
  await expect(page.getByTestId('ctx-font-select')).toHaveText('叮卡测试体')

  await page.getByTestId('freeform-font-input').setInputFiles({ name: 'logo.ttf', mimeType: 'font/ttf', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') })
  await expect(page.getByText('不是可用的字体文件，请选 TTF、OTF、WOFF 或 WOFF2')).toBeVisible()
})
