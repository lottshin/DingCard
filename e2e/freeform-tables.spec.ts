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
  expect(stored.document.documentVersion).toBe(39)
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

test('recolors the ink, header, and stripes through the pickers', async ({ page }) => {
  await openFreeform(page)
  await insertTable(page)
  const table = page.getByTestId('freeform-table')

  // Stripes on first so the stripe fill has something to paint.
  await page.getByTestId('table-striped-on').click()
  await expect(table.locator('[data-testid="freeform-table-stripe"]')).toHaveCount(1)

  // The ink repaints the cell text and the grid lines.
  await page.getByRole('button', { name: '墨色', exact: true }).click()
  const inkHex = page.getByLabel('墨色 自定义 HEX', { exact: true })
  await inkHex.fill('#0f766e')
  await inkHex.press('Enter')
  await page.keyboard.press('Escape')
  await expect(table.locator('line').first()).toHaveAttribute('stroke', '#0f766e')
  await expect(table.locator('[data-testid="freeform-table-cell"]').first()).toHaveAttribute('fill', '#0f766e')

  // The header fill paints at full strength once set.
  await page.getByRole('button', { name: '表头底色', exact: true }).click()
  const headerHex = page.getByLabel('表头底色 自定义 HEX', { exact: true })
  await headerHex.fill('#ccfbf1')
  await headerHex.press('Enter')
  await page.keyboard.press('Escape')
  await expect(table.locator('[data-testid="freeform-table-header"]')).toHaveAttribute('fill', '#ccfbf1')
  await expect(table.locator('[data-testid="freeform-table-header"]')).toHaveAttribute('opacity', '1')

  // The stripe fill paints the zebra row outright.
  await page.getByRole('button', { name: '斑马纹底色', exact: true }).click()
  const stripeHex = page.getByLabel('斑马纹底色 自定义 HEX', { exact: true })
  await stripeHex.fill('#f0fdfa')
  await stripeHex.press('Enter')
  await page.keyboard.press('Escape')
  await expect(table.locator('[data-testid="freeform-table-stripe"]')).toHaveAttribute('fill', '#f0fdfa')

  // 恢复默认 removes the override: the header returns to the ink's tint.
  await page.getByTestId('table-header-reset').click()
  await expect(table.locator('[data-testid="freeform-table-header"]')).toHaveAttribute('fill', '#0f766e')
  await expect(table.locator('[data-testid="freeform-table-header"]')).toHaveAttribute('opacity', '0.08')

  // Undo restores the painted header fill in one step.
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(table.locator('[data-testid="freeform-table-header"]')).toHaveAttribute('fill', '#ccfbf1')
})

test('drags a column border to rebalance the columns', async ({ page }) => {
  await openFreeform(page)
  await insertTable(page)
  const table = page.getByTestId('freeform-table')

  // A selected 3-column table shows a handle on each of its two inner borders.
  await expect(page.getByTestId('freeform-table-col-handle-0')).toBeVisible()
  await expect(page.getByTestId('freeform-table-col-handle-1')).toBeVisible()
  await expect(page.getByTestId('freeform-table-col-handle-2')).toHaveCount(0)

  // The inner vertical grid lines, in the table's own pixels.
  const innerEdges = async () => table.locator('line').evaluateAll((lines) =>
    lines
      .map((line) => ({ x1: Number(line.getAttribute('x1')), x2: Number(line.getAttribute('x2')) }))
      .filter(({ x1, x2 }) => x1 === x2 && x1 > 0 && x1 < 480)
      .map(({ x1 }) => x1)
      .sort((a, b) => a - b),
  )
  const before = await innerEdges()
  expect(before).toEqual([160, 320])

  // Dragging the first border right widens the first column and narrows the second.
  const handle = await page.getByTestId('freeform-table-col-handle-0').boundingBox()
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle!.x + handle!.width / 2 + 60, handle!.y + handle!.height / 2, { steps: 4 })
  await page.mouse.up()

  const after = await innerEdges()
  expect(after[0]).toBeGreaterThan(before[0] + 10)
  expect(after[1]).toBeCloseTo(before[1], 0)
  // The first cell's text rides along with its wider column.
  const firstCellX = await table.locator('[data-testid="freeform-table-cell"]').first().getAttribute('x')
  expect(Number(firstCellX)).toBeCloseTo(after[0] / 2, 0)

  // One drag is one undo step: the columns come back even.
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(await innerEdges()).toEqual([160, 320])
})
