// The v21 shape tools: four new shapes, on-canvas parameter handles for
// rect rounding, star inner radius and bubble tail, and the 双向箭头 preset.

import { expect, test } from '@playwright/test'
import {
  insertLine,
  insertShape,
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

async function inlineClipPath(locator: import('@playwright/test').Locator) {
  return locator.evaluate((node) => node.style.clipPath)
}

/** The clip-path polygon points of an element, parsed as numbers. */
async function clipPoints(locator: import('@playwright/test').Locator) {
  const clip = await inlineClipPath(locator)
  expect(clip.startsWith('polygon(')).toBe(true)
  return clip.slice('polygon('.length, -1).split(', ').map((point) => point.split(' ').map(Number.parseFloat))
}

/** The element's layout width in document px, whatever the canvas zoom is. */
async function layoutWidth(locator: import('@playwright/test').Locator) {
  return locator.evaluate((node) => node.offsetWidth)
}

/** Drags a locator's centre to a viewport point with the mouse. */
async function dragCentreTo(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
  target: { x: number; y: number },
) {
  const box = await locator.boundingBox()
  expect(box).toBeTruthy()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 6 })
  await page.mouse.up()
}

test('inserts the new shapes with their clip looks', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page, '菱形')
  await insertShape(page, '五边形')
  await insertShape(page, '心形')
  await expect(page.getByTestId('freeform-shape')).toHaveCount(3)
  // The fixed shapes clip through their stylesheet classes.
  await expect(page.locator('.freeform-shape.shape-diamond')).toHaveCSS('clip-path', /polygon/)
  await expect(page.locator('.freeform-shape.shape-pentagon')).toHaveCSS('clip-path', /polygon/)
  await expect(page.locator('.freeform-shape.shape-heart')).toHaveCSS('clip-path', /polygon/)
  for (const kind of ['shape-diamond', 'shape-pentagon', 'shape-heart']) {
    expect(await inlineClipPath(page.locator(`.freeform-shape.${kind}`))).toBe('')
  }

  // The bubble always carries its own inline polygon so the tail can move.
  await insertShape(page, '对话气泡')
  const bubble = page.locator('.freeform-shape.shape-bubble')
  await expect(bubble).toBeVisible()
  const clip = await inlineClipPath(bubble)
  expect(clip.startsWith('polygon(')).toBe(true)
  expect(clip).toContain('px')
})

test('inserts 双向箭头 with arrow caps on both ends', async ({ page }) => {
  await openFreeform(page)

  await insertLine(page, '双向箭头')
  const svgLine = page.getByTestId('freeform-arrow').locator('line')
  await expect(svgLine).toHaveAttribute('marker-end', /arrow/)
  await expect(svgLine).toHaveAttribute('marker-start', /arrow/)
})

test('drags the rect corner handle to round it as one history step', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const shapeView = page.getByTestId('freeform-element').locator('.freeform-shape.shape-rect')
  const handle = page.getByTestId('freeform-shape-param-cornerRadius')
  await expect(handle).toBeVisible()
  await expect(handle).toHaveAttribute('aria-label', '调整圆角')

  // The dot itself stays a 12 px marker on screen no matter the canvas zoom:
  // its box carries the inverse scale, so the visible ::before must not
  // scale again (a second compensation once ballooned it to 12/zoom px).
  const dot = await handle.evaluate((el) => {
    const style = getComputedStyle(el)
    const before = getComputedStyle(el, '::before')
    const zoom = el.getBoundingClientRect().width / parseFloat(style.width)
    return { screen: parseFloat(before.width) * zoom, background: before.backgroundColor }
  })
  expect(dot.screen).toBeGreaterThanOrEqual(11)
  expect(dot.screen).toBeLessThanOrEqual(13)
  // The selection-chrome theme in freeform.css paints every handle dot white.
  expect(dot.background).toBe('rgb(255, 255, 255)')

  // The handle sits on the corner-radius arc; dragging it away deepens the round.
  const box = await handle.boundingBox()
  expect(box).toBeTruthy()
  await dragCentreTo(page, handle, { x: box!.x + box!.width / 2 + 140, y: box!.y + box!.height / 2 + 140 })
  const radius = Number((await shapeView.evaluate((node) => node.style.borderRadius)).replace('px', ''))
  expect(radius).toBeGreaterThanOrEqual(100)

  // One drag is one history entry with its own label.
  await page.getByRole('tab', { name: '历史', exact: true }).click()
  await expect(page.getByTestId('freeform-history-panel')).toBeVisible()
  await expect(page.getByTestId('freeform-history-item').first().locator('.freeform-history-label'))
    .toHaveText('调整圆角')

  // The context toolbar field shows the dragged radius and can type an exact one.
  const field = page.getByLabel('转角弧度', { exact: true })
  await expect(field).toHaveValue(String(radius))
  await field.fill('36')
  await field.press('Enter')
  await expect(shapeView).toHaveCSS('border-radius', '36px')

  // Undo walks back one edit at a time: the typed radius, then the drag back
  // to the stylesheet default (16 px, with no inline override).
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(shapeView).toHaveCSS('border-radius', `${radius}px`)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  expect(await shapeView.evaluate((node) => node.style.borderRadius)).toBe('')
  await expect(shapeView).toHaveCSS('border-radius', '16px')
})

