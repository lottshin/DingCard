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
  expect(stored.document.documentVersion).toBe(36)
  expect(stored.document.slides[0].nodes[0].type).toBe('timeline')

  // The timeline survives a reload with all its entries.
  await page.reload()
  await expect(page.getByTestId('freeform-timeline')).toBeVisible()
  await expect(page.getByTestId('freeform-timeline').locator('[data-testid="freeform-timeline-dot"]')).toHaveCount(4)
})
