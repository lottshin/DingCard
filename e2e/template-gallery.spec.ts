import { expect, test } from '@playwright/test'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

test('Markdown gallery renders three design systems and applies a complete document', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('markdown-template-button').click()

  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.template-tile')).toHaveCount(3)
  await expect(dialog.locator('.template-tile-preview')).toHaveCount(3)
  await expect(dialog.locator('.template-detail-preview')).toBeVisible()
  await expect.poll(() => dialog.locator('.template-markdown-preview .card-content h1').count()).toBeGreaterThan(0)
  await expect(dialog.locator('.template-detail .card')).toHaveCSS('border-radius', '4px')
  await expect(dialog.locator('.template-markdown-preview .card[data-card-theme="template-editorial-archive"]')).toHaveCount(2)
  await expect(dialog.locator('.template-markdown-preview .card[data-card-theme="template-public-theatre"]')).toHaveCount(1)
  await expect(dialog.locator('.template-markdown-preview .card[data-card-theme="template-issue-cover"]')).toHaveCount(1)
  const editorialPreview = dialog.getByRole('button', { name: '预览编辑档案' })
  const theatrePreview = dialog.getByRole('button', { name: '预览公共剧场' })
  await expect(editorialPreview).toHaveAttribute('aria-pressed', 'true')
  await theatrePreview.click()
  await expect(theatrePreview).toHaveAttribute('aria-pressed', 'true')
  await expect(editorialPreview).toHaveAttribute('aria-pressed', 'false')
  await editorialPreview.click()

  await dialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.cm-content')).toContainText('这周事情很多，我先删掉一半')
  await expect(page.locator('.pane-sub')).toContainText('4 页')
  await expect(page.getByRole('combobox', { name: '主题' })).toContainText('模板 · 编辑档案')
})

test('Markdown cancel keeps the current unsaved content intact', async ({ page }) => {
  await page.goto('/')
  const weiboButton = page.getByRole('tablist', { name: '平台' })
    .getByRole('button', { name: '微博', exact: true })
  await weiboButton.click()
  const before = (await page.locator('.cm-content').innerText()).replace(/\s+/g, ' ').trim()

  await page.getByTestId('markdown-template-button').click()
  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  const useButton = dialog.getByRole('button', { name: '使用这套模板', exact: true })
  await useButton.click()
  const confirm = page.getByRole('alertdialog', { name: '要新建一份模板作品吗？' })
  await expect(confirm).toBeVisible()
  const continueButton = confirm.getByRole('button', { name: '继续编辑', exact: true })
  const createButton = confirm.getByRole('button', { name: '新建模板作品', exact: true })
  await expect(continueButton).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(createButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(continueButton).toBeFocused()
  await continueButton.click()

  await expect(confirm).toBeHidden()
  await expect(useButton).toBeFocused()

  await useButton.click()
  await expect(confirm).toBeVisible()
  await page.locator('.template-confirm-backdrop').click({ position: { x: 2, y: 2 } })
  await expect(confirm).toBeHidden()
  await expect(useButton).toBeFocused()
  await expect(weiboButton).toHaveClass(/on/)
  await expect.poll(async () => (await page.locator('.cm-content').innerText()).replace(/\s+/g, ' ').trim()).toBe(before)
})

test('gallery closes with keyboard or backdrop and restores the trigger focus', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByTestId('markdown-template-button')
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog.getByRole('button', { name: '关闭模板中心' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()

  await trigger.click()
  await page.locator('.template-backdrop').click({ position: { x: 2, y: 2 } })
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('Freeform gallery renders real layers and starts a fresh history', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByTestId('freeform-template-button').click()

  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog.locator('.template-tile')).toHaveCount(4)
  await expect(dialog.locator('.template-freeform-artboard')).toHaveCount(5)
  await expect(dialog.locator('.template-freeform-artboard .freeform-preview-element').first()).toBeVisible()

  await dialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
  await expect(page.locator('.freeform-workspace')).toHaveAttribute('data-history-depth', '0')
  await expect(page.locator('.freeform-thumb')).toHaveCount(3)
  await expect(page.locator('.freeform-thumb-art .freeform-preview-element').first()).toBeVisible()
  await expect(page.locator('.freeform-thumb-art .freeform-element')).toHaveCount(0)
  await expect(page.locator('.freeform-thumb-art [data-testid]')).toHaveCount(0)
  await expect(page.locator('.freeform-thumb-art [role="textbox"]')).toHaveCount(0)
  await expect(page.locator('.freeform-element')).not.toHaveCount(0)
  const editorNodeId = await page.getByTestId('freeform-canvas').locator('[data-scene-node-id]').first().getAttribute('data-scene-node-id')
  expect(editorNodeId).toBeTruthy()
  await expect(page.locator(`[data-scene-node-id="${editorNodeId}"]`)).toHaveCount(1)

  await page.setViewportSize({ width: 1024, height: 768 })
  const thumbnailOverflow = await page.locator('.freeform-thumb').first().evaluate((thumbnail) => thumbnail.scrollWidth - thumbnail.clientWidth)
  expect(thumbnailOverflow).toBeLessThanOrEqual(1)
  const previewsFit = await page.locator('.freeform-thumb-art').evaluateAll((frames) => frames.every((frame) => {
    const artboard = frame.querySelector<HTMLElement>('.freeform-slide-preview-artboard')
    if (!artboard) return false
    const frameRect = frame.getBoundingClientRect()
    const artboardRect = artboard.getBoundingClientRect()
    return artboardRect.left >= frameRect.left - 1
      && artboardRect.top >= frameRect.top - 1
      && artboardRect.right <= frameRect.right + 1
      && artboardRect.bottom <= frameRect.bottom + 1
  }))
  expect(previewsFit).toBe(true)
  const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(documentOverflow).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.getByTestId('freeform-template-button').click()
  const reopenedDialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await reopenedDialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: '要新建一份模板作品吗？' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(page.locator('.freeform-thumb')).toHaveCount(3)
  await expect(page.locator('.freeform-workspace')).toHaveAttribute('data-history-depth', '0')
})

test('Freeform sidebar mounts scene nodes only near the visible thumbnails', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByTestId('freeform-template-button').click()
  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await dialog.getByRole('button', { name: '使用这套模板', exact: true }).click()

  for (let index = 0; index < 10; index += 1) {
    await page.getByRole('button', { name: '复制页面', exact: true }).click()
  }

  const thumbnails = page.locator('.freeform-thumb')
  await expect(thumbnails).toHaveCount(13)
  await expect.poll(async () => thumbnails.evaluateAll((items) => (
    items.filter((item) => item.querySelector('.freeform-preview-element')).length
  ))).toBeLessThan(13)
  await expect(page.locator('.freeform-thumb.on .freeform-preview-element').first()).toBeVisible()
})

test('gallery stays inside desktop and narrow viewports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByTestId('markdown-template-button').click()

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    const geometry = await page.locator('.template-dialog').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const body = element.querySelector('.template-dialog-body') as HTMLElement | null
      return {
        left: rect.left,
        right: rect.right,
        viewport: window.innerWidth,
        bodyOverflow: body ? body.scrollWidth - body.clientWidth : -1,
      }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport)
    expect(geometry.bodyOverflow).toBeLessThanOrEqual(1)
  }
})
