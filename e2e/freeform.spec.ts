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

async function samplePngPixel(
  page: import('@playwright/test').Page,
  filePath: string,
  x: number,
  y: number,
) {
  const buffer = await readFile(filePath)
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
  return page.evaluate(
    async ({ dataUrl, x, y }) => {
      const img = new Image()
      img.src = dataUrl
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no canvas context')
      context.drawImage(img, 0, 0)
      return Array.from(context.getImageData(x, y, 1, 1).data)
    },
    { dataUrl, x, y },
  )
}

function rgbDistance(a: number[], b: number[]) {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 +
      (a[1] - b[1]) ** 2 +
      (a[2] - b[2]) ** 2,
  )
}

function contrastRatio(foreground: string, background: string) {
  const parse = (value: string) => {
    const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number)
    if (!channels || channels.length !== 3) throw new Error(`Unsupported CSS color: ${value}`)
    return channels.map((channel) => {
      const normalized = channel / 255
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
    })
  }
  const luminance = (value: string) => {
    const [red, green, blue] = parse(value)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
  }
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

async function freeformElementPositions(page: import('@playwright/test').Page) {
  return page.getByTestId('freeform-element').evaluateAll((elements) =>
    elements.map((element) => {
      const el = element as HTMLElement
      return {
        x: Number.parseFloat(el.style.left),
        y: Number.parseFloat(el.style.top),
      }
    }),
  )
}

function selectedFreeformElements(page: import('@playwright/test').Page) {
  return page.locator('[data-testid="freeform-element"][data-selected="true"]')
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

async function registerUser(page: import('@playwright/test').Page, username: string) {
  await page.getByRole('button', { name: '注册' }).click()
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill('1234')
  await page.getByRole('button', { name: '创建账号' }).click()
}

async function expectVisibleFreeformToolbarButtonsToFit(
  page: import('@playwright/test').Page,
) {
  const toolbarGeometry = await page.getByTestId('freeform-toolbar').evaluate((toolbar) => {
    const toolbarRect = toolbar.getBoundingClientRect()
    const buttons = Array.from(toolbar.querySelectorAll('button'))
      .flatMap((button) => {
        const rect = button.getBoundingClientRect()
        const style = getComputedStyle(button)
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
          return []
        }
        const hitTarget = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        return [{
          label: (button.getAttribute('aria-label') ?? button.textContent ?? '')
            .replace(/\s+/g, ' ')
            .trim(),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          isHitTarget: hitTarget === button || hitTarget?.closest('button') === button,
        }]
      })
      .sort((a, b) => a.left - b.left)

    return {
      buttons,
      toolbar: {
        left: toolbarRect.left,
        right: toolbarRect.right,
        top: toolbarRect.top,
        bottom: toolbarRect.bottom,
      },
      clientWidth: toolbar.clientWidth,
      scrollWidth: toolbar.scrollWidth,
    }
  })

  expect(toolbarGeometry.buttons.length).toBeGreaterThan(0)
  for (const button of toolbarGeometry.buttons) {
    expect.soft(button.left, `${button.label} 超出工具栏左边界`).toBeGreaterThanOrEqual(
      toolbarGeometry.toolbar.left - 0.5,
    )
    expect.soft(button.right, `${button.label} 超出工具栏右边界`).toBeLessThanOrEqual(
      toolbarGeometry.toolbar.right + 0.5,
    )
    expect.soft(button.top, `${button.label} 超出工具栏上边界`).toBeGreaterThanOrEqual(
      toolbarGeometry.toolbar.top - 0.5,
    )
    expect.soft(button.bottom, `${button.label} 超出工具栏下边界`).toBeLessThanOrEqual(
      toolbarGeometry.toolbar.bottom + 0.5,
    )
    expect.soft(button.isHitTarget, `${button.label} 的中心点被其他控件遮挡`).toBe(true)
  }
  for (let index = 0; index < toolbarGeometry.buttons.length - 1; index += 1) {
    const current = toolbarGeometry.buttons[index]
    const next = toolbarGeometry.buttons[index + 1]
    expect.soft(
      current.right,
      `${current.label} [${current.left}, ${current.right}] 与 ${next.label} [${next.left}, ${next.right}] 重叠`,
    ).toBeLessThanOrEqual(next.left + 0.5)
  }
  expect(toolbarGeometry.scrollWidth).toBeLessThanOrEqual(toolbarGeometry.clientWidth)
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

async function openFreeform(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
}

async function insertText(page: import('@playwright/test').Page) {
  await page.getByTestId('insert-text').click()
}

async function insertShape(
  page: import('@playwright/test').Page,
  label: '矩形' | '圆形' | '三角形' = '矩形',
) {
  await page.getByTestId('insert-shape').click()
  await page
    .getByRole('menu', { name: '形状' })
    .getByRole('menuitem', { name: label, exact: true })
    .click()
}

async function insertLine(
  page: import('@playwright/test').Page,
  label: '直线' | '箭头',
) {
  await page.getByTestId('insert-line').click()
  await page
    .getByRole('menu', { name: '线条' })
    .getByRole('menuitem', { name: label, exact: true })
    .click()
}

async function insertTwoSelectedRectangles(page: import('@playwright/test').Page) {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 320, 120, 100, 100)

  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(2)
  await elements.first().click({ modifiers: ['Shift'] })
  await expect(selectedFreeformElements(page)).toHaveCount(2)
  await elements.first().click()
  await expect(selectedFreeformElements(page)).toHaveCount(2)
}

async function insertTwoRectanglesLeavingInspectorFocused(page: import('@playwright/test').Page) {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 320, 120, 100, 100)

  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(2)
  return elements
}

