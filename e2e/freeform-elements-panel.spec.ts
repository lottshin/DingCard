// The Elements panel: icon vector paths, collage grids, and paths filled with
// framed pictures.

import { expect, test } from '@playwright/test'
import {
  TEST_PNG,
  freeformElementBoxes,
  openFreeform,
  registerUser,
  selectedFreeformElements,
  setSelectedElementBox,
  signUpToSave,
  startWithSettingsPanelOpen,
  withToolPanel,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test('the Elements panel finds icons and drops them in as vector paths to style', async ({ page }) => {
  await openFreeform(page)
  const drawer = page.getByTestId('freeform-elements-drawer')
  await page.getByTestId('freeform-elements-tool').click()
  await expect(drawer).toBeVisible()

  const search = page.getByTestId('freeform-element-search')
  await search.fill('购物')
  await expect(drawer.locator('.freeform-icon-tile')).toHaveCount(2)
  await expect(drawer.getByRole('button', { name: '购物车', exact: true })).toBeVisible()
  await search.fill('没有这种图标')
  await expect(page.getByTestId('freeform-element-empty')).toBeVisible()
  // Escape clears a search before it closes the panel.
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(drawer).toBeVisible()

  await drawer.getByTestId('insert-icon-star').click()
  const graphic = page.getByTestId('freeform-path')
  const drawing = graphic.locator('path')
  await expect(graphic).toHaveCount(1)
  await expect(selectedFreeformElements(page)).toHaveCount(1)
  await expect(page.getByTestId('freeform-context-toolbar')).toHaveAttribute('data-subject', 'path')
  // A 24-unit icon in a 162px box (15% of the page's short side), stroked at 2 units.
  await expect.poll(() => freeformElementBoxes(page)).toEqual([{ x: 459, y: 639, width: 162, height: 162 }])
  await expect(drawing).toHaveAttribute('stroke-width', '13.5')
  await expect(drawing).toHaveAttribute('fill', 'none')
  await expect(drawing).toHaveAttribute('stroke-linejoin', 'round')

  const stroke = page.getByTestId('inspector-stroke')
  const width = stroke.getByLabel('描边宽', { exact: true })
  await expect(width).toHaveValue('13.5')
  await width.fill('27')
  await width.press('Enter')
  await expect(drawing).toHaveAttribute('stroke-width', '27')
  await stroke.getByTestId('path-join-miter').click()
  await expect(drawing).toHaveAttribute('stroke-linejoin', 'miter')
  await stroke.getByLabel('虚线', { exact: true }).fill('20')
  await stroke.getByLabel('虚线', { exact: true }).press('Enter')
  await expect(drawing).toHaveAttribute('stroke-dasharray', '20 20')
  await stroke.getByTestId('path-dash-clear').click()
  await expect(drawing).not.toHaveAttribute('stroke-dasharray', /./)

  await page.getByTestId('path-fill-paint').getByRole('button', { name: '纯色', exact: true }).click()
  await expect(drawing).toHaveAttribute('fill', /^#/)

  // Stretching from an edge widens the drawing; the stroke keeps one width.
  await setSelectedElementBox(page, 400, 600, 324, 162)
  await expect(drawing).toHaveAttribute('stroke-width', /^38\.18/)
  await expect(drawing).toHaveAttribute('d', /^M/)

  await page.getByTestId('freeform-layers-tool').click()
  await expect(page.getByRole('treeitem', { name: '星星', exact: true })).toHaveCount(1)
})

test('a path fills with a picture and frames it inside the outline (v19)', async ({ page }) => {
  await openFreeform(page)

  // A heart icon becomes the picture frame.
  await withToolPanel(page, 'elements', (panel) => panel.getByTestId('insert-icon-heart').click())
  const pathFill = page.getByTestId('path-fill-paint')
  // The path fill offers the same picture mode shapes get.
  await expect(pathFill.getByTestId('paint-mode-image')).toBeVisible()

  await page.getByTestId('inspector-fill').locator('input.freeform-file').setInputFiles({
    name: 'path-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  const frame = page.getByTestId('freeform-path-image-fill')
  await expect(frame).toHaveCount(1)
  // The picture is clipped to the outline, not to a rectangle.
  await expect(frame).toHaveCSS('clip-path', /^path\(/)
  await expect(frame.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  // The stroke still draws on top of the picture.
  await expect(page.getByTestId('freeform-path').locator('path')).toHaveAttribute('fill', 'none')

  // Double-click opens the framing session; the surface shows the outline.
  const pathElement = page.getByTestId('freeform-element').filter({ has: frame })
  await pathElement.dblclick()
  const surface = page.getByTestId('freeform-framing-surface')
  await expect(surface).toBeVisible()
  await expect(surface).toHaveCSS('clip-path', /^path\(/)
  await page.getByTestId('freeform-framing-cancel').click()
  await expect(surface).toHaveCount(0)
  await expect(frame).toHaveCount(1)

  await signUpToSave(page, `path-fill-${Date.now().toString(36)}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await expect(page.getByTestId('freeform-path-image-fill')).toHaveCSS('clip-path', /^path\(/)
  await expect(page.getByTestId('freeform-path-image-fill')
    .locator('[data-framed-image="true"]')).toHaveAttribute('data-image-load-state', 'ready')
})

test('the Elements panel inserts collage grids and pictures fill their cells', async ({ page }) => {
  await openFreeform(page)

  // The collage tiles sit under their own group in the elements drawer.
  await withToolPanel(page, 'elements', (panel) => panel
    .getByRole('group', { name: '拼图' })
    .getByTestId('insert-collage-quad')
    .click())

  // A group of four placeholder cells lands on the page, selected as one.
  const collage = page.getByTestId('freeform-scene-group')
  await expect(collage).toHaveCount(1)
  await expect(collage.locator('.freeform-shape')).toHaveCount(4)

  // Double-clicking a cell enters the collage group, a click then selects
  // the cell itself (the inner shape takes no pointer events — clicks land on
  // its wrapper).
  const firstCell = collage.locator('[data-testid="freeform-element"]').first()
  await firstCell.dblclick()
  await firstCell.click()
  await expect(page.getByTestId('shape-fill-paint')).toBeVisible()
  await page.getByTestId('inspector-fill').locator('input.freeform-file').setInputFiles({
    name: 'collage-cell.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  const cellFrame = page.getByTestId('freeform-shape-image-fill')
  await expect(cellFrame).toHaveCount(1)
  await expect(cellFrame.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')

  // The collage and its picture survive a reload.
  await signUpToSave(page, `collage-${Date.now().toString(36)}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await expect(page.getByTestId('freeform-scene-group').locator('.freeform-shape')).toHaveCount(4)
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(1)
})

test('a path keeps its proportions from a corner handle and stretches from an edge', async ({ page }) => {
  await openFreeform(page)
  await withToolPanel(page, 'elements', (panel) => panel.getByTestId('insert-icon-heart').click())
  await setSelectedElementBox(page, 100, 100, 400, 400)
  await expect.poll(() => freeformElementBoxes(page)).toEqual([{ x: 100, y: 100, width: 400, height: 400 }])

  const drag = async (testId: string, dx: number, dy: number) => {
    const box = await page.getByTestId(testId).boundingBox()
    expect(box).toBeTruthy()
    const start = { x: Math.round(box!.x + box!.width / 2), y: Math.round(box!.y + box!.height / 2) }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + dx / 2, start.y + dy / 2)
    await page.mouse.move(start.x + dx, start.y + dy)
    await page.mouse.up()
  }

  await drag('freeform-selection-resize', 90, 10)
  const [cornered] = await freeformElementBoxes(page)
  expect(cornered.width).toBeGreaterThan(420)
  expect(cornered.width).toBeCloseTo(cornered.height, 6)

  await drag('freeform-selection-resize-e', 60, 0)
  const [edged] = await freeformElementBoxes(page)
  expect(edged.width).toBeGreaterThan(cornered.width + 20)
  expect(edged.height).toBeCloseTo(cornered.height, 6)
})

test('我的项目 imports a v15 document with icons and custom paths', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await openFreeform(page)
  await page.getByTestId('account-login').click()
  await registerUser(page, `paths-${Date.now()}`)

  const pathNode = {
    locked: false,
    hidden: false,
    type: 'path',
    rotation: 0,
    scale: 1,
    stroke: '#17293c',
    strokeWidth: 2,
  }
  const importedDocument = {
    documentVersion: 15,
    activeSlideId: 'path-slide-1',
    slides: [{
      id: 'path-slide-1',
      name: '图形页',
      width: 1080,
      height: 1440,
      background: { type: 'solid', color: '#ffffff' },
      nodes: [
        {
          ...pathNode,
          id: 'path-icon',
          name: '对勾',
          x: 100,
          y: 100,
          width: 240,
          height: 240,
          d: 'M20 6 9 17l-5-5',
          viewBox: { x: 0, y: 0, width: 24, height: 24 },
          fill: { type: 'transparent' },
        },
        {
          ...pathNode,
          id: 'path-blob',
          name: '色块',
          x: 400,
          y: 400,
          width: 400,
          height: 200,
          d: 'M0 50a50 50 0 1 0 100 0a50 50 0 1 0-100 0z',
          viewBox: { x: 0, y: 0, width: 100, height: 100 },
          fill: { type: 'linear-gradient', from: '#fde68a', to: '#f97316', angle: 90 },
          strokeWidth: 0,
        },
      ],
    }],
  }

  await page.goto('/#/projects')
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'paths.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedDocument)),
  })

  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  const paths = page.getByTestId('freeform-path').locator('path')
  await expect(paths).toHaveCount(2)
  // The 24-unit check mark is redrawn ten times larger; the circle stretches into an ellipse.
  await expect(paths.nth(0)).toHaveAttribute('d', 'M200 60 90 170l-50 -50')
  await expect(paths.nth(0)).toHaveAttribute('stroke-width', '20')
  await expect(paths.nth(1)).toHaveAttribute('d', 'M0 100a200 100 0 1 0 400 0a200 100 0 1 0 -400 0z')
  await expect(paths.nth(1)).toHaveAttribute('fill', /^url\(#/)
  await expect(paths.nth(1)).toHaveAttribute('stroke', 'none')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByTestId('freeform-path').locator('path').nth(0)).toHaveAttribute('d', 'M200 60 90 170l-50 -50')
})
