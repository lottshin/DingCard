import { expect, test, type Page } from '@playwright/test'
import { openToolPanel } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

// The 风格 panel restyles the whole deck: a palette, a font set, or one of the
// deck's own colours and fonts swapped wherever it appears — each one undo step.

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

async function openEditorial(page: Page) {
  await page.goto('/#/edit/canvas/template/editorial-freeform')
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(3)
  await expect(page.getByTestId('freeform-canvas')).toHaveCSS('background-color', 'rgb(246, 243, 234)')
}

const titleOf = (page: Page) => page.getByTestId('freeform-canvas').locator('.freeform-textbox', { hasText: '开头先把' })

test('a palette and a font set restyle every page, each in one undo step', async ({ page }) => {
  await openEditorial(page)
  await openToolPanel(page, 'styles')
  const canvas = page.getByTestId('freeform-canvas')

  await page.getByTestId('style-palette-night-flight').click()
  await expect(canvas).toHaveCSS('background-color', 'rgb(15, 23, 42)')
  // Every page, not just this one: the inner page turns too, and its title stays readable.
  await page.getByTestId('freeform-thumb').nth(1).click()
  await expect(canvas).toHaveCSS('background-color', 'rgb(15, 23, 42)')
  await page.getByTestId('freeform-thumb').nth(0).click()

  await page.getByTestId('style-font-set-poster').click()
  await expect(titleOf(page)).toHaveCSS('font-family', /ZCOOL XiaoWei/)

  // Undo takes back the fonts, then the colours; redo brings both back.
  await page.keyboard.press('ControlOrMeta+z')
  await expect(titleOf(page)).toHaveCSS('font-family', /Songti SC/)
  await expect(canvas).toHaveCSS('background-color', 'rgb(15, 23, 42)')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(canvas).toHaveCSS('background-color', 'rgb(246, 243, 234)')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(canvas).toHaveCSS('background-color', 'rgb(15, 23, 42)')
  await expect(titleOf(page)).toHaveCSS('font-family', /ZCOOL XiaoWei/)
})

test('one of the deck\'s colours or fonts is swapped wherever it appears', async ({ page }) => {
  await openEditorial(page)
  await openToolPanel(page, 'styles')
  const drawer = page.getByTestId('freeform-styles-drawer')
  const canvas = page.getByTestId('freeform-canvas')

  // The page colour comes first among the deck's colours; a new one recolours every page that uses it.
  const pageColor = drawer.getByTestId('style-deck-color-0')
  await expect(pageColor).toHaveAttribute('aria-label', /#f6f3ea/)
  await pageColor.click()
  const hex = drawer.getByTestId('paint-popover').getByRole('textbox', { name: /自定义 HEX/ })
  await hex.fill('#fff1d6')
  await expect(canvas).toHaveCSS('background-color', 'rgb(255, 241, 214)')
  await page.keyboard.press('Escape')
  await page.getByTestId('freeform-thumb').nth(1).click()
  await expect(canvas).toHaveCSS('background-color', 'rgb(255, 241, 214)')
  await page.getByTestId('freeform-thumb').nth(0).click()

  // The serif the titles are set in becomes PingFang everywhere.
  const fonts = drawer.locator('.freeform-deck-fonts .sel-trigger')
  await expect(fonts).toHaveCount(2)
  const serif = drawer.getByTestId('style-deck-font-1')
  await serif.click()
  await page.getByRole('option', { name: '苹方 PingFang' }).click()
  await expect(titleOf(page)).toHaveCSS('font-family', /PingFang SC/)
  await expect(fonts).toHaveCount(2)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(titleOf(page)).toHaveCSS('font-family', /Songti SC/)
})

test('Escape closes the panel and returns to its rail button', async ({ page }) => {
  await openEditorial(page)
  await openToolPanel(page, 'styles')
  await page.getByTestId('style-palette-paper').focus()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('freeform-styles-drawer')).toHaveCount(0)
  await expect(page.getByTestId('freeform-styles-tool')).toBeFocused()
})
