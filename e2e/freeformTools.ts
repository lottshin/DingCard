import { expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

/**
 * The freeform settings panel (properties, layers, history) opens on demand.
 * Specs that work in it start with it open, the way a user who opened it
 * once keeps it.
 */
export async function startWithSettingsPanelOpen(page: Page) {
  await page.addInitScript(() => {
    const key = 'slicer.freeform.prefs.v1'
    try {
      const current = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      if (typeof current.panelOpen !== 'boolean') {
        localStorage.setItem(key, JSON.stringify({ ...current, panelOpen: true }))
      }
    } catch {
      localStorage.setItem(key, JSON.stringify({ panelOpen: true }))
    }
  })
}

type ToolPanel = 'templates' | 'styles' | 'text' | 'images' | 'elements'

function toolTrigger(page: Page, tool: ToolPanel) {
  return page.getByTestId(tool === 'templates' ? 'freeform-template-button' : `freeform-${tool}-tool`)
}

/** Opens a tool rail panel unless it is already open (the rail button toggles). */
export async function openToolPanel(page: Page, tool: ToolPanel) {
  const trigger = toolTrigger(page, tool)
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click()
  await expect(page.getByTestId(`freeform-${tool}-drawer`)).toBeVisible()
}

/** The templates panel's first button opens the full template gallery. */
export async function openFreeformTemplateGallery(page: Page) {
  await openToolPanel(page, 'templates')
  await page.getByTestId('freeform-templates-browse').click()
}

/** Closes a tool rail panel from its rail button, leaving the stage as wide as before. */
export async function closeToolPanel(page: Page, tool: ToolPanel) {
  const trigger = toolTrigger(page, tool)
  if (await trigger.getAttribute('aria-expanded') === 'true') await trigger.click()
  await expect(page.getByTestId(`freeform-${tool}-drawer`)).toHaveCount(0)
}

export async function insertFreeformText(page: Page) {
  await openToolPanel(page, 'text')
  await page.getByTestId('insert-text').click()
  await closeToolPanel(page, 'text')
}

export async function insertFreeformShape(page: Page, label = '矩形') {
  await openToolPanel(page, 'elements')
  await page.getByTestId('freeform-elements-drawer')
    .getByRole('group', { name: '形状' })
    .getByRole('button', { name: label, exact: true })
    .click()
  await closeToolPanel(page, 'elements')
}

/** Back to the fitted page (100%): the zoom value in the stage's corner. */
export async function fitFreeformCanvas(page: Page) {
  await page.getByTestId('freeform-zoom-value').click()
  await expect(page.getByTestId('freeform-zoom-value')).toHaveText('100%')
}

/** Opens a page's 「…」 menu in the page list. */
export async function openPageMenu(page: Page, index: number) {
  await page.getByTestId('freeform-thumb-menu').nth(index).click()
  const menu = page.getByTestId('freeform-slide-context-menu')
  await expect(menu).toBeVisible()
  return menu
}

async function currentPageIndex(page: Page) {
  return page.getByTestId('freeform-thumb').evaluateAll((nodes) => (
    nodes.findIndex((node) => node.getAttribute('aria-current') === 'page')
  ))
}

/** Duplicates the current page from its 「…」 menu; the copy becomes current. */
export async function duplicateCurrentPage(page: Page) {
  const menu = await openPageMenu(page, await currentPageIndex(page))
  await menu.getByTestId('freeform-slide-context-menu-duplicate').click()
  await expect(menu).toHaveCount(0)
}

export const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
export const TEST_PNG_DATA_URL = `data:image/png;base64,${TEST_PNG.toString('base64')}`
export const WIDE_TEST_SVG = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
    <rect width="800" height="400" fill="#f8fafc" />
    <path d="M0 200h800M400 0v400" stroke="#64748b" stroke-width="8" />
    <rect x="8" y="8" width="48" height="48" fill="#ff1744" />
    <rect x="744" y="8" width="48" height="48" fill="#00c853" />
    <rect x="8" y="344" width="48" height="48" fill="#2962ff" />
    <rect x="744" y="344" width="48" height="48" fill="#d500f9" />
  </svg>
`)
export const WIDE_TEST_SVG_DATA_URL = `data:image/svg+xml;base64,${WIDE_TEST_SVG.toString('base64')}`

export function imageCropTransformDraft() {
  return {
    id: 'image-crop-transform-draft',
    title: 'Nested v3 scene',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: Date.now(),
    document: {
      documentVersion: 4,
      activeSlideId: 'image-crop-transform-slide',
      slides: [{
        id: 'image-crop-transform-slide',
        name: 'Nested image crop',
        width: 1000,
        height: 800,
        background: { type: 'solid', color: '#ffffff' },
        nodes: [{
          id: 'crop-outer',
          name: 'Crop outer',
          locked: false,
          hidden: false,
          type: 'group',
          x: 480,
          y: 360,
          rotation: 30,
          scale: 1.5,
          children: [{
            id: 'crop-inner',
            name: 'Crop inner',
            locked: false,
            hidden: false,
            type: 'group',
            x: 80,
            y: 40,
            rotation: -90,
            scale: 0.8,
            children: [{
              id: 'crop-image',
              name: 'Crop image',
              locked: false,
              hidden: false,
              type: 'image',
              x: -120,
              y: -80,
              width: 240,
              height: 160,
              rotation: 20,
              scale: 1.25,
              src: WIDE_TEST_SVG_DATA_URL,
              alt: 'Nested crop image',
              fit: 'cover',
              framing: { focusX: 0.5, focusY: 0.5, zoom: 1 },
            }],
          }],
        }],
      }],
    },
  }
}

export function nestedV3Draft() {
  return {
    id: 'nested-v3-draft',
    title: 'Nested v3 scene',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: Date.now(),
    document: {
      documentVersion: 3,
      activeSlideId: 'nested-slide',
      slides: [{
        id: 'nested-slide',
        name: 'Nested scene',
        width: 800,
        height: 600,
        background: { type: 'solid', color: '#ffffff' },
        nodes: [{
          id: 'underlay',
          name: 'Underlay',
          locked: false,
          hidden: false,
          type: 'shape',
          x: 40,
          y: 40,
          width: 460,
          height: 320,
          rotation: 0,
          scale: 1,
          shape: 'rect',
          fill: { type: 'solid', color: '#fca5a5' },
          stroke: '#991b1b',
          strokeWidth: 0,
        }, {
          id: 'outer',
          name: 'Outer group',
          locked: false,
          hidden: false,
          type: 'group',
          x: 300,
          y: 200,
          rotation: 0,
          scale: 1.25,
          children: [{
            id: 'visible-leaf',
            name: 'Visible leaf',
            locked: false,
            hidden: false,
            type: 'shape',
            x: -80,
            y: -60,
            width: 80,
            height: 40,
            rotation: 0,
            scale: 1,
            shape: 'rect',
            fill: { type: 'solid', color: '#22c55e' },
            stroke: '#166534',
            strokeWidth: 0,
          }, {
            id: 'scope-text',
            name: 'Scope text',
            locked: false,
            hidden: false,
            type: 'text',
            x: -80,
            y: 0,
            width: 100,
            height: 40,
            rotation: 0,
            scale: 1,
            text: 'Enter group to edit',
            fontSize: 20,
            fontFamily: 'system-ui',
            textFill: { type: 'solid', color: '#111111' },
            align: 'left',
            fontWeight: 'normal',
          }, {
            id: 'locked-inner',
            name: 'Locked inner',
            locked: true,
            hidden: false,
            type: 'group',
            x: 40,
            y: 20,
            rotation: 0,
            scale: 0.5,
            children: [{
              id: 'locked-text',
              name: 'Locked text',
              locked: false,
              hidden: false,
              type: 'text',
              x: 0,
              y: 0,
              width: 200,
              height: 80,
              rotation: 0,
              scale: 1,
              text: 'Read only nested text',
              fontSize: 24,
              fontFamily: 'system-ui',
              textFill: { type: 'solid', color: '#111111' },
              align: 'left',
              fontWeight: 'normal',
            }],
          }, {
            id: 'hidden-inner',
            name: 'Hidden inner',
            locked: false,
            hidden: true,
            type: 'group',
            x: 0,
            y: 0,
            rotation: 0,
            scale: 1,
            children: [{
              id: 'hidden-leaf',
              name: 'Hidden leaf',
              locked: false,
              hidden: false,
              type: 'shape',
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              rotation: 0,
              scale: 1,
              shape: 'ellipse',
              fill: { type: 'solid', color: '#2563eb' },
              stroke: '#1e3a8a',
              strokeWidth: 0,
            }],
          }],
        }, {
          id: 'scaled-root',
          name: 'Scaled root leaf',
          locked: false,
          hidden: false,
          type: 'shape',
          x: 520,
          y: 400,
          width: 100,
          height: 80,
          rotation: 0,
          scale: 1.5,
          shape: 'rect',
          fill: { type: 'solid', color: '#facc15' },
          stroke: '#854d0e',
          strokeWidth: 0,
        }, {
          id: 'locked-root-leaf',
          name: 'Locked root leaf',
          locked: true,
          hidden: false,
          type: 'shape',
          x: 680,
          y: 20,
          width: 80,
          height: 50,
          rotation: 0,
          scale: 1,
          shape: 'rect',
          fill: { type: 'solid', color: '#94a3b8' },
          stroke: '#334155',
          strokeWidth: 0,
        }, {
          id: 'locked-root-group',
          name: 'Locked root group',
          locked: true,
          hidden: false,
          type: 'group',
          x: 650,
          y: 100,
          rotation: 0,
          scale: 1,
          children: [{
            id: 'locked-root-group-leaf',
            name: 'Locked root group leaf',
            locked: false,
            hidden: false,
            type: 'shape',
            x: 0,
            y: 0,
            width: 100,
            height: 60,
            rotation: 0,
            scale: 1,
            shape: 'ellipse',
            fill: { type: 'solid', color: '#cbd5e1' },
            stroke: '#475569',
            strokeWidth: 0,
          }],
        }],
      }],
    },
  }
}

export function nestedPropertyMatrixDraft() {
  const draft = structuredClone(nestedV3Draft())
  const outer = (
    draft.document.slides[0].nodes as unknown as Array<{
      id: string
      type: string
      children?: unknown[]
    }>
  ).find((node) => node.id === 'outer')
  if (!outer || outer.type !== 'group' || !outer.children) {
    throw new Error('nested property matrix fixture requires the outer group')
  }
  outer.children.push({
    id: 'matrix-image',
    name: 'Matrix image',
    locked: false,
    hidden: false,
    type: 'image',
    x: 80,
    y: 100,
    width: 120,
    height: 90,
    rotation: 0,
    scale: 1,
    src: TEST_PNG_DATA_URL,
    alt: 'Nested matrix image',
    fit: 'cover',
  }, {
    id: 'matrix-line',
    name: 'Matrix line',
    locked: false,
    hidden: false,
    type: 'line',
    x: 80,
    y: 220,
    width: 160,
    height: 40,
    rotation: 0,
    scale: 1,
    lineKind: 'line',
    stroke: '#0f172a',
    strokeWidth: 4,
  })
  return draft
}

export function groupingDraft() {
  const draft = structuredClone(nestedV3Draft())
  const shape = (
    id: string,
    name: string,
    x: number,
    y: number,
    locked = false,
  ) => ({
    id,
    name,
    locked,
    hidden: false,
    type: 'shape' as const,
    x,
    y,
    width: 80,
    height: 60,
    rotation: 0,
    scale: 1,
    shape: 'rect' as const,
    fill: { type: 'solid' as const, color: '#dbeafe' },
    stroke: '#1d4ed8',
    strokeWidth: 0,
  })
  ;(draft.document.slides[0].nodes as unknown[]) = [
    shape('layer-a', 'Layer A', 80, 80),
    shape('layer-b', 'Layer B', 180, 80),
    shape('layer-c', 'Layer C', 280, 80),
    shape('layer-d', 'Layer D', 380, 80),
    {
      id: 'locked-container',
      name: 'Locked container',
      locked: true,
      hidden: false,
      type: 'group',
      x: 600,
      y: 180,
      rotation: 0,
      scale: 1,
      children: [
        shape('locked-child-a', 'Locked child A', -60, -30),
        shape('locked-child-b', 'Locked child B', 40, -30),
      ],
    },
  ]
  return draft
}

export function scopeNavigationDraft() {
  const draft = structuredClone(groupingDraft())
  const shape = (
    id: string,
    name: string,
    x: number,
    y: number,
  ) => ({
    id,
    name,
    locked: false,
    hidden: false,
    type: 'shape' as const,
    x,
    y,
    width: 80,
    height: 60,
    rotation: 0,
    scale: 1,
    shape: 'rect' as const,
    fill: { type: 'solid' as const, color: '#dcfce7' },
    stroke: '#15803d',
    strokeWidth: 0,
  })
  ;(draft.document.slides[0].nodes as unknown[]) = [{
    id: 'scope-outer',
    name: 'Scope outer',
    locked: false,
    hidden: false,
    type: 'group',
    x: 360,
    y: 260,
    rotation: 0,
    scale: 1,
    children: [{
      id: 'scope-inner',
      name: 'Scope inner',
      locked: false,
      hidden: false,
      type: 'group',
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      children: [shape('scope-leaf', 'Scope leaf', -40, -30)],
    }, shape('outer-leaf', 'Outer leaf', 120, 0)],
  }]
  return draft
}

export function crossScopeClipboardDraft() {
  const draft = structuredClone(groupingDraft())
  const shape = (id: string, name: string, x: number, y: number, color: string) => ({
    id,
    name,
    locked: false,
    hidden: false,
    type: 'shape' as const,
    x,
    y,
    width: 80,
    height: 60,
    rotation: 12,
    scale: 0.8,
    shape: 'rect' as const,
    fill: { type: 'solid' as const, color },
    stroke: '#111827',
    strokeWidth: 0,
  })
  ;(draft.document.slides[0].nodes as unknown[]) = [{
    id: 'clipboard-source',
    name: 'Clipboard source',
    locked: false,
    hidden: false,
    type: 'group',
    x: 240,
    y: 220,
    rotation: 30,
    scale: 1.5,
    children: [shape('clipboard-source-leaf', 'Clipboard source leaf', -40, -30, '#dc2626')],
  }, {
    id: 'clipboard-target',
    name: 'Clipboard target',
    locked: false,
    hidden: false,
    type: 'group',
    x: 620,
    y: 420,
    rotation: -20,
    scale: 0.75,
    children: [shape('clipboard-target-leaf', 'Clipboard target leaf', -40, -30, '#2563eb')],
  }]
  return draft
}

export function textScopeDraft() {
  const draft = structuredClone(scopeNavigationDraft())
  const outer = draft.document.slides[0].nodes[0] as unknown as {
    children: Array<Record<string, unknown>>
  }
  outer.children.push({
    id: 'scope-text-edit',
    name: 'Scope editable text',
    locked: false,
    hidden: false,
    type: 'text',
    x: -140,
    y: 80,
    width: 240,
    height: 60,
    rotation: 0,
    scale: 1,
    text: 'Escape editing first',
    fontSize: 24,
    fontFamily: 'system-ui',
    textFill: { type: 'solid', color: '#111111' },
    align: 'left',
    fontWeight: 'normal',
  })
  return draft
}

export function offCenterScopeDraft() {
  const draft = structuredClone(groupingDraft())
  ;(draft.document.slides[0].nodes as unknown[]) = [{
    id: 'offset-parent',
    name: 'Offset parent',
    locked: false,
    hidden: false,
    type: 'group',
    x: 360,
    y: 240,
    rotation: 28,
    scale: 1.25,
    children: [{
      id: 'offset-anchor',
      name: 'Offset anchor',
      locked: false,
      hidden: false,
      type: 'shape',
      x: 125.25,
      y: 78.5,
      width: 120,
      height: 80,
      rotation: 22,
      scale: 1.4,
      shape: 'rect',
      fill: { type: 'solid', color: '#fde68a' },
      stroke: '#92400e',
      strokeWidth: 0,
    }],
  }]
  return draft
}

export function deepLayerBranch(depth: number) {
  let node: Record<string, unknown> = {
    id: 'deep-leaf',
    name: 'Deep layer label remains readable',
    locked: false,
    hidden: false,
    type: 'shape',
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    rotation: 0,
    scale: 1,
    shape: 'rect',
    fill: { type: 'solid', color: '#111827' },
    stroke: '#111827',
    strokeWidth: 0,
  }
  for (let level = depth - 1; level >= 1; level -= 1) {
    node = {
      id: `deep-group-${level}`,
      name: `Deep group ${level}`,
      locked: false,
      hidden: false,
      type: 'group',
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      children: [node],
    }
  }
  node.locked = true
  node.hidden = true
  return node
}

export function readPngSize(buffer: Buffer) {
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG')
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

export async function samplePngPixel(
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

export async function pngPixelDigest(
  page: import('@playwright/test').Page,
  filePath: string,
) {
  const buffer = await readFile(filePath)
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
  return page.evaluate(async (source) => {
    const image = new Image()
    image.src = source
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no canvas context')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, image.width, image.height).data
    const digest = await crypto.subtle.digest('SHA-256', pixels)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }, dataUrl)
}

export function rgbDistance(a: number[], b: number[]) {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 +
      (a[1] - b[1]) ** 2 +
      (a[2] - b[2]) ** 2,
  )
}

export function contrastRatio(foreground: string, background: string) {
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

export async function freeformElementPositions(page: import('@playwright/test').Page) {
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

export async function freeformCanvasScale(page: import('@playwright/test').Page) {
  return page.getByTestId('freeform-canvas').evaluate((canvas) => {
    const element = canvas as HTMLElement
    const logicalWidth = Number.parseFloat(element.style.width)
    const renderedWidth = element.getBoundingClientRect().width
    if (!Number.isFinite(logicalWidth) || logicalWidth <= 0 || renderedWidth <= 0) {
      throw new Error('freeform canvas scale is not measurable')
    }
    return renderedWidth / logicalWidth
  })
}

export async function locatorOwnsPoint(
  locator: import('@playwright/test').Locator,
  x: number,
  y: number,
) {
  return locator.evaluate((node, point) => {
    const hit = document.elementFromPoint(point.x, point.y)
    return Boolean(hit && (hit === node || node.contains(hit)))
  }, { x, y })
}

export async function freeformStageMetrics(page: import('@playwright/test').Page) {
  return page.locator('.freeform-stage-scroll').evaluate((stage) => {
    const canvas = stage.querySelector<HTMLElement>('[data-testid="freeform-canvas"]')
    if (!canvas) throw new Error('freeform canvas is not ready')
    const stageRect = stage.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()
    const style = getComputedStyle(stage)
    const px = (value: string) => Number.parseFloat(value) || 0
    const borderLeft = px(style.borderLeftWidth)
    const borderRight = px(style.borderRightWidth)
    const borderTop = px(style.borderTopWidth)
    const borderBottom = px(style.borderBottomWidth)
    const paddingLeft = px(style.paddingLeft)
    const paddingRight = px(style.paddingRight)
    const paddingTop = px(style.paddingTop)
    const paddingBottom = px(style.paddingBottom)
    const logicalWidth = Number.parseFloat(canvas.style.width)
    const logicalHeight = Number.parseFloat(canvas.style.height)

    return {
      contentWidth: stageRect.width - borderLeft - borderRight - paddingLeft - paddingRight,
      contentHeight: stageRect.height - borderTop - borderBottom - paddingTop - paddingBottom,
      logicalWidth,
      logicalHeight,
      renderedWidth: canvasRect.width,
      renderedHeight: canvasRect.height,
      stageLeft: stageRect.left + borderLeft,
      stageRight: stageRect.right - borderRight,
      stageTop: stageRect.top + borderTop,
      stageBottom: stageRect.bottom - borderBottom,
      canvasLeft: canvasRect.left,
      canvasRight: canvasRect.right,
      canvasTop: canvasRect.top,
      canvasBottom: canvasRect.bottom,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      clientWidth: stage.clientWidth,
      clientHeight: stage.clientHeight,
      scrollWidth: stage.scrollWidth,
      scrollHeight: stage.scrollHeight,
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
    }
  })
}

export async function expectFreeformCanvasMatchesZoom(
  page: import('@playwright/test').Page,
  zoomPercent: number,
  expectNoOverflow: boolean,
) {
  await expect
    .poll(async () => {
      const metrics = await freeformStageMetrics(page)
      const fitScale = Math.min(
        metrics.contentWidth / metrics.logicalWidth,
        metrics.contentHeight / metrics.logicalHeight,
      )
      const actualScale = metrics.renderedWidth / metrics.logicalWidth
      return actualScale / (fitScale * (zoomPercent / 100))
    })
    .toBeCloseTo(1, 3)

  const metrics = await freeformStageMetrics(page)
  if (expectNoOverflow) {
    expect(metrics.scrollWidth - metrics.clientWidth).toBeLessThanOrEqual(1)
    expect(metrics.scrollHeight - metrics.clientHeight).toBeLessThanOrEqual(1)
  }
  return metrics
}

export async function setFreeformZoom(page: import('@playwright/test').Page, target: number) {
  const value = page.getByTestId('freeform-zoom-value')
  const current = Number.parseInt((await value.textContent()) ?? '', 10)
  if (!Number.isFinite(current) || target % 10 !== 0) throw new Error('invalid zoom target')
  const direction = target > current ? 10 : -10
  const button = page.getByRole('button', {
    name: direction > 0 ? '放大画布' : '缩小画布',
    exact: true,
  })
  for (let zoom = current; zoom !== target; zoom += direction) {
    if (await button.isDisabled()) {
      throw new Error(`freeform zoom stopped at ${zoom}% before reaching ${target}%`)
    }
    await button.click()
  }
  await expect(value).toHaveText(`${target}%`)
}

export async function selectFreeformPagePreset(
  page: import('@playwright/test').Page,
  ratio: '1:1' | '9:16' | '16:9',
) {
  await page.getByTestId('page-size-trigger').click()
  await page.getByTestId('page-size-popover').getByRole('button', { name: ratio, exact: true }).click()
}

export async function applyFreeformCustomSize(
  page: import('@playwright/test').Page,
  width: number,
  height: number,
) {
  await page.getByTestId('page-size-trigger').click()
  await page.getByLabel('宽度 px').fill(String(width))
  await page.getByLabel('高度 px').fill(String(height))
  await page.getByRole('button', { name: '应用尺寸', exact: true }).click()
}

export async function freeformElementBoxes(page: import('@playwright/test').Page) {
  return page.getByTestId('freeform-element').evaluateAll((elements) =>
    elements.map((element) => {
      const node = element as HTMLElement
      return {
        x: Number.parseFloat(node.style.left),
        y: Number.parseFloat(node.style.top),
        width: Number.parseFloat(node.style.width),
        height: Number.parseFloat(node.style.height),
      }
    }),
  )
}

export function selectedFreeformElements(page: import('@playwright/test').Page) {
  return page.locator('[data-testid="freeform-element"][data-selected="true"]')
}

export async function freeformElementKinds(page: import('@playwright/test').Page) {
  return page.locator('.freeform-element').evaluateAll((elements) =>
    elements.map((element) => {
      if (element.querySelector('.freeform-textbox')) return 'text'
      if (element.querySelector('.freeform-shape')) return 'shape'
      if (element.querySelector('.freeform-image')) return 'image'
      return 'unknown'
    }),
  )
}

export async function registerUser(page: import('@playwright/test').Page, username: string) {
  await page.getByRole('button', { name: '注册' }).click()
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill('1234')
  await page.getByRole('button', { name: '创建账号' }).click()
  // The register request is still in flight when the click returns. Wait for
  // the session before acting as the new user: an import that races the login
  // saves into the guest's local store while the follow-up open reads the
  // account's and reports the project as missing. With guest work on the
  // canvas the login is held behind the guest-move offer instead.
  await expect(
    page.getByTestId('account-menu').or(page.getByTestId('guest-move-confirm')),
  ).toBeVisible()
}

/** Sign up from the editor and move the guest's canvas (saved on this device) into the new account. */
export async function signUpToSave(page: import('@playwright/test').Page, username: string) {
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存到本机')
  await page.getByTestId('account-login').click()
  await registerUser(page, username)
  await page.getByTestId('guest-move-confirm').click()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
}

/** Open the export menu under 导出 (no-op when it is already open). */
export async function openExportMenu(page: import('@playwright/test').Page) {
  const panel = page.getByTestId('freeform-export-options')
  if (!(await panel.isVisible())) await page.getByTestId('freeform-export').click()
  await expect(panel).toBeVisible()
}

/** The signed-in user's id in the local store. */
export async function currentUserId(page: import('@playwright/test').Page): Promise<string> {
  const id = await page.evaluate(() => localStorage.getItem('slicer.session.v1'))
  if (!id) throw new Error('no signed-in user')
  return id
}

/** Store drafts straight into the signed-in user's projects, then open the first one. */
export async function openStoredDrafts(page: import('@playwright/test').Page, drafts: unknown[]) {
  const userId = await currentUserId(page)
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
    `slicer.drafts.${userId}`,
    JSON.stringify(drafts),
  ])
  const first = drafts[0] as { id: string }
  await page.goto('about:blank')
  await page.goto(`/#/edit/canvas/${encodeURIComponent(first.id)}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
}

