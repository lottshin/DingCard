import { expect, test } from '@playwright/test'
import { openFreeformTemplateGallery, openToolPanel } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

// Templates go into the open work a page at a time (Canva's way): a poster in
// one click, a deck's pages one by one or all together, after the active page
// or in place of it while it is empty. Different pages, different templates.

test.use({ viewport: { width: 1440, height: 900 } })

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

const pageNames = (page: import('@playwright/test').Page) => page.getByTestId('freeform-thumb-title')

test('a deck opens to its pages: one fills the empty page, the rest follow the active page', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await openToolPanel(page, 'templates')
  const panel = page.getByTestId('freeform-templates-drawer')

  await panel.getByTestId('freeform-template-tile-editorial-freeform').click()
  const pages = panel.getByTestId('freeform-template-pages')
  await expect(pages.getByRole('heading', { name: '编辑部' })).toBeVisible()
  await expect(pages.locator('.freeform-template-tile')).toHaveCount(3)
  await expect(panel.getByTestId('freeform-template-back')).toBeFocused()

  // The new work's page is empty: the template page takes its place.
  await pages.getByRole('button', { name: '加入第 2 页' }).click()
  await expect(pageNames(page)).toHaveText(['内页'])
  await expect(page.getByTestId('freeform-canvas').getByText('都要往前走')).toBeVisible()

  // Now it has words: the whole deck comes in after it, and its cover becomes the active page.
  await pages.getByTestId('freeform-template-add-all').click()
  await expect(pageNames(page)).toHaveText(['内页', '封面', '内页', '结尾'])
  await expect(page.getByTestId('freeform-thumb').nth(1)).toHaveAttribute('aria-current', 'page')

  // One step back each.
  await page.keyboard.press('ControlOrMeta+z')
  await expect(pageNames(page)).toHaveText(['内页'])

  // Escape goes back to the list, onto the deck it came from; the next one closes the panel.
  await panel.getByTestId('freeform-template-back').focus()
  await page.keyboard.press('Escape')
  await expect(pages).toHaveCount(0)
  await expect(panel.getByTestId('freeform-template-tile-editorial-freeform')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
})

test('a poster goes in with one click at its own size, and its size leads the list next time', async ({ page }) => {
  await page.goto('/#/edit/canvas/template/editorial-freeform')
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(3)
  await page.getByTestId('freeform-thumb').first().click()
  await openToolPanel(page, 'templates')
  const panel = page.getByTestId('freeform-templates-drawer')
  await expect(panel.locator('.freeform-drawer-section').first()).toHaveText('小红书')

  await panel.getByTestId('freeform-template-tile-quote-card-freeform').click()
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(4)
  await expect(page.getByTestId('freeform-thumb').nth(1)).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('freeform-slide-size')).toHaveText('1:1 · 1080×1080px')
  // The list doesn't reshuffle while it is open…
  await expect(panel.locator('.freeform-drawer-section').first()).toHaveText('小红书')

  // …but opens on the square sizes once the active page is square.
  await page.getByTestId('freeform-template-button').click()
  await expect(panel).toHaveCount(0)
  await openToolPanel(page, 'templates')
  await expect(page.getByTestId('freeform-templates-drawer').locator('.freeform-drawer-section').first()).toHaveText('方图')
})

test('the gallery adds a template to the open work instead of starting a new one', async ({ page }) => {
  await page.goto('/#/edit/canvas/template/editorial-freeform')
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(3)
  await openFreeformTemplateGallery(page)
  const gallery = page.getByRole('dialog', { name: '从一套成品开始' })
  await gallery.getByRole('button', { name: '预览清单' }).click()
  await gallery.getByTestId('template-add-to-work').click()
  await expect(gallery).toHaveCount(0)
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(6)
  // Still the same project.
  await expect(page.getByTestId('editor-title')).toHaveText('编辑部')
})
