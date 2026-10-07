import { expect, test } from '@playwright/test'
import { openFreeform, startWithSettingsPanelOpen } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

// The timeline element (v36): the Elements panel inserts a four-entry sample
// down a dotted spine, it saves with the document, and v36 rejects on v35.

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The inspector tests work in the settings panel, so it starts open.
  await startWithSettingsPanelOpen(page)
})

async function insertTimeline(page: import('@playwright/test').Page) {
  await page.getByTestId('freeform-elements-tool').click()
  await page.getByTestId('insert-timeline').click()
  await page.getByTestId('freeform-elements-tool').click()
  await expect(page.getByTestId('freeform-timeline')).toBeVisible()
}

test('inserts a timeline that renders its spine, dots, and entries and saves', async ({ page }) => {
  await openFreeform(page)
  await insertTimeline(page)

  const timeline = page.getByTestId('freeform-timeline')
  // The 4-entry sample: one spine, four dots, four labels and texts.
  await expect(timeline.locator('[data-testid="freeform-timeline-spine"]')).toHaveCount(1)
  await expect(timeline.locator('[data-testid="freeform-timeline-dot"]')).toHaveCount(4)
  await expect(timeline.locator('[data-testid="freeform-timeline-label"]')).toHaveCount(4)
  await expect(timeline.locator('[data-testid="freeform-timeline-text"]')).toHaveCount(4)
  await expect(timeline.getByText('3 月', { exact: true })).toBeVisible()
  await expect(timeline.getByText('注册账号，发出第一篇笔记')).toBeVisible()
  await expect(timeline.getByText('工作室成立，全职做内容')).toBeVisible()

  // Inserting is an edit: undo removes the whole timeline in one step, redo brings it back.
  await expect(page.getByTestId('editor-save-state')).toHaveText(/已保存/)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByTestId('freeform-timeline')).toHaveCount(0)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(page.getByTestId('freeform-timeline')).toBeVisible()

  // The stored draft carries documentVersion 36 (v36 adds the timeline).
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    const drafts = key ? JSON.parse(localStorage.getItem(key) ?? '[]') : []
    const draft = drafts.find((entry: { mode?: string }) => entry.mode === 'freeform-slide')
    return draft ?? null
  })
  expect(stored).not.toBeNull()
  expect(stored.document.documentVersion).toBe(37)
  expect(stored.document.slides[0].nodes[0].type).toBe('timeline')

  // The timeline survives a reload with all its entries.
  await page.reload()
  await expect(page.getByTestId('freeform-timeline')).toBeVisible()
  await expect(page.getByTestId('freeform-timeline').locator('[data-testid="freeform-timeline-dot"]')).toHaveCount(4)
})

