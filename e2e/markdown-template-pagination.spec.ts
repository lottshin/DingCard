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

/** Every page's card-content text, in page order (click through the dots). */
async function collectCardText(page: import('@playwright/test').Page): Promise<string[]> {
  const count = await page.locator('.page-dot').count()
  const texts: string[] = []
  for (let index = 0; index < count; index += 1) {
    await page.locator('.page-dot').nth(index).click()
    texts.push(await page.locator('.stage .card-content').evaluate((element) => element.textContent ?? ''))
  }
  return texts
}

/** The <strong> runs of every page, in page order (click through the dots). */
async function collectStrongText(page: import('@playwright/test').Page): Promise<string> {
  const count = await page.locator('.page-dot').count()
  const texts: string[] = []
  for (let index = 0; index < count; index += 1) {
    await page.locator('.page-dot').nth(index).click()
    texts.push(...(await page.locator('.stage .card-content strong').allInnerTexts()))
  }
  return texts.join('')
}

/** Text with whitespace and the word-break marks removed: characters only. */
const normalizeText = (text: string) => text.replace(/[\s\u200B]/g, '')

test('a blockquote taller than a page is split across cards without losing text', async ({ page }) => {
  await chooseTheme(page, '专栏')
  // One quote, far taller than a page, with a bold phrase inside — nothing
  // here can become its own oversized page, so it must be cut and flowed.
  const lines = Array.from({ length: 30 }, (_, index) => {
    const marker = `第${String(index).padStart(2, '0')}句`
    return index === 20 ? `撑高度的引用文字${marker}。**这句是加粗的**` : `撑高度的引用文字${marker}。`
  })
  await setDoc(page, `> ${lines.join('\n> ')}`)

  await expect.poll(() => page.locator('.page-dot').count()).toBeGreaterThanOrEqual(2)
  await expectPagesInside(page, 2)

  // Every sentence survived the split, exactly once, in order.
  const joined = normalizeText((await collectCardText(page)).join(''))
  const expected = normalizeText(lines.join('').replace(/\*\*/g, ''))
  expect(joined).toBe(expected)

  // The bold phrase kept its formatting across the cut: the pages that hold
  // any part of it render that part inside a <strong>.
  const strongText = normalizeText(await collectStrongText(page))
  expect(strongText).toContain('这句是加粗的')

  // The pages after the cut still resolve their roles: this article opens on
  // a cover and its last page is the closing one.
  const count = await page.locator('.page-dot').count()
  await page.locator('.page-dot').nth(0).click()
  await expect(page.locator('.stage .card')).toHaveAttribute('data-page-role', 'cover')
  await page.locator('.page-dot').nth(count - 1).click()
  await expect(page.locator('.stage .card')).toHaveAttribute('data-page-role', 'close')
})

test('a long code block paginates at line ends', async ({ page }) => {
  await chooseTheme(page, '专栏')
  const codeLines = Array.from({ length: 60 }, (_, index) => {
    const marker = String(index).padStart(2, '0')
    return `const value${marker} = ${index} + 1; //行${marker}注释`
  })
  await setDoc(page, ['```js', ...codeLines, '```'].join('\n'))

  await expect.poll(() => page.locator('.page-dot').count()).toBeGreaterThanOrEqual(2)
  await expectPagesInside(page, 2)

  // Every line is on exactly one page, and no line was cut mid-way: what
  // each page renders is whole source lines.
  const renderedLines = (await collectCardText(page))
    .flatMap((text) => text.split('\n'))
    .map((line) => line.trim())
    .filter(Boolean)
  const sourceLines = new Set(codeLines)
  for (const line of renderedLines) {
    expect(sourceLines.has(line), `rendered line "${line}"`).toBe(true)
  }
  const joined = normalizeText(renderedLines.join(''))
  for (const codeLine of codeLines) {
    const marker = normalizeText(codeLine.slice(codeLine.indexOf('//行')))
    expect(joined.split(marker).length - 1, codeLine).toBe(1)
  }
})

