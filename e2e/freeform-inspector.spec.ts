// The inspector's property sections: what shows for which selection, in contract
// order, and the styled controls that edit them.

import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import {
  contrastRatio,
  freeformElementBoxes,
  freeformElementPositions,
  insertLine,
  insertShape,
  insertText,
  nestedPropertyMatrixDraft,
  openFreeform,
  openNestedV3Draft,
  selectedFreeformElements,
  setSelectedElementPosition,
  signUpToSave,
  startWithSettingsPanelOpen,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test('inspector hierarchy shows only context-relevant sections in contract order', async ({ page }) => {
  const inspector = page.locator('.freeform-properties-tabpanel')
  const sectionIds = () =>
    inspector.locator(':scope > [data-testid^="inspector-"]').evaluateAll((sections) =>
      sections.map((section) => section.getAttribute('data-testid')),
    )
  const expectSections = async (expected: string[]) => {
    await expect.poll(sectionIds).toEqual(expected.map((name) => `inspector-${name}`))
  }

  await openFreeform(page)

  await expect(page.getByTestId('inspector-page')).toBeVisible()
  // Nothing selected: the page settings, and no explanatory copy.
  await expect(inspector.locator('.inspector-empty')).toHaveCount(0)
  await expectSections(['page'])
  const pagePaint = page.getByTestId('page-background-paint')
  await expect(pagePaint.getByTestId('paint-mode-solid')).toBeVisible()
  await expect(pagePaint.getByTestId('paint-mode-linear-gradient')).toBeVisible()
  await expect(pagePaint.getByTestId('paint-mode-transparent')).toBeVisible()

  await insertShape(page)
  await setSelectedElementPosition(page, 100, 100)
  await expectSections(['geometry', 'fill', 'stroke', 'appearance', 'arrange', 'danger'])
  const shapeFill = page.getByTestId('inspector-fill').getByTestId('shape-fill-paint')
  await expect(shapeFill.getByTestId('paint-mode-solid')).toBeVisible()
  await expect(shapeFill.getByTestId('paint-mode-linear-gradient')).toBeVisible()
  await expect(shapeFill.getByTestId('paint-mode-image')).toBeVisible()

  await insertText(page)
  await setSelectedElementPosition(page, 420, 180)
  // Text spans only show up once part of the text is selected; 效果 follows the type.
  await expectSections(['geometry', 'typography', 'text-effect', 'fill', 'appearance', 'arrange', 'danger'])
  const textFill = page.getByTestId('text-fill-paint')
  await expect(textFill.getByTestId('paint-mode-solid')).toBeVisible()
  await expect(textFill.getByTestId('paint-mode-linear-gradient')).toBeVisible()
  await expect(textFill.getByTestId('paint-mode-image')).toHaveCount(0)

  await insertLine(page, '直线')
  await setSelectedElementPosition(page, 760, 300)
  await expectSections(['geometry', 'stroke', 'appearance', 'arrange', 'danger'])
  const lineStroke = page.getByTestId('inspector-stroke')
  await expect(
    lineStroke.getByTestId('line-stroke-color').getByTestId('paint-color-button'),
  ).toBeVisible()
  await expect(lineStroke.getByTestId('freeform-paint-field')).toHaveCount(0)
  await expect(lineStroke.getByTestId('paint-mode-linear-gradient')).toHaveCount(0)
  await expect(lineStroke.getByTestId('paint-mode-image')).toHaveCount(0)

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByTestId('freeform-images-tool').click()
  await page.getByTestId('insert-image').click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles('public/favicon.svg')
  await expectSections(['geometry', 'fill', 'image-frame', 'appearance', 'arrange', 'danger'])
  const imageFill = page.getByTestId('inspector-fill')
  await expect(imageFill.getByRole('button', { name: '填满', exact: true })).toBeVisible()
  await expect(imageFill.getByRole('button', { name: '适应', exact: true })).toBeVisible()
  await expect(imageFill.getByTestId('freeform-paint-field')).toHaveCount(0)
  await expect(page.getByTestId('inspector-stroke')).toHaveCount(0)
  // The picture frame section carries its own colour and width fields.
  const imageFrame = page.getByTestId('inspector-image-frame')
  await expect(imageFrame.getByTestId('image-stroke-color')).toBeVisible()
  await expect(imageFrame.getByLabel('描边宽', { exact: true })).toBeVisible()

  await page.getByTestId('freeform-canvas').click({ position: { x: 10, y: 10 } })
  await expect(selectedFreeformElements(page)).toHaveCount(0)
  await expect(page.getByTestId('inspector-page')).toBeVisible()
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

  const inspector = page.locator('.freeform-properties-tabpanel')
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
    /:is\(\.freeform-inspector, \.freeform-drawer\) \.paint-channel-range::-webkit-slider-thumb\s*\{[^}]*background:\s*var\(--text\)/s,
  )
  expect(css).toMatch(
    /:is\(\.freeform-inspector, \.freeform-drawer\) \.paint-channel-range::-moz-range-thumb\s*\{[^}]*background:\s*var\(--text\)/s,
  )
  await gradientStartColor.click()

  await expect(page.locator('.freeform-inspector input[type="file"]:visible')).toHaveCount(0)

  await insertText(page)
  await expectControlBox(page.getByTestId('freeform-font-select'))
  await expect(page.locator('.freeform-inspector select:visible')).toHaveCount(0)
})

