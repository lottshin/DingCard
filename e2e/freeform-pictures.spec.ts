import { expect, test, type Page } from '@playwright/test'
import { startWithSettingsPanelOpen } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

// Pictures on the freeform canvas: a page full of photos still saves on this device.

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  await startWithSettingsPanelOpen(page)
})

/** Paste a picture the way a screenshot comes in, `size` px square of seeded noise (noise doesn't compress). */
async function pastePicture(page: Page, seed: number, size = 64) {
  await page.evaluate(async ([seed, size]) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')!
    const pixels = context.createImageData(size, size)
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

const pictures = (page: Page) => page.getByTestId('freeform-element').filter({ has: page.locator('.freeform-image') })

/** With nothing selected, the next pasted picture comes in as a new one. */
async function selectNothing(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.locator('.freeform-element[data-selected="true"]')).toHaveCount(0)
}

test('a page of photos bigger than localStorage still saves, and comes back after a reload', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => new Promise<void>((resolve) => {
    localStorage.clear()
    sessionStorage.clear()
    const request = indexedDB.deleteDatabase('dingcard.pictures')
    request.onsuccess = request.onerror = request.onblocked = () => resolve()
  }))
  await page.reload()
  // Four photos of about 2 MB each: twice what localStorage holds.
  for (let seed = 1; seed <= 4; seed += 1) {
    await selectNothing(page)
    await pastePicture(page, seed, 1400)
    await expect(pictures(page)).toHaveCount(seed, { timeout: 15_000 })
  }
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存到本机', { timeout: 20_000 })

  const stored = await page.evaluate(() => localStorage.getItem('slicer.drafts.local-guest') ?? '')
  expect(stored.length).toBeLessThan(50_000)
  expect(stored.match(/"picture:[0-9a-z]+"/g)).toHaveLength(4)

  await page.reload()
  await expect(pictures(page)).toHaveCount(4)
  for (const picture of await pictures(page).all()) {
    await expect(picture.locator('[data-framed-image="true"]')).toHaveAttribute('data-image-load-state', 'ready')
  }
})