type ShapeFillFileReaderGate = {
  started: number
  completed: number
  original: typeof FileReader.prototype.readAsDataURL
  releaseAll: () => void
}

type ShapeFillGateWindow = typeof window & {
  __shapeFillFileReaderGate?: ShapeFillFileReaderGate
}

export async function installShapeFillFileReaderGate(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const gateWindow = window as ShapeFillGateWindow
    if (gateWindow.__shapeFillFileReaderGate) {
      throw new Error('delayed FileReader gate already installed')
    }

    const pending: Array<() => void> = []
    const original = FileReader.prototype.readAsDataURL
    const state: ShapeFillFileReaderGate = {
      started: 0,
      completed: 0,
      original,
      releaseAll() {
        pending.splice(0).forEach((release) => release())
      },
    }
    gateWindow.__shapeFillFileReaderGate = state
    FileReader.prototype.readAsDataURL = function delayedReadAsDataURL(blob: Blob) {
      state.started += 1
      const reader = this
      pending.push(() => {
        reader.addEventListener('loadend', () => {
          state.completed += 1
        }, { once: true })
        original.call(reader, blob)
      })
    }
  })
}

export async function expectShapeFillFileReaderStarted(
  page: import('@playwright/test').Page,
  expected = 1,
) {
  await expect.poll(() => page.evaluate(() => (
    window as ShapeFillGateWindow
  ).__shapeFillFileReaderGate?.started)).toBe(expected)
}