test('a table taller than a page is split between rows with its header repeated', async ({ page }) => {
  await chooseTheme(page, '专栏')
  const rows = Array.from({ length: 26 }, (_, index) => {
    const marker = String(index).padStart(2, '0')
    return `| 第${marker}城 | 住着${marker}号的人 |`
  })
  await setDoc(page, ['| 城市 | 常住的人 |', '| --- | --- |', ...rows].join('\n'))

  await expect.poll(() => page.locator('.page-dot').count()).toBeGreaterThanOrEqual(2)
  await expectPagesInside(page, 2)

  const joined = normalizeText((await collectCardText(page)).join(''))
  for (const row of rows) {
    const marker = normalizeText(row.replace(/[|]/g, ''))
    expect(joined.split(marker).length - 1, row).toBe(1)
  }

  // Every page carrying rows also carries the repeated header row.
  const count = await page.locator('.page-dot').count()
  for (let index = 0; index < count; index += 1) {
    await page.locator('.page-dot').nth(index).click()
    const table = page.locator('.stage .card-content table')
    await expect(table).toHaveCount(1)
    await expect(table.locator('thead')).toHaveCount(1)
    await expect(table.locator('thead')).toContainText('城市')
  }
})

test('a picture taller than a page is scaled down to fit instead of clipped', async ({ page }) => {
  await chooseTheme(page, '简约白')
  // 400×1200: at the card's 316px content width it would render 948px tall —
  // taller than the 426px of usable height — so it must be shrunk to fit.
  // One raster picture (what pasting gives) and one SVG (decoded
  // asynchronously, so the pages must wait for it before measuring).
  const svgPicture =
    "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='400'%20height='1200'%3E%3Crect%20width='100%25'%20height='100%25'%20fill='%23c0402a'/%3E%3C/svg%3E"
  const rasterPicture = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 1200
    const context = canvas.getContext('2d')!
    context.fillStyle = '#c0402a'
    context.fillRect(0, 0, 400, 1200)
    return canvas.toDataURL('image/png')
  })

  for (const picture of [rasterPicture, svgPicture]) {
    await setDoc(page, `![很高的图](${picture})`)

    // The pages are laid out once the picture has arrived: wait until the
    // card shows THIS picture and the paginator has scaled it.
    await expect
      .poll(async () => {
        const state = await page
          .locator('.stage .card-content .img-wrap')
          .evaluate((element) => ({
            src: element.querySelector('img')?.getAttribute('src') ?? '',
            width: element.style.width,
          }))
          .catch(() => ({ src: '', width: '' }))
        return state.src === picture ? state.width : ''
      })
      .toMatch(/^\d+px$/)
    await expect(page.locator('.stage .img-wrap.image-load-error')).toHaveCount(0)
    await expect(page.locator('.page-dot')).toHaveCount(1)
    await expectPagesInside(page, 1)

    const geometry = await page.locator('.stage .card-content .img-wrap').evaluate((element) => ({
      inlineWidth: element.style.width,
      renderedHeight: element.getBoundingClientRect().height,
      renderedWidth: element.getBoundingClientRect().width,
    }))
    expect(geometry.inlineWidth, 'the wrapper carries a scaled width').toMatch(/^\d+px$/)
    expect(geometry.renderedHeight).toBeLessThanOrEqual(426)
    expect(geometry.renderedHeight).toBeGreaterThanOrEqual(150)
    expect(geometry.renderedWidth).toBeLessThan(316)
    // No pagination error: scaling is a fix, not a failure.
    await expect(page.locator('.operation-notice--error')).toHaveCount(0)
  }
})

test('content that can be neither split nor scaled reports an explicit error', async ({ page }) => {
  await chooseTheme(page, '简约白')
  // A raw SVG 900px tall inside one HTML block: no text to cut, no table rows,
  // no picture wrapper to shrink — the paginator must say so instead of
  // clipping it behind the card's overflow.
  await setDoc(page, [
    '<svg width="300" height="900" xmlns="http://www.w3.org/2000/svg">',
    '<rect width="300" height="900" fill="#4080c0" />',
    '</svg>',
    '',
    '后面的正文。',
  ].join('\n'))

  const notice = page.locator('.operation-notice--error')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('这一页排不下')
  await expect(notice).toContainText('超过了一页的高度')
})