test('line stroke color and width controls align in the compact inspector', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await openFreeform(page)
  await insertLine(page, '直线')

  const stroke = page.getByTestId('inspector-stroke')
  const colorControl = stroke.getByTestId('line-stroke-color')
  const colorField = colorControl.locator('.color-field')
  const widthInput = stroke.getByLabel('粗细', { exact: true })
  const [colorBox, widthBox] = await Promise.all([
    colorField.boundingBox(),
    widthInput.boundingBox(),
  ])

  expect(colorBox).toBeTruthy()
  expect(widthBox).toBeTruthy()
  expect(Math.abs(colorBox!.y - widthBox!.y)).toBeLessThanOrEqual(1)
  expect(colorBox!.height).toBe(32)
  expect(widthBox!.height).toBe(32)
  await expect(colorControl.locator('.stroke-color-label')).toHaveText('颜色')
  const colorValue = colorControl.locator('.color-field-value')
  await expect(colorValue).toHaveText(/^#[0-9A-F]{6}$/)
  await expect.poll(() => colorValue.evaluate((element) => (
    element.scrollWidth <= element.clientWidth
  ))).toBe(true)
})

test('shape fill transparent mode renders an outline-only shape and persists', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  const shapeView = page.locator('.freeform-shape')
  await expect(shapeView).toHaveCSS('background-color', 'rgb(254, 215, 170)')

  const shapeFill = page.getByTestId('shape-fill-paint')
  await shapeFill.getByTestId('paint-mode-transparent').click()
  await expect(shapeView).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(shapeView).toHaveCSS('background-image', 'none')
  // The freshly inserted shape still has a 0-width stroke: the outline needs widening by hand.
  await expect(shapeView).toHaveCSS('border-top-width', '0px')

  const strokeSection = page.getByTestId('inspector-stroke')
  const strokeWidthInput = strokeSection.getByLabel('描边宽', { exact: true })
  await strokeWidthInput.fill('6')
  await strokeWidthInput.press('Enter')
  await expect(shapeView).toHaveCSS('border-top-width', '6px')
  await expect(shapeView).toHaveCSS('border-top-color', 'rgb(194, 65, 12)')

  // Solid restores the paint without touching the widened stroke, and undo walks the flip back.
  await shapeFill.getByTestId('paint-mode-solid').click()
  await expect(shapeView).toHaveCSS('background-color', 'rgb(254, 215, 170)')
  await expect(shapeView).toHaveCSS('border-top-width', '6px')
  await shapeFill.getByTestId('paint-mode-transparent').click()
  await expect(shapeView).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(shapeView).toHaveCSS('background-color', 'rgb(254, 215, 170)')
  await shapeFill.getByTestId('paint-mode-transparent').click()

  await signUpToSave(page, `no-fill-${Date.now().toString(36)}`)

  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  const restoredShape = page.locator('.freeform-shape')
  await expect(restoredShape).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(restoredShape).toHaveCSS('border-top-width', '6px')
})

