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

test('issue-cover uses a left profile masthead on every social page', async ({ page }) => {
  await applyTemplate(page, '议题封面')
  const platformButtons = page.locator('.seg[role="tablist"]').first().locator('button')

  for (const platformIndex of [1, 2]) {
    await platformButtons.nth(platformIndex).click()

    for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
      await page.locator('.page-dot').nth(pageIndex).click()
      const card = page.locator('.stage .card')
      const geometry = await card.evaluate((element) => {
        const header = element.querySelector<HTMLElement>('.cardhead')!
        const avatar = element.querySelector<HTMLElement>('.avatar')!
        const meta = element.querySelector<HTMLElement>('.cardhead-meta')!
        const name = element.querySelector<HTMLElement>('.cardhead-name')!
        const chrome = element.querySelector<HTMLElement>('.markdown-card-chrome')!
        const cardRect = element.getBoundingClientRect()
        const headerRect = header.getBoundingClientRect()
        const avatarRect = avatar.getBoundingClientRect()
        const headerStyle = getComputedStyle(header)
        const lineStyle = getComputedStyle(header, '::after')
        const coverEditionStyle = getComputedStyle(chrome, '::before')
        const edition = element.querySelector<HTMLElement>('.markdown-chrome-label')
        const editionRect = edition?.getBoundingClientRect() ?? null

        return {
          avatarHeight: avatarRect.height,
          avatarLeft: avatarRect.left,
          cardLeft: cardRect.left,
          cardRight: cardRect.right,
          coverEdition: {
            borderBottomWidth: coverEditionStyle.borderBottomWidth,
            fontSize: coverEditionStyle.fontSize,
            right: coverEditionStyle.right,
            top: coverEditionStyle.top,
          },
          edition: editionRect
            ? {
                display: getComputedStyle(edition!).display,
                left: editionRect.left,
                right: editionRect.right,
              }
            : null,
          headerColor: headerStyle.color,
          headerHeight: headerRect.height,
          headerLeft: headerRect.left,
          headerRight: headerRect.right,
          lineRight: lineStyle.right,
          lineStyle: lineStyle.borderTopStyle,
          marginBottom: headerStyle.marginBottom,
          marginRight: headerStyle.marginRight,
          metaAlign: getComputedStyle(meta).textAlign,
          nameColor: getComputedStyle(name).color,
        }
      })

      expect(geometry.headerHeight).toBe(24)
      expect(geometry.avatarHeight).toBe(22)
      expect(Math.abs(geometry.headerLeft - (geometry.cardLeft + 22))).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.avatarLeft - geometry.headerLeft)).toBeLessThanOrEqual(1)
      expect(geometry.marginBottom).toBe('30px')
      expect(geometry.marginRight).toBe('104px')
      expect(geometry.metaAlign).toBe('left')
      expect(geometry.nameColor).toBe(geometry.headerColor)
      expect(geometry.lineStyle).toBe('solid')
      expect(geometry.lineRight).toBe('-104px')

      if (pageIndex === 0) {
        expect(geometry.coverEdition).toEqual({
          borderBottomWidth: '0px',
          fontSize: '10px',
          right: '18px',
          top: '20px',
        })
      } else {
        expect(geometry.edition).not.toBeNull()
        expect(geometry.edition!.display).toBe('block')
        expect(Math.abs(geometry.cardRight - geometry.edition!.right - 18)).toBeLessThanOrEqual(1)
        expect(geometry.edition!.left - geometry.headerRight).toBeGreaterThanOrEqual(8)
      }
    }
  }
})