test('edits entries and recolors the spine in the inspector', async ({ page }) => {
  await openFreeform(page)
  await insertTimeline(page)
  const timeline = page.getByTestId('freeform-timeline')

  // The inspector mirrors the fresh sample: four entries, no accent override.
  await expect(page.getByTestId('inspector-timeline')).toBeVisible()
  await expect(page.getByTestId('timeline-items').locator('.timeline-item')).toHaveCount(4)
  await expect(page.getByTestId('timeline-accent-reset')).toHaveCount(0)

  // Editing an entry's time and text rewrites the canvas in place.
  await page.getByTestId('timeline-item-label-0').fill('一月')
  await expect(timeline.getByText('一月', { exact: true })).toBeVisible()
  await expect(timeline.getByText('3 月', { exact: true })).toHaveCount(0)
  await page.getByTestId('timeline-item-text-0').fill('发出第一条视频')
  await expect(timeline.getByText('发出第一条视频')).toBeVisible()
  // Clearing the time removes the label; the text stays.
  await page.getByTestId('timeline-item-label-0').fill('')
  await expect(timeline.locator('[data-testid="freeform-timeline-label"]')).toHaveCount(3)

  // Removing and adding entries keeps the two-entry floor and the eight-entry ceiling.
  await page.getByTestId('timeline-item-remove-0').click()
  await page.getByTestId('timeline-item-remove-0').click()
  await expect(page.getByTestId('timeline-items').locator('.timeline-item')).toHaveCount(2)
  await expect(page.getByTestId('timeline-item-remove-0')).toBeDisabled()
  await expect(timeline.locator('[data-testid="freeform-timeline-dot"]')).toHaveCount(2)
  for (let i = 0; i < 6; i += 1) await page.getByTestId('timeline-item-add').click()
  await expect(page.getByTestId('timeline-item-add')).toBeDisabled()
  await expect(timeline.locator('[data-testid="freeform-timeline-dot"]')).toHaveCount(8)

  // The accent recolors the spine and the dots; 恢复默认 returns to blue.
  await page.getByRole('button', { name: '主线颜色', exact: true }).click()
  const hex = page.getByLabel('主线颜色 自定义 HEX', { exact: true })
  await hex.fill('#0f766e')
  await hex.press('Enter')
  await page.keyboard.press('Escape')
  await expect(timeline.locator('[data-testid="freeform-timeline-spine"]')).toHaveAttribute('stroke', '#0f766e')
  await expect(timeline.locator('[data-testid="freeform-timeline-dot"]').first()).toHaveAttribute('fill', '#0f766e')
  await page.getByTestId('timeline-accent-reset').click()
  await expect(timeline.locator('[data-testid="freeform-timeline-spine"]')).toHaveAttribute('stroke', '#1d4ed8')

  // The ink recolors the entries' words; 恢复默认 returns to the grey.
  await page.getByRole('button', { name: '墨色', exact: true }).click()
  const inkHex = page.getByLabel('墨色 自定义 HEX', { exact: true })
  await inkHex.fill('#1f2937')
  await inkHex.press('Enter')
  await page.keyboard.press('Escape')
  await expect(timeline.locator('[data-testid="freeform-timeline-text"]').first()).toHaveAttribute('fill', '#1f2937')
  await page.getByTestId('timeline-ink-reset').click()
  await expect(timeline.locator('[data-testid="freeform-timeline-text"]').first()).toHaveAttribute('fill', '#3f3f46')
  await expect(page.getByTestId('timeline-ink-reset')).toHaveCount(0)
})

test('turns the timeline horizontal in the inspector', async ({ page }) => {
  await openFreeform(page)
  await insertTimeline(page)
  const timeline = page.getByTestId('freeform-timeline')

  // The fresh sample runs down a left spine: a tall line beside left-anchored words.
  await expect(page.getByTestId('timeline-direction-vertical')).toHaveAttribute('aria-pressed', 'true')
  const spine = timeline.locator('[data-testid="freeform-timeline-spine"]')
  await expect(spine).toHaveAttribute('x1', '14')
  await expect(spine).toHaveAttribute('x2', '14')
  await expect(timeline.locator('[data-testid="freeform-timeline-label"]').first()).toHaveAttribute('text-anchor', 'start')

  // 横排 lays the spine along the top with the entries side by side, centred.
  await page.getByTestId('timeline-direction-horizontal').click()
  await expect(page.getByTestId('timeline-direction-horizontal')).toHaveAttribute('aria-pressed', 'true')
  await expect(spine).toHaveAttribute('y1', '14')
  await expect(spine).toHaveAttribute('y2', '14')
  const firstDot = timeline.locator('[data-testid="freeform-timeline-dot"]').first()
  const dotX = Number(await firstDot.getAttribute('cx'))
  expect(dotX).toBeGreaterThan(0)
  await expect(timeline.locator('[data-testid="freeform-timeline-label"]').first()).toHaveAttribute('text-anchor', 'middle')
  // The words stay under the spine, next to their dots.
  const labelY = Number(await timeline.locator('[data-testid="freeform-timeline-label"]').first().getAttribute('y'))
  expect(labelY).toBeGreaterThan(14)
  // The horizontal switch is one history step: undo returns to the vertical spine.
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(spine).toHaveAttribute('x1', '14')
  await expect(spine).toHaveAttribute('x2', '14')
})
