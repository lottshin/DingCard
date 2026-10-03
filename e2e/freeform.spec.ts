import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import {
  groupLocal,
  multiply,
  sceneNodeLocalMatrix,
  sceneNodesBoundsInParent,
  transformPoint,
  transformVector,
} from '../src/freeform/sceneTransform'
import type { FreeformSceneNode } from '../src/freeform/types'
import { duplicateCurrentPage, fitFreeformCanvas, openPageMenu } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
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
})

const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const TEST_PNG_DATA_URL = `data:image/png;base64,${TEST_PNG.toString('base64')}`
const WIDE_TEST_SVG = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
    <rect width="800" height="400" fill="#f8fafc" />
    <path d="M0 200h800M400 0v400" stroke="#64748b" stroke-width="8" />
    <rect x="8" y="8" width="48" height="48" fill="#ff1744" />
    <rect x="744" y="8" width="48" height="48" fill="#00c853" />
    <rect x="8" y="344" width="48" height="48" fill="#2962ff" />
    <rect x="744" y="344" width="48" height="48" fill="#d500f9" />
  </svg>
`)
const WIDE_TEST_SVG_DATA_URL = `data:image/svg+xml;base64,${WIDE_TEST_SVG.toString('base64')}`

function imageCropTransformDraft() {
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

function nestedV3Draft() {
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

function nestedPropertyMatrixDraft() {
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

function groupingDraft() {
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

function scopeNavigationDraft() {
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

function crossScopeClipboardDraft() {
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

function textScopeDraft() {
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

function offCenterScopeDraft() {
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

function deepLayerBranch(depth: number) {
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

async function pngPixelDigest(
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

async function freeformCanvasScale(page: import('@playwright/test').Page) {
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

async function locatorOwnsPoint(
  locator: import('@playwright/test').Locator,
  x: number,
  y: number,
) {
  return locator.evaluate((node, point) => {
    const hit = document.elementFromPoint(point.x, point.y)
    return Boolean(hit && (hit === node || node.contains(hit)))
  }, { x, y })
}

async function freeformStageMetrics(page: import('@playwright/test').Page) {
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

async function expectFreeformCanvasMatchesZoom(
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

async function setFreeformZoom(page: import('@playwright/test').Page, target: number) {
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

async function selectFreeformPagePreset(
  page: import('@playwright/test').Page,
  ratio: '1:1' | '9:16' | '16:9',
) {
  await page.getByTestId('page-size-trigger').click()
  await page.getByTestId('page-size-popover').getByRole('button', { name: ratio, exact: true }).click()
}

async function applyFreeformCustomSize(
  page: import('@playwright/test').Page,
  width: number,
  height: number,
) {
  await page.getByTestId('page-size-trigger').click()
  await page.getByLabel('宽度 px').fill(String(width))
  await page.getByLabel('高度 px').fill(String(height))
  await page.getByRole('button', { name: '应用尺寸', exact: true }).click()
}

async function freeformElementBoxes(page: import('@playwright/test').Page) {
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

/** Sign up from the editor and move the guest's canvas (saved on this device) into the new account. */
async function signUpToSave(page: import('@playwright/test').Page, username: string) {
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存到本机')
  await page.getByTestId('account-login').click()
  await registerUser(page, username)
  await page.getByTestId('guest-move-confirm').click()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
}

/** Open the export menu under 导出 (no-op when it is already open). */
async function openExportMenu(page: import('@playwright/test').Page) {
  const panel = page.getByTestId('freeform-export-options')
  if (!(await panel.isVisible())) await page.getByTestId('freeform-export').click()
  await expect(panel).toBeVisible()
}

/** The signed-in user's id in the local store. */
async function currentUserId(page: import('@playwright/test').Page): Promise<string> {
  const id = await page.evaluate(() => localStorage.getItem('slicer.session.v1'))
  if (!id) throw new Error('no signed-in user')
  return id
}

/** Store drafts straight into the signed-in user's projects, then open the first one. */
async function openStoredDrafts(page: import('@playwright/test').Page, drafts: unknown[]) {
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

async function installShapeFillFileReaderGate(page: import('@playwright/test').Page) {
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

async function expectShapeFillFileReaderStarted(
  page: import('@playwright/test').Page,
  expected = 1,
) {
  await expect.poll(() => page.evaluate(() => (
    window as ShapeFillGateWindow
  ).__shapeFillFileReaderGate?.started)).toBe(expected)
}

async function releaseShapeFillFileReaderGate(
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

async function restoreShapeFillFileReaderGate(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const gateWindow = window as ShapeFillGateWindow
    const state = gateWindow.__shapeFillFileReaderGate
    if (state) FileReader.prototype.readAsDataURL = state.original
    delete gateWindow.__shapeFillFileReaderGate
  })
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
  await positionInputs.nth(0).press('Enter')
  await positionInputs.nth(1).fill(String(y))
  await positionInputs.nth(1).press('Enter')
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
  await positionInputs.nth(0).press('Enter')
  await positionInputs.nth(1).fill(String(y))
  await positionInputs.nth(1).press('Enter')
  await positionInputs.nth(2).fill(String(width))
  await positionInputs.nth(2).press('Enter')
  await positionInputs.nth(3).fill(String(height))
  await positionInputs.nth(3).press('Enter')
}

async function openFreeform(page: import('@playwright/test').Page) {
  await page.goto('/#/edit/canvas')
}

async function openNestedV3Draft(
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
async function waitForCanvasFit(page: import('@playwright/test').Page) {
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
async function withToolPanel(
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

async function insertText(page: import('@playwright/test').Page) {
  await withToolPanel(page, 'text', (panel) => panel.getByTestId('insert-text').click())
}

async function insertShape(
  page: import('@playwright/test').Page,
  label: '矩形' | '圆形' | '三角形' | '五角星' | '六边形' = '矩形',
) {
  await withToolPanel(page, 'elements', (panel) => panel
    .getByRole('group', { name: '形状' })
    .getByRole('button', { name: label, exact: true })
    .click())
}

async function insertImageElementAndShapeFill(page: import('@playwright/test').Page) {
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

async function expectFreeformImagesDecoded(page: import('@playwright/test').Page) {
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

async function setRangeValue(
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

async function insertLine(
  page: import('@playwright/test').Page,
  label: '直线' | '箭头',
) {
  await withToolPanel(page, 'elements', (panel) => panel
    .getByRole('group', { name: '线条' })
    .getByRole('button', { name: label, exact: true })
    .click())
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
  await expectSections(['geometry', 'fill', 'appearance', 'arrange', 'danger'])
  const imageFill = page.getByTestId('inspector-fill')
  await expect(imageFill.getByRole('button', { name: '填满', exact: true })).toBeVisible()
  await expect(imageFill.getByRole('button', { name: '适应', exact: true })).toBeVisible()
  await expect(imageFill.getByTestId('freeform-paint-field')).toHaveCount(0)
  await expect(page.getByTestId('inspector-stroke')).toHaveCount(0)

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
  const radiusInput = appearance.getByLabel('圆角', { exact: true })
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
  await expect(shapeView).toHaveCSS('border-radius', '32px')
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
  await expect(triangleView).toHaveCSS('filter', /drop-shadow/)

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

test('each editor top bar carries theme and account state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/edit/md')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await expect(page.getByTestId('app-header')).toHaveCount(1)
  await expect(page.getByTestId('app-header')).toHaveAttribute('data-system', 'markdown-card')

  await page.getByTestId('theme-toggle').click()
  const theme = await page.locator('html').getAttribute('data-theme')
  expect(theme).toMatch(/^(light|dark)$/)

  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('app-header')).toHaveCount(1)
  await expect(page.getByTestId('app-header')).toHaveAttribute('data-system', 'freeform-slide')
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme!)

  await page.getByTestId('account-login').click()
  await expect(page.locator('.form-note')).toContainText('仅保存在此浏览器本地')
  await registerUser(page, `header-${Date.now()}`)

  await expect(page.getByTestId('account-menu')).toBeVisible()
  await expect(page.locator('html')).not.toHaveClass(/theme-anim/)
  const accountBackground = await page
    .getByTestId('account-menu')
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  const primaryExportBackground = await page
    .getByTestId('freeform-export')
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  const accentBackground = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--accent)'
    document.body.append(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  })
  expect(accountBackground).not.toBe(accentBackground)
  expect(accountBackground).not.toBe(primaryExportBackground)
  await page.goto('/#/edit/md')
  await expect(page.getByTestId('account-menu')).toBeVisible()
  await page.getByTestId('account-menu').click()
  await expect(page.getByRole('menu').getByTestId('account-logout')).toBeVisible()
})

test('malformed account storage falls back to a logged-out app shell', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => {
    localStorage.setItem('slicer.users.v1', '{}')
    localStorage.setItem('slicer.session.v1', 'broken-session')
  })
  await page.reload()

  await expect(page.getByTestId('app-header')).toBeVisible()
  await expect(page.getByTestId('account-login')).toBeVisible()
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
})

test('blocked browser storage keeps the app shell and theme toggle usable', async ({ page }) => {
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException('storage blocked', 'SecurityError')
    }
    Storage.prototype.getItem = blocked
    Storage.prototype.setItem = blocked
    Storage.prototype.removeItem = blocked
  })
  await page.goto('/#/edit')

  const html = page.locator('html')
  await expect(page.getByTestId('app-header')).toBeVisible()
  const initialTheme = await html.getAttribute('data-theme')
  expect(initialTheme).toMatch(/^(light|dark)$/)

  await page.getByTestId('theme-toggle').click()
  await expect(html).toHaveAttribute('data-theme', initialTheme === 'light' ? 'dark' : 'light')
  await expect(page.getByTestId('app-header')).toBeVisible()
})

test('only the open editor exposes its toolbar, with one primary action in the top bar', async ({ page }) => {
  await page.goto('/#/edit/md')

  const markdownToolbar = page.getByTestId('markdown-toolbar')
  const header = page.getByTestId('app-header')
  await expect(markdownToolbar).toBeVisible()
  await expect(markdownToolbar).toHaveAttribute('role', 'toolbar')
  await expect(markdownToolbar).toHaveCSS('height', '50px')
  await expect(page.getByTestId('freeform-toolbar')).toHaveCount(0)
  await expect(page.locator('.workspace-panel:not([hidden]) .toolbar-primary')).toHaveCount(1)
  await expect(header).toHaveCSS('height', '52px')
  await expect(markdownToolbar.locator('.bar-btn').first()).toHaveCSS('height', '32px')
  await expect(markdownToolbar.locator('.sel-trigger').first()).toHaveCSS('height', '32px')
  await expect(header.locator('.toolbar-primary')).toHaveCSS('height', '32px')
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
    header.locator('.toolbar-primary'),
  ]
  for (const control of focusableControls) {
    await control.focus()
    await expect(control).toHaveCSS('outline-color', accentColor)
    await expect(control).toHaveCSS('outline-style', 'solid')
    await expect(control).toHaveCSS('outline-width', '2px')
  }

  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('markdown-toolbar')).toBeHidden()
  const freeformToolbar = page.getByTestId('freeform-toolbar')
  await expect(freeformToolbar).toBeVisible()
  await expect(freeformToolbar).toHaveAttribute('role', 'toolbar')
  // The freeform tools ride in the top bar instead of a second row.
  await expect(page.getByTestId('app-header').getByTestId('freeform-toolbar')).toBeVisible()
  await expect(freeformToolbar).toHaveCSS('height', '44px')
  await expect(page.getByTestId('freeform-export')).toBeVisible()
  await expect(page.locator('.workspace-panel:not([hidden]) .toolbar-primary')).toHaveCount(1)
  const tools = page.getByRole('navigation', { name: '插入' })
  for (const testId of ['freeform-template-button', 'freeform-text-tool', 'freeform-images-tool', 'freeform-elements-tool', 'freeform-layers-tool']) {
    await expect(tools.getByTestId(testId)).toBeVisible()
    const box = await tools.getByTestId(testId).boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  await expect(freeformToolbar.getByTestId('freeform-text-tool')).toHaveCount(0)
  await expect(page.getByTestId('freeform-export')).toHaveCSS('height', '32px')
  await expect(page.locator('.freeform-thumb.on')).toHaveAttribute('aria-current', 'page')
})

for (const viewport of [
  // The settings panel is 21% of the window, between 256px and 304px.
  { name: 'wide', width: 1440, height: 900, toolsWidth: 72, inspectorWidth: 302.4 },
  { name: 'compact', width: 1024, height: 768, toolsWidth: 64, inspectorWidth: 256 },
]) {
  test(`freeform chrome fits the ${viewport.name} desktop viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openFreeform(page)

    const documentOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(documentOverflow).toBeLessThanOrEqual(0)

    const main = page.locator('.freeform-main')
    const mainOverflow = await main.evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(mainOverflow).toBeLessThanOrEqual(0)
    await expect(main).toHaveCSS('overflow-x', 'hidden')
    await expect(page.getByTestId('freeform-export')).toBeVisible()
    await expect(page.locator('.freeform-inspector')).toBeVisible()
    await expect(page.locator('.freeform-stage-scroll')).toBeVisible()

    const toolsBox = await page.locator('.freeform-tools').boundingBox()
    const stageBox = await page.locator('.freeform-stage-pane').boundingBox()
    const pagesBox = await page.locator('.freeform-rail').boundingBox()
    const inspectorBox = await page.locator('.freeform-inspector').boundingBox()
    expect(toolsBox?.width).toBeCloseTo(viewport.toolsWidth, 0)
    expect(inspectorBox?.width).toBeCloseTo(viewport.inspectorWidth, 0)
    // The page list runs down between the tools and the stage, as tall as the stage;
    // nothing sits under the stage.
    expect(pagesBox!.x).toBeCloseTo(toolsBox!.x + toolsBox!.width, 0)
    expect(pagesBox!.x + pagesBox!.width).toBeCloseTo(stageBox!.x, 0)
    expect(pagesBox!.height).toBeCloseTo(stageBox!.height, 0)
    expect(stageBox!.y + stageBox!.height).toBeCloseTo(viewport.height, 0)
    await expect(page.locator('.freeform-slide-list')).toHaveCSS('overflow-y', 'auto')
    await expect(page.locator('.freeform-stage-scroll')).toHaveCSS('overflow-y', 'auto')
    await expect(page.locator('.freeform-inspector')).toHaveCSS('overflow-y', 'auto')

    const themeBox = await page.getByTestId('theme-toggle').boundingBox()
    expect(themeBox?.width).toBeGreaterThanOrEqual(44)
    expect(themeBox?.height).toBeGreaterThanOrEqual(44)
    for (const name of ['缩小画布', '放大画布']) {
      const zoomBox = await page.getByRole('button', { name }).boundingBox()
      expect(zoomBox?.width).toBeGreaterThanOrEqual(44)
      expect(zoomBox?.height).toBeGreaterThanOrEqual(44)
    }
  })
}

test('freeform layout stacks the stage above the panels on narrow viewports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFreeform(page)

  // No horizontal overflow: the toolbar scrolls on its own, nothing sticks out.
  const documentOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(documentOverflow).toBeLessThanOrEqual(0)
  const main = page.locator('.freeform-main')
  const mainOverflow = await main.evaluate((element) => element.scrollWidth - element.clientWidth)
  expect(mainOverflow).toBeLessThanOrEqual(0)

  // The stage keeps a usable width instead of being crushed between the panels.
  const stage = await page.locator('.freeform-stage-pane').boundingBox()
  expect(stage?.width).toBeGreaterThanOrEqual(330)
  expect(stage?.height).toBeGreaterThanOrEqual(300)

  // The rail and inspector stack below the stage at full width.
  const rail = await page.locator('.freeform-rail').boundingBox()
  const inspector = await page.locator('.freeform-inspector').boundingBox()
  expect(rail?.width).toBeGreaterThanOrEqual(330)
  expect(rail?.y).toBeGreaterThan(stage!.y + stage!.height - 1)
  expect(inspector?.width).toBeGreaterThanOrEqual(330)
  expect(inspector?.y).toBeGreaterThan(rail!.y)

  // Editing still works: insert a shape and see it selected in the inspector.
  await insertShape(page)
  await expect(page.getByTestId('inspector-geometry')).toBeVisible()
  await expect(page.locator('.freeform-shape')).toBeVisible()
})

test.describe('fit-relative freeform zoom', () => {
  test('withholds the canvas until the first active fit measurement', async ({ page }) => {
    await page.goto('/#/edit')
    await expect(page.getByTestId('freeform-canvas')).toHaveCount(0)

    await page.goto('/#/edit/canvas')

    await expect(page.getByTestId('freeform-canvas')).toBeVisible()
    await expect(page.locator('.freeform-stage-scroll')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByTestId('freeform-export')).toBeEnabled()
  })

  // The bottom edge keeps room for the zoom control in the corner.
  for (const viewport of [
    { name: 'wide', width: 1440, height: 900, padding: 32, paddingBottom: 72 },
    { name: 'compact', width: 1024, height: 768, padding: 24, paddingBottom: 72 },
  ]) {
    test(`fits common ratios at 100% in the ${viewport.name} stage`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await openFreeform(page)
      await expect(page.getByTestId('freeform-zoom-value')).toHaveText('100%')

      for (const ratio of ['1:1', '9:16', '16:9'] as const) {
        await selectFreeformPagePreset(page, ratio)
        const metrics = await expectFreeformCanvasMatchesZoom(page, 100, true)
        expect(metrics.paddingLeft).toBeCloseTo(viewport.padding, 3)
        expect(metrics.paddingRight).toBeCloseTo(viewport.padding, 3)
        expect(metrics.paddingTop).toBeCloseTo(viewport.padding, 3)
        expect(metrics.paddingBottom).toBeCloseTo(viewport.paddingBottom, 3)
      }
    })

    test(`fits minimum and maximum custom pages in the ${viewport.name} stage`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await openFreeform(page)

      await applyFreeformCustomSize(page, 128, 128)
      await expectFreeformCanvasMatchesZoom(page, 100, true)

      await applyFreeformCustomSize(page, 4096, 4096)
      await expectFreeformCanvasMatchesZoom(page, 100, true)
    })
  }

  test('keeps 50% smaller and makes both vertical edges reachable at 110%', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await selectFreeformPagePreset(page, '9:16')
    const fitted = await expectFreeformCanvasMatchesZoom(page, 100, true)

    await setFreeformZoom(page, 50)
    const half = await expectFreeformCanvasMatchesZoom(page, 50, true)
    expect(half.renderedHeight).toBeCloseTo(fitted.renderedHeight / 2, 0)

    await fitFreeformCanvas(page)
    await setFreeformZoom(page, 110)
    await expect
      .poll(async () => {
        const metrics = await freeformStageMetrics(page)
        return metrics.scrollHeight - metrics.clientHeight
      })
      .toBeGreaterThan(1)

    const stage = page.locator('.freeform-stage-scroll')
    await stage.evaluate((node) => { node.scrollTop = 0 })
    const atTop = await freeformStageMetrics(page)
    expect(atTop.canvasTop).toBeCloseTo(atTop.stageTop + atTop.paddingTop, 0)

    await stage.evaluate((node) => { node.scrollTop = node.scrollHeight })
    await expect.poll(async () => (await freeformStageMetrics(page)).scrollTop).toBeGreaterThan(0)
    const atBottom = await freeformStageMetrics(page)
    // Scroll offsets are whole pixels, so a fractional canvas height can leave half a pixel.
    expect(Math.abs(atBottom.canvasBottom - (atBottom.stageBottom - atBottom.paddingBottom))).toBeLessThanOrEqual(0.5)
  })

  test('makes both horizontal edges reachable at 110%', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await selectFreeformPagePreset(page, '16:9')
    await setFreeformZoom(page, 110)
    await expect
      .poll(async () => {
        const metrics = await freeformStageMetrics(page)
        return metrics.scrollWidth - metrics.clientWidth
      })
      .toBeGreaterThan(1)

    const stage = page.locator('.freeform-stage-scroll')
    await stage.evaluate((node) => { node.scrollLeft = 0 })
    const atLeft = await freeformStageMetrics(page)
    expect(atLeft.canvasLeft).toBeCloseTo(atLeft.stageLeft + atLeft.paddingLeft, 0)

    await stage.evaluate((node) => { node.scrollLeft = node.scrollWidth })
    await expect.poll(async () => (await freeformStageMetrics(page)).scrollLeft).toBeGreaterThan(0)
    const atRight = await freeformStageMetrics(page)
    expect(Math.abs(atRight.canvasRight - (atRight.stageRight - atRight.paddingRight))).toBeLessThanOrEqual(0.5)
  })

  test('enforces zoom bounds and resets the middle control to 100%', async ({ page }) => {
    await openFreeform(page)
    const shrink = page.getByRole('button', { name: '缩小画布', exact: true })
    const enlarge = page.getByRole('button', { name: '放大画布', exact: true })
    const value = page.getByTestId('freeform-zoom-value')

    await setFreeformZoom(page, 10)
    await expect(shrink).toBeDisabled()
    await expect(enlarge).toBeEnabled()

    await setFreeformZoom(page, 400)
    await expect(enlarge).toBeDisabled()
    await expect(shrink).toBeEnabled()

    await fitFreeformCanvas(page)
    await expect(value).toHaveText('100%')
    await expect(shrink).toBeEnabled()
    await expect(enlarge).toBeEnabled()
  })

  test('preserves 150% while the viewport, page ratio, and active workspace change', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await setFreeformZoom(page, 150)
    const wide = await expectFreeformCanvasMatchesZoom(page, 150, false)

    await page.setViewportSize({ width: 1024, height: 768 })
    const compact = await expectFreeformCanvasMatchesZoom(page, 150, false)
    expect(compact.renderedWidth).not.toBeCloseTo(wide.renderedWidth, 0)
    await expect(page.getByTestId('freeform-zoom-value')).toHaveText('150%')

    await selectFreeformPagePreset(page, '9:16')
    await expectFreeformCanvasMatchesZoom(page, 150, false)
    await expect(page.getByTestId('freeform-zoom-value')).toHaveText('150%')

    await page.goto('/#/edit/md')
    await page.goto('/#/edit/canvas')
    await expectFreeformCanvasMatchesZoom(page, 150, false)
    await expect(page.getByTestId('freeform-zoom-value')).toHaveText('150%')
  })

  test('uses the live render scale for dragging and resizing at 150%', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 100)
    await setFreeformZoom(page, 150)
    const scale = await freeformCanvasScale(page)

    const element = page.getByTestId('freeform-element')
    const elementBox = await element.boundingBox()
    expect(elementBox).toBeTruthy()
    const dragStart = {
      x: elementBox!.x + elementBox!.width / 2,
      y: elementBox!.y + elementBox!.height / 2,
    }
    await page.mouse.move(dragStart.x, dragStart.y)
    await page.mouse.down()
    await page.mouse.move(dragStart.x + 120 * scale, dragStart.y + 80 * scale)
    await page.mouse.up()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 220, y: 180, width: 120, height: 100 },
    ])

    const resizeHandle = page.locator('.element-resize')
    const handleBox = await resizeHandle.boundingBox()
    expect(handleBox).toBeTruthy()
    const resizeStart = {
      x: handleBox!.x + handleBox!.width / 2,
      y: handleBox!.y + handleBox!.height / 2,
    }
    await page.mouse.move(resizeStart.x, resizeStart.y)
    await page.mouse.down()
    await page.mouse.move(resizeStart.x + 60 * scale, resizeStart.y + 40 * scale)
    await page.mouse.up()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 220, y: 180, width: 180, height: 140 },
    ])
  })
})

test('dark mode keeps freeform chrome controls and popovers legible', async ({ page }) => {
  await openFreeform(page)
  const html = page.locator('html')
  if ((await html.getAttribute('data-theme')) !== 'dark') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(html).not.toHaveClass(/theme-anim/)

  const toolbar = page.getByTestId('freeform-toolbar')
  // The tools sit on the top bar, which carries the surface and the divider.
  const header = page.getByTestId('app-header')
  await expect(header).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(header).not.toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)')
  const undoButton = toolbar.getByRole('button', { name: '撤销', exact: true })
  await expect(undoButton).toBeDisabled()
  const undoOpacity = Number(await undoButton.evaluate((button) => getComputedStyle(button).opacity))
  expect(undoOpacity).toBeGreaterThanOrEqual(0.35)
  expect(undoOpacity).toBeLessThan(1)
  await expect(undoButton).toHaveCSS('cursor', 'not-allowed')

  // The only page can't be deleted; its menu says so by greying the entry out.
  const pageMenu = await openPageMenu(page, 0)
  const deletePageItem = pageMenu.getByTestId('freeform-slide-context-menu-delete')
  await expect(deletePageItem).toBeDisabled()
  const enabledColor = await pageMenu.getByTestId('freeform-slide-context-menu-duplicate')
    .evaluate((item) => getComputedStyle(item).color)
  await expect(deletePageItem).not.toHaveCSS('color', enabledColor)
  await page.keyboard.press('Escape')
  await expect(pageMenu).toHaveCount(0)

  const pageTitleColors = await page.locator('.freeform-thumb-title').evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element.closest('.freeform-rail')!).backgroundColor,
  }))
  expect(contrastRatio(pageTitleColors.foreground, pageTitleColors.background)).toBeGreaterThanOrEqual(4.5)


  await page.getByTestId('page-size-trigger').click()
  const pageSizePopover = page.getByTestId('page-size-popover')
  await expect(pageSizePopover).toBeVisible()
  const pageSizeColors = await pageSizePopover.locator('.page-size-popover-heading strong').evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element.closest('.page-size-popover')!).backgroundColor,
  }))
  expect(contrastRatio(pageSizeColors.foreground, pageSizeColors.background)).toBeGreaterThanOrEqual(4.5)
  await page.keyboard.press('Escape')

  await page.getByTestId('freeform-elements-tool').click()
  const rectangle = page.getByTestId('freeform-elements-drawer').getByRole('button', { name: '矩形', exact: true })
  const tileColors = await rectangle.evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element).backgroundColor,
  }))
  expect(contrastRatio(tileColors.foreground, tileColors.background)).toBeGreaterThanOrEqual(4.5)
  await rectangle.click()
  await page.getByTestId('freeform-elements-tool').click()

  const inspectorTitle = page.getByTestId('inspector-geometry').locator('.inspector-section-title')
  const inspectorColors = await inspectorTitle.evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element.closest('.freeform-inspector')!).backgroundColor,
  }))
  expect(contrastRatio(inspectorColors.foreground, inspectorColors.background)).toBeGreaterThanOrEqual(4.5)

  for (const locator of [
    page.locator('.freeform-inspector .field-grid label').first(),
    page.locator('.freeform-inspector .field-grid .color-field').first(),
  ]) {
    const colors = await locator.evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element.closest('.freeform-inspector')!).backgroundColor,
    }))
    expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5)
  }

  const shapeFill = page.getByTestId('shape-fill-paint')
  await shapeFill.getByTestId('paint-mode-linear-gradient').click()
  const range = shapeFill.getByTestId('paint-gradient-angle')
  await expect(range).toBeVisible()
  await expect(range).toHaveCSS('appearance', 'none')
  await expect(range).toHaveCSS('background-image', /linear-gradient/)
})

test('freeform chrome provides visible pressed feedback', async ({ page }) => {
  await openFreeform(page)
  const trigger = page.getByTestId('freeform-elements-tool')
  const box = await trigger.boundingBox()
  expect(box).toBeTruthy()
  const idleTransform = await trigger.evaluate((element) => getComputedStyle(element).transform)

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  const pressedTransform = await trigger.evaluate((element) => getComputedStyle(element).transform)
  expect(pressedTransform).not.toBe(idleTransform)
  await page.mouse.up()
  await page.keyboard.press('Escape')
})

test('reduced motion suppresses theme animation transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/edit')
  await page.evaluate(() => document.documentElement.classList.add('theme-anim'))

  const longestTransitionMs = await page.getByTestId('app-header').evaluate((element) => {
    const toMilliseconds = (value: string) =>
      value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000
    return Math.max(
      ...getComputedStyle(element)
        .transitionDuration.split(',')
        .map((value) => toMilliseconds(value.trim())),
    )
  })

  expect(longestTransitionMs).toBeLessThanOrEqual(0.01)
})

test('keeps artwork chrome-free on a warm stage in light and dark themes', async ({ page }) => {
  await openFreeform(page)
  const html = page.locator('html')
  const artboard = page.getByTestId('freeform-canvas')
  const stageBox = page.locator('.freeform-stage-box')
  const stage = page.locator('.freeform-stage-scroll')

  for (const theme of ['light', 'dark'] as const) {
    if ((await html.getAttribute('data-theme')) !== theme) {
      await page.getByTestId('theme-toggle').click()
    }
    await expect(html).toHaveAttribute('data-theme', theme)
    await expect(artboard).toHaveCSS('box-shadow', 'none')
    await expect(stageBox).not.toHaveCSS('box-shadow', 'none')

    const channels = await stage.evaluate((element) => {
      const values = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number)
      if (!values || values.length !== 3) throw new Error('stage background must be an RGB color')
      return values
    })
    expect(channels[0]).toBeGreaterThanOrEqual(channels[1])
    expect(channels[1]).toBeGreaterThanOrEqual(channels[2])
    expect(channels[0] - channels[2]).toBeGreaterThanOrEqual(2)
  }
})

test('freeform visual system uses approved runtime tokens and neutral stage rules', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openFreeform(page)

  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return Object.fromEntries(
      [
        '--app-header-height',
        '--workspace-toolbar-height',
        '--control-height',
        '--control-radius',
        '--panel-radius',
      ].map((name) => [name, style.getPropertyValue(name).trim()]),
    )
  })
  expect(tokens).toEqual({
    '--app-header-height': '52px',
    '--workspace-toolbar-height': '50px',
    '--control-height': '32px',
    '--control-radius': '8px',
    '--panel-radius': '10px',
  })

  const mainColumns = await page.locator('.freeform-main').evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      columns: style.gridTemplateColumns.split(' '),
      gap: style.columnGap,
      padding: style.padding,
      overflowX: style.overflowX,
    }
  })
  expect(mainColumns.columns.at(0)).toBe('72px')
  expect(Number.parseFloat(mainColumns.columns.at(-1)!)).toBeCloseTo(302.4, 0)
  expect(mainColumns.gap).toBe('0px')
  expect(mainColumns.padding).toBe('0px')
  expect(mainColumns.overflowX).toBe('hidden')
  // The desk under the page is a quiet dot grid.
  await expect(page.locator('.freeform-stage-scroll')).toHaveCSS('background-image', /radial-gradient/)
  // The active page is outlined on the page itself (2px accent drop-shadow ring), not the thumb button.
  await expect(page.locator('.freeform-thumb.on .freeform-thumb-art'))
    .toHaveCSS('filter', /drop-shadow\(rgb\([^)]*\) 2px 0px 0px\)/)
})

test('arrow keys in the language menu do not nudge selected freeform elements', async ({ page }) => {
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

  const languageMenu = page.getByTestId('language-menu')
  await languageMenu.focus()
  await page.keyboard.press('ArrowDown')
  const menu = page.getByRole('menu', { name: '界面语言' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(languageMenu).toBeFocused()
  await expect(page.locator('html')).toHaveAttribute('data-workspace-tab-arrow-events', '0')
  await expect.poll(readPosition).toEqual(before)
})

test('account changes reset the open project', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const accountSuffix = Date.now()
  await insertText(page)
  await page.getByLabel('文本内容').fill('跨账户草稿内容')

  await signUpToSave(page, `draft-${accountSuffix}-a`)

  const slideStatus = page.getByTestId('editor-save-state')
  await expect(slideStatus).toHaveText('已保存')
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

  // Signing out leaves nothing of account A on screen: its work is saved, the canvas starts over.
  await page.getByTestId('account-menu').click()
  await page.getByTestId('account-logout').click()
  await expect(page.getByTestId('account-login')).toBeVisible()
  await expect(slideStatus).toHaveCount(0)
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(page.getByTestId('editor-title')).toHaveText('未命名设计')

  // Account B starts empty and gets nothing of A's until it edits.
  await page.getByTestId('account-login').click()
  await registerUser(page, `draft-${accountSuffix}-b`)
  await expect(page.getByTestId('account-menu')).toBeVisible()
  await insertText(page)
  await expect(slideStatus).toHaveText('已保存')

  const draftStores = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('slicer.drafts.'))
      .map((key) => ({
        key,
        ids: (JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ id: string }>).map(
          (draft) => draft.id,
        ),
        texts: (JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ document: { slides: Array<{ nodes: Array<{ text?: string }> }> } }>)
          .flatMap((draft) => draft.document.slides.flatMap((slide) => slide.nodes.map((node) => node.text ?? ''))),
      })),
  )
  expect(draftStores).toHaveLength(2)
  expect(draftStores.every((store) => store.ids.length === 1)).toBe(true)
  const allDraftIds = draftStores.flatMap((store) => store.ids)
  expect(allDraftIds).toContain(userADraftIds[0])
  expect(new Set(allDraftIds).size).toBe(allDraftIds.length)
  expect(draftStores.filter((store) => store.texts.includes('跨账户草稿内容'))).toHaveLength(1)
})

test('我的项目 imports a freeform document JSON and opens it', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await openFreeform(page)
  await page.getByTestId('account-login').click()
  await registerUser(page, `import-${Date.now()}`)

  const importedDocument = {
    documentVersion: 4,
    activeSlideId: 'import-slide-1',
    slides: [
      {
        id: 'import-slide-1',
        name: 'AI 生成页',
        width: 1080,
        height: 1440,
        background: { type: 'solid', color: '#ffffff' },
        nodes: [
          {
            id: 'import-text-1',
            name: '标题',
            locked: false,
            hidden: false,
            type: 'text',
            x: 80,
            y: 160,
            width: 800,
            height: 200,
            rotation: 0,
            scale: 1,
            text: 'AI 导入的标题',
            fontSize: 64,
            fontFamily: 'PingFang SC',
            textFill: { type: 'solid', color: '#18181b' },
            align: 'left',
            fontWeight: 'bold',
          },
        ],
      },
    ],
  }

  await page.goto('/#/projects')
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'ai-card.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedDocument)),
  })

  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(page.getByTestId('freeform-element')).toHaveCount(1)
  await expect(page.getByTestId('freeform-textbox')).toContainText('AI 导入的标题')

  await page.getByTestId('editor-home').click()
  await page.getByRole('link', { name: /^我的项目/ }).click()
  await expect(page.getByTestId('project-card')).toContainText('AI 生成页')
  await expect(page.getByTestId('project-card')).toContainText('自由编辑')
})

test('我的项目 import rejects invalid JSON with an error notice', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await openFreeform(page)
  await page.getByTestId('account-login').click()
  await registerUser(page, `import-bad-${Date.now()}`)

  await page.goto('/#/projects')
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('不是 JSON'),
  })

  await expect(page.getByRole('heading', { level: 1, name: '我的项目' })).toBeVisible()
  await expect(page.getByText('文件不是有效的 JSON')).toBeVisible()
})

test('我的项目 imports a v14 polyline document and renders its vertices', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await openFreeform(page)
  await page.getByTestId('account-login').click()
  await registerUser(page, `poly-${Date.now()}`)

  const importedDocument = {
    documentVersion: 14,
    activeSlideId: 'poly-slide-1',
    slides: [
      {
        id: 'poly-slide-1',
        name: '折线页',
        width: 1080,
        height: 1440,
        background: { type: 'solid', color: '#ffffff' },
        nodes: [
          {
            id: 'poly-line-1',
            name: '山脊',
            locked: false,
            hidden: false,
            type: 'line',
            x: 100,
            y: 200,
            width: 600,
            height: 300,
            rotation: 0,
            scale: 1,
            lineKind: 'line',
            stroke: '#17293c',
            strokeWidth: 10,
            startCap: 'arrow',
            endCap: 'dot',
            points: [
              { x: 0, y: 260 },
              { x: 150, y: 40 },
              { x: 300, y: 240 },
              { x: 450, y: 20 },
              { x: 600, y: 220 },
            ],
          },
          {
            id: 'poly-line-2',
            name: '普通箭头',
            locked: false,
            hidden: false,
            type: 'line',
            x: 140,
            y: 700,
            width: 500,
            height: 40,
            rotation: 0,
            scale: 1,
            lineKind: 'arrow',
            stroke: '#f97316',
            strokeWidth: 8,
          },
        ],
      },
    ],
  }

  await page.goto('/#/projects')
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'polyline.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedDocument)),
  })

  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(page.getByTestId('freeform-element')).toHaveCount(2)
  const polyline = page.getByTestId('freeform-polyline')
  await expect(polyline).toHaveAttribute(
    'points',
    '0,260 150,40 300,240 450,20 600,220',
  )
  await expect(polyline).toHaveAttribute('marker-start', /arrow-start/)
  await expect(polyline).toHaveAttribute('marker-end', /dot/)
  // A vertex-less line keeps rendering the classic single <line> element.
  await expect(page.locator('.freeform-line', { has: page.getByTestId('freeform-polyline') })).toHaveCount(1)
  await expect(page.locator('.freeform-line line')).toHaveCount(1)
  // Importing already made it a project.
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await expect(page.getByTestId('freeform-polyline')).toHaveAttribute(
    'points',
    '0,260 150,40 300,240 450,20 600,220',
  )
  await expect(page.getByTestId('freeform-polyline')).toHaveAttribute('marker-start', /arrow-start/)
})

test('polyline vertex handles drag vertices and double-click edits them', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await openFreeform(page)
  await page.getByTestId('account-login').click()
  await registerUser(page, `vertex-${Date.now()}`)

  const importedDocument = {
    documentVersion: 14,
    activeSlideId: 'vertex-slide-1',
    slides: [
      {
        id: 'vertex-slide-1',
        name: '顶点页',
        width: 1080,
        height: 1440,
        background: { type: 'solid', color: '#ffffff' },
        nodes: [
          {
            id: 'vertex-line-1',
            name: '山脊',
            locked: false,
            hidden: false,
            type: 'line',
            x: 200,
            y: 300,
            width: 600,
            height: 300,
            rotation: 0,
            scale: 1,
            lineKind: 'line',
            stroke: '#17293c',
            strokeWidth: 10,
            points: [
              { x: 0, y: 260 },
              { x: 200, y: 40 },
              { x: 400, y: 260 },
              { x: 600, y: 40 },
            ],
          },
        ],
      },
    ],
  }

  await page.goto('/#/projects')
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'vertex.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedDocument)),
  })
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()

  const polyline = page.getByTestId('freeform-polyline')
  const readPoints = async () => {
    const raw = await polyline.getAttribute('points')
    return (raw ?? '').split(' ').map((pair) => pair.split(',').map(Number))
  }

  // Selecting the polyline reveals one handle per vertex.
  await page.locator('[data-scene-node-id="vertex-line-1"]').click()
  const handle = (index: number) => page.getByTestId(`freeform-vertex-handle-${index}`)
  await expect(handle(0)).toBeVisible()
  await expect(handle(3)).toBeVisible()
  await expect(page.getByTestId('freeform-vertex-handle-4')).toHaveCount(0)

  // Drag vertex 1 toward the bottom right; only that vertex moves.
  const box = await handle(1).boundingBox()
  expect(box).toBeTruthy()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2 + 60, { steps: 4 })
  await page.mouse.up()
  const afterDrag = await readPoints()
  expect(afterDrag).toHaveLength(4)
  expect(afterDrag[0]).toEqual([0, 260])
  expect(afterDrag[1][0]).toBeGreaterThan(200)
  expect(afterDrag[1][1]).toBeGreaterThan(40)
  expect(afterDrag[2]).toEqual([400, 260])
  expect(afterDrag[3]).toEqual([600, 40])

  // Double-click near the midpoint of the first segment inserts a vertex there.
  const first = await handle(0).boundingBox()
  const second = await handle(1).boundingBox()
  expect(first).toBeTruthy()
  expect(second).toBeTruthy()
  await page.mouse.dblclick(
    (first!.x + first!.width / 2 + second!.x + second!.width / 2) / 2,
    (first!.y + first!.height / 2 + second!.y + second!.height / 2) / 2,
  )
  const afterAdd = await readPoints()
  expect(afterAdd).toHaveLength(5)
  expect(afterAdd[0]).toEqual([0, 260])
  expect(afterAdd[1][0]).toBeGreaterThan(0)
  expect(afterAdd[1][0]).toBeLessThan(afterAdd[2][0])

  // Double-clicking a vertex handle removes that vertex.
  await handle(2).dblclick()
  const afterRemove = await readPoints()
  expect(afterRemove).toHaveLength(4)

  // The history panel recorded each vertex edit with its own label.
  await page.getByRole('tab', { name: '历史', exact: true }).click()
  await expect(page.getByTestId('freeform-history-panel')).toBeVisible()
  for (const label of ['拖动顶点', '添加顶点', '删除顶点']) {
    await expect(
      page.locator('[data-testid="freeform-history-item"]').filter({
        has: page.locator('.freeform-history-label', { hasText: label }),
      }),
    ).toHaveCount(1)
  }

  // Undo walks the three vertex edits back to the imported shape.
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press('ControlOrMeta+z')
  }
  await expect(polyline).toHaveAttribute('points', '0,260 200,40 400,260 600,40')
})

test('switches to the freeform workspace and edits a slide', async ({ page }) => {
  await openFreeform(page)

  await expect(page.getByTestId('freeform-thumb')).toHaveCount(1)
  await expect(page.getByTestId('freeform-slide-size')).toContainText('1080×1440px')
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()

  await page.getByTestId('page-size-trigger').click()
  await page.getByRole('button', { name: '16:9', exact: true }).click()
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(1)
  await expect(page.getByTestId('freeform-slide-size')).toContainText('1920×1080px')

  await insertText(page)
  await expect(page.getByLabel('文本内容')).toBeVisible()

  await insertShape(page)
  await expect(page.getByTestId('freeform-shape')).toBeVisible()
})

test('inserts shapes and lines from the elements panel', async ({ page }) => {
  await page.goto('/#/edit/canvas')

  const elementsTool = page.getByTestId('freeform-elements-tool')
  const panel = page.getByRole('complementary', { name: '元素' })
  await expect(elementsTool).toHaveAttribute('aria-expanded', 'false')
  await elementsTool.click()
  await expect(elementsTool).toHaveAttribute('aria-expanded', 'true')
  await expect(panel).toBeVisible()
  await panel.getByRole('group', { name: '形状' }).getByRole('button', { name: '矩形', exact: true }).click()
  await expect(page.getByTestId('freeform-shape')).toHaveCount(1)
  // The panel stays open for the next insert, like Canva's.
  await expect(panel).toBeVisible()
  await panel.getByRole('group', { name: '线条' }).getByRole('button', { name: '直线', exact: true }).click()
  await expect(page.getByTestId('freeform-line')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(elementsTool).toHaveAttribute('aria-expanded', 'false')
  await expect(elementsTool).toBeFocused()
})

test('an open insert panel turns its rail icon ink in the dark theme', async ({ page }) => {
  await openFreeform(page)
  if ((await page.locator('html').getAttribute('data-theme')) !== 'dark') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const inkColors = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.color = 'var(--on-btn)'
    probe.style.backgroundColor = 'var(--btn)'
    document.body.append(probe)
    const style = getComputedStyle(probe)
    const colors = {
      color: style.color,
      background: style.backgroundColor,
    }
    probe.remove()
    return colors
  })

  const elementsTool = page.getByTestId('freeform-elements-tool')
  const icon = elementsTool.locator('svg')
  await elementsTool.click()
  await expect(elementsTool).toHaveAttribute('aria-expanded', 'true')
  await expect(icon).toHaveCSS('background-color', inkColors.background)
  await expect(icon).toHaveCSS('color', inkColors.color)
})

test('rail panels open one at a time and insert styled text', async ({ page }) => {
  await openFreeform(page)

  const elementsTool = page.getByTestId('freeform-elements-tool')
  const textTool = page.getByTestId('freeform-text-tool')
  const elementsPanel = page.getByTestId('freeform-elements-drawer')
  const textPanel = page.getByTestId('freeform-text-drawer')

  await elementsTool.click()
  await expect(elementsPanel).toBeVisible()
  await textTool.click()
  await expect(elementsPanel).toHaveCount(0)
  await expect(textPanel).toBeVisible()
  await expect(elementsTool).toHaveAttribute('aria-expanded', 'false')
  await expect(textTool).toHaveAttribute('aria-expanded', 'true')

  await textPanel.getByTestId('insert-text-heading').click()
  await expect(page.getByTestId('freeform-textbox')).toHaveCount(1)
  await expect(page.getByTestId('freeform-textbox')).toContainText('添加标题')
  // Each default style shows itself the way it lands on the page.
  const headingSize = await textPanel.getByTestId('insert-text-heading').evaluate((node) => parseFloat(getComputedStyle(node).fontSize))
  const bodySize = await textPanel.getByTestId('insert-text-body').evaluate((node) => parseFloat(getComputedStyle(node).fontSize))
  expect(headingSize).toBeGreaterThan(bodySize)

  await textPanel.getByRole('button', { name: '关闭面板' }).click()
  await expect(textPanel).toHaveCount(0)
})

test('keeps focus on an outside toolbar button when closing the page size popover', async ({ page }) => {
  await openFreeform(page)

  const pageSizeTrigger = page.getByTestId('page-size-trigger')
  const pageSizePopover = page.getByTestId('page-size-popover')
  const templateButton = page.getByTestId('freeform-template-button')

  await pageSizeTrigger.click()
  await expect(pageSizePopover).toBeVisible()
  await page.getByTestId('freeform-rulers-toggle').click()
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )

  await expect(pageSizePopover).toBeHidden()
  await expect(page.getByTestId('freeform-rulers-toggle')).toBeFocused()
  await expect(page.getByTestId('freeform-rulers-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expect(templateButton).toBeVisible()
})

test('opening an insert panel closes the page size popover without inserting', async ({ page }) => {
  await openFreeform(page)

  const undo = page.getByRole('button', { name: '撤销' })
  const pageSizeTrigger = page.getByTestId('page-size-trigger')
  const pageSizePopover = page.getByTestId('page-size-popover')
  const elementsTool = page.getByTestId('freeform-elements-tool')

  await expect(undo).toBeDisabled()
  await pageSizeTrigger.click()
  await expect(pageSizePopover).toBeVisible()
  await elementsTool.click()

  await expect(pageSizePopover).toBeHidden()
  await expect(page.getByTestId('freeform-elements-drawer')).toBeVisible()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()

  // The panel is docked, so the popover opens beside it.
  await pageSizeTrigger.click()
  await expect(pageSizePopover).toBeVisible()
  await expect(pageSizePopover.getByRole('button', { name: '3:4', exact: true })).toBeFocused()
  await expect(page.getByTestId('freeform-elements-drawer')).toBeVisible()
  await expect(undo).toBeDisabled()
})

test('closes a toolbar menu when tabbing to the next toolbar trigger', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const bar = page.getByTestId('freeform-context-toolbar')
  const alignTrigger = bar.getByTestId('ctx-align-menu')
  const orderTrigger = bar.getByTestId('ctx-order-menu')
  const alignMenu = page.getByRole('menu', { name: '位置' })
  const orderMenu = page.getByRole('menu', { name: '层级' })

  await alignTrigger.click()
  await expect(alignMenu.getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('Tab')

  await expect(orderTrigger).toBeFocused()
  await expect(alignMenu).toBeHidden()
  await page.keyboard.press('Enter')
  await expect(orderMenu).toBeVisible()
  await expect(page.getByRole('menu')).toHaveCount(1)
})

test('closes the page size popover before keyboard-opening a toolbar menu', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const pageSizeTrigger = page.getByTestId('page-size-trigger')
  const pageSizePopover = page.getByTestId('page-size-popover')
  const orderTrigger = page.getByTestId('ctx-order-menu')
  const orderMenu = page.getByRole('menu', { name: '层级' })

  await pageSizeTrigger.click()
  await expect(pageSizePopover).toBeVisible()

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await orderTrigger.evaluate((element) => element === document.activeElement)) break
    await page.keyboard.press('Tab')
  }

  await expect(orderTrigger).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(pageSizePopover).toBeHidden()
  await expect(orderMenu).toBeVisible()
  await expect(orderMenu.getByRole('menuitem', { name: '置于顶层' })).toBeFocused()
  await expect(page.getByRole('menu')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(orderMenu).toBeHidden()
  await expect(orderTrigger).toBeFocused()
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

test('supports cyclic keyboard selection in toolbar menus', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await insertShape(page)

  const shapeTrigger = page.getByTestId('ctx-shape-menu')
  const element = page.getByTestId('freeform-element')
  await shapeTrigger.click()
  const shapeMenu = page.getByRole('menu', { name: '矩形' })
  const rectangle = shapeMenu.getByRole('menuitem', { name: '矩形' })
  const ellipse = shapeMenu.getByRole('menuitem', { name: '圆形' })
  const triangle = shapeMenu.getByRole('menuitem', { name: '三角形' })
  const star = shapeMenu.getByRole('menuitem', { name: '五角星' })
  const hexagon = shapeMenu.getByRole('menuitem', { name: '六边形' })

  await expect(rectangle).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(hexagon).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rectangle).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(ellipse).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(triangle).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(star).toBeFocused()
  await page.keyboard.press('Space')

  await expect(shapeMenu).toBeHidden()
  await expect(shapeTrigger).toHaveText('五角星')
  await expect(shapeTrigger).toBeFocused()
  await expect(element).toHaveCount(1)

  await shapeTrigger.click()
  await expect(page.getByRole('menu', { name: '五角星' }).getByRole('menuitem', { name: '矩形' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(shapeTrigger).toHaveText('矩形')
  await expect(shapeTrigger).toBeFocused()
})

test('opening and closing insert panels records no history', async ({ page }) => {
  await page.goto('/#/edit/canvas')

  const undo = page.getByRole('button', { name: '撤销' })
  const textTool = page.getByTestId('freeform-text-tool')
  const elementsTool = page.getByTestId('freeform-elements-tool')

  await expect(undo).toBeDisabled()
  await textTool.click()
  await page.getByTestId('insert-text').focus()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('freeform-text-drawer')).toHaveCount(0)
  await expect(textTool).toBeFocused()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()

  await elementsTool.click()
  await page.getByTestId('freeform-canvas').click({ position: { x: 8, y: 8 } })
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()

  // Leaving for the other editor and coming back inserts nothing either.
  await page.goto('/#/edit/md')
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()
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

test('font menu closes after selection and keeps the text element selected', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const element = page.getByTestId('freeform-element').first()
  const trigger = page.getByTestId('freeform-font-select')
  await element.click()
  await trigger.click()
  await page.getByRole('option').nth(2).click()

  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(trigger).not.toHaveAttribute('aria-controls')
  await expect(trigger).not.toHaveAttribute('aria-activedescendant')
  await expect(element).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId('freeform-textbox').first()).toHaveCSS('font-family', /Noto Serif|serif/i)
})

test('font menu Escape restores trigger focus without clearing the canvas selection', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const element = page.getByTestId('freeform-element').first()
  const trigger = page.getByTestId('freeform-font-select')
  await trigger.click()
  await expect(page.getByRole('listbox')).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(element).toHaveAttribute('data-selected', 'true')
})

test('font menu preserves focus according to the outside click target', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const trigger = page.getByTestId('freeform-font-select')
  const textInput = page.locator('.freeform-inspector-text')
  const sectionTitle = page.getByTestId('inspector-typography').locator('.inspector-section-title')

  await trigger.click()
  await textInput.click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(textInput).toBeFocused()

  await trigger.click()
  await sectionTitle.click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(page.getByTestId('freeform-element').first()).toHaveAttribute('data-selected', 'true')
})

test('font menu keeps focus on external summary and contenteditable controls', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  await openFreeform(page)

  await insertText(page)
  const trigger = page.getByTestId('freeform-font-select')
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

    const details = document.createElement('details')
    details.open = true
    const summary = document.createElement('summary')
    summary.dataset.testid = 'external-summary'
    summary.textContent = '外部摘要'
    details.append(summary, document.createTextNode('摘要内容'))

    const editable = document.createElement('div')
    editable.dataset.testid = 'external-contenteditable'
    editable.setAttribute('contenteditable', '')
    editable.textContent = '外部可编辑内容'
    host.append(details, editable)
    document.body.append(host)
  })

  const summary = page.getByTestId('external-summary')
  const editable = page.getByTestId('external-contenteditable')
  await trigger.click()
  await summary.click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(summary).toBeFocused()

  await trigger.click()
  await editable.click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(editable).toBeFocused()
  expect(pageErrors).toEqual([])
})

async function installDisabledFieldsetFocusTargets(page: import('@playwright/test').Page) {
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

async function clickLocatorCenter(
  page: import('@playwright/test').Page,
  target: import('@playwright/test').Locator,
) {
  const box = await target.boundingBox()
  expect(box).toBeTruthy()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
}

test('font menu keeps focus on an external tabindex -1 button', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const trigger = page.getByTestId('freeform-font-select')
  await page.evaluate(() => {
    const button = document.createElement('button')
    button.type = 'button'
    button.tabIndex = -1
    button.dataset.testid = 'external-negative-tabindex-button'
    button.textContent = 'External mouse focus target'
    button.style.cssText = [
      'position: fixed',
      'left: 8px',
      'bottom: 8px',
      'z-index: 100',
    ].join(';')
    document.body.append(button)
  })

  const target = page.getByTestId('external-negative-tabindex-button')
  await trigger.click()
  await target.click()

  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(target).toBeFocused()
})

test('font menu keeps focus on a first-legend input in a disabled fieldset', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  await installDisabledFieldsetFocusTargets(page)
  const trigger = page.getByTestId('freeform-font-select')
  const target = page.getByTestId('disabled-fieldset-legend-input')
  await expect(target).toBeEnabled()

  await trigger.click()
  await target.click()

  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(target).toBeFocused()
})

test('font menu keeps focus on a link inside a disabled fieldset', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  await installDisabledFieldsetFocusTargets(page)
  const trigger = page.getByTestId('freeform-font-select')
  const target = page.getByTestId('disabled-fieldset-link')

  await trigger.click()
  await target.click()

  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(target).toBeFocused()
})

test('font menu restores trigger focus for an input disabled by its fieldset', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  await installDisabledFieldsetFocusTargets(page)
  const trigger = page.getByTestId('freeform-font-select')
  const target = page.getByTestId('disabled-fieldset-input')
  await expect(target).toBeDisabled()

  await trigger.click()
  await clickLocatorCenter(page, target)

  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('font menu restores trigger focus for disabled or inert outside targets', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const trigger = page.getByTestId('freeform-font-select')
  await page.evaluate(() => {
    const host = document.createElement('div')
    host.style.cssText = [
      'position: fixed',
      'left: 8px',
      'bottom: 8px',
      'z-index: 100',
    ].join(';')

    const disabledButton = document.createElement('button')
    disabledButton.disabled = true
    disabledButton.dataset.testid = 'external-disabled-target'
    disabledButton.textContent = 'Disabled target'

    const disabledAncestor = document.createElement('button')
    disabledAncestor.disabled = true
    const disabledDescendant = document.createElement('span')
    disabledDescendant.tabIndex = 0
    disabledDescendant.dataset.testid = 'external-disabled-descendant'
    disabledDescendant.textContent = 'Disabled descendant'
    disabledAncestor.append(disabledDescendant)

    const inertButton = document.createElement('button')
    inertButton.inert = true
    inertButton.dataset.testid = 'external-inert-target'
    inertButton.textContent = 'Inert target'

    const inertAncestor = document.createElement('div')
    inertAncestor.inert = true
    const inertDescendant = document.createElement('button')
    inertDescendant.dataset.testid = 'external-inert-descendant'
    inertDescendant.textContent = 'Inert descendant'
    inertAncestor.append(inertDescendant)

    host.append(disabledButton, disabledAncestor, inertButton, inertAncestor)
    document.body.append(host)
  })

  for (const testId of [
    'external-disabled-target',
    'external-disabled-descendant',
    'external-inert-target',
    'external-inert-descendant',
  ]) {
    await trigger.click()
    await clickLocatorCenter(page, page.getByTestId(testId))
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
})

test('font listbox exposes active options and isolates keyboard navigation from the canvas', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const trigger = page.getByTestId('freeform-font-select')
  const element = page.getByTestId('freeform-element').first()
  const before = await freeformElementPositions(page)
  await trigger.click()

  const listbox = page.getByRole('listbox')
  const options = listbox.getByRole('option')
  const listboxId = await listbox.getAttribute('id')
  expect(listboxId).toBeTruthy()
  await expect(trigger).toHaveAttribute('role', 'combobox')
  await expect(trigger).toHaveAccessibleName('字体')
  await expect(trigger).toHaveAttribute('aria-controls', listboxId!)

  const expectActiveOption = async (index: number) => {
    const optionId = await options.nth(index).getAttribute('id')
    expect(optionId).toBeTruthy()
    await expect(trigger).toHaveAttribute('aria-activedescendant', optionId!)
  }

  await expectActiveOption(0)
  await page.keyboard.press('ArrowDown')
  await expectActiveOption(1)
  await page.keyboard.press('Home')
  await expectActiveOption(0)
  // The seven fonts, then 导入字体… last.
  await page.keyboard.press('End')
  await expectActiveOption(7)
  await expect(options.nth(7)).toHaveText('导入字体…')
  await trigger.dispatchEvent('keydown', {
    key: '思',
    bubbles: true,
    cancelable: true,
  })
  await expectActiveOption(1)
  await page.waitForTimeout(550)
  await page.keyboard.type('Ping')
  await expectActiveOption(0)
  await expect.poll(() => freeformElementPositions(page)).toEqual(before)

  await page.keyboard.press('ArrowDown')
  await expectActiveOption(1)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toContainText('思源黑体')
  await expect(element).toHaveAttribute('data-selected', 'true')
})

test('font menu closes on Tab without trapping focus and handles Space selection', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const trigger = page.getByTestId('freeform-font-select')
  const fontSize = page.getByTestId('inspector-typography').locator('input[type="number"]').first()

  await trigger.click()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(fontSize).toBeFocused()

  await trigger.focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('listbox')).toBeVisible()
  // The last font sits just above 导入字体….
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toContainText('系统默认')
})

test('font listbox keeps option identity across dynamic options and guards the empty state', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(async () => {
    const ReactModule = await import('/@id/react')
    const React = ReactModule.default ?? ReactModule
    const ReactDomClientModule = await import('/@id/react-dom/client')
    const ReactDomClient = ReactDomClientModule.default ?? ReactDomClientModule
    const { createRoot } = ReactDomClient
    const { Select } = await import('/src/Select.tsx')

    const alpha = { id: 'alpha one', label: 'Alpha' }
    const bravo = { id: 'bravo/two', label: 'Bravo' }
    const charlie = { id: 'charlie:three', label: 'Charlie' }
    const variants = {
      initial: [alpha, bravo, charlie],
      reordered: [charlie, alpha, bravo],
      shrunk: [alpha, bravo],
      empty: [],
    }
    const host = document.createElement('div')
    host.dataset.testid = 'dynamic-select-harness'
    host.dataset.changeCount = '0'
    document.body.replaceChildren(host)
    const root = createRoot(host)

    const render = (options: Array<{ id: string; label: string }>) => {
      root.render(
        React.createElement(Select, {
          value: bravo.id,
          options,
          onChange: (id: string) => {
            host.dataset.changeCount = String(Number(host.dataset.changeCount) + 1)
            host.dataset.lastChange = id
          },
          title: '动态字体',
          testId: 'dynamic-font-select',
        }),
      )
    }

    window.addEventListener('dynamic-select-options', (event) => {
      const variant = (event as CustomEvent<keyof typeof variants>).detail
      render(variants[variant])
    })
    render(variants.initial)
  })

  const trigger = page.getByTestId('dynamic-font-select')
  const harness = page.getByTestId('dynamic-select-harness')
  await expect(trigger).toHaveAttribute('role', 'combobox')
  await expect(trigger).toHaveAccessibleName('动态字体')
  await trigger.click()

  const listbox = page.getByRole('listbox')
  const alpha = listbox.getByRole('option', { name: 'Alpha' })
  const bravo = listbox.getByRole('option', { name: 'Bravo' })
  const charlie = listbox.getByRole('option', { name: 'Charlie' })
  const alphaId = await alpha.getAttribute('id')
  const bravoId = await bravo.getAttribute('id')
  const charlieId = await charlie.getAttribute('id')
  expect(alphaId).toBeTruthy()
  expect(bravoId).toBeTruthy()
  expect(charlieId).toBeTruthy()

  await page.keyboard.press('End')
  await expect(trigger).toHaveAttribute('aria-activedescendant', charlieId!)
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dynamic-select-options', { detail: 'reordered' }))
  })
  await expect(charlie).toHaveAttribute('id', charlieId!)
  await expect(alpha).toHaveAttribute('id', alphaId!)
  await expect(bravo).toHaveAttribute('id', bravoId!)
  await expect(trigger).toHaveAttribute('aria-activedescendant', charlieId!)

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dynamic-select-options', { detail: 'shrunk' }))
  })
  await expect(charlie).toHaveCount(0)
  await expect(trigger).toHaveAttribute('aria-activedescendant', bravoId!)
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dynamic-select-options', { detail: 'initial' }))
  })
  await expect(charlie).toHaveCount(1)
  await expect(trigger).toHaveAttribute('aria-activedescendant', bravoId!)
  await page.keyboard.press('ArrowUp')
  await expect(trigger).toHaveAttribute('aria-activedescendant', alphaId!)
  await page.keyboard.press('ArrowDown')
  await expect(trigger).toHaveAttribute('aria-activedescendant', bravoId!)

  await trigger.dispatchEvent('keydown', {
    key: 'C',
    bubbles: true,
    cancelable: true,
  })
  await page.keyboard.press('Escape')
  await trigger.click()
  await trigger.dispatchEvent('keydown', {
    key: 'h',
    bubbles: true,
    cancelable: true,
  })
  await expect(trigger).toHaveAttribute('aria-activedescendant', bravoId!)

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dynamic-select-options', { detail: 'shrunk' }))
  })
  await expect(charlie).toHaveCount(0)
  await expect(trigger).toHaveAttribute('aria-activedescendant', bravoId!)
  await page.keyboard.press('ArrowUp')
  await expect(trigger).toHaveAttribute('aria-activedescendant', alphaId!)
  await page.keyboard.press('ArrowDown')
  await expect(trigger).toHaveAttribute('aria-activedescendant', bravoId!)

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dynamic-select-options', { detail: 'empty' }))
  })
  await expect(trigger).toBeDisabled()
  await expect(trigger).toContainText('暂无选项')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await trigger.dispatchEvent('click')
  await trigger.dispatchEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
  })
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(harness).toHaveAttribute('data-change-count', '0')
})

test('font listbox fully resets pending typeahead when unmounted', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(async () => {
    const ReactModule = await import('/@id/react')
    const React = ReactModule.default ?? ReactModule
    const ReactDomClientModule = await import('/@id/react-dom/client')
    const ReactDomClient = ReactDomClientModule.default ?? ReactDomClientModule
    const { createRoot } = ReactDomClient
    const { Select } = await import('/src/Select.tsx')

    const host = document.createElement('div')
    host.dataset.testid = 'unmount-select-harness'
    document.body.replaceChildren(host)

    const originalSetTimeout = globalThis.setTimeout.bind(globalThis)
    const originalClearTimeout = globalThis.clearTimeout.bind(globalThis)
    let trackedHandle: number | null = null
    globalThis.setTimeout = ((
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => {
      const isTypeaheadTimer = delay === 500
      const handle = originalSetTimeout(() => {
        if (isTypeaheadTimer && handle === trackedHandle) {
          host.dataset.timerExecuted = 'true'
        }
        callback(...args)
      }, delay)
      if (isTypeaheadTimer) {
        trackedHandle = handle
        host.dataset.timerScheduled = 'true'
      }
      return handle
    }) as typeof globalThis.setTimeout
    globalThis.clearTimeout = ((handle?: number) => {
      if (handle === trackedHandle) {
        host.dataset.timerCancelled = 'true'
        host.dataset.timerClearStack = new Error().stack ?? ''
      }
      originalClearTimeout(handle)
    }) as typeof globalThis.clearTimeout

    const root = createRoot(host)
    root.render(
      React.createElement(Select, {
        value: 'alpha',
        options: [
          { id: 'alpha', label: 'Alpha' },
          { id: 'bravo', label: 'Bravo' },
        ],
        onChange: () => undefined,
        title: 'Unmount select',
        testId: 'unmount-font-select',
      }),
    )

    window.addEventListener(
      'unmount-dynamic-select',
      () => {
        root.unmount()
        globalThis.setTimeout = originalSetTimeout
        globalThis.clearTimeout = originalClearTimeout
      },
      { once: true },
    )
  })

  const host = page.getByTestId('unmount-select-harness')
  const trigger = page.getByTestId('unmount-font-select')
  await trigger.click()
  await trigger.dispatchEvent('keydown', {
    key: 'B',
    bubbles: true,
    cancelable: true,
  })
  await expect(host).toHaveAttribute('data-timer-scheduled', 'true')

  await page.evaluate(() => {
    window.dispatchEvent(new Event('unmount-dynamic-select'))
  })
  await expect(trigger).toHaveCount(0)
  await expect(host).toHaveAttribute('data-timer-cancelled', 'true')
  await expect(host).toHaveAttribute('data-timer-clear-stack', /clearTypeahead/)
  await page.waitForTimeout(550)
  await expect(host).not.toHaveAttribute('data-timer-executed')
})

test('warms the selected web font before export is clicked', async ({ page }) => {
  await page.route(/^https?:\/\/fonts\.googleapis\.com\//, (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    headers: { 'access-control-allow-origin': '*' },
    body: `
      @font-face {
        font-family: 'Noto Serif SC';
        font-style: normal;
        font-weight: 700;
        src: url('https://fonts.gstatic.com/s/test-font.woff2') format('woff2');
        unicode-range: U+0-10FFFF;
      }
    `,
  }))
  await page.route(/^https?:\/\/fonts\.gstatic\.com\//, (route) => route.fulfill({
    status: 200,
    contentType: 'font/woff2',
    headers: { 'access-control-allow-origin': '*' },
    body: Buffer.from('offline-font-fixture'),
  }))
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

  await page.goto('/#/edit/canvas')
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

test('compact saved freeform top bar keeps controls from overlapping', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await insertText(page)
  await signUpToSave(page, `c${Date.now().toString(36).slice(-6)}`)

  await expect(page.getByTestId('editor-title')).toBeVisible()
  await expect(page.getByTestId('freeform-export')).toBeVisible()
  await expect(page.getByTestId('account-menu')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存草稿' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^我的草稿/ })).toHaveCount(0)
  await expectVisibleFreeformToolbarButtonsToFit(page)

  const header = await page.getByTestId('app-header').evaluate((bar) => {
    const box = bar.getBoundingClientRect()
    const controls = Array.from(bar.querySelectorAll<HTMLElement>('button, [data-testid="editor-save-state"]'))
      .map((control) => ({ label: control.getAttribute('aria-label') ?? control.textContent ?? '', rect: control.getBoundingClientRect() }))
      .filter((control) => control.rect.width > 0 && control.rect.height > 0)
    const issues: string[] = []
    for (const control of controls) {
      if (control.rect.left < box.left - 0.5 || control.rect.right > box.right + 0.5) issues.push(`${control.label} leaves the bar`)
    }
    for (let first = 0; first < controls.length; first += 1) {
      for (let second = first + 1; second < controls.length; second += 1) {
        const a = controls[first].rect
        const b = controls[second].rect
        const inside = (outer: DOMRect, inner: DOMRect) => inner.left >= outer.left && inner.right <= outer.right
          && inner.top >= outer.top && inner.bottom <= outer.bottom
        if (inside(a, b) || inside(b, a)) continue
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) {
          issues.push(`${controls[first].label} overlaps ${controls[second].label}`)
        }
      }
    }
    return issues
  })
  expect(header).toEqual([])
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

test('workspace chrome selectors stay scoped to workspace toolbar', async () => {
  expect(findUnscopedWorkspaceChromeSelectors(`
    @media (max-width: 1100px) {
      .page-size-trigger { color: red; }
      .freeform-insert-trigger { color: red; }
      .freeform-add-page { color: red; }
      .freeform-stage-head .zoom-btn { color: red; }
      .toolbar-collapsible-label { color: red; }
    }
    .page-size-trigger .workspace-toolbar { color: red; }
    .freeform-insert-menu .freeform-toolbar { color: red; }
    .workspace-toolbar .page-size-trigger { content: ".page-size-declaration"; }
    .freeform-toolbar .freeform-insert-trigger { content: ".freeform-insert-declaration"; }
    .freeform-rail .freeform-add-page { color: green; }
    .freeform-stage-pane .freeform-stage-head { color: green; }
    .workspace-toolbar .toolbar-collapsible-label { color: green; }
  `)).toEqual([
    '.page-size-trigger',
    '.freeform-insert-trigger',
    '.freeform-add-page',
    '.freeform-stage-head .zoom-btn',
    '.toolbar-collapsible-label',
    '.page-size-trigger .workspace-toolbar',
    '.freeform-insert-menu .freeform-toolbar',
  ])

  const css = await readFile('src/styles.css', 'utf8')
  const unscoped = findUnscopedWorkspaceChromeSelectors(css)

  expect(unscoped, `裸 workspace chrome 选择器：${unscoped.join(' | ')}`).toEqual([])
})

test('edits preset and custom page sizes from the toolbar popover', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await page.goto('/#/edit')
  if ((await page.locator('html').getAttribute('data-theme')) !== 'light') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.goto('/#/edit/canvas')

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
  await page.goto('/#/edit/md')
  await expect(popover).toBeHidden()
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()

  await page.goto('/#/edit/canvas')
  await expect(popover).toBeHidden()
  await trigger.click()
  await expect(popover).toBeVisible()
  await widthInput.fill('1200')
  await heightInput.fill('1600')
  await page.locator('.freeform-stage-scroll').click({ position: { x: 6, y: 6 } })
  await expect(popover).toBeHidden()
  await expect(slideSize).toContainText('1080×1920px')
  await expect(trigger).toBeFocused()

  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(slideSize).toContainText('3:4 · 1080×1440px')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(slideSize).toContainText('9:16 · 1080×1920px')
})

test('reapplying the current page size preserves history and saved state', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const toolbar = page.getByTestId('freeform-toolbar')
  const slideMeta = page.getByTestId('editor-save-state')
  await expect(toolbar.locator('button:disabled')).toHaveCount(2)

  await page.getByTestId('account-login').click()
  await registerUser(page, `same-size-${Date.now()}`)
  await expect(page.getByTestId('account-menu')).toBeVisible()
  const slide = {
    id: 'same-size-slide',
    name: 'Same size',
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    nodes: [],
  }
  await openStoredDrafts(page, [{
    id: 'same-size-draft',
    title: 'Same size',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: Date.now(),
    document: { documentVersion: 14, activeSlideId: slide.id, slides: [slide] },
  }])
  await expect(slideMeta).toHaveText('已保存')
  await expect(toolbar.locator('button:disabled')).toHaveCount(2)

  await page.getByTestId('page-size-trigger').click()
  await page.getByTestId('page-size-popover').getByRole('button', { name: '3:4', exact: true }).click()

  await expect(page.getByTestId('page-size-popover')).toBeHidden()
  await expect(slideMeta).toHaveText('已保存')
  await expect(toolbar.locator('button:disabled')).toHaveCount(2)

  await page.getByTestId('page-size-trigger').click()
  await page.getByLabel('宽度 px').fill('1080')
  await page.getByLabel('高度 px').fill('1440')
  await page.getByRole('button', { name: '应用尺寸', exact: true }).click()

  await expect(page.getByTestId('page-size-popover')).toBeHidden()
  await expect(slideMeta).toHaveText('已保存')
  await expect(toolbar.locator('button:disabled')).toHaveCount(2)
})

test('sets custom page size and new pages inherit it', async ({ page }) => {
  await page.goto('/#/edit/canvas')

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
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(2)
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

test('PowerPoint crop shows the full source around the crop frame', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.setItem('slicer.mode.v1', 'light'))
  await page.reload()
  await page.goto('/#/edit/canvas')
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'wide-crop-source.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })

  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement).toHaveCount(1)
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await expect(imageElement).toHaveAttribute('data-selected', 'true')

  const cropButton = page.getByTestId('freeform-crop-image')
  await expect(cropButton).toHaveText('裁剪')
  await page.getByTestId('paint-image-fit-contain').click()
  await expect(cropButton).toBeDisabled()
  await page.getByTestId('paint-image-fit-cover').click()
  await expect(cropButton).toBeEnabled()
  await cropButton.click()

  const overlay = page.getByTestId('freeform-image-crop-overlay')
  const dimImage = overlay.locator('.freeform-image-crop-dim')
  const cropWindow = overlay.locator('.freeform-image-crop-window')
  const brightImage = cropWindow.locator('.freeform-image-crop-bright')
  const cropFrame = overlay.locator('.freeform-image-crop-frame')
  await expect(overlay).toBeVisible()
  await expect(dimImage).toBeVisible()
  await expect(brightImage).toBeVisible()
  await expect(cropFrame.locator('[data-crop-handle]')).toHaveCount(8)
  for (const name of [
    '裁剪上边',
    '裁剪右上角',
    '裁剪右边',
    '裁剪右下角',
    '裁剪下边',
    '裁剪左下角',
    '裁剪左边',
    '裁剪左上角',
  ]) {
    await expect(cropFrame.getByRole('button', { name, exact: true })).toBeVisible()
  }

  const cropGeometry = await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>(
      '[data-testid="freeform-image-crop-overlay"]',
    )!
    const dim = overlay.querySelector<HTMLImageElement>('.freeform-image-crop-dim')!
    const windowElement = overlay.querySelector<HTMLElement>('.freeform-image-crop-window')!
    const bright = overlay.querySelector<HTMLImageElement>('.freeform-image-crop-bright')!
    const frame = overlay.querySelector<HTMLElement>('.freeform-image-crop-frame')!
    const dimRect = dim.getBoundingClientRect()
    const windowRect = windowElement.getBoundingClientRect()
    const brightRect = bright.getBoundingClientRect()
    const frameRect = frame.getBoundingClientRect()
    return {
      sameSource: dim.currentSrc === bright.currentSrc,
      windowOverflow: getComputedStyle(windowElement).overflow,
      sourceBeyondFrame: dimRect.left < frameRect.left - 0.5
        || dimRect.top < frameRect.top - 0.5
        || dimRect.right > frameRect.right + 0.5
        || dimRect.bottom > frameRect.bottom + 0.5,
      windowMatchesFrame: Math.abs(windowRect.left - frameRect.left) <= 0.5
        && Math.abs(windowRect.top - frameRect.top) <= 0.5
        && Math.abs(windowRect.right - frameRect.right) <= 0.5
        && Math.abs(windowRect.bottom - frameRect.bottom) <= 0.5,
      brightCoversWindow: brightRect.left <= windowRect.left + 0.5
        && brightRect.top <= windowRect.top + 0.5
        && brightRect.right >= windowRect.right - 0.5
        && brightRect.bottom >= windowRect.bottom - 0.5,
    }
  })
  expect(cropGeometry).toEqual({
    sameSource: true,
    windowOverflow: 'hidden',
    sourceBeyondFrame: true,
    windowMatchesFrame: true,
    brightCoversWindow: true,
  })

  await expect(imageElement).toHaveAttribute('data-scene-node-id', /.+/)
  await expect(imageElement.locator('[data-image-crop-hidden="true"]')).toHaveCount(1)
  await expect(page.getByTestId('freeform-selection-box')).toHaveCount(0)
  await expect(page.getByTestId('freeform-framing-surface')).toHaveCount(0)
  await expect(page.getByTestId('freeform-framing-zoom')).toHaveCount(0)
  await expect(page.getByTestId('freeform-framing-zoom-in')).toHaveCount(0)
  await expect(page.getByTestId('freeform-framing-zoom-out')).toHaveCount(0)
  await expect(page.locator('.freeform-framing-third')).toHaveCount(0)

  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(cropFrame.locator('[data-crop-handle]')).toHaveCount(8)
  await page.getByTestId('freeform-image-crop-done').click()
  await expect(overlay).toHaveCount(0)

  await imageElement.dblclick()
  await expect(overlay).toBeVisible()
  await page.getByTestId('freeform-image-crop-done').click()

  await insertShape(page)
  await page.locator('input.freeform-file').nth(1).setInputFiles({
    name: 'shape-fill.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const shapeElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  await expect(shapeElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await expect(page.getByTestId('freeform-adjust-framing')).toHaveText('调整取景')
  await shapeElement.dblclick()
  await expect(page.getByTestId('freeform-framing-surface')).toBeVisible()
  await expect(overlay).toHaveCount(0)
  await page.getByTestId('freeform-framing-cancel').click()
})

async function readCropOverlayDraft(page: import('@playwright/test').Page) {
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

async function readCropVisualGeometry(page: import('@playwright/test').Page) {
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

async function sampleViewportPixels(
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

function cropMarkerColorSignatures(pixels: number[][]) {
  return pixels.map(([red, green, blue]) => ([
    ['r', red],
    ['g', green],
    ['b', blue],
  ] as const).sort((left, right) => right[1] - left[1]).map(([channel]) => channel).join(''))
}

async function observeCropDraftCommits(page: import('@playwright/test').Page) {
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

function cropGeometryOf(value: Awaited<ReturnType<typeof readCropOverlayDraft>>) {
  return { frame: value.frame, image: value.image }
}

async function dispatchCropPointerGesture(
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

async function installCropDraftObserver(page: import('@playwright/test').Page) {
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

async function readObservedCropDraft(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const value = document.documentElement.dataset.cropObservedDraft
    if (!value) throw new Error('observed crop draft missing')
    return JSON.parse(value) as {
      frame: { left: number; top: number; right: number; bottom: number }
      image: { left: number; top: number; right: number; bottom: number }
    }
  })
}

async function beginPendingCropPointerMove(
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

async function releaseLateCropFrame(
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

test('crop focuses the image surface and pans by keyboard immediately', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-keyboard-focus.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')

  await page.getByTestId('freeform-crop-image').click()
  const overlay = page.getByTestId('freeform-image-crop-overlay')
  await expect(overlay).toBeFocused()

  const before = await readCropOverlayDraft(page)
  await page.keyboard.press('ArrowRight')
  const afterOne = await readCropOverlayDraft(page)
  expect(afterOne.image.left).toBeCloseTo(before.image.left + 1, 10)
  expect(afterOne.frame).toEqual(before.frame)

  await page.keyboard.press('Shift+ArrowLeft')
  const afterTen = await readCropOverlayDraft(page)
  expect(afterTen.image.left).toBeCloseTo(afterOne.image.left - 10, 10)
  expect(afterTen.frame).toEqual(before.frame)
  await page.getByTestId('freeform-image-crop-done').click()
})

test('crop aspect ratios expose only the six presets and stay one-shot', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-aspect-ratios.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await page.getByTestId('freeform-crop-image').click()

  const aspectTrigger = page.getByTestId('freeform-image-crop-aspect')
  await expect(aspectTrigger).toHaveText('比例')
  await aspectTrigger.click()
  const menu = page.getByRole('menu', { name: '比例', exact: true })
  await expect(menu.getByRole('menuitem')).toHaveText([
    '原图',
    '1:1',
    '4:3',
    '3:4',
    '16:9',
    '9:16',
  ])
  await menu.getByRole('menuitem', { name: '1:1', exact: true }).click()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toBeVisible()

  const square = await readCropOverlayDraft(page)
  expect(square.frame.right - square.frame.left).toBeCloseTo(
    square.frame.bottom - square.frame.top,
    4,
  )
  await dispatchCropPointerGesture(
    page,
    page.locator('[data-crop-handle="e"]'),
    901,
    { x: -24, y: 0 },
  )
  const freeform = await readCropOverlayDraft(page)
  expect(freeform.frame.right - freeform.frame.left).not.toBeCloseTo(
    freeform.frame.bottom - freeform.frame.top,
    4,
  )
  await page.getByTestId('freeform-image-crop-done').click()
})

test('crop aspect menu Escape commits once and exits the crop', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-aspect-escape.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))

  await page.getByTestId('freeform-crop-image').click()
  const originalDraft = await readCropOverlayDraft(page)
  await dispatchCropPointerGesture(
    page,
    page.locator('[data-crop-handle="e"]'),
    902,
    { x: -24, y: 0 },
  )
  const changedDraft = await readCropOverlayDraft(page)
  expect(changedDraft.frame.right).not.toBeCloseTo(originalDraft.frame.right, 4)

  await page.getByTestId('freeform-image-crop-aspect').click()
  const menu = page.getByRole('menu', { name: '比例', exact: true })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(menu).toHaveCount(0)
  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))

  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))
  await imageElement.click()
  await page.getByTestId('freeform-crop-image').click()
  expect(await readCropOverlayDraft(page)).toEqual(originalDraft)
  await page.getByTestId('freeform-image-crop-done').click()
})

test('crop finish semantics commit from every exit and undo atomically', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-finish-semantics.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))

  await page.getByTestId('freeform-crop-image').click()
  const originalDraft = await readCropOverlayDraft(page)
  await page.getByTestId('freeform-image-crop-done').click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))

  const exits = ['done', 'Escape', 'Enter', 'outside'] as const
  for (let index = 0; index < exits.length; index += 1) {
    await imageElement.click()
    await page.getByTestId('freeform-crop-image').click()
    await dispatchCropPointerGesture(
      page,
      page.locator('[data-crop-handle="e"]'),
      910 + index,
      { x: -20 - index * 2, y: 0 },
    )
    const changedDraft = await readCropOverlayDraft(page)
    expect(changedDraft.frame.right).not.toBeCloseTo(originalDraft.frame.right, 4)

    const exit = exits[index]
    if (exit === 'done') {
      await page.getByTestId('freeform-image-crop-done').click()
    } else if (exit === 'outside') {
      const canvasBox = await page.getByTestId('freeform-canvas').boundingBox()
      expect(canvasBox).toBeTruthy()
      await page.mouse.click(canvasBox!.x + 5, canvasBox!.y + 5)
    } else {
      await page.keyboard.press(exit)
    }

    await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
    await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))

    await imageElement.click()
    await page.getByTestId('freeform-crop-image').click()
    expect(await readCropOverlayDraft(page)).toEqual(originalDraft)
    await page.getByTestId('freeform-image-crop-done').click()
    await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))
  }
})

test('crop blocks document commands while editing', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-command-blocking.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await page.keyboard.press('ControlOrMeta+C')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const nodeCountBefore = await page.getByTestId('freeform-element').count()

  await page.getByTestId('freeform-crop-image').click()
  await dispatchCropPointerGesture(
    page,
    page.locator('[data-crop-handle="e"]'),
    931,
    { x: -20, y: 0 },
  )
  const cropBeforeCommands = cropGeometryOf(await readCropOverlayDraft(page))
  await expect(page.getByTestId('freeform-toolbar')).toHaveAttribute('inert', '')
  await expect(page.locator('.freeform-right-panel')).toHaveAttribute('inert', '')

  for (const shortcut of [
    'ControlOrMeta+Z',
    'ControlOrMeta+Shift+Z',
    'ControlOrMeta+V',
    'ControlOrMeta+G',
    'ControlOrMeta+Shift+G',
    'Delete',
  ]) await page.keyboard.press(shortcut)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'blocked-replacement.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  await page.getByTestId('paint-image-fit-contain').evaluate((button) => (
    button as HTMLButtonElement
  ).click())
  await expect(page.getByTestId('freeform-export')).toBeDisabled()
  await page.getByTestId('freeform-export').evaluate((button) => (
    button as HTMLButtonElement
  ).click())
  await expect(page.getByTestId('freeform-export-options')).toHaveCount(0)

  await expect(page.getByTestId('freeform-image-crop-overlay')).toBeVisible()
  expect(cropGeometryOf(await readCropOverlayDraft(page))).toEqual(cropBeforeCommands)
  expect(await page.getByTestId('freeform-element').count()).toBe(nodeCountBefore)
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await page.keyboard.press('Escape')
})

test('crop invalidates on a real decode error without history', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-decode-error.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await page.getByTestId('freeform-crop-image').click()
  await page.locator('.freeform-image-crop-dim').dispatchEvent('error')

  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await expect(workspace).not.toHaveClass(/is-image-cropping/)
  await expect(page.getByRole('alert')).toContainText('图片加载失败，请重试')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByTestId('freeform-toolbar')).not.toHaveAttribute('inert', '')
})

test('crop invalidates silently when its resolved image identity changes', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-source-identity.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await page.getByTestId('freeform-crop-image').click()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toBeVisible()

  const replacement = `${WIDE_TEST_SVG_DATA_URL}#resolved-identity-change`
  await page.evaluate(async (nextResolvedSrc) => {
    const module = await import('/src/storage/index.ts')
    const imageStore = module.store.images
    const originalResolve = imageStore.resolve
    imageStore.resolve = (href: string) => (
      href.startsWith('img:') ? nextResolvedSrc : originalResolve(href)
    )
    const testWindow = window as typeof window & {
      __restoreCropImageResolve?: () => void
    }
    testWindow.__restoreCropImageResolve = () => {
      imageStore.resolve = originalResolve
    }
  }, replacement)

  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect.poll(() => imageElement.locator('img[data-framed-image-content="true"]')
      .getAttribute('src')).toBe(replacement)
    await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
    await expect(workspace).not.toHaveClass(/is-image-cropping/)
    await expect(page.getByTestId('freeform-toolbar')).not.toHaveAttribute('inert', '')
    await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally {
    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __restoreCropImageResolve?: () => void
      }
      testWindow.__restoreCropImageResolve?.()
      delete testWindow.__restoreCropImageResolve
    })
  }
})

test('crop clears and reports a real scene image decode error without history', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-scene-decode-error.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  const sceneImage = imageElement.locator('img[data-framed-image-content="true"]')
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await page.getByTestId('freeform-crop-image').click()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toBeVisible()
  await sceneImage.dispatchEvent('error')

  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await expect(workspace).not.toHaveClass(/is-image-cropping/)
  await expect(page.getByRole('alert')).toContainText('图片加载失败，请重试')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByTestId('freeform-toolbar')).not.toHaveAttribute('inert', '')
})

test('PowerPoint crop pans the picture and crops from every handle', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-gestures.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await page.getByTestId('freeform-crop-image').click()

  const overlay = page.getByTestId('freeform-image-crop-overlay')
  const dim = overlay.locator('.freeform-image-crop-dim')
  const beforePan = await readCropOverlayDraft(page)
  const beforePanVisual = await readCropVisualGeometry(page)
  await dispatchCropPointerGesture(page, dim, 701, { x: 24, y: 0 })
  await expect.poll(() => readCropOverlayDraft(page)).not.toEqual(beforePan)
  const afterPan = await readCropOverlayDraft(page)
  const afterPanVisual = await readCropVisualGeometry(page)
  expect(afterPan.frame).toEqual(beforePan.frame)
  expect(afterPan.image.left).not.toBeCloseTo(beforePan.image.left, 4)
  expect(afterPanVisual.frame).toEqual(beforePanVisual.frame)
  expect(afterPanVisual.image.left).not.toBeCloseTo(beforePanVisual.image.left, 2)
  expect(afterPanVisual.markers.topLeft.x).not.toBeCloseTo(
    beforePanVisual.markers.topLeft.x,
    2,
  )

  type CropEdge = 'left' | 'top' | 'right' | 'bottom'
  const cases: Array<{
    handle: string
    delta: { x: number; y: number }
    active: CropEdge[]
    fixed: CropEdge[]
  }> = [
    { handle: 'n', delta: { x: 0, y: 10 }, active: ['top'], fixed: ['left', 'right', 'bottom'] },
    { handle: 'ne', delta: { x: -10, y: 10 }, active: ['top', 'right'], fixed: ['left', 'bottom'] },
    { handle: 'e', delta: { x: -10, y: 0 }, active: ['right'], fixed: ['left', 'top', 'bottom'] },
    { handle: 'se', delta: { x: -10, y: -10 }, active: ['right', 'bottom'], fixed: ['left', 'top'] },
    { handle: 's', delta: { x: 0, y: -10 }, active: ['bottom'], fixed: ['left', 'top', 'right'] },
    { handle: 'sw', delta: { x: 10, y: -10 }, active: ['left', 'bottom'], fixed: ['right', 'top'] },
    { handle: 'w', delta: { x: 10, y: 0 }, active: ['left'], fixed: ['top', 'right', 'bottom'] },
    { handle: 'nw', delta: { x: 10, y: 10 }, active: ['left', 'top'], fixed: ['right', 'bottom'] },
  ]
  for (const [index, item] of cases.entries()) {
    const before = await readCropOverlayDraft(page)
    const beforeVisual = await readCropVisualGeometry(page)
    const beforeMarkerPoints = Object.values(beforeVisual.markers)
    const beforeMarkerPixels = await sampleViewportPixels(page, beforeMarkerPoints)
    const beforeMarkerColors = cropMarkerColorSignatures(beforeMarkerPixels)
    // A marker a crop edge runs through samples the edge's anti-aliasing, not
    // the picture; only markers clear of the frame's edges are compared.
    const clearOf = (frame: { left: number; right: number; top: number; bottom: number }) => (
      (point: { x: number; y: number }) => (
        [frame.left, frame.right].every((x) => Math.abs(point.x - x) > 3)
        && [frame.top, frame.bottom].every((y) => Math.abs(point.y - y) > 3)
      )
    )
    const clearBefore = beforeMarkerPoints.map(clearOf(beforeVisual.frame))
    expect(
      beforeMarkerColors.filter((_, markerIndex) => clearBefore[markerIndex]),
      `${item.handle} distinct marker colors`,
    ).toEqual(['rbg', 'gbr', 'bgr', 'brg'].filter((_, markerIndex) => clearBefore[markerIndex]))
    await dispatchCropPointerGesture(
      page,
      overlay.locator(`[data-crop-handle="${item.handle}"]`),
      720 + index,
      item.delta,
    )
    const after = await readCropOverlayDraft(page)
    const afterVisual = await readCropVisualGeometry(page)
    for (const edge of item.active) {
      expect(after.frame[edge], `${item.handle} draft changed ${edge}`)
        .not.toBeCloseTo(before.frame[edge], 3)
      expect(afterVisual.frame[edge], `${item.handle} visual changed ${edge}`)
        .not.toBeCloseTo(beforeVisual.frame[edge], 2)
    }
    for (const edge of item.fixed) {
      expect(after.frame[edge], `${item.handle} draft fixed ${edge}`)
        .toBeCloseTo(before.frame[edge], 3)
      expect(
        Math.abs(afterVisual.frame[edge] - beforeVisual.frame[edge]),
        `${item.handle} visual fixed ${edge}`,
      ).toBeLessThan(0.05)
    }
    expect(after.image).toEqual(before.image)
    expect(afterVisual.image).toEqual(beforeVisual.image)
    for (const marker of Object.keys(beforeVisual.markers) as Array<keyof typeof beforeVisual.markers>) {
      expect(afterVisual.markers[marker].x, `${item.handle} ${marker} marker x`)
        .toBeCloseTo(beforeVisual.markers[marker].x, 3)
      expect(afterVisual.markers[marker].y, `${item.handle} ${marker} marker y`)
        .toBeCloseTo(beforeVisual.markers[marker].y, 3)
    }
    const afterMarkerPixels = await sampleViewportPixels(page, beforeMarkerPoints)
    const afterMarkerColors = cropMarkerColorSignatures(afterMarkerPixels)
    const clearAfter = clearOf(afterVisual.frame)
    const comparable = beforeMarkerPoints.flatMap((point, markerIndex) => (
      clearBefore[markerIndex] && clearAfter(point) ? [markerIndex] : []
    ))
    expect(comparable.length, `${item.handle} comparable markers`).toBeGreaterThanOrEqual(1)
    expect(comparable.map((markerIndex) => afterMarkerColors[markerIndex]), `${item.handle} stable marker colors`)
      .toEqual(comparable.map((markerIndex) => beforeMarkerColors[markerIndex]))
  }
  await page.getByTestId('freeform-image-crop-done').click()
})

test('PowerPoint crop owns one pointer and rolls back interrupted gestures', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-pointer-ownership.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await page.getByTestId('freeform-crop-image').click()
  const overlay = page.getByTestId('freeform-image-crop-overlay')
  const dim = overlay.locator('.freeform-image-crop-dim')
  const initial = await readCropOverlayDraft(page)
  const dimBox = await dim.boundingBox()
  expect(dimBox).toBeTruthy()
  const start = { x: dimBox!.x + dimBox!.width / 2, y: dimBox!.y + dimBox!.height / 2 }

  await dim.dispatchEvent('pointerdown', {
    pointerId: 801,
    pointerType: 'pen',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  })
  await overlay.locator('[data-crop-handle="e"]').dispatchEvent('pointerdown', {
    pointerId: 802,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 802,
      pointerType: 'touch',
      isPrimary: true,
      buttons: 1,
      clientX: x + 120,
      clientY: y,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 802,
      pointerType: 'touch',
      isPrimary: true,
      clientX: x + 120,
      clientY: y,
    }))
  }, start)
  await expect.poll(() => readCropOverlayDraft(page)).toEqual(initial)

  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 801,
      pointerType: 'pen',
      isPrimary: true,
      buttons: 1,
      clientX: x + 40,
      clientY: y,
    }))
  }, start)
  await expect.poll(() => readCropOverlayDraft(page)).not.toEqual(initial)
  const moved = await readCropOverlayDraft(page)

  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {
    bubbles: true,
    pointerId: 802,
    pointerType: 'mouse',
    isPrimary: true,
  })))
  await expect.poll(() => readCropOverlayDraft(page)).toEqual(moved)
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {
    bubbles: true,
    pointerId: 801,
    pointerType: 'pen',
    isPrimary: true,
  })))
  await expect.poll(async () => cropGeometryOf(await readCropOverlayDraft(page)))
    .toEqual(cropGeometryOf(initial))

  await dim.dispatchEvent('pointerdown', {
    pointerId: 805,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true,
    pointerId: 805,
    pointerType: 'mouse',
    isPrimary: true,
    buttons: 1,
    clientX: x + 35,
    clientY: y,
  })), start)
  await expect.poll(() => readCropOverlayDraft(page)).not.toEqual(initial)
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {
    bubbles: true,
    pointerId: 805,
    pointerType: 'mouse',
    isPrimary: true,
  })))
  await expect.poll(async () => cropGeometryOf(await readCropOverlayDraft(page)))
    .toEqual(cropGeometryOf(initial))

  await dispatchCropPointerGesture(page, dim, 803, { x: 30, y: 0 }, 'pen')
  const afterCompletedSegment = await readCropOverlayDraft(page)
  await dim.dispatchEvent('pointerdown', {
    pointerId: 804,
    pointerType: 'pen',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true,
    pointerId: 804,
    pointerType: 'pen',
    isPrimary: true,
    buttons: 1,
    clientX: x + 40,
    clientY: y,
  })), start)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect.poll(async () => cropGeometryOf(await readCropOverlayDraft(page)))
    .toEqual(cropGeometryOf(afterCompletedSegment))
  await page.getByTestId('freeform-image-crop-done').click()
})

test('PowerPoint crop batches pointer moves and preserves preview through rerenders', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-batching.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await page.getByTestId('freeform-crop-image').click()
  const overlay = page.getByTestId('freeform-image-crop-overlay')
  const dim = overlay.locator('.freeform-image-crop-dim')
  const box = await dim.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  const renderScale = await freeformCanvasScale(page)
  const finalScreenDelta = Math.min(24, renderScale * 40)

  await dim.dispatchEvent('pointerdown', {
    pointerId: 901,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  })
  const beforeBatch = await readCropOverlayDraft(page)
  await observeCropDraftCommits(page)
  await page.evaluate(({ x, y, total }) => {
    for (let index = 1; index <= 120; index += 1) {
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 901,
        pointerType: 'mouse',
        isPrimary: true,
        buttons: 1,
        clientX: x + total * (index / 120),
        clientY: y,
      }))
    }
  }, { ...start, total: finalScreenDelta })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  const afterBatch = await readCropOverlayDraft(page)
  await expect(page.locator('html')).toHaveAttribute('data-crop-dom-commit-count', '1')
  expect(afterBatch.image.left - beforeBatch.image.left).toBeCloseTo(
    finalScreenDelta / renderScale,
    3,
  )
  expect(afterBatch.image.right - beforeBatch.image.right).toBeCloseTo(
    finalScreenDelta / renderScale,
    3,
  )
  expect(afterBatch.overlaySize.width).toBeCloseTo(Math.max(
    1,
    afterBatch.frame.right,
    afterBatch.image.right,
  ), 4)
  expect(afterBatch.overlaySize.height).toBeCloseTo(Math.max(
    1,
    afterBatch.frame.bottom,
    afterBatch.image.bottom,
  ), 4)

  const hitSizeBeforeRerender = await overlay.evaluate((element) => (
    (element as HTMLElement).style.getPropertyValue('--crop-hit-size')
  ))
  await page.setViewportSize({ width: 980, height: 780 })
  await expect.poll(() => overlay.evaluate((element) => (
    (element as HTMLElement).style.getPropertyValue('--crop-hit-size')
  ))).not.toBe(hitSizeBeforeRerender)
  await expect.poll(() => readCropOverlayDraft(page)).toEqual(afterBatch)
  await page.evaluate(({ x, y, total }) => window.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true,
    pointerId: 901,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: x + total,
    clientY: y,
  })), { ...start, total: finalScreenDelta })
  await expect.poll(() => readCropOverlayDraft(page)).toEqual(afterBatch)
  await page.getByTestId('freeform-image-crop-done').click()
})

test('PowerPoint crop uses the latest canvas scale for each new gesture', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-latest-scale.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await page.getByTestId('freeform-crop-image').click()

  const overlay = page.getByTestId('freeform-image-crop-overlay')
  const dim = overlay.locator('.freeform-image-crop-dim')
  const startScale = await freeformCanvasScale(page)
  const hitSizeBeforeResize = await overlay.evaluate((element) => (
    (element as HTMLElement).style.getPropertyValue('--crop-hit-size')
  ))
  await page.setViewportSize({ width: 980, height: 780 })
  await expect.poll(() => overlay.evaluate((element) => (
    (element as HTMLElement).style.getPropertyValue('--crop-hit-size')
  ))).not.toBe(hitSizeBeforeResize)
  const resizedScale = await freeformCanvasScale(page)
  expect(resizedScale).not.toBeCloseTo(startScale, 4)

  const beforeGesture = await readCropOverlayDraft(page)
  const screenDelta = Math.min(18, resizedScale * 24)
  await dispatchCropPointerGesture(page, dim, 911, { x: screenDelta, y: 0 })
  const afterGesture = await readCropOverlayDraft(page)
  expect(afterGesture.image.left - beforeGesture.image.left).toBeCloseTo(
    screenDelta / resizedScale,
    3,
  )
  expect(afterGesture.image.right - beforeGesture.image.right).toBeCloseTo(
    screenDelta / resizedScale,
    3,
  )
  await page.getByTestId('freeform-image-crop-done').click()
})

test('crop transition settles pending frames without late writes', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-pending-cleanup.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  const cropButton = page.getByTestId('freeform-crop-image')
  await cropButton.click()

  let overlay = page.getByTestId('freeform-image-crop-overlay')
  let dim = overlay.locator('.freeform-image-crop-dim')
  const beforeFinish = cropGeometryOf(await readCropOverlayDraft(page))
  await installCropDraftObserver(page)
  const finishStart = await beginPendingCropPointerMove(page, dim, 921, { x: 40, y: 0 })
  expect(cropGeometryOf(await readCropOverlayDraft(page))).toEqual(beforeFinish)
  await page.keyboard.press('Escape')
  await expect(overlay).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-crop-frame-canceled', 'true')
  const finishedDraft = await readObservedCropDraft(page)
  expect(finishedDraft.frame).toEqual(beforeFinish.frame)
  expect(finishedDraft.image.left).not.toBeCloseTo(beforeFinish.image.left, 4)
  await releaseLateCropFrame(page, 921, { x: finishStart.x + 80, y: finishStart.y })
  expect(await readObservedCropDraft(page)).toEqual(finishedDraft)

  await cropButton.click()
  overlay = page.getByTestId('freeform-image-crop-overlay')
  dim = overlay.locator('.freeform-image-crop-dim')
  const beforeTransition = cropGeometryOf(await readCropOverlayDraft(page))
  await installCropDraftObserver(page)
  const transitionStart = await beginPendingCropPointerMove(page, dim, 922, { x: -40, y: 0 })
  expect(cropGeometryOf(await readCropOverlayDraft(page))).toEqual(beforeTransition)
  await page.goto('/#/edit/md')
  await expect(overlay).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-crop-frame-canceled', 'true')
  const transitionedDraft = await readObservedCropDraft(page)
  expect(transitionedDraft.frame).toEqual(beforeTransition.frame)
  expect(transitionedDraft.image.left).not.toBeCloseTo(beforeTransition.image.left, 4)
  await releaseLateCropFrame(page, 922, { x: transitionStart.x - 80, y: transitionStart.y })
  expect(await readObservedCropDraft(page)).toEqual(transitionedDraft)

  await page.goto('/#/edit/canvas')
  await imageElement.click()
  await cropButton.click()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toBeVisible()
  const restoredDraft = cropGeometryOf(await readCropOverlayDraft(page))
  for (const kind of ['frame', 'image'] as const) {
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      expect(restoredDraft[kind][edge]).toBeCloseTo(transitionedDraft[kind][edge], 3)
    }
  }
  await page.getByTestId('freeform-image-crop-done').click()
})

test('PowerPoint crop keeps local controls exact through nested screen transforms', async ({ page }) => {
  await openNestedV3Draft(
    page,
    `crop-transform-${Date.now()}`,
    false,
    imageCropTransformDraft,
  )
  await setFreeformZoom(page, 150)
  const canvas = page.getByTestId('freeform-canvas')
  const imageElement = page.locator('[data-scene-node-id="crop-image"]')
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await imageElement.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'crop-outer')
  await imageElement.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'crop-outer/crop-inner')
  await imageElement.click()
  await page.getByTestId('freeform-crop-image').click()

  const fixture = imageCropTransformDraft()
  const outer = fixture.document.slides[0].nodes[0]
  const inner = outer.children[0]
  const imageNode = inner.children[0] as unknown as FreeformSceneNode
  const worldMatrix = multiply(
    groupLocal(outer.x, outer.y, outer.rotation, outer.scale),
    multiply(
      groupLocal(inner.x, inner.y, inner.rotation, inner.scale),
      sceneNodeLocalMatrix(imageNode),
    ),
  )
  const renderScale = await freeformCanvasScale(page)
  const toScreen = (local: { x: number; y: number }) => {
    const world = transformVector(worldMatrix, local)
    return { x: world.x * renderScale, y: world.y * renderScale }
  }

  const overlay = page.getByTestId('freeform-image-crop-overlay')
  const beforePan = await readCropOverlayDraft(page)
  await dispatchCropPointerGesture(
    page,
    overlay.locator('.freeform-image-crop-dim'),
    951,
    toScreen({ x: 20, y: 0 }),
  )
  const afterPan = await readCropOverlayDraft(page)
  expect(afterPan.image.left - beforePan.image.left).toBeCloseTo(20, 3)
  expect(afterPan.image.top).toBeCloseTo(beforePan.image.top, 3)

  const east = overlay.locator('[data-crop-handle="e"]')
  const beforeEast = await readCropOverlayDraft(page)
  await dispatchCropPointerGesture(page, east, 952, toScreen({ x: -12, y: 0 }))
  const afterEast = await readCropOverlayDraft(page)
  expect(afterEast.frame.left).toBeCloseTo(beforeEast.frame.left, 3)
  expect(afterEast.frame.right - beforeEast.frame.right).toBeCloseTo(-12, 3)

  const eastBox = await east.boundingBox()
  expect(eastBox).toBeTruthy()
  const symmetricStart = {
    x: eastBox!.x + eastBox!.width / 2,
    y: eastBox!.y + eastBox!.height / 2,
  }
  const symmetricDelta = toScreen({ x: -5, y: 0 })
  const beforeSymmetricPointer = await readCropOverlayDraft(page)
  await east.dispatchEvent('pointerdown', {
    pointerId: 953,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
    ctrlKey: true,
    clientX: symmetricStart.x,
    clientY: symmetricStart.y,
  })
  await page.evaluate(({ start, delta }) => {
    const end = { x: start.x + delta.x, y: start.y + delta.y }
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 953,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: 1,
      clientX: end.x,
      clientY: end.y,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 953,
      pointerType: 'mouse',
      isPrimary: true,
      ctrlKey: true,
      clientX: end.x,
      clientY: end.y,
    }))
  }, { start: symmetricStart, delta: symmetricDelta })
  const afterSymmetricPointer = await readCropOverlayDraft(page)
  expect(afterSymmetricPointer.frame.left - beforeSymmetricPointer.frame.left).toBeCloseTo(5, 3)
  expect(afterSymmetricPointer.frame.right - beforeSymmetricPointer.frame.right).toBeCloseTo(-5, 3)

  await east.focus()
  const beforeOne = await readCropOverlayDraft(page)
  await page.keyboard.press('ArrowLeft')
  const afterOne = await readCropOverlayDraft(page)
  expect(afterOne.frame.right - beforeOne.frame.right).toBeCloseTo(-1, 4)
  await page.keyboard.press('Shift+ArrowLeft')
  const afterTen = await readCropOverlayDraft(page)
  expect(afterTen.frame.right - afterOne.frame.right).toBeCloseTo(-10, 4)

  const beforeSymmetric = await readCropOverlayDraft(page)
  await page.keyboard.press('Control+ArrowLeft')
  const afterSymmetric = await readCropOverlayDraft(page)
  expect(afterSymmetric.frame.left - beforeSymmetric.frame.left).toBeCloseTo(1, 4)
  expect(afterSymmetric.frame.right - beforeSymmetric.frame.right).toBeCloseTo(-1, 4)
  expect(
    (afterSymmetric.frame.left + afterSymmetric.frame.right)
      - (beforeSymmetric.frame.left + beforeSymmetric.frame.right),
  ).toBeCloseTo(0, 4)

  const northEast = overlay.locator('[data-crop-handle="ne"]')
  await northEast.focus()
  const beforeCorner = await readCropOverlayDraft(page)
  await page.keyboard.press('Control+ArrowLeft')
  const afterCorner = await readCropOverlayDraft(page)
  expect(afterCorner.frame.left).toBeCloseTo(beforeCorner.frame.left, 4)
  expect(afterCorner.frame.right - beforeCorner.frame.right).toBeCloseTo(-1, 4)
  await page.getByTestId('freeform-image-crop-done').click()
})

test('nested crop decode errors still report after entering the active group', async ({ page }) => {
  await openNestedV3Draft(
    page,
    `crop-nested-decode-${Date.now()}`,
    false,
    imageCropTransformDraft,
  )
  const canvas = page.getByTestId('freeform-canvas')
  const imageElement = page.locator('[data-scene-node-id="crop-image"]')
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await imageElement.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'crop-outer')
  await imageElement.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'crop-outer/crop-inner')
  await imageElement.click()
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await expect(page.getByTestId('freeform-crop-image')).toBeEnabled()
  await page.getByTestId('freeform-crop-image').click()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toBeVisible()

  await imageElement.locator('img[data-framed-image-content="true"]').dispatchEvent('error')

  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await expect(workspace).not.toHaveClass(/is-image-cropping/)
  await expect(page.getByRole('alert')).toContainText('图片加载失败，请重试')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
})

test('image framing commits one history entry and cancel restores the saved frame', async ({ page }) => {
  await openFreeform(page)
  await insertImageElementAndShapeFill(page)

  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  await expect(imageElement).toHaveCount(1)
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await imageElement.click()

  const workspace = page.locator('.freeform-workspace')
  const initialHistoryDepth = Number(await workspace.getAttribute('data-history-depth'))
  const adjust = page.getByTestId('freeform-adjust-framing')
  const reset = page.getByTestId('freeform-reset-framing')
  await expect(adjust).toBeEnabled()
  await expect(reset).toBeDisabled()

  await adjust.click()
  const surface = page.getByTestId('freeform-framing-surface')
  const zoom = page.getByTestId('freeform-framing-zoom')
  await expect(surface).toBeVisible()
  await expect(page.getByTestId('freeform-selection-box')).toHaveCount(0)
  await setRangeValue(zoom, 200)
  await expect(surface).toHaveAttribute('data-framing-zoom', '2')
  await page.getByTestId('freeform-framing-done').click()
  await expect(workspace).toHaveAttribute(
    'data-history-depth',
    String(initialHistoryDepth + 1),
  )
  await expect(reset).toBeEnabled()

  await imageElement.dblclick()
  await expect(surface).toBeVisible()
  await page.getByTestId('freeform-framing-done').click()
  await expect(workspace).toHaveAttribute(
    'data-history-depth',
    String(initialHistoryDepth + 1),
  )

  await adjust.click()
  await setRangeValue(zoom, 250)
  await page.getByTestId('freeform-framing-cancel').click()
  await expect(workspace).toHaveAttribute(
    'data-history-depth',
    String(initialHistoryDepth + 1),
  )
  await adjust.click()
  await expect(surface).toHaveAttribute('data-framing-zoom', '2')
  await page.keyboard.press('Escape')
  await expect(surface).toHaveCount(0)
})

test('persists shape framing and image crops through node copy, page copy, save, and reload', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  await page.goto('/#/edit/canvas')
  await insertImageElementAndShapeFill(page)
  await expectFreeformImagesDecoded(page)

  const surface = page.getByTestId('freeform-framing-surface')
  const readFrame = async () => ({
    focusX: Number(await surface.getAttribute('data-framing-focus-x')),
    focusY: Number(await surface.getAttribute('data-framing-focus-y')),
    zoom: Number(await surface.getAttribute('data-framing-zoom')),
  })

  const shapeElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  await expect(shapeElement).toHaveAttribute('data-selected', 'true')
  await page.getByTestId('freeform-adjust-framing').click()
  await setRangeValue(page.getByTestId('freeform-framing-zoom'), 160)
  await surface.focus()
  await page.keyboard.press('Shift+ArrowRight')
  const shapeFrame = await readFrame()
  await page.getByTestId('freeform-framing-done').click()

  const imageElements = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: '图片' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await page.getByTestId('freeform-crop-image').click()
  const cropOverlay = page.getByTestId('freeform-image-crop-overlay')
  const cropBefore = await readCropOverlayDraft(page)
  await dispatchCropPointerGesture(
    page,
    cropOverlay.locator('.freeform-image-crop-dim'),
    2001,
    { x: 0, y: 24 },
  )
  await dispatchCropPointerGesture(
    page,
    cropOverlay.locator('[data-crop-handle="e"]'),
    2002,
    { x: -24, y: 0 },
  )
  const imageCrop = cropGeometryOf(await readCropOverlayDraft(page))
  expect(imageCrop).not.toEqual(cropGeometryOf(cropBefore))
  await page.getByTestId('freeform-image-crop-done').click()

  await page.keyboard.press('ControlOrMeta+C')
  await page.keyboard.press('ControlOrMeta+V')
  await expect(imageElements).toHaveCount(2)
  await duplicateCurrentPage(page)
  await expect(page.locator('.freeform-thumb')).toHaveCount(2)

  await signUpToSave(page, `framing-persist-${Date.now()}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  const storedDocument = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    if (!key) throw new Error('draft storage key missing')
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
      document: unknown
    }>
    if (!drafts[0]) throw new Error('saved draft missing')
    return drafts[0].document
  }) as {
    documentVersion: number
    slides: Array<{
      nodes: Array<{
        type: string
        width?: number
        height?: number
        framing?: { focusX: number; focusY: number; zoom: number }
        fill?: {
          type: string
          framing?: { focusX: number; focusY: number; zoom: number }
        }
      }>
    }>
  }

  expect(storedDocument.documentVersion).toBe(19)
  expect(storedDocument.slides).toHaveLength(2)
  const firstImage = storedDocument.slides[0].nodes.find((node) => node.type === 'image')
  expect(firstImage).toBeDefined()
  const persistedImageCrop = {
    width: firstImage?.width,
    height: firstImage?.height,
    framing: firstImage?.framing,
  }
  expect(persistedImageCrop.framing).not.toEqual({ focusX: 0.5, focusY: 0.5, zoom: 1 })
  for (const slide of storedDocument.slides) {
    const images = slide.nodes.filter((node) => node.type === 'image')
    const imageShapes = slide.nodes.filter((node) => (
      node.type === 'shape' && node.fill?.type === 'image'
    ))
    expect(images).toHaveLength(2)
    expect(images.map((node) => ({
      width: node.width,
      height: node.height,
      framing: node.framing,
    }))).toEqual([persistedImageCrop, persistedImageCrop])
    expect(imageShapes).toHaveLength(1)
    expect(imageShapes[0].fill?.framing).toEqual(shapeFrame)
  }

  await page.evaluate(() => sessionStorage.removeItem('slicer.images.v1'))
  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await expectFreeformImagesDecoded(page)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const restoredTree = page.getByRole('tree', { name: '图层树' })
  await restoredTree.getByRole('treeitem', { name: '图片' }).first().click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await page.getByTestId('freeform-crop-image').click()
  const restoredImageCrop = cropGeometryOf(await readCropOverlayDraft(page))
  for (const bounds of ['frame', 'image'] as const) {
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      expect(restoredImageCrop[bounds][edge]).toBeCloseTo(imageCrop[bounds][edge], 10)
    }
  }
  await page.getByTestId('freeform-image-crop-done').click()

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await restoredTree.getByRole('treeitem', { name: '形状' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await page.getByTestId('freeform-adjust-framing').click()
  expect(await readFrame()).toEqual(shapeFrame)
  await page.getByTestId('freeform-framing-cancel').click()
})

test('image framing keyboard, buttons, drag cancel, and narrow controls stay deterministic', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 860 })
  await openFreeform(page)
  await insertImageElementAndShapeFill(page)
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await expect(imageElement).toHaveAttribute('data-selected', 'true')
  await page.getByTestId('freeform-adjust-framing').click()

  const surface = page.getByTestId('freeform-framing-surface')
  const zoomBar = page.locator('.freeform-framing-zoom')
  await page.getByTestId('freeform-framing-zoom-in').click()
  await expect(surface).toHaveAttribute('data-framing-zoom', '1.1')
  await setRangeValue(page.getByTestId('freeform-framing-zoom'), 200)

  const focusXBeforeKeys = Number(await surface.getAttribute('data-framing-focus-x'))
  await surface.focus()
  await page.keyboard.press('ArrowLeft')
  const focusXAfterOne = Number(await surface.getAttribute('data-framing-focus-x'))
  await page.keyboard.press('Shift+ArrowLeft')
  const focusXAfterTen = Number(await surface.getAttribute('data-framing-focus-x'))
  expect(focusXAfterOne).toBeGreaterThan(focusXBeforeKeys)
  expect(focusXAfterTen - focusXAfterOne).toBeGreaterThan(
    Math.abs(focusXAfterOne - focusXBeforeKeys) * 5,
  )

  const segmentStart = Number(await surface.getAttribute('data-framing-focus-y'))
  const box = await surface.boundingBox()
  expect(box).not.toBeNull()
  await surface.dispatchEvent('pointerdown', {
    pointerId: 41,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    clientX: box!.x + box!.width / 2,
    clientY: box!.y + box!.height / 2,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 41,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: 1,
      clientX: x,
      clientY: y,
      bubbles: true,
    }))
  }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 + 50 })
  await expect.poll(async () => Number(await surface.getAttribute('data-framing-focus-y')))
    .not.toBe(segmentStart)
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {
    pointerId: 41,
    pointerType: 'mouse',
    isPrimary: true,
    bubbles: true,
  })))
  await expect(surface).toHaveAttribute('data-framing-focus-y', String(segmentStart))

  const layout = await page.evaluate(() => {
    const bar = document.querySelector('.freeform-framing-zoom')!.getBoundingClientRect()
    const head = document.querySelector('.freeform-framing-head')!.getBoundingClientRect()
    return {
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      barLeft: bar.left,
      barRight: bar.right,
      headLeft: head.left,
      headRight: head.right,
      overlap: Math.max(0, Math.min(bar.right, head.right) - Math.max(bar.left, head.left)) > 0
        && Math.max(0, Math.min(bar.bottom, head.bottom) - Math.max(bar.top, head.top)) > 0,
    }
  })
  expect(layout.scrollWidth).toBe(layout.viewportWidth)
  expect(layout.barLeft).toBeGreaterThanOrEqual(0)
  expect(layout.barRight).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.headLeft).toBeGreaterThanOrEqual(0)
  expect(layout.headRight).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.overlap).toBe(false)
  await page.getByTestId('freeform-framing-cancel').click()
})

test('image framing stays covered and unobstructed across viewport widths and themes', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.setItem('slicer.mode.v1', 'light'))
  await page.reload()
  await page.goto('/#/edit/canvas')
  await insertImageElementAndShapeFill(page)
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')

  const viewports = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 440, height: 860 },
  ]
  // The fit-scale recompute chain (stage resize → ResizeObserver → React
  // commit of the new artboard scale) can lag well behind the viewport
  // change on slow runners, and the surface is sized by the committed scale.
  // Wait for the surface itself to stop moving before snapshotting it.
  const waitForFramingSurfaceToSettle = async () => {
    await expect.poll(async () => page.evaluate(async () => {
      const surface = document.querySelector('[data-testid="freeform-framing-surface"]')
      if (!surface) return false
      const first = surface.getBoundingClientRect().width
      await new Promise((resolve) => setTimeout(resolve, 120))
      return first > 0 && surface.getBoundingClientRect().width === first
    }), { timeout: 5_000 }).toBe(true)
  }
  for (const theme of ['light', 'dark'] as const) {
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await expect(imageElement).toHaveAttribute('data-selected', 'true')
      await page.getByTestId('freeform-adjust-framing').click()
      await setRangeValue(page.getByTestId('freeform-framing-zoom'), 250)
      await waitForFramingSurfaceToSettle()

      const layout = await page.evaluate(() => {
        const surface = document.querySelector<HTMLElement>('[data-testid="freeform-framing-surface"]')!
        const image = document.querySelector<HTMLImageElement>(
          '[data-scene-node-id][data-selected="true"] [data-framed-image-content="true"]',
        )!
        const head = document.querySelector<HTMLElement>('.freeform-framing-head')!
        const zoom = document.querySelector<HTMLElement>('.freeform-framing-zoom')!
        const frameRect = surface.getBoundingClientRect()
        const imageRect = image.getBoundingClientRect()
        const headRect = head.getBoundingClientRect()
        const zoomRect = zoom.getBoundingClientRect()
        const zoomChildren = [...zoom.children].map((child) => child.getBoundingClientRect())
        const overlap = (a: DOMRect, b: DOMRect) => (
          Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) > 0
          && Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) > 0
        )
        return {
          viewportWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          frame: {
            left: frameRect.left,
            top: frameRect.top,
            right: frameRect.right,
            bottom: frameRect.bottom,
          },
          image: {
            left: imageRect.left,
            top: imageRect.top,
            right: imageRect.right,
            bottom: imageRect.bottom,
          },
          head: { left: headRect.left, right: headRect.right },
          zoom: { left: zoomRect.left, right: zoomRect.right },
          zoomContent: {
            left: Math.min(...zoomChildren.map((rect) => rect.left)),
            right: Math.max(...zoomChildren.map((rect) => rect.right)),
          },
          narrowChrome: {
            toolbar: getComputedStyle(document.querySelector<HTMLElement>('.freeform-toolbar')!).display,
            rail: getComputedStyle(document.querySelector<HTMLElement>('.freeform-rail')!).display,
            inspector: getComputedStyle(document.querySelector<HTMLElement>('.freeform-right-panel')!).display,
          },
          controlsOverlap: overlap(headRect, zoomRect),
        }
      })
      expect(layout.scrollWidth).toBe(layout.viewportWidth)
      expect(layout.head.left).toBeGreaterThanOrEqual(0)
      expect(layout.head.right).toBeLessThanOrEqual(layout.viewportWidth)
      expect(layout.zoom.left).toBeGreaterThanOrEqual(0)
      expect(layout.zoom.right).toBeLessThanOrEqual(layout.viewportWidth)
      expect(layout.zoomContent.left).toBeGreaterThanOrEqual(0)
      expect(layout.zoomContent.right).toBeLessThanOrEqual(layout.viewportWidth)
      expect(layout.controlsOverlap).toBe(false)
      expect(layout.image.left).toBeLessThanOrEqual(layout.frame.left + 0.5)
      expect(layout.image.top).toBeLessThanOrEqual(layout.frame.top + 0.5)
      expect(layout.image.right).toBeGreaterThanOrEqual(layout.frame.right - 0.5)
      expect(layout.image.bottom).toBeGreaterThanOrEqual(layout.frame.bottom - 0.5)
      if (viewport.width === 440) {
        expect(layout.narrowChrome).toEqual({
          toolbar: 'none',
          rail: 'none',
          inspector: 'none',
        })
        expect(layout.frame.right - layout.frame.left).toBeGreaterThanOrEqual(120)
        await expect(page.getByTestId('freeform-framing-cancel')).toBeVisible()
        await expect(page.getByTestId('freeform-framing-done')).toBeVisible()
      }
      await page.getByTestId('freeform-framing-cancel').click()
      if (viewport.width === 440) {
        await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
        await expect(page.locator('.freeform-rail')).toBeVisible()
        await expect(page.locator('.freeform-right-panel')).toBeVisible()
      }
    }
    if (theme === 'light') {
      await page.getByRole('button', { name: '切换深浅色' }).click()
    }
  }
})

test('shape image framing supports every shape and is disabled for contain', async ({ page }) => {
  await openFreeform(page)
  await insertImageElementAndShapeFill(page)
  const shapeElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  await expect(shapeElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await shapeElement.click()

  const adjust = page.getByTestId('freeform-adjust-framing')
  await expect(adjust).toBeEnabled()
  await page.getByTestId('paint-image-fit-contain').click()
  await expect(adjust).toBeDisabled()
  await page.getByTestId('paint-image-fit-cover').click()
  await expect(adjust).toBeEnabled()

  const geometry = page.getByTestId('inspector-geometry')
  for (const [label, className] of [
    ['矩形', 'shape-rect'],
    ['圆形', 'shape-ellipse'],
    ['三角形', 'shape-triangle'],
  ] as const) {
    await geometry.getByRole('button', { name: label, exact: true }).click()
    await shapeElement.dblclick()
    await expect(page.getByTestId('freeform-framing-surface'))
      .toHaveClass(new RegExp(className))
    await page.getByTestId('freeform-framing-cancel').click()
  }
})

test('crop transition commits images while shape framing cancels across page and workspace switches', async ({ page }) => {
  await openFreeform(page)
  await insertImageElementAndShapeFill(page)
  await expectFreeformImagesDecoded(page)
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  const shapeElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  const selectTransitionLayer = async (name: '图片' | '形状') => {
    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await page.getByRole('tree', { name: '图层树' })
      .getByRole('treeitem', { name, exact: true })
      .click()
    await page.getByRole('tab', { name: '属性', exact: true }).click()
  }

  await page.getByRole('button', { name: '新增页面' }).click()
  const thumbnails = page.locator('.freeform-thumb')
  await thumbnails.first().click()
  await expect(imageElement).toBeVisible()
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await selectTransitionLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  const cropBeforePage = cropGeometryOf(await readCropOverlayDraft(page))
  await dispatchCropPointerGesture(
    page,
    page.locator('[data-crop-handle="e"]'),
    941,
    { x: -24, y: 0 },
  )
  const cropAfterPage = cropGeometryOf(await readCropOverlayDraft(page))
  expect(cropAfterPage.frame.right).not.toBeCloseTo(cropBeforePage.frame.right, 4)
  await expect(page.getByTestId('freeform-toolbar')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.locator('.freeform-right-panel')).toHaveAttribute('aria-disabled', 'true')

  await thumbnails.nth(1).click()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await expect(thumbnails.nth(1)).toHaveAttribute('aria-current', 'page')
  await thumbnails.first().click()
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await selectTransitionLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  const restoredAfterPage = cropGeometryOf(await readCropOverlayDraft(page))
  expect(restoredAfterPage.frame.right).toBeCloseTo(cropAfterPage.frame.right, 3)
  await dispatchCropPointerGesture(
    page,
    page.locator('[data-crop-handle="s"]'),
    942,
    { x: 0, y: -18 },
  )
  const cropAfterWorkspace = cropGeometryOf(await readCropOverlayDraft(page))

  await page.goto('/#/edit/md')
  await page.goto('/#/edit/canvas')
  await selectTransitionLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  const restoredAfterWorkspace = cropGeometryOf(await readCropOverlayDraft(page))
  expect(restoredAfterWorkspace.frame.bottom).toBeCloseTo(cropAfterWorkspace.frame.bottom, 3)
  await page.getByTestId('freeform-image-crop-done').click()

  await selectTransitionLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await setRangeValue(page.getByTestId('freeform-framing-zoom'), 200)
  await thumbnails.nth(1).click()
  await thumbnails.first().click()
  await expect(shapeElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await selectTransitionLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await expect(page.getByTestId('freeform-framing-surface'))
    .toHaveAttribute('data-framing-zoom', '1')

  await setRangeValue(page.getByTestId('freeform-framing-zoom'), 180)
  await page.goto('/#/edit/md')
  await page.goto('/#/edit/canvas')
  await selectTransitionLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await expect(page.getByTestId('freeform-framing-surface'))
    .toHaveAttribute('data-framing-zoom', '1')
  await page.getByTestId('freeform-framing-cancel').click()
})

test('crop transition commits images while shape framing cancels across project switches', async ({ page }) => {
  await openFreeform(page)
  await insertImageElementAndShapeFill(page)
  await expectFreeformImagesDecoded(page)
  await signUpToSave(page, `crop-draft-transition-${Date.now()}`)

  const userId = await currentUserId(page)
  const sourceId = await page.evaluate((key) => {
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
      id: string
      title: string
      updatedAt: number
    }>
    const source = structuredClone(drafts[0])
    if (!source) throw new Error('source draft missing')
    const sourceId = source.id
    source.id = 'crop-draft-transition-target'
    source.title = 'Crop draft transition target'
    source.updatedAt += 1
    localStorage.setItem(key, JSON.stringify([...drafts, source]))
    return sourceId
  }, `slicer.drafts.${userId}`)

  const selectLayer = async (name: '图片' | '形状') => {
    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await page.getByRole('tree', { name: '图层树' })
      .getByRole('treeitem', { name, exact: true })
      .click()
    await page.getByRole('tab', { name: '属性', exact: true }).click()
  }
  const openProject = async (id: string, title: string) => {
    await page.goto(`/#/edit/canvas/${encodeURIComponent(id)}`)
    await expect(page.getByTestId('editor-title')).toHaveText(title)
  }
  const sourceTitle = await page.getByTestId('editor-title').textContent()

  await selectLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  const cropBefore = cropGeometryOf(await readCropOverlayDraft(page))
  await dispatchCropPointerGesture(page, page.locator('[data-crop-handle="e"]'), 961, { x: -24, y: 0 })
  const cropChanged = cropGeometryOf(await readCropOverlayDraft(page))
  expect(cropChanged.frame.right).not.toBeCloseTo(cropBefore.frame.right, 4)

  // Opening another project mid-crop commits the crop into the project being left.
  await openProject('crop-draft-transition-target', 'Crop draft transition target')
  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await selectLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  await expect.poll(async () => cropGeometryOf(await readCropOverlayDraft(page)))
    .toEqual(cropBefore)
  await page.getByTestId('freeform-image-crop-done').click()

  await openProject(sourceId, sourceTitle ?? '')
  await selectLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  await expect.poll(async () => cropGeometryOf(await readCropOverlayDraft(page)))
    .toEqual(cropChanged)
  await page.getByTestId('freeform-image-crop-done').click()

  // Shape framing is cancelled instead: the zoom never reaches either project.
  await selectLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await setRangeValue(page.getByTestId('freeform-framing-zoom'), 180)
  await openProject('crop-draft-transition-target', 'Crop draft transition target')
  await expect(page.getByTestId('freeform-framing-surface')).toHaveCount(0)
  await openProject(sourceId, sourceTitle ?? '')
  await selectLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await expect(page.getByTestId('freeform-framing-surface')).toHaveAttribute('data-framing-zoom', '1')
  await page.getByTestId('freeform-framing-cancel').click()
})

test('crop transition commits images while shape framing cancels across account switches', async ({ page }) => {
  await openFreeform(page)
  await insertImageElementAndShapeFill(page)
  await expectFreeformImagesDecoded(page)
  const username = `crop-account-transition-${Date.now()}`
  await signUpToSave(page, username)

  const selectLayer = async (name: '图片' | '形状') => {
    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await page.getByRole('tree', { name: '图层树' })
      .getByRole('treeitem', { name, exact: true })
      .click()
    await page.getByRole('tab', { name: '属性', exact: true }).click()
  }
  const logOut = async () => {
    await page.getByTestId('account-menu').click()
    await page.getByTestId('account-logout').click()
    await expect(page.getByTestId('account-login')).toBeVisible()
  }
  const logBackIn = async () => {
    await page.getByTestId('account-login').click()
    const dialog = page.getByRole('dialog', { name: '账户登录与注册' })
    await dialog.getByLabel('用户名').fill(username)
    await dialog.getByLabel('密码').fill('1234')
    await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  }

  await selectLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  const cropBefore = cropGeometryOf(await readCropOverlayDraft(page))
  await dispatchCropPointerGesture(page, page.locator('[data-crop-handle="e"]'), 971, { x: -28, y: 0 })
  const cropChanged = cropGeometryOf(await readCropOverlayDraft(page))
  expect(cropChanged.frame.right).not.toBeCloseTo(cropBefore.frame.right, 4)

  // Signing out mid-crop commits the crop to the account and clears the canvas.
  await logOut()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await logBackIn()
  await selectLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  await expect.poll(async () => cropGeometryOf(await readCropOverlayDraft(page))).toEqual(cropChanged)
  await page.getByTestId('freeform-image-crop-done').click()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  // Shape framing is cancelled on the way out.
  await selectLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await setRangeValue(page.getByTestId('freeform-framing-zoom'), 180)
  await logOut()
  await expect(page.getByTestId('freeform-framing-surface')).toHaveCount(0)
  await logBackIn()
  await selectLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await expect(page.getByTestId('freeform-framing-surface')).toHaveAttribute('data-framing-zoom', '1')
  await page.getByTestId('freeform-framing-cancel').click()
})

test('persists image element and shape fill through ImageStore', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  await page.goto('/#/edit/canvas')

  await insertImageElementAndShapeFill(page)
  await expectFreeformImagesDecoded(page)

  const sessionImageKeys = await page.evaluate(() => {
    const raw = sessionStorage.getItem('slicer.images.v1')
    return Object.keys(raw ? JSON.parse(raw) as Record<string, string> : {})
  })
  expect(sessionImageKeys).toHaveLength(2)

  await signUpToSave(page, `image-store-${Date.now()}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  const persistedDrafts = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    return key ? localStorage.getItem(key) ?? '' : ''
  })
  expect(persistedDrafts).toContain('data:image/png;base64,')
  expect(persistedDrafts).not.toContain('img:')

  await page.evaluate(() => sessionStorage.removeItem('slicer.images.v1'))
  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await expectFreeformImagesDecoded(page)

  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  expect(downloadPath).toBeTruthy()
  expect(readPngSize(await readFile(downloadPath!))).toEqual({ width: 1080, height: 1440 })
})

test('exports the current slide as a PNG at slide dimensions', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.getByTestId('page-size-trigger').click()
  await page.getByRole('button', { name: '9:16', exact: true }).click()

  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe('slide-01.png')
  const path = await download.path()
  expect(path).toBeTruthy()
  const size = readPngSize(await readFile(path!))
  expect(size).toEqual({ width: 1080, height: 1920 })
  await expect(page.getByTestId('freeform-primary-export')).toBeEnabled()
})

test('export options switch format, quality, scale, and persist', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.getByTestId('page-size-trigger').click()
  await page.getByRole('button', { name: '9:16', exact: true }).click()

  await openExportMenu(page)
  const options = page.getByTestId('freeform-export-options')
  await expect(options).toBeVisible()
  // PNG by default: no quality slider.
  await expect(options.getByTestId('export-quality-range')).toHaveCount(0)

  await options.getByTestId('export-format-jpeg').click()
  await expect(options.getByTestId('export-quality-range')).toBeVisible()
  await options.getByTestId('export-quality-range').fill('80')
  await options.getByTestId('export-scale-2x').click()

  const jpegPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  const jpeg = await jpegPromise
  expect(jpeg.suggestedFilename()).toBe('slide-01.jpg')
  const jpegPath = await jpeg.path()
  expect(jpegPath).toBeTruthy()
  // 2x of a 1080×1920 page: 2160×3840 JPEG.
  const jpegBytes = await readFile(jpegPath!)
  expect(jpegBytes[0]).toBe(0xff)
  expect(jpegBytes[1]).toBe(0xd8)
  const jpegBlob = new Blob([jpegBytes])

  await page.reload()
  await page.goto('/#/edit/canvas')
  await openExportMenu(page)
  const restored = page.getByTestId('freeform-export-options')
  await expect(restored.getByTestId('export-format-jpeg')).toHaveClass(/on/)
  await expect(restored.getByTestId('export-scale-2x')).toHaveClass(/on/)
  await expect(restored.getByTestId('export-quality-range')).toHaveValue('80')

  await restored.getByTestId('export-format-png').click()
  const pngPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  const png = await pngPromise
  expect(png.suggestedFilename()).toBe('slide-01.png')
  const pngPath = await png.path()
  expect(pngPath).toBeTruthy()
  // The 2x scale setting applies to PNG as well; the guest's 9:16 page came
  // back after the reload (it saves on this device), so 2x is 2160×3840.
  expect(readPngSize(await readFile(pngPath!))).toEqual({ width: 2160, height: 3840 })
  expect(jpegBlob.size).toBeGreaterThan(0)
})

test('framed image export waits for the current image decode', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'delayed-export.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  const image = page.locator('.freeform-artboard img[data-framed-image-content="true"]')
  await expect(image).toHaveJSProperty('complete', true)
  await page.evaluate(() => {
    const target = document.querySelector<HTMLImageElement>(
      '.freeform-artboard img[data-framed-image-content="true"]',
    )!
    let release = () => undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const state = { called: false, release }
    ;(window as typeof window & { __framedDecodeGate?: typeof state }).__framedDecodeGate = state
    Object.defineProperty(target, 'decode', {
      configurable: true,
      value: () => {
        state.called = true
        return gate
      },
    })
  })

  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  await expect.poll(() => page.evaluate(() => Boolean(
    (window as typeof window & { __framedDecodeGate?: { called: boolean } })
      .__framedDecodeGate?.called,
  ))).toBe(true)
  await page.waitForTimeout(100)
  expect(downloads).toHaveLength(0)
  await page.evaluate(() => {
    (window as typeof window & { __framedDecodeGate?: { release: () => void } })
      .__framedDecodeGate?.release()
  })
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('slide-01.png')
})

test('framed image export reports decode failure without downloading', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'failed-export.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  const image = page.locator('.freeform-artboard img[data-framed-image-content="true"]')
  await expect(image).toHaveJSProperty('complete', true)
  await image.evaluate((target) => {
    Object.defineProperty(target, 'decode', {
      configurable: true,
      value: async () => { throw new Error('forced decode failure') },
    })
  })

  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  await expect(page.getByRole('alert')).toContainText('图片加载失败，导出已取消')
  expect(downloads).toHaveLength(0)
  await expect(page.getByTestId('freeform-primary-export')).toBeEnabled()
})

test('exports current freeform slide with gradient pixels and without editor ui', async ({ page }) => {
  await openFreeform(page)

  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await expect(page.getByTestId('freeform-element')).toHaveAttribute('data-selected', 'true')

  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
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

test('exports identical artwork pixels across app themes and preview zooms', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.setItem('slicer.mode.v1', 'light'))
  await page.reload()
  await page.goto('/#/edit/canvas')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  await insertText(page)
  await setSelectedElementBox(page, 80, 80, 320, 120)
  await page.locator('.freeform-inspector-text').fill('Theme isolation 主题')
  await insertShape(page)
  await setSelectedElementBox(page, 430, 240, 220, 180)
  await insertLine(page, '直线')
  await setSelectedElementBox(page, 180, 600, 480, 80)
  await expect(page.getByTestId('freeform-element')).toHaveCount(3)

  async function downloadCurrent() {
    await openExportMenu(page)
    const exportButton = page.getByTestId('freeform-primary-export')
    await expect(exportButton).toBeEnabled()
    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloadPromise
    const path = await download.path()
    if (!path) throw new Error('missing downloaded PNG path')
    await expect(exportButton).toBeEnabled()
    return path
  }

  await setFreeformZoom(page, 50)
  const lightPath = await downloadCurrent()
  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).not.toHaveClass(/theme-anim/)
  await setFreeformZoom(page, 400)
  const darkPath = await downloadCurrent()

  expect(readPngSize(await readFile(lightPath))).toEqual(readPngSize(await readFile(darkPath)))
  expect(await pngPixelDigest(page, lightPath)).toBe(await pngPixelDigest(page, darkPath))
  for (const [x, y] of [[10, 10], [540, 720], [1000, 1300]]) {
    expect(await samplePngPixel(page, lightPath, x, y)).toEqual(
      await samplePngPixel(page, darkPath, x, y),
    )
  }
})

test('renders nested v3 scene with inherited visibility lock and root selection', async ({ page }) => {
  await openNestedV3Draft(page, `nested-v3-${Date.now()}`)

  const leaves = page.locator('[data-scene-leaf="true"]')
  await expect(leaves).toHaveCount(7)
  await expect(page.locator('[data-scene-node-id="hidden-leaf"]')).toHaveCount(0)

  const logicalBoxes = await leaves.evaluateAll((nodes) => {
    const canvas = document.querySelector<HTMLElement>('[data-testid="freeform-canvas"]')
    if (!canvas) throw new Error('canvas missing')
    const canvasRect = canvas.getBoundingClientRect()
    const scale = canvasRect.width / 800
    return Object.fromEntries(nodes.map((node) => {
      const element = node as HTMLElement
      const rect = element.getBoundingClientRect()
      return [element.dataset.sceneNodeId, {
        x: (rect.left - canvasRect.left) / scale,
        y: (rect.top - canvasRect.top) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
      }]
    }))
  }) as Record<string, { x: number; y: number; width: number; height: number }>
  const expectedBoxes = {
    underlay: { x: 40, y: 40, width: 460, height: 320 },
    'visible-leaf': { x: 200, y: 125, width: 100, height: 50 },
    'scope-text': { x: 200, y: 200, width: 125, height: 50 },
    'locked-text': { x: 350, y: 225, width: 125, height: 50 },
    'scaled-root': { x: 495, y: 380, width: 150, height: 120 },
  }
  // 文字盒会按内容自动增高（grow-only）：x/y/width 与声明几何一致，
  // height 只会大于等于声明值，不会小于。
  const textLeafIds = new Set(['scope-text', 'locked-text'])
  for (const [id, expectedBox] of Object.entries(expectedBoxes)) {
    expect(logicalBoxes[id], id).toBeDefined()
    expect(logicalBoxes[id].x, `${id} x`).toBeCloseTo(expectedBox.x, 1)
    expect(logicalBoxes[id].y, `${id} y`).toBeCloseTo(expectedBox.y, 1)
    expect(logicalBoxes[id].width, `${id} width`).toBeCloseTo(expectedBox.width, 1)
    if (textLeafIds.has(id)) {
      expect(logicalBoxes[id].height, `${id} height`).toBeGreaterThanOrEqual(expectedBox.height - 0.05)
    } else {
      expect(logicalBoxes[id].height, `${id} height`).toBeCloseTo(expectedBox.height, 1)
    }
  }

  const lockedText = page.locator('[data-scene-node-id="locked-text"] [role="textbox"]')
  await expect(lockedText).toHaveAttribute('contenteditable', 'false')
  await expect(lockedText).toHaveAttribute('aria-readonly', 'true')
  const scopeText = page.locator('[data-scene-node-id="scope-text"] [role="textbox"]')
  await expect(scopeText).toHaveAttribute('contenteditable', 'false')
  await expect(scopeText).toHaveAttribute('aria-readonly', 'true')

  const rootOrder = async () => page.locator(
    '.freeform-artwork-clip > [data-scene-root-node="true"]',
  ).evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.sceneNodeId))
  const beforeOrder = await rootOrder()
  expect(beforeOrder).toEqual([
    'underlay',
    'outer',
    'scaled-root',
    'locked-root-leaf',
    'locked-root-group',
  ])

  await page.locator('[data-scene-node-id="visible-leaf"]').click()
  await expect(page.locator('[data-scene-node-id="outer"]')).toHaveAttribute('data-selected', 'true')
  await expect(page.locator('[data-scene-node-id="visible-leaf"]')).toHaveAttribute(
    'data-selected',
    'false',
  )
  expect(await rootOrder()).toEqual(beforeOrder)

  const scaledRoot = page.locator('[data-scene-node-id="scaled-root"]')
  await scaledRoot.click()
  const selectionBox = page.getByTestId('freeform-selection-box')
  await expect(selectionBox).toHaveAttribute('data-element-id', 'scaled-root')

  const beforeArtwork = await scaledRoot.boundingBox()
  const beforeOverlay = await selectionBox.boundingBox()
  expect(beforeArtwork).toBeTruthy()
  expect(beforeOverlay).toBeTruthy()
  const expectBoxesToMatch = (
    actual: NonNullable<typeof beforeArtwork>,
    expected: NonNullable<typeof beforeArtwork>,
    label: string,
  ) => {
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect.soft(
        Math.abs(actual[key] - expected[key]),
        `${label} ${key}`,
      ).toBeLessThanOrEqual(1)
    }
  }
  expectBoxesToMatch(beforeOverlay!, beforeArtwork!, 'initial selection overlay')

  const moveHandle = page.getByTestId('freeform-selection-move')
  const resizeHandle = page.getByTestId('freeform-selection-resize')
  for (const [label, handle] of [
    ['move', moveHandle],
    ['resize', resizeHandle],
  ] as const) {
    const box = await handle.boundingBox()
    expect(box, `${label} handle missing`).toBeTruthy()
    expect(box!.width, `${label} handle width`).toBeGreaterThanOrEqual(28)
    expect(box!.height, `${label} handle height`).toBeGreaterThanOrEqual(28)
    expect(
      await locatorOwnsPoint(handle, box!.x + box!.width / 2, box!.y + box!.height / 2),
      `${label} handle center hit target`,
    ).toBe(true)
  }

  const workspace = page.locator('.freeform-workspace')
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  expect(Number.isInteger(historyBefore)).toBe(true)
  const interactionScale = await freeformCanvasScale(page)
  const initialLogicalGeometry = await scaledRoot.evaluate((node) => {
    const element = node as HTMLElement
    return {
      x: Number.parseFloat(element.style.left),
      y: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }
  })
  const resizeStartBox = await resizeHandle.boundingBox()
  expect(resizeStartBox).toBeTruthy()
  const resizeStart = {
    x: resizeStartBox!.x + resizeStartBox!.width / 2,
    y: resizeStartBox!.y + resizeStartBox!.height / 2,
  }
  await page.mouse.move(resizeStart.x, resizeStart.y)
  await page.mouse.down()
  await page.mouse.move(resizeStart.x + 60, resizeStart.y + 45)
  await page.mouse.up()

  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  const resizedArtwork = await scaledRoot.boundingBox()
  const resizedOverlay = await selectionBox.boundingBox()
  const resizedHandle = await resizeHandle.boundingBox()
  const resizedLogicalGeometry = await scaledRoot.evaluate((node) => {
    const element = node as HTMLElement
    return {
      x: Number.parseFloat(element.style.left),
      y: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }
  })
  expect(resizedArtwork).toBeTruthy()
  expect(resizedOverlay).toBeTruthy()
  expect(resizedHandle).toBeTruthy()
  expect(resizedArtwork!.width).toBeGreaterThan(beforeArtwork!.width)
  expect(resizedArtwork!.height).toBeGreaterThan(beforeArtwork!.height)
  const expectedWidth = initialLogicalGeometry.width + 60 / interactionScale / 1.5
  const expectedHeight = initialLogicalGeometry.height + 45 / interactionScale / 1.5
  expect(resizedLogicalGeometry.width).toBeCloseTo(expectedWidth, 3)
  expect(resizedLogicalGeometry.height).toBeCloseTo(expectedHeight, 3)
  expect(resizedLogicalGeometry.x).toBeCloseTo(
    initialLogicalGeometry.x + (expectedWidth - initialLogicalGeometry.width) / 4,
    3,
  )
  expect(resizedLogicalGeometry.y).toBeCloseTo(
    initialLogicalGeometry.y + (expectedHeight - initialLogicalGeometry.height) / 4,
    3,
  )
  expect.soft(Math.abs(resizedArtwork!.x - beforeArtwork!.x), 'resize visual left').toBeLessThanOrEqual(1)
  expect.soft(Math.abs(resizedArtwork!.y - beforeArtwork!.y), 'resize visual top').toBeLessThanOrEqual(1)
  expectBoxesToMatch(resizedOverlay!, resizedArtwork!, 'resized selection overlay')
  expect.soft(
    Math.abs(
      resizedHandle!.x + resizedHandle!.width / 2 - (resizedArtwork!.x + resizedArtwork!.width),
    ),
    'resize handle follows visual right',
  ).toBeLessThanOrEqual(1)
  expect.soft(
    Math.abs(
      resizedHandle!.y + resizedHandle!.height / 2 - (resizedArtwork!.y + resizedArtwork!.height),
    ),
    'resize handle follows visual bottom',
  ).toBeLessThanOrEqual(1)

  await page.getByRole('button', { name: '\u64a4\u9500', exact: true }).click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))
  await expect.poll(async () => {
    const restored = await scaledRoot.boundingBox()
    if (!restored) return Number.POSITIVE_INFINITY
    return Math.max(
      ...(['x', 'y', 'width', 'height'] as const).map((key) => (
        Math.abs(restored[key] - beforeArtwork![key])
      )),
    )
  }).toBeLessThanOrEqual(1)

  const canvas = page.getByTestId('freeform-canvas')
  const canvasBox = await canvas.boundingBox()
  expect(canvasBox).toBeTruthy()
  const canvasScale = await freeformCanvasScale(page)
  // Marquee from a point clear of the frame's corner handles (they resize).
  await page.mouse.move(
    canvasBox!.x + 465 * canvasScale,
    canvasBox!.y + 372 * canvasScale,
  )
  await page.mouse.down()
  await page.mouse.move(
    canvasBox!.x + 510 * canvasScale,
    canvasBox!.y + 390 * canvasScale,
  )
  await page.mouse.up()
  await expect(scaledRoot).toHaveAttribute('data-selected', 'true')

  const moveHistoryBefore = Number(await workspace.getAttribute('data-history-depth'))
  const moveStartBox = await moveHandle.boundingBox()
  expect(moveStartBox).toBeTruthy()
  const moveStart = {
    x: moveStartBox!.x + moveStartBox!.width / 2,
    y: moveStartBox!.y + moveStartBox!.height / 2,
  }
  await page.mouse.move(moveStart.x, moveStart.y)
  await page.mouse.down()
  await page.mouse.move(moveStart.x + 300, moveStart.y + 160)
  await page.mouse.up()

  await expect(workspace).toHaveAttribute('data-history-depth', String(moveHistoryBefore + 1))
  const movedArtwork = await scaledRoot.boundingBox()
  expect(movedArtwork).toBeTruthy()
  expect(Math.abs(movedArtwork!.x + movedArtwork!.width - canvasBox!.x - canvasBox!.width))
    .toBeLessThanOrEqual(1)
  expect(Math.abs(movedArtwork!.y + movedArtwork!.height - canvasBox!.y - canvasBox!.height))
    .toBeLessThanOrEqual(1)

  await page.getByRole('button', { name: '\u64a4\u9500', exact: true }).click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(moveHistoryBefore))
  await expect.poll(async () => {
    const restored = await scaledRoot.boundingBox()
    if (!restored) return Number.POSITIVE_INFINITY
    return Math.max(
      ...(['x', 'y', 'width', 'height'] as const).map((key) => (
        Math.abs(restored[key] - beforeArtwork![key])
      )),
    )
  }).toBeLessThanOrEqual(1)
})

test('locked canvas hits preserve an existing selection', async ({ page }) => {
  await openNestedV3Draft(page, `locked-hit-${Date.now()}`)

  const selectedSceneNodeIds = () => page.locator(
    '[data-scene-node-id][data-selected="true"]',
  ).evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.sceneNodeId))
  const unlocked = page.locator('[data-scene-node-id="scaled-root"]')
  const lockedRootLeaf = page.locator('[data-scene-node-id="locked-root-leaf"]')
  const lockedRootDescendant = page.locator('[data-scene-node-id="locked-root-group-leaf"]')
  const effectiveLockedDescendant = page.locator('[data-scene-node-id="locked-text"]')

  const expectLockedHitToKeepSelection = async (
    hit: import('@playwright/test').Locator,
    modifiers?: ('Shift')[],
  ) => {
    await unlocked.click()
    await expect(unlocked).toHaveAttribute('data-selected', 'true')
    await hit.click(modifiers ? { modifiers } : undefined)
    expect.soft(await selectedSceneNodeIds()).toEqual(['scaled-root'])
  }

  await expectLockedHitToKeepSelection(lockedRootLeaf)
  await expectLockedHitToKeepSelection(lockedRootDescendant)
  await expectLockedHitToKeepSelection(lockedRootDescendant, ['Shift'])
  await expectLockedHitToKeepSelection(effectiveLockedDescendant)
})

test('live move ignores ArrowRight before pointerup and commits one history entry', async ({ page }) => {
  await openNestedV3Draft(page, `live-move-up-${Date.now()}`)

  const workspace = page.locator('.freeform-workspace')
  await expect(workspace).toHaveAttribute('data-history-depth', '0')
  const element = page.locator('[data-scene-node-id="scaled-root"]')
  await element.click()
  const before = await element.boundingBox()
  expect(before).toBeTruthy()
  const handle = page.getByTestId('freeform-selection-move')
  const handleBox = await handle.boundingBox()
  expect(handleBox).toBeTruthy()
  const start = {
    x: handleBox!.x + handleBox!.width / 2,
    y: handleBox!.y + handleBox!.height / 2,
  }

  await handle.dispatchEvent('pointerdown', {
    pointerId: 71,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 71,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 30,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await expect.poll(async () => (await element.boundingBox())?.x).not.toBeCloseTo(before!.x, 1)

  await page.keyboard.press('ArrowRight')
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 71,
      pointerType: 'touch',
    }))
  })

  await expect.soft(workspace).toHaveAttribute('data-history-depth', '1')
  const undo = page.getByRole('button', { name: '\u64a4\u9500', exact: true })
  await undo.click()
  await expect.poll(async () => {
    const restored = await element.boundingBox()
    if (!restored) return Number.POSITIVE_INFINITY
    return Math.max(
      ...(['x', 'y', 'width', 'height'] as const).map((key) => Math.abs(restored[key] - before![key])),
    )
  }).toBeLessThanOrEqual(1)
  await expect.soft(undo).toBeDisabled()
})

test('live move ignores ArrowRight before pointercancel and restores complete history', async ({ page }) => {
  await openNestedV3Draft(page, `live-move-cancel-${Date.now()}`)

  const workspace = page.locator('.freeform-workspace')
  await expect(workspace).toHaveAttribute('data-history-depth', '0')
  const element = page.locator('[data-scene-node-id="scaled-root"]')
  await element.click()
  const before = await element.boundingBox()
  expect(before).toBeTruthy()
  const handle = page.getByTestId('freeform-selection-move')
  const handleBox = await handle.boundingBox()
  expect(handleBox).toBeTruthy()
  const start = {
    x: handleBox!.x + handleBox!.width / 2,
    y: handleBox!.y + handleBox!.height / 2,
  }

  await handle.dispatchEvent('pointerdown', {
    pointerId: 72,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 72,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 30,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await expect.poll(async () => (await element.boundingBox())?.x).not.toBeCloseTo(before!.x, 1)

  await page.keyboard.press('ArrowRight')
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 72,
      pointerType: 'touch',
    }))
  })

  const geometryDistanceFromStart = async () => {
    const current = await element.boundingBox()
    if (!current) return Number.POSITIVE_INFINITY
    return Math.max(
      ...(['x', 'y', 'width', 'height'] as const).map((key) => Math.abs(current[key] - before![key])),
    )
  }
  await expect.poll(geometryDistanceFromStart).toBeLessThanOrEqual(1)
  await expect.soft(workspace).toHaveAttribute('data-history-depth', '0')
  const undo = page.getByRole('button', { name: '\u64a4\u9500', exact: true })
  await expect.soft(undo).toBeDisabled()
  if (await undo.isEnabled()) {
    await undo.click()
    await expect.poll(geometryDistanceFromStart).toBeLessThanOrEqual(1)
  }
})

test('nested group export stays identical across themes and preview zooms', async ({ page }) => {
  await openNestedV3Draft(page, `nested-group-export-${Date.now()}`)

  async function downloadCurrent() {
    await openExportMenu(page)
    const exportButton = page.getByTestId('freeform-primary-export')
    await expect(exportButton).toBeEnabled()
    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloadPromise
    const path = await download.path()
    if (!path) throw new Error('missing nested group PNG path')
    await expect(exportButton).toBeEnabled()
    return path
  }

  await setFreeformZoom(page, 50)
  const lightPath = await downloadCurrent()
  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await setFreeformZoom(page, 400)
  const darkPath = await downloadCurrent()

  expect(readPngSize(await readFile(lightPath))).toEqual({ width: 800, height: 600 })
  expect(readPngSize(await readFile(darkPath))).toEqual({ width: 800, height: 600 })
  expect(await pngPixelDigest(page, lightPath)).toBe(await pngPixelDigest(page, darkPath))
  for (const [x, y] of [[20, 20], [400, 300], [720, 520]]) {
    expect(await samplePngPixel(page, lightPath, x, y)).toEqual(
      await samplePngPixel(page, darkPath, x, y),
    )
  }
})

test('saves and restores a freeform draft', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await insertText(page)
  await page.getByLabel('文本内容').fill('保存恢复测试')

  await signUpToSave(page, `freeform-${Date.now()}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await expect(page.getByLabel('文本内容')).toContainText('保存恢复测试')
})

test('exports mixed-size slides as a zip after warning', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  const trigger = page.getByTestId('page-size-trigger')
  await trigger.click()
  await page.getByRole('button', { name: '9:16', exact: true }).click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await trigger.click()
  await page.getByRole('button', { name: '16:9', exact: true }).click()

  await openExportMenu(page)
  await page.getByTestId('freeform-export-all').click()
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
  await page.goto('/#/edit/canvas')
  await page.getByRole('button', { name: '新增页面' }).click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await page.getByRole('button', { name: '新增页面' }).click()

  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await expect(page.getByTestId('freeform-export-all')).toHaveText('打包下载全部 4 页')
  await page.getByTestId('freeform-export-all').click()
  // Progress shows on the trigger and on the button itself.
  await expect(page.getByTestId('freeform-export')).toHaveText(/导出 \d+\/4/)
  await expect(page.getByTestId('freeform-export-all')).toHaveText(/导出 \d+\/4/)
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
  await page.goto('/#/edit/md')
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await page.keyboard.press('Delete')
  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(elements).toHaveCount(1)
})

test('hidden freeform workspace does not handle undo', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(1)
  await page.goto('/#/edit/md')
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await page.keyboard.press('Control+z')
  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
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
  await page.locator('.freeform-inspector').getByRole('button', { name: '左对齐' }).click()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 120 },
    { x: 100, y: 240 },
  ])
})

test('selection keeps artwork order', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 220, 220)
  await insertShape(page)
  await setSelectedElementBox(page, 180, 180, 220, 220)

  const canvas = page.getByTestId('freeform-canvas')
  const canvasBox = await canvas.boundingBox()
  expect(canvasBox).toBeTruthy()
  const scale = await freeformCanvasScale(page)
  const point = {
    x: canvasBox!.x + 280 * scale,
    y: canvasBox!.y + 280 * scale,
  }
  const topArtworkIsSelected = () => page.evaluate(({ x, y }) => {
    const hit = document.elementsFromPoint(x, y)
      .map((node) => node.closest<HTMLElement>('[data-testid="freeform-element"]'))
      .find((node): node is HTMLElement => Boolean(node))
    return hit?.getAttribute('data-selected') === 'true'
  }, point)

  expect(await topArtworkIsSelected()).toBe(true)

  await page.mouse.click(
    canvasBox!.x + 120 * scale,
    canvasBox!.y + 120 * scale,
  )
  await expect(page.getByTestId('freeform-element').first()).toHaveAttribute(
    'data-selected',
    'true',
  )

  expect(await topArtworkIsSelected()).toBe(false)
})

test('selection overlay hit targets stay accessible across zooms', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 240, 260, 180, 140)

  const controls = [
    {
      testId: 'freeform-selection-move',
      name: '\u79fb\u52a8\u5bf9\u8c61',
    },
    {
      testId: 'freeform-selection-resize',
      name: '\u8c03\u6574\u5927\u5c0f',
    },
  ] as const

  for (const zoom of [50, 100, 150]) {
    await setFreeformZoom(page, zoom)
    for (const control of controls) {
      const handle = page.getByTestId(control.testId)
      await expect(handle).toHaveAccessibleName(control.name)
      const box = await handle.boundingBox()
      expect(box, `${control.testId} missing at ${zoom}%`).toBeTruthy()
      expect(box!.width, `${control.testId} width at ${zoom}%`).toBeGreaterThanOrEqual(28)
      expect(box!.height, `${control.testId} height at ${zoom}%`).toBeGreaterThanOrEqual(28)

      await handle.focus()
      await expect(handle).toBeFocused()
      expect(await handle.evaluate((node) => {
        const style = getComputedStyle(node)
        const hasOutline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
        return hasOutline || (style.boxShadow !== 'none' && style.boxShadow !== '')
      }), `${control.testId} focus ring at ${zoom}%`).toBe(true)
    }
  }
})

test('selection overlay edge handles keep a real 28px hit span', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  await setSelectedElementBox(page, 0, 0, 180, 140)
  const moveHandle = page.getByTestId('freeform-selection-move')
  const moveBox = await moveHandle.boundingBox()
  expect(moveBox).toBeTruthy()
  const moveX = moveBox!.x + moveBox!.width / 2
  expect(await locatorOwnsPoint(moveHandle, moveX, moveBox!.y + 2)).toBe(true)
  expect(await locatorOwnsPoint(moveHandle, moveX, moveBox!.y + 29)).toBe(true)

  await setSelectedElementBox(page, 900, 1300, 180, 140)
  const resizeHandle = page.getByTestId('freeform-selection-resize')
  const resizeBox = await resizeHandle.boundingBox()
  expect(resizeBox).toBeTruthy()
  const resizeCenterX = resizeBox!.x + resizeBox!.width / 2
  const resizeCenterY = resizeBox!.y + resizeBox!.height / 2
  expect(await locatorOwnsPoint(resizeHandle, resizeBox!.x + 2, resizeCenterY)).toBe(true)
  expect(await locatorOwnsPoint(resizeHandle, resizeBox!.x + 29, resizeCenterY)).toBe(true)
  expect(await locatorOwnsPoint(resizeHandle, resizeCenterX, resizeBox!.y + 2)).toBe(true)
  expect(await locatorOwnsPoint(resizeHandle, resizeCenterX, resizeBox!.y + 29)).toBe(true)
})

test('leaf pointercancel cleanup move ignores foreign pointer streams', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const before = await freeformElementBoxes(page)
  const handle = page.getByTestId('freeform-selection-move')
  const box = await handle.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }

  await handle.dispatchEvent('pointerdown', {
    pointerId: 41,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 42,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 42,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
  }, start)
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)

  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 41,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
  }, start)
  await expect.poll(() => freeformElementBoxes(page)).not.toEqual(before)

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 42,
      pointerType: 'touch',
    }))
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 41,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
})

test('leaf pointercancel cleanup resize ignores foreign pointer streams', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const before = await freeformElementBoxes(page)
  const handle = page.getByTestId('freeform-selection-resize')
  const box = await handle.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }

  await handle.dispatchEvent('pointerdown', {
    pointerId: 51,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 52,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 52,
      pointerType: 'touch',
    }))
  }, start)
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'resize',
  )

  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 51,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
  }, start)
  await expect.poll(() => freeformElementBoxes(page)).not.toEqual(before)
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 51,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
})

test('leaf pointercancel cleanup move', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const workspace = page.locator('.freeform-workspace')
  const historyDepth = await workspace.getAttribute('data-history-depth')
  expect(historyDepth).not.toBeNull()
  const before = await freeformElementBoxes(page)
  const elementBox = await page.getByTestId('freeform-element').boundingBox()
  expect(elementBox).toBeTruthy()
  const scale = await freeformCanvasScale(page)
  const start = {
    x: elementBox!.x + elementBox!.width / 2,
    y: elementBox!.y + elementBox!.height / 2,
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (390 - 5) * scale, start.y)
  const overlay = page.getByTestId('freeform-selection-overlay')
  await expect(overlay).toHaveAttribute('data-live-interaction', 'move')
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(1)

  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })))
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
  await expect(overlay).not.toHaveAttribute('data-live-interaction', /.+/)
  await expect(workspace).toHaveAttribute('data-history-depth', historyDepth!)
  await page.mouse.up()
})

test('leaf pointercancel cleanup resize', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const workspace = page.locator('.freeform-workspace')
  const historyDepth = await workspace.getAttribute('data-history-depth')
  expect(historyDepth).not.toBeNull()
  const before = await freeformElementBoxes(page)
  const resizeHandle = page.getByTestId('freeform-selection-resize')
  const handleBox = await resizeHandle.boundingBox()
  expect(handleBox).toBeTruthy()
  const scale = await freeformCanvasScale(page)
  const start = {
    x: handleBox!.x + handleBox!.width / 2,
    y: handleBox!.y + handleBox!.height / 2,
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 80 * scale, start.y + 60 * scale)
  const overlay = page.getByTestId('freeform-selection-overlay')
  await expect(overlay).toHaveAttribute('data-live-interaction', 'resize')
  await expect.poll(() => freeformElementBoxes(page)).not.toEqual(before)

  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })))
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
  await expect(overlay).not.toHaveAttribute('data-live-interaction', /.+/)
  await expect(workspace).toHaveAttribute('data-history-depth', historyDepth!)
  await page.mouse.up()
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
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 100 * scale, start.y + 40 * scale)
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
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (390 - 5) * scale, start.y)
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
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (600 - 5) * scale, start.y)
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
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (280 - 5) * scale, start.y)
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
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (390 - 5) * scale, start.y)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(1)

  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })))
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

test('long runs of keyboard edits log no React update-depth warning', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await insertTwoSelectedRectangles(page)

  // Each edit used to trigger effects that set state to what it already was;
  // after about 50 edits in a row React logs this warning.
  for (let index = 0; index < 60; index += 1) await page.keyboard.press('Shift+ArrowDown')
  for (let index = 0; index < 60; index += 1) await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 100 },
    { x: 320, y: 120 },
  ])
  for (let index = 0; index < 60; index += 1) await page.keyboard.press('ControlOrMeta+D')
  await expect(page.getByTestId('freeform-element')).toHaveCount(122)

  expect(errors.filter((text) => text.includes('Maximum update depth'))).toEqual([])
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
  const scale = await freeformCanvasScale(page)
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
  const scale = await freeformCanvasScale(page)
  const start = { x: box!.x + 70 * scale, y: box!.y + 70 * scale }
  const end = { x: box!.x + 500 * scale, y: box!.y + 290 * scale }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y)
  await page.mouse.up()

  await expect(selectedFreeformElements(page)).toHaveCount(2)

  await page.locator('.freeform-inspector').getByRole('button', { name: '左对齐' }).click()

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
  expect(await freeformElementPositions(page)).toEqual([
    { x: 100, y: 160 },
    { x: 400, y: 160 },
  ])
  await insertShape(page)
  await setSelectedElementBox(page, 800, 160, 100, 100)

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 160 },
    { x: 400, y: 160 },
    { x: 800, y: 160 },
  ])

  await page.locator('.freeform-element').nth(0).click({ modifiers: ['Shift'] })
  await page.locator('.freeform-element').nth(1).click({ modifiers: ['Shift'] })
  await page.locator('.freeform-inspector').getByRole('button', { name: '水平均分' }).click()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 160 },
    { x: 450, y: 160 },
    { x: 800, y: 160 },
  ])
})

test('layers tab exposes a reverse accessible tree with roving keyboard focus', async ({ page }) => {
  await openNestedV3Draft(page, `layers-tree-${Date.now()}`)

  const tablist = page.getByRole('tablist', { name: '自由编辑面板' })
  await expect(tablist).toBeVisible()
  await expect(tablist.getByRole('tab')).toHaveCount(3)
  await tablist.getByRole('tab', { name: '图层', exact: true }).click()

  const panel = page.getByRole('tabpanel', { name: '图层' })
  const tree = panel.getByRole('tree', { name: '图层树' })
  await expect(tree).toBeVisible()
  const rows = tree.getByRole('treeitem')
  await expect(rows).toHaveCount(12)
  await expect(rows.first()).toHaveAttribute('aria-label', 'Locked root group')
  await expect(rows.last()).toHaveAttribute('aria-label', 'Underlay')
  await expect(tree.getByRole('treeitem', { name: 'Scope text' })).toHaveAttribute('aria-level', '2')
  await expect(tree.getByRole('treeitem', { name: 'Locked text' })).toHaveAttribute('aria-level', '3')
  const outerGroup = tree.getByRole('treeitem', { name: 'Outer group' })
  const ownedGroupId = await outerGroup.getAttribute('aria-owns')
  expect(ownedGroupId).toBeTruthy()
  await expect(tree.locator(`[id="${ownedGroupId}"]`)).toHaveAttribute('role', 'group')
  await expect(tree.locator('[tabindex="0"]')).toHaveCount(1)

  await rows.first().focus()
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked root group')
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked root group leaf')
  await page.keyboard.press('Home')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked root group')
  await page.keyboard.press('End')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Underlay')
})

test('layers tab keeps independent panel linkage and tree state across tab switches', async ({ page }) => {
  await openNestedV3Draft(page, `layers-tab-state-${Date.now()}`)

  const tablist = page.getByRole('tablist', { name: '自由编辑面板' })
  const propertiesTab = tablist.getByRole('tab', { name: '属性', exact: true })
  const layersTab = tablist.getByRole('tab', { name: '图层', exact: true })
  const propertiesPanelId = await propertiesTab.getAttribute('aria-controls')
  const layersPanelId = await layersTab.getAttribute('aria-controls')
  expect(propertiesPanelId).toBeTruthy()
  expect(layersPanelId).toBeTruthy()
  expect(propertiesPanelId).not.toBe(layersPanelId)
  await expect(page.locator(`#${propertiesPanelId}`)).toHaveAttribute('aria-labelledby', await propertiesTab.getAttribute('id'))
  await expect(page.locator(`#${layersPanelId}`)).toHaveAttribute('aria-labelledby', await layersTab.getAttribute('id'))

  await layersTab.click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await outer.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toHaveCount(0)

  await propertiesTab.click()
  await expect(page.getByRole('tabpanel', { name: '属性' })).toBeVisible()
  await layersTab.click()
  await expect(page.getByRole('tabpanel', { name: '图层' })).toBeVisible()
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toHaveCount(0)
  await expect(outer).toHaveAttribute('tabindex', '0')
})

test('layers tree selects deep nodes in their parent scope and rejects cross-parent toggles', async ({ page }) => {
  await openNestedV3Draft(page, `layers-selection-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })

  const deepRow = tree.getByRole('treeitem', { name: 'Scope text' })
  await deepRow.click()
  await expect(deepRow).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'outer')
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]')).toHaveCount(1)

  const sibling = tree.getByRole('treeitem', { name: 'Visible leaf' })
  await sibling.focus()
  await page.keyboard.press('Space')
  await expect(deepRow).toHaveAttribute('aria-selected', 'true')
  await expect(sibling).toHaveAttribute('aria-selected', 'true')

  const rootRow = tree.getByRole('treeitem', { name: 'Underlay' })
  await rootRow.focus()
  await page.keyboard.press('Space')
  await expect(deepRow).toHaveAttribute('aria-selected', 'true')
  await expect(sibling).toHaveAttribute('aria-selected', 'true')
  await expect(panelLiveRegion(page)).toContainText('只能同时选择同一组内的图层')
})

test('layers tree renames with F2 and reorders siblings with Alt arrows', async ({ page }) => {
  await openNestedV3Draft(page, `layers-edit-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const scopeRow = tree.getByRole('treeitem', { name: 'Scope text' })
  await scopeRow.focus()
  await page.keyboard.press('F2')
  const renameInput = page.getByRole('textbox', { name: '重命名图层' })
  await expect(renameInput).toBeVisible()
  await renameInput.fill('')
  await page.keyboard.press('Enter')
  await expect(tree.getByRole('treeitem', { name: '文本' })).toBeVisible()

  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  await underlay.focus()
  await page.keyboard.press('Alt+ArrowUp')
  const rootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootLabels.indexOf('Underlay')).toBe(3)
  await expect(panelLiveRegion(page)).toContainText('Underlay')
})

test('layers tabs and tree directional keys stay in the panel without canvas nudges', async ({ page }) => {
  await openNestedV3Draft(page, `layers-keyboard-${Date.now()}`)

  const tablist = page.getByRole('tablist', { name: '自由编辑面板' })
  const propertiesTab = tablist.getByRole('tab', { name: '属性', exact: true })
  const layersTab = tablist.getByRole('tab', { name: '图层', exact: true })
  const historyTab = tablist.getByRole('tab', { name: '历史', exact: true })
  await propertiesTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(layersTab).toHaveAttribute('aria-selected', 'true')
  await expect(layersTab).toBeFocused()
  await expect(page.locator(`#${await layersTab.getAttribute('aria-controls')}`)).toHaveAttribute(
    'aria-labelledby',
    await layersTab.getAttribute('id'),
  )
  await page.keyboard.press('Home')
  await expect(propertiesTab).toHaveAttribute('aria-selected', 'true')
  await expect(propertiesTab).toBeFocused()
  await propertiesTab.focus()
  await page.keyboard.press('End')
  await expect(historyTab).toHaveAttribute('aria-selected', 'true')
  await expect(historyTab).toBeFocused()
  await layersTab.click()

  const tree = page.getByRole('tree', { name: '图层树' })
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await outer.focus()
  await expect(outer).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toHaveCount(0)
  await expect(outer).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Hidden inner')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Outer group')

  const scaled = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await scaled.click()
  const before = await page.locator('[data-scene-node-id="scaled-root"]').getAttribute('style')
  await scaled.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveAttribute('style', before ?? '')
})

test('layers selection reconciles after delete, undo, and switching the active page', async ({ page }) => {
  await openNestedV3Draft(page, `layers-reconcile-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const scopeRow = tree.getByRole('treeitem', { name: 'Scope text' })
  await scopeRow.click()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'outer')

  await page.keyboard.press('Delete')
  await expect(tree.getByRole('treeitem', { name: 'Scope text' })).toHaveCount(0)
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]')).toHaveCount(0)

  await page.keyboard.press('Control+z')
  await expect(tree.getByRole('treeitem', { name: 'Scope text' })).toBeVisible()
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]')).toHaveCount(0)

  await duplicateCurrentPage(page)
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', '')
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]')).toHaveCount(0)
})

test('layers selection resets when another draft opens in the same workspace mount', async ({ page }) => {
  await openNestedV3Draft(page, `layers-draft-identity-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Scope text' }).click()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'outer')

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    if (!key) throw new Error('draft storage key missing')
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]')
    const source = structuredClone(drafts[0])
    source.id = 'other-freeform-draft'
    source.title = 'Other freeform draft'
    source.updatedAt += 1
    source.document.activeSlideId = 'other-slide'
    source.document.slides = [{
      ...source.document.slides[0],
      id: 'other-slide',
      name: 'Other slide',
      nodes: [source.document.slides[0].nodes[0]],
    }]
    localStorage.setItem(key, JSON.stringify([...drafts, source]))
  })
  await page.goto('/#/edit/canvas/other-freeform-draft')
  await expect(page.getByTestId('editor-title')).toHaveText('Other freeform draft')

  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', '')
  await expect(page.locator('[data-scene-node-id][data-selected="true"]')).toHaveCount(0)
  await expect(page.getByRole('tree', { name: '图层树' }).getByRole('treeitem')).toHaveCount(1)
})

test('layers reorder keeps a stable same-parent selection and does not write history at boundaries', async ({ page }) => {
  await openNestedV3Draft(page, `layers-reorder-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  const scaled = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await underlay.click()
  await scaled.focus()
  await page.keyboard.press('Space')
  await expect(underlay).toHaveAttribute('aria-selected', 'true')
  await expect(scaled).toHaveAttribute('aria-selected', 'true')

  const rootIdsBefore = await page.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  await underlay.focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled()
  await expect(underlay).toHaveAttribute('aria-selected', 'true')
  await expect(scaled).toHaveAttribute('aria-selected', 'true')
  const rootIdsAfterMove = await page.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootIdsAfterMove).not.toEqual(rootIdsBefore)
  expect(rootIdsAfterMove.filter((name) => name === 'Underlay' || name === 'Scaled root leaf')).toEqual([
    'Scaled root leaf',
    'Underlay',
  ])

  await page.keyboard.press('Control+z')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  const rootIdsAfterUndo = await page.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootIdsAfterUndo).toEqual(rootIdsBefore)

  await page.keyboard.press('Control+y')
  const rootIdsAfterRedo = await page.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootIdsAfterRedo).toEqual(rootIdsAfterMove)
  await expect(page.getByRole('button', { name: '重做', exact: true })).toBeDisabled()
  await expect(panelLiveRegion(page)).toContainText(/第 \d+ 层/)
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()

  await underlay.click()
  await underlay.focus()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('layers drag reorders adjacent siblings and rejects cross-parent drops', async ({ page }) => {
  await openNestedV3Draft(page, `layers-drag-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await underlay.dragTo(outer)
  const rootsAfterDrop = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootsAfterDrop.slice(-2)).toEqual(['Underlay', 'Outer group'])

  const scope = tree.getByRole('treeitem', { name: 'Scope text' })
  await scope.dragTo(underlay)
  await expect(panelLiveRegion(page)).toContainText('图层只能在同一组内排序')
  const rootsAfterRejectedDrop = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootsAfterRejectedDrop).toEqual(rootsAfterDrop)
})

test('layers drag moves a non-adjacent sibling to the exact visual drop position', async ({ page }) => {
  await openNestedV3Draft(page, `layers-drag-distance-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const source = tree.getByRole('treeitem', { name: 'Underlay' })
  const target = tree.getByRole('treeitem', { name: 'Locked root group', exact: true })
  const initialRootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  await source.dragTo(target)

  const visualRootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(visualRootLabels.slice(0, 2)).toEqual(['Underlay', 'Locked root group'])
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled()
  await page.keyboard.press('Control+z')
  const rootsAfterUndo = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootsAfterUndo).toEqual(initialRootLabels)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('layers drag inserts a non-contiguous selection as one block and ignores selected targets', async ({ page }) => {
  await openNestedV3Draft(page, `layers-drag-selection-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const scaled = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  const target = tree.getByRole('treeitem', { name: 'Locked root leaf', exact: true })
  await scaled.click()
  await underlay.focus()
  await page.keyboard.press('Space')

  const initialRootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  await underlay.dragTo(scaled)
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(initialRootLabels)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()

  await underlay.dragTo(target)
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual([
    'Locked root group',
    'Scaled root leaf',
    'Underlay',
    'Locked root leaf',
    'Outer group',
  ])
  await expect(panelLiveRegion(page)).toContainText('已移动 2 个图层至 Locked root leaf 上方')
  await page.keyboard.press('Control+z')
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(initialRootLabels)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('layer rename by double click is one undoable and redoable edit', async ({ page }) => {
  await openNestedV3Draft(page, `layers-rename-history-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const row = tree.getByRole('treeitem', { name: 'Scope text' })
  await row.locator('.freeform-layer-name').dblclick()
  const input = page.getByRole('textbox', { name: '重命名图层' })
  await input.fill('Caption layer')
  await page.keyboard.press('Enter')
  await expect(tree.getByRole('treeitem', { name: 'Caption layer' })).toBeVisible()
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled()

  await page.keyboard.press('Control+z')
  await expect(tree.getByRole('treeitem', { name: 'Scope text' })).toBeVisible()
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  await page.keyboard.press('Control+y')
  await expect(tree.getByRole('treeitem', { name: 'Caption layer' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重做', exact: true })).toBeDisabled()
})

test('layer rename does not submit while an IME composition is active', async ({ page }) => {
  await openNestedV3Draft(page, `layers-rename-ime-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Scope text' }).press('F2')
  const input = page.getByRole('textbox', { name: '重命名图层' })
  await input.dispatchEvent('compositionstart')
  await input.fill('输入中')
  await input.press('Enter')
  await expect(input).toBeVisible()
  await input.dispatchEvent('compositionend')
  await input.press('Enter')
  await expect(tree.getByRole('treeitem', { name: '输入中' })).toBeVisible()
})

test('layer tree restores deterministic row focus after delete and collapse', async ({ page }) => {
  await openNestedV3Draft(page, `layers-focus-fallback-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const scope = tree.getByRole('treeitem', { name: 'Scope text' })
  await scope.click()
  await scope.focus()
  await page.keyboard.press('Delete')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Visible leaf')

  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await outer.focus()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Outer group')
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toHaveCount(0)
})

test('hidden group export excludes hidden pixels while preserving tree management and focus fallback', async ({ page }) => {
  await openNestedV3Draft(page, `layers-hide-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')

  const scope = tree.getByRole('treeitem', { name: 'Scope text' })
  await scope.click()
  await scope.focus()
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  const hideScope = scope.getByRole('button', { name: '隐藏图层 Scope text' })
  await expect(hideScope).toHaveAttribute('aria-pressed', 'false')

  await hideScope.dblclick()
  await expect(hideScope).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('textbox', { name: '重命名图层' })).toHaveCount(0)
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await page.keyboard.press('Control+z')
  await expect(hideScope).toHaveAttribute('aria-pressed', 'false')

  await scope.evaluate((element) => {
    element.addEventListener('dragstart', () => {
      ;(element as HTMLElement).dataset.actionDragStarted = 'true'
    }, { once: true })
  })
  const hideScopeBox = await hideScope.boundingBox()
  expect(hideScopeBox).toBeTruthy()
  await page.mouse.move(hideScopeBox!.x + hideScopeBox!.width / 2, hideScopeBox!.y + hideScopeBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(hideScopeBox!.x + 32, hideScopeBox!.y + hideScopeBox!.height / 2)
  await page.mouse.up()
  await expect(scope).not.toHaveAttribute('data-action-drag-started', 'true')
  await expect(hideScope).toHaveAttribute('aria-pressed', 'false')

  await scope.focus()
  await page.keyboard.press('Tab')
  await expect(hideScope).toBeFocused()
  await expect(hideScope).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Enter')
  await expect(hideScope).toHaveAttribute('aria-pressed', 'true')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(scope).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-scene-node-id="scope-text"]')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Visible leaf')

  await page.keyboard.press('Control+z')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))
  await expect(page.locator('[data-scene-node-id="scope-text"]')).toHaveCount(1)
  await page.keyboard.press('Control+y')
  await expect(page.locator('[data-scene-node-id="scope-text"]')).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-scene-node-id="scope-text"]')).toHaveCount(1)

  const scaledRoot = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await scaledRoot.click()
  await expect(page.getByTestId('freeform-selection-box')).toHaveCount(1)
  await scaledRoot.getByRole('button', { name: '隐藏图层 Scaled root leaf' }).click()
  await expect(scaledRoot).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveCount(0)
  await expect(page.getByTestId('freeform-selection-box')).toHaveCount(0)
  await page.keyboard.press('Control+z')

  const visibleLeaf = tree.getByRole('treeitem', { name: 'Visible leaf' })
  await visibleLeaf.focus()
  await visibleLeaf.getByRole('button', { name: '隐藏图层 Visible leaf' }).click()
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Scope text')
  await page.keyboard.press('Control+z')

  const lockedGroupLeaf = tree.getByRole('treeitem', { name: 'Locked root group leaf' })
  await lockedGroupLeaf.focus()
  await lockedGroupLeaf.getByRole('button', { name: '隐藏图层 Locked root group leaf' }).click()
  await expect(lockedGroupLeaf).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked root group')
  await page.keyboard.press('Control+z')

  const hiddenGroup = tree.getByRole('treeitem', { name: 'Hidden inner' })
  const hiddenGroupToggle = hiddenGroup.getByRole('button', { name: '隐藏图层 Hidden inner' })
  await expect(hiddenGroupToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(hiddenGroupToggle).toHaveAttribute('title', '显示 Hidden inner')
  const hiddenLeaf = tree.getByRole('treeitem', { name: 'Hidden leaf' })
  const hiddenLeafDescription = await hiddenLeaf.getAttribute('aria-describedby')
  expect(hiddenLeafDescription).toBeTruthy()
  await expect(page.locator(`[id="${hiddenLeafDescription}"]`)).toContainText('受父级隐藏影响')
  await expect(hiddenLeaf.locator('[title="受父级隐藏影响"]')).toBeVisible()

  const hiddenLeafToggle = hiddenLeaf.getByRole('button', { name: '隐藏图层 Hidden leaf' })
  await hiddenLeafToggle.focus()
  await expect(hiddenLeafToggle).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(hiddenLeafToggle).toBeFocused()
  await expect(hiddenLeafToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(panelLiveRegion(page)).toContainText('已设为自身隐藏，仍受父级隐藏影响')

  await hiddenGroupToggle.click()
  await expect(hiddenGroupToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-scene-node-id="hidden-leaf"]')).toHaveCount(0)
  await hiddenLeafToggle.click()
  await expect(hiddenLeafToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-scene-node-id="hidden-leaf"]')).toHaveCount(1)

  await hiddenGroupToggle.click()
  await expect(hiddenGroup).toBeVisible()
  await expect(page.locator('[data-scene-node-id="hidden-leaf"]')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked inner')

  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()
  expect(await samplePngPixel(page, path!, 400, 300)).toEqual([252, 165, 165, 255])
})

test('locks nested layers against editing and cancels an active IME composition', async ({ page }) => {
  await openNestedV3Draft(page, `layers-lock-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const scope = tree.getByRole('treeitem', { name: 'Scope text' })
  await scope.click()

  const textbox = page.locator('[data-scene-node-id="scope-text"] [role="textbox"]')
  await expect(textbox).toHaveAttribute('contenteditable', 'true')
  await textbox.focus()
  await textbox.dispatchEvent('compositionstart')
  await textbox.evaluate((element) => {
    element.textContent = '未授权的组合输入'
  })

  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  const lockScope = scope.getByRole('button', { name: '锁定图层 Scope text' })
  await expect(lockScope).toHaveAttribute('aria-pressed', 'false')
  const lockScopeBox = await lockScope.boundingBox()
  expect(lockScopeBox).toBeTruthy()
  await page.mouse.move(lockScopeBox!.x + lockScopeBox!.width / 2, lockScopeBox!.y + lockScopeBox!.height / 2)
  await page.mouse.down()
  await expect(textbox).toBeFocused()
  await page.mouse.up()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(lockScope).toHaveAttribute('aria-pressed', 'true')
  await expect(scope).toHaveAttribute('aria-selected', 'true')
  await expect(textbox).toHaveAttribute('contenteditable', 'false')
  await expect(textbox).toHaveAttribute('aria-readonly', 'true')
  await expect(textbox).toHaveCSS('cursor', 'default')
  await expect(textbox).toHaveText('Enter group to edit')
  await textbox.dispatchEvent('compositionend')
  await expect(textbox).toHaveText('Enter group to edit')

  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const lockBanner = page.getByTestId('freeform-lock-banner')
  await expect(lockBanner).toContainText('已锁定')
  await expect(page.getByTestId('inspector-geometry')).toHaveCount(0)
  const unlock = lockBanner.getByRole('button', { name: '解锁 Scope text' })
  await unlock.focus()
  await page.keyboard.press('Enter')
  await expect(lockBanner).toHaveCount(0)
  await expect(page.getByRole('tab', { name: '属性', exact: true })).toBeFocused()
  await expect(textbox).toHaveAttribute('contenteditable', 'true')
  await expect(textbox).toHaveText('Enter group to edit')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 2))
  await page.keyboard.press('Control+z')
  await expect(textbox).toHaveAttribute('contenteditable', 'false')
  await page.keyboard.press('Control+y')
  await expect(textbox).toHaveAttribute('contenteditable', 'true')

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const scaledRoot = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await scaledRoot.click()
  const interactionLock = scaledRoot.getByRole('button', { name: '锁定图层 Scaled root leaf' })
  const interactionHide = scaledRoot.getByRole('button', { name: '隐藏图层 Scaled root leaf' })
  const moveHandle = page.getByTestId('freeform-selection-move')
  const moveHandleBox = await moveHandle.boundingBox()
  expect(moveHandleBox).toBeTruthy()
  const interactionHistory = await workspace.getAttribute('data-history-depth')
  const interactionStyleBefore = await page
    .locator('[data-scene-node-id="scaled-root"]')
    .getAttribute('style')
  await page.mouse.move(moveHandleBox!.x + moveHandleBox!.width / 2, moveHandleBox!.y + moveHandleBox!.height / 2)
  await page.mouse.down()
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute('data-live-interaction', 'move')
  await page.mouse.move(
    moveHandleBox!.x + moveHandleBox!.width / 2 + 18,
    moveHandleBox!.y + moveHandleBox!.height / 2 + 10,
  )
  await expect.poll(
    () => page.locator('[data-scene-node-id="scaled-root"]').getAttribute('style'),
  ).not.toBe(interactionStyleBefore)
  const interactionMovedStyle = await page
    .locator('[data-scene-node-id="scaled-root"]')
    .getAttribute('style')
  await interactionLock.evaluate((element) => (element as HTMLButtonElement).click())
  await interactionHide.evaluate((element) => (element as HTMLButtonElement).click())
  await expect(interactionLock).toHaveAttribute('aria-pressed', 'false')
  await expect(interactionHide).toHaveAttribute('aria-pressed', 'false')
  await expect(workspace).toHaveAttribute('data-history-depth', interactionHistory ?? '')
  await page.mouse.up()
  await expect(workspace).toHaveAttribute(
    'data-history-depth',
    String(Number(interactionHistory) + 1),
  )
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveAttribute(
    'style',
    interactionStyleBefore ?? '',
  )
  await page.keyboard.press('Control+y')
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveAttribute(
    'style',
    interactionMovedStyle ?? '',
  )

  const lockedRoot = tree.getByRole('treeitem', { name: 'Locked root leaf' })
  await lockedRoot.focus()
  await page.keyboard.press('Space')
  await expect(scaledRoot).toHaveAttribute('aria-selected', 'true')
  await expect(lockedRoot).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('freeform-selection-box')).toHaveCount(1)
  await expect(page.getByTestId('freeform-selection-box'))
    .toHaveAttribute('data-element-id', 'scaled-root')
  const rootStyle = await page.locator('[data-scene-node-id="locked-root-leaf"]').getAttribute('style')
  const scaledStyle = await page.locator('[data-scene-node-id="scaled-root"]').getAttribute('style')
  const rootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  // Earlier edits in this test save themselves; locked rejections must not unsave anything.
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  const lockedHistory = await workspace.getAttribute('data-history-depth')
  await scaledRoot.focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(panelLiveRegion(page)).toContainText('图层已锁定，无法调整层级')
  await lockedRoot.focus()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(panelLiveRegion(page)).toContainText('图层已锁定，无法调整层级')
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(rootLabels)

  await page.locator('[data-scene-node-id="locked-root-leaf"]').click({ position: { x: 10, y: 10 } })
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()

  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const lockedInspector = page.getByRole('tabpanel', { name: '属性' })
  for (const section of [
    'inspector-geometry',
    'inspector-typography',
    'inspector-fill',
    'inspector-stroke',
    'inspector-arrange',
    'inspector-danger',
  ]) {
    await expect(page.getByTestId(section)).toHaveCount(0)
  }
  await expect(lockedInspector.locator('input, textarea, [role="combobox"]')).toHaveCount(0)
  await page.getByTestId('freeform-lock-banner').getByRole('button').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()
  await page.keyboard.press('Delete')
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await expect(page.locator('[data-scene-node-id="locked-root-leaf"]')).toHaveAttribute(
    'style',
    rootStyle ?? '',
  )
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveAttribute(
    'style',
    scaledStyle ?? '',
  )
  await expect(workspace).toHaveAttribute('data-history-depth', lockedHistory ?? '')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  await scaledRoot.dragTo(underlay)
  await expect(panelLiveRegion(page)).toContainText('图层已锁定，无法调整层级')
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(rootLabels)
  await lockedRoot.dragTo(underlay)
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(rootLabels)
  await expect(workspace).toHaveAttribute('data-history-depth', lockedHistory ?? '')

  await openExportMenu(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('freeform-primary-export').click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()
  expect(await samplePngPixel(page, path!, 720, 45)).toEqual([148, 163, 184, 255])
})

test('locked layer metadata remains manageable through inherited state and reload', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await openNestedV3Draft(page, `layers-lock-metadata-${Date.now()}`, true)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const lockedText = tree.getByRole('treeitem', { name: 'Locked text' })
  const ownLock = lockedText.getByRole('button', { name: '锁定图层 Locked text' })
  await expect(ownLock).toHaveAttribute('aria-pressed', 'false')
  await expect(lockedText).toHaveAttribute('data-effective-locked', 'true')
  const lockedTextDescription = await lockedText.getAttribute('aria-describedby')
  expect(lockedTextDescription).toBeTruthy()
  await expect(page.locator(`[id="${lockedTextDescription}"]`)).toContainText('受父级锁定影响')
  await expect(lockedText.locator('[title="受父级锁定影响"]')).toBeVisible()
  await ownLock.click()
  await ownLock.click()
  await expect(ownLock).toHaveAttribute('aria-pressed', 'false')
  await expect(panelLiveRegion(page)).toContainText('已取消自身锁定，仍受父级锁定影响')

  const scaledRoot = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await scaledRoot.click()
  await page.keyboard.press('Control+c')
  await lockedText.click()
  const historyBeforePaste = await workspace.getAttribute('data-history-depth')
  const rowCountBeforePaste = await tree.getByRole('treeitem').count()
  await page.keyboard.press('Control+v')
  await expect(tree.getByRole('treeitem')).toHaveCount(rowCountBeforePaste)
  await expect(workspace).toHaveAttribute('data-history-depth', historyBeforePaste ?? '')
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()

  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const inheritedUnlock = page
    .getByTestId('freeform-lock-banner')
    .getByRole('button', { name: '解锁 Locked inner' })
  await inheritedUnlock.focus()
  await expect(inheritedUnlock).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()
  await inheritedUnlock.focus()
  await expect(inheritedUnlock).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-scene-node-id="locked-text"] [role="textbox"]'))
    .toHaveAttribute('contenteditable', 'true')
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-scene-node-id="locked-text"] [role="textbox"]'))
    .toHaveAttribute('contenteditable', 'false')
  await page.keyboard.press('Control+y')
  await expect(page.locator('[data-scene-node-id="locked-text"] [role="textbox"]'))
    .toHaveAttribute('contenteditable', 'true')

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await lockedText.getByRole('button', { name: '锁定图层 Locked text' }).click()
  await expect(lockedText).toHaveAttribute('data-effective-locked', 'true')
  const lockedInner = tree.getByRole('treeitem', { name: 'Locked inner' })
  await lockedInner.getByRole('button', { name: '锁定图层 Locked inner' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const doubleLockBanner = page.getByTestId('freeform-lock-banner')
  await expect(doubleLockBanner.getByRole('button', { name: '解锁 Locked text' })).toBeVisible()
  await doubleLockBanner.getByRole('button', { name: '解锁 Locked text' }).click()
  await expect(doubleLockBanner.getByRole('button', { name: '解锁 Locked inner' })).toBeVisible()
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await lockedText.getByRole('button', { name: '锁定图层 Locked text' }).click()
  await lockedInner.getByRole('button', { name: '锁定图层 Locked inner' }).click()
  await expect(lockedText.getByRole('button', { name: '锁定图层 Locked text' }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(lockedText).toHaveAttribute('data-effective-locked', 'true')
  await expect(lockedText).toHaveAttribute('aria-selected', 'true')

  // Move focus with the panel's own keyboard navigation: the raw .focus()
  // call races the panel's roving focus and intermittently never lands, which
  // made F2 rename the previously focused row instead of this one.
  await page.keyboard.press('ArrowDown')
  await expect(lockedText).toBeFocused()
  await page.keyboard.press('F2')
  const renameInput = page.getByRole('textbox', { name: '重命名图层' })
  await renameInput.fill('Protected caption')
  await page.keyboard.press('Enter')
  const renamed = tree.getByRole('treeitem', { name: 'Protected caption' })
  await renamed.getByRole('button', { name: '隐藏图层 Protected caption' }).click()
  await expect(renamed).toBeVisible()
  await expect(page.locator('[data-scene-node-id="locked-text"]')).toHaveCount(0)

  const deepLayer = tree.getByRole('treeitem', { name: 'Deep layer label remains readable' })
  await expect(deepLayer).toHaveAttribute('aria-level', '25')
  await expect(deepLayer).toHaveAttribute('data-effective-locked', 'true')
  await expect(deepLayer).toHaveAttribute('data-effective-hidden', 'true')
  await expect(deepLayer.locator('[title="受父级隐藏和锁定影响"]')).toBeVisible()
  await expect(deepLayer.locator('.freeform-layer-depth')).toHaveText('25')
  await expect(deepLayer.locator('.freeform-layer-depth')).toHaveAttribute('title', '第 25 层')
  await deepLayer.click()
  await expect(renamed.locator('.freeform-layer-actions')).toHaveCSS('opacity', '1')
  expect(await renamed.getByRole('button', { name: '隐藏图层 Protected caption' }).evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  )).not.toBe('rgba(0, 0, 0, 0)')

  const lightHiddenStyles = await renamed.evaluate((row) => {
    const name = row.querySelector<HTMLElement>('.freeform-layer-name')!
    const panel = row.closest<HTMLElement>('.freeform-right-panel')!
    const nameStyle = getComputedStyle(name)
    return {
      opacity: nameStyle.opacity,
      color: nameStyle.color,
      background: getComputedStyle(panel).backgroundColor,
    }
  })
  expect(lightHiddenStyles.opacity).toBe('1')
  expect(contrastRatio(lightHiddenStyles.color, lightHiddenStyles.background)).toBeGreaterThanOrEqual(4.5)

  const treeMetrics = await tree.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(treeMetrics.scrollWidth).toBeLessThanOrEqual(treeMetrics.clientWidth)
  expect(await renamed.locator('.freeform-layer-name').evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(50)

  const deepGeometry = await deepLayer.evaluate((row) => {
    const name = row.querySelector<HTMLElement>('.freeform-layer-name')!.getBoundingClientRect()
    const actions = row.querySelector<HTMLElement>('.freeform-layer-actions')!.getBoundingClientRect()
    const tree = row.closest<HTMLElement>('[role="tree"]')!
    return {
      nameWidth: name.width,
      nameRight: name.right,
      actionsLeft: actions.left,
      treeClientWidth: tree.clientWidth,
      treeScrollWidth: tree.scrollWidth,
    }
  })
  expect(deepGeometry.nameWidth).toBeGreaterThan(40)
  expect(deepGeometry.nameRight).toBeLessThanOrEqual(deepGeometry.actionsLeft + 0.5)
  expect(deepGeometry.treeScrollWidth).toBeLessThanOrEqual(deepGeometry.treeClientWidth)

  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const restoredTree = page.getByRole('tree', { name: '图层树' })
  const restored = restoredTree.getByRole('treeitem', { name: 'Protected caption' })
  await expect(restored.getByRole('button', { name: '锁定图层 Protected caption' }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(restored.getByRole('button', { name: '隐藏图层 Protected caption' }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-scene-node-id="locked-text"]')).toHaveCount(0)
  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await restored.hover()
  await expect.poll(
    () => restored.locator('.freeform-layer-actions').evaluate(
      (element) => getComputedStyle(element).opacity,
    ),
  ).toBe('1')
  const darkActionStyles = await restored.locator('.freeform-layer-actions').evaluate((element) => {
    const action = getComputedStyle(element)
    const button = getComputedStyle(element.querySelector('button')!)
    return {
      opacity: action.opacity,
      background: action.backgroundColor,
      color: button.color,
    }
  })
  expect(darkActionStyles.opacity).toBe('1')
  expect(contrastRatio(darkActionStyles.color, darkActionStyles.background)).toBeGreaterThan(3)
  expect(await restored.getByRole('button', { name: '隐藏图层 Protected caption' }).evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  )).not.toBe('rgba(0, 0, 0, 0)')
  const darkHiddenStyles = await restored.evaluate((row) => {
    const name = row.querySelector<HTMLElement>('.freeform-layer-name')!
    const panel = row.closest<HTMLElement>('.freeform-right-panel')!
    const nameStyle = getComputedStyle(name)
    return {
      opacity: nameStyle.opacity,
      color: nameStyle.color,
      background: getComputedStyle(panel).backgroundColor,
    }
  })
  expect(darkHiddenStyles.opacity).toBe('1')
  expect(contrastRatio(darkHiddenStyles.color, darkHiddenStyles.background)).toBeGreaterThanOrEqual(4.5)
  await restored.getByRole('button', { name: '隐藏图层 Protected caption' }).click()
  await expect(page.locator('[data-scene-node-id="locked-text"] [role="textbox"]'))
    .toHaveAttribute('contenteditable', 'false')
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

test('delayed shape image fill cannot write into another draft with the same scene ids', async ({
  page,
}) => {
  await openNestedV3Draft(page, `shape-fill-draft-race-${Date.now()}`)

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    if (!key) throw new Error('draft storage key missing')
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]')
    const source = structuredClone(drafts[0])
    source.id = 'shape-fill-race-target'
    source.title = 'Shape fill race target'
    source.updatedAt += 1
    localStorage.setItem(key, JSON.stringify([...drafts, source]))
  })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Scaled root leaf' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await installShapeFillFileReaderGate(page)

  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'delayed-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await page.goto('/#/edit/canvas/shape-fill-race-target')
  await expect(page.getByTestId('editor-title')).toHaveText('Shape fill race target')
  await releaseShapeFillFileReaderGate(page)
  await expect.poll(() => page.evaluate(() => {
    const images = JSON.parse(sessionStorage.getItem('slicer.images.v1') ?? '{}')
    return Object.keys(images).length
  })).toBeGreaterThan(0)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Scaled root leaf' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const shapeFill = page.getByTestId('shape-fill-paint')
  await expect(shapeFill.getByTestId('paint-mode-solid')).toHaveClass(/\bon\b/)
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(0)

  await restoreShapeFillFileReaderGate(page)
})

test('delayed shape image fill cannot write across account identity changes', async ({ page }) => {
  const accountSuffix = Date.now()
  await openNestedV3Draft(page, `shape-fill-user-race-${accountSuffix}-a`)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Scaled root leaf' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await installShapeFillFileReaderGate(page)
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'cross-account-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await page.getByTestId('account-menu').click()
  await page.getByTestId('account-logout').click()
  await expect(page.getByTestId('account-login')).toBeVisible()
  await page.getByTestId('account-login').click()
  await registerUser(page, `shape-fill-user-race-${accountSuffix}-b`)
  await expect(page.getByTestId('account-menu')).toBeVisible()

  // B opens a project with the same scene ids before A's pending read is released
  // (no reload, so the read is still pending). A stale completion would therefore
  // be visible in B's active document and draft.
  await page.goto('/#/projects')
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'same-scene.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(nestedV3Draft().document)),
  })
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  const bFillBefore = await page.evaluate(() => {
    const userId = localStorage.getItem('slicer.session.v1')
    if (!userId) throw new Error('session user missing after registration')
    const drafts = JSON.parse(localStorage.getItem(`slicer.drafts.${userId}`) ?? '[]') as Array<{
      document?: { slides?: Array<{ nodes?: Array<{ id: string; fill?: unknown }> }> }
    }>
    const node = drafts.at(-1)?.document?.slides?.[0]?.nodes?.find((candidate) => (
      candidate.id === 'scaled-root'
    ))
    return node?.fill
  })
  expect(bFillBefore).toMatchObject({ type: 'solid' })

  await releaseShapeFillFileReaderGate(page)
  await expect.poll(() => page.evaluate(() => {
    const images = JSON.parse(sessionStorage.getItem('slicer.images.v1') ?? '{}')
    return Object.keys(images).length
  })).toBeGreaterThan(0)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Scaled root leaf' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const shapeFill = page.getByTestId('shape-fill-paint')
  await expect(shapeFill.getByTestId('paint-mode-solid')).toHaveClass(/\bon\b/)
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(0)

  // Save after release so a late reducer update cannot hide behind an unsaved
  // in-memory state; the persisted B draft must still contain the original fill.
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  const bFillAfter = await page.evaluate(() => {
    const userId = localStorage.getItem('slicer.session.v1')
    if (!userId) throw new Error('session user missing after release')
    const drafts = JSON.parse(localStorage.getItem(`slicer.drafts.${userId}`) ?? '[]') as Array<{
      document?: { slides?: Array<{ nodes?: Array<{ id: string; fill?: unknown }> }> }
    }>
    const node = drafts.at(-1)?.document?.slides?.[0]?.nodes?.find((candidate) => (
      candidate.id === 'scaled-root'
    ))
    return node?.fill
  })
  expect(bFillAfter).toEqual(bFillBefore)

  await restoreShapeFillFileReaderGate(page)
})

test('delayed shape image fill survives the first save of the same document', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('account-login').click()
  await registerUser(page, `shape-fill-first-save-${Date.now()}`)
  await insertShape(page)

  await installShapeFillFileReaderGate(page)
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'first-save-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await releaseShapeFillFileReaderGate(page)

  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
  await restoreShapeFillFileReaderGate(page)
})

test('shape image fill accepts only the newest pending upload', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))

  await installShapeFillFileReaderGate(page)
  const input = page.locator('.freeform-properties-tabpanel input.freeform-file')
  await input.setInputFiles({
    name: 'older-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)
  await input.setInputFiles({
    name: 'newer-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page, 2)

  await releaseShapeFillFileReaderGate(page, 2)
  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await restoreShapeFillFileReaderGate(page)
})

test('shape image fill operations are isolated by target path', async ({ page }) => {
  await openNestedV3Draft(page, `shape-fill-target-isolation-${Date.now()}`)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Visible leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await installShapeFillFileReaderGate(page)
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'nested-target-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scaled root leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'root-target-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page, 2)

  await releaseShapeFillFileReaderGate(page, 2)
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(2)
  await restoreShapeFillFileReaderGate(page)
})

test('manual shape fill changes cancel a pending image upload', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await installShapeFillFileReaderGate(page)
  const input = page.locator('.freeform-properties-tabpanel input.freeform-file')
  await input.setInputFiles({
    name: 'cancelled-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  const shapeFill = page.getByTestId('shape-fill-paint')
  await shapeFill.getByTestId('paint-mode-linear-gradient').click()
  await expect(shapeFill.getByTestId('paint-mode-linear-gradient')).toHaveClass(/\bon\b/)
  await releaseShapeFillFileReaderGate(page)

  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(0)
  await expect(page.getByTestId('freeform-shape')).toHaveCSS('background-image', /linear-gradient/)
  await restoreShapeFillFileReaderGate(page)
})

test('pending shape fill does not commit while a live pointer interaction is active', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const move = page.getByTestId('freeform-selection-move').first()
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()

  await installShapeFillFileReaderGate(page)
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'live-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  const start = {
    x: moveBox!.x + moveBox!.width / 2,
    y: moveBox!.y + moveBox!.height / 2,
  }
  await move.dispatchEvent('pointerdown', {
    pointerId: 91,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 91,
      pointerType: 'touch',
      clientX: x + 24,
      clientY: y + 18,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  await releaseShapeFillFileReaderGate(page)
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(0)

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 91,
      pointerType: 'touch',
    }))
  })
  await restoreShapeFillFileReaderGate(page)
})

test('delayed shape image fill follows the original nested path after same-document selection changes', async ({
  page,
}) => {
  await openNestedV3Draft(page, `shape-fill-selection-race-${Date.now()}`)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const shapeRow = tree.getByRole('treeitem', { name: 'Visible leaf' })
  await shapeRow.click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await installShapeFillFileReaderGate(page)

  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'same-document-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const textRow = tree.getByRole('treeitem', { name: 'Scope text' })
  await textRow.click()
  await expect(textRow).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]'))
    .toHaveCount(1)

  await releaseShapeFillFileReaderGate(page)
  await expect.poll(() => page.evaluate(() => {
    const images = JSON.parse(sessionStorage.getItem('slicer.images.v1') ?? '{}')
    return Object.keys(images).length
  })).toBeGreaterThan(0)

  await expect(textRow).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]'))
    .toHaveCount(1)
  await shapeRow.click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
  await expect(page.getByTestId('shape-fill-paint').getByTestId('paint-mode-image'))
    .toHaveClass(/\bon\b/)

  await restoreShapeFillFileReaderGate(page)
})

test('groups non-contiguous layers from the panel and ungroups promoted paths', async ({ page }) => {
  await openNestedV3Draft(page, `group-panel-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const layerA = tree.getByRole('treeitem', { name: 'Layer A' })
  const layerC = tree.getByRole('treeitem', { name: 'Layer C' })
  await layerA.click()
  await layerC.focus()
  await page.keyboard.press('Space')
  await expect(layerA).toHaveAttribute('aria-selected', 'true')
  await expect(layerC).toHaveAttribute('aria-selected', 'true')

  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  await page.getByTestId('freeform-group-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  // The grouping is an edit, so it saves itself.
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  const selectedGroup = page.locator('.freeform-scene-group[data-selected="true"]')
  await expect(selectedGroup).toHaveCount(1)
  const groupId = await selectedGroup.getAttribute('data-scene-node-id')
  expect(groupId).toBeTruthy()
  const rootIdsAfterGroup = await page.locator('.freeform-artwork-clip > [data-scene-node-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-scene-node-id')))
  expect(rootIdsAfterGroup).toEqual(['layer-b', groupId, 'layer-d', 'locked-container'])
  const groupedChildIds = await selectedGroup.locator(':scope > [data-scene-node-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-scene-node-id')))
  expect(groupedChildIds).toEqual(['layer-a', 'layer-c'])

  await page.getByTestId('freeform-ungroup-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 2))
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(0)
  const selectedLabels = await tree.locator('[role="treeitem"][aria-selected="true"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')))
  expect(selectedLabels).toEqual(['Layer C', 'Layer A'])
  const allIds = await page.getByTestId('freeform-canvas').locator('[data-scene-node-id]')
    .evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-scene-node-id')).filter(Boolean),
  )
  expect(new Set(allIds).size).toBe(allIds.length)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(1)
  await expect(page.getByTestId('freeform-canvas').locator('[data-selected="true"]')).toHaveCount(0)
})

test('group and ungroup shortcuts share the command layer for nested groups', async ({ page }) => {
  await openNestedV3Draft(page, `group-shortcuts-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  const layerB = tree.getByRole('treeitem', { name: 'Layer B' })
  await layerB.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ControlOrMeta+g')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(1)
  await expect(workspace).toHaveAttribute('data-history-depth', '1')

  const layerC = tree.getByRole('treeitem', { name: 'Layer C' })
  await layerC.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ControlOrMeta+g')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(2)
  await expect(workspace).toHaveAttribute('data-history-depth', '2')

  await page.keyboard.press('ControlOrMeta+Shift+g')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(1)
  await expect(workspace).toHaveAttribute('data-history-depth', '3')
  const selectedLabels = await tree.locator('[role="treeitem"][aria-selected="true"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')))
  expect(selectedLabels).toEqual(['Layer C', '组'])
})

test('grouping rejects locked selections and locked parent insertion without dirty history', async ({ page }) => {
  await openNestedV3Draft(page, `group-locked-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const lockedA = tree.getByRole('treeitem', { name: 'Locked child A' })
  const lockedB = tree.getByRole('treeitem', { name: 'Locked child B' })
  await lockedA.click()
  await lockedB.focus()
  await page.keyboard.press('Space')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.getByTestId('freeform-group-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('锁定')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.keyboard.press('ControlOrMeta+g')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('锁定')

  await page.getByTestId('freeform-text-tool').click()
  await page.getByTestId('insert-text').click()
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('锁定')
  await expect(tree.getByRole('treeitem', { name: '文本' })).toHaveCount(0)

  await tree.getByRole('treeitem', { name: 'Locked container' }).click()
  await page.getByTestId('freeform-ungroup-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('锁定')
})

test('group command rejects a single layer without changing history', async ({ page }) => {
  await openNestedV3Draft(page, `group-single-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const workspace = page.locator('.freeform-workspace')
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Layer A' })
    .click()
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await page.getByTestId('freeform-group-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('至少选择两个同级图层')
})

test('focused ungroup button keeps Enter as a native button command', async ({ page }) => {
  await openNestedV3Draft(page, `group-button-enter-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  const layerB = tree.getByRole('treeitem', { name: 'Layer B' })
  await layerB.focus()
  await page.keyboard.press('Space')
  await page.getByTestId('freeform-group-selection').click()
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(1)

  const ungroupButton = page.getByTestId('freeform-ungroup-selection')
  await ungroupButton.focus()
  await page.keyboard.press('Enter')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(0)
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', '')
})

test('canvas group scope enters by double click or Enter and exits one level per Escape', async ({ page }) => {
  await openNestedV3Draft(page, `group-scope-${Date.now()}`, false, scopeNavigationDraft)
  const workspace = page.locator('.freeform-workspace')
  const canvas = page.getByTestId('freeform-canvas')
  const leaf = page.locator('[data-scene-node-id="scope-leaf"]')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await leaf.click()
  await expect(page.locator('[data-scene-node-id="scope-outer"][data-selected="true"]')).toHaveCount(1)
  await leaf.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await expect(canvas.locator('[data-selected="true"]')).toHaveCount(0)
  await expect(page.getByTestId('freeform-scope-breadcrumb')).toContainText('页面')
  await expect(page.getByTestId('freeform-scope-breadcrumb')).toContainText('Scope outer')

  await page.locator('[data-scene-node-id="scope-leaf"]').click()
  await expect(page.locator('[data-scene-node-id="scope-inner"][data-selected="true"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer/scope-inner')
  await expect(canvas.locator('[data-selected="true"]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await page.keyboard.press('Escape')
  await expect(canvas).toHaveAttribute('data-active-group-path', '')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
})

test('nested text consumes the first Escape before leaving its group scope', async ({ page }) => {
  await openNestedV3Draft(page, `group-text-escape-${Date.now()}`, false, textScopeDraft)
  const canvas = page.getByTestId('freeform-canvas')
  const editable = page.locator('[data-scene-node-id="scope-text-edit"] [contenteditable="true"]')
  await page.locator('[data-scene-node-id="scope-text-edit"]').dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await editable.click()
  await expect(editable).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(editable).not.toBeFocused()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await page.keyboard.press('Escape')
  await expect(canvas).toHaveAttribute('data-active-group-path', '')
})

test('IME composition keeps Escape inside nested text editing until composition ends', async ({ page }) => {
  await openNestedV3Draft(page, `group-text-ime-escape-${Date.now()}`, false, textScopeDraft)
  const canvas = page.getByTestId('freeform-canvas')
  const editable = page.locator('[data-scene-node-id="scope-text-edit"] [contenteditable="true"]')
  await page.locator('[data-scene-node-id="scope-text-edit"]').dblclick()
  await page.getByTestId('freeform-canvas').locator('[data-scene-node-id="scope-text-edit"]')
    .click()
  await expect(editable).toBeFocused()
  await editable.dispatchEvent('compositionstart')

  await page.keyboard.press('Escape')
  await expect(editable).toBeFocused()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')

  await editable.dispatchEvent('compositionend')
  await page.keyboard.press('Escape')
  await expect(editable).not.toBeFocused()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
})

test('paint popover consumes Escape before leaving a nested group scope', async ({ page }) => {
  await openNestedV3Draft(page, `group-paint-escape-${Date.now()}`, false, scopeNavigationDraft)
  const canvas = page.getByTestId('freeform-canvas')
  const leaf = page.locator('[data-scene-node-id="scope-leaf"]')

  await leaf.click()
  await leaf.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await leaf.click()
  await page.keyboard.press('Enter')
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer/scope-inner')
  await leaf.click()
  await expect(leaf).toHaveAttribute('data-selected', 'true')

  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const trigger = page.getByTestId('shape-fill-paint').getByTestId('paint-color-button')
  await trigger.click()
  const popover = page.getByRole('dialog', { name: '填充 颜色 色板' })
  await expect(popover).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer/scope-inner')
  await expect(leaf).toHaveAttribute('data-selected', 'true')
  await expect(trigger).toBeFocused()
})

test('panel structure commands reject while a live pointer interaction is active', async ({ page }) => {
  await openNestedV3Draft(page, `group-live-move-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  const layerB = tree.getByRole('treeitem', { name: 'Layer B' })
  await layerB.focus()
  await page.keyboard.press('Space')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const before = await freeformElementBoxes(page)
  const move = page.getByTestId('freeform-selection-move').first()
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()
  const start = {
    x: moveBox!.x + moveBox!.width / 2,
    y: moveBox!.y + moveBox!.height / 2,
  }
  await move.dispatchEvent('pointerdown', {
    pointerId: 81,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 81,
      pointerType: 'touch',
      clientX: x + 40,
      clientY: y + 30,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  const rootOrderBeforeReorder = await tree.locator('[role="treeitem"][aria-level="1"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')))
  const liveGeometryBeforeReorder = await freeformElementBoxes(page)
  await tree.getByRole('treeitem', { name: 'Layer A' }).focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect.poll(() => freeformElementBoxes(page)).toEqual(liveGeometryBeforeReorder)
  await expect(tree.locator('[role="treeitem"][aria-level="1"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))))
    .resolves.toEqual(rootOrderBeforeReorder)

  await page.getByRole('button', { name: '关闭提示' }).click()
  await tree.getByRole('treeitem', { name: 'Layer A' }).dragTo(
    tree.getByRole('treeitem', { name: 'Layer D' }),
  )
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect.poll(() => freeformElementBoxes(page)).toEqual(liveGeometryBeforeReorder)
  await expect(tree.locator('[role="treeitem"][aria-level="1"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))))
    .resolves.toEqual(rootOrderBeforeReorder)

  await page.getByRole('button', { name: '关闭提示' }).click()
  await tree.getByRole('treeitem', { name: 'Layer A' }).focus()
  await page.keyboard.press('F2')
  const renameInput = page.getByRole('textbox', { name: '重命名图层' })
  await renameInput.fill('Blocked rename')
  await renameInput.press('Enter')
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(tree.getByRole('treeitem', { name: 'Layer A' })).toHaveCount(1)
  await expect(tree.getByRole('treeitem', { name: 'Blocked rename' })).toHaveCount(0)

  await page.getByRole('button', { name: '关闭提示' }).click()
  await page.getByTestId('freeform-text-tool').click()
  await page.getByTestId('insert-text').click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(tree.getByRole('treeitem', { name: '文本' })).toHaveCount(0)

  await page.getByTestId('freeform-group-selection').click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(0)

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 81,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')

  await page.getByRole('button', { name: '关闭提示' }).click()
  await tree.getByRole('treeitem', { name: 'Layer C' }).click()
  const resize = page.getByTestId('freeform-selection-resize')
  const resizeBox = await resize.boundingBox()
  expect(resizeBox).toBeTruthy()
  const resizeStart = {
    x: resizeBox!.x + resizeBox!.width / 2,
    y: resizeBox!.y + resizeBox!.height / 2,
  }
  await resize.dispatchEvent('pointerdown', {
    pointerId: 82,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: resizeStart.x,
    clientY: resizeStart.y,
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'resize',
  )
  await page.getByTestId('freeform-ungroup-selection').click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 82,
      pointerType: 'touch',
    }))
  })
})

test('autosave and export reject a transient live pointer snapshot', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await signUpToSave(page, `live-snapshot-${Date.now()}`)
  // Signing in starts a new selection scope; pick the shape again.
  await page.getByTestId('freeform-element').first().click()
  await expect(page.getByTestId('freeform-selection-move')).toHaveCount(1)
  const storedShape = () => page.evaluate(() => {
    const userId = localStorage.getItem('slicer.session.v1')
    const drafts = JSON.parse(localStorage.getItem(`slicer.drafts.${userId}`) ?? '[]') as Array<{
      document: { slides: Array<{ nodes: Array<{ x: number; y: number }> }> }
    }>
    const node = drafts[0]?.document.slides[0]?.nodes[0]
    return node ? { x: node.x, y: node.y } : null
  })
  const storedBefore = await storedShape()
  expect(storedBefore).not.toBeNull()
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const before = await freeformElementBoxes(page)
  const move = page.getByTestId('freeform-selection-move').first()
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()
  const start = {
    x: moveBox!.x + moveBox!.width / 2,
    y: moveBox!.y + moveBox!.height / 2,
  }

  await move.dispatchEvent('pointerdown', {
    pointerId: 83,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 83,
      pointerType: 'touch',
      clientX: x + 32,
      clientY: y + 20,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  // Well past the autosave pause, the half-dragged position is still not stored.
  await page.waitForTimeout(1200)
  expect(await storedShape()).toEqual(storedBefore)

  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await page.waitForTimeout(100)
  expect(downloads).toEqual([])
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 83,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  expect(await storedShape()).toEqual(storedBefore)
})

test('a second pointer cannot replace an active transform owner', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const before = await freeformElementBoxes(page)
  const move = page.getByTestId('freeform-selection-move').first()
  const resize = page.getByTestId('freeform-selection-resize').first()
  const moveBox = await move.boundingBox()
  const resizeBox = await resize.boundingBox()
  expect(moveBox).toBeTruthy()
  expect(resizeBox).toBeTruthy()

  await move.dispatchEvent('pointerdown', {
    pointerId: 85,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: moveBox!.x + moveBox!.width / 2,
    clientY: moveBox!.y + moveBox!.height / 2,
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  await resize.dispatchEvent('pointerdown', {
    pointerId: 86,
    pointerType: 'touch',
    isPrimary: false,
    button: 0,
    clientX: resizeBox!.x + resizeBox!.width / 2,
    clientY: resizeBox!.y + resizeBox!.height / 2,
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 86,
      pointerType: 'touch',
    }))
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 85,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
})

test('marquee pointercancel cleans up and ignores foreign pointer streams', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const canvas = page.getByTestId('freeform-canvas')
  const canvasBox = await canvas.boundingBox()
  expect(canvasBox).toBeTruthy()
  const start = {
    x: canvasBox!.x + 8,
    y: canvasBox!.y + 8,
  }

  await canvas.evaluate((node, point) => {
    const target = node.querySelector('.freeform-artwork-clip')
    if (!target) throw new Error('artwork target missing')
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 87,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: point.x,
      clientY: point.y,
    }))
  }, start)
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 88,
      pointerType: 'touch',
      clientX: x + 300,
      clientY: y + 300,
    }))
  }, start)
  await expect(page.locator('.freeform-marquee')).toHaveCount(1)
  const marqueeStyle = await page.locator('.freeform-marquee').getAttribute('style')

  await page.evaluate(({ x, y }) => {
    const target = document.querySelector<HTMLElement>('.freeform-artwork-clip')
    if (!target) throw new Error('artwork target missing')
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 89,
      pointerType: 'touch',
      isPrimary: false,
      button: 0,
      clientX: x + 10,
      clientY: y + 10,
    }))
  }, start)
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(page.locator('.freeform-marquee')).toHaveAttribute('style', marqueeStyle ?? '')

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 88,
      pointerType: 'touch',
    }))
  })
  await expect(page.locator('.freeform-marquee')).toHaveAttribute('style', marqueeStyle ?? '')
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 87,
      pointerType: 'touch',
    }))
  })
  await expect(page.locator('.freeform-marquee')).toHaveCount(0)
})

test('layer tree reports structural read-only state for a group with locked descendants', async ({ page }) => {
  await openNestedV3Draft(page, `group-locked-descendant-reorder-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  await underlay.click()
  const historyBefore = await workspace.getAttribute('data-history-depth')

  await outer.focus()
  await expect(outer).toHaveAttribute('aria-selected', 'false')
  await expect(outer).toHaveAttribute('draggable', 'false')
  await page.keyboard.press('Alt+ArrowUp')
  await expect(page.getByTestId('freeform-layer-live')).toContainText('锁定')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
})

test('opening another project cannot be rolled back by an old pointer cancellation', async ({ page }) => {
  await openNestedV3Draft(page, `group-live-open-${Date.now()}`, false, groupingDraft)
  await page.evaluate(() => {
    const userId = localStorage.getItem('slicer.session.v1')
    const key = `slicer.drafts.${userId}`
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]')
    const other = structuredClone(drafts[0])
    other.id = 'group-live-other'
    other.title = 'Group live other'
    other.updatedAt += 1
    localStorage.setItem(key, JSON.stringify([...drafts, other]))
  })
  const workspace = page.locator('.freeform-workspace')
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Layer A' })
    .click()
  const move = page.getByTestId('freeform-selection-move').first()
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()
  const start = {
    x: moveBox!.x + moveBox!.width / 2,
    y: moveBox!.y + moveBox!.height / 2,
  }

  await move.dispatchEvent('pointerdown', {
    pointerId: 84,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  await page.evaluate(() => {
    location.hash = '#/edit/canvas/group-live-other'
  })
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(page.getByTestId('editor-title')).toHaveText('Nested v3 scene')
  await expect(workspace).toHaveAttribute('data-history-depth', '0')

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 84,
      pointerType: 'touch',
    }))
  })
  await expect(page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Layer A' })).toHaveCount(1)
})

test('nested insertion preserves the active scope pre-insertion world center', async ({ page }) => {
  const fixture = offCenterScopeDraft()
  const parent = fixture.document.slides[0].nodes[0] as unknown as FreeformSceneNode
  if (parent.type !== 'group') throw new Error('offset fixture parent must be a group')
  const bounds = sceneNodesBoundsInParent(parent.children)
  if (!bounds) throw new Error('offset fixture bounds missing')
  const localCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
  const worldCenter = transformPoint(
    groupLocal(parent.x, parent.y, parent.rotation, parent.scale),
    localCenter,
  )

  await openNestedV3Draft(page, `group-offset-center-${Date.now()}`, false, () => structuredClone(fixture))
  const anchor = page.locator('[data-scene-node-id="offset-anchor"]')
  await anchor.dblclick()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'offset-parent')
  const parentLocator = page.locator('[data-scene-node-id="offset-parent"]')
  const leafWorldCenter = async (leaf: import('@playwright/test').Locator) => {
    const geometry = await leaf.evaluate((node) => {
      const parseNumber = (value: string, label: string) => {
        const parsed = Number.parseFloat(value)
        if (!Number.isFinite(parsed)) throw new Error(`invalid ${label}: ${value}`)
        return parsed
      }
      const readTransform = (element: HTMLElement) => {
        const rotation = element.style.transform.match(/rotate\((-?[\d.]+)deg\)/)?.[1]
        const scale = element.style.transform.match(/scale\((-?[\d.]+)\)/)?.[1]
        if (rotation === undefined || scale === undefined) {
          throw new Error(`invalid scene transform: ${element.style.transform}`)
        }
        return {
          x: parseNumber(element.style.left, 'x'),
          y: parseNumber(element.style.top, 'y'),
          rotation: parseNumber(rotation, 'rotation'),
          scale: parseNumber(scale, 'scale'),
        }
      }
      const element = node as HTMLElement
      const groups: ReturnType<typeof readTransform>[] = []
      let ancestor = element.parentElement?.closest<HTMLElement>('.freeform-scene-group') ?? null
      while (ancestor) {
        groups.push(readTransform(ancestor))
        ancestor = ancestor.parentElement?.closest<HTMLElement>('.freeform-scene-group') ?? null
      }
      return {
        leaf: {
          x: parseNumber(element.style.left, 'leaf x'),
          y: parseNumber(element.style.top, 'leaf y'),
          width: parseNumber(element.style.width, 'leaf width'),
          height: parseNumber(element.style.height, 'leaf height'),
        },
        groups,
      }
    })
    let center = {
      x: geometry.leaf.x + geometry.leaf.width / 2,
      y: geometry.leaf.y + geometry.leaf.height / 2,
    }
    geometry.groups.forEach((group) => {
      center = transformPoint(
        groupLocal(group.x, group.y, group.rotation, group.scale),
        center,
      )
    })
    return center
  }

  await insertText(page)
  const textNode = parentLocator.locator(':scope > [data-selected="true"]')
  const textCenter = await leafWorldCenter(textNode)
  expect(textCenter.x).toBeCloseTo(worldCenter.x, 3)
  expect(textCenter.y).toBeCloseTo(worldCenter.y, 3)

  await insertShape(page)
  const shapeNode = parentLocator.locator(':scope > [data-selected="true"]')
  const shapeCenter = await leafWorldCenter(shapeNode)
  expect(shapeCenter.x).toBeCloseTo(worldCenter.x, 3)
  expect(shapeCenter.y).toBeCloseTo(worldCenter.y, 3)
})

test('inserts all new scene nodes under the active group path', async ({ page }) => {
  await openNestedV3Draft(page, `group-insert-${Date.now()}`, false, scopeNavigationDraft)
  const leaf = page.locator('[data-scene-node-id="scope-leaf"]')
  await leaf.dblclick()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'scope-outer')
  const outer = page.locator('[data-scene-node-id="scope-outer"]')
  const directLeaves = () => outer.locator(':scope > [data-scene-leaf="true"]')
  await expect(directLeaves()).toHaveCount(1)

  await insertText(page)
  await expect(directLeaves()).toHaveCount(2)
  await insertShape(page)
  await expect(directLeaves()).toHaveCount(3)
  await insertLine(page, '直线')
  await expect(directLeaves()).toHaveCount(4)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'nested-image.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expect(directLeaves()).toHaveCount(5)
  await expect(outer.locator(':scope > [data-selected="true"]')).toHaveCount(1)
  const canvasBox = await page.getByTestId('freeform-canvas').boundingBox()
  const insertedBoxes = await directLeaves().evaluateAll((nodes) => nodes.slice(1).map((node) => {
    const box = node.getBoundingClientRect()
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
  }))
  expect(canvasBox).not.toBeNull()
  insertedBoxes.forEach((box) => {
    expect(box.right).toBeGreaterThan(canvasBox!.x)
    expect(box.bottom).toBeGreaterThan(canvasBox!.y)
    expect(box.left).toBeLessThan(canvasBox!.x + canvasBox!.width)
    expect(box.top).toBeLessThan(canvasBox!.y + canvasBox!.height)
  })
})

test('rotation handle accessibility remains stable for a nested group', async ({ page }) => {
  await openNestedV3Draft(page, `nested-group-transform-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  await tree.getByRole('treeitem', { name: 'Layer B' }).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('freeform-group-selection').click()

  const selection = page.getByTestId('freeform-selection-box')
  await expect(selection).toHaveAttribute('data-selection-kind', 'group')
  const rotate = page.getByTestId('freeform-selection-rotate')
  const zoomOut = page.getByRole('button', { name: '缩小画布' })
  for (let index = 0; index < 3; index += 1) {
    const box = await rotate.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.width).toBeGreaterThanOrEqual(28)
    expect(box!.height).toBeGreaterThanOrEqual(28)
    if (index < 2) await zoomOut.click()
  }
  await rotate.focus()
  await expect(rotate).toBeFocused()
  const outline = await rotate.evaluate((node) => getComputedStyle(node).outlineStyle)
  expect(outline).not.toBe('none')
})

test('nested group transforms keep one history entry per gesture', async ({ page }) => {
  await openNestedV3Draft(page, `nested-group-gestures-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  await tree.getByRole('treeitem', { name: 'Layer B' }).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('freeform-group-selection').click()
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  const group = page.locator('[data-testid="freeform-scene-group"][data-selected="true"]')
  const before = await group.getAttribute('style')

  const move = page.getByTestId('freeform-selection-move')
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()
  await move.dispatchEvent('pointerdown', {
    pointerId: 111,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: moveBox!.x + moveBox!.width / 2,
    clientY: moveBox!.y + moveBox!.height / 2,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 111,
      pointerType: 'touch',
      clientX: x + 30,
      clientY: y + 20,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 111,
      pointerType: 'touch',
      clientX: x + 30,
      clientY: y + 20,
    }))
  }, { x: moveBox!.x + moveBox!.width / 2, y: moveBox!.y + moveBox!.height / 2 })
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(group).not.toHaveAttribute('style', before ?? '')

  const rotate = page.getByTestId('freeform-selection-rotate')
  const rotateBox = await rotate.boundingBox()
  expect(rotateBox).toBeTruthy()
  await rotate.dispatchEvent('pointerdown', {
    pointerId: 112,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: rotateBox!.x + rotateBox!.width / 2,
    clientY: rotateBox!.y + rotateBox!.height / 2,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 112,
      pointerType: 'touch',
      clientX: x + 18,
      clientY: y + 26,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 112,
      pointerType: 'touch',
      clientX: x + 18,
      clientY: y + 26,
    }))
  }, { x: rotateBox!.x + rotateBox!.width / 2, y: rotateBox!.y + rotateBox!.height / 2 })
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 2))
})

test('cross-scope paste preserves world geometry with the page offset', async ({ page }) => {
  await openNestedV3Draft(page, `cross-scope-paste-${Date.now()}`, false, crossScopeClipboardDraft)
  const sourceLeaf = page.locator('[data-scene-node-id="clipboard-source-leaf"]')
  await sourceLeaf.dblclick()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute(
    'data-active-group-path',
    'clipboard-source',
  )
  await sourceLeaf.click()
  const sourceBox = await sourceLeaf.boundingBox()
  expect(sourceBox).toBeTruthy()
  await page.keyboard.press('Control+C')
  await page.keyboard.press('Escape')

  const targetLeaf = page.locator('[data-scene-node-id="clipboard-target-leaf"]')
  await targetLeaf.dblclick()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute(
    'data-active-group-path',
    'clipboard-target',
  )
  await page.keyboard.press('Control+V')
  const target = page.locator('[data-scene-node-id="clipboard-target"]')
  await expect(target.locator(':scope > [data-scene-leaf="true"]')).toHaveCount(2)
  const pasted = target.locator(
    ':scope > [data-scene-leaf="true"]:not([data-scene-node-id="clipboard-target-leaf"])',
  )
  const pastedId = await pasted.getAttribute('data-scene-node-id')
  expect(pastedId).not.toBe('clipboard-source-leaf')
  const pastedBox = await pasted.boundingBox()
  const canvasScale = await freeformCanvasScale(page)
  expect(pastedBox).toBeTruthy()
  expect((pastedBox!.x - sourceBox!.x) / canvasScale).toBeCloseTo(16, 2)
  expect((pastedBox!.y - sourceBox!.y) / canvasScale).toBeCloseTo(16, 2)
  expect(pastedBox!.width).toBeCloseTo(sourceBox!.width, 2)
  expect(pastedBox!.height).toBeCloseTo(sourceBox!.height, 2)
})

test('logical group alignment moves a group as one unit', async ({ page }) => {
  await openNestedV3Draft(page, `logical-group-alignment-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  await tree.getByRole('treeitem', { name: 'Layer B' }).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('freeform-group-selection').click()
  await tree.getByRole('treeitem', { name: 'Layer C' }).focus()
  await page.keyboard.press('Space')

  const layerA = page.locator('[data-scene-node-id="layer-a"]')
  const layerB = page.locator('[data-scene-node-id="layer-b"]')
  const layerC = page.locator('[data-scene-node-id="layer-c"]')
  const beforeA = await layerA.boundingBox()
  const beforeB = await layerB.boundingBox()
  expect(beforeA).toBeTruthy()
  expect(beforeB).toBeTruthy()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await page.locator('.freeform-inspector').getByRole('button', { name: '左对齐', exact: true }).click()

  const afterA = await layerA.boundingBox()
  const afterB = await layerB.boundingBox()
  const afterC = await layerC.boundingBox()
  expect(afterA).toBeTruthy()
  expect(afterB).toBeTruthy()
  expect(afterC).toBeTruthy()
  expect(Math.min(afterA!.x, afterB!.x)).toBeCloseTo(afterC!.x, 2)
  expect(afterB!.x - afterA!.x).toBeCloseTo(beforeB!.x - beforeA!.x, 3)
})

test('nested local nudge uses the inverse parent world matrix', async ({ page }) => {
  await openNestedV3Draft(page, `nested-local-nudge-${Date.now()}`, false, crossScopeClipboardDraft)
  const sourceLeaf = page.locator('[data-scene-node-id="clipboard-source-leaf"]')
  await sourceLeaf.dblclick()
  await sourceLeaf.click()
  const before = await sourceLeaf.boundingBox()
  const scale = await freeformCanvasScale(page)
  expect(before).toBeTruthy()
  await page.keyboard.press('ArrowRight')
  const after = await sourceLeaf.boundingBox()
  expect(after).toBeTruthy()
  expect((after!.x - before!.x) / scale).toBeCloseTo(1, 2)
})

test.describe('freeform canvas interaction polish', () => {
  async function canvasWorldPointAt(
    page: import('@playwright/test').Page,
    clientX: number,
    clientY: number,
  ) {
    return page.getByTestId('freeform-canvas').evaluate((canvas, point) => {
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / Number.parseFloat(canvas.style.width)
      return { x: (point.x - rect.left) / scale, y: (point.y - rect.top) / scale }
    }, { x: clientX, y: clientY })
  }

  async function elementRotationDegrees(
    page: import('@playwright/test').Page,
  ) {
    return page.getByTestId('freeform-element').evaluate((node) => {
      const transform = getComputedStyle(node).transform
      if (transform === 'none') return 0
      const matrix = new DOMMatrixReadOnly(transform)
      return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI
    })
  }

  test('ctrl+wheel zooms around the cursor while plain wheel still scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await selectFreeformPagePreset(page, '16:9')
    await setFreeformZoom(page, 200)
    const stage = page.locator('.freeform-stage-scroll')
    await stage.evaluate((node) => {
      node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2
      node.scrollTop = (node.scrollHeight - node.clientHeight) / 2
    })
    const value = page.getByTestId('freeform-zoom-value')
    await expect(value).toHaveText('200%')

    const stageBox = await stage.boundingBox()
    expect(stageBox).toBeTruthy()
    const cursor = {
      x: stageBox!.x + stageBox!.width * 0.6,
      y: stageBox!.y + stageBox!.height * 0.4,
    }
    const before = await canvasWorldPointAt(page, cursor.x, cursor.y)

    await page.mouse.move(cursor.x, cursor.y)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -120)
    await page.keyboard.up('Control')

    await expect(value).not.toHaveText('200%')
    const after = await canvasWorldPointAt(page, cursor.x, cursor.y)
    expect(after.x).toBeCloseTo(before.x, 0)
    expect(after.y).toBeCloseTo(before.y, 0)

    // Without Ctrl the wheel keeps scrolling the stage natively.
    await stage.evaluate((node) => { node.scrollTop = 0 })
    await page.mouse.wheel(0, 120)
    await expect.poll(() => stage.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
  })

  test('ctrl +/-/0 keyboard shortcuts step and reset the canvas zoom', async ({ page }) => {
    await openFreeform(page)
    const value = page.getByTestId('freeform-zoom-value')
    await expect(value).toHaveText('100%')

    await page.keyboard.press('Control+=')
    await expect(value).toHaveText('110%')
    await page.keyboard.press('Control+Shift+=')
    await expect(value).toHaveText('120%')
    await page.keyboard.press('Control+-')
    await expect(value).toHaveText('110%')
    await page.keyboard.press('Control+0')
    await expect(value).toHaveText('100%')
  })

  test('holding space pans the canvas instead of selecting or dragging', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await selectFreeformPagePreset(page, '16:9')
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 100)
    await page.keyboard.press('Escape')
    await setFreeformZoom(page, 200)
    const stage = page.locator('.freeform-stage-scroll')
    await stage.evaluate((node) => {
      node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2
      node.scrollTop = (node.scrollHeight - node.clientHeight) / 2
    })
    const before = await stage.evaluate((node) => ({
      left: node.scrollLeft,
      top: node.scrollTop,
    }))
    const stageBox = await stage.boundingBox()
    expect(stageBox).toBeTruthy()

    // Focus still sits on the zoom button (canvas pointerdown is prevented);
    // blur it so Space arms panning the way it does for a plain page focus.
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur() })
    await page.keyboard.down('Space')
    await expect(stage).toHaveClass(/space-pan-ready/)
    await expect(stage).toHaveCSS('cursor', 'grab')

    const panFrom = {
      x: stageBox!.x + stageBox!.width / 2,
      y: stageBox!.y + stageBox!.height / 2,
    }
    await page.mouse.move(panFrom.x, panFrom.y)
    await page.mouse.down()
    await expect(stage).toHaveClass(/space-panning/)
    await expect(stage).toHaveCSS('cursor', 'grabbing')
    await page.mouse.move(panFrom.x - 120, panFrom.y - 80)
    await page.mouse.up()
    await expect(stage).not.toHaveClass(/space-panning/)
    await expect(stage).toHaveClass(/space-pan-ready/)

    const afterPan = await stage.evaluate((node) => ({
      left: node.scrollLeft,
      top: node.scrollTop,
    }))
    expect(afterPan.left).toBeCloseTo(before.left + 120, 0)
    expect(afterPan.top).toBeCloseTo(before.top + 80, 0)

    await expect(page.getByTestId('freeform-selection-box')).toHaveCount(0)
    await expect
      .poll(() => freeformElementBoxes(page))
      .toEqual([{ x: 100, y: 100, width: 120, height: 100 }])

    await page.keyboard.up('Space')
    await expect(stage).not.toHaveClass(/space-pan-ready/)

    // Space on a focused button keeps activating the button instead of panning.
    await page.getByRole('button', { name: '放大画布', exact: true }).focus()
    await page.keyboard.down('Space')
    await expect(stage).not.toHaveClass(/space-pan-ready/)
    await page.keyboard.up('Space')
  })

  test('alt+drag duplicates the selection in one undo entry', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 80, 120, 100)
    const element = page.getByTestId('freeform-element')
    await expect(element).toHaveCount(1)
    const scale = await freeformCanvasScale(page)
    const workspace = page.locator('.freeform-workspace')
    const historyBefore = Number(await workspace.getAttribute('data-history-depth'))

    const box = await element.boundingBox()
    expect(box).toBeTruthy()
    const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
    await page.keyboard.down('Alt')
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 120 * scale, start.y + 80 * scale)
    await page.mouse.up()
    await page.keyboard.up('Alt')

    await expect(element).toHaveCount(2)
    await expect(selectedFreeformElements(page)).toHaveCount(1)
    await expect
      .poll(() => freeformElementBoxes(page))
      .toEqual([
        { x: 100, y: 80, width: 120, height: 100 },
        { x: 220, y: 160, width: 120, height: 100 },
      ])
    await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))

    await page.keyboard.press('Control+Z')
    await expect(element).toHaveCount(1)
    await expect
      .poll(() => freeformElementBoxes(page))
      .toEqual([{ x: 100, y: 80, width: 120, height: 100 }])
  })

  test('shift rotation snaps to 15° steps', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 200, 200, 120, 100)
    const element = page.getByTestId('freeform-element')

    const handleBox = await page.getByTestId('freeform-selection-rotate').boundingBox()
    const selBox = await page.getByTestId('freeform-selection-box').boundingBox()
    expect(handleBox).toBeTruthy()
    expect(selBox).toBeTruthy()
    const center = { x: selBox!.x + selBox!.width / 2, y: selBox!.y + selBox!.height / 2 }
    const start = {
      x: handleBox!.x + handleBox!.width / 2,
      y: handleBox!.y + handleBox!.height / 2,
    }
    const vector = { x: start.x - center.x, y: start.y - center.y }
    const pointAtAngle = (degrees: number) => {
      const rad = (degrees * Math.PI) / 180
      return {
        x: center.x + vector.x * Math.cos(rad) - vector.y * Math.sin(rad),
        y: center.y + vector.x * Math.sin(rad) + vector.y * Math.cos(rad),
      }
    }

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.keyboard.down('Shift')
    await page.mouse.move(pointAtAngle(26).x, pointAtAngle(26).y)
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect.poll(() => elementRotationDegrees(page)).toBeCloseTo(30, 0)

    await page.keyboard.press('Control+Z')
    await expect.poll(() => elementRotationDegrees(page)).toBeCloseTo(0, 1)

    // The same gesture without Shift lands on the raw angle.
    await element.click()
    const secondHandle = await page.getByTestId('freeform-selection-rotate').boundingBox()
    const secondBox = await page.getByTestId('freeform-selection-box').boundingBox()
    expect(secondHandle).toBeTruthy()
    expect(secondBox).toBeTruthy()
    const secondCenter = {
      x: secondBox!.x + secondBox!.width / 2,
      y: secondBox!.y + secondBox!.height / 2,
    }
    const secondStart = {
      x: secondHandle!.x + secondHandle!.width / 2,
      y: secondHandle!.y + secondHandle!.height / 2,
    }
    const secondVector = { x: secondStart.x - secondCenter.x, y: secondStart.y - secondCenter.y }
    const secondPoint = (degrees: number) => {
      const rad = (degrees * Math.PI) / 180
      return {
        x: secondCenter.x + secondVector.x * Math.cos(rad) - secondVector.y * Math.sin(rad),
        y: secondCenter.y + secondVector.x * Math.sin(rad) + secondVector.y * Math.cos(rad),
      }
    }
    await page.mouse.move(secondStart.x, secondStart.y)
    await page.mouse.down()
    await page.mouse.move(secondPoint(26).x, secondPoint(26).y)
    await page.mouse.up()
    await expect.poll(() => elementRotationDegrees(page)).toBeCloseTo(26, 0)
  })

  test('shift resize keeps the leaf aspect ratio', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 100)
    const scale = await freeformCanvasScale(page)

    const handleBox = await page.getByTestId('freeform-selection-resize').boundingBox()
    expect(handleBox).toBeTruthy()
    const start = {
      x: handleBox!.x + handleBox!.width / 2,
      y: handleBox!.y + handleBox!.height / 2,
    }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.keyboard.down('Shift')
    await page.mouse.move(start.x + 60 * scale, start.y + 30 * scale)
    await page.mouse.up()
    await page.keyboard.up('Shift')

    const [resized] = await freeformElementBoxes(page)
    // Shift scales both edges by the same factor, so the 120:100 aspect
    // survives while neither edge keeps its per-axis delta (180 / 130).
    expect(resized.width / resized.height).toBeCloseTo(1.2, 2)
    expect(resized.width).toBeGreaterThan(160)
    expect(resized.width).toBeLessThan(180)
    expect(resized.height).toBeGreaterThan(135)
    expect(resized.height).toBeLessThan(150)
  })
})

test.describe('freeform context menu', () => {
  test('right-click opens a scoped menu and delete removes the node', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const element = page.getByTestId('freeform-element')
    await expect(element).toHaveCount(1)

    await element.click({ button: 'right' })
    const menu = page.getByTestId('freeform-context-menu')
    await expect(menu).toBeVisible()
    await expect(menu).toHaveAttribute('role', 'menu')
    await expect(menu).toHaveAttribute('aria-label', '画布操作')
    await expect(menu.getByTestId('freeform-context-menu-copy')).toBeEnabled()
    await expect(menu.getByTestId('freeform-context-menu-paste')).toBeDisabled()
    await expect(menu.getByTestId('freeform-context-menu-delete')).toBeEnabled()
    await expect(menu.getByTestId('freeform-context-menu-forward')).toBeEnabled()
    await expect(menu.getByTestId('freeform-context-menu-group')).toBeDisabled()
    await expect(menu.getByTestId('freeform-context-menu-ungroup')).toBeDisabled()
    await expect(menu.getByTestId('freeform-context-menu-lock')).toHaveText('锁定')
    await expect(menu.getByTestId('freeform-context-menu-visibility')).toHaveText('隐藏')

    await menu.getByTestId('freeform-context-menu-delete').click()
    await expect(menu).toHaveCount(0)
    await expect(element).toHaveCount(0)
  })

  test('groups and ungroups from the context menu', async ({ page }) => {
    await insertTwoSelectedRectangles(page)
    const element = page.getByTestId('freeform-element')
    await expect(element).toHaveCount(2)

    await element.first().click({ button: 'right' })
    const menu = page.getByTestId('freeform-context-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByTestId('freeform-context-menu-group')).toBeEnabled()
    await menu.getByTestId('freeform-context-menu-group').click()
    await expect(menu).toHaveCount(0)
    const group = page.getByTestId('freeform-scene-group')
    await expect(group).toHaveCount(1)

    // The group wrapper itself has no box (children are absolutely placed);
    // right-click a child, whose hit path climbs to the group.
    await element.first().click({ button: 'right' })
    await expect(page.getByTestId('freeform-context-menu')).toBeVisible()
    await expect(page.getByTestId('freeform-context-menu-ungroup')).toBeEnabled()
    await page.getByTestId('freeform-context-menu-ungroup').click()
    await expect(page.getByTestId('freeform-context-menu')).toHaveCount(0)
    await expect(element).toHaveCount(2)
  })

  test('empty-canvas menu pastes and closes on escape and outside click', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const element = page.getByTestId('freeform-element')
    await element.click()
    await page.keyboard.press('Control+C')
    const canvas = page.getByTestId('freeform-canvas')

    await canvas.click({ position: { x: 20, y: 20 }, button: 'right' })
    const menu = page.getByTestId('freeform-context-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByTestId('freeform-context-menu-delete')).toBeDisabled()
    await expect(menu.getByTestId('freeform-context-menu-copy')).toBeDisabled()
    await expect(menu.getByTestId('freeform-context-menu-paste')).toBeEnabled()

    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)

    await canvas.click({ position: { x: 20, y: 20 }, button: 'right' })
    await expect(menu).toBeVisible()
    await page.getByTestId('inspector-page').locator('.inspector-section-title').click()
    await expect(menu).toHaveCount(0)

    await canvas.click({ position: { x: 20, y: 20 }, button: 'right' })
    await expect(menu).toBeVisible()
    await menu.getByTestId('freeform-context-menu-paste').click()
    await expect(menu).toHaveCount(0)
    await expect(element).toHaveCount(2)
  })

  test('lock and hide toggle from the context menu', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const element = page.getByTestId('freeform-element')

    await element.click({ button: 'right' })
    const menu = page.getByTestId('freeform-context-menu')
    await expect(menu).toBeVisible()
    await menu.getByTestId('freeform-context-menu-lock').click()
    await expect(menu).toHaveCount(0)
    // Both the inspector's lock note and the bar above the canvas offer to unlock.
    const unlock = page.getByRole('button', { name: /^解锁/ })
    await expect(page.getByTestId('freeform-lock-banner').getByRole('button', { name: /^解锁/ })).toBeVisible()
    await expect(page.getByTestId('freeform-context-toolbar').getByRole('button', { name: '解锁对象' })).toBeVisible()

    await element.click({ button: 'right' })
    await expect(page.getByTestId('freeform-context-menu-lock')).toHaveText('解锁')
    await page.getByTestId('freeform-context-menu-lock').click()
    await expect(unlock).toHaveCount(0)

    await element.click({ button: 'right' })
    await page.getByTestId('freeform-context-menu-visibility').click()
    await expect(element).toBeHidden()
    await page.keyboard.press('Control+Z')
    await expect(element).toBeVisible()
  })
})

test.describe('freeform layout efficiency', () => {
  test('floating align bar aligns and distributes the multi-selection', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 100, 80)
    await insertShape(page)
    await setSelectedElementBox(page, 350, 180, 100, 60)
    await insertShape(page)
    await setSelectedElementBox(page, 800, 60, 100, 110)
    const bar = page.getByTestId('freeform-align-bar')
    // A single selection shows the bar too (align-to-page mode); the
    // distribute buttons stay disabled until three objects are selected.
    await expect(bar).toBeVisible()
    await expect(bar.getByTestId('freeform-distribute-h')).toBeDisabled()
    await expect(bar.getByTestId('freeform-distribute-v')).toBeDisabled()

    const elements = page.getByTestId('freeform-element')
    await elements.nth(0).click({ modifiers: ['Shift'] })
    await expect(bar).toBeVisible()
    await expect(bar).toHaveAttribute('role', 'toolbar')
    await expect(bar).toHaveAttribute('aria-label', '对齐与分布')
    await expect(bar.getByTestId('freeform-distribute-h')).toBeDisabled()
    await expect(bar.getByTestId('freeform-distribute-v')).toBeDisabled()
    await elements.nth(1).click({ modifiers: ['Shift'] })
    await expect(selectedFreeformElements(page)).toHaveCount(3)
    await expect(bar.getByTestId('freeform-distribute-h')).toBeEnabled()
    await expect(bar.getByTestId('freeform-distribute-v')).toBeEnabled()

    // Gaps 150 and 350 become equal 250 gaps; the outer elements stay put.
    await bar.getByTestId('freeform-distribute-h').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 100, y: 100, width: 100, height: 80 },
      { x: 450, y: 180, width: 100, height: 60 },
      { x: 800, y: 60, width: 100, height: 110 },
    ])

    await bar.getByTestId('freeform-align-left').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 100, y: 100, width: 100, height: 80 },
      { x: 100, y: 180, width: 100, height: 60 },
      { x: 100, y: 60, width: 100, height: 110 },
    ])

    await bar.getByTestId('freeform-align-top').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 100, y: 60, width: 100, height: 80 },
      { x: 100, y: 60, width: 100, height: 60 },
      { x: 100, y: 60, width: 100, height: 110 },
    ])

    await page.keyboard.press('Escape')
    await expect(bar).toHaveCount(0)
  })

  test('shift+2 zooms to the selection and shift+1 fits the page again', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await insertShape(page)
    // Off the page center so the recentering is observable, and mid-page so
    // the required scroll stays clear of the bottom clamp.
    await setSelectedElementBox(page, 150, 500, 500, 250)
    const value = page.getByTestId('freeform-zoom-value')
    await expect(value).toHaveText('100%')
    const stage = page.locator('.freeform-stage-scroll')
    const stageBox = await stage.boundingBox()
    expect(stageBox).toBeTruthy()

    // Leave the inspector inputs so the shortcut reaches the canvas handler.
    const element = page.getByTestId('freeform-element')
    await element.click()
    await page.keyboard.press('Shift+2')
    await expect(value).not.toHaveText('100%')

    const box = await element.boundingBox()
    expect(box).toBeTruthy()
    // The visible content center: clientWidth/Height exclude any scrollbar
    // that appeared once the zoomed canvas outgrew the stage.
    const visibleCenter = await stage.evaluate((node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      const padding = (value: string) => Number.parseFloat(value) || 0
      const paddingLeft = padding(style.paddingLeft)
      const paddingTop = padding(style.paddingTop)
      return {
        x: rect.left + node.clientLeft + paddingLeft
          + (node.clientWidth - paddingLeft - padding(style.paddingRight)) / 2,
        y: rect.top + node.clientTop + paddingTop
          + (node.clientHeight - paddingTop - padding(style.paddingBottom)) / 2,
      }
    })
    expect(Math.abs(box!.x + box!.width / 2 - visibleCenter.x)).toBeLessThan(2)
    expect(Math.abs(box!.y + box!.height / 2 - visibleCenter.y)).toBeLessThan(2)

    await page.keyboard.press('Shift+1')
    await expect(value).toHaveText('100%')
  })

  test('copy and paste style between leaves with shortcuts and the context menu', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 100)
    const hexInput = page.getByTestId('inspector-fill')
      .getByTestId('shape-fill-paint')
      .getByLabel('填充 hex', { exact: true })
    await hexInput.fill('#8b5cf6')
    await expect(hexInput).toHaveValue('#8b5cf6')

    await insertShape(page)
    await setSelectedElementBox(page, 300, 340, 100, 100)
    await expect(hexInput).not.toHaveValue('#8b5cf6')

    const elements = page.getByTestId('freeform-element')
    const menu = page.getByTestId('freeform-context-menu')
    await elements.nth(1).click({ button: 'right' })
    await expect(menu.getByTestId('freeform-context-menu-copy-style')).toBeEnabled()
    await expect(menu.getByTestId('freeform-context-menu-paste-style')).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)

    await elements.first().click({ button: 'right' })
    await menu.getByTestId('freeform-context-menu-copy-style').click()
    await expect(menu).toHaveCount(0)

    await elements.nth(1).click()
    const workspace = page.locator('.freeform-workspace')
    const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
    await page.keyboard.press('Control+Alt+V')
    await expect(hexInput).toHaveValue('#8b5cf6')
    await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))

    await page.keyboard.press('Control+Z')
    await expect(hexInput).not.toHaveValue('#8b5cf6')

    await elements.nth(1).click({ button: 'right' })
    await expect(menu.getByTestId('freeform-context-menu-paste-style')).toBeEnabled()
    await menu.getByTestId('freeform-context-menu-zoom-selection').click()
    await expect(menu).toHaveCount(0)
    await expect(page.getByTestId('freeform-zoom-value')).not.toHaveText('100%')
  })
})

test.describe('freeform page management', () => {
  test('thumbnail drag reorders pages with an insertion indicator', async ({ page }) => {
    await openFreeform(page)
    const addPage = page.getByRole('button', { name: '新增页面' })
    await addPage.click()
    await addPage.click()
    const thumbs = page.getByTestId('freeform-thumb')
    const titles = page.locator('.freeform-thumb-title')
    const slideOrder = () => thumbs.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-slide-id')))
    await expect(thumbs).toHaveCount(3)
    await expect(titles).toHaveText(['第 1 页', '第 2 页', '第 3 页'])
    const [first, second, third] = await slideOrder()

    // The insertion indicator follows the pointer's half of the hovered thumb
    // (upper or lower: the list runs down the side).
    const dragOver = (locator: import('@playwright/test').Locator, ratio: number) =>
      locator.evaluate((node, y) => {
        const bounds = node.getBoundingClientRect()
        node.dispatchEvent(new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          clientX: bounds.left + bounds.width / 2,
          clientY: bounds.top + bounds.height * y,
          dataTransfer: new DataTransfer(),
        }))
      }, ratio)
    await thumbs.first().evaluate((node) => {
      node.dispatchEvent(new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      }))
    })
    await dragOver(thumbs.nth(2), 0.75)
    await expect(thumbs.nth(2)).toHaveClass(/drop-after/)
    await dragOver(thumbs.nth(2), 0.25)
    await expect(thumbs.nth(2)).toHaveClass(/drop-before/)
    await expect(thumbs.nth(2)).not.toHaveClass(/drop-after/)
    await thumbs.first().evaluate((node) => {
      node.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true }))
    })
    await expect(thumbs.nth(2)).not.toHaveClass(/drop-before/)

    // A real drag gesture moves page 1 below page 3.
    const target = await thumbs.nth(2).boundingBox()
    expect(target).toBeTruthy()
    await thumbs.first().dragTo(thumbs.nth(2), {
      targetPosition: { x: target!.width / 2, y: target!.height * 0.75 },
    })
    await expect.poll(slideOrder).toEqual([second, third, first])
    // Pages nobody named are called by where they sit now.
    await expect(titles).toHaveText(['第 1 页', '第 2 页', '第 3 页'])
    // Reordering never changes the active page.
    await expect(page.locator('.freeform-thumb.on')).toHaveAttribute('data-slide-id', third!)
    await expect(page.locator('.freeform-thumb.on .freeform-thumb-title')).toHaveText('第 2 页')

    await page.keyboard.press('Control+z')
    await expect.poll(slideOrder).toEqual([first, second, third])
  })

  test('thumbnail context menu duplicates, deletes, and moves pages', async ({ page }) => {
    await openFreeform(page)
    await page.getByRole('button', { name: '新增页面' }).click()
    const thumbs = page.getByTestId('freeform-thumb')
    const titles = page.locator('.freeform-thumb-title')
    const slideOrder = () => thumbs.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-slide-id')))
    await expect(titles).toHaveText(['第 1 页', '第 2 页'])
    const [first, second] = await slideOrder()

    await thumbs.nth(1).click({ button: 'right' })
    const menu = page.getByTestId('freeform-slide-context-menu')
    await expect(menu).toBeVisible()
    await expect(menu).toHaveAttribute('role', 'menu')
    await expect(menu).toHaveAttribute('aria-label', '页面操作')
    await expect(menu.getByTestId('freeform-slide-context-menu-up')).toBeEnabled()
    await expect(menu.getByTestId('freeform-slide-context-menu-down')).toBeDisabled()
    await expect(menu.getByTestId('freeform-slide-context-menu-delete')).toBeEnabled()
    await menu.getByTestId('freeform-slide-context-menu-up').click()
    await expect(menu).toHaveCount(0)
    await expect.poll(slideOrder).toEqual([second, first])

    await thumbs.first().click({ button: 'right' })
    await page.getByTestId('freeform-slide-context-menu-back').click()
    await expect.poll(slideOrder).toEqual([first, second])

    await thumbs.nth(1).click({ button: 'right' })
    await page.getByTestId('freeform-slide-context-menu-duplicate').click()
    await expect(thumbs).toHaveCount(3)
    const copy = (await slideOrder())[2]
    expect([first, second]).not.toContain(copy)
    await expect(titles).toHaveText(['第 1 页', '第 2 页', '第 3 页'])
    await expect(page.locator('.freeform-thumb.on')).toHaveAttribute('data-slide-id', copy!)

    await thumbs.nth(2).click({ button: 'right' })
    await page.getByTestId('freeform-slide-context-menu-delete').click()
    await expect(thumbs).toHaveCount(2)
    await expect.poll(slideOrder).toEqual([first, second])

    await thumbs.first().click({ button: 'right' })
    await page.getByTestId('freeform-slide-context-menu-delete').click()
    await expect(thumbs).toHaveCount(1)
    await expect.poll(slideOrder).toEqual([second])
    await expect(titles).toHaveText(['第 1 页'])

    await thumbs.first().click({ button: 'right' })
    await expect(page.getByTestId('freeform-slide-context-menu-delete')).toBeDisabled()
    await expect(page.getByTestId('freeform-slide-context-menu-up')).toBeDisabled()
    await expect(page.getByTestId('freeform-slide-context-menu-down')).toBeDisabled()
    await expect(page.getByTestId('freeform-slide-context-menu-front')).toBeDisabled()
    await expect(page.getByTestId('freeform-slide-context-menu-back')).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('freeform-slide-context-menu')).toHaveCount(0)
  })
})

test.describe('freeform history panel', () => {
  const historyItem = (page: import('@playwright/test').Page, label: string) =>
    page.locator('[data-testid="freeform-history-item"]').filter({
      has: page.locator('.freeform-history-label', { hasText: label }),
    })

  test('lists labeled steps and jumps to any state on the timeline', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementPosition(page, 300, 240)
    const hexInput = page.getByTestId('inspector-fill')
      .getByTestId('shape-fill-paint')
      .getByLabel('填充 hex', { exact: true })
    await hexInput.fill('#8b5cf6')

    const element = page.getByTestId('freeform-element')
    const shapeFill = async () => element.locator('.freeform-shape').evaluate((node) =>
      getComputedStyle(node).backgroundColor,
    )
    expect(await shapeFill()).toBe('rgb(139, 92, 246)')

    await page.getByRole('tab', { name: '历史', exact: true }).click()
    await expect(page.getByTestId('freeform-history-panel')).toBeVisible()
    const items = page.getByTestId('freeform-history-item')
    // Insert, X move, Y move, fill: the newest edit sits on top.
    await expect(items).toHaveCount(5)
    await expect(items.nth(0)).toHaveAttribute('data-history-kind', 'current')
    await expect(items.nth(0).locator('.freeform-history-label')).toHaveText('更改样式')
    await expect(items.nth(1)).toHaveAttribute('data-history-kind', 'past')
    await expect(items.nth(1).locator('.freeform-history-label')).toHaveText('移动对象')
    await expect(items.nth(2).locator('.freeform-history-label')).toHaveText('移动对象')
    await expect(items.nth(3).locator('.freeform-history-label')).toHaveText('插入对象')
    await expect(items.nth(4).locator('.freeform-history-label')).toHaveText('初始文档')

    // Jump to the state right after the insert: the fill reverts.
    await historyItem(page, '插入对象').click()
    await expect(items).toHaveCount(5)
    await expect(items.nth(3)).toHaveAttribute('data-history-kind', 'current')
    await expect(items.nth(3).locator('.freeform-history-label')).toHaveText('插入对象')
    await expect(items.nth(0)).toHaveAttribute('data-history-kind', 'future')
    await expect(items.nth(0).locator('.freeform-history-label')).toHaveText('更改样式')
    await expect(items.nth(1).locator('.freeform-history-label')).toHaveText('移动对象')
    await expect(await shapeFill()).not.toBe('rgb(139, 92, 246)')
    await expect(element).toHaveCount(1)

    // Jump to the very first state: the shape disappears.
    await historyItem(page, '初始文档').first().click()
    await expect(element).toHaveCount(0)

    // Jump forward to the newest future state: everything comes back.
    await historyItem(page, '更改样式').first().click()
    await expect(element).toHaveCount(1)
    expect(await shapeFill()).toBe('rgb(139, 92, 246)')
    await expect(items).toHaveCount(5)
    await expect(items.nth(0)).toHaveAttribute('data-history-kind', 'current')

    // A fresh edit clears the redo branch.
    await insertShape(page)
    await expect(items).toHaveCount(6)
    await expect(items.nth(0).locator('.freeform-history-label')).toHaveText('插入对象')
    for (const item of await items.all()) {
      await expect(item).not.toHaveAttribute('data-history-kind', 'future')
    }
  })

  test('labels live-edit gestures on the timeline', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const scale = await freeformCanvasScale(page)
    const element = page.getByTestId('freeform-element')

    const box = await element.boundingBox()
    expect(box).toBeTruthy()
    const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 60 * scale, start.y + 40 * scale)
    await page.mouse.up()

    await page.keyboard.down('Alt')
    const moved = await element.boundingBox()
    expect(moved).toBeTruthy()
    const second = { x: moved!.x + moved!.width / 2, y: moved!.y + moved!.height / 2 }
    await page.mouse.move(second.x, second.y)
    await page.mouse.down()
    await page.mouse.move(second.x + 50 * scale, second.y + 30 * scale)
    await page.mouse.up()
    await page.keyboard.up('Alt')

    await page.getByRole('tab', { name: '历史', exact: true }).click()
    const items = page.getByTestId('freeform-history-item')
    await expect(items).toHaveCount(4)
    await expect(items.nth(0).locator('.freeform-history-label')).toHaveText('拖拽复制')
    await expect(items.nth(1).locator('.freeform-history-label')).toHaveText('移动对象')
    await expect(items.nth(2).locator('.freeform-history-label')).toHaveText('插入对象')
    await expect(items.nth(3).locator('.freeform-history-label')).toHaveText('初始文档')
  })
})

function panelLiveRegion(page: import('@playwright/test').Page) {
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

async function stageGeometry(
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

/** Drag a fresh guide from a ruler and drop it at the given page position. */
async function dragGuideFromRuler(
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

test.describe('freeform rulers and guides', () => {
  // Rulers start hidden; these tests begin with them turned on.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const key = 'slicer.freeform.prefs.v1'
      const current = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      if (typeof current.rulersVisible !== 'boolean') {
        localStorage.setItem(key, JSON.stringify({ ...current, rulersVisible: true }))
      }
    })
  })

  test('rulers stay hidden until the view toggle turns them on, and the choice sticks', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('rulers-reset')) {
        sessionStorage.setItem('rulers-reset', '1')
        localStorage.setItem('slicer.freeform.prefs.v1', JSON.stringify({ rulersVisible: false }))
      }
    })
    await openFreeform(page)
    const toggle = page.getByTestId('freeform-rulers-toggle')
    await expect(page.getByTestId('freeform-canvas')).toBeVisible()
    await expect(page.getByTestId('freeform-ruler-x')).toHaveCount(0)
    // The view toggles sit in the top bar beside the page size.
    await expect(page.getByTestId('freeform-toolbar').getByTestId('freeform-rulers-toggle')).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('freeform-ruler-x')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('freeform-ruler-x')).toBeVisible()
  })

  test('renders zoom-adaptive ruler ticks that track scrolling', async ({ page }) => {
    await openFreeform(page)
    await expect(page.getByTestId('freeform-ruler-x')).toBeVisible()
    await expect(page.getByTestId('freeform-ruler-y')).toBeVisible()
    await expect(page.locator('.freeform-ruler-x .freeform-ruler-label').first()).toBeVisible()

    // At fit zoom the tick step is coarse, so a 250 label never appears.
    await expect(
      page.locator('.freeform-ruler-x .freeform-ruler-label', { hasText: /^250$/ }),
    ).toHaveCount(0)
    await setFreeformZoom(page, 300)
    // Zooming in refines the step until 250 labels appear.
    await expect(
      page.locator('.freeform-ruler-x .freeform-ruler-label', { hasText: /^250$/ }),
    ).toHaveCount(1)

    // Scrolling the stage slides the ticks with the content: the fixed 250
    // label moves left by exactly the scroll delta.
    const label250 = page.locator('.freeform-ruler-x .freeform-ruler-label', { hasText: /^250$/ })
    const before = await label250.boundingBox()
    expect(before).toBeTruthy()
    await page.evaluate(() => {
      const scroll = document.querySelector('.freeform-stage-scroll')
      if (!scroll) throw new Error('stage scroll missing')
      scroll.scrollLeft = 120
    })
    await expect.poll(async () => {
      const moved = await label250.boundingBox()
      return moved ? moved.x : Number.NaN
    }).toBeLessThan(before!.x - 100)
  })

  test('creates a guide from the ruler, undoes and redoes it', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'x', 420)
    const guide = page.getByTestId('freeform-guide')
    await expect(guide).toHaveCount(1)
    await expect(guide).toHaveAttribute('data-guide-axis', 'x')
    // Guides never render into exports: they carry the editor-only marker class.
    await expect(guide).toHaveClass(/freeform-ui-only/)
    expect(await guide.evaluate((node) => Number.parseFloat(node.style.left))).toBe(420)

    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(guide).toHaveCount(0)
    await page.getByRole('button', { name: '重做', exact: true }).click()
    await expect(guide).toHaveCount(1)
    expect(await guide.evaluate((node) => Number.parseFloat(node.style.left))).toBe(420)
  })

  test('moves a guide by dragging and deletes it by dragging off the page', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'x', 300)
    const guide = page.getByTestId('freeform-guide')
    await expect(guide).toHaveCount(1)

    const geometry = await stageGeometry(page)
    const scale = await freeformCanvasScale(page)
    const grabY = (geometry.artboardTop + geometry.artboardBottom) / 2
    const fromX = geometry.artboardLeft + 300 * scale
    const toX = geometry.artboardLeft + 520 * scale
    await page.mouse.move(fromX, grabY)
    await page.mouse.down()
    await page.mouse.move((fromX + toX) / 2, grabY)
    await page.mouse.move(toX, grabY)
    await page.mouse.up()
    await expect(guide).toHaveCount(1)
    expect(await guide.evaluate((node) => Number.parseFloat(node.style.left))).toBe(520)

    // Dragging the guide past the page edge removes it.
    const edgeX = geometry.artboardRight + 80
    await page.mouse.move(toX, grabY)
    await page.mouse.down()
    await page.mouse.move((toX + edgeX) / 2, grabY)
    await page.mouse.move(edgeX, grabY)
    await page.mouse.up()
    await expect(guide).toHaveCount(0)
  })

  test('deletes a guide with a double tap', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'y', 360)
    const guide = page.getByTestId('freeform-guide')
    await expect(guide).toHaveCount(1)
    await expect(guide).toHaveAttribute('data-guide-axis', 'y')

    const geometry = await stageGeometry(page)
    const scale = await freeformCanvasScale(page)
    const tapX = (geometry.artboardLeft + geometry.artboardRight) / 2
    const tapY = geometry.artboardTop + 360 * scale
    await page.mouse.click(tapX, tapY)
    await page.waitForTimeout(60)
    await page.mouse.click(tapX, tapY)
    await expect(guide).toHaveCount(0)
  })

  test('snaps a dragged shape onto a guide', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'x', 420)
    await expect(page.getByTestId('freeform-guide')).toHaveCount(1)

    await insertShape(page)
    await setSelectedElementPosition(page, 300, 400)
    const scale = await freeformCanvasScale(page)
    const element = page.getByTestId('freeform-element')
    const box = await element.boundingBox()
    expect(box).toBeTruthy()

    // Aim the left edge 3 world px left of the guide so the snap must engage.
    const dragDistance = (417 - 300) * scale
    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + dragDistance / 2, startY)
    await page.mouse.move(startX + dragDistance, startY)
    await page.mouse.up()

    const boxes = await freeformElementBoxes(page)
    expect(boxes).toHaveLength(1)
    expect(boxes[0].x).toBe(420)
    expect(boxes[0].y).toBe(400)
  })

  test('a dragged guide shows where it is and settles on the page centre', async ({ page }) => {
    await openFreeform(page)
    if (await page.getByTestId('freeform-ruler-x').count() === 0) await page.getByTestId('freeform-rulers-toggle').click()
    await page.getByTestId('freeform-ruler-x').waitFor({ state: 'attached' })
    const geometry = await stageGeometry(page)
    const scale = await freeformCanvasScale(page)
    // Drop it 3 page px off the centre of the 1080 page: it lands on 540.
    const dropX = geometry.artboardLeft + 537 * scale
    const dropY = geometry.artboardTop + 200 * scale
    await page.mouse.move(dropX, geometry.rulerTop + 10)
    await page.mouse.down()
    await page.mouse.move(dropX, (geometry.rulerTop + dropY) / 2)
    await page.mouse.move(dropX, dropY)
    const readout = page.getByTestId('freeform-guide-readout')
    await expect(readout).toHaveText('居中 · 540')
    await expect(readout).toHaveClass(/is-snapped/)
    await page.mouse.up()
    await expect(readout).toHaveCount(0)
    const guide = page.getByTestId('freeform-guide')
    expect(await guide.evaluate((node) => Number.parseFloat(node.style.left))).toBe(540)

    // Pressing a guide shows its position without moving it.
    const guideX = geometry.artboardLeft + 540 * scale
    const grabY = (geometry.artboardTop + geometry.artboardBottom) / 2
    await page.mouse.move(guideX + 2, grabY)
    await page.mouse.down()
    await expect(readout).toHaveText('居中 · 540')
    await page.mouse.up()
    expect(await guide.evaluate((node) => Number.parseFloat(node.style.left))).toBe(540)
  })

  test('keeps guides scoped to their page', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'x', 420)
    const guide = page.getByTestId('freeform-guide')
    await expect(guide).toHaveCount(1)

    await page.getByRole('button', { name: '新增页面' }).click()
    await expect(page.getByTestId('freeform-thumb')).toHaveCount(2)
    // A fresh page starts without the first page's guides.
    await expect(guide).toHaveCount(0)

    await page.getByTestId('freeform-thumb').first().click()
    await expect(guide).toHaveCount(1)
    expect(await guide.evaluate((node) => Number.parseFloat(node.style.left))).toBe(420)
  })
})

test.describe('freeform selection completion', () => {
  test('Cmd/Ctrl+A selects every object in the current scope', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await insertShape(page)
    await insertShape(page)
    await expect(page.getByTestId('freeform-element')).toHaveCount(3)

    await page.keyboard.press('Control+a')
    await expect(selectedFreeformElements(page)).toHaveCount(3)

    // Cmd/Ctrl+Shift+A inverts the selection: everything selected -> nothing.
    await page.keyboard.press('Control+Shift+a')
    await expect(selectedFreeformElements(page)).toHaveCount(0)
    // Inverting again restores the full selection.
    await page.keyboard.press('Control+Shift+a')
    await expect(selectedFreeformElements(page)).toHaveCount(3)

    // Escape drops the selection again.
    await page.keyboard.press('Escape')
    await expect(selectedFreeformElements(page)).toHaveCount(0)
  })

  test('a single selected object aligns to the page bounds', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 120, 120, 80)

    const bar = page.getByTestId('freeform-align-bar')
    await expect(bar).toBeVisible()
    await bar.getByTestId('freeform-align-left').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 0, y: 120, width: 120, height: 80 },
    ])
    await bar.getByTestId('freeform-align-hcenter').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 480, y: 120, width: 120, height: 80 },
    ])
    await bar.getByTestId('freeform-align-bottom').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 480, y: 1360, width: 120, height: 80 },
    ])

    // Inside a group, a single selected object aligns to the group's bounds
    // instead of the page bounds. Move the first shape away from the page
    // bottom first so the floating align bar can never cover it.
    await setSelectedElementBox(page, 700, 200, 120, 80)
    await insertShape(page)
    const beforeGroup = await freeformElementBoxes(page)
    expect(beforeGroup).toHaveLength(2)
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+g')
    // Double-clicking a group child enters the group's scope. (A plain click
    // selects the group itself, and Enter depends on where focus landed.)
    await page.getByTestId('freeform-element').nth(1).dblclick()
    const groupChildren = page.getByTestId('freeform-element')
    await expect(groupChildren).toHaveCount(2)
    // Select the big center-area child; the selected flag lands on the child
    // element itself once the group scope is active.
    await groupChildren.nth(1).click()
    await expect(groupChildren.nth(1)).toHaveAttribute('data-selected', 'true')

    // World-space box: grouped children expose local coordinates in their
    // inline styles, so measure through the rendered DOM instead.
    const childWorldBox = (locator: import('@playwright/test').Locator) =>
      locator.evaluate((node) => {
        const artboard = document.querySelector('[data-testid="freeform-canvas"]')
        if (!artboard) throw new Error('artboard missing')
        const board = artboard.getBoundingClientRect()
        const rect = node.getBoundingClientRect()
        const scale = board.width / 1080
        return {
          x: Math.round((rect.left - board.left) / scale),
          y: Math.round((rect.top - board.top) / scale),
          width: Math.round(rect.width / scale),
          height: Math.round(rect.height / scale),
        }
      })

    await page.getByTestId('freeform-align-bar')
      .getByTestId('freeform-align-right').click()
    // The child aligns to the group's right edge (the union's maximum
    // right), not the page's right edge.
    const groupRight = Math.max(...beforeGroup.map((box) => box.x + box.width))
    await expect
      .poll(() => childWorldBox(groupChildren.nth(1)))
      .toEqual({
        x: groupRight - beforeGroup[1].width,
        y: beforeGroup[1].y,
        width: beforeGroup[1].width,
        height: beforeGroup[1].height,
      })

    // Each align step lands in history with the align-to-page label — the
    // three page aligns plus the group-scoped one, with the grouping entry
    // interleaved right after the newest align.
    await page.getByRole('tab', { name: '历史', exact: true }).click()
    const labels = page.getByTestId('freeform-history-item')
      .locator('.freeform-history-label')
    await expect(labels.nth(0)).toHaveText('对齐到页面')
    await expect(labels.nth(1)).toHaveText('编组')
    await expect(labels.filter({ hasText: '对齐到页面' })).toHaveCount(4)
  })

  test('the guides toggle hides guide lines and persists across reloads', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'x', 420)
    const guide = page.getByTestId('freeform-guide')
    await expect(guide).toHaveCount(1)

    const toggle = page.getByTestId('freeform-guides-toggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(guide).toHaveCount(0)

    // The preference survives a reload, and so does the guest's page (saved on
    // this device) with its guide, still hidden.
    await page.reload()
    await page.goto('/#/edit/canvas')
    await expect(page.locator('.freeform-stage-scroll')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByTestId('freeform-guides-toggle')).toHaveAttribute('aria-pressed', 'false')
    await expect(guide).toHaveCount(0)

    // Dragging a fresh guide from the ruler re-enables visibility.
    await dragGuideFromRuler(page, 'x', 500)
    await expect(page.getByTestId('freeform-guides-toggle')).toHaveAttribute('aria-pressed', 'true')
    await expect(guide).toHaveCount(2)
  })

  test('the snap toggle disables snapping but keeps page clamping', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'x', 420)
    await expect(page.getByTestId('freeform-guide')).toHaveCount(1)

    await insertShape(page)
    await setSelectedElementPosition(page, 300, 400)
    const scale = await freeformCanvasScale(page)
    const element = page.getByTestId('freeform-element')
    const box = await element.boundingBox()
    expect(box).toBeTruthy()

    // With snapping off the shape lands 3 world px left of the guide.
    await page.getByTestId('freeform-snap-toggle').click()
    const dragDistance = (417 - 300) * scale
    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + dragDistance / 2, startY)
    await page.mouse.move(startX + dragDistance, startY)
    await page.mouse.up()
    let boxes = await freeformElementBoxes(page)
    expect(boxes).toHaveLength(1)
    expect(boxes[0].x).toBe(417)

    // Re-enabling snapping pulls the same drag onto the guide.
    await page.getByTestId('freeform-snap-toggle').click()
    const box2 = await element.boundingBox()
    await page.mouse.move(box2!.x + box2!.width / 2, box2!.y + box2!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2!.x + box2!.width / 2 + 2 * scale, box2!.y + box2!.height / 2)
    await page.mouse.up()
    boxes = await freeformElementBoxes(page)
    expect(boxes[0].x).toBe(420)
  })
})

test.describe('freeform canvas feedback', () => {
  test('dragging shows red distance measurements to siblings and page edges', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 80)
    await insertShape(page)
    await setSelectedElementBox(page, 400, 100, 120, 80)

    const geometry = await stageGeometry(page)
    const scale = await freeformCanvasScale(page)
    await expect(page.getByTestId('freeform-measurement')).toHaveCount(0)
    await expect(page.getByTestId('freeform-selection-badge')).toHaveCount(0)

    // Drag the first shape right so its right edge keeps a 60px gap to the
    // second shape (100 -> 220).
    const first = page.getByTestId('freeform-element').nth(0)
    await first.hover()
    await page.mouse.down()
    await page.mouse.move(geometry.artboardLeft + 280 * scale, geometry.artboardTop + 140 * scale, { steps: 8 })

    // Right: 60 to the sibling; left: 220 and top: 100 to the page edges;
    // the far bottom page edge (1260) stays out of range.
    const measurements = page.getByTestId('freeform-measurement')
    await expect(measurements).toHaveCount(3)
    await expect(page.getByTestId('freeform-selection-badge')).toHaveText('120×80')
    const right = page.locator('[data-testid="freeform-measurement"][data-measurement-side="right"]')
    await expect(right).toHaveAttribute('data-measurement-source', 'element')
    await expect(right.getByTestId('freeform-measurement-label')).toHaveText('60')
    await expect(page.locator('[data-testid="freeform-measurement"][data-measurement-side="left"] [data-testid="freeform-measurement-label"]')).toHaveText('220')
    await expect(page.locator('[data-testid="freeform-measurement"][data-measurement-side="top"] [data-testid="freeform-measurement-label"]')).toHaveText('100')
    // Measurements are canvas chrome and never reach exports.
    await expect(measurements.first()).toHaveClass(/freeform-ui-only/)

    await page.mouse.up()
    await expect(measurements).toHaveCount(0)
    await expect(page.getByTestId('freeform-selection-badge')).toHaveCount(0)
    const boxes = await freeformElementBoxes(page)
    // The client->world conversion carries sub-pixel float drift.
    expect(boxes[0].x).toBeCloseTo(220, 1)
  })

  test('resizing shows a live size badge under the selection', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 80)

    const scale = await freeformCanvasScale(page)
    const handle = page.getByTestId('freeform-selection-resize')
    const handleBox = await handle.boundingBox()
    expect(handleBox).toBeTruthy()
    const startX = handleBox!.x + handleBox!.width / 2
    const startY = handleBox!.y + handleBox!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 100 * scale, startY + 50 * scale, { steps: 5 })

    await expect(page.getByTestId('freeform-selection-badge')).toHaveText('220×130')
    await page.mouse.up()
    await expect(page.getByTestId('freeform-selection-badge')).toHaveCount(0)
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 100, y: 100, width: 220, height: 130 },
    ])
  })

  test('rotating shows a live angle badge', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 400, 500, 120, 80)

    const geometry = await stageGeometry(page)
    const scale = await freeformCanvasScale(page)
    const rotate = page.getByTestId('freeform-selection-rotate')
    const handleBox = await rotate.boundingBox()
    expect(handleBox).toBeTruthy()
    const centerX = geometry.artboardLeft + 460 * scale
    const centerY = geometry.artboardTop + 540 * scale
    const handleX = handleBox!.x + handleBox!.width / 2
    const handleY = handleBox!.y + handleBox!.height / 2
    const startAngle = Math.atan2(handleY - centerY, handleX - centerX)
    const radius = Math.hypot(handleX - centerX, handleY - centerY)
    const targetAngle = startAngle + Math.PI / 6

    await page.mouse.move(handleX, handleY)
    await page.mouse.down()
    await page.mouse.move(
      centerX + radius * Math.cos(targetAngle),
      centerY + radius * Math.sin(targetAngle),
      { steps: 10 },
    )
    await expect(page.getByTestId('freeform-selection-badge')).toHaveText('30°')
    await page.mouse.up()
    await expect(page.getByTestId('freeform-selection-badge')).toHaveCount(0)
  })
})

test.describe('freeform color history', () => {
  test('recent colors record committed picks and persist across reloads', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const paint = page.getByTestId('shape-fill-paint')
    const popover = paint.getByTestId('paint-popover')
    const trigger = paint.getByTestId('paint-color-button')

    await trigger.click()
    await expect(popover).toBeVisible()
    await expect(popover.getByTestId('paint-recent-grid')).toHaveCount(0)

    // Pick the first preset and close: one recent swatch appears, newest
    // first, and the trigger reflects the picked color.
    const presets = popover.locator('.paint-swatch-grid .paint-swatch')
    const firstPresetColor = await presets.nth(0).evaluate((node) => getComputedStyle(node).backgroundColor)
    await presets.nth(0).click()
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    await expect(trigger).toHaveCSS('background-color', firstPresetColor)

    await trigger.click()
    const recent = popover.getByTestId('paint-recent-grid')
    await expect(recent).toBeVisible()
    await expect(recent.locator('.paint-swatch')).toHaveCount(1)
    expect(await recent.locator('.paint-swatch').first().evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(firstPresetColor)

    // A second pick moves to the front; the list keeps both, newest first.
    const secondPresetColor = await presets.nth(1).evaluate((node) => getComputedStyle(node).backgroundColor)
    await presets.nth(1).click()
    await page.keyboard.press('Escape')
    await trigger.click()
    await expect(recent.locator('.paint-swatch')).toHaveCount(2)
    expect(await recent.locator('.paint-swatch').first().evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(secondPresetColor)
    expect(await recent.locator('.paint-swatch').nth(1).evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(firstPresetColor)

    // Closing without a pick records nothing (untouched sessions are free).
    await page.keyboard.press('Escape')
    await trigger.click()
    await expect(recent.locator('.paint-swatch')).toHaveCount(2)

    // The recents survive a reload (the unsaved shape does not).
    await page.keyboard.press('Escape')
    await page.reload()
    await page.goto('/#/edit/canvas')
    await expect(page.locator('.freeform-stage-scroll')).toHaveAttribute('aria-busy', 'false')
    await insertShape(page)
    await page.getByTestId('shape-fill-paint').getByTestId('paint-color-button').click()
    const recentAfterReload = page.getByTestId('paint-popover').getByTestId('paint-recent-grid')
    await expect(recentAfterReload.locator('.paint-swatch')).toHaveCount(2)
    expect(await recentAfterReload.locator('.paint-swatch').first().evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(secondPresetColor)
  })

  test('the eyedropper control follows EyeDropper API availability', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const paint = page.getByTestId('shape-fill-paint')
    await paint.getByTestId('paint-color-button').click()
    const popover = paint.getByTestId('paint-popover')
    await expect(popover).toBeVisible()

    // The native picker cannot be driven by automation — only assert the
    // control matches the platform API and that the popover still closes.
    const supported = await page.evaluate(() => 'EyeDropper' in window)
    await expect(paint.getByTestId('paint-eyedropper')).toHaveCount(supported ? 1 : 0)

    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
  })
})

test.describe('freeform duplicate and z-order shortcuts', () => {
  test('Ctrl+D duplicates the selection in place and selects the copies', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 120, 160, 120, 80)

    await page.keyboard.press('Control+d')
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 120, y: 160, width: 120, height: 80 },
      { x: 120, y: 160, width: 120, height: 80 },
    ])
    // The fresh copy carries the selection.
    await expect(page.getByTestId('freeform-element').nth(1)).toHaveAttribute('data-selected', 'true')
    await expect(page.getByTestId('freeform-element').nth(0)).toHaveAttribute('data-selected', 'false')

    // One history entry records the duplicate.
    await page.getByRole('tab', { name: '历史', exact: true }).click()
    await expect(page.getByTestId('freeform-history-item').locator('.freeform-history-label').first()).toHaveText('原位复制')
  })

  test('bracket keys and their modifiers reorder the selection', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 80)
    await insertShape(page)
    await setSelectedElementBox(page, 400, 100, 120, 80)
    await insertShape(page)
    await setSelectedElementBox(page, 700, 100, 120, 80)
    const elements = page.getByTestId('freeform-element')
    await expect(elements).toHaveCount(3)

    // Bare ] brings the first shape straight to the front (Figma semantics).
    await elements.nth(0).click()
    await page.keyboard.press(']')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([400, 700, 100])

    // Bare [ sends it straight back; Ctrl+] steps one layer up, Ctrl+[ back down.
    await page.keyboard.press('[')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([100, 400, 700])
    await page.keyboard.press('Control+]')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([400, 100, 700])
    await page.keyboard.press('Control+[')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([100, 400, 700])

    // Ctrl+Shift+] / Ctrl+Shift+[ also jump to the front/back.
    await page.keyboard.press('Control+Shift+]')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([400, 700, 100])
    await page.keyboard.press('Control+Shift+[')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([100, 400, 700])

    // While an input is focused the brackets never reorder the selection.
    const positionInputs = page.locator('.freeform-inspector .field-grid').first().locator('input')
    await positionInputs.nth(0).click()
    await page.keyboard.press(']')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([100, 400, 700])

    // The context menu offers in-place duplication too (right-click an
    // unselected shape — the selection overlay covers the selected one).
    await page.getByTestId('freeform-element').nth(1).click({ button: 'right' })
    await page.getByTestId('freeform-context-menu-duplicate').click()
    await expect.poll(async () => await page.getByTestId('freeform-element').count()).toBe(4)
  })

  test('right-clicking a selected shape through its drag handle keeps the element menu', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    // A small shape at fit zoom: its center sits under the round drag handle.
    await setSelectedElementBox(page, 400, 100, 120, 80)
    const element = page.getByTestId('freeform-element')
    // The inserted shape is already selected (the box edits above prove it).
    await expect(element).toHaveAttribute('data-selected', 'true')

    // Locator clicks refuse points owned by overlay chrome; use raw mouse
    // events at the shape's center (under the drag handle at fit zoom).
    const handleBox = await element.boundingBox()
    expect(handleBox).toBeTruthy()
    await page.mouse.click(
      handleBox!.x + handleBox!.width / 2,
      handleBox!.y + handleBox!.height / 2,
      { button: 'right' },
    )
    const menu = page.getByTestId('freeform-context-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByTestId('freeform-context-menu-delete')).toBeEnabled()
    await expect(menu.getByTestId('freeform-context-menu-duplicate')).toBeEnabled()
    // The selection survives the right-click through overlay chrome.
    await expect(element).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Escape')
  })
})

test.describe('freeform clipboard completion', () => {
  test('cut removes the selection and paste-in-place restores the exact position', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 480, 640, 120, 80)

    await page.keyboard.press('Control+x')
    await expect(page.getByTestId('freeform-element')).toHaveCount(0)

    // Cut lands in history as one atomic step.
    await page.getByRole('tab', { name: '历史', exact: true }).click()
    await expect(page.getByTestId('freeform-history-item').locator('.freeform-history-label').first()).toHaveText('剪切对象')
    await page.getByRole('tab', { name: '属性', exact: true }).click()

    // Paste in place restores the exact source coordinates.
    await page.keyboard.press('Control+Shift+v')
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 480, y: 640, width: 120, height: 80 },
    ])
    await page.getByRole('tab', { name: '历史', exact: true }).click()
    await expect(page.getByTestId('freeform-history-item').locator('.freeform-history-label').first()).toHaveText('原位粘贴')
    await page.getByRole('tab', { name: '属性', exact: true }).click()

    // One undo removes the paste; a second restores the cut shape.
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('freeform-element')).toHaveCount(0)
    await page.keyboard.press('Control+z')
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 480, y: 640, width: 120, height: 80 },
    ])
  })

  test('paste-in-place keeps coordinates across pages while normal paste offsets', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 480, 640, 120, 80)
    await page.keyboard.press('Control+c')

    await page.getByRole('button', { name: '新增页面' }).click()
    await expect(page.getByTestId('freeform-thumb')).toHaveCount(2)

    // Normal paste offsets the copy by 16px.
    await page.keyboard.press('Control+v')
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 496, y: 656, width: 120, height: 80 },
    ])
    await page.keyboard.press('Control+z')

    // Paste in place lands at the exact source coordinates on the new page.
    await page.keyboard.press('Control+Shift+v')
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 480, y: 640, width: 120, height: 80 },
    ])
  })

  test('the context menu offers cut and paste-in-place', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 480, 640, 120, 80)

    const menu = page.getByTestId('freeform-context-menu')
    // Paste-in-place stays disabled without a clipboard.
    await page.mouse.click(200, 300, { button: 'right' })
    await expect(menu.getByTestId('freeform-context-menu-cut')).toBeDisabled()
    await expect(menu.getByTestId('freeform-context-menu-paste-in-place')).toBeDisabled()
    await page.keyboard.press('Escape')

    // Cut through the menu removes the shape and fills the clipboard.
    await page.getByTestId('freeform-element').click({ button: 'right' })
    await menu.getByTestId('freeform-context-menu-cut').click()
    await expect(page.getByTestId('freeform-element')).toHaveCount(0)

    // Paste-in-place through the menu restores the exact position.
    await page.mouse.click(200, 300, { button: 'right' })
    await menu.getByTestId('freeform-context-menu-paste-in-place').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 480, y: 640, width: 120, height: 80 },
    ])
  })
})

test.describe('freeform page rename', () => {
  test('double-clicking the caption renames a page inline', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)

    const title = page.getByTestId('freeform-thumb-title').first()
    await expect(title).toHaveText('第 1 页')
    await title.dblclick()

    const input = page.getByTestId('freeform-thumb-rename')
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('第 1 页')
    await input.fill('封面页')
    await input.press('Enter')
    await expect(page.getByTestId('freeform-thumb-rename')).toHaveCount(0)
    await expect(title).toHaveText('封面页')

    // The rename lands in history as one step.
    await page.getByRole('tab', { name: '历史', exact: true }).click()
    await expect(page.getByTestId('freeform-history-item').locator('.freeform-history-label').first()).toHaveText('重命名页面')
    await page.getByRole('tab', { name: '属性', exact: true }).click()

    // Escape cancels without recording anything.
    await title.dblclick()
    await page.getByTestId('freeform-thumb-rename').fill('放弃')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('freeform-thumb-rename')).toHaveCount(0)
    await expect(title).toHaveText('封面页')

    // Empty input keeps the current name.
    await title.dblclick()
    await page.getByTestId('freeform-thumb-rename').fill('   ')
    await page.getByTestId('freeform-thumb-rename').press('Enter')
    await expect(title).toHaveText('封面页')
  })

  test('the slide context menu renames the right-clicked page', async ({ page }) => {
    await openFreeform(page)
    await page.getByRole('button', { name: '新增页面' }).click()
    await expect(page.getByTestId('freeform-thumb')).toHaveCount(2)

    // Right-click the second thumbnail and rename it.
    await page.getByTestId('freeform-thumb').nth(1).click({ button: 'right' })
    const menu = page.getByTestId('freeform-slide-context-menu')
    await expect(menu.getByTestId('freeform-slide-context-menu-rename')).toBeVisible()
    await menu.getByTestId('freeform-slide-context-menu-rename').click()

    const input = page.getByTestId('freeform-thumb-rename')
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('第 2 页')
    await input.fill('结尾页')
    await input.press('Enter')
    await expect(page.getByTestId('freeform-thumb-title').nth(1)).toHaveText('结尾页')
    await expect(page.getByTestId('freeform-thumb-title').nth(0)).toHaveText('第 1 页')
  })

  test('confirming an automatic page name keeps it following the page', async ({ page }) => {
    await openFreeform(page)
    await page.getByRole('button', { name: '新增页面' }).click()
    const titles = page.getByTestId('freeform-thumb-title')
    await titles.nth(1).dblclick()
    const input = page.getByTestId('freeform-thumb-rename')
    await expect(input).toHaveValue('第 2 页')
    await input.press('Enter')
    await expect(input).toHaveCount(0)

    await page.getByRole('tab', { name: '历史', exact: true }).click()
    await expect(page.getByTestId('freeform-history-item').filter({ hasText: '重命名页面' })).toHaveCount(0)
    await page.getByRole('tab', { name: '属性', exact: true }).click()

    // Moved to the front, it is 「第 1 页」 now.
    await (await openPageMenu(page, 1)).getByTestId('freeform-slide-context-menu-up').click()
    await expect(page.getByTestId('freeform-thumb').first()).toHaveAttribute('aria-current', 'page')
    await expect(titles).toHaveText(['第 1 页', '第 2 页'])
    await expect(page.getByTestId('inspector-page').getByLabel('页面名称')).toHaveValue('第 1 页')
  })
})

test.describe('freeform reload restore', () => {
  test('reload restores the freeform workspace and its open draft', async ({ page }) => {
    await page.goto('/#/edit/canvas')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    await insertText(page)
    await page.getByLabel('文本内容').fill('刷新恢复的内容')
    await signUpToSave(page, `restore-${Date.now().toString(36)}`)
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

    await page.reload()

    // 刷新后：编辑器和项目都自动恢复。
    await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
    await expect(page.getByTestId('freeform-element')).toHaveCount(1)
    await expect(page.getByLabel('文本内容')).toContainText('刷新恢复的内容')
    await expect(page.getByTestId('editor-title')).toHaveText('未命名设计')
  })

  test('reload falls back to a fresh document when the recorded draft was deleted', async ({ page }) => {
    await page.goto('/#/edit/canvas')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    await insertText(page)
    await page.getByLabel('文本内容').fill('将被删除的内容')
    await signUpToSave(page, `restore-gone-${Date.now().toString(36)}`)
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

    // 在工作台删掉这个项目（恢复记录随之清空），再回到编辑器刷新。
    await page.getByTestId('editor-home').click()
    const card = page.getByTestId('project-card')
    await card.getByRole('button', { name: /更多操作/ }).click()
    await page.getByRole('menuitem', { name: '删除' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
    await expect(card).toHaveCount(0)
    await page.goto('/#/edit/canvas')
    await page.reload()

    // 编辑器打开，但项目已不存在：回到空白文档而不是报错。
    await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
    await expect(page.locator('.freeform-stage-scroll')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByTestId('freeform-element')).toHaveCount(0)
    await expect(page.getByTestId('editor-save-state')).toHaveCount(0)
  })

  test('reload restores the markdown workspace and its open draft', async ({ page }) => {
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.waitForFunction(() => !!window.__cmView)
    await page.evaluate(() => {
      const view = window.__cmView!
      view.dispatch({ changes: { from: 0, to: view.state.doc.toString().length, insert: '# 刷新恢复的文稿\n\n正文内容。' } })
    })

    await signUpToSave(page, `restore-md-${Date.now().toString(36)}`)

    // 在自由编辑里也存一份（让「上次编辑器」指向自由编辑），再回到 Markdown。
    await page.goto('/#/edit/canvas')
    await insertText(page)
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
    await page.goto('/#/edit/md')
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

    await page.reload()

    // 刷新 Markdown 编辑器，项目内容自动恢复。
    await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
    await page.waitForFunction(() => !!window.__cmView)
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
    await expect.poll(() =>
      page.evaluate(() => window.__cmView!.state.doc.toString()),
    ).toContain('刷新恢复的文稿')
  })
})

test.describe('freeform text auto size', () => {
  test('typing past the box grows it so text is never clipped', async ({ page }) => {
    await openFreeform(page)
    await insertText(page)
    const element = page.getByTestId('freeform-element').last()
    const initialHeight = await element.evaluate((el) => el.offsetHeight)
    expect(initialHeight).toBe(150)

    // 四行 48px 文字远超默认 150px 的盒子。
    await page.getByLabel('文本内容').fill('一\n二\n三\n四')
    await expect.poll(() => element.evaluate((el) => el.offsetHeight)).toBeGreaterThan(220)

    // 内容不再被裁：盒子不小于文字实际需要的高度。
    const overflow = await element.evaluate((el) => {
      const box = el.querySelector('.freeform-textbox') as HTMLElement
      return box.scrollHeight - box.clientHeight
    })
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('the text box never shrinks back when content is removed', async ({ page }) => {
    await openFreeform(page)
    await insertText(page)
    const element = page.getByTestId('freeform-element').last()

    await page.getByLabel('文本内容').fill('一\n二\n三\n四')
    const grownHeight = await element.evaluate((el) => el.offsetHeight)
    expect(grownHeight).toBeGreaterThan(220)

    await page.getByLabel('文本内容').fill('短')
    await expect(await element.evaluate((el) => el.offsetHeight)).toBe(grownHeight)
  })

  test('vertical text grows the box wider instead of clipping columns', async ({ page }) => {
    await openFreeform(page)
    await insertText(page)
    const element = page.getByTestId('freeform-element').last()
    const initialWidth = await element.evaluate((el) => el.offsetWidth)
    expect(initialWidth).toBe(520)

    await page.getByTestId('text-vertical-toggle').click()
    await expect(page.getByTestId('text-vertical-toggle')).toHaveAttribute('aria-pressed', 'true')
    // 二十个字在 150px 高的竖排盒里要排十列，远超默认 520px 宽。
    await page.getByLabel('文本内容').fill('一二三四五六七八九十一二三四五六七八九十')
    await expect.poll(() => element.evaluate((el) => el.offsetWidth)).toBeGreaterThan(560)

    const overflow = await element.evaluate((el) => {
      const box = el.querySelector('.freeform-textbox') as HTMLElement
      return box.scrollWidth - box.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('freeform editing chrome', () => {
  test('the bar above the canvas follows the selection', async ({ page }) => {
    // Wide enough for the whole text row beside the page list and the open panel.
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    const bar = page.getByRole('toolbar', { name: '对象工具条' })
    await expect(bar).toHaveAttribute('data-subject', 'page')
    // Nothing selected: only 更多, which opens the page's settings.
    await expect(bar.getByRole('button')).toHaveText(['更多'])

    await insertText(page)
    await expect(bar).toHaveAttribute('data-subject', 'text')
    const size = bar.getByLabel('文字大小', { exact: true })
    const inspectorSize = page.getByTestId('inspector-typography').getByLabel('字号', { exact: true })
    await expect(size).toHaveValue('48')
    // − / + walk the usual sizes, and the inspector shows the same value.
    await bar.getByRole('button', { name: '放大字号' }).click()
    await expect(size).toHaveValue('56')
    await expect(inspectorSize).toHaveValue('56')
    await bar.getByRole('button', { name: '缩小字号' }).click()
    await expect(inspectorSize).toHaveValue('48')

    const bold = bar.getByRole('button', { name: '加粗文字' })
    await expect(bold).toHaveAttribute('aria-pressed', 'true')
    await bold.click()
    await expect(bold).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('text-weight-toggle')).toHaveAttribute('aria-pressed', 'false')
    await bar.getByRole('button', { name: '文字居中' }).click()
    await expect(bar.getByRole('button', { name: '文字居中' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('inspector-typography').getByRole('button', { name: '文字居中' }))
      .toHaveAttribute('aria-pressed', 'true')

    await insertShape(page)
    await expect(bar).toHaveAttribute('data-subject', 'shape')
    const shapeMenu = bar.getByTestId('ctx-shape-menu')
    await expect(shapeMenu).toHaveText('矩形')
    await shapeMenu.click()
    await page.getByRole('menu', { name: '矩形' }).getByRole('menuitem', { name: '圆形', exact: true }).click()
    await expect(shapeMenu).toHaveText('圆形')
    await expect(page.getByTestId('inspector-geometry').getByRole('button', { name: '圆形', exact: true }))
      .toHaveClass(/\bon\b/)

    const elements = page.getByTestId('freeform-element')
    await expect(elements).toHaveCount(2)
    await bar.getByTestId('ctx-duplicate').click()
    await expect(elements).toHaveCount(3)
    await bar.getByTestId('ctx-delete').click()
    await expect(elements).toHaveCount(2)
    await expect(bar).toHaveAttribute('data-subject', 'page')
  })

  test('colour pickers and menus in the bar open over the canvas', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 100, 100)
    await insertShape(page)
    const bar = page.getByRole('toolbar', { name: '对象工具条' })

    await bar.getByTestId('ctx-shape-fill').click()
    const popover = bar.getByTestId('paint-popover')
    await expect(popover).toBeVisible()
    // The bar never scrolls, so nothing clips what opens from it.
    const popoverBox = (await popover.boundingBox())!
    expect(await locatorOwnsPoint(popover, popoverBox.x + popoverBox.width / 2, popoverBox.y + popoverBox.height - 12))
      .toBe(true)
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)

    const layerOrder = () => page.getByTestId('freeform-element')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-scene-node-id')))
    const [below, above] = await layerOrder()
    await bar.getByTestId('ctx-order-menu').click()
    const orderMenu = page.getByRole('menu', { name: '层级' })
    await expect(orderMenu).toBeVisible()
    const menuBox = (await orderMenu.boundingBox())!
    expect(await locatorOwnsPoint(orderMenu, menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height - 8)).toBe(true)
    await orderMenu.getByRole('menuitem', { name: '移到底层' }).click()
    await expect.poll(layerOrder).toEqual([above, below])
  })

  test('with both side panels open the bar keeps one row, so selecting never moves the canvas', async ({ page }) => {
    await openFreeform(page)
    const bar = page.getByRole('toolbar', { name: '对象工具条' })
    const canvas = page.getByTestId('freeform-canvas')
    const elements = page.getByTestId('freeform-elements-tool')
    await elements.click()
    await expect(page.getByTestId('freeform-elements-drawer')).toBeVisible()
    await waitForCanvasFit(page)
    const idle = await canvas.boundingBox()

    await page.getByTestId('insert-shape-rect').click()
    await expect(bar).toHaveAttribute('data-subject', 'shape')
    await waitForCanvasFit(page)
    expect(await bar.evaluate((node) => (node as HTMLElement).offsetHeight)).toBe(48)
    expect(await canvas.boundingBox()).toEqual(idle)
    // What the narrow bar folds away is still in the settings panel; 更多 keeps its name.
    await expect(bar.getByTestId('ctx-shape-fill')).toBeVisible()
    await expect(bar.getByTestId('ctx-delete')).toBeVisible()
    await expect(bar.getByTestId('ctx-order-menu')).toBeHidden()
    await expect(bar.getByTestId('ctx-more')).toHaveAccessibleName('更多')

    await canvas.click({ position: { x: 8, y: 8 } })
    await expect(bar).toHaveAttribute('data-subject', 'page')
    await waitForCanvasFit(page)
    expect(await canvas.boundingBox()).toEqual(idle)

    // A wider stage brings the folded controls back.
    await page.getByTestId('freeform-element').click()
    await elements.click()
    await expect(page.getByTestId('freeform-elements-drawer')).toHaveCount(0)
    await expect(bar.getByTestId('ctx-order-menu')).toBeVisible()
    await expect(bar.getByTestId('ctx-duplicate')).toBeVisible()
    expect(await bar.evaluate((node) => (node as HTMLElement).offsetHeight)).toBe(48)
  })

  test('the bar locks, unlocks and groups the selection', async ({ page }) => {
    await insertTwoSelectedRectangles(page)
    const bar = page.getByRole('toolbar', { name: '对象工具条' })
    await expect(bar).toHaveAttribute('data-subject', 'multi')
    await expect(bar.getByTestId('freeform-context-subject')).toHaveText('2 个对象')
    await bar.getByRole('button', { name: '编成一组' }).click()
    await expect(bar).toHaveAttribute('data-subject', 'group')
    await bar.getByRole('button', { name: '取消编组' }).click()
    await expect(bar).toHaveAttribute('data-subject', 'multi')

    await page.keyboard.press('Escape')
    await expect(selectedFreeformElements(page)).toHaveCount(0)
    await page.getByTestId('freeform-element').nth(1).click()
    await expect(bar).toHaveAttribute('data-subject', 'shape')
    await bar.getByTestId('ctx-lock').click()
    await expect(bar).toHaveAttribute('data-subject', 'locked')
    await expect(bar.getByTestId('ctx-lock')).toHaveAccessibleName('解锁对象')
    await expect(bar.getByTestId('ctx-delete')).toHaveCount(0)
    await bar.getByTestId('ctx-lock').click()
    await expect(bar).toHaveAttribute('data-subject', 'shape')
    await expect(bar.getByTestId('ctx-lock')).toHaveAccessibleName('锁定对象')
  })

  test('each page\'s 「…」 button opens its menu from the keyboard too', async ({ page }) => {
    await openFreeform(page)
    const thumbs = page.getByTestId('freeform-thumb')
    const menuButtons = page.getByTestId('freeform-thumb-menu')
    const menu = page.getByTestId('freeform-slide-context-menu')
    const slideOrder = () => thumbs.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-slide-id')))

    // Only the current page shows its button until the pointer comes by.
    await page.getByRole('button', { name: '新增页面' }).click()
    await expect(menuButtons.nth(1)).toHaveCSS('opacity', '1')
    await expect(menuButtons.nth(0)).toHaveCSS('opacity', '0')
    await thumbs.nth(0).hover()
    await expect(menuButtons.nth(0)).toHaveCSS('opacity', '1')
    await expect(menuButtons.nth(1)).toHaveAccessibleName('第 2 页 的页面操作')

    // Enter opens the menu on its first entry; the arrows walk it; Escape hands focus back.
    const [first, second] = await slideOrder()
    await menuButtons.nth(1).focus()
    await page.keyboard.press('Enter')
    await expect(menu).toBeVisible()
    await expect(menuButtons.nth(1)).toHaveAttribute('aria-expanded', 'true')
    await expect(menu.getByTestId('freeform-slide-context-menu-rename')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByTestId('freeform-slide-context-menu-duplicate')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(menuButtons.nth(1)).toBeFocused()

    // Clicking the button again closes the menu it opened.
    await menuButtons.nth(1).click()
    await expect(menu).toBeVisible()
    await menuButtons.nth(1).click()
    await expect(menu).toHaveCount(0)

    // An entry runs and focus stays on the moved page's button.
    await (await openPageMenu(page, 1)).getByTestId('freeform-slide-context-menu-up').click()
    await expect.poll(slideOrder).toEqual([second, first])
    await expect(menuButtons.nth(0)).toBeFocused()
    await expect(thumbs.nth(0)).toHaveAttribute('aria-current', 'page')

    // A copy of a named page carries the name.
    await page.getByTestId('inspector-page').getByLabel('页面名称').fill('结尾')
    await duplicateCurrentPage(page)
    await expect(thumbs).toHaveCount(3)
    await expect(page.getByTestId('freeform-thumb-title')).toHaveText(['结尾', '结尾 副本', '第 3 页'])
  })

  test('pictures dropped on the canvas land where they fall', async ({ page }) => {
    await openFreeform(page)

    const viewport = page.locator('.freeform-stage-viewport')
    const canvasBox = (await page.getByTestId('freeform-canvas').boundingBox())!
    const scale = await freeformCanvasScale(page)
    // Pointer events carry whole pixels; aim at the one nearest page point (300, 400).
    const point = {
      clientX: Math.round(canvasBox.x + 300 * scale),
      clientY: Math.round(canvasBox.y + 400 * scale),
    }
    const target = { x: (point.clientX - canvasBox.x) / scale, y: (point.clientY - canvasBox.y) / scale }
    const pictures = await page.evaluateHandle((base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }))
      return transfer
    }, TEST_PNG.toString('base64'))
    await viewport.dispatchEvent('dragenter', { dataTransfer: pictures, ...point })
    await viewport.dispatchEvent('dragover', { dataTransfer: pictures, ...point })
    await expect(page.getByTestId('freeform-drop-overlay')).toBeVisible()
    await viewport.dispatchEvent('drop', { dataTransfer: pictures, ...point })
    await expect(page.getByTestId('freeform-drop-overlay')).toHaveCount(0)

    const image = page.getByTestId('freeform-element').filter({ has: page.locator('.freeform-image') })
    await expect(image).toHaveCount(1)
    const placed = await image.evaluate((element) => {
      const node = element as HTMLElement
      return {
        centerX: Number.parseFloat(node.style.left) + node.offsetWidth / 2,
        centerY: Number.parseFloat(node.style.top) + node.offsetHeight / 2,
      }
    })
    expect(Math.abs(placed.centerX - target.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(placed.centerY - target.y)).toBeLessThanOrEqual(1)

    // Anything that isn't a picture is turned away.
    const note = await page.evaluateHandle(() => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['hi'], 'note.txt', { type: 'text/plain' }))
      return transfer
    })
    await viewport.dispatchEvent('drop', { dataTransfer: note, ...point })
    await expect(page.getByRole('alert')).toContainText('这里只能放图片')
    await expect(page.getByTestId('freeform-element')).toHaveCount(1)
  })

  test('new elements fan out from the middle instead of stacking on one spot', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await insertShape(page)
    await insertShape(page)
    // 3% of the 1080px page width per step, down and to the right.
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 360, y: 600, width: 360, height: 240 },
      { x: 392, y: 632, width: 360, height: 240 },
      { x: 424, y: 664, width: 360, height: 240 },
    ])
    // Moving one off the middle frees its spot for the next insert.
    await setSelectedElementPosition(page, 40, 40)
    await insertShape(page)
    await expect.poll(async () => (await freeformElementBoxes(page)).at(-1)).toEqual(
      { x: 424, y: 664, width: 360, height: 240 },
    )
  })

  test('a picture on the system clipboard pastes into the page', async ({ page }) => {
    await openFreeform(page)
    await expect(page.getByTestId('freeform-canvas')).toBeVisible()
    const images = page.getByTestId('freeform-element').filter({ has: page.locator('.freeform-image') })
    const pastePicture = (picture: Buffer = TEST_PNG) => page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      const clipboard = new DataTransfer()
      clipboard.items.add(new File([bytes], 'screenshot.png', { type: 'image/png' }))
      document.body.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }))
    }, picture.toString('base64'))
    // A different blue pixel: swapping to it is visible in the src.
    const BLUE_PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwSPkPAAJbAZRxR3Z2AAAAAElFTkSuQmCC',
      'base64',
    )

    await pastePicture()
    await expect(images).toHaveCount(1)
    await expect(images.first()).toHaveAttribute('data-selected', 'true')
    // With nothing selected (a click on empty canvas), a second paste steps
    // clear of the first.
    await page.getByTestId('freeform-canvas').click({ position: { x: 10, y: 10 } })
    await pastePicture()
    await expect(images).toHaveCount(2)
    const [first, second] = await images.evaluateAll((nodes) => nodes.map((node) => ({
      x: Number.parseFloat((node as HTMLElement).style.left),
      y: Number.parseFloat((node as HTMLElement).style.top),
    })))
    expect(second.x - first.x).toBe(32)
    expect(second.y - first.y).toBe(32)

    // A single selected shape takes the pasted picture as its fill — no new
    // image element appears. (Parked in the corner first so it stays clear
    // of the images for the clicks that follow.)
    await insertShape(page)
    await setSelectedElementPosition(page, 40, 40)
    await pastePicture()
    await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(1)
    await expect(page.getByTestId('freeform-shape-image-fill')
      .locator('[data-framed-image="true"]')).toHaveAttribute('data-image-load-state', 'ready')
    await expect(images).toHaveCount(2)

    // A single selected image node swaps its picture instead of adding one.
    // (The second image only steps 32px clear, so the click goes to the
    // first image's uncovered top-left corner.)
    await images.first().click({ position: { x: 10, y: 10 } })
    await expect(images.first()).toHaveAttribute('data-selected', 'true')
    const srcBefore = await images.first().locator('img').getAttribute('src')
    await pastePicture(BLUE_PNG)
    await expect(images).toHaveCount(2)
    await expect(images.first().locator('[data-framed-image="true"]'))
      .toHaveAttribute('data-image-load-state', 'ready')
    // The picture itself was swapped in place, not just left alone: pasting a
    // different picture changes the image's source. (The paste pipeline runs
    // on after the event itself, so the change is polled for.)
    await expect.poll(async () => images.first().locator('img').getAttribute('src'))
      .not.toBe(srcBefore)

    // Without a picture, a paste brings back what was copied in the editor.
    await page.keyboard.press('Control+c')
    await page.evaluate(() => {
      document.body.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer(),
      }))
    })
    await expect(images).toHaveCount(3)

    // A text field keeps its own paste.
    await page.keyboard.press('Escape')
    const pageName = page.getByTestId('inspector-page').getByLabel('页面名称')
    await pageName.focus()
    await pageName.evaluate((node, base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      const clipboard = new DataTransfer()
      clipboard.items.add(new File([bytes], 'screenshot.png', { type: 'image/png' }))
      node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }))
    }, TEST_PNG.toString('base64'))
    await expect(images).toHaveCount(3)
  })

  test('canvas menu items show their shortcuts without changing their names', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const element = page.getByTestId('freeform-element').first()
    await element.click({ button: 'right' })
    const menu = page.getByTestId('freeform-context-menu')
    await expect(menu).toBeVisible()
    const duplicate = menu.getByRole('menuitem', { name: '原位复制', exact: true })
    await expect(duplicate).toBeVisible()
    await expect(duplicate.locator('kbd')).toHaveAttribute('aria-hidden', 'true')
    await expect(duplicate.locator('kbd')).toHaveText(/D$/)
    await expect(menu.getByTestId('freeform-context-menu-front').locator('kbd')).toHaveText(']')
    await expect(menu.getByTestId('freeform-context-menu-lock').locator('kbd')).toHaveCount(0)
  })
})

test('the Elements panel finds icons and drops them in as vector paths to style', async ({ page }) => {
  await openFreeform(page)
  const drawer = page.getByTestId('freeform-elements-drawer')
  await page.getByTestId('freeform-elements-tool').click()
  await expect(drawer).toBeVisible()

  const search = page.getByTestId('freeform-element-search')
  await search.fill('购物')
  await expect(drawer.locator('.freeform-icon-tile')).toHaveCount(2)
  await expect(drawer.getByRole('button', { name: '购物车', exact: true })).toBeVisible()
  await search.fill('没有这种图标')
  await expect(page.getByTestId('freeform-element-empty')).toBeVisible()
  // Escape clears a search before it closes the panel.
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(drawer).toBeVisible()

  await drawer.getByTestId('insert-icon-star').click()
  const graphic = page.getByTestId('freeform-path')
  const drawing = graphic.locator('path')
  await expect(graphic).toHaveCount(1)
  await expect(selectedFreeformElements(page)).toHaveCount(1)
  await expect(page.getByTestId('freeform-context-toolbar')).toHaveAttribute('data-subject', 'path')
  // A 24-unit icon in a 162px box (15% of the page's short side), stroked at 2 units.
  await expect.poll(() => freeformElementBoxes(page)).toEqual([{ x: 459, y: 639, width: 162, height: 162 }])
  await expect(drawing).toHaveAttribute('stroke-width', '13.5')
  await expect(drawing).toHaveAttribute('fill', 'none')
  await expect(drawing).toHaveAttribute('stroke-linejoin', 'round')

  const stroke = page.getByTestId('inspector-stroke')
  const width = stroke.getByLabel('描边宽', { exact: true })
  await expect(width).toHaveValue('13.5')
  await width.fill('27')
  await width.press('Enter')
  await expect(drawing).toHaveAttribute('stroke-width', '27')
  await stroke.getByTestId('path-join-miter').click()
  await expect(drawing).toHaveAttribute('stroke-linejoin', 'miter')
  await stroke.getByLabel('虚线', { exact: true }).fill('20')
  await stroke.getByLabel('虚线', { exact: true }).press('Enter')
  await expect(drawing).toHaveAttribute('stroke-dasharray', '20 20')
  await stroke.getByTestId('path-dash-clear').click()
  await expect(drawing).not.toHaveAttribute('stroke-dasharray', /./)

  await page.getByTestId('path-fill-paint').getByRole('button', { name: '纯色', exact: true }).click()
  await expect(drawing).toHaveAttribute('fill', /^#/)

  // Stretching from an edge widens the drawing; the stroke keeps one width.
  await setSelectedElementBox(page, 400, 600, 324, 162)
  await expect(drawing).toHaveAttribute('stroke-width', /^38\.18/)
  await expect(drawing).toHaveAttribute('d', /^M/)

  await page.getByTestId('freeform-layers-tool').click()
  await expect(page.getByRole('treeitem', { name: '星星', exact: true })).toHaveCount(1)
})

test('a path fills with a picture and frames it inside the outline (v19)', async ({ page }) => {
  await openFreeform(page)

  // A heart icon becomes the picture frame.
  await withToolPanel(page, 'elements', (panel) => panel.getByTestId('insert-icon-heart').click())
  const pathFill = page.getByTestId('path-fill-paint')
  // The path fill offers the same picture mode shapes get.
  await expect(pathFill.getByTestId('paint-mode-image')).toBeVisible()

  await page.getByTestId('inspector-fill').locator('input.freeform-file').setInputFiles({
    name: 'path-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  const frame = page.getByTestId('freeform-path-image-fill')
  await expect(frame).toHaveCount(1)
  // The picture is clipped to the outline, not to a rectangle.
  await expect(frame).toHaveCSS('clip-path', /^path\(/)
  await expect(frame.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  // The stroke still draws on top of the picture.
  await expect(page.getByTestId('freeform-path').locator('path')).toHaveAttribute('fill', 'none')

  // Double-click opens the framing session; the surface shows the outline.
  const pathElement = page.getByTestId('freeform-element').filter({ has: frame })
  await pathElement.dblclick()
  const surface = page.getByTestId('freeform-framing-surface')
  await expect(surface).toBeVisible()
  await expect(surface).toHaveCSS('clip-path', /^path\(/)
  await page.getByTestId('freeform-framing-cancel').click()
  await expect(surface).toHaveCount(0)
  await expect(frame).toHaveCount(1)

  await signUpToSave(page, `path-fill-${Date.now().toString(36)}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await expect(page.getByTestId('freeform-path-image-fill')).toHaveCSS('clip-path', /^path\(/)
  await expect(page.getByTestId('freeform-path-image-fill')
    .locator('[data-framed-image="true"]')).toHaveAttribute('data-image-load-state', 'ready')
})

test('the Elements panel inserts collage grids and pictures fill their cells', async ({ page }) => {
  await openFreeform(page)

  // The collage tiles sit under their own group in the elements drawer.
  await withToolPanel(page, 'elements', (panel) => panel
    .getByRole('group', { name: '拼图' })
    .getByTestId('insert-collage-quad')
    .click())

  // A group of four placeholder cells lands on the page, selected as one.
  const collage = page.getByTestId('freeform-scene-group')
  await expect(collage).toHaveCount(1)
  await expect(collage.locator('.freeform-shape')).toHaveCount(4)

  // Double-clicking a cell enters the collage group, a click then selects
  // the cell itself (the inner shape takes no pointer events — clicks land on
  // its wrapper).
  const firstCell = collage.locator('[data-testid="freeform-element"]').first()
  await firstCell.dblclick()
  await firstCell.click()
  await expect(page.getByTestId('shape-fill-paint')).toBeVisible()
  await page.getByTestId('inspector-fill').locator('input.freeform-file').setInputFiles({
    name: 'collage-cell.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  const cellFrame = page.getByTestId('freeform-shape-image-fill')
  await expect(cellFrame).toHaveCount(1)
  await expect(cellFrame.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')

  // The collage and its picture survive a reload.
  await signUpToSave(page, `collage-${Date.now().toString(36)}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await expect(page.getByTestId('freeform-scene-group').locator('.freeform-shape')).toHaveCount(4)
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(1)
})

test('a path keeps its proportions from a corner handle and stretches from an edge', async ({ page }) => {
  await openFreeform(page)
  await withToolPanel(page, 'elements', (panel) => panel.getByTestId('insert-icon-heart').click())
  await setSelectedElementBox(page, 100, 100, 400, 400)
  await expect.poll(() => freeformElementBoxes(page)).toEqual([{ x: 100, y: 100, width: 400, height: 400 }])

  const drag = async (testId: string, dx: number, dy: number) => {
    const box = await page.getByTestId(testId).boundingBox()
    expect(box).toBeTruthy()
    const start = { x: Math.round(box!.x + box!.width / 2), y: Math.round(box!.y + box!.height / 2) }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + dx / 2, start.y + dy / 2)
    await page.mouse.move(start.x + dx, start.y + dy)
    await page.mouse.up()
  }

  await drag('freeform-selection-resize', 90, 10)
  const [cornered] = await freeformElementBoxes(page)
  expect(cornered.width).toBeGreaterThan(420)
  expect(cornered.width).toBeCloseTo(cornered.height, 6)

  await drag('freeform-selection-resize-e', 60, 0)
  const [edged] = await freeformElementBoxes(page)
  expect(edged.width).toBeGreaterThan(cornered.width + 20)
  expect(edged.height).toBeCloseTo(cornered.height, 6)
})

test('我的项目 imports a v15 document with icons and custom paths', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await openFreeform(page)
  await page.getByTestId('account-login').click()
  await registerUser(page, `paths-${Date.now()}`)

  const pathNode = {
    locked: false,
    hidden: false,
    type: 'path',
    rotation: 0,
    scale: 1,
    stroke: '#17293c',
    strokeWidth: 2,
  }
  const importedDocument = {
    documentVersion: 15,
    activeSlideId: 'path-slide-1',
    slides: [{
      id: 'path-slide-1',
      name: '图形页',
      width: 1080,
      height: 1440,
      background: { type: 'solid', color: '#ffffff' },
      nodes: [
        {
          ...pathNode,
          id: 'path-icon',
          name: '对勾',
          x: 100,
          y: 100,
          width: 240,
          height: 240,
          d: 'M20 6 9 17l-5-5',
          viewBox: { x: 0, y: 0, width: 24, height: 24 },
          fill: { type: 'transparent' },
        },
        {
          ...pathNode,
          id: 'path-blob',
          name: '色块',
          x: 400,
          y: 400,
          width: 400,
          height: 200,
          d: 'M0 50a50 50 0 1 0 100 0a50 50 0 1 0-100 0z',
          viewBox: { x: 0, y: 0, width: 100, height: 100 },
          fill: { type: 'linear-gradient', from: '#fde68a', to: '#f97316', angle: 90 },
          strokeWidth: 0,
        },
      ],
    }],
  }

  await page.goto('/#/projects')
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'paths.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedDocument)),
  })

  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  const paths = page.getByTestId('freeform-path').locator('path')
  await expect(paths).toHaveCount(2)
  // The 24-unit check mark is redrawn ten times larger; the circle stretches into an ellipse.
  await expect(paths.nth(0)).toHaveAttribute('d', 'M200 60 90 170l-50 -50')
  await expect(paths.nth(0)).toHaveAttribute('stroke-width', '20')
  await expect(paths.nth(1)).toHaveAttribute('d', 'M0 100a200 100 0 1 0 400 0a200 100 0 1 0 -400 0z')
  await expect(paths.nth(1)).toHaveAttribute('fill', /^url\(#/)
  await expect(paths.nth(1)).toHaveAttribute('stroke', 'none')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByTestId('freeform-path').locator('path').nth(0)).toHaveAttribute('d', 'M200 60 90 170l-50 -50')
})

test('the page takes a picture background: choose, fit, frame, clear, and it exports under the artwork', async ({ page }) => {
  await openFreeform(page)
  const pagePaint = page.getByTestId('page-background-paint')
  const chooser = page.waitForEvent('filechooser')
  await pagePaint.getByTestId('paint-mode-image').click()
  // A deep blue picture, wider than the page, with a yellow band down its middle.
  const bluePicture = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#1e3a8a"/><rect x="760" width="80" height="900" fill="#facc15"/></svg>',
  )
  await (await chooser).setFiles({ name: 'page-background.svg', mimeType: 'image/svg+xml', buffer: bluePicture })

  const layer = page.getByTestId('freeform-page-background')
  const picture = layer.locator('[data-framed-image="true"]')
  await expect(picture).toHaveAttribute('data-image-load-state', 'ready')
  await expect(page.locator('.freeform-slide-preview .freeform-page-background')).toHaveCount(1)
  await expect(pagePaint.getByTestId('paint-mode-image')).toHaveClass(/\bon\b/)

  // The picture sits under everything and never takes a click.
  await insertShape(page)
  await expect(layer).toHaveCSS('pointer-events', 'none')
  await page.getByTestId('freeform-canvas').click({ position: { x: 8, y: 8 } })
  await expect(selectedFreeformElements(page)).toHaveCount(0)

  await pagePaint.getByTestId('paint-image-fit-contain').click()
  await expect(layer.locator('img')).toHaveCSS('object-fit', 'contain')
  await expect(pagePaint.getByTestId('freeform-adjust-framing')).toBeDisabled()
  await pagePaint.getByTestId('paint-image-fit-cover').click()

  // Framing it works like framing a picture: drag inside, then 完成.
  await expect(pagePaint.getByTestId('freeform-reset-framing')).toBeDisabled()
  await pagePaint.getByTestId('freeform-adjust-framing').click()
  const surface = page.getByTestId('freeform-framing-surface')
  await expect(surface).toBeVisible()
  const box = (await surface.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(surface).not.toHaveAttribute('data-framing-focus-x', '0.5')
  await page.getByTestId('freeform-framing-done').click()
  await expect(surface).toHaveCount(0)
  await expect(pagePaint.getByTestId('freeform-reset-framing')).toBeEnabled()

  // The export draws the picture under the artwork: blue at the top-left corner, under no node.
  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  const download = await downloadPromise
  const exported = await download.path()
  expect(exported).toBeTruthy()
  const corner = await samplePngPixel(page, exported!, 20, 20)
  expect(rgbDistance(corner.slice(0, 3), [30, 58, 138])).toBeLessThan(12)
  await page.keyboard.press('Escape')

  await pagePaint.getByTestId('freeform-reset-framing').click()
  await expect(pagePaint.getByTestId('freeform-reset-framing')).toBeDisabled()
  await pagePaint.getByRole('button', { name: '清除图片' }).click()
  await expect(layer).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(layer).toHaveCount(1)
})

test('a picture becomes the page background from its panel or the right-click menu, in one undo step', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'as-background.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const pictureNode = page.getByTestId('freeform-element').filter({ has: page.locator('.freeform-image') })
  await expect(pictureNode).toHaveCount(1)
  const layer = page.getByTestId('freeform-page-background')
  const workspace = page.locator('.freeform-workspace')
  const depth = Number(await workspace.getAttribute('data-history-depth'))

  await page.getByTestId('freeform-image-as-background').click()
  await expect(pictureNode).toHaveCount(0)
  await expect(layer.locator('[data-framed-image="true"]')).toHaveAttribute('data-image-load-state', 'ready')
  await expect(workspace).toHaveAttribute('data-history-depth', String(depth + 1))

  await page.keyboard.press('ControlOrMeta+z')
  await expect(pictureNode).toHaveCount(1)
  await expect(layer).toHaveCount(0)

  await pictureNode.click({ button: 'right' })
  await page.getByTestId('freeform-context-menu-as-background').click()
  await expect(pictureNode).toHaveCount(0)
  await expect(layer).toHaveCount(1)
})