export async function releaseShapeFillFileReaderGate(
  page: import('@playwright/test').Page,
  expected = 1,
) {
  await page.evaluate(() => {
    const state = (window as ShapeFillGateWindow).__shapeFillFileReaderGate
    if (!state) throw new Error('delayed FileReader gate missing')
    state.releaseAll()
  })
  await expect.poll(() => page.evaluate(() => (
    window as ShapeFillGateWindow
  ).__shapeFillFileReaderGate?.completed)).toBe(expected)
}

export async function restoreShapeFillFileReaderGate(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const gateWindow = window as ShapeFillGateWindow
    const state = gateWindow.__shapeFillFileReaderGate
    if (state) FileReader.prototype.readAsDataURL = state.original
    delete gateWindow.__shapeFillFileReaderGate
  })
}

export async function expectVisibleFreeformToolbarButtonsToFit(
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

export async function setSelectedElementPosition(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
) {
  const positionInputs = page.locator('.freeform-inspector .field-grid').first().locator('input')
  await positionInputs.nth(0).fill(String(x))
  await positionInputs.nth(0).press('Enter')
  await positionInputs.nth(1).fill(String(y))
  await positionInputs.nth(1).press('Enter')
}

export async function setSelectedElementBox(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const positionInputs = page.locator('.freeform-inspector .field-grid').first().locator('input')
  await positionInputs.nth(0).fill(String(x))
  await positionInputs.nth(0).press('Enter')
  await positionInputs.nth(1).fill(String(y))
  await positionInputs.nth(1).press('Enter')
  await positionInputs.nth(2).fill(String(width))
  await positionInputs.nth(2).press('Enter')
  await positionInputs.nth(3).fill(String(height))
  await positionInputs.nth(3).press('Enter')
}

export async function openFreeform(page: import('@playwright/test').Page) {
  await page.goto('/#/edit/canvas')
}

export async function openNestedV3Draft(
  page: import('@playwright/test').Page,
  username: string,
  includeDeepLayer = false,
  createDraft: () => ReturnType<typeof nestedV3Draft> = nestedV3Draft,
) {
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('account-login').click()
  await registerUser(page, username)
  await expect(page.getByTestId('account-menu')).toBeVisible()

  const draft = createDraft()
  if (includeDeepLayer) {
    (draft.document.slides[0].nodes as unknown[]).push(deepLayerBranch(25))
  }
  await openStoredDrafts(page, [draft])
}

/** Resolves once the canvas has kept the same box for two frames (a panel change re-fits it a frame later). */
export async function waitForCanvasFit(page: import('@playwright/test').Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    let last = ''
    let steady = 0
    const check = () => {
      const canvas = document.querySelector('[data-testid="freeform-canvas"]')
      if (!canvas) return resolve()
      const box = canvas.getBoundingClientRect()
      const key = `${box.left},${box.top},${box.width},${box.height}`
      steady = key === last ? steady + 1 : 0
      last = key
      if (steady >= 2) resolve()
      else requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }))
}