test('drags the star inner-radius handle and commits the field', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page, '五角星')

  const starView = page.getByTestId('freeform-element').locator('.freeform-shape.shape-star')
  // A fresh star has no ratio: the stylesheet polygon renders it.
  expect(await inlineClipPath(starView)).toBe('')

  const handle = page.getByTestId('freeform-shape-param-starInnerRatio')
  await expect(handle).toBeVisible()
  await expect(handle).toHaveAttribute('aria-label', '调整星角内径')

  // Dragging the inner-vertex handle toward the centre pinches the star.
  const elementBox = await page.getByTestId('freeform-element').boundingBox()
  const handleBox = await handle.boundingBox()
  expect(elementBox).toBeTruthy()
  expect(handleBox).toBeTruthy()
  await dragCentreTo(page, handle, {
    x: (handleBox!.x + elementBox!.x + elementBox!.width / 2) / 2,
    y: (handleBox!.y + elementBox!.y + elementBox!.height / 2) / 2,
  })
  expect((await inlineClipPath(starView)).startsWith('polygon(')).toBe(true)

  // The drag records its own history label before any field edit follows it.
  await page.getByRole('tab', { name: '历史', exact: true }).click()
  await expect(page.getByTestId('freeform-history-panel')).toBeVisible()
  await expect(page.getByTestId('freeform-history-item').first().locator('.freeform-history-label'))
    .toHaveText('调整星角内径')

  // The field shows the pinched percent; typing an exact one moves the inner
  // vertices exactly (v21 geometry).
  const field = page.getByLabel('星角内径', { exact: true })
  const draggedPercent = Number(await field.inputValue())
  expect(draggedPercent).toBeLessThan(38)
  expect(draggedPercent).toBeGreaterThanOrEqual(15)
  await field.fill('60')
  await field.press('Enter')
  const points = await clipPoints(starView)
  expect(points).toHaveLength(10)
  expect(points[1][0]).toBeCloseTo(50 + 0.6 * 50 * Math.cos(-54 * Math.PI / 180), 1)
  expect(points[1][1]).toBeCloseTo(50 + 0.6 * 50 * Math.sin(-54 * Math.PI / 180), 1)

  // Undo the typed ratio, then the drag, landing back on the class default.
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  expect((await inlineClipPath(starView)).startsWith('polygon(')).toBe(true)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  expect(await inlineClipPath(starView)).toBe('')
})

test('drags the bubble tail handle and commits the field', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page, '对话气泡')

  const bubbleView = page.getByTestId('freeform-element').locator('.freeform-shape.shape-bubble')
  const width = await layoutWidth(bubbleView)
  // The tail tip is the middle of the three tail points at the end of the polygon.
  const tailTipX = async () => {
    const points = await clipPoints(bubbleView)
    return points[points.length - 8][0]
  }
  expect(await tailTipX()).toBeCloseTo(width * 0.5, -1)

  const handle = page.getByTestId('freeform-shape-param-bubbleTailX')
  await expect(handle).toBeVisible()
  await expect(handle).toHaveAttribute('aria-label', '调整气泡尾巴')

  // Dragging the handle along the bottom edge slides the tail.
  const handleBox = await handle.boundingBox()
  expect(handleBox).toBeTruthy()
  await dragCentreTo(page, handle, { x: handleBox!.x + handleBox!.width / 2 + 120, y: handleBox!.y + handleBox!.height / 2 })
  expect(await tailTipX()).toBeGreaterThan(width * 0.6)

  await page.getByRole('tab', { name: '历史', exact: true }).click()
  await expect(page.getByTestId('freeform-history-item').first().locator('.freeform-history-label'))
    .toHaveText('调整气泡尾巴')

  // The field shows the slid percent; an exact one places the tip at that
  // share of the width.
  const field = page.getByLabel('尾巴位置', { exact: true })
  expect(Number(await field.inputValue())).toBeGreaterThan(50)
  await field.fill('20')
  await field.press('Enter')
  expect(await tailTipX()).toBeCloseTo(width * 0.2, -1)
})

