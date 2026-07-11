import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'

function readPngSize(buffer: Buffer) {
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG')
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

async function freeformElementPositions(page: import('@playwright/test').Page) {
  return page.locator('.freeform-element').evaluateAll((elements) =>
    elements.map((element) => {
      const el = element as HTMLElement
      return {
        x: Number.parseFloat(el.style.left),
        y: Number.parseFloat(el.style.top),
      }
    }),
  )
}

async function freeformElementKinds(page: import('@playwright/test').Page) {
  return page.locator('.freeform-element').evaluateAll((elements) =>
    elements.map((element) => {
      if (element.querySelector('.freeform-textbox')) return 'text'
      if (element.querySelector('.freeform-shape')) return 'shape'
      if (element.querySelector('.freeform-image')) return 'image'
      return 'unknown'
    }),
  )
}

async function setSelectedElementPosition(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
) {
  const positionInputs = page.locator('.freeform-inspector .field-grid').first().locator('input')
  await positionInputs.nth(0).fill(String(x))
  await positionInputs.nth(1).fill(String(y))
}

async function setSelectedElementBox(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const positionInputs = page.locator('.freeform-inspector .field-grid').first().locator('input')
  await positionInputs.nth(0).fill(String(x))
  await positionInputs.nth(1).fill(String(y))
  await positionInputs.nth(2).fill(String(width))
  await positionInputs.nth(3).fill(String(height))
}

test('switches to the freeform workspace and edits a slide', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()

  await expect(page.getByText('1 页 · 1080×1440px')).toBeVisible()
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()

  await page.getByRole('button', { name: '16:9' }).click()
  await expect(page.getByText('1 页 · 1920×1080px')).toBeVisible()

  await page.getByRole('button', { name: '文本框' }).click()
  await expect(page.getByLabel('文本内容')).toBeVisible()

  await page.getByRole('button', { name: '矩形' }).click()
  await expect(page.getByText('形状')).toBeVisible()
})

test('sets custom page size and new pages inherit it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()

  await page.getByRole('button', { name: '9:16' }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/1080×1920px/)

  await page.getByLabel('宽度 px').fill('1200')
  await page.getByLabel('高度 px').fill('1600')
  await page.getByRole('button', { name: '应用尺寸' }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/1200×1600px/)

  await page.getByRole('button', { name: '新增页面' }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/2 页 · 1200×1600px/)
})

test('fills a shape with an image', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '矩形' }).click()

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '插入图片填充' }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles('public/favicon.svg')

  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
})

test('exports the current slide as a PNG at slide dimensions', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '9:16' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前页' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe('slide-01.png')
  const path = await download.path()
  expect(path).toBeTruthy()
  const size = readPngSize(await readFile(path!))
  expect(size).toEqual({ width: 1080, height: 1920 })
})

test('saves and restores a freeform draft', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '文本框' }).click()
  await page.getByLabel('文本内容').fill('保存恢复测试')

  await page.getByRole('button', { name: '保存草稿' }).click()
  await page.getByRole('button', { name: '注册' }).click()
  await page.getByLabel('用户名').fill(`freeform-${Date.now()}`)
  await page.getByLabel('密码').fill('1234')
  await page.getByRole('button', { name: '创建账号' }).click()
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/已保存/)

  await page.reload()
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: /^草稿(?: · \d+)?$/ }).click()
  await page.locator('.draft-item', { hasText: 'Page 1' }).click()
  await expect(page.getByLabel('文本内容')).toHaveValue('保存恢复测试')
})

test('exports mixed-size slides as a zip after warning', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '9:16' }).click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await page.getByRole('button', { name: '16:9' }).click()

  await page.getByRole('button', { name: '打包导出' }).click()
  await expect(page.getByRole('heading', { name: '包含不同尺寸页面' })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '继续导出' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/^freeform-slides-\d{4}-\d{2}-\d{2}\.zip$/)
  const path = await download.path()
  expect(path).toBeTruthy()
  const zip = await JSZip.loadAsync(await readFile(path!))
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort()
  expect(names).toEqual(['slide-01.png', 'slide-02.png'])

  const first = await zip.file('slide-01.png')!.async('uint8array')
  const second = await zip.file('slide-02.png')!.async('uint8array')
  expect(readPngSize(Buffer.from(first))).toEqual({ width: 1080, height: 1920 })
  expect(readPngSize(Buffer.from(second))).toEqual({ width: 1920, height: 1080 })
})

test('copies, pastes, and deletes the selected element', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '文本框' }).click()

  await expect(page.locator('.freeform-element')).toHaveCount(1)
  const before = await freeformElementPositions(page)

  await page.keyboard.press('ControlOrMeta+C')
  await page.keyboard.press('ControlOrMeta+V')
  await expect(page.locator('.freeform-element')).toHaveCount(2)

  const after = await freeformElementPositions(page)
  expect(after[1].x - before[0].x).toBe(16)
  expect(after[1].y - before[0].y).toBe(16)

  await page.keyboard.press('Delete')
  await expect(page.locator('.freeform-element')).toHaveCount(1)
})

test('moves the selected element through layer order', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '文本框' }).click()
  await page.getByRole('button', { name: '矩形' }).click()

  await expect(page.locator('.freeform-element')).toHaveCount(2)
  await expect.poll(() => freeformElementKinds(page)).toEqual(['text', 'shape'])

  await page.getByRole('button', { name: '置底' }).click()
  await expect.poll(() => freeformElementKinds(page)).toEqual(['shape', 'text'])

  await page.getByRole('button', { name: '置顶' }).click()

  await expect.poll(() => freeformElementKinds(page)).toEqual(['text', 'shape'])
})

test('inserts line and arrow elements', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()

  const insertTools = page.getByLabel('插入工具')
  await insertTools.getByRole('button', { name: '直线' }).click()
  await expect(page.getByTestId('freeform-line')).toBeVisible()

  await insertTools.getByRole('button', { name: '箭头' }).click()
  await expect(page.getByTestId('freeform-arrow')).toBeVisible()
})

test('multi-selects elements and aligns them left', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()

  await page.getByRole('button', { name: '文本框' }).click()
  await setSelectedElementPosition(page, 100, 120)
  await page.getByRole('button', { name: '矩形' }).click()
  await setSelectedElementPosition(page, 400, 240)

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 120 },
    { x: 400, y: 240 },
  ])

  await page.locator('.freeform-element').first().click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: '左对齐' }).click()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 120 },
    { x: 100, y: 240 },
  ])
})

test('distributes selected elements horizontally', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()

  const insertTools = page.getByLabel('插入工具')
  await insertTools.getByRole('button', { name: '矩形' }).click()
  await setSelectedElementBox(page, 100, 160, 100, 100)
  await insertTools.getByRole('button', { name: '矩形' }).click()
  await setSelectedElementBox(page, 400, 160, 100, 100)
  await insertTools.getByRole('button', { name: '矩形' }).click()
  await setSelectedElementBox(page, 800, 160, 100, 100)

  await page.locator('.freeform-element').nth(0).click({ modifiers: ['Shift'] })
  await page.locator('.freeform-element').nth(1).click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: '水平均分' }).click()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 160 },
    { x: 450, y: 160 },
    { x: 800, y: 160 },
  ])
})
