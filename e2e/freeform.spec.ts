import { expect, test } from '@playwright/test'

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