test('inspector hierarchy shows only context-relevant sections in contract order', async ({ page }) => {
  const inspector = page.locator('.freeform-inspector')
  const sectionIds = () =>
    inspector.locator(':scope > [data-testid^="inspector-"]').evaluateAll((sections) =>
      sections.map((section) => section.getAttribute('data-testid')),
    )
  const expectSections = async (expected: string[]) => {
    await expect.poll(sectionIds).toEqual(expected.map((name) => `inspector-${name}`))
  }

  await openFreeform(page)

  await expect(page.getByTestId('inspector-page')).toBeVisible()
  await expect(inspector.locator('.inspector-empty')).toContainText('选择')
  await expectSections(['page'])
  const pagePaint = page.getByTestId('page-background-paint')
  await expect(pagePaint.getByTestId('paint-mode-solid')).toBeVisible()
  await expect(pagePaint.getByTestId('paint-mode-linear-gradient')).toBeVisible()
  await expect(pagePaint.getByTestId('paint-mode-transparent')).toBeVisible()

  await insertShape(page)
  await setSelectedElementPosition(page, 100, 100)
  await expectSections(['geometry', 'fill', 'stroke', 'arrange', 'danger'])
  const shapeFill = page.getByTestId('inspector-fill').getByTestId('shape-fill-paint')
  await expect(shapeFill.getByTestId('paint-mode-solid')).toBeVisible()
  await expect(shapeFill.getByTestId('paint-mode-linear-gradient')).toBeVisible()
  await expect(shapeFill.getByTestId('paint-mode-image')).toBeVisible()

  await insertText(page)
  await setSelectedElementPosition(page, 420, 180)
  await expectSections(['geometry', 'typography', 'fill', 'arrange', 'danger'])
  const textFill = page.getByTestId('text-fill-paint')
  await expect(textFill.getByTestId('paint-mode-solid')).toBeVisible()
  await expect(textFill.getByTestId('paint-mode-linear-gradient')).toBeVisible()
  await expect(textFill.getByTestId('paint-mode-image')).toHaveCount(0)

  await insertLine(page, '直线')
  await setSelectedElementPosition(page, 760, 300)
  await expectSections(['geometry', 'stroke', 'arrange', 'danger'])
  const lineStroke = page.getByTestId('inspector-stroke')
  await expect(
    lineStroke.getByTestId('line-stroke-color').getByTestId('paint-color-button'),
  ).toBeVisible()
  await expect(lineStroke.getByTestId('freeform-paint-field')).toHaveCount(0)
  await expect(lineStroke.getByTestId('paint-mode-linear-gradient')).toHaveCount(0)
  await expect(lineStroke.getByTestId('paint-mode-image')).toHaveCount(0)

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByTestId('insert-image').click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles('public/favicon.svg')
  await expectSections(['geometry', 'fill', 'arrange', 'danger'])
  const imageFill = page.getByTestId('inspector-fill')
  await expect(imageFill.getByRole('button', { name: '填满', exact: true })).toBeVisible()
  await expect(imageFill.getByRole('button', { name: '适应', exact: true })).toBeVisible()
  await expect(imageFill.getByTestId('freeform-paint-field')).toHaveCount(0)
  await expect(page.getByTestId('inspector-stroke')).toHaveCount(0)

  await page.getByTestId('freeform-canvas').click({ position: { x: 10, y: 10 } })
  await expect(selectedFreeformElements(page)).toHaveCount(0)
  await expect(page.getByTestId('inspector-page')).toBeVisible()
  await expect(inspector.locator('.inspector-empty')).toHaveText('选择对象以编辑属性。')
  await expect(inspector.locator('input[type="number"]')).toHaveCount(0)
  await expect(page.getByTestId('line-stroke-color')).toHaveCount(0)
  await expectSections(['page'])

  const lineElement = page.getByTestId('freeform-element').filter({ has: page.getByTestId('freeform-line') })
  const textElement = page.getByTestId('freeform-element').filter({ has: page.getByTestId('freeform-textbox') })
  await lineElement.click()
  await textElement.click({ modifiers: ['Shift'] })
  await expect(selectedFreeformElements(page)).toHaveCount(2)
  await expectSections(['arrange'])
})

test('inspector hierarchy never commits stale object sections while undo clears selection', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const inspector = page.locator('.freeform-inspector')
  await expect(page.getByTestId('inspector-geometry')).toBeVisible()
  await inspector.evaluate((node) => {
    const snapshots: string[][] = []
    node.setAttribute('data-undo-section-snapshots', '[]')
    const observer = new MutationObserver(() => {
      snapshots.push(
        Array.from(node.querySelectorAll(':scope > [data-testid^="inspector-"]'))
          .map((section) => section.getAttribute('data-testid'))
          .filter((testId): testId is string => testId !== null),
      )
      node.setAttribute('data-undo-section-snapshots', JSON.stringify(snapshots))
    })
    observer.observe(node, { childList: true, subtree: true })
  })

  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(page.getByTestId('inspector-page')).toBeVisible()
  await expect
    .poll(async () => {
      const value = await inspector.getAttribute('data-undo-section-snapshots')
      const snapshots = JSON.parse(value ?? '[]') as string[][]
      return snapshots.at(-1)
    })
    .toEqual(['inspector-page'])

  const value = await inspector.getAttribute('data-undo-section-snapshots')
  const snapshots = JSON.parse(value ?? '[]') as string[][]
  expect(snapshots.length).toBeGreaterThan(0)
  for (const snapshot of snapshots) {
    expect(snapshot).not.toContain('inspector-arrange')
    expect(snapshot).not.toContain('inspector-danger')
  }
})

test('shared inspector controls use 32px height, 8px radius, and custom native replacements', async ({ page }) => {
  const expectControlBox = async (control: import('@playwright/test').Locator) => {
    await expect(control).toHaveCSS('height', '32px')
    await expect(control).toHaveCSS('border-radius', '8px')
  }

  await openFreeform(page)

  const pageSection = page.getByTestId('inspector-page')
  await expectControlBox(pageSection.locator('.text-input'))
  await expectControlBox(pageSection.locator('.paint-hex'))

  await insertShape(page)

  const geometry = page.getByTestId('inspector-geometry')
  const shapeSegmentGroup = geometry.locator('.seg.stretch')
  const shapeSegment = geometry.getByRole('button', { name: '矩形', exact: true })
  const geometryNumber = geometry.locator('input[type="number"]').first()
  const shapeFill = page.getByTestId('shape-fill-paint')
  const arrangeButton = page.getByTestId('inspector-arrange').getByRole('button', { name: '后移', exact: true })
  const deleteButton = page.getByTestId('inspector-danger').getByRole('button', { name: '删除', exact: true })
  await expectControlBox(shapeSegmentGroup)
  await expectControlBox(shapeSegment)
  await expectControlBox(geometryNumber)
  await expect(geometryNumber).toHaveCSS('appearance', 'textfield')
  await expectControlBox(shapeFill.getByTestId('paint-color-button'))
  await expectControlBox(arrangeButton)
  await expectControlBox(deleteButton)

  await shapeFill.getByTestId('paint-mode-linear-gradient').click()
  const angleNumber = shapeFill.locator('.paint-angle')
  await expectControlBox(angleNumber)

  const gradientStartColor = shapeFill.getByRole('button', { name: '填充 渐变起始色', exact: true })
  await expectControlBox(gradientStartColor)
  await gradientStartColor.click()
  const popover = shapeFill.getByTestId('paint-popover')
  const popoverHex = popover.locator('.paint-popover-hex')
  const channelNumber = popover.locator('.paint-channel-number').first()
  const channelRange = popover.locator('.paint-channel-range').first()
  await expectControlBox(popoverHex)
  await expectControlBox(channelNumber)
  await expect(channelNumber).toHaveCSS('appearance', 'textfield')
  await expect(channelRange).toHaveCSS('appearance', 'none')
  await expect(channelRange).toHaveCSS('height', '8px')
  await expect(channelRange).toHaveCSS('border-radius', '999px')
  await expect(channelRange).toHaveCSS('background-image', /linear-gradient/)
  const css = await readFile('src/styles.css', 'utf8')
  expect(css).toMatch(
    /\.freeform-inspector \.paint-channel-range::-webkit-slider-thumb\s*\{[^}]*background:\s*var\(--text\)/s,
  )
  expect(css).toMatch(
    /\.freeform-inspector \.paint-channel-range::-moz-range-thumb\s*\{[^}]*background:\s*var\(--text\)/s,
  )
  await gradientStartColor.click()

  await expect(page.locator('.freeform-inspector input[type="file"]:visible')).toHaveCount(0)

  await insertText(page)
  await expectControlBox(page.getByTestId('freeform-font-select'))
  await expect(page.locator('.freeform-inspector select:visible')).toHaveCount(0)
})

