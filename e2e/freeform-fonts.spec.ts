import { expect, test, type Page } from '@playwright/test'
import { openToolPanel, startWithSettingsPanelOpen } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'
import { makeTestFont } from './testFont'

// 导入字体 keeps a font file in this browser: it joins the font sets in the
// 风格 panel and every font menu, and draws on the canvas, in thumbnails and
// in exports. A click on it among the font sets sets all the text in it.

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  await startWithSettingsPanelOpen(page)
})

const FONT_FILE = { name: 'DingCardTest.ttf', mimeType: 'font/ttf', buffer: makeTestFont() }

async function addHeading(page: Page) {
  await openToolPanel(page, 'text')
  await page.getByTestId('freeform-text-drawer').getByTestId('insert-text-heading').click()
  await expect(page.getByTestId('freeform-textbox')).toHaveCount(1)
}

test('an imported font joins the font sets and the font menus, sets all the text in one click, and stays after a reload', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await addHeading(page)
  // The default text font goes by its name in the font menu, not its stack.
  await page.getByTestId('freeform-textbox').click()
  await expect(page.getByTestId('freeform-font-select')).toHaveText('苹方 PingFang')
  await openToolPanel(page, 'styles')
  const drawer = page.getByTestId('freeform-styles-drawer')

  await drawer.getByTestId('style-import-font').scrollIntoViewIfNeeded()
  await page.getByTestId('freeform-font-input').setInputFiles(FONT_FILE)
  const mine = drawer.locator('[data-testid^="style-my-font-"] .freeform-font-set-name')
  await expect(mine).toHaveText(['叮卡测试体'])
  await expect.poll(() => page.evaluate(() => document.fonts.check("16px '叮卡测试体'"))).toBe(true)

  await mine.click()
  await expect(page.getByTestId('freeform-textbox')).toHaveCSS('font-family', /叮卡测试体/)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('freeform-textbox')).not.toHaveCSS('font-family', /叮卡测试体/)

  // A text's font menu lists it after the built-in fonts, with the import action last.
  await page.getByTestId('freeform-textbox').click()
  await page.getByTestId('freeform-font-select').click()
  const options = page.getByRole('option')
  await expect(options.nth(-2)).toHaveText('叮卡测试体')
  await expect(options.last()).toHaveText('导入字体…')
  await options.nth(-2).click()
  await expect(page.getByTestId('freeform-textbox')).toHaveCSS('font-family', /叮卡测试体/)

  await page.reload()
  await expect(page.getByTestId('freeform-textbox')).toHaveCSS('font-family', /叮卡测试体/)
  await expect.poll(() => page.evaluate(() => document.fonts.check("16px '叮卡测试体'"))).toBe(true)
  await openToolPanel(page, 'styles')
  await expect(mine).toHaveText(['叮卡测试体'])

  // Removed, it leaves the font sets; the text keeps naming it.
  await drawer.getByRole('button', { name: '删除字体 叮卡测试体' }).click()
  await expect(mine).toHaveCount(0)
  await page.getByTestId('freeform-textbox').click()
  await expect(page.getByTestId('freeform-font-select')).toHaveText('叮卡测试体')
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
