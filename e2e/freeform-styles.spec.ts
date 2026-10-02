import { expect, test, type Page } from '@playwright/test'
import { openToolPanel, startWithSettingsPanelOpen } from './freeformTools'
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
  await expect(titleOf(page)).toHaveCSS('font-family', /Noto Serif SC/)
  await expect(canvas).toHaveCSS('background-color', 'rgb(15, 23, 42)')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(canvas).toHaveCSS('background-color', 'rgb(246, 243, 234)')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(canvas).toHaveCSS('background-color', 'rgb(15, 23, 42)')
  await expect(titleOf(page)).toHaveCSS('font-family', /ZCOOL XiaoWei/)
})

test('a look puts its palette and fonts on together, in one undo step', async ({ page }) => {
  await openEditorial(page)
  await openToolPanel(page, 'styles')
  const canvas = page.getByTestId('freeform-canvas')

  await page.getByTestId('style-look-neon-night').click()
  await expect(canvas).toHaveCSS('background-color', 'rgb(10, 14, 26)')
  await expect(titleOf(page)).toHaveCSS('font-family', /ZCOOL XiaoWei/)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(canvas).toHaveCSS('background-color', 'rgb(246, 243, 234)')
  await expect(titleOf(page)).toHaveCSS('font-family', /Noto Serif SC/)
})

test('全部替换 carries one text\'s new colour or font to every page', async ({ page }) => {
  await startWithSettingsPanelOpen(page)
  await openEditorial(page)
  const canvas = page.getByTestId('freeform-canvas')
  const innerTitle = canvas.locator('.freeform-textbox', { hasText: '每一页' })
  const selectTitle = async () => {
    await titleOf(page).click({ position: { x: 24, y: 24 } })
    await expect(page.getByTestId('freeform-context-toolbar')).toHaveAttribute('data-subject', 'text')
  }

  // The colour picker offers the deck's own colours; after a change, 全部替换 recolours the old colour everywhere.
  await selectTitle()
  await page.getByTestId('text-fill-paint').locator('.paint-color-button').first().click()
  const popover = page.getByTestId('paint-popover')
  await expect(popover.getByTestId('paint-deck-grid').locator('.paint-swatch').first()).toBeVisible()
  await expect(popover.getByTestId('paint-replace-all')).toHaveCount(0)
  await popover.getByRole('textbox', { name: /自定义 HEX/ }).fill('#2f5d50')
  await popover.getByTestId('paint-replace-all').click()
  await expect(popover.getByTestId('paint-replace-all')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByTestId('freeform-thumb').nth(1).click()
  await expect(innerTitle).toHaveCSS('color', 'rgb(47, 93, 80)')

  // A new font for one text, then 全部替换 for every text still in the old one.
  await page.getByTestId('freeform-thumb').nth(0).click()
  await selectTitle()
  await page.getByTestId('freeform-font-select').click()
  await page.getByRole('option', { name: '苹方 PingFang' }).click()
  await expect(titleOf(page)).toHaveCSS('font-family', /PingFang SC/)
  await page.getByTestId('freeform-font-swap').click()
  await expect(page.getByTestId('freeform-font-swap')).toHaveCount(0)
  await page.getByTestId('freeform-thumb').nth(1).click()
  await expect(innerTitle).toHaveCSS('font-family', /PingFang SC/)
  await page.keyboard.press('ControlOrMeta+z')
  await page.getByTestId('freeform-thumb').nth(1).click()
  await expect(innerTitle).toHaveCSS('font-family', /Noto Serif SC/)
})

test('Escape closes the panel and returns to its rail button', async ({ page }) => {
  await openEditorial(page)
  await openToolPanel(page, 'styles')
  await page.getByTestId('style-palette-paper').focus()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('freeform-styles-drawer')).toHaveCount(0)
  await expect(page.getByTestId('freeform-styles-tool')).toBeFocused()
})