for (const template of [
  { name: '编辑档案', primarySelectors: ['h1', 'h2', 'blockquote', 'h2'] },
  { name: '公共剧场', primarySelectors: ['h1', 'h2', 'blockquote', 'h2'] },
  { name: '议题封面', primarySelectors: ['h1', 'h2', 'blockquote', 'h2'] },
]) {
  test(`${template.name} integrates social headers without cropping its composition`, async ({ page }) => {
    await applyTemplate(page, template.name)

    const baselineTops: number[] = []
    for (const [index, selector] of template.primarySelectors.entries()) {
      await page.locator('.page-dot').nth(index).click()
      const primary = await page.locator(`.stage .card-content ${selector}`).first().boundingBox()
      expect(primary).not.toBeNull()
      baselineTops.push(primary!.y)
    }

    const platformButtons = page.locator('.seg[role="tablist"]').first().locator('button')
    for (const platformIndex of [1, 2]) {
      await platformButtons.nth(platformIndex).click()

      for (const [index, selector] of template.primarySelectors.entries()) {
        await page.locator('.page-dot').nth(index).click()
        const card = page.locator('.stage .card')
        const cardBox = await card.boundingBox()
        const chromeBox = await card.locator('.markdown-card-chrome').boundingBox()
        const headerBox = await card.locator('.cardhead').boundingBox()
        const primaryBox = await card.locator(`.card-content ${selector}`).first().boundingBox()

        expect(cardBox).not.toBeNull()
        expect(chromeBox).not.toBeNull()
        expect(headerBox).not.toBeNull()
        expect(primaryBox).not.toBeNull()
        expect(Math.abs(chromeBox!.y - cardBox!.y)).toBeLessThanOrEqual(1)
        expect(Math.abs(chromeBox!.height - cardBox!.height)).toBeLessThanOrEqual(1)
        expect(primaryBox!.y - (headerBox!.y + headerBox!.height)).toBeGreaterThanOrEqual(8)
        expect(Math.abs(primaryBox!.y - baselineTops[index])).toBeLessThanOrEqual(32)
        if (platformIndex === 2) {
          const twitterNameUsesHeaderColor = await card.evaluate((element) => {
            const header = element.querySelector<HTMLElement>('.cardhead-twitter')
            const name = element.querySelector<HTMLElement>('.cardhead-twitter .cardhead-name')
            return (
              header !== null &&
              name !== null &&
              getComputedStyle(name).color === getComputedStyle(header).color
            )
          })
          expect(twitterNameUsesHeaderColor).toBe(true)
        }
      }
    }
  })
}

test('public-theatre quote keeps its signal clear of supporting text on every platform', async ({ page }) => {
  await applyTemplate(page, '公共剧场')
  const platformButtons = page.locator('.seg[role="tablist"]').first().locator('button')

  for (const platformIndex of [0, 1, 2]) {
    await platformButtons.nth(platformIndex).click()
    await page.locator('.page-dot').nth(2).click()
    const supportingText = await page.locator('.stage .card-content[data-page-role="quote"] > p').boundingBox()
    const signal = await page.locator('.stage .markdown-card-chrome[data-chrome-role="quote"] .markdown-chrome-signal').boundingBox()

    expect(supportingText).not.toBeNull()
    expect(signal).not.toBeNull()
    expect(signal!.y - (supportingText!.y + supportingText!.height)).toBeGreaterThanOrEqual(12)
  }
})

test('social template headers contain long profile text without changing height', async ({ page }) => {
  await applyTemplate(page, '议题封面')
  await page.getByRole('button', { name: '个人资料', exact: true }).click()

  const profileDialog = page.locator('.modal')
  const inputs = profileDialog.locator('.text-input')
  await inputs.nth(0).fill('一个长度明显超过卡片头部可用空间的账号名称')
  await inputs.nth(1).fill('a-handle-that-is-deliberately-too-long-for-the-card-header')
  await inputs.nth(2).fill('一个同样很长并且需要被安全截断的发布地点')
  await profileDialog.getByRole('button', { name: '保存', exact: true }).click()

  const platformButtons = page.locator('.seg[role="tablist"]').first().locator('button')
  for (const platformIndex of [1, 2]) {
    await platformButtons.nth(platformIndex).click()
    const card = page.locator('.stage .card')
    const geometry = await card.evaluate((element) => {
      const header = element.querySelector<HTMLElement>('.cardhead')!
      const name = element.querySelector<HTMLElement>('.cardhead-name')!
      const sub = element.querySelector<HTMLElement>('.cardhead-sub')!
      const headerRect = header.getBoundingClientRect()
      const nameRect = name.getBoundingClientRect()
      const subRect = sub.getBoundingClientRect()
      return {
        cardOverflowX: element.scrollWidth - element.clientWidth,
        headerHeight: headerRect.height,
        headerWidth: headerRect.width,
        nameInside: nameRect.right <= headerRect.right + 1,
        subInside: subRect.right <= headerRect.right + 1,
      }
    })
    expect(geometry.cardOverflowX).toBeLessThanOrEqual(1)
    expect(geometry.headerHeight).toBe(24)
    expect(geometry.headerWidth).toBe(212)
    expect(geometry.nameInside).toBe(true)
    expect(geometry.subInside).toBe(true)
    await expect(card.locator('.cardhead-name')).toHaveCSS('text-overflow', 'ellipsis')
    await expect(card.locator('.cardhead-sub')).toHaveCSS('text-overflow', 'ellipsis')
  }
})

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