/** Opens an insert panel from the tool rail, inserts from it, and closes it again. */
export async function withToolPanel(
  page: import('@playwright/test').Page,
  tool: 'text' | 'elements',
  insert: (panel: import('@playwright/test').Locator) => Promise<void>,
) {
  const trigger = page.getByTestId(`freeform-${tool}-tool`)
  const panel = page.getByTestId(`freeform-${tool}-drawer`)
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click()
  await expect(panel).toBeVisible()
  await insert(panel)
  await trigger.click()
  await expect(panel).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await waitForCanvasFit(page)
}

export async function insertText(page: import('@playwright/test').Page) {
  await withToolPanel(page, 'text', (panel) => panel.getByTestId('insert-text').click())
}

export async function insertShape(
  page: import('@playwright/test').Page,
  label: '矩形' | '圆形' | '三角形' | '五角星' | '六边形' = '矩形',
) {
  await withToolPanel(page, 'elements', (panel) => panel
    .getByRole('group', { name: '形状' })
    .getByRole('button', { name: label, exact: true })
    .click())
}

export async function insertImageElementAndShapeFill(page: import('@playwright/test').Page) {
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'image-element.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expect(page.getByTestId('freeform-element').filter({ has: page.locator('.freeform-image') }))
    .toHaveCount(1)

  await insertShape(page)
  await page.locator('input.freeform-file').nth(1).setInputFiles({
    name: 'shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(1)
}

export async function expectFreeformImagesDecoded(page: import('@playwright/test').Page) {
  await expect.poll(() => page.locator('.freeform-image').evaluateAll(async (nodes) => {
    if (nodes.length === 0) return false
    const decoded = await Promise.all(nodes.map(async (node) => {
      const image = node as HTMLImageElement
      try {
        await image.decode()
        return image.naturalWidth > 0 && image.naturalHeight > 0
      } catch {
        return false
      }
    }))
    return decoded.every(Boolean)
  })).toBe(true)

  await expect.poll(() => page.getByTestId('freeform-shape-image-fill')
    .locator('[data-framed-image-content="true"]')
    .evaluate(async (node) => {
    const image = node as HTMLImageElement
    try {
      await image.decode()
      return image.naturalWidth > 0 && image.naturalHeight > 0
    } catch {
      return false
    }
  })).toBe(true)
}

export async function setRangeValue(
  locator: import('@playwright/test').Locator,
  value: number,
) {
  await locator.evaluate((node, nextValue) => {
    const input = node as HTMLInputElement
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    nativeSetter?.call(input, String(nextValue))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

export async function insertLine(
  page: import('@playwright/test').Page,
  label: '直线' | '箭头',
) {
  await withToolPanel(page, 'elements', (panel) => panel
    .getByRole('group', { name: '线条' })
    .getByRole('button', { name: label, exact: true })
    .click())
}

export async function insertTwoSelectedRectangles(page: import('@playwright/test').Page) {
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

export async function insertTwoRectanglesLeavingInspectorFocused(page: import('@playwright/test').Page) {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 320, 120, 100, 100)

  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(2)
  return elements
}

export async function installDisabledFieldsetFocusTargets(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const host = document.createElement('div')
    host.style.cssText = [
      'position: fixed',
      'left: 8px',
      'bottom: 8px',
      'z-index: 100',
      'background: white',
      'color: black',
      'padding: 8px',
    ].join(';')

    const fieldset = document.createElement('fieldset')
    fieldset.disabled = true
    const legend = document.createElement('legend')
    legend.textContent = 'Disabled fieldset legend '
    const legendInput = document.createElement('input')
    legendInput.dataset.testid = 'disabled-fieldset-legend-input'
    legend.append(legendInput)

    const link = document.createElement('a')
    link.href = '#disabled-fieldset-link'
    link.dataset.testid = 'disabled-fieldset-link'
    link.textContent = 'Enabled fieldset link'

    const disabledInput = document.createElement('input')
    disabledInput.dataset.testid = 'disabled-fieldset-input'
    fieldset.append(legend, link, disabledInput)
    host.append(fieldset)
    document.body.append(host)
  })
}

export async function clickLocatorCenter(
  page: import('@playwright/test').Page,
  target: import('@playwright/test').Locator,
) {
  const box = await target.boundingBox()
  expect(box).toBeTruthy()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
}

export function extractCssSelectors(css: string) {
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

export function findUnscopedWorkspaceChromeSelectors(css: string) {
  const chromeMarkers = [
    '.page-size-',
    '.freeform-insert-',
    '.freeform-add-page',
    '.freeform-thumb-caption',
    '.freeform-thumb-number',
    '.freeform-stage-head',
    '.freeform-stage-box',
    '.toolbar-collapsible-label',
  ]
  return extractCssSelectors(css)
    .filter((selector) => chromeMarkers.some((marker) => selector.includes(marker)))
    .filter((selector) => {
      const withoutThemePrefix = selector.replace(/^\[data-theme=['"]dark['"]\]\s+/, '')
      return !/^(?:\.app-header|\.workspace-toolbar|\.freeform-toolbar|\.freeform-rail|\.freeform-stage-pane|\.freeform-inspector)(?:\s|$)/.test(withoutThemePrefix)
    })
}

export async function readCropOverlayDraft(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>(
      '[data-testid="freeform-image-crop-overlay"]',
    )
    if (!overlay) throw new Error('crop overlay missing')
    const readBounds = (prefix: 'Frame' | 'Image') => {
      const read = (edge: 'Left' | 'Top' | 'Right' | 'Bottom') => {
        const value = overlay.dataset[`crop${prefix}${edge}`]
        if (value === undefined) throw new Error(`crop ${prefix} ${edge} data missing`)
        return Number.parseFloat(value)
      }
      return {
        left: read('Left'),
        top: read('Top'),
        right: read('Right'),
        bottom: read('Bottom'),
      }
    }
    const frame = readBounds('Frame')
    const image = readBounds('Image')
    return {
      frame,
      image,
      overlaySize: {
        width: Number.parseFloat(overlay.style.width),
        height: Number.parseFloat(overlay.style.height),
      },
    }
  })
}

export async function readCropVisualGeometry(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>(
      '[data-testid="freeform-image-crop-overlay"]',
    )
    const frame = overlay?.querySelector<HTMLElement>('.freeform-image-crop-frame')
    const image = overlay?.querySelector<HTMLImageElement>('.freeform-image-crop-dim')
    if (!overlay || !frame || !image) throw new Error('crop visual geometry missing')
    const plainRect = (rect: DOMRect) => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    })
    const imageRect = image.getBoundingClientRect()
    const markerCenter = (naturalX: number, naturalY: number) => ({
      x: imageRect.left + imageRect.width * (naturalX / 800),
      y: imageRect.top + imageRect.height * (naturalY / 400),
    })
    return {
      frame: plainRect(frame.getBoundingClientRect()),
      image: plainRect(imageRect),
      markers: {
        topLeft: markerCenter(32, 32),
        topRight: markerCenter(768, 32),
        bottomLeft: markerCenter(32, 368),
        bottomRight: markerCenter(768, 368),
      },
    }
  })
}

export async function sampleViewportPixels(
  page: import('@playwright/test').Page,
  points: Array<{ x: number; y: number }>,
) {
  const screenshot = await page.screenshot()
  const source = `data:image/png;base64,${screenshot.toString('base64')}`
  return page.evaluate(async ({ dataUrl, samples }) => {
    const image = new Image()
    image.src = dataUrl
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no screenshot canvas context')
    context.drawImage(image, 0, 0)
    return samples.map((point) => Array.from(context.getImageData(
      Math.round(point.x),
      Math.round(point.y),
      1,
      1,
    ).data))
  }, { dataUrl: source, samples: points })
}

export function cropMarkerColorSignatures(pixels: number[][]) {
  return pixels.map(([red, green, blue]) => ([
    ['r', red],
    ['g', green],
    ['b', blue],
  ] as const).sort((left, right) => right[1] - left[1]).map(([channel]) => channel).join(''))
}

export async function observeCropDraftCommits(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>(
      '[data-testid="freeform-image-crop-overlay"]',
    )
    if (!overlay) throw new Error('crop overlay missing')
    const testWindow = window as typeof window & {
      __cropCommitObserver?: MutationObserver
    }
    testWindow.__cropCommitObserver?.disconnect()
    document.documentElement.dataset.cropDomCommitCount = '0'
    const observer = new MutationObserver((records) => {
      const current = Number(document.documentElement.dataset.cropDomCommitCount ?? '0')
      document.documentElement.dataset.cropDomCommitCount = String(current + records.length)
    })
    observer.observe(overlay, {
      attributes: true,
      attributeFilter: ['data-crop-draft-key'],
    })
    testWindow.__cropCommitObserver = observer
  })
}

