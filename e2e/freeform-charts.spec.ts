// The chart element (v24): insert, edit the series, switch kinds and colours,
// and round-trip documents that carry one.

import { expect, test } from '@playwright/test'
import {
  openFreeform,
  openStoredDrafts,
  registerUser,
  startWithSettingsPanelOpen,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

async function insertChart(page: import('@playwright/test').Page) {
  await page.getByTestId('freeform-elements-tool').click()
  await page.getByTestId('insert-chart').click()
  await page.getByTestId('freeform-elements-tool').click()
  await expect(page.getByTestId('freeform-chart')).toBeVisible()
}

/** The rendered bar heights, in the chart's view-box pixels; the legend's
 *  colour chips are rects too, so they stay out of the count. */
async function barHeights(page: import('@playwright/test').Page) {
  return page.getByTestId('freeform-chart').locator('rect').evaluateAll((rects) =>
    rects
      .filter((rect) => !(rect as SVGRectElement).closest('[data-testid="freeform-chart-legend-item"]'))
      .map((bar) => Math.round(Number((bar as SVGRectElement).getAttribute('height')))))
}

test('inserts a bar chart with its sample series', async ({ page }) => {
  await openFreeform(page)

  await insertChart(page)
  const chart = page.getByTestId('freeform-chart')
  // Four sample bars rise from the baseline; the categories sit under them.
  await expect(chart.locator('rect')).toHaveCount(4)
  const heights = await barHeights(page)
  expect(heights).toHaveLength(4)
  expect(heights.every((height) => height > 0)).toBe(true)
  await expect(chart.locator('text')).toContainText(['一月', '二月', '三月', '四月'])

  // The layer list and the context toolbar name it.
  await expect(page.getByTestId('freeform-context-toolbar').getByText('柱状图')).toBeVisible()

  // Value labels are off by default.
  await expect(chart.getByText('4', { exact: true })).toHaveCount(0)
})

test('edits the series through the data rows', async ({ page }) => {
  await openFreeform(page)
  await insertChart(page)
  const before = await barHeights(page)

  // Raise the second value: it becomes the tallest, the others rescale down
  // as the axis rounds its top up (9 -> 10 becomes 12 -> 20).
  const secondValue = page.getByLabel('第 2 项数值', { exact: true })
  await secondValue.fill('12')
  const after = await barHeights(page)
  expect(after[1]).toBeGreaterThan(after[0])
  expect(after[0]).toBeLessThan(before[0])
  await expect(page.getByTestId('freeform-chart').getByText('20', { exact: true })).toHaveCount(1)

  // Rename a label.
  const secondLabel = page.getByLabel('第 2 项标签', { exact: true })
  await secondLabel.fill('二月二')
  await expect(page.getByTestId('freeform-chart').getByText('二月二')).toHaveCount(1)

  // Add a point, then remove it: back to four bars.
  await page.getByTestId('chart-data-add').click()
  await expect(page.getByTestId('freeform-chart').locator('rect')).toHaveCount(5)
  await page.getByTestId('chart-data-remove-4').click()
  await expect(page.getByTestId('freeform-chart').locator('rect')).toHaveCount(4)

  // The remove floor: down to one point, the remove buttons disappear too.
  for (let index = 3; index >= 1; index -= 1) {
    await page.getByTestId(`chart-data-remove-${index}`).click()
  }
  await expect(page.getByTestId('freeform-chart').locator('rect')).toHaveCount(1)
  await expect(page.locator('[data-testid^="chart-data-remove"]')).toHaveCount(0)
})

test('switches kinds and styles with one history entry each', async ({ page }) => {
  await openFreeform(page)
  await insertChart(page)
  const chart = page.getByTestId('freeform-chart')

  // Ring: three sample segments with the 50%-largest labelled only when asked.
  await page.getByTestId('chart-kind-ring').click()
  await expect(chart.locator('rect')).toHaveCount(0)
  const segments = chart.locator('[data-testid="freeform-chart-segment"]')
  await expect(segments).toHaveCount(4)
  await expect(chart.getByText('%')).toHaveCount(0)

  // Line: a polyline with a dot per point.
  await page.getByTestId('chart-kind-line').click()
  await expect(chart.locator('polyline')).toHaveCount(1)
  await expect(chart.locator('circle')).toHaveCount(4)

  // Value labels turn on for the line, then undo restores the plain line.
  await page.getByRole('button', { name: '显示', exact: true }).click()
  await expect(chart.getByText('4', { exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(chart.getByText('4', { exact: true })).toHaveCount(0)
  await expect(chart.locator('polyline')).toHaveCount(1)

  // The series colour recolours the line; one undo lands back on the default blue.
  await page.getByRole('button', { name: '系列颜色', exact: true }).click()
  const hex = page.getByLabel('系列颜色 自定义 HEX', { exact: true })
  await hex.fill('#dc2626')
  await hex.press('Enter')
  await page.keyboard.press('Escape')
  await expect(chart.locator('polyline')).toHaveAttribute('stroke', '#dc2626')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(chart.locator('polyline')).toHaveAttribute('stroke', '#1d4ed8')
})

test('adds a second series with grouped bars, a legend and nested rings', async ({ page }) => {
  await openFreeform(page)
  await insertChart(page)
  const chart = page.getByTestId('freeform-chart')

  // One unnamed series shows no legend; the series seg names the first by index.
  await expect(page.getByTestId('chart-series-0')).toHaveClass(/on/)
  await expect(chart.locator('[data-testid="freeform-chart-legend-item"]')).toHaveCount(0)

  // Name the first series, add a second and name it: grouped bars and a legend.
  await page.getByTestId('chart-series-name').fill('去年')
  await page.getByTestId('chart-series-add').click()
  await expect(page.getByTestId('chart-series-1')).toHaveClass(/on/)
  await expect(chart.locator('rect:not(g [data-testid="freeform-chart-legend-item"] rect)')).toHaveCount(8)
  await page.getByTestId('chart-series-name').fill('今年')
  await expect(chart.locator('[data-testid="freeform-chart-legend-item"]')).toHaveCount(2)
  await expect(chart.getByText('去年')).toHaveCount(1)
  await expect(chart.getByText('今年')).toHaveCount(1)

  // The second series starts flat; raising its last value grows only its bar.
  const heightsBefore = await barHeights(page)
  await page.getByLabel('第 4 项数值', { exact: true }).fill('12')
  const heightsAfter = await barHeights(page)
  expect(heightsAfter[7]).toBeGreaterThan(heightsBefore[7])
  expect(heightsAfter[3]).toBeLessThan(heightsAfter[7])

  // As a ring, both series nest: eight segments in two rings.
  await page.getByTestId('chart-kind-ring').click()
  await expect(chart.locator('[data-testid="freeform-chart-segment"]')).toHaveCount(8)

  // Removing the second series leaves the first, legend gone with it.
  await page.getByTestId('chart-series-remove').click()
  await expect(chart.locator('[data-testid="freeform-chart-segment"]')).toHaveCount(4)
  await expect(chart.locator('[data-testid="freeform-chart-legend-item"]')).toHaveCount(0)
})

test('stacks bars and normalises them to percentages with axis ticks', async ({ page }) => {
  await openFreeform(page)
  await insertChart(page)
  const chart = page.getByTestId('freeform-chart')

  // Grouped bars draw y-axis ticks: the sample tops out at 9, the axis rounds to 10.
  await expect(chart.locator('[data-testid="freeform-chart-axis"]')).toHaveCount(2)
  await expect(chart.getByText('10', { exact: true })).toHaveCount(1)
  await expect(chart.getByText('5', { exact: true })).toHaveCount(1)

  // Stacked piles one column per category: same four columns, totalled on top.
  await page.getByTestId('chart-bar-mode-stacked').click()
  await expect(chart.locator('rect:not(g [data-testid="freeform-chart-legend-item"] rect)')).toHaveCount(4)
  await page.getByRole('button', { name: '显示', exact: true }).click()
  await expect(chart.getByText('9', { exact: true })).toHaveCount(1)
  // Undo unwinds its own entries: first the labels, then the mode.
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(chart.getByText('9', { exact: true })).toHaveCount(0)
  await expect(chart.locator('rect:not(g [data-testid="freeform-chart-legend-item"] rect)')).toHaveCount(4)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByTestId('chart-bar-mode-stacked')).not.toHaveClass(/on/)

  // Percent normalises each column to 100%: with the labels back on, the flat
  // sample reads 100% on every column and the axis ticks percentages.
  await page.getByRole('button', { name: '显示', exact: true }).click()
  await page.getByTestId('chart-bar-mode-percent').click()
  // Four 100% segments and one 100% axis tick (its partner ticks 50%).
  await expect(chart.getByText('100%')).toHaveCount(5)
  await expect(chart.getByText('50%', { exact: true })).toHaveCount(1)

  // Ring keeps the modes to itself: the seg hides, no axis is drawn.
  await page.getByTestId('chart-kind-ring').click()
  await expect(page.getByTestId('chart-bar-mode-stacked')).toHaveCount(0)
  await expect(chart.locator('[data-testid="freeform-chart-axis"]')).toHaveCount(0)
})

test('round-trips a saved v24 chart and rejects it at v23', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('account-login').click()
  await registerUser(page, `chart-roundtrip-${Date.now()}`)
  await expect(page.getByTestId('account-menu')).toBeVisible()

  const slide = {
    id: 'chart-slide',
    name: 'Chart slide',
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    nodes: [{
      id: 'chart-1',
      name: '图表',
      locked: false,
      hidden: false,
      type: 'chart',
      x: 300,
      y: 600,
      width: 480,
      height: 320,
      rotation: 0,
      scale: 1,
      chartKind: 'ring',
      labels: ['住', '行', '吃'],
      values: [3, 2, 5],
      accent: '#dc2626',
      showValues: true,
    }],
  }
  await openStoredDrafts(page, [{
    id: 'chart-draft',
    title: 'Chart draft',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: Date.now(),
    document: { documentVersion: 24, activeSlideId: slide.id, slides: [slide] },
  }])

  const chart = page.getByTestId('freeform-chart')
  await expect(chart).toBeVisible()
  await expect(chart.locator('[data-testid="freeform-chart-segment"]')).toHaveCount(3)
  await expect(chart.getByText('50%')).toHaveCount(1)

  // The same node at v23 never loads: the draft is rejected whole.
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('account-login').click()
  await registerUser(page, `chart-v23-${Date.now()}`)
  await expect(page.getByTestId('account-menu')).toBeVisible()
  await openStoredDrafts(page, [{
    id: 'chart-v23-draft',
    title: 'Chart v23 draft',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: Date.now(),
    document: { documentVersion: 23, activeSlideId: slide.id, slides: [slide] },
  }]).catch(() => {})
  await expect(page.getByText('没有找到这个项目，它可能已经被删除了')).toBeVisible()
})
