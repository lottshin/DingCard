import { expect, test } from '@playwright/test'
import { openFreeformTemplateGallery, openToolPanel } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

// Posters are one-page templates in other sizes: the gallery filters by size,
// every preview keeps its page's proportions, and a poster opens at its size.

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

test('the gallery filters templates by size, and a poster opens as one page at its own size', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await openFreeformTemplateGallery(page)
  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  const filters = dialog.getByRole('group', { name: '按尺寸筛选' })
  await expect(filters.getByRole('button')).toHaveText(['全部', '小红书套图', '竖版海报', '方图', '横版封面', '公众号首图', 'A4 印刷'])

  await dialog.getByTestId('template-format-story').click()
  await expect(dialog.getByTestId('template-format-story')).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.locator('.template-tile')).toHaveCount(5)
  await expect(dialog.locator('.template-detail-series')).toHaveText('讲座')
  // The preview keeps the 9:16 page's proportions.
  const preview = await dialog.locator('.template-tile').first().locator('.template-freeform-preview').boundingBox()
  expect(preview!.height / preview!.width).toBeCloseTo(16 / 9, 1)

  await dialog.getByTestId('template-format-landscape').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(1)
  await expect(dialog.locator('.template-detail-copy h3')).toHaveText('横版封面 · 1920×1080')
  await dialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
  await expect(page.locator('.freeform-thumb')).toHaveCount(1)
  await expect(page.getByTestId('freeform-canvas')).toContainText('看懂复利')
  await expect(page.getByRole('button', { name: /16:9 · 1920×1080px/ })).toBeVisible()
})

test('the templates panel groups templates by size, landscape ones across the row', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await openToolPanel(page, 'templates')
  const panel = page.getByTestId('freeform-templates-drawer')
  await expect(panel.locator('.freeform-drawer-section')).toHaveText(['小红书套图', '竖版海报', '方图', '横版封面', '公众号首图', 'A4 印刷'])
  const cover = panel.getByTestId('freeform-template-tile-video-cover-freeform')
  await expect(cover).toHaveClass(/is-wide/)
  await expect(cover.locator('.freeform-template-tile-meta')).toHaveText('16:9')
  const tile = await cover.boundingBox()
  const square = await panel.getByTestId('freeform-template-tile-quote-card-freeform').boundingBox()
  expect(tile!.width).toBeGreaterThan(square!.width * 1.8)
})
