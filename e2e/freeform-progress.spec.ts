import { expect, test } from '@playwright/test'
import { openFreeform } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

// The progress element (v38): the Elements panel inserts a 65% bar sample,
// it saves with the document, and v38 rejects on v37.

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

test('inserts a progress bar that renders its track, fill, and share and saves', async ({ page }) => {
  await openFreeform(page)
  await page.getByTestId('freeform-elements-tool').click()
  await page.getByTestId('insert-progress').click()
  await page.getByTestId('freeform-elements-tool').click()
  await expect(page.getByTestId('freeform-progress')).toBeVisible()

  const progress = page.getByTestId('freeform-progress')
  // The 65% sample: one dimmed track, one accent fill two thirds across, and
  // the share riding inside the fill.
  const track = progress.locator('[data-testid="freeform-progress-track"]')
  const fill = progress.locator('[data-testid="freeform-progress-fill"]')
  await expect(track).toHaveCount(1)
  await expect(track).toHaveAttribute('fill', '#1d4ed8')
  await expect(track).toHaveAttribute('opacity', '0.14')
  await expect(fill).toHaveCount(1)
  await expect(fill).toHaveAttribute('fill', '#1d4ed8')
  await expect(fill).toHaveAttribute('width', '312')
  const percent = progress.locator('[data-testid="freeform-progress-percent"]')
  await expect(percent).toHaveText('65%')
  await expect(percent).toHaveAttribute('fill', '#ffffff')

  // Inserting is an edit: undo removes the whole bar, redo brings it back.
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByTestId('freeform-progress')).toHaveCount(0)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(page.getByTestId('freeform-progress')).toBeVisible()

  // The stored draft carries documentVersion 38 (v38 adds the progress).
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    const drafts = key ? JSON.parse(localStorage.getItem(key) ?? '[]') : []
    const draft = drafts.find((entry: { mode?: string }) => entry.mode === 'freeform-slide')
    return draft ?? null
  })
  expect(stored).not.toBeNull()
  expect(stored.document.documentVersion).toBe(38)
  expect(stored.document.slides[0].nodes[0].type).toBe('progress')
  expect(stored.document.slides[0].nodes[0].value).toBe(65)

  // The bar survives a reload with its share.
  await page.reload()
  await expect(page.getByTestId('freeform-progress')).toBeVisible()
  await expect(page.getByTestId('freeform-progress').locator('[data-testid="freeform-progress-fill"]')).toHaveCount(1)
  await expect(page.getByTestId('freeform-progress').locator('[data-testid="freeform-progress-percent"]')).toHaveText('65%')
})