export function cropGeometryOf(value: Awaited<ReturnType<typeof readCropOverlayDraft>>) {
  return { frame: value.frame, image: value.image }
}

export async function dispatchCropPointerGesture(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
  pointerId: number,
  delta: { x: number; y: number },
  pointerType: 'mouse' | 'touch' | 'pen' = 'mouse',
) {
  const box = await locator.boundingBox()
  expect(box).toBeTruthy()
  const start = {
    x: box!.x + box!.width / 2,
    y: box!.y + box!.height / 2,
  }
  const end = { x: start.x + delta.x, y: start.y + delta.y }
  await locator.dispatchEvent('pointerdown', {
    pointerId,
    pointerType,
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ pointerId: id, pointerType: type, start: from, end: to }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: id,
      pointerType: type,
      isPrimary: true,
      buttons: 1,
      clientX: to.x,
      clientY: to.y,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: id,
      pointerType: type,
      isPrimary: true,
      clientX: to.x,
      clientY: to.y,
    }))
    void from
  }, { pointerId, pointerType, start, end })
}

export async function installCropDraftObserver(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>(
      '[data-testid="freeform-image-crop-overlay"]',
    )
    if (!overlay) throw new Error('crop overlay missing')
    const testWindow = window as typeof window & {
      __cropDraftObserver?: MutationObserver
    }
    testWindow.__cropDraftObserver?.disconnect()
    const snapshot = () => {
      const readBounds = (selector: string) => {
        const element = overlay.querySelector<HTMLElement>(selector)
        if (!element) throw new Error(`${selector} missing`)
        const left = Number.parseFloat(element.style.left)
        const top = Number.parseFloat(element.style.top)
        const width = Number.parseFloat(element.style.width)
        const height = Number.parseFloat(element.style.height)
        return { left, top, right: left + width, bottom: top + height }
      }
      document.documentElement.dataset.cropObservedDraft = JSON.stringify({
        frame: readBounds('.freeform-image-crop-frame'),
        image: readBounds('.freeform-image-crop-dim'),
      })
    }
    snapshot()
    const observer = new MutationObserver(snapshot)
    observer.observe(overlay, {
      attributes: true,
      subtree: true,
      attributeFilter: ['style', 'data-crop-draft-key'],
    })
    testWindow.__cropDraftObserver = observer
  })
}