test('round-trips v21 shape parameters and keeps plain stars on the CSS default', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('account-login').click()
  await registerUser(page, `shape-params-${Date.now()}`)
  await expect(page.getByTestId('account-menu')).toBeVisible()

  const shapeNode = (id: string, shape: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'shape',
    x: 120,
    y: 160,
    width: 360,
    height: 240,
    rotation: 0,
    scale: 1,
    shape,
    fill: { type: 'solid', color: '#fca5a5' },
    stroke: '#991b1b',
    strokeWidth: 0,
    ...extra,
  })
  const slide = {
    id: 'shape-params-slide',
    name: 'Shape params',
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    nodes: [
      shapeNode('ratio-star', 'star', { starInnerRatio: 0.6 }),
      shapeNode('tail-bubble', 'bubble', { bubbleTailX: 0.25 }),
      shapeNode('plain-star', 'star'),
    ],
  }
  await openStoredDrafts(page, [{
    id: 'shape-params-draft',
    title: 'Shape params',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: Date.now(),
    document: { documentVersion: 21, activeSlideId: slide.id, slides: [slide] },
  }])

  // The star with a saved ratio renders its own inline polygon.
  const ratioStar = page.locator('[data-scene-node-id="ratio-star"] .freeform-shape')
  const ratioPoints = await clipPoints(ratioStar)
  expect(ratioPoints[1][0]).toBeCloseTo(50 + 0.6 * 50 * Math.cos(-54 * Math.PI / 180), 1)

  // The bubble tail stays at the saved quarter-width position.
  const bubble = page.locator('[data-scene-node-id="tail-bubble"] .freeform-shape')
  const bubblePoints = await clipPoints(bubble)
  expect(bubblePoints[bubblePoints.length - 8][0]).toBeCloseTo((await layoutWidth(bubble)) * 0.25, -1)

  // A v21 star without a ratio keeps the stylesheet default look.
  const plainStar = page.locator('[data-scene-node-id="plain-star"] .freeform-shape')
  expect(await inlineClipPath(plainStar)).toBe('')
  await expect(plainStar).toHaveCSS('clip-path', /polygon/)
})

test('opens a v20 document with stars and migrates it intact', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('account-login').click()
  await registerUser(page, `v20-star-${Date.now()}`)
  await expect(page.getByTestId('account-menu')).toBeVisible()

  const slide = {
    id: 'v20-star-slide',
    name: 'V20 star',
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    nodes: [{
      id: 'v20-star',
      name: 'Old star',
      locked: false,
      hidden: false,
      type: 'shape',
      x: 360,
      y: 600,
      width: 360,
      height: 240,
      rotation: 0,
      scale: 1,
      shape: 'star',
      fill: { type: 'solid', color: '#fbbf24' },
      stroke: '#92400e',
      strokeWidth: 0,
    }],
  }
  await openStoredDrafts(page, [{
    id: 'v20-star-draft',
    title: 'V20 star',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: Date.now(),
    document: { documentVersion: 20, activeSlideId: slide.id, slides: [slide] },
  }])

  // The migrated star renders through the stylesheet default and its handle
  // appears once selected, dragging in a ratio without touching the saved look.
  const starView = page.locator('[data-scene-node-id="v20-star"] .freeform-shape')
  await expect(starView).toBeVisible()
  expect(await inlineClipPath(starView)).toBe('')
  await page.locator('[data-scene-node-id="v20-star"]').click()
  const handle = page.getByTestId('freeform-shape-param-starInnerRatio')
  await expect(handle).toBeVisible()
  const box = await handle.boundingBox()
  expect(box).toBeTruthy()
  await dragCentreTo(page, handle, { x: box!.x + box!.width / 2 - 60, y: box!.y + box!.height / 2 - 40 })
  expect((await inlineClipPath(starView)).startsWith('polygon(')).toBe(true)
})
