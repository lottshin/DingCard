// 拼图版式: ready-made picture-grid layouts, each a set of cell fractions
// inside its box. Inserting one lays out a group of rounded rect cells with
// even gaps, every cell an ordinary shape ready to take a picture fill
// (选中格子 → 插入图片填充 → 调整取景). A collage is plain grouped shapes —
// no schema of its own, so ungrouping and rearranging stay free.

import type { FreeformGroupNode, FreeformShapeElement } from './types'

export interface CollageCell {
  /** Left / top / size as shares of the collage box (0–1). */
  x: number
  y: number
  width: number
  height: number
}

export interface CollageLayout {
  id: string
  label: string
  /** The collage box's width / height. */
  aspect: number
  cells: CollageCell[]
}

const half = 1 / 2
const third = 1 / 3

export const COLLAGE_LAYOUTS: readonly CollageLayout[] = [
  {
    id: 'pair',
    label: '两张并排',
    aspect: 1.6,
    cells: [
      { x: 0, y: 0, width: half, height: 1 },
      { x: half, y: 0, width: half, height: 1 },
    ],
  },
  {
    id: 'top-feature',
    label: '一大两小',
    aspect: 1.2,
    cells: [
      { x: 0, y: 0, width: 1, height: half },
      { x: 0, y: half, width: half, height: half },
      { x: half, y: half, width: half, height: half },
    ],
  },
  {
    id: 'bottom-feature',
    label: '两小一大',
    aspect: 1.2,
    cells: [
      { x: 0, y: 0, width: half, height: half },
      { x: half, y: 0, width: half, height: half },
      { x: 0, y: half, width: 1, height: half },
    ],
  },
  {
    id: 'triple',
    label: '三等分',
    aspect: 1.5,
    cells: [
      { x: 0, y: 0, width: third, height: 1 },
      { x: third, y: 0, width: third, height: 1 },
      { x: third * 2, y: 0, width: third, height: 1 },
    ],
  },
  {
    id: 'quad',
    label: '四宫格',
    aspect: 1,
    cells: [
      { x: 0, y: 0, width: half, height: half },
      { x: half, y: 0, width: half, height: half },
      { x: 0, y: half, width: half, height: half },
      { x: half, y: half, width: half, height: half },
    ],
  },
  {
    id: 'six',
    label: '六宫格',
    aspect: 0.75,
    cells: [
      { x: 0, y: 0, width: half, height: third },
      { x: half, y: 0, width: half, height: third },
      { x: 0, y: third, width: half, height: third },
      { x: half, y: third, width: half, height: third },
      { x: 0, y: third * 2, width: half, height: third },
      { x: half, y: third * 2, width: half, height: third },
    ],
  },
]

export function collageById(id: string): CollageLayout | undefined {
  return COLLAGE_LAYOUTS.find((layout) => layout.id === id)
}

/** An empty photo slot: light grey with a thin border, so an unfilled
 * collage reads as placeholders rather than finished panels. */
const CELL_PLACEHOLDER_FILL = '#e4e4e7'
const CELL_PLACEHOLDER_STROKE = '#d4d4d8'

export interface CollageBox {
  x: number
  y: number
  width: number
  height: number
}

/** The collage box for a page: 80% of the short side wide, its height from
 * the layout's aspect (clamped to the page), centred. */
export function collageBox(
  layout: CollageLayout,
  page: { width: number; height: number },
): CollageBox {
  const maxByWidth = Math.round(page.width * 0.8)
  const maxByHeight = Math.round((page.height * 0.8) * layout.aspect)
  const width = Math.min(maxByWidth, maxByHeight)
  const height = Math.round(width / layout.aspect)
  return {
    x: Math.round((page.width - width) / 2),
    y: Math.round((page.height - height) / 2),
    width,
    height,
  }
}

export interface CreateCollageOptions {
  /** Where the collage sits on the page; the centred box when absent. */
  box?: CollageBox
  /** Space between cells in px. */
  gap?: number
  /** Cell corner radius in px. */
  cornerRadius?: number
  /** Node id factory (tests pass deterministic ids). */
  createId?: () => string
}

/**
 * The collage as a group of rect cells. Children sit in group-local
 * coordinates (the group carries an origin, no size); each cell is a shape
 * so picture fills, framing and filters all work on it unchanged.
 */
export function createCollageGroup(
  layout: CollageLayout,
  options: CreateCollageOptions = {},
): FreeformGroupNode {
  const gap = options.gap ?? 12
  const cornerRadius = options.cornerRadius ?? 12
  const createId = options.createId ?? (() => crypto.randomUUID())
  const box = options.box ?? { x: 0, y: 0, width: 600, height: 600 / layout.aspect }

  const cells: FreeformShapeElement[] = layout.cells.map((cell, index) => ({
    id: createId(),
    name: `图片位 ${index + 1}`,
    locked: false,
    hidden: false,
    type: 'shape',
    x: Math.round(cell.x * box.width + gap / 2),
    y: Math.round(cell.y * box.height + gap / 2),
    width: Math.max(1, Math.round(cell.width * box.width - gap)),
    height: Math.max(1, Math.round(cell.height * box.height - gap)),
    rotation: 0,
    scale: 1,
    shape: 'rect',
    fill: { type: 'solid', color: CELL_PLACEHOLDER_FILL },
    stroke: CELL_PLACEHOLDER_STROKE,
    strokeWidth: 1,
    cornerRadius,
  }))

  return {
    id: createId(),
    name: '拼图',
    locked: false,
    hidden: false,
    type: 'group',
    x: box.x,
    y: box.y,
    rotation: 0,
    scale: 1,
    children: cells,
  }
}