test('shared inspector controls expose a visible accent focus ring', async ({ page }) => {
  await openFreeform(page)
  const accentColor = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.color = 'var(--accent)'
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })
  const expectAccentFocus = async (control: import('@playwright/test').Locator) => {
    // Establish Chromium's keyboard modality so programmatic focus exercises :focus-visible.
    await page.keyboard.press('Tab')
    await control.focus()
    await expect(control).toHaveCSS('outline-color', accentColor)
    await expect(control).toHaveCSS('outline-style', 'solid')
    await expect(control).toHaveCSS('outline-width', '2px')
    await expect(control).toHaveCSS('outline-offset', '2px')
  }

  const pageSection = page.getByTestId('inspector-page')
  await expectAccentFocus(pageSection.locator('.text-input'))
  await expectAccentFocus(pageSection.locator('.paint-hex'))

  await insertShape(page)
  const geometry = page.getByTestId('inspector-geometry')
  const shapeFill = page.getByTestId('shape-fill-paint')
  await expectAccentFocus(geometry.getByRole('button', { name: '矩形', exact: true }))
  await expectAccentFocus(geometry.locator('input[type="number"]').first())
  await expectAccentFocus(page.getByTestId('inspector-arrange').getByRole('button', { name: '后移', exact: true }))
  await expectAccentFocus(page.getByTestId('inspector-danger').getByRole('button', { name: '删除', exact: true }))

  await shapeFill.getByTestId('paint-mode-linear-gradient').click()
  await expectAccentFocus(shapeFill.locator('.paint-angle'))
  const gradientStartColor = shapeFill.getByRole('button', { name: '填充 渐变起始色', exact: true })
  await expectAccentFocus(gradientStartColor)
  await gradientStartColor.click()
  const popover = shapeFill.getByTestId('paint-popover')
  await expectAccentFocus(popover.locator('.paint-popover-hex'))
  await expectAccentFocus(popover.locator('.paint-channel-number').first())
  await expectAccentFocus(popover.locator('.paint-channel-range').first())
  await expectAccentFocus(popover.locator('.paint-swatch').first())
  await gradientStartColor.click()

  await insertText(page)
  await expectAccentFocus(page.getByTestId('freeform-font-select'))
})

test('inspector danger text remains readable in light and dark themes', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const html = page.locator('html')
  if ((await html.getAttribute('data-theme')) !== 'light') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(html).toHaveAttribute('data-theme', 'light')
  await expect(html).not.toHaveClass(/theme-anim/)

  const danger = page.getByTestId('inspector-danger')
  const title = danger.locator('.inspector-section-title')
  const button = danger.getByRole('button', { name: '删除', exact: true })
  const readContrast = (control: import('@playwright/test').Locator) =>
    control.evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element.closest('.freeform-inspector')!).backgroundColor,
    }))

  const lightTitle = await readContrast(title)
  const lightButton = await readContrast(button)
  expect(contrastRatio(lightTitle.foreground, lightTitle.background)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(lightButton.foreground, lightButton.background)).toBeGreaterThanOrEqual(4.5)

  await page.getByTestId('theme-toggle').click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(html).not.toHaveClass(/theme-anim/)
  const darkTitle = await readContrast(title)
  const darkButton = await readContrast(button)
  expect(contrastRatio(darkTitle.foreground, darkTitle.background)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(darkButton.foreground, darkButton.background)).toBeGreaterThanOrEqual(4.5)
  expect(darkTitle.foreground).not.toBe(lightTitle.foreground)
})

test('global header owns workspace tabs, theme, and account state', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await expect(page.getByTestId('app-header')).toHaveCount(1)
  await expect(page.getByTestId('workspace-tab-markdown')).toHaveAttribute(
    'aria-selected',
    'true',
  )

  await page.getByTestId('theme-toggle').click()
  const theme = await page.locator('html').getAttribute('data-theme')
  expect(theme).toMatch(/^(light|dark)$/)

  await page.getByTestId('workspace-tab-freeform').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme!)

  await page.getByTestId('account-login').click()
  await registerUser(page, `header-${Date.now()}`)

  await expect(page.getByTestId('account-logout')).toBeVisible()
  await page.getByTestId('workspace-tab-markdown').click()
  await expect(page.getByTestId('account-logout')).toBeVisible()
})

test('only the active workspace contextual toolbar is exposed', async ({ page }) => {
  await page.goto('/')

  const markdownToolbar = page.getByTestId('markdown-toolbar')
  await expect(markdownToolbar).toBeVisible()
  await expect(markdownToolbar).toHaveCSS('height', '50px')
  await expect(page.getByTestId('freeform-toolbar')).toBeHidden()
  await expect(page.locator('.workspace-panel:not([hidden]) .toolbar-primary')).toHaveCount(1)
  await expect(markdownToolbar.locator('.bar-btn').first()).toHaveCSS('height', '32px')
  await expect(markdownToolbar.locator('.sel-trigger').first()).toHaveCSS('height', '32px')
  await expect(markdownToolbar.locator('.toolbar-primary')).toHaveCSS('height', '32px')
  const segmentBox = await markdownToolbar.getByRole('tablist', { name: '平台' }).boundingBox()
  expect(segmentBox).toBeTruthy()
  expect(segmentBox!.height).toBeLessThanOrEqual(32)

  const accentColor = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.color = 'var(--accent)'
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })
  const focusableControls = [
    markdownToolbar.locator('.seg-btn').first(),
    markdownToolbar.locator('.sel-trigger').first(),
    markdownToolbar.locator('.bar-btn').first(),
    markdownToolbar.locator('.toolbar-primary'),
  ]
  for (const control of focusableControls) {
    await control.focus()
    await expect(control).toHaveCSS('outline-color', accentColor)
    await expect(control).toHaveCSS('outline-style', 'solid')
    await expect(control).toHaveCSS('outline-width', '2px')
  }

  await page.getByTestId('workspace-tab-freeform').click()
  await expect(page.getByTestId('markdown-toolbar')).toBeHidden()
  const freeformToolbar = page.getByTestId('freeform-toolbar')
  await expect(freeformToolbar).toBeVisible()
  await expect(freeformToolbar).toHaveCSS('height', '50px')
  await expect(page.getByTestId('freeform-primary-export')).toBeVisible()
  await expect(page.locator('.workspace-panel:not([hidden]) .toolbar-primary')).toHaveCount(1)
  await expect(page.getByTestId('insert-text')).toHaveCSS('height', '32px')
  await expect(page.getByTestId('insert-shape')).toHaveCSS('height', '32px')
  await expect(freeformToolbar.locator('.toolbar-primary')).toHaveCSS('height', '32px')
})

