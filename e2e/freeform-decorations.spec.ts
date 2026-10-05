import { expect, test, type Page } from '@playwright/test'
import { openToolPanel, startWithSettingsPanelOpen } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

// The Elements panel's decoration library: hand-drawn lines, stickers and
// labels, found by one search, put on the page by a click or by dragging a
// tile onto the canvas.

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  await startWithSettingsPanelOpen(page)
})

async function openElements(page: Page) {
  await page.goto('/#/edit/canvas')
  await openToolPanel(page, 'elements')
  return page.getByTestId('freeform-elements-drawer')
}

/** The page box of each top-level node, as the canvas lays it out (groups by their children). */
async function rootBoxes(page: Page) {
  return page.locator('[data-scene-root-node="true"]').evaluateAll((elements) => elements.map((element) => {
    const artboard = element.closest('.freeform-artboard')!.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    const leaves = element.classList.contains('freeform-scene-group')
      ? Array.from(element.querySelectorAll('.freeform-element')).map((leaf) => leaf.getBoundingClientRect())
      : [box]
    const left = Math.min(...leaves.map((leaf) => leaf.left))
    const top = Math.min(...leaves.map((leaf) => leaf.top))
    const right = Math.max(...leaves.map((leaf) => leaf.right))
    const bottom = Math.max(...leaves.map((leaf) => leaf.bottom))
    return { cx: (left + right) / 2 - artboard.left, cy: (top + bottom) / 2 - artboard.top, scale: artboard.width }
  }))
}

test('the library comes in three kinds, and a click puts a piece in the middle of the page', async ({ page }) => {
  const drawer = await openElements(page)
  await expect(drawer.locator('.freeform-drawer-section')).toHaveText(['形状', '线条', '实用', '拼图', '手绘线条', '贴纸', '标签', '图标'])
  await expect(drawer.getByRole('group', { name: '手绘线条' }).locator('.freeform-decoration-tile')).toHaveCount(16)
  await expect(drawer.getByRole('group', { name: '贴纸' }).locator('.freeform-decoration-tile')).toHaveCount(20)
  await expect(drawer.getByRole('group', { name: '标签' }).locator('.freeform-decoration-tile')).toHaveCount(12)

  await drawer.getByTestId('insert-decoration-circle-scribble').click()
  const drawn = page.getByTestId('freeform-path')
  await expect(drawn).toHaveCount(1)
  await expect(page.getByTestId('freeform-context-toolbar')).toHaveAttribute('data-subject', 'path')
  const [box] = await rootBoxes(page)
  // Centred on the page.
  expect(Math.abs(box.cx - box.scale / 2)).toBeLessThan(2)
  await page.getByTestId('freeform-layers-tool').click()
  await expect(page.getByRole('treeitem', { name: '手绘圈', exact: true })).toHaveCount(1)
})

test('one search finds decorations, shapes and icons by name or keyword in either language', async ({ page }) => {
  const drawer = await openElements(page)
  const search = drawer.getByTestId('freeform-element-search')
  await search.fill('印章')
  await expect(drawer.locator('.freeform-decoration-tile')).toHaveCount(1)
  await expect(drawer.getByRole('button', { name: '印章', exact: true })).toBeVisible()
  await expect(drawer.locator('.freeform-drawer-section')).toHaveText(['标签'])
  await search.fill('underline')
  await expect(drawer.locator('.freeform-decoration-tile')).toHaveCount(4)
  await search.fill('矩形')
  await expect(drawer.getByTestId('insert-shape-rect')).toBeVisible()
  await expect(drawer.locator('.freeform-decoration-tile')).toHaveCount(0)
  await search.fill('没有这种东西')
  await expect(drawer.getByTestId('freeform-element-empty')).toHaveText('没有找到元素')
})

test('a tile dragged onto the canvas lands where it is dropped', async ({ page }) => {
  const drawer = await openElements(page)
  const artboard = page.locator('.freeform-artboard').first()
  const bounds = (await artboard.boundingBox())!
  await drawer.getByTestId('insert-decoration-sparkles').dragTo(artboard, { targetPosition: { x: bounds.width * 0.25, y: bounds.height * 0.2 } })
  await expect(page.locator('[data-scene-root-node="true"]')).toHaveCount(1)
  await drawer.getByTestId('insert-shape-star').dragTo(artboard, { targetPosition: { x: bounds.width * 0.7, y: bounds.height * 0.75 } })
  await expect(page.locator('[data-scene-root-node="true"]')).toHaveCount(2)
  const [sparkles, star] = await rootBoxes(page)
  expect(Math.abs(sparkles.cx - bounds.width * 0.25)).toBeLessThan(3)
  expect(Math.abs(sparkles.cy - bounds.height * 0.2)).toBeLessThan(3)
  expect(Math.abs(star.cx - bounds.width * 0.7)).toBeLessThan(3)
  expect(Math.abs(star.cy - bounds.height * 0.75)).toBeLessThan(3)
  // The last one dropped is selected, ready to adjust.
  await expect(page.getByTestId('freeform-context-toolbar')).toHaveAttribute('data-subject', 'shape')
})

test('a label lands as a group whose words can be rewritten inside it', async ({ page }) => {
  const drawer = await openElements(page)
  await drawer.getByTestId('insert-decoration-burst-badge').click()
  const group = page.getByTestId('freeform-scene-group')
  await expect(group).toHaveCount(1)
  await expect(group).toContainText('限时')

  // In the group, then into its words.
  const words = group.locator('.freeform-textbox')
  await words.dblclick()
  await words.dblclick()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('五折')
  await page.keyboard.press('Escape')
  await expect(group).toContainText('五折')
  await page.getByTestId('freeform-layers-tool').click()
  await expect(page.getByRole('treeitem', { name: '爆炸贴', exact: true })).toHaveCount(1)
})

test('in English the library, its sample words and the layers speak English', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dingcard.lang.v1', 'en'))
  const drawer = await openElements(page)
  await expect(drawer.locator('.freeform-drawer-section')).toHaveText(['Shape', 'Line', 'Utilities', 'Collage', 'Hand-drawn', 'Stickers', 'Labels', 'Icons'])
  await drawer.getByRole('button', { name: 'Burst badge', exact: true }).click()
  await expect(page.getByTestId('freeform-scene-group')).toContainText('SALE')
  await page.getByTestId('freeform-layers-tool').click()
  await expect(page.getByRole('treeitem', { name: 'Burst badge', exact: true })).toHaveCount(1)
})
