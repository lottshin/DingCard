import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { installOfflineFontRoutes } from './offlineFonts'

declare global {
  interface Window {
    __cmView?: {
      state: { doc: { toString(): string } }
      dispatch(spec: unknown): void
    }
  }
}

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  await page.goto('/')
  await page.waitForFunction(() => !!window.__cmView)
})

async function setDoc(page: import('@playwright/test').Page, text: string) {
  await page.evaluate((nextSource) => {
    const view = window.__cmView!
    const length = view.state.doc.toString().length
    view.dispatch({ changes: { from: 0, to: length, insert: nextSource } })
  }, text)
}

async function chooseTheme(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('combobox', { name: '主题' }).click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

function readPngSize(buffer: Buffer) {
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG')
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

async function applyTemplate(page: import('@playwright/test').Page, name: string) {
  await page.getByTestId('markdown-template-button').click()
  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await dialog.getByRole('button', { name: `预览${name}`, exact: true }).click()
  await dialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
}

test('template pagination assigns roles from real markdown blocks', async ({ page }) => {
  await chooseTheme(page, '模板 · 公共剧场')
  await setDoc(page, [
    '# 城市里的公共座椅',
    '',
    '从一条街的停留方式开始观察。',
    '',
    '---',
    '',
    '## 路过与停下',
    '',
    '中间页只保留正文，让阅读节奏慢下来。',
    '',
    '---',
    '',
    '> 一把椅子决定了人能不能在这里多待十分钟。',
    '',
    '---',
    '',
    '- 看座椅朝向',
    '- 看树荫覆盖',
    '- 看人与街道的距离',
    '',
    '---',
    '',
    '观察到这里，下一次散步会多一个视角。',
  ].join('\n'))

  await expect(page.locator('.page-dot')).toHaveCount(5)
  const expectedRoles = ['cover', 'article', 'quote', 'list', 'close']

  for (const [index, role] of expectedRoles.entries()) {
    await page.locator('.page-dot').nth(index).click()
    await expect(page.locator('.stage .card')).toHaveAttribute('data-page-role', role)
    await expect(page.locator('.stage .card')).toHaveAttribute('data-page-index', String(index))
    await expect(page.locator('.stage .card')).toHaveAttribute('data-page-count', '5')
  }
})

for (const template of [
  {
    name: '编辑档案',
    themeId: 'template-editorial-archive',
    roles: ['cover', 'article', 'quote', 'close'],
  },
  {
    name: '公共剧场',
    themeId: 'template-public-theatre',
    roles: ['cover', 'article', 'quote', 'list'],
  },
  {
    name: '议题封面',
    themeId: 'template-issue-cover',
    roles: ['cover', 'article', 'quote', 'close'],
  },
]) {
  test(`${template.name} keeps all four designed pages inside the card`, async ({ page }) => {
    await applyTemplate(page, template.name)

    await expect(page.locator('.page-dot')).toHaveCount(4)
    for (const [index, role] of template.roles.entries()) {
      await page.locator('.page-dot').nth(index).click()
      const card = page.locator('.stage .card')
      await expect(card).toHaveAttribute('data-card-theme', template.themeId)
      await expect(card).toHaveAttribute('data-page-role', role)
      await expect(card.locator('.markdown-card-chrome')).toHaveCount(1)

      const overflow = await card.evaluate((element) => {
        const content = element.querySelector<HTMLElement>('.card-content')
        return {
          cardX: element.scrollWidth - element.clientWidth,
          cardY: element.scrollHeight - element.clientHeight,
          contentX: content ? content.scrollWidth - content.clientWidth : Number.POSITIVE_INFINITY,
          contentY: content ? content.scrollHeight - content.clientHeight : Number.POSITIVE_INFINITY,
        }
      })
      expect(overflow.cardX).toBeLessThanOrEqual(1)
      expect(overflow.cardY).toBeLessThanOrEqual(1)
      expect(overflow.contentX).toBeLessThanOrEqual(1)
      expect(overflow.contentY).toBeLessThanOrEqual(1)
    }
  })
}

test('template cards keep social headers clear and respect first-page-only mode', async ({ page }) => {
  await applyTemplate(page, '公共剧场')
  await page.getByRole('tablist', { name: '平台' }).getByRole('button', { name: '微博', exact: true }).click()

  await expect(page.locator('.stage .cardhead-weibo')).toBeVisible()
  await expect(page.locator('.stage .card')).toHaveAttribute('data-has-social-header', 'true')
  await page.locator('.page-dot').nth(1).click()
  await expect(page.locator('.stage .cardhead-weibo')).toBeVisible()

  await page.getByRole('button', { name: '个人资料', exact: true }).click()
  const profileDialog = page.locator('.modal')
  await profileDialog.locator('.field-inline')
    .filter({ hasText: '只在首页显示个人信息' })
    .getByRole('switch')
    .click()
  await profileDialog.getByRole('button', { name: '保存', exact: true }).click()

  await expect(page.locator('.stage .cardhead-weibo')).toHaveCount(0)
  await expect(page.locator('.stage .card')).toHaveAttribute('data-has-social-header', 'false')
  await page.locator('.page-dot').nth(0).click()
  await expect(page.locator('.stage .cardhead-weibo')).toBeVisible()
  await expect(page.locator('.stage .card')).toHaveAttribute('data-has-social-header', 'true')
})

test('single-page, empty and generic-theme fallbacks remove template chrome safely', async ({ page }) => {
  await chooseTheme(page, '模板 · 编辑档案')
  await setDoc(page, '只有这一页。')
  await expect(page.locator('.page-dot')).toHaveCount(1)
  await expect(page.locator('.stage .card')).toHaveAttribute('data-page-role', 'article')

  await setDoc(page, '')
  await expect(page.locator('.page-dot')).toHaveCount(1)
  await expect(page.locator('.stage .card')).toHaveAttribute('data-page-role', 'article')

  await chooseTheme(page, '简约白')
  await expect(page.locator('.stage .card')).toHaveAttribute('data-card-theme', 'light')
  await expect(page.locator('.stage .markdown-card-chrome')).toHaveCount(0)

  await chooseTheme(page, '模板 · 编辑档案')
  await expect(page.locator('.stage .markdown-card-chrome--editorial-archive')).toHaveCount(1)
})

test('missing local template image falls back without broken-image chrome', async ({ page }) => {
  await page.route('**/templates/editorial-building.webp', (route) => route.abort())
  await applyTemplate(page, '编辑档案')

  const failedImage = page.locator('.stage .img-wrap.image-load-error')
  await expect(failedImage).toHaveCount(1)
  await expect(failedImage.locator('img')).toHaveCSS('display', 'none')
  await expect(page.locator('.stage .card-content h1')).toContainText('这周事情很多')
})

test('template workspace stays within narrow and desktop viewports', async ({ page }) => {
  await applyTemplate(page, '议题封面')

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    const geometry = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('.stage .card')
      const rect = card?.getBoundingClientRect()
      return {
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        visibleWidth: rect ? Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)) : 0,
        cardWidth: rect?.width ?? Number.POSITIVE_INFINITY,
      }
    })
    expect(geometry.documentOverflow).toBeLessThanOrEqual(1)
    expect(geometry.visibleWidth / geometry.cardWidth).toBeGreaterThan(0.9)
  }
})

test('single-page PNG export keeps template dimensions and chrome', async ({ page }) => {
  await applyTemplate(page, '编辑档案')
  await page.locator('.page-dot').nth(3).click()
  await expect(page.locator('.stage .markdown-chrome-proof')).toBeVisible()

  await page.locator('.stage .card-frame').dispatchEvent('contextmenu')
  await expect(page.getByRole('button', { name: '导出第 4 页 PNG', exact: true })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出第 4 页 PNG', exact: true }).click()
  const download = await downloadPromise
  const path = await download.path()

  expect(download.suggestedFilename()).toBe('card-4.png')
  expect(path).toBeTruthy()
  expect(readPngSize(await readFile(path!))).toEqual({ width: 1080, height: 1440 })
})
