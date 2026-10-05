// A picture as the page background: choose, fit, frame, clear, and it exports
// under the artwork.

import { expect, test } from '@playwright/test'
import {
  WIDE_TEST_SVG,
  insertShape,
  openExportMenu,
  openFreeform,
  rgbDistance,
  samplePngPixel,
  selectedFreeformElements,
  startWithSettingsPanelOpen,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test('the page takes a picture background: choose, fit, frame, clear, and it exports under the artwork', async ({ page }) => {
  await openFreeform(page)
  const pagePaint = page.getByTestId('page-background-paint')
  const chooser = page.waitForEvent('filechooser')
  await pagePaint.getByTestId('paint-mode-image').click()
  // A deep blue picture, wider than the page, with a yellow band down its middle.
  const bluePicture = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#1e3a8a"/><rect x="760" width="80" height="900" fill="#facc15"/></svg>',
  )
  await (await chooser).setFiles({ name: 'page-background.svg', mimeType: 'image/svg+xml', buffer: bluePicture })

  const layer = page.getByTestId('freeform-page-background')
  const picture = layer.locator('[data-framed-image="true"]')
  await expect(picture).toHaveAttribute('data-image-load-state', 'ready')
  await expect(page.locator('.freeform-slide-preview .freeform-page-background')).toHaveCount(1)
  await expect(pagePaint.getByTestId('paint-mode-image')).toHaveClass(/\bon\b/)

  // The picture sits under everything and never takes a click.
  await insertShape(page)
  await expect(layer).toHaveCSS('pointer-events', 'none')
  await page.getByTestId('freeform-canvas').click({ position: { x: 8, y: 8 } })
  await expect(selectedFreeformElements(page)).toHaveCount(0)

  await pagePaint.getByTestId('paint-image-fit-contain').click()
  await expect(layer.locator('img')).toHaveCSS('object-fit', 'contain')
  await expect(pagePaint.getByTestId('freeform-adjust-framing')).toBeDisabled()
  await pagePaint.getByTestId('paint-image-fit-cover').click()

  // Framing it works like framing a picture: drag inside, then 完成.
  await expect(pagePaint.getByTestId('freeform-reset-framing')).toBeDisabled()
  await pagePaint.getByTestId('freeform-adjust-framing').click()
  const surface = page.getByTestId('freeform-framing-surface')
  await expect(surface).toBeVisible()
  const box = (await surface.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(surface).not.toHaveAttribute('data-framing-focus-x', '0.5')
  await page.getByTestId('freeform-framing-done').click()
  await expect(surface).toHaveCount(0)
  await expect(pagePaint.getByTestId('freeform-reset-framing')).toBeEnabled()

  // The export draws the picture under the artwork: blue at the top-left corner, under no node.
  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  const download = await downloadPromise
  const exported = await download.path()
  expect(exported).toBeTruthy()
  const corner = await samplePngPixel(page, exported!, 20, 20)
  expect(rgbDistance(corner.slice(0, 3), [30, 58, 138])).toBeLessThan(12)
  await page.keyboard.press('Escape')

  await pagePaint.getByTestId('freeform-reset-framing').click()
  await expect(pagePaint.getByTestId('freeform-reset-framing')).toBeDisabled()
  await pagePaint.getByRole('button', { name: '清除图片' }).click()
  await expect(layer).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(layer).toHaveCount(1)
})

test('a picture becomes the page background from its panel or the right-click menu, in one undo step', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'as-background.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const pictureNode = page.getByTestId('freeform-element').filter({ has: page.locator('.freeform-image') })
  await expect(pictureNode).toHaveCount(1)
  const layer = page.getByTestId('freeform-page-background')
  const workspace = page.locator('.freeform-workspace')
  const depth = Number(await workspace.getAttribute('data-history-depth'))

  await page.getByTestId('freeform-image-as-background').click()
  await expect(pictureNode).toHaveCount(0)
  await expect(layer.locator('[data-framed-image="true"]')).toHaveAttribute('data-image-load-state', 'ready')
  await expect(workspace).toHaveAttribute('data-history-depth', String(depth + 1))

  await page.keyboard.press('ControlOrMeta+z')
  await expect(pictureNode).toHaveCount(1)
  await expect(layer).toHaveCount(0)

  await pictureNode.click({ button: 'right' })
  await page.getByTestId('freeform-context-menu-as-background').click()
  await expect(pictureNode).toHaveCount(0)
  await expect(layer).toHaveCount(1)
})
