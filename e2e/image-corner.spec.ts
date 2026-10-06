// Image corner radius (v28): the inspector rounds the picture's content
// layer, one history entry per change, and undo squares it again.

import { expect, test, type Page } from '@playwright/test'
import { openFreeform, startWithSettingsPanelOpen } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  await startWithSettingsPanelOpen(page)
})

/** Paste a picture the way a screenshot comes in, seeded noise so it never compresses. */
async function pastePicture(page: Page, seed: number, size = 64) {
  await page.evaluate(async ([seed, size]) => {
    const canvas = document.createElement('canvas')
    canvas.width = size as number
    canvas.height = size as number
    const context = canvas.getContext('2d')!
    const pixels = context.createImageData(size as number, size as number)
    let state = seed * 9973 + 1
    for (let index = 0; index < pixels.data.length; index += 4) {
      state = (state * 1103515245 + 12345) & 0x7fffffff
      pixels.data[index] = state & 255
      pixels.data[index + 1] = (state >> 8) & 255
      pixels.data[index + 2] = (state >> 16) & 255
      pixels.data[index + 3] = 255
    }
    context.putImageData(pixels, 0, 0)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((made) => resolve(made!), 'image/png'))
    const clipboard = new DataTransfer()
    clipboard.items.add(new File([blob], `picture-${seed}.png`, { type: 'image/png' }))
    document.body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }))
  }, [seed, size])
}

test('rounds a pasted picture from the inspector and undo squares it', async ({ page }) => {
  await openFreeform(page)
  await pastePicture(page, 7)
  const picture = page.getByTestId('freeform-element').filter({ has: page.locator('.freeform-image') })
  await expect(picture).toHaveCount(1)
  await expect(picture.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')

  // Fresh pictures are square: no radius on the content layer.
  const layer = picture.locator('.freeform-image-content-layer')
  await expect(layer).toHaveCSS('border-radius', '0px')

  await picture.click()
  const workspace = page.locator('.freeform-workspace')
  const initialHistoryDepth = Number(await workspace.getAttribute('data-history-depth'))

  // The appearance section offers the radius; committing it rounds the layer.
  const radius = page.getByLabel('圆角', { exact: true })
  await radius.fill('60')
  await radius.press('Enter')
  await expect(layer).toHaveCSS('border-radius', '60px')
  await expect(layer).toHaveCSS('overflow', 'hidden')
  await expect(workspace).toHaveAttribute('data-history-depth', String(initialHistoryDepth + 1))

  // Another value is another entry; undo walks back to square corners.
  await radius.fill('24')
  await radius.press('Enter')
  await expect(layer).toHaveCSS('border-radius', '24px')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(layer).toHaveCSS('border-radius', '60px')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(layer).toHaveCSS('border-radius', '0px')

  // Copy the rounded style, then paste it onto a second, square picture.
  await radius.fill('60')
  await radius.press('Enter')
  await expect(layer).toHaveCSS('border-radius', '60px')
  await picture.click()
  await page.keyboard.press('ControlOrMeta+Alt+C')
  await page.keyboard.press('Escape')
  await expect(page.locator('.freeform-element[data-selected="true"]')).toHaveCount(0)
  await pastePicture(page, 8)
  const pictures = page.getByTestId('freeform-element').filter({ has: page.locator('.freeform-image') })
  await expect(pictures).toHaveCount(2)
  const pastedLayer = pictures.nth(1).locator('.freeform-image-content-layer')
  await expect(pastedLayer).toHaveCSS('border-radius', '0px')
  await pictures.nth(1).click()
  await page.keyboard.press('ControlOrMeta+Alt+V')
  await expect(pastedLayer).toHaveCSS('border-radius', '60px')
})

test('one-tap corner presets and a photo frame style the picture', async ({ page }) => {
  await openFreeform(page)
  await pastePicture(page, 9)
  const picture = page.getByTestId('freeform-element').filter({ has: page.locator('.freeform-image') })
  await expect(picture).toHaveCount(1)
  await picture.click()
  const layer = picture.locator('.freeform-image-content-layer')

  // The preset row rounds the picture in one tap; capsule lands on half the
  // short side, and 直角 squares it again.
  const presets = page.getByTestId('image-radius-presets')
  await presets.getByRole('button', { name: '小圆', exact: true }).click()
  await expect(layer).toHaveCSS('border-radius', '12px')
  await presets.getByRole('button', { name: '胶囊', exact: true }).click()
  const capsule = await layer.evaluate((node) => {
    const box = node as HTMLElement
    return Math.min(box.offsetWidth, box.offsetHeight) / 2
  })
  await expect(layer).toHaveCSS('border-radius', `${Math.min(2000, Math.round(capsule))}px`)
  await presets.getByRole('button', { name: '直角', exact: true }).click()
  await expect(layer).toHaveCSS('border-radius', '0px')

  // Typing a frame width paints a default white border around the picture.
  const frameWidth = page.getByLabel('描边宽', { exact: true })
  await frameWidth.fill('14')
  await frameWidth.press('Enter')
  await expect(layer).toHaveCSS('border-top-width', '14px')
  await expect(layer).toHaveCSS('border-top-color', 'rgb(255, 255, 255)')

  // The frame follows the corner radius; undo takes it back off.
  await presets.getByRole('button', { name: '大圆', exact: true }).click()
  await expect(layer).toHaveCSS('border-radius', '28px')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(layer).toHaveCSS('border-radius', '0px')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(layer).toHaveCSS('border-top-width', '0px')

  // A photo look rides the shared filter presets the same as shapes.
  await page.getByTestId('filter-preset-mono').click()
  await expect(layer).toHaveCSS('filter', /grayscale\(1\)/)
})
