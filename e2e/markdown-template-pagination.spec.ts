import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { installOfflineFontRoutes } from './offlineFonts'
import { colourDistance, firstPdfJpeg, jpegPixel } from './exportPixels'

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
  await page.goto('/#/edit')
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

const today = () => new Date().toISOString().slice(0, 10)

async function applyTemplate(page: import('@playwright/test').Page, name: string) {
  await page.getByTestId('markdown-template-button').click()
  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await dialog.getByRole('button', { name: `预览${name}`, exact: true }).click()
  await dialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
  // With a project already open (a guest's saves come back after a reload), confirm starting a new one.
  const confirm = page.getByRole('alertdialog', { name: '用这套模板新建项目？' })
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.getByRole('button', { name: '用模板新建', exact: true }).click()
  }
  await expect(dialog).toHaveCount(0)
}

// The designed looks of the Markdown templates (theme.ts `look`), as the
// gallery lists them: name, look and the number of pages its sample makes.
const LOOKS = [
  { name: '专栏', look: 'column', pages: 5 },
  { name: '备忘录', look: 'memo', pages: 3 },
  { name: '信笺', look: 'letter', pages: 3 },
  { name: '夜读', look: 'night', pages: 4 },
  { name: '极光', look: 'aurora', pages: 4 },
  { name: '文档', look: 'doc', pages: 4 },
  { name: '宣纸', look: 'xuan', pages: 4 },
  { name: '瑞士', look: 'swiss', pages: 4 },
  { name: '手账', look: 'journal', pages: 4 },
]

async function freshEditor(page: import('@playwright/test').Page) {
  // A hash-only goto keeps the current document, so leave the app to get a fresh editor.
  await page.goto('about:blank')
  await page.goto('/#/edit')
  await page.waitForFunction(() => !!window.__cmView)
}

/** Every page of the open document: nothing spills out of the card or its content box. */
async function expectPagesInside(page: import('@playwright/test').Page, atLeast: number) {
  // The samples make their pages with the real fonts; with the system fallbacks
  // the tests run on, a section can take one more page, but never spill.
  await expect.poll(() => page.locator('.page-dot').count()).toBeGreaterThanOrEqual(atLeast)
  const count = await page.locator('.page-dot').count()
  for (let index = 0; index < count; index += 1) {
    await page.locator('.page-dot').nth(index).click()
    const overflow = await page.locator('.stage .card').evaluate((element) => {
      const content = element.querySelector<HTMLElement>('.card-content')
      return {
        cardX: element.scrollWidth - element.clientWidth,
        cardY: element.scrollHeight - element.clientHeight,
        contentX: content ? content.scrollWidth - content.clientWidth : Number.POSITIVE_INFINITY,
        contentY: content ? content.scrollHeight - content.clientHeight : Number.POSITIVE_INFINITY,
      }
    })
    expect(overflow.cardX, `page ${index + 1}`).toBeLessThanOrEqual(1)
    expect(overflow.cardY, `page ${index + 1}`).toBeLessThanOrEqual(1)
    expect(overflow.contentX, `page ${index + 1}`).toBeLessThanOrEqual(1)
    expect(overflow.contentY, `page ${index + 1}`).toBeLessThanOrEqual(1)
  }
}

