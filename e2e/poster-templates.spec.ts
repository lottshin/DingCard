import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
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
  await expect(filters.getByRole('button')).toHaveText(['全部尺寸', '小红书', '竖版海报', '方图', '横版封面', '公众号首图', 'A4 印刷', 'A4 横版', '朋友圈九宫格', '收藏'])

  await dialog.getByTestId('template-format-story').click()
  await expect(dialog.getByTestId('template-format-story')).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.locator('.template-tile')).toHaveCount(23)
  await expect(dialog.locator('.template-detail-series')).toHaveText('价目表')
  // The preview keeps the 9:16 page's proportions.
  const preview = await dialog.locator('.template-tile').first().locator('.template-freeform-preview').boundingBox()
  expect(preview!.height / preview!.width).toBeCloseTo(16 / 9, 1)

  await dialog.getByTestId('template-format-landscape').click()
  // The 16:9 decks come first; the video cover is a poster.
  await expect(dialog.locator('.template-tile')).toHaveCount(7)
  await dialog.getByRole('button', { name: '预览视频封面' }).click()
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
  await expect(panel.locator('.freeform-drawer-section')).toHaveText(['小红书', '竖版海报', '方图', '横版封面', '公众号首图', 'A4 印刷', 'A4 横版', '朋友圈九宫格'])
  const cover = panel.getByTestId('freeform-template-tile-video-cover-freeform')
  await expect(cover).toHaveClass(/is-wide/)
  await expect(cover.locator('.freeform-template-tile-meta')).toHaveText('16:9')
  const tile = await cover.boundingBox()
  const square = await panel.getByTestId('freeform-template-tile-quote-card-freeform').boundingBox()
  expect(tile!.width).toBeGreaterThan(square!.width * 1.8)
})

const today = () => new Date().toISOString().slice(0, 10)

test('the Moments grid opens as one 3240 square with its cuts marked, and exports as nine squares in posting order', async ({ page }) => {
  await page.goto('/#/edit/canvas/template/moments-grid-freeform')
  await expect(page.getByTestId('freeform-slide-size')).toHaveText('九宫格 · 3240×3240px')
  await expect(page.getByTestId('freeform-guide')).toHaveCount(4)

  await page.getByTestId('freeform-export').click()
  const options = page.getByTestId('freeform-export-options')
  const downloaded = page.waitForEvent('download')
  await options.getByTestId('freeform-export-grid').click()
  const file = await downloaded
  expect(file.suggestedFilename()).toBe(`freeform-grid-${today()}.zip`)
  const zip = await JSZip.loadAsync(await readFile((await file.path())!))
  expect(Object.keys(zip.files).sort()).toEqual(Array.from({ length: 9 }, (_, index) => `grid-${index + 1}.png`))
  const first = await zip.file('grid-1.png')!.async('nodebuffer')
  expect({ width: first.readUInt32BE(16), height: first.readUInt32BE(20) }).toEqual({ width: 1080, height: 1080 })
})

test('only a square page offers 切成九宫格', async ({ page }) => {
  await page.goto('/#/edit/canvas/template/editorial-freeform')
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(3)
  await page.getByTestId('freeform-export').click()
  const options = page.getByTestId('freeform-export-options')
  await expect(options.getByTestId('freeform-export-long')).toBeVisible()
  await expect(options.getByTestId('freeform-export-grid')).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.getByTestId('page-size-trigger').click()
  await page.getByTestId('page-size-popover').getByRole('button', { name: '1:1', exact: true }).click()
  await page.getByTestId('freeform-export').click()
  await expect(options.getByTestId('freeform-export-grid')).toBeVisible()
  await options.getByTestId('export-format-pdf').click()
  await expect(options.getByTestId('freeform-export-grid')).toHaveCount(0)
})

for (const [templateId, size, words] of [
  ['timetable-freeform', 'A4 横 · 1754×1240px', ['课程表', '周五']],
  ['certificate-freeform', 'A4 横 · 1754×1240px', ['荣誉证书', '林一']],
  ['menu-freeform', 'A4 · 1240×1754px', ['今日菜单', '燕麦拿铁']],
  ['note-cover-freeform', '3:4 · 1080×1440px', ['干货分享']],
  ['compare-table-freeform', '9:16 · 1080×1920px', ['看这张表', '12 元/月']],
  ['growth-timeline-freeform', '9:16 · 1080×1920px', ['这一年，慢慢长大', '接到第一单商单合作', '12 月']],
  ['exhibition-poster-freeform', '9:16 · 1080×1920px', ['exhibition.', '光与影的漫游']],
  ['dessert-menu-freeform', 'A4 · 1240×1754px', ['五月甜品', '栗子蛋糕']],
  ['pitch-cover-freeform', '16:9 · 1920×1080px', ['增长计划']],
] as const) {
  test(`${templateId} opens at its size with its words`, async ({ page }) => {
    await page.goto(`/#/edit/canvas/template/${templateId}`)
    await expect(page.getByTestId('freeform-slide-size')).toHaveText(size)
    for (const word of words) await expect(page.getByTestId('freeform-canvas')).toContainText(word)
  })
}

test('compare-table opens with its colored, weighted columns', async ({ page }) => {
  await page.goto('/#/edit/canvas/template/compare-table-freeform')
  const table = page.getByTestId('freeform-table')
  await expect(table).toBeVisible()

  // The template's colors paint the header, the rules and the text; the body rows stay plain.
  await expect(table.locator('[data-testid="freeform-table-header"]')).toHaveAttribute('fill', '#dbe2fb')
  await expect(table.locator('[data-testid="freeform-table-stripe"]')).toHaveCount(0)
  await expect(table.locator('[data-testid="freeform-table-grid"] line').first()).toHaveAttribute('stroke', '#c9c4b8')
  await expect(table.locator('[data-testid="freeform-table-cell"]').first()).toHaveAttribute('fill', '#171717')

  // A rule under each row and none down the columns.
  const upright = await table.locator('line').evaluateAll((lines) => lines.filter((line) => line.getAttribute('x1') === line.getAttribute('x2')).length)
  expect(upright).toBe(0)

  // The label column takes 1.3 of the 3.3 shares: the header words sit at the columns' centres.
  const centres = await table.locator('[data-testid="freeform-table-cell"]').evaluateAll((cells) => cells.slice(0, 3).map((cell) => Number(cell.getAttribute('x'))))
  expect(centres[0]).toBeCloseTo((952 * 1.3) / 3.3 / 2, 0)
  expect(centres[1]).toBeCloseTo((952 * 1.8) / 3.3, 0)
  expect(centres[2]).toBeCloseTo((952 * 2.8) / 3.3, 0)
})
