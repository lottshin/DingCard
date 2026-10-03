import { expect, test, type Page } from '@playwright/test'
import { openToolPanel, startWithSettingsPanelOpen } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

// 花字 in the text panel give a text a ready-made look; 效果 in the settings
// panel picks one effect and sets it. Effects draw on a copy of the words
// under the text (.freeform-text-effect).

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  await startWithSettingsPanelOpen(page)
})

async function openEditorial(page: Page) {
  await page.goto('/#/edit/canvas/template/editorial-freeform')
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(3)
}

const titleNode = (page: Page) => page.getByTestId('freeform-canvas').locator('[data-scene-node-id]', { has: page.locator('.freeform-textbox', { hasText: '开头先把' }) })

async function selectTitle(page: Page) {
  await titleNode(page).locator('.freeform-textbox').click({ position: { x: 24, y: 24 } })
  await expect(page.getByTestId('freeform-context-toolbar')).toHaveAttribute('data-subject', 'text')
}

test('a 花字 gives the selected text its look in one step; with nothing selected it adds a heading in it', async ({ page }) => {
  await openEditorial(page)
  await openToolPanel(page, 'text')
  await selectTitle(page)

  await page.getByTestId('text-style-label').click()
  // A band in each paragraph, behind each of its lines.
  const band = titleNode(page).locator('.freeform-text-effect .freeform-text-effect-band')
  await expect(band.first()).toHaveCSS('background-color', 'rgb(24, 24, 27)')
  await expect(titleNode(page).locator('.freeform-textbox')).toHaveCSS('color', 'rgb(255, 255, 255)')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(titleNode(page).locator('.freeform-text-effect')).toHaveCount(0)

  // Nothing selected: a new heading in the look.
  await page.getByTestId('freeform-canvas').click({ position: { x: 8, y: 8 } })
  await expect(page.getByTestId('freeform-context-toolbar')).toHaveAttribute('data-subject', 'page')
  await page.getByTestId('text-style-neon-cyan').click()
  const heading = page.getByTestId('freeform-canvas').locator('[data-scene-node-id]', { has: page.locator('.freeform-textbox', { hasText: '添加标题' }) })
  await expect(heading.locator('.freeform-text-effect')).toHaveCSS('text-shadow', /rgba\(34, 211, 238, 0\.95\)/)
})

test('效果 picks an effect, sets its size and direction, and takes it off', async ({ page }) => {
  await openEditorial(page)
  await selectTitle(page)
  const panel = page.getByTestId('inspector-text-effect')
  await panel.scrollIntoViewIfNeeded()
  await expect(panel.getByTestId('text-effect-none')).toHaveAttribute('aria-pressed', 'true')

  await panel.getByTestId('text-effect-extrude').click()
  await expect(panel.getByTestId('text-effect-extrude')).toHaveAttribute('aria-pressed', 'true')
  const layer = titleNode(page).locator('.freeform-text-effect')
  const shadows = async () => (await layer.evaluate((node) => getComputedStyle(node).textShadow)).split('px, ').length
  const before = await shadows()
  const depth = panel.getByRole('spinbutton', { name: '厚度' })
  await depth.fill('90')
  await depth.press('Enter')
  await expect.poll(shadows).toBeGreaterThan(before)

  await panel.getByTestId('text-effect-none').click()
  await expect(layer).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(layer).toHaveCount(1)
})

test('hollow words keep only their outline in the text colour', async ({ page }) => {
  await openEditorial(page)
  await selectTitle(page)
  await page.getByTestId('inspector-text-effect').getByTestId('text-effect-hollow').click()
  const words = titleNode(page).locator('.freeform-textbox')
  await expect(words).toHaveCSS('-webkit-text-fill-color', 'rgba(0, 0, 0, 0)')
  await expect(words).toHaveCSS('-webkit-text-stroke-color', 'rgb(27, 26, 24)')
  await expect(titleNode(page).locator('.freeform-text-effect')).toHaveCount(0)
})
