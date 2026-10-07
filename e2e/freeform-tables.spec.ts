import { expect, test } from '@playwright/test'
import { openFreeform } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

// Tables on the freeform canvas: the Elements panel inserts a 3×3 sample
// with a bold header, it saves with the document, and v34 rejects on v33.

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

test('inserts a table that renders its header and cells and saves', async ({ page }) => {
  await openFreeform(page)

  await page.getByTestId('freeform-elements-tool').click()
  await page.getByTestId('insert-table').click()
  await page.getByTestId('freeform-elements-tool').click()

  const table = page.getByTestId('freeform-table')
  await expect(table).toBeVisible()

  // The 3×3 sample: nine cells, a header fill, no stripes by default.
  await expect(table.locator('[data-testid="freeform-table-cell"]')).toHaveCount(9)
  await expect(table.locator('[data-testid="freeform-table-header"]')).toHaveCount(1)
  await expect(table.locator('[data-testid="freeform-table-stripe"]')).toHaveCount(0)
  await expect(table.getByText('项目', { exact: true })).toBeVisible()
  await expect(table.getByText('1.2万', { exact: true })).toBeVisible()

  // Inserting is an edit: undo removes the whole table in one step, redo brings it back.
  await expect(page.getByTestId('editor-save-state')).toHaveText(/已保存/)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByTestId('freeform-table')).toHaveCount(0)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(page.getByTestId('freeform-table')).toBeVisible()

  // The stored draft carries documentVersion 34 (v34 adds the table).
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    const drafts = key ? JSON.parse(localStorage.getItem(key) ?? '[]') : []
    const draft = drafts.find((entry: { mode?: string }) => entry.mode === 'freeform-slide')
    return draft ?? null
  })
  expect(stored).not.toBeNull()
  expect(stored.document.documentVersion).toBe(34)
  expect(stored.document.slides[0].nodes[0].type).toBe('table')

  // The table survives a reload with all its cells.
  await page.reload()
  await expect(page.getByTestId('freeform-table')).toBeVisible()
  await expect(page.getByTestId('freeform-table').locator('[data-testid="freeform-table-cell"]')).toHaveCount(9)
})