test('shape fill radial gradient edits stops and persists through reload', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  const shapeView = page.locator('.freeform-shape')
  const shapeFill = page.getByTestId('shape-fill-paint')

  await shapeFill.getByTestId('paint-mode-radial-gradient').click()
  await expect(shapeView).toHaveCSS('background-image', /radial-gradient\(/)
  // Radial has no angle: the angle slider stays hidden.
  await expect(shapeFill.getByTestId('paint-gradient-angle')).toHaveCount(0)

  // The same stops editor as linear gradients, emitting radial edits.
  await shapeFill.getByTestId('paint-stops-add').click()
  await expect(shapeFill.getByTestId('paint-stops-list')).toBeVisible()
  await expect(shapeFill.locator('[data-testid$="-offset"]')).toHaveCount(3)
  await expect(shapeView).toHaveCSS('background-image', /radial-gradient\(/)

  // Switching to linear keeps every stop and brings the angle back.
  await shapeFill.getByTestId('paint-mode-linear-gradient').click()
  await expect(shapeView).toHaveCSS('background-image', /linear-gradient\(/)
  await expect(shapeFill.locator('[data-testid$="-offset"]')).toHaveCount(3)
  await expect(shapeFill.getByTestId('paint-gradient-angle')).toBeVisible()

  await shapeFill.getByTestId('paint-mode-radial-gradient').click()
  await expect(shapeView).toHaveCSS('background-image', /radial-gradient\(/)

  await signUpToSave(page, `radial-${Date.now().toString(36)}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await expect(page.locator('.freeform-shape')).toHaveCSS(
    'background-image',
    /radial-gradient\(/,
  )
})

test('line endpoint caps draw start arrows and end dots and persist', async ({ page }) => {
  await openFreeform(page)

  await insertLine(page, '直线')
  const stroke = page.getByTestId('inspector-stroke')
  const svgLine = page.locator('.freeform-line').locator('line')

  // A plain line starts with no endpoint decorations at all.
  expect(await svgLine.getAttribute('marker-start')).toBeNull()
  expect(await svgLine.getAttribute('marker-end')).toBeNull()

  await stroke.getByTestId('line-endpoint-start-arrow').click()
  await expect(svgLine).toHaveAttribute('marker-start', /url\(#.*arrow-start/)
  await stroke.getByTestId('line-endpoint-end-dot').click()
  await expect(svgLine).toHaveAttribute('marker-end', /url\(#.*dot/)

  // The 箭头 lineKind lights up the end control by default; 无 explicitly removes that head.
  await stroke.getByTestId('line-kind-seg').getByRole('button', { name: '箭头', exact: true }).click()
  await expect(svgLine).toHaveAttribute('marker-end', /url\(#.*-(?!arrow-start)\w+\)/)
  await stroke.getByTestId('line-endpoint-end-none').click()
  await expect(svgLine).not.toHaveAttribute('marker-end')

  await stroke.getByTestId('line-endpoint-end-dot').click()
  await expect(svgLine).toHaveAttribute('marker-end', /url\(#.*dot/)

  await signUpToSave(page, `caps-${Date.now().toString(36)}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  const restoredLine = page.locator('.freeform-line').locator('line')
  await expect(restoredLine).toHaveAttribute('marker-start', /url\(#.*arrow-start/)
  await expect(restoredLine).toHaveAttribute('marker-end', /url\(#.*dot/)
})

test('inspector appearance controls style leaves end to end', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  const appearance = page.getByTestId('inspector-appearance')
  const radiusInput = appearance.getByLabel('左上圆角', { exact: true })
  await radiusInput.fill('32')
  await radiusInput.press('Enter')
  const opacityInput = appearance.getByLabel('不透明度 %', { exact: true })
  await opacityInput.fill('60')
  await opacityInput.press('Enter')
  await appearance.getByTestId('shadow-add').click()
  const blurInput = appearance.getByLabel('阴影模糊', { exact: true })
  await blurInput.fill('40')
  await blurInput.press('Enter')

  const shapeElement = page.getByTestId('freeform-element')
  const shapeView = shapeElement.locator('.freeform-shape')
  await expect(shapeElement).toHaveCSS('opacity', '0.6')
  await expect(shapeView).toHaveCSS('border-radius', '32px 16px 16px')
  await expect(shapeView).toHaveCSS('box-shadow', /0px 8px 40px/)

  await appearance.getByTestId('shadow-clear').click()
  await expect(shapeView).toHaveCSS('box-shadow', 'none')
  await expect(appearance.getByTestId('shadow-add')).toBeVisible()

  await insertText(page)
  const textbox = page.getByTestId('freeform-textbox')
  await page.getByTestId('text-italic-toggle').click()
  const lineHeightInput = page.getByLabel('行高', { exact: true })
  await lineHeightInput.fill('2')
  await lineHeightInput.press('Enter')
  const letterSpacingInput = page.getByLabel('字距', { exact: true })
  await letterSpacingInput.fill('4')
  await letterSpacingInput.press('Enter')
  await expect(textbox).toHaveCSS('font-style', 'italic')
  await expect(textbox).toHaveCSS('line-height', '96px')
  await expect(textbox).toHaveCSS('letter-spacing', '4px')

  await page.getByTestId('text-vertical-toggle').click()
  await expect(textbox).toHaveCSS('writing-mode', 'vertical-rl')
  await page.getByTestId('text-vertical-toggle').click()
  await expect(textbox).toHaveCSS('writing-mode', 'horizontal-tb')

  const strokeHexInput = page.getByLabel('描边 hex', { exact: true })
  await strokeHexInput.fill('#f97316')
  const strokeWidthInput = page.getByLabel('描边宽度', { exact: true })
  await strokeWidthInput.fill('3')
  await strokeWidthInput.press('Enter')
  await expect(textbox).toHaveCSS('-webkit-text-stroke-width', '3px')
  await expect(textbox).toHaveCSS('-webkit-text-stroke-color', 'rgb(249, 115, 22)')
  await page.getByTestId('text-stroke-clear').click()
  await expect(textbox).toHaveCSS('-webkit-text-stroke-width', '0px')

  const textFillField = page.getByTestId('text-fill-paint')
  await textFillField.getByTestId('paint-mode-linear-gradient').click()
  await textFillField.getByTestId('paint-stops-add').click()
  await expect(textFillField.getByTestId('paint-stops-list')).toBeVisible()
  const middleStopOffset = textFillField.getByTestId('paint-stop-1-offset')
  await expect(middleStopOffset).toHaveValue('50')
  await middleStopOffset.fill('40')
  await expect(middleStopOffset).toHaveValue('40')
  await expect(textbox).toHaveCSS('background-image', /linear-gradient/)
  await expect(textbox).toHaveCSS('background-image', /40%/)
  await textFillField.getByTestId('paint-stop-1-remove').click()
  await expect(textFillField.locator('[data-testid$="-offset"]')).toHaveCount(2)
  await expect(textFillField.getByTestId('paint-stop-0-offset')).toHaveValue('0')
  await expect(textFillField.getByTestId('paint-stop-1-offset')).toHaveValue('100')
  await expect(textbox).toHaveCSS('background-image', /linear-gradient/)

  await insertShape(page, '三角形')
  await expect(appearance.getByLabel('圆角', { exact: true })).toHaveCount(0)
  await appearance.getByTestId('shadow-add').click()
  const triangleView = page.getByTestId('freeform-element').locator('.freeform-shape.shape-triangle')
  // The clip would cut a shadow drawn on the triangle itself away, so the
  // shadow sits on its holder and follows the clipped outline.
  const triangleShadow = page.getByTestId('freeform-element').locator('.freeform-shape-root')
    .filter({ has: page.locator('.shape-triangle') })
  await expect(triangleShadow).toHaveCSS('filter', /drop-shadow/)
  await expect(triangleView).toHaveCSS('filter', 'none')

  const triangleElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.shape-triangle'),
  })
  await page.getByTestId('freeform-blend-select').click()
  await page.getByRole('option', { name: '滤色' }).click()
  await expect(triangleElement).toHaveCSS('mix-blend-mode', 'screen')
  await appearance.getByTestId('filter-add').click()
  await expect(triangleElement).toHaveCSS('filter', /brightness\(1\.1\)/)
  const filterBlurInput = appearance.getByLabel('滤镜模糊', { exact: true })
  await filterBlurInput.fill('8')
  await filterBlurInput.press('Enter')
  await expect(triangleElement).toHaveCSS('filter', /blur\(8px\)/)
  await appearance.getByTestId('filter-clear').click()
  await expect(triangleElement).toHaveCSS('filter', 'none')

  await insertLine(page, '直线')
  const stroke = page.getByTestId('inspector-stroke')
  const dashInput = stroke.getByLabel('虚线', { exact: true })
  await dashInput.fill('18')
  await dashInput.press('Enter')
  const lineStroke = page.getByTestId('freeform-line').locator('line')
  await expect(lineStroke).toHaveCSS('stroke-dasharray', '18px, 18px')
  await stroke.getByTestId('line-cap-butt').click()
  await expect(lineStroke).toHaveCSS('stroke-linecap', 'butt')
  await stroke.getByTestId('line-dash-clear').click()
  await expect(lineStroke).toHaveCSS('stroke-dasharray', 'none')

  await insertShape(page, '五角星')
  const starView = page.getByTestId('freeform-element').locator('.freeform-shape.shape-star')
  await expect(starView).toBeVisible()
  await expect(starView).toHaveCSS('clip-path', /polygon/)

  await page.getByTestId('freeform-canvas').click({ position: { x: 10, y: 10 } })
  await expect(page.getByTestId('inspector-appearance')).toHaveCount(0)
})

test('filter presets apply looks, fine-tune sliders, and persist through reload', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  const appearance = page.getByTestId('inspector-appearance')
  const presets = appearance.getByTestId('filter-presets')
  // The filter stack renders on the leaf wrapper, not the inner shape div.
  const shapeView = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-shape'),
  })

  // The gallery offers 原图 plus the looks; nothing is on yet.
  await expect(presets.getByTestId('filter-preset-none')).toBeVisible()
  await expect(presets.getByTestId('filter-preset-mono')).toBeVisible()
  await expect(shapeView).toHaveCSS('filter', 'none')

  // One tap applies a whole look (v18 grayscale) and lights the tile up.
  await presets.getByTestId('filter-preset-mono').click()
  await expect(shapeView).toHaveCSS('filter', /grayscale\(1\)/)
  await expect(presets.getByTestId('filter-preset-mono')).toHaveClass(/on/)
  // The sliders show the preset's numbers and fine-tune on top.
  const contrast = appearance.getByLabel('滤镜对比度', { exact: true })
  await contrast.fill('1.5')
  await contrast.press('Enter')
  await expect(shapeView).toHaveCSS('filter', /contrast\(1\.5\)/)
  // The fine-tuned stack no longer matches the preset tile.
  await expect(presets.getByTestId('filter-preset-mono')).not.toHaveClass(/on/)

  // The other v18-only keys reach the CSS stack too.
  await presets.getByTestId('filter-preset-cool').click()
  await expect(shapeView).toHaveCSS('filter', /hue-rotate\(345deg\)/)

  // 原图 clears back to no filter at all.
  await presets.getByTestId('filter-preset-none').click()
  await expect(shapeView).toHaveCSS('filter', 'none')

  // A preset is one undo step: applying one and undoing lands back at 原图.
  await presets.getByTestId('filter-preset-vintage').click()
  await expect(shapeView).toHaveCSS('filter', /sepia\(0\.45\)/)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(shapeView).toHaveCSS('filter', 'none')

  await presets.getByTestId('filter-preset-film').click()
  await expect(shapeView).toHaveCSS('filter', /sepia\(0\.2\)/)
  await signUpToSave(page, `filters-${Date.now().toString(36)}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await expect(page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-shape'),
  })).toHaveCSS('filter', /sepia\(0\.2\)/)
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
  // A number field's box (label and value together) carries the ring for its input.
  const geometryNumber = geometry.locator('input[type="number"]').first()
  await page.keyboard.press('Tab')
  await geometryNumber.focus()
  const geometryField = geometry.locator('label').filter({ has: page.locator('input[type="number"]') }).first()
  await expect(geometryField).toHaveCSS('outline-color', accentColor)
  await expect(geometryField).toHaveCSS('outline-style', 'solid')
  await expect(geometryField).toHaveCSS('outline-width', '2px')
  await expect(geometryField).toHaveCSS('outline-offset', '2px')
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

test('freeform inspector exposes styled paint controls instead of visible native color inputs', async ({ page }) => {
  await page.goto('/#/edit/canvas')

  await expect(page.getByTestId('freeform-paint-field').first()).toBeVisible()
  await expect(page.locator('.freeform-inspector input[type="color"]:visible')).toHaveCount(0)
  await expect(page.getByTestId('paint-color-button').first()).toBeVisible()
})

test('opens a custom color popover beside the inspector instead of the browser color picker', async ({ page }) => {
  await page.goto('/#/edit/canvas')

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
  await page.goto('/#/edit/canvas')

  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  const range = page.getByTestId('paint-gradient-angle').first()

  await expect(range).toHaveCSS('appearance', 'none')
  await expect(range).toHaveCSS('background-image', /linear-gradient/)
})

test('uses styled scrollbars in the freeform workspace', async ({ page }) => {
  await page.goto('/#/edit/canvas')

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

test('scene property coordinates and path updates', async ({ page }) => {
  await openNestedV3Draft(page, `scene-properties-${Date.now()}`)
  const workspace = page.locator('.freeform-workspace')
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scaled root leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const geometry = page.getByTestId('inspector-geometry')
  const x = geometry.getByLabel('X', { exact: true })
  const y = geometry.getByLabel('Y', { exact: true })
  const width = geometry.getByLabel('宽', { exact: true })
  const height = geometry.getByLabel('高', { exact: true })
  await expect(x).toHaveValue('495')
  await expect(y).toHaveValue('380')
  await expect(width).toHaveValue('150')
  await expect(height).toHaveValue('120')

  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  await x.fill('520')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))
  await x.press('Enter')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await x.blur()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(x).toHaveValue('520')
  await expect(y).toHaveValue('380')
  await page.keyboard.press('Control+z')
  await expect(x).toHaveValue('495')

  const historyAfterUndo = await workspace.getAttribute('data-history-depth')
  await width.fill('')
  await width.blur()
  await expect(width).toHaveValue('150')
  await expect(workspace).toHaveAttribute('data-history-depth', historyAfterUndo ?? '')
  await width.fill('0')
  await width.blur()
  await expect(width).toHaveValue('150')
  await expect(workspace).toHaveAttribute('data-history-depth', historyAfterUndo ?? '')
  await x.fill('510')
  await x.press('Escape')
  await expect(x).toHaveValue('495')
  await expect(workspace).toHaveAttribute('data-history-depth', historyAfterUndo ?? '')
  await x.fill('510')
  await page.getByRole('button', { name: '重做', exact: true }).evaluate(
    (button) => (button as HTMLButtonElement).click(),
  )
  await expect(x).toHaveValue('520')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scope text' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await expect(page.getByRole('navigation', { name: '对象路径' })).toContainText('页面')
  await expect(page.getByRole('navigation', { name: '对象路径' })).toContainText('Outer group')
  const textArea = page.getByTestId('inspector-typography').locator('textarea')
  await textArea.fill('Path update survives nesting')
  await expect(page.locator('[data-scene-node-id="scope-text"] [role="textbox"]'))
    .toHaveText('Path update survives nesting')
  const fontSize = page.getByTestId('inspector-typography').getByLabel('字号', { exact: true })
  const textHistory = Number(await workspace.getAttribute('data-history-depth'))
  await fontSize.fill('28')
  await expect(workspace).toHaveAttribute('data-history-depth', String(textHistory))
  await fontSize.press('Enter')
  await expect(workspace).toHaveAttribute('data-history-depth', String(textHistory + 1))
  await expect(fontSize).toHaveValue('28')
})

test('nested scene paths update every leaf style family', async ({ page }) => {
  await openNestedV3Draft(
    page,
    `scene-property-matrix-${Date.now()}`,
    false,
    nestedPropertyMatrixDraft,
  )
  const tree = page.getByRole('tree', { name: '图层树' })

  const selectLayer = async (name: string) => {
    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await tree.getByRole('treeitem', { name, exact: true }).click()
    await page.getByRole('tab', { name: '属性', exact: true }).click()
  }

  await selectLayer('Scope text')
  const textNode = page.locator('[data-scene-node-id="scope-text"]')
  const textBox = textNode.getByTestId('freeform-textbox')
  const fontSelect = page.getByTestId('freeform-font-select')
  await fontSelect.click()
  await page.getByRole('option', { name: '思源宋体', exact: true }).click()
  await expect(fontSelect).toContainText('思源宋体')
  await expect(textBox).toHaveCSS('font-family', /Noto Serif/i)

  const textFill = page.getByTestId('text-fill-paint')
  await textFill.getByLabel('文字颜色 hex', { exact: true }).fill('#3b82f6')
  await expect(textFill.getByLabel('文字颜色 hex', { exact: true })).toHaveValue('#3b82f6')
  await expect(textBox).toHaveCSS('color', 'rgb(59, 130, 246)')

  await selectLayer('Visible leaf')
  const shapeNode = page.locator('[data-scene-node-id="visible-leaf"]')
  const shape = shapeNode.getByTestId('freeform-shape')
  const geometry = page.getByTestId('inspector-geometry')
  await geometry.getByRole('button', { name: '三角形', exact: true }).click()
  await expect(shape).toHaveClass(/shape-triangle/)

  const shapeFill = page.getByTestId('shape-fill-paint')
  await shapeFill.getByLabel('填充 hex', { exact: true }).fill('#8b5cf6')
  await expect(shapeFill.getByLabel('填充 hex', { exact: true })).toHaveValue('#8b5cf6')
  await expect(shape).toHaveCSS('background-color', 'rgb(139, 92, 246)')

  const shapeStroke = page.getByTestId('shape-stroke-color').getByTestId('paint-color-button')
  await shapeStroke.click()
  const shapeStrokePopover = page.getByRole('dialog', { name: '形状描边颜色 色板' })
  await shapeStrokePopover.getByLabel('形状描边颜色 自定义 HEX', { exact: true }).fill('#ef4444')
  await expect(shape).toHaveCSS('border-color', 'rgb(239, 68, 68)')
  await page.keyboard.press('Escape')
  await expect(shapeStroke).toBeFocused()

  const shapeStrokeWidth = page.getByTestId('inspector-stroke').getByLabel('描边宽', { exact: true })
  await shapeStrokeWidth.fill('8')
  await shapeStrokeWidth.press('Enter')
  await expect(shapeStrokeWidth).toHaveValue('8')
  await expect.poll(() => shape.evaluate((node) => getComputedStyle(node).borderWidth)).not.toBe('0px')

  await selectLayer('Matrix image')
  const imageNode = page.locator('[data-scene-node-id="matrix-image"]')
  const imageFill = page.getByTestId('inspector-fill')
  await expect(imageFill.getByRole('button', { name: '填满', exact: true })).toHaveClass(/\bon\b/)
  await imageFill.getByRole('button', { name: '适应', exact: true }).click()
  await expect(imageFill.getByRole('button', { name: '适应', exact: true })).toHaveClass(/\bon\b/)
  await expect(imageNode.locator('.freeform-image')).toHaveCSS('object-fit', 'contain')

  await selectLayer('Matrix line')
  const lineNode = page.locator('[data-scene-node-id="matrix-line"]')
  const lineStroke = page.getByTestId('inspector-stroke')
  await lineStroke.getByTestId('line-kind-seg').getByRole('button', { name: '箭头', exact: true }).click()
  await expect(lineNode.getByTestId('freeform-arrow')).toHaveCount(1)

  const lineStrokeButton = lineStroke.getByTestId('line-stroke-color').getByTestId('paint-color-button')
  await lineStrokeButton.click()
  const lineStrokePopover = page.getByRole('dialog', { name: '线条颜色 色板' })
  await lineStrokePopover.getByLabel('线条颜色 自定义 HEX', { exact: true }).fill('#14b8a6')
  await expect(lineNode.locator('line')).toHaveAttribute('stroke', '#14b8a6')
  await page.keyboard.press('Escape')
  await expect(lineStrokeButton).toBeFocused()

  const lineStrokeWidth = lineStroke.getByLabel('粗细', { exact: true })
  await lineStrokeWidth.fill('10')
  await lineStrokeWidth.press('Enter')
  await expect(lineStrokeWidth).toHaveValue('10')
  await expect(lineNode.locator('line')).toHaveAttribute('stroke-width', '8')
})

test('number inspector preserves precision when an unchanged field blurs', async ({ page }) => {
  await openNestedV3Draft(page, `scene-number-precision-${Date.now()}`)
  const workspace = page.locator('.freeform-workspace')
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scaled root leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const x = page.getByTestId('inspector-geometry').getByLabel('X', { exact: true })

  await x.fill('495.123456')
  await x.press('Enter')
  const historyAfterCommit = await workspace.getAttribute('data-history-depth')
  await expect(x).toHaveValue('495.12')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  const storedX = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    if (!key) throw new Error('draft storage key missing')
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]')
    const draft = drafts[0]
    return draft?.document.slides[0].nodes.find((node: { id: string }) => node.id === 'scaled-root')?.x
  })
  expect(storedX).toBeCloseTo(520.123456, 8)

  await x.focus()
  await x.blur()
  await expect(workspace).toHaveAttribute('data-history-depth', historyAfterCommit ?? '')
  await expect(x).toHaveValue('495.12')
})

test('number inspector keeps negative decimal keyboard input intact', async ({ page }) => {
  await openNestedV3Draft(page, `scene-number-intermediate-${Date.now()}`)
  const workspace = page.locator('.freeform-workspace')
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scaled root leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const x = page.getByTestId('inspector-geometry').getByLabel('X', { exact: true })
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))

  await x.focus()
  await x.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`)
  for (const key of ['-', '1', '2', '.', '5']) await x.press(key)
  await expect(x).toHaveValue('-12.5')
  await x.press('Enter')
  await expect(x).toHaveValue('-12.5')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
})

test('number inspector keeps sibling drafts while previous fields commit', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const geometry = page.getByTestId('inspector-geometry')
  const xInput = geometry.getByLabel('X', { exact: true })
  const yInput = geometry.getByLabel('Y', { exact: true })
  await geometry.locator('input[type="number"]').evaluateAll((inputs) => {
    const [x, y, width, height] = inputs as HTMLInputElement[]
    const setNativeValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    if (!x || !y || !width || !height || !setNativeValue) {
      throw new Error('geometry inputs unavailable')
    }
    x.focus()
    setNativeValue.call(x, '100')
    x.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    y.focus()
    setNativeValue.call(y, '160')
    y.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    width.focus()
    setNativeValue.call(width, '100')
    width.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    height.focus()
    setNativeValue.call(height, '100')
    height.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  })

  await expect.poll(async () => (await freeformElementPositions(page))[0]?.x).toBe(100)
  await expect(yInput).toHaveValue('160')
  await expect(geometry.getByLabel('宽', { exact: true })).toHaveValue('100')
  await expect(geometry.getByLabel('高', { exact: true })).toHaveValue('100')
  await geometry.getByLabel('高', { exact: true }).blur()
  await expect.poll(() => freeformElementPositions(page)).toEqual([{ x: 100, y: 160 }])
})

test('numeric inspector blur is preserved when a pointer gesture is cancelled', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const workspace = page.locator('.freeform-workspace')
  const geometry = page.getByTestId('inspector-geometry')
  const xInput = geometry.getByLabel('X', { exact: true })
  const widthInput = geometry.getByLabel('宽', { exact: true })
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  const before = await freeformElementBoxes(page)
  expect(before).toHaveLength(1)

  await xInput.fill(String(before[0].x + 40))
  const move = page.getByTestId('freeform-selection-move')
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()
  await move.dispatchEvent('pointerdown', {
    pointerId: 101,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: moveBox!.x + moveBox!.width / 2,
    clientY: moveBox!.y + moveBox!.height / 2,
  })
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 101,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual([{
    ...before[0],
    x: before[0].x + 40,
  }])
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))

  await widthInput.fill(String(before[0].width + 40))
  const resize = page.getByTestId('freeform-selection-resize')
  const resizeBox = await resize.boundingBox()
  expect(resizeBox).toBeTruthy()
  await resize.dispatchEvent('pointerdown', {
    pointerId: 102,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: resizeBox!.x + resizeBox!.width / 2,
    clientY: resizeBox!.y + resizeBox!.height / 2,
  })
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 102,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual([{
    ...before[0],
    x: before[0].x + 40,
    width: before[0].width + 40,
  }])
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 2))
})