test('workspace tabs support arrow, Home, and End keyboard navigation', async ({ page }) => {
  await page.goto('/')

  const markdownTab = page.getByTestId('workspace-tab-markdown')
  const freeformTab = page.getByTestId('workspace-tab-freeform')
  const markdownPanel = page.getByRole('tabpanel', { name: 'Markdown 卡片' })
  const freeformPanel = page.getByRole('tabpanel', { name: '自由编辑' })

  await expect(markdownTab).toHaveAttribute('aria-selected', 'true')
  await expect(markdownTab).toHaveAttribute('tabindex', '0')
  await expect(freeformTab).toHaveAttribute('tabindex', '-1')

  await markdownTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(freeformTab).toBeFocused()
  await expect(freeformTab).toHaveAttribute('aria-selected', 'true')
  await expect(freeformTab).toHaveAttribute('tabindex', '0')
  await expect(markdownTab).toHaveAttribute('tabindex', '-1')
  await expect(freeformPanel).toBeVisible()

  await page.keyboard.press('Home')
  await expect(markdownTab).toBeFocused()
  await expect(markdownTab).toHaveAttribute('aria-selected', 'true')
  await expect(markdownPanel).toBeVisible()

  await page.keyboard.press('End')
  await expect(freeformTab).toBeFocused()
  await expect(freeformTab).toHaveAttribute('aria-selected', 'true')
  await expect(freeformPanel).toBeVisible()

  await page.keyboard.press('ArrowRight')
  await expect(markdownTab).toBeFocused()
  await expect(markdownTab).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('ArrowLeft')
  await expect(freeformTab).toBeFocused()
  await expect(freeformTab).toHaveAttribute('aria-selected', 'true')
})

test('workspace tab arrow navigation does not nudge selected freeform elements', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementPosition(page, 240, 180)

  const positionInputs = page.locator('.freeform-inspector .field-grid').first().locator('input')
  const readPosition = async () => ({
    x: Number(await positionInputs.nth(0).inputValue()),
    y: Number(await positionInputs.nth(1).inputValue()),
  })
  const before = await readPosition()

  await page.evaluate(() => {
    document.documentElement.dataset.workspaceTabArrowEvents = '0'
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'ArrowLeft') {
          document.documentElement.dataset.workspaceTabArrowEvents = '1'
        }
      },
      { once: true },
    )
  })

  const freeformTab = page.getByTestId('workspace-tab-freeform')
  await freeformTab.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('workspace-tab-markdown')).toBeFocused()
  await expect(page.locator('html')).toHaveAttribute('data-workspace-tab-arrow-events', '0')

  await freeformTab.click()
  await expect.poll(readPosition).toEqual(before)
})

test('account changes reset workspace draft identity', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const accountSuffix = Date.now()
  await page.getByTestId('workspace-tab-freeform').click()
  await insertText(page)
  await page.getByLabel('文本内容').fill('跨账户草稿内容')

  await page.getByRole('button', { name: '保存草稿' }).click()
  await registerUser(page, `draft-${accountSuffix}-a`)
  await page.getByRole('button', { name: '保存草稿' }).click()

  const slideStatus = page.getByTestId('freeform-slide-meta')
  await expect(slideStatus).toContainText('已保存')
  const userADraftIds = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('slicer.drafts.'))
      .flatMap((key) =>
        (JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ id: string }>).map(
          (draft) => draft.id,
        ),
      ),
  )
  expect(userADraftIds).toHaveLength(1)

  await page.getByTestId('account-logout').click()
  await expect(slideStatus).not.toContainText('已保存')
  await expect(page.getByTestId('freeform-element')).toHaveCount(1)
  await expect(page.getByLabel('文本内容')).toContainText('跨账户草稿内容')

  await page.getByTestId('account-login').click()
  await registerUser(page, `draft-${accountSuffix}-b`)
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(slideStatus).toContainText('已保存')

  const draftStores = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('slicer.drafts.'))
      .map((key) => ({
        key,
        ids: (JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ id: string }>).map(
          (draft) => draft.id,
        ),
      })),
  )
  expect(draftStores).toHaveLength(2)
  expect(draftStores.every((store) => store.ids.length === 1)).toBe(true)
  const allDraftIds = draftStores.flatMap((store) => store.ids)
  expect(allDraftIds).toContain(userADraftIds[0])
  expect(new Set(allDraftIds).size).toBe(allDraftIds.length)
})

test('switches to the freeform workspace and edits a slide', async ({ page }) => {
  await openFreeform(page)

  await expect(page.getByTestId('freeform-slide-meta')).toContainText('1页')
  await expect(page.getByTestId('freeform-slide-size')).toContainText('1080×1440px')
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()

  await page.getByTestId('page-size-trigger').click()
  await page.getByRole('button', { name: '16:9', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('1页')
  await expect(page.getByTestId('freeform-slide-size')).toContainText('1920×1080px')

  await insertText(page)
  await expect(page.getByLabel('文本内容')).toBeVisible()

  await insertShape(page)
  await expect(page.getByTestId('freeform-shape')).toBeVisible()
})

test('inserts shapes and lines through accessible toolbar menus', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  const shapeTrigger = page.getByTestId('insert-shape')
  await expect(shapeTrigger).toHaveAttribute('aria-haspopup', 'menu')
  await expect(shapeTrigger).not.toHaveClass(/bar-btn/)
  await shapeTrigger.click()
  await expect(shapeTrigger).toHaveAttribute('aria-expanded', 'true')
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  await expect(shapeMenu).toBeVisible()
  await shapeMenu.getByRole('menuitem', { name: '矩形' }).click()
  await expect(shapeTrigger).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('freeform-shape')).toHaveCount(1)

  const lineTrigger = page.getByTestId('insert-line')
  await lineTrigger.click()
  const lineMenu = page.getByRole('menu', { name: '线条' })
  await expect(lineMenu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(lineMenu).toBeHidden()
  await expect(lineTrigger).toHaveAttribute('aria-expanded', 'false')
  await expect(lineTrigger).toBeFocused()
})

test('keeps dark insert menu triggers in the accent expanded state', async ({ page }) => {
  await openFreeform(page)
  if ((await page.locator('html').getAttribute('data-theme')) !== 'dark') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const expandedColors = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.borderColor = 'var(--accent)'
    probe.style.backgroundColor = 'var(--accent-weak)'
    document.body.append(probe)
    const style = getComputedStyle(probe)
    const colors = {
      border: style.borderColor,
      background: style.backgroundColor,
    }
    probe.remove()
    return colors
  })

  const shapeTrigger = page.getByTestId('insert-shape')
  await shapeTrigger.click()
  await expect(shapeTrigger).toHaveCSS('border-color', expandedColors.border)
  await expect(shapeTrigger).toHaveCSS('background-color', expandedColors.background)
})