test('template pagination assigns roles from real markdown blocks', async ({ page }) => {
  await chooseTheme(page, '专栏')
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

test('every template keeps each of its pages inside the card, in its own look', async ({ page }) => {
  for (const template of LOOKS) {
    await freshEditor(page)
    await applyTemplate(page, template.name)
    const card = page.locator('.stage .card')
    await expect(card).toHaveAttribute('data-look', template.look)
    await expect(card.locator('.markdown-card-chrome')).toHaveCount(1)
    await expect(card).toHaveAttribute('data-page-role', 'cover')
    await expectPagesInside(page, template.pages)
    await expect(card).toHaveAttribute('data-page-role', 'close')
  }
})

test('the looks measure pages under a social header the way they draw them', async ({ page }) => {
  for (const template of LOOKS) {
    await freshEditor(page)
    await applyTemplate(page, template.name)
    const platformButtons = page.getByRole('tablist', { name: '平台' }).getByRole('button')
    for (const platformIndex of [1, 2]) {
      await platformButtons.nth(platformIndex).click()
      const count = await page.locator('.page-dot').count()
      expect(count, template.name).toBeGreaterThanOrEqual(template.pages)
      await expectPagesInside(page, count)
      // The header takes the running head's place; the words start under it.
      const card = page.locator('.stage .card')
      await expect(card).toHaveAttribute('data-has-social-header', 'true')
      await expect(card.locator('.markdown-chrome-head')).toBeHidden()
      const header = await card.locator('.cardhead').boundingBox()
      const first = await card.locator('.card-content > *').first().boundingBox()
      expect(first!.y - (header!.y + header!.height), template.name).toBeGreaterThanOrEqual(8)
    }
  }
})

test('a page never ends on a heading: it moves over with what it introduces', async ({ page }) => {
  await chooseTheme(page, '专栏')
  const sections = Array.from({ length: 8 }, (_, index) => [
    `## 第 ${index + 1} 节的小标题`,
    '',
    '这一段正文写得长一些，好让几节内容排满好几页卡片。'.repeat(3),
    '',
    '第二段也有几行字，标题后面总要跟着正文才好读。'.repeat(2),
  ].join('\n'))
  await setDoc(page, ['# 一篇很长的文章', '', ...sections].join('\n\n'))
  // The pages are set again once the new text is in: wait for its title on the first.
  await expect(page.locator('.stage .card-content h1')).toHaveText('一篇很长的文章')
  const count = await page.locator('.page-dot').count()
  expect(count).toBeGreaterThan(3)
  for (let index = 0; index < count - 1; index += 1) {
    await page.locator('.page-dot').nth(index).click()
    const last = await page.locator('.stage .card-content > *').last().evaluate((element) => element.tagName)
    expect(last, `page ${index + 1}`).not.toMatch(/^H[1-6]$/)
  }
  await expectPagesInside(page, count)
})

test('the running head carries the article title and gives way to a social header on the first page only', async ({ page }) => {
  await applyTemplate(page, '专栏')
  await page.locator('.page-dot').nth(1).click()
  await expect(page.locator('.stage .markdown-chrome-head')).toHaveText('在城市里慢慢走')
  await expect(page.locator('.stage .markdown-chrome-folio')).toHaveText(/^02 \/ 0\d$/)

  await page.getByRole('tablist', { name: '平台' }).getByRole('button', { name: '微博', exact: true }).click()
  await expect(page.locator('.stage .cardhead-weibo')).toBeVisible()
  await expect(page.locator('.stage .markdown-chrome-head')).toBeHidden()

  await page.getByRole('button', { name: '个人资料', exact: true }).click()
  const profileDialog = page.locator('.modal')
  await profileDialog.locator('.field-inline')
    .filter({ hasText: '只在首页显示个人信息' })
    .getByRole('switch')
    .click()
  await profileDialog.getByRole('button', { name: '保存', exact: true }).click()

  await page.locator('.page-dot').nth(1).click()
  await expect(page.locator('.stage .cardhead-weibo')).toHaveCount(0)
  await expect(page.locator('.stage .card')).toHaveAttribute('data-has-social-header', 'false')
  await expect(page.locator('.stage .markdown-chrome-head')).toBeVisible()
  await page.locator('.page-dot').nth(0).click()
  await expect(page.locator('.stage .cardhead-weibo')).toBeVisible()
  await expectPagesInside(page, await page.locator('.page-dot').count())
})

test('long profile text stays inside a look\'s social header', async ({ page }) => {
  await applyTemplate(page, '夜读')
  await page.getByRole('button', { name: '个人资料', exact: true }).click()
  const profileDialog = page.locator('.modal')
  const inputs = profileDialog.locator('.text-input')
  await inputs.nth(0).fill('一个长度明显超过卡片头部可用空间的账号名称')
  await inputs.nth(1).fill('a-handle-that-is-deliberately-too-long-for-the-card-header')
  await inputs.nth(2).fill('一个同样很长并且需要被安全截断的发布地点')
  await profileDialog.getByRole('button', { name: '保存', exact: true }).click()

  const platformButtons = page.getByRole('tablist', { name: '平台' }).getByRole('button')
  for (const platformIndex of [1, 2]) {
    await platformButtons.nth(platformIndex).click()
    const card = page.locator('.stage .card')
    const geometry = await card.evaluate((element) => {
      const header = element.querySelector<HTMLElement>('.cardhead')!
      const name = element.querySelector<HTMLElement>('.cardhead-name')!
      const headerRect = header.getBoundingClientRect()
      return {
        cardOverflowX: element.scrollWidth - element.clientWidth,
        nameInside: name.getBoundingClientRect().right <= headerRect.right + 1,
      }
    })
    expect(geometry.cardOverflowX).toBeLessThanOrEqual(1)
    expect(geometry.nameInside).toBe(true)
    await expect(card.locator('.cardhead-name')).toHaveCSS('text-overflow', 'ellipsis')
  }
})

test('the look picker draws every theme on the article itself and sets a look in its own face', async ({ page }) => {
  await setDoc(page, '# 我自己的文章\n\n第一段正文。\n\n---\n\n第二页。')
  const trigger = page.getByTestId('markdown-look-picker')
  await trigger.click()
  const panel = page.getByRole('listbox', { name: '主题' })
  await expect(panel).toBeFocused()
  await expect(panel.getByRole('group', { name: '长文版式' }).getByRole('option')).toHaveCount(9)
  await expect(panel.getByRole('group', { name: '基础主题' }).getByRole('option')).toHaveCount(4)
  // Each thumbnail is the open article in that look, its cover when the article has more pages.
  const thumb = panel.getByTestId('look-option-template-night').locator('.card')
  await expect(thumb).toHaveAttribute('data-look', 'night')
  await expect(thumb).toHaveAttribute('data-page-role', 'cover')
  await expect(thumb.locator('h1')).toHaveText('我自己的文章')

  // A designed look comes with its template's face.
  await panel.getByRole('option', { name: '信笺', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(page.locator('.stage .card')).toHaveAttribute('data-look', 'letter')
  await expect(page.getByRole('combobox', { name: '字体' })).toContainText('霞鹜文楷')
  await expect(page.locator('.cm-content')).toContainText('我自己的文章')

  // The keyboard walks the grid; a plain theme keeps the article's font.
  await trigger.press('Enter')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect(page.locator('.stage .card')).toHaveAttribute('data-card-theme', 'mint')
  await expect(page.getByRole('combobox', { name: '字体' })).toContainText('霞鹜文楷')

  // Escape closes the panel without a change.
  await trigger.click()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.stage .card')).toHaveAttribute('data-card-theme', 'mint')
})

test('single-page, empty and plain-theme fallbacks remove the look\'s chrome safely', async ({ page }) => {
  await chooseTheme(page, '专栏')
  await setDoc(page, '只有这一页。')
  await expect(page.locator('.page-dot')).toHaveCount(1)
  await expect(page.locator('.stage .card')).toHaveAttribute('data-page-role', 'article')

  await setDoc(page, '')
  await expect(page.locator('.page-dot')).toHaveCount(1)
  await expect(page.locator('.stage .card')).toHaveAttribute('data-page-role', 'article')

  await chooseTheme(page, '简约白')
  await expect(page.locator('.stage .card')).toHaveAttribute('data-card-theme', 'light')
  await expect(page.locator('.stage .markdown-card-chrome')).toHaveCount(0)

  await chooseTheme(page, '专栏')
  await expect(page.locator('.stage .markdown-card-chrome--column')).toHaveCount(1)
})

test('missing local template image falls back without broken-image chrome', async ({ page }) => {
  await page.route('**/templates/editorial-building.webp', (route) => route.abort())
  await applyTemplate(page, '专栏')

  const failedImage = page.locator('.stage .img-wrap.image-load-error')
  await expect(failedImage).toHaveCount(1)
  await expect(failedImage.locator('img')).toHaveCSS('display', 'none')
  await expect(page.locator('.stage .card-content h1')).toContainText('在城市里慢慢走')
})

test('template workspace stays within narrow and desktop viewports', async ({ page }) => {
  await applyTemplate(page, '极光')

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
  await applyTemplate(page, '宣纸')
  await page.locator('.page-dot').nth(3).click()
  await expect(page.locator('.stage .markdown-chrome-folio')).toHaveText('肆')

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

test('PDF export packs every page into one file, each page as large as its card', async ({ page }) => {
  await setDoc(page, [
    '# 第一页的标题',
    '',
    '第一页的正文。',
    '',
    '---',
    '',
    '## 第二页的小标题',
    '',
    '第二页的正文。',
    '',
    '---',
    '',
    '最后一页只有正文。',
  ].join('\n'))
  await expect(page.locator('.page-dot')).toHaveCount(3)

  const toolbarDownload = page.waitForEvent('download')
  await page.getByTestId('markdown-export-pdf').click()
  const toolbar = await toolbarDownload
  expect(toolbar.suggestedFilename()).toBe(`cards-${today()}.pdf`)
  const toolbarPath = await toolbar.path()
  expect(toolbarPath).toBeTruthy()
  const source = (await readFile(toolbarPath!)).toString('latin1')
  expect(source.startsWith('%PDF-1.4')).toBe(true)
  expect(source).toContain('/Count 3')
  // 360×480 px cards print at 96 px to the inch: 270×360 pt pages.
  expect(source.match(/\/MediaBox \[0 0 270 360\]/g)).toHaveLength(3)

  // The right-click menu offers the same PDF alongside the zip.
  await page.locator('.stage .card-frame').dispatchEvent('contextmenu')
  const ctxDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出全部 3 页 PDF', exact: true }).click()
  const ctx = await ctxDownload
  expect(ctx.suggestedFilename()).toBe(`cards-${today()}.pdf`)
})

test('PDF pages keep the theme\'s background', async ({ page }) => {
  await setDoc(page, '# 深色主题\n\n正文。')
  await chooseTheme(page, '深空黑')
  const downloaded = page.waitForEvent('download')
  await page.getByTestId('markdown-export-pdf').click()
  const pdf = await readFile((await (await downloaded).path())!)
  // The card's own #1c1c1e in its left margin (the page is drawn at 3×); only what the card leaves clear turns white.
  const inside = await jpegPixel(page, firstPdfJpeg(pdf), 60, 300)
  expect(colourDistance(inside, [0x1c, 0x1c, 0x1e])).toBeLessThan(12)
})

test('local mode keeps the share entry away', async ({ page }) => {
  await page.goto('/#/edit')
  // No server in local mode: there is no share page to hand out a link to,
  // so the toolbar shows the zip download and nothing else; version history
  // lives on the server too.
  await expect(page.getByTestId('markdown-share')).toHaveCount(0)
  await expect(page.getByTestId('draft-history')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /打包下载/ })).toBeVisible()
  // PDF export is all client-side, so local mode offers it too.
  await expect(page.getByTestId('markdown-export-pdf')).toBeVisible()
})