test('number inspector drops an old draft buffer when the draft identity changes', async ({ page }) => {
  await openNestedV3Draft(page, `scene-number-draft-switch-${Date.now()}`)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    if (!key) throw new Error('draft storage key missing')
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]')
    const source = structuredClone(drafts[0])
    source.id = 'number-buffer-other-draft'
    source.title = 'Number buffer other draft'
    source.updatedAt += 1
    source.document.activeSlideId = 'number-buffer-slide'
    source.document.slides = [{
      ...source.document.slides[0],
      id: 'number-buffer-slide',
      name: 'Number buffer slide',
      nodes: source.document.slides[0].nodes.map((node: { id: string; x?: number }) => (
        node.id === 'scaled-root' ? { ...node, x: 120 } : node
      )),
    }]
    localStorage.setItem(key, JSON.stringify([...drafts, source]))
  })

  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scaled root leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const oldX = page.getByTestId('inspector-geometry').getByLabel('X', { exact: true })
  await oldX.fill('510')

  // Open the other project without touching the focused field.
  await page.evaluate(() => {
    location.hash = '#/edit/canvas/number-buffer-other-draft'
  })
  await expect(page.getByTestId('editor-title')).toHaveText('Number buffer other draft')
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scaled root leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const newX = page.getByTestId('inspector-geometry').getByLabel('X', { exact: true })
  await expect(newX).toHaveValue('95')
  await expect(page.locator('.freeform-workspace')).toHaveAttribute('data-history-depth', '0')
})