test('switches insert menus without returning focus to the previous trigger', async ({ page }) => {
  await openFreeform(page)

  const shapeTrigger = page.getByTestId('insert-shape')
  const lineTrigger = page.getByTestId('insert-line')
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  const lineMenu = page.getByRole('menu', { name: '线条' })

  await shapeTrigger.click()
  await expect(shapeMenu.getByRole('menuitem', { name: '矩形' })).toBeFocused()
  await lineTrigger.click()
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )

  await expect(shapeMenu).toBeHidden()
  await expect(lineMenu).toBeVisible()
  await expect(lineMenu.getByRole('menuitem', { name: '直线' })).toBeFocused()
})

test('hands focus from the page size popover to an insert menu', async ({ page }) => {
  await openFreeform(page)

  const undo = page.getByRole('button', { name: '撤销' })
  const pageSizeTrigger = page.getByTestId('page-size-trigger')
  const pageSizePopover = page.getByTestId('page-size-popover')
  const shapeTrigger = page.getByTestId('insert-shape')
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  const rectangle = shapeMenu.getByRole('menuitem', { name: '矩形' })

  await expect(undo).toBeDisabled()
  await pageSizeTrigger.click()
  await expect(pageSizePopover).toBeVisible()
  await shapeTrigger.click()
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )

  await expect(pageSizePopover).toBeHidden()
  await expect(shapeMenu).toBeVisible()
  await expect(rectangle).toBeFocused()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()
})

test('hands focus from an insert menu to the page size popover', async ({ page }) => {
  await openFreeform(page)

  const undo = page.getByRole('button', { name: '撤销' })
  const pageSizeTrigger = page.getByTestId('page-size-trigger')
  const pageSizePopover = page.getByTestId('page-size-popover')
  const selectedPreset = pageSizePopover.getByRole('button', { name: '3:4', exact: true })
  const shapeTrigger = page.getByTestId('insert-shape')
  const shapeMenu = page.getByRole('menu', { name: '形状' })

  await expect(undo).toBeDisabled()
  await shapeTrigger.click()
  await expect(shapeMenu).toBeVisible()
  await pageSizeTrigger.click()
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )

  await expect(shapeMenu).toBeHidden()
  await expect(pageSizePopover).toBeVisible()
  await expect(selectedPreset).toBeFocused()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()
})

test('closes an insert menu when tabbing to another toolbar trigger', async ({ page }) => {
  await openFreeform(page)

  const shapeTrigger = page.getByTestId('insert-shape')
  const lineTrigger = page.getByTestId('insert-line')
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  const lineMenu = page.getByRole('menu', { name: '线条' })

  await shapeTrigger.click()
  await expect(shapeMenu.getByRole('menuitem', { name: '矩形' })).toBeFocused()
  await page.keyboard.press('Tab')

  await expect(lineTrigger).toBeFocused()
  await expect(shapeMenu).toBeHidden()
  await page.keyboard.press('Enter')
  await expect(lineMenu).toBeVisible()
  await expect(page.getByRole('menu')).toHaveCount(1)
})

test('closes the page size popover before keyboard-opening an insert menu', async ({ page }) => {
  await openFreeform(page)

  const pageSizeTrigger = page.getByTestId('page-size-trigger')
  const pageSizePopover = page.getByTestId('page-size-popover')
  const shapeTrigger = page.getByTestId('insert-shape')
  const shapeMenu = page.getByRole('menu', { name: '形状' })

  await pageSizeTrigger.click()
  await expect(pageSizePopover).toBeVisible()

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await shapeTrigger.evaluate((element) => element === document.activeElement)) break
    await page.keyboard.press('Tab')
  }

  await expect(shapeTrigger).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(pageSizePopover).toBeHidden()
  await expect(shapeMenu).toBeVisible()
  await expect(shapeMenu.getByRole('menuitem', { name: '矩形' })).toBeFocused()
  await expect(page.getByRole('menu')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(shapeMenu).toBeHidden()
  await expect(shapeTrigger).toBeFocused()
})

test('keeps the page size popover open when clicking non-focusable content inside it', async ({ page }) => {
  await openFreeform(page)

  const pageSizePopover = page.getByTestId('page-size-popover')
  await page.getByTestId('page-size-trigger').click()
  await expect(pageSizePopover).toBeVisible()
  await expect(pageSizePopover.getByRole('button', { name: '3:4', exact: true })).toBeFocused()

  await pageSizePopover.locator('.page-size-popover-heading').click()

  await expect(pageSizePopover).toBeVisible()
})

test('supports cyclic keyboard selection in insert menus', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  const shapeTrigger = page.getByTestId('insert-shape')
  await shapeTrigger.click()
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  const rectangle = shapeMenu.getByRole('menuitem', { name: '矩形' })
  const ellipse = shapeMenu.getByRole('menuitem', { name: '圆形' })
  const triangle = shapeMenu.getByRole('menuitem', { name: '三角形' })

  await expect(rectangle).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(triangle).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rectangle).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(ellipse).toBeFocused()
  await page.keyboard.press('Space')

  await expect(shapeMenu).toBeHidden()
  await expect(page.getByTestId('freeform-shape')).toHaveCount(1)
  await expect(shapeTrigger).toBeFocused()

  await shapeTrigger.click()
  await expect(rectangle).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(shapeMenu).toBeHidden()
  await expect(page.getByTestId('freeform-shape')).toHaveCount(2)
  await expect(shapeTrigger).toBeFocused()
})

test('closes insert menus without recording history', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  const undo = page.getByRole('button', { name: '撤销' })
  const shapeTrigger = page.getByTestId('insert-shape')
  const lineTrigger = page.getByTestId('insert-line')
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  const lineMenu = page.getByRole('menu', { name: '线条' })

  await expect(undo).toBeDisabled()
  await shapeTrigger.click()
  await page.keyboard.press('Escape')
  await expect(shapeMenu).toBeHidden()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()

  await lineTrigger.click()
  await page.getByTestId('freeform-canvas').click({ position: { x: 8, y: 8 } })
  await expect(lineMenu).toBeHidden()
  await expect(lineTrigger).toBeFocused()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()

  await shapeTrigger.click()
  await expect(shapeMenu).toBeVisible()
  const markdownTab = page.getByTestId('workspace-tab-markdown')
  await markdownTab.click()
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
  await expect(markdownTab).toBeFocused()
  await page.getByTestId('workspace-tab-freeform').click()
  await expect(shapeMenu).toBeHidden()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()
})

test('freeform inspector exposes styled paint controls instead of visible native color inputs', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  await expect(page.getByTestId('freeform-paint-field').first()).toBeVisible()
  await expect(page.locator('.freeform-inspector input[type="color"]:visible')).toHaveCount(0)
  await expect(page.getByTestId('paint-color-button').first()).toBeVisible()
})

