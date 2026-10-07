import { expect, test } from '@playwright/test'
import { openFreeform, startWithSettingsPanelOpen } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

// Tables on the freeform canvas: the Elements panel inserts a 3×3 sample
// with a bold header, it saves with the document, and v34 rejects on v33.

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The inspector tests work in the settings panel, so it starts open.
  await startWithSettingsPanelOpen(page)
})

async function insertTable(page: import('@playwright/test').Page) {
  await page.getByTestId('freeform-elements-tool').click()
  await page.getByTestId('insert-table').click()
  await page.getByTestId('freeform-elements-tool').click()
  await expect(page.getByTestId('freeform-table')).toBeVisible()
}

test('inserts a table that renders its header and cells and saves', async ({ page }) => {
  await openFreeform(page)
  await insertTable(page)

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

test('edits cells and toggles the header and stripes in the inspector', async ({ page }) => {
  await openFreeform(page)
  await insertTable(page)
  const table = page.getByTestId('freeform-table')

  // The inspector mirrors the fresh 3×3: header on, stripes off, nine inputs.
  await expect(page.getByTestId('inspector-table')).toBeVisible()
  await expect(page.getByTestId('table-header-on')).toHaveClass(/on/)
  await expect(page.getByTestId('table-striped-off')).toHaveClass(/on/)
  await expect(page.getByTestId('table-cell-rows').locator('input')).toHaveCount(9)

  // Editing a cell rewrites the canvas in place (row-major: cell 3 is the second row's label).
  await page.getByTestId('table-cell-3').fill('播放')
  await expect(table.getByText('播放', { exact: true })).toBeVisible()
  await expect(table.getByText('阅读', { exact: true })).toHaveCount(0)

  // 斑马纹 paints one stripe across the two body rows; one click is one undo step.
  await page.getByTestId('table-striped-on').click()
  await expect(page.getByTestId('table-striped-on')).toHaveClass(/on/)
  await expect(table.locator('[data-testid="freeform-table-stripe"]')).toHaveCount(1)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(table.locator('[data-testid="freeform-table-stripe"]')).toHaveCount(0)

  // Hiding the header removes its fill but keeps every cell and the stripes' baseline.
  await page.getByTestId('table-header-off').click()
  await expect(page.getByTestId('table-header-off')).toHaveClass(/on/)
  await expect(table.locator('[data-testid="freeform-table-header"]')).toHaveCount(0)
  await expect(table.locator('[data-testid="freeform-table-cell"]')).toHaveCount(9)
  await page.getByTestId('table-striped-on').click()
  await expect(table.locator('[data-testid="freeform-table-stripe"]')).toHaveCount(1)

  // 显示 brings the header back in one undo step from the striped state.
  await page.getByTestId('table-header-on').click()
  await expect(table.locator('[data-testid="freeform-table-header"]')).toHaveCount(1)
})

test('resizes rows and columns and pastes a spreadsheet block', async ({ page }) => {
  await openFreeform(page)
  await insertTable(page)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const table = page.getByTestId('freeform-table')

  // Adding a column and removing a row keeps every cell that still has a place.
  await page.getByTestId('table-col-add').click()
  await expect(page.getByTestId('table-cell-rows').locator('input')).toHaveCount(12)
  await page.getByTestId('table-row-remove').click()
  await expect(page.getByTestId('table-cell-rows').locator('input')).toHaveCount(8)
  // Only the filled cells draw text: the two new empty column cells stay blank
  // and the third row (涨粉, 320, 210) went with the row removal.
  await expect(table.getByText('项目', { exact: true })).toBeVisible()
  await expect(table.getByText('1.2万', { exact: true })).toBeVisible()
  await expect(table.getByText('涨粉', { exact: true })).toHaveCount(0)

  // The two-row floor and the six-column ceiling hold.
  await expect(page.getByTestId('table-row-remove')).toBeDisabled()
  for (let i = 0; i < 2; i += 1) await page.getByTestId('table-col-add').click()
  await expect(page.getByTestId('table-col-add')).toBeDisabled()

  // A tab-separated block replaces the whole grid, header included.
  await page.evaluate(() => navigator.clipboard.writeText('指标\tA\tB\n一月\t10\t20\n二月\t24\t12'))
  await page.getByTestId('table-paste-data').click()
  await expect(page.getByTestId('table-cell-rows').locator('input')).toHaveCount(9)
  await expect(table.getByText('指标', { exact: true })).toBeVisible()
  await expect(table.getByText('24', { exact: true })).toBeVisible()

  // Ragged rows fill out to the widest row's width; one paste is one undo step.
  await page.evaluate(() => navigator.clipboard.writeText('甲\t乙\n丙'))
  await page.getByTestId('table-paste-data').click()
  await expect(page.getByTestId('table-cell-rows').locator('input')).toHaveCount(4)
  await expect(table.getByText('丙', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByTestId('table-cell-rows').locator('input')).toHaveCount(9)

  // Unparsable text explains itself and leaves the table alone.
  await page.evaluate(() => navigator.clipboard.writeText('   '))
  await page.getByTestId('table-paste-data').click()
  await expect(page.getByText('粘贴内容读不出表格')).toBeVisible()
  await expect(table.getByText('指标', { exact: true })).toBeVisible()
})