export async function readObservedCropDraft(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const value = document.documentElement.dataset.cropObservedDraft
    if (!value) throw new Error('observed crop draft missing')
    return JSON.parse(value) as {
      frame: { left: number; top: number; right: number; bottom: number }
      image: { left: number; top: number; right: number; bottom: number }
    }
  })
}

export async function beginPendingCropPointerMove(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
  pointerId: number,
  delta: { x: number; y: number },
) {
  const box = await locator.boundingBox()
  expect(box).toBeTruthy()
  const start = {
    x: box!.x + box!.width / 2,
    y: box!.y + box!.height / 2,
  }
  await locator.dispatchEvent('pointerdown', {
    pointerId,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ id, from, move }) => {
    const testWindow = window as typeof window & {
      __releaseLateCropFrame?: () => void
    }
    const nativeRequest = window.requestAnimationFrame.bind(window)
    const nativeCancel = window.cancelAnimationFrame.bind(window)
    const heldFrameId = 2_000_000_001
    let heldFrame: FrameRequestCallback | null = null
    let requested = false
    document.documentElement.dataset.cropFrameCanceled = 'false'
    window.requestAnimationFrame = (callback) => {
      requested = true
      heldFrame = callback
      window.requestAnimationFrame = nativeRequest
      return heldFrameId
    }
    window.cancelAnimationFrame = (frameId) => {
      if (frameId === heldFrameId) {
        document.documentElement.dataset.cropFrameCanceled = 'true'
        window.cancelAnimationFrame = nativeCancel
        return
      }
      nativeCancel(frameId)
    }
    testWindow.__releaseLateCropFrame = () => {
      window.requestAnimationFrame = nativeRequest
      window.cancelAnimationFrame = nativeCancel
      const callback = heldFrame
      heldFrame = null
      callback?.(performance.now())
    }
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: id,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: 1,
      clientX: from.x + move.x,
      clientY: from.y + move.y,
    }))
    if (!requested) {
      window.requestAnimationFrame = nativeRequest
      window.cancelAnimationFrame = nativeCancel
      throw new Error('crop move did not request an animation frame')
    }
  }, { id: pointerId, from: start, move: delta })
  return start
}