test('opens a custom color popover beside the inspector instead of the browser color picker', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  const inspector = page.locator('.freeform-inspector')
  await page.getByTestId('page-background-paint').getByTestId('paint-color-button').click()

  const popover = page.getByTestId('paint-popover')
  await expect(popover).toBeVisible()
  await expect(page.getByTestId('page-background-paint').locator('input[type="color"]')).toHaveCount(0)

  const inspectorBox = await inspector.boundingBox()
  const popoverBox = await popover.boundingBox()
  expect(inspectorBox).toBeTruthy()
  expect(popoverBox).toBeTruthy()
  expect(popoverBox!.x).toBeGreaterThanOrEqual(inspectorBox!.x)
  expect(popoverBox!.x + popoverBox!.width).toBeLessThanOrEqual(inspectorBox!.x + inspectorBox!.width)
})

test('uses styled range sliders in the freeform paint controls', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  const range = page.getByTestId('paint-gradient-angle').first()

  await expect(range).toHaveCSS('appearance', 'none')
  await expect(range).toHaveCSS('background-image', /linear-gradient/)
})

test('uses styled scrollbars in the freeform workspace', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  for (const selector of ['.freeform-stage-scroll', '.freeform-rail', '.freeform-inspector']) {
    const scroller = page.locator(selector)
    await expect(scroller).toHaveCSS('scrollbar-width', 'thin')
    await expect(scroller).not.toHaveCSS('scrollbar-color', 'auto')
  }
})

test('uses custom color popovers for shape and line stroke colors', async ({ page }) => {
  await openFreeform(page)
  const inspector = page.locator('.freeform-inspector')
  const expectPopoverInsideInspector = async () => {
    const inspectorBox = await inspector.boundingBox()
    const popoverBox = await page.getByTestId('paint-popover').boundingBox()
    expect(inspectorBox).toBeTruthy()
    expect(popoverBox).toBeTruthy()
    expect(popoverBox!.x).toBeGreaterThanOrEqual(inspectorBox!.x)
    expect(popoverBox!.x + popoverBox!.width).toBeLessThanOrEqual(
      inspectorBox!.x + inspectorBox!.width,
    )
  }

  await insertShape(page)
  await expect(page.locator('.freeform-inspector input[type="color"]:visible')).toHaveCount(0)
  await page.getByTestId('shape-stroke-color').getByTestId('paint-color-button').click()
  await expect(page.getByTestId('paint-popover')).toBeVisible()
  await expectPopoverInsideInspector()
  await page.keyboard.press('Escape')

  await insertLine(page, '直线')
  await expect(page.locator('.freeform-inspector input[type="color"]:visible')).toHaveCount(0)
  await page.getByTestId('line-stroke-color').getByTestId('paint-color-button').click()
  await expect(page.getByTestId('paint-popover')).toBeVisible()
  await expectPopoverInsideInspector()
})

test('changes a selected text element font family', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  await page.getByTestId('freeform-element').first().click()
  await page.getByTestId('freeform-font-select').click()
  await page.locator('[role="option"]').nth(2).click()

  await expect(page.getByTestId('freeform-textbox').first()).toHaveCSS('font-family', /Noto Serif|serif/i)
})

test('warms the selected web font before export is clicked', async ({ page }) => {
  const fontFetches: string[] = []
  const stylesheetRefetches: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'fetch' && request.url().includes('fonts.gstatic.com')) {
      fontFetches.push(request.url())
    }
    if (request.resourceType() === 'fetch' && request.url().includes('fonts.googleapis.com')) {
      stylesheetRefetches.push(request.url())
    }
  })

  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  await insertText(page)
  await page.getByTestId('freeform-element').first().click()
  await page.getByTestId('freeform-font-select').click()
  await page.locator('[role="option"]').nth(2).click()

  await expect.poll(() => fontFetches.length, { timeout: 5_000 }).toBeGreaterThan(0)
  expect(stylesheetRefetches).toHaveLength(0)
})

test('applies page, shape, and text gradients from the inspector', async ({ page }) => {
  await openFreeform(page)

  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(page.getByTestId('freeform-canvas')).toHaveCSS('background-image', /linear-gradient/)

  await insertShape(page)
  await page.getByTestId('freeform-element').last().click()
  await page.getByTestId('shape-fill-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(page.getByTestId('freeform-shape').last()).toHaveCSS('background-image', /linear-gradient/)

  await insertText(page)
  await page.getByTestId('freeform-element').last().click()
  await page.getByTestId('text-fill-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(page.getByTestId('freeform-textbox').last()).toHaveCSS('background-image', /linear-gradient/)
})

test('edits Chinese text in the freeform contenteditable textbox without losing text', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const textbox = page.getByTestId('freeform-textbox').last()
  await expect(textbox).toHaveAttribute('contenteditable', 'true')
  await textbox.fill('中文渐变测试')

  await expect(textbox).toContainText('中文渐变测试')
})

test('pastes plain text into the freeform contenteditable textbox', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const textbox = page.getByTestId('freeform-textbox').last()
  await textbox.evaluate((node) => {
    const data = new DataTransfer()
    data.setData('text/html', '<b>bold</b>')
    data.setData('text/plain', 'plain text')
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })

  await expect(textbox).toContainText('plain text')
  await expect(textbox.locator('b')).toHaveCount(0)
})

test('compact saved freeform toolbar keeps controls from overlapping', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()

  await page.getByRole('button', { name: '保存草稿' }).click()
  await registerUser(page, `c${Date.now().toString(36).slice(-6)}`)
  await page.getByRole('button', { name: '保存草稿' }).click()

  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')
  await expect(page.getByRole('button', { name: /^草稿(?: · \d+)?$/ })).toHaveText('草稿 · 1')
  await expect(page.getByTestId('freeform-primary-export')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '草稿 · 1', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '打包导出', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '导出当前页', exact: true })).toBeVisible()
  await expectVisibleFreeformToolbarButtonsToFit(page)
})

function extractCssSelectors(css: string) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors: string[] = []
  let prelude = ''
  let quote: '"' | "'" | null = null

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const previous = source[index - 1]
    if (quote) {
      prelude += character
      if (character === quote && previous !== '\\') quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      prelude += character
      continue
    }
    if (character === '{') {
      const trimmed = prelude.trim()
      if (trimmed && !trimmed.startsWith('@')) {
        selectors.push(...trimmed.split(',').map((selector) => selector.trim()))
      }
      prelude = ''
      continue
    }
    if (character === '}') {
      prelude = ''
      continue
    }
    prelude += character
  }

  return selectors
}