test('nested multi-selection exposes logical alignment controls', async ({ page }) => {
  await openNestedV3Draft(page, `scene-nested-arrange-${Date.now()}`)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scope text' }).click()
  await tree.getByRole('treeitem', { name: 'Visible leaf' }).focus()
  await page.keyboard.press('Space')
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  const arrange = page.getByTestId('inspector-arrange')
  await expect(arrange).toBeVisible()
  await expect(arrange).toContainText('层级')
  // Alignment sits above the object's sections, as one row of icons.
  const align = page.locator('.freeform-inspector').getByRole('toolbar', { name: '对齐与分布' })
  await expect(align.getByRole('button', { name: '左对齐', exact: true })).toBeEnabled()
  await expect(align.getByRole('button', { name: '水平均分', exact: true })).toBeDisabled()
})

test('multi-selection with a locked descendant is visibly read only', async ({ page }) => {
  await openNestedV3Draft(page, `scene-multi-lock-${Date.now()}`)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Outer group' }).click()
  await tree.getByRole('treeitem', { name: 'Underlay' }).focus()
  await page.keyboard.press('Space')
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await expect(page.getByTestId('freeform-lock-descendant-banner'))
    .toContainText('Locked inner')
  await expect(page.getByTestId('inspector-arrange')).toHaveCount(0)
  await expect(page.getByTestId('inspector-danger')).toHaveCount(0)
})