export async function releaseLateCropFrame(
  page: import('@playwright/test').Page,
  pointerId: number,
  point: { x: number; y: number },
) {
  await page.evaluate(({ id, position }) => {
    const testWindow = window as typeof window & {
      __releaseLateCropFrame?: () => void
    }
    const release = testWindow.__releaseLateCropFrame
    delete testWindow.__releaseLateCropFrame
    release?.()
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: id,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: position.x,
      clientY: position.y,
    }))
  }, { id: pointerId, position: point })
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

export function panelLiveRegion(page: import('@playwright/test').Page) {
  return page.locator('[data-testid="freeform-layer-live"]')
}

interface StageGeometry {
  rulerTop: number
  rulerLeft: number
  artboardLeft: number
  artboardTop: number
  artboardRight: number
  artboardBottom: number
}

export async function stageGeometry(
  page: import('@playwright/test').Page,
): Promise<StageGeometry> {
  await page.getByTestId('freeform-canvas').waitFor({ state: 'attached' })
  return page.evaluate(() => {
    // Rulers are off by default; without them the stage's own corner stands in.
    const rulerX = document.querySelector('[data-testid="freeform-ruler-x"]')
      ?? document.querySelector('.freeform-stage-viewport')
    const artboard = document.querySelector('[data-testid="freeform-canvas"]')
    if (!rulerX || !artboard) throw new Error('stage or artboard missing')
    const ruler = rulerX.getBoundingClientRect()
    const board = artboard.getBoundingClientRect()
    return {
      rulerTop: ruler.top,
      rulerLeft: ruler.left,
      artboardLeft: board.left,
      artboardTop: board.top,
      artboardRight: board.right,
      artboardBottom: board.bottom,
    }
  })
}

export async function dragGuideFromRuler(
  page: import('@playwright/test').Page,
  axis: 'x' | 'y',
  worldPosition: number,
) {
  if (await page.getByTestId('freeform-ruler-x').count() === 0) {
    await page.getByTestId('freeform-rulers-toggle').click()
  }
  await page.getByTestId('freeform-ruler-x').waitFor({ state: 'attached' })
  const geometry = await stageGeometry(page)
  const scale = await freeformCanvasScale(page)
  const dropX = axis === 'x'
    ? geometry.artboardLeft + worldPosition * scale
    : geometry.artboardLeft + 200 * scale
  const dropY = axis === 'y'
    ? geometry.artboardTop + worldPosition * scale
    : geometry.artboardTop + 200 * scale
  const startX = axis === 'x' ? dropX : geometry.rulerLeft + 10
  const startY = axis === 'y' ? dropY : geometry.rulerTop + 10
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move((startX + dropX) / 2, (startY + dropY) / 2)
  await page.mouse.move(dropX, dropY)
  await page.mouse.up()
}