function findUnscopedWorkspaceChromeSelectors(css: string) {
  return extractCssSelectors(css)
    .filter(
      (selector) =>
        selector.includes('.page-size-') || selector.includes('.freeform-insert-'),
    )
    .filter((selector) => {
      const withoutThemePrefix = selector.replace(/^\[data-theme=['"]dark['"]\]\s+/, '')
      return !/^(?:\.workspace-toolbar|\.freeform-toolbar)(?:\s|$)/.test(withoutThemePrefix)
    })
}

test('workspace chrome selectors stay scoped to workspace toolbar', async () => {
  expect(findUnscopedWorkspaceChromeSelectors(`
    @media (max-width: 1100px) {
      .page-size-trigger { color: red; }
      .freeform-insert-trigger { color: red; }
    }
    .page-size-trigger .workspace-toolbar { color: red; }
    .freeform-insert-menu .freeform-toolbar { color: red; }
    .workspace-toolbar .page-size-trigger { content: ".page-size-declaration"; }
    .freeform-toolbar .freeform-insert-trigger { content: ".freeform-insert-declaration"; }
  `)).toEqual([
    '.page-size-trigger',
    '.freeform-insert-trigger',
    '.page-size-trigger .workspace-toolbar',
    '.freeform-insert-menu .freeform-toolbar',
  ])

  const css = await readFile('src/styles.css', 'utf8')
  const unscoped = findUnscopedWorkspaceChromeSelectors(css)

  expect(unscoped, `裸 workspace chrome 选择器：${unscoped.join(' | ')}`).toEqual([])
})

test('edits preset and custom page sizes from the toolbar popover', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await page.goto('/')
  if ((await page.locator('html').getAttribute('data-theme')) !== 'light') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByTestId('workspace-tab-freeform').click()

  const trigger = page.getByTestId('page-size-trigger')
  const popover = page.getByTestId('page-size-popover')
  const slideSize = page.getByTestId('freeform-slide-size')
  const widthInput = page.getByLabel('宽度 px')
  const heightInput = page.getByLabel('高度 px')
  const applyButton = page.getByRole('button', { name: '应用尺寸' })
  const readAccentColor = () =>
    page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.color = 'var(--accent)'
      document.body.append(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    })

  await trigger.click()
  await expect(popover).toBeVisible()
  await expect(trigger).toHaveCSS('border-color', await readAccentColor())
  await expect(popover.getByRole('button', { name: '3:4', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(trigger).toBeFocused()

  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await insertShape(page)
  const selectedElement = page.getByTestId('freeform-element').last()
  await expect(selectedElement).toHaveAttribute('data-selected', 'true')

  await trigger.click()
  await expect(popover).toBeVisible()
  await expect(trigger).toHaveCSS('border-color', await readAccentColor())
  await expect(trigger).toContainText('3:4 · 1080×1440px')

  await popover.getByRole('button', { name: '9:16', exact: true }).click()
  await expect(slideSize).toContainText('1080×1920px')
  await expect(popover).toBeHidden()

  await trigger.click()
  await expect(widthInput).toHaveValue('1080')
  await expect(heightInput).toHaveValue('1920')

  await widthInput.fill('100')
  await heightInput.fill('200')
  await applyButton.click()
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('alert')).toContainText('128')
  await expect(slideSize).toContainText('1080×1920px')

  await widthInput.fill('128.5')
  await applyButton.click()
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('alert')).toContainText('128')
  await expect(slideSize).toContainText('1080×1920px')

  await widthInput.fill('4097')
  await applyButton.click()
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('alert')).toContainText('128')
  await expect(slideSize).toContainText('1080×1920px')

  await widthInput.fill('')
  await applyButton.click()
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('alert')).toContainText('128')
  await expect(slideSize).toContainText('1080×1920px')

  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(selectedElement).toHaveAttribute('data-selected', 'true')

  await trigger.click()
  const markdownTab = page.getByTestId('workspace-tab-markdown')
  await markdownTab.click()
  await expect(popover).toBeHidden()
  await expect(markdownTab).toBeFocused()

  await page.getByTestId('workspace-tab-freeform').click()
  await expect(popover).toBeHidden()
  await trigger.click()
  await expect(popover).toBeVisible()
  await widthInput.fill('1200')
  await heightInput.fill('1600')
  await page.locator('.freeform-stage-head').click()
  await expect(popover).toBeHidden()
  await expect(slideSize).toContainText('1080×1920px')
  await expect(trigger).toBeFocused()

  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(slideSize).toContainText('3:4 · 1080×1440px')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(slideSize).toContainText('9:16 · 1080×1920px')
})

test('sets custom page size and new pages inherit it', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  const trigger = page.getByTestId('page-size-trigger')
  await trigger.click()
  await page.getByRole('button', { name: '9:16', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/1080×1920px/)

  await trigger.click()
  await page.getByLabel('宽度 px').fill('1200')
  await page.getByLabel('高度 px').fill('1600')
  await page.getByRole('button', { name: '应用尺寸' }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/自定义 · 1200×1600px/)

  await page.getByRole('button', { name: '新增页面' }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('2页')
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/1200×1600px/)
})

test('fills a shape with an image', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '插入图片填充' }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles('public/favicon.svg')

  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
})

test('exports the current slide as a PNG at slide dimensions', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByTestId('page-size-trigger').click()
  await page.getByRole('button', { name: '9:16', exact: true }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前页' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe('slide-01.png')
  const path = await download.path()
  expect(path).toBeTruthy()
  const size = readPngSize(await readFile(path!))
  expect(size).toEqual({ width: 1080, height: 1920 })
  await expect(page.getByRole('button', { name: '导出当前页' })).toBeEnabled()
})

test('exports current freeform slide with gradient pixels and without editor ui', async ({ page }) => {
  await openFreeform(page)

  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await expect(page.getByTestId('freeform-element')).toHaveAttribute('data-selected', 'true')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前页' }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()

  const size = readPngSize(await readFile(path!))
  expect(size).toEqual({ width: 1080, height: 1440 })

  const topLeft = await samplePngPixel(page, path!, 10, 10)
  const bottomRight = await samplePngPixel(page, path!, 1000, 1300)
  expect(topLeft.slice(0, 3)).not.toEqual(bottomRight.slice(0, 3))

  const accentRgb = await page.evaluate(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    const match = accent.match(/^#([0-9a-f]{6})$/i)
    if (!match) throw new Error(`unexpected accent color: ${accent}`)
    return [
      Number.parseInt(match[1].slice(0, 2), 16),
      Number.parseInt(match[1].slice(2, 4), 16),
      Number.parseInt(match[1].slice(4, 6), 16),
    ]
  })
  const resizeHandleProbe = await samplePngPixel(page, path!, 203, 203)
  expect(rgbDistance(resizeHandleProbe, accentRgb)).toBeGreaterThan(30)
})

test('saves and restores a freeform draft', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()
  await insertText(page)
  await page.getByLabel('文本内容').fill('保存恢复测试')

  await page.getByRole('button', { name: '保存草稿' }).click()
  await registerUser(page, `freeform-${Date.now()}`)
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toHaveText(/已保存/)

  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByRole('button', { name: /^草稿(?: · \d+)?$/ }).click()
  await page.locator('.draft-item', { hasText: 'Page 1' }).click()
  await expect(page.getByLabel('文本内容')).toContainText('保存恢复测试')
})