test('deep inspector breadcrumb keeps the current object discoverable', async ({ page }) => {
  await openNestedV3Draft(page, `scene-breadcrumb-${Date.now()}`, true)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Deep layer label remains readable' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  const breadcrumb = page.getByRole('navigation', { name: '对象路径' })
  const current = breadcrumb.locator('.freeform-inspector-breadcrumb-current')
  await expect(current).toContainText('Deep layer label remains readable')
  await expect(current).toHaveAttribute('title', /Deep layer label remains readable/)
  await expect.poll(() => current.evaluate((node) => node.getBoundingClientRect().width))
    .toBeGreaterThan(40)
})

test('linked group dimensions and lock states', async ({ page }) => {
  await openNestedV3Draft(page, `scene-group-properties-${Date.now()}`)
  const workspace = page.locator('.freeform-workspace')
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await outer.click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await expect(page.getByTestId('freeform-lock-descendant-banner')).toContainText('包含锁定图层')
  await expect(page.getByTestId('inspector-geometry')).toHaveCount(0)
  await expect(page.getByTestId('inspector-arrange')).toHaveCount(0)
  await expect(page.getByTestId('inspector-danger')).toHaveCount(0)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const lockedInner = tree.getByRole('treeitem', { name: 'Locked inner' })
  await lockedInner.getByRole('button', { name: '锁定图层 Locked inner' }).click()
  await outer.click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const geometry = page.getByTestId('inspector-geometry')
  await expect(geometry).toBeVisible()
  const centerX = geometry.getByLabel('中心 X', { exact: true })
  const centerY = geometry.getByLabel('中心 Y', { exact: true })
  const width = geometry.getByLabel('宽', { exact: true })
  const height = geometry.getByLabel('高', { exact: true })
  const beforeCenterX = Number(await centerX.inputValue())
  const beforeCenterY = Number(await centerY.inputValue())
  const beforeWidth = Number(await width.inputValue())
  const beforeHeight = Number(await height.inputValue())
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))

  await width.fill(String(beforeWidth * 1.2))
  await width.press('Enter')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(centerX).toHaveValue(String(beforeCenterX))
  await expect(centerY).toHaveValue(String(beforeCenterY))
  await expect(height).toHaveValue(String(beforeHeight * 1.2))

  const rotation = geometry.getByLabel('旋转', { exact: true })
  await rotation.fill('330')
  await rotation.press('Enter')
  await expect(centerX).toHaveValue(String(beforeCenterX))
  await expect(centerY).toHaveValue(String(beforeCenterY))

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await outer.getByRole('button', { name: '锁定图层 Outer group' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await expect(page.getByTestId('freeform-lock-banner')).toContainText('已锁定')
  await expect(page.getByTestId('inspector-geometry')).toHaveCount(0)
})