test('exports mixed-size slides as a zip after warning', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  const trigger = page.getByTestId('page-size-trigger')
  await trigger.click()
  await page.getByRole('button', { name: '9:16', exact: true }).click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await trigger.click()
  await page.getByRole('button', { name: '16:9', exact: true }).click()

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

test('shows progress while exporting multiple freeform slides', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await page.getByRole('button', { name: '新增页面' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '打包导出' }).click()
  await expect(page.getByRole('button', { name: /导出 \d+\/4/ })).toBeVisible()
  await downloadPromise
})

test('copies, pastes, and deletes the selected element', async ({ page }) => {
  await openFreeform(page)
  await insertText(page)

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

test('hidden freeform workspace does not handle Delete', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(1)
  await elements.first().click()
  await page.getByTestId('workspace-tab-markdown').click()
  await page.keyboard.press('Delete')
  await page.getByTestId('workspace-tab-freeform').click()
  await expect(elements).toHaveCount(1)
})

test('hidden freeform workspace does not handle undo', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(1)
  await page.getByTestId('workspace-tab-markdown').click()
  await page.keyboard.press('Control+z')
  await page.getByTestId('workspace-tab-freeform').click()
  await expect(elements).toHaveCount(1)
})

test('moves the selected element through layer order', async ({ page }) => {
  await openFreeform(page)
  await insertText(page)
  await insertShape(page)

  await expect(page.locator('.freeform-element')).toHaveCount(2)
  await expect.poll(() => freeformElementKinds(page)).toEqual(['text', 'shape'])

  await page.getByRole('button', { name: '置底' }).click()
  await expect.poll(() => freeformElementKinds(page)).toEqual(['shape', 'text'])

  await page.getByRole('button', { name: '置顶' }).click()

  await expect.poll(() => freeformElementKinds(page)).toEqual(['text', 'shape'])
})

test('inserts line and arrow elements', async ({ page }) => {
  await openFreeform(page)

  await insertLine(page, '直线')
  await expect(page.getByTestId('freeform-line')).toBeVisible()

  await insertLine(page, '箭头')
  await expect(page.getByTestId('freeform-arrow')).toBeVisible()
})

test('multi-selects elements and aligns them left', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  await setSelectedElementPosition(page, 100, 120)
  await insertShape(page)
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

test('drags selected elements together', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 320, 120, 100, 100)

  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(2)
  await elements.first().click({ modifiers: ['Shift'] })
  await expect(selectedFreeformElements(page)).toHaveCount(2)

  const firstElementBox = await elements.first().boundingBox()
  expect(firstElementBox).toBeTruthy()
  const start = {
    x: firstElementBox!.x + firstElementBox!.width / 2,
    y: firstElementBox!.y + firstElementBox!.height / 2,
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 50, start.y + 20)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 200, y: 140 },
    { x: 420, y: 160 },
  ])

  await page.keyboard.press('ControlOrMeta+Z')
  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 100 },
    { x: 320, y: 120 },
  ])
})

test('snapping aligns a dragged element to the page center and hides guides after release', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const element = page.getByTestId('freeform-element').first()
  const box = await element.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 192, start.y)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(1)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([{ x: 490, y: 100 }])
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
})

test('snapping aligns a dragged element to another element left edge', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 700, 120, 140, 100)

  const first = page.getByTestId('freeform-element').first()
  const box = await first.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 297, start.y)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 700, y: 100 },
    { x: 700, y: 120 },
  ])
})

test('snapping aligns a selected group by its bounding box', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  const first = page.getByTestId('freeform-element').first()
  const box = await first.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 137, start.y)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 380, y: 100 },
    { x: 600, y: 120 },
  ])
})

test('snapping hides guides when pointer drag is canceled', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const element = page.getByTestId('freeform-element').first()
  const box = await element.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 192, start.y)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(1)

  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel')))
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
  await page.mouse.up()
})

test('snapping does not apply to keyboard nudges', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 485, 100, 100, 100)
  await page.getByTestId('freeform-element').first().click()
  await page.keyboard.press('ArrowRight')

  await expect.poll(() => freeformElementPositions(page)).toEqual([{ x: 486, y: 100 }])
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
})

test('keyboard nudges all selected elements by arrow key', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  await page.keyboard.press('ArrowRight')

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 101, y: 100 },
    { x: 321, y: 120 },
  ])
})

test('keyboard nudges all selected elements by 10 px with shift arrow', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  await page.keyboard.press('Shift+ArrowDown')

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 110 },
    { x: 320, y: 130 },
  ])
})

test('keyboard shortcuts work after shift-selecting from an inspector input', async ({ page }) => {
  const elements = await insertTwoRectanglesLeavingInspectorFocused(page)

  await elements.first().click({ modifiers: ['Shift'] })
  await expect(selectedFreeformElements(page)).toHaveCount(2)
  await page.keyboard.press('ArrowRight')

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 101, y: 100 },
    { x: 321, y: 120 },
  ])
})

test('batch copies two selected elements and keeps pasted elements selected', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  await page.keyboard.press('ControlOrMeta+C')
  await page.keyboard.press('ControlOrMeta+V')

  await expect(page.getByTestId('freeform-element')).toHaveCount(4)
  await expect(selectedFreeformElements(page)).toHaveCount(2)
  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 100 },
    { x: 320, y: 120 },
    { x: 116, y: 116 },
    { x: 336, y: 136 },
  ])
})

test('batch deletes all selected elements', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  await page.keyboard.press('Delete')

  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
})

test('keyboard shortcuts work after marquee from an inspector input', async ({ page }) => {
  await insertTwoRectanglesLeavingInspectorFocused(page)

  const canvas = page.getByTestId('freeform-canvas')
  const box = await canvas.boundingBox()
  expect(box).toBeTruthy()
  const scale = 0.5
  const start = { x: box!.x + 70 * scale, y: box!.y + 70 * scale }
  const end = { x: box!.x + 500 * scale, y: box!.y + 290 * scale }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y)
  await page.mouse.up()

  await expect(selectedFreeformElements(page)).toHaveCount(2)
  await page.keyboard.press('ArrowRight')

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 101, y: 100 },
    { x: 321, y: 120 },
  ])
})

test('marquee selects elements by dragging empty canvas', async ({ page }) => {
  await openFreeform(page)
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 120, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 320, 140, 120, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 760, 140, 120, 100)

  const canvas = page.getByTestId('freeform-canvas')
  const box = await canvas.boundingBox()
  expect(box).toBeTruthy()
  const scale = 0.5
  const start = { x: box!.x + 70 * scale, y: box!.y + 70 * scale }
  const end = { x: box!.x + 500 * scale, y: box!.y + 290 * scale }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y)
  await page.mouse.up()

  await expect(selectedFreeformElements(page)).toHaveCount(2)

  await page.getByRole('button', { name: '左对齐' }).click()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 100 },
    { x: 100, y: 140 },
    { x: 760, y: 140 },
  ])
})

test('distributes selected elements horizontally', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 160, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 400, 160, 100, 100)
  await insertShape(page)
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
