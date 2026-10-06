import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { effectiveSceneState } from './sceneSelection'
import { findNodeAtPath, scenePathKey } from './sceneTree'
import {
  decomposeSimilarity,
  multiply,
  sceneNodeBoundsInWorld,
  sceneNodesBoundsInParent,
  sceneWorldMatrixAtPath,
  transformPoint,
  translation,
} from './sceneTransform'
import type { Matrix2D, SceneBounds } from './sceneTransform'
import type { FreeformSceneNode, LinePoint, ScenePath } from './types'
import { cornerHandlePosition, shapeHandlePosition, shapeParamOf, type ShapeParam } from './shapeGeometry'
import { t } from '../i18n'

export type SelectionOverlayInteraction = 'move' | 'resize' | 'rotate' | null

/** A resize handle, named by compass direction; `se` is the keyboard-focusable one. */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** How a handle moves each edge of the frame: -1 the left/top edge, 1 the right/bottom, 0 neither. */
export const RESIZE_HANDLE_AXES: Record<ResizeHandle, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
}

const CORNER_HANDLES: readonly ResizeHandle[] = ['nw', 'ne', 'sw']
const EDGE_HANDLES: readonly ResizeHandle[] = ['n', 'e', 's', 'w']

/** Below this on-screen size the edge handles would crowd the corners. */
const EDGE_HANDLE_MIN_SCREEN_PX = 56
/** Below this, only the focusable corner stays: four would cover the object. */
const CORNER_HANDLE_MIN_SCREEN_PX = 36
/** Room the rotate/move pill needs between the frame and the top of the page. */
const TOOLS_CLEARANCE_SCREEN_PX = 52

export interface SelectionOverlayTarget {
  key: string
  kind: 'leaf' | 'group' | 'multi'
  nodeIds: string[]
  paths: ScenePath[]
  worldBounds: SceneBounds
  resizePivot: { x: number; y: number }
  /** The frame corner opposite each corner handle, in page coordinates. */
  corners: Record<'nw' | 'ne' | 'se' | 'sw', { x: number; y: number }>
  center: { x: number; y: number }
}

export interface FreeformSelectionOverlayProps {
  nodes: readonly FreeformSceneNode[]
  selectedPaths: readonly ScenePath[]
  renderScale: number
  activeInteraction: SelectionOverlayInteraction
  interactive: boolean
  /** Live size ("W×H") or angle ("30°") readout shown under the frame while a gesture runs. */
  badge?: string | null
  onMovePointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    target: SelectionOverlayTarget,
  ) => void
  onResizePointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    target: SelectionOverlayTarget,
    handle: ResizeHandle,
  ) => void
  onRotatePointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    target: SelectionOverlayTarget,
  ) => void
  /** Vertex handles appear only for a selected single polyline; index is the vertex order. */
  onVertexPointerDown?: (
    event: ReactPointerEvent<HTMLButtonElement>,
    target: SelectionOverlayTarget,
    vertexIndex: number,
  ) => void
  /** Double-clicking a vertex handle removes that vertex (kept >= 2 by the handler). */
  onVertexDoubleClick?: (
    event: ReactMouseEvent<HTMLButtonElement>,
    target: SelectionOverlayTarget,
    vertexIndex: number,
  ) => void
  /** A parametric shape's handle (single selected shape only); drags edit the parameter. */
  onShapeParamPointerDown?: (
    event: ReactPointerEvent<HTMLButtonElement>,
    target: SelectionOverlayTarget,
    param: ShapeParam,
  ) => void
}

type SelectionOverlayStyle = CSSProperties & {
  '--freeform-inverse-scale': number
}

const SHAPE_PARAM_LABEL = {
  cornerRadius: '调整圆角',
  starInnerRatio: '调整星角内径',
  bubbleTailX: '调整气泡尾巴',
} as const

const MOVE_LABEL = '移动对象'
const MOVE_TITLE = '拖拽移动'
const RESIZE_LABEL = '调整大小'
const ROTATE_LABEL = '旋转对象'

interface OverlayFrame {
  target: SelectionOverlayTarget
  matrix: Matrix2D
  width: number
  height: number
  /** Polyline vertices in the frame's local coordinates (single line leaf only). */
  vertices?: LinePoint[]
  /** A parametric shape's parameter handle, in the frame's local coordinates. */
  shapeParamHandle?: { param: ShapeParam; x: number; y: number }
}

function frameCorners(matrix: Matrix2D, width: number, height: number): SelectionOverlayTarget['corners'] {
  return {
    nw: transformPoint(matrix, { x: 0, y: 0 }),
    ne: transformPoint(matrix, { x: width, y: 0 }),
    se: transformPoint(matrix, { x: width, y: height }),
    sw: transformPoint(matrix, { x: 0, y: height }),
  }
}

function unionBounds(bounds: readonly SceneBounds[]): SceneBounds | null {
  if (bounds.length === 0) return null
  const left = Math.min(...bounds.map((bound) => bound.x))
  const top = Math.min(...bounds.map((bound) => bound.y))
  const right = Math.max(...bounds.map((bound) => bound.x + bound.width))
  const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function buildOverlayFrames(
  nodes: readonly FreeformSceneNode[],
  selectedPaths: readonly ScenePath[],
  renderScale: number,
): OverlayFrame[] {
  const visiblePaths = selectedPaths.filter((path) => (
    effectiveSceneState(nodes, path)?.hidden === false &&
    effectiveSceneState(nodes, path)?.locked === false
  ))
  if (visiblePaths.length === 0) return []
  if (visiblePaths.length > 1) {
    const paths = visiblePaths.map((path) => [...path])
    const worldBounds = paths.flatMap((path) => {
      const bounds = sceneNodeBoundsInWorld(nodes, path)
      return bounds ? [bounds] : []
    })
    if (worldBounds.length !== paths.length) return []
    const bounds = unionBounds(worldBounds)
    if (!bounds) return []
    const matrix = translation(bounds.x, bounds.y)
    return [{
      target: {
        key: `multi:${paths.map(scenePathKey).join('|')}`,
        kind: 'multi',
        nodeIds: paths.map((path) => path[path.length - 1]),
        paths,
        worldBounds: bounds,
        resizePivot: { x: bounds.x, y: bounds.y },
        corners: frameCorners(matrix, bounds.width, bounds.height),
        center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      },
      matrix,
      width: bounds.width,
      height: bounds.height,
    }]
  }

  const path = [...visiblePaths[0]]
  const node = findNodeAtPath(nodes, path)
  const world = sceneWorldMatrixAtPath(nodes, path)
  const worldBounds = sceneNodeBoundsInWorld(nodes, path)
  if (!node || !world || !worldBounds) return []
  const localBounds = node.type === 'group'
    ? sceneNodesBoundsInParent(node.children)
    : { x: 0, y: 0, width: node.width, height: node.height }
  if (!localBounds) return []
  const frameMatrix = multiply(world, translation(localBounds.x, localBounds.y))
  const vertices = node.type === 'line' && node.points
    ? node.points.map((point) => ({ x: point.x + localBounds.x, y: point.y + localBounds.y }))
    : undefined
  let shapeParamPosition = node.type === 'shape' && !node.locked
    ? shapeHandlePosition(node.shape, localBounds.width, localBounds.height, node)
    : null
  // The corner-radius dot rides the outline at the arc's top-edge endpoint;
  // the drag base stays the arc-centre anchor, so drawing never shifts it.
  if (shapeParamPosition && node.type === 'shape' && node.shape === 'rect') {
    shapeParamPosition = cornerHandlePosition(
      node.cornerRadius ?? 16,
      localBounds.width,
      localBounds.height,
      renderScale,
    )
  }
  const shapeParam = node.type === 'shape' ? shapeParamOf(node.shape) : null
  const shapeParamHandle = shapeParamPosition && shapeParam
    ? { param: shapeParam, x: shapeParamPosition.x, y: shapeParamPosition.y }
    : undefined
  return [{
    target: {
      key: scenePathKey(path),
      kind: node.type === 'group' ? 'group' : 'leaf',
      nodeIds: [node.id],
      paths: [path],
      worldBounds,
      resizePivot: transformPoint(frameMatrix, { x: 0, y: 0 }),
      corners: frameCorners(frameMatrix, localBounds.width, localBounds.height),
      center: transformPoint(frameMatrix, {
        x: localBounds.width / 2,
        y: localBounds.height / 2,
      }),
    },
    matrix: frameMatrix,
    width: localBounds.width,
    height: localBounds.height,
    vertices,
    ...(shapeParamHandle ? { shapeParamHandle } : {}),
  }]
}

function matrixCss(matrix: Matrix2D): string {
  return `matrix(${matrix.join(',')})`
}

/**
 * Selection chrome is deliberately rendered after artwork. The artwork keeps
 * its real stacking order while this layer owns all interactive hit targets.
 */
export function FreeformSelectionOverlay({
  nodes,
  selectedPaths,
  renderScale,
  activeInteraction,
  interactive,
  badge,
  onMovePointerDown,
  onResizePointerDown,
  onRotatePointerDown,
  onVertexPointerDown,
  onVertexDoubleClick,
  onShapeParamPointerDown,
}: FreeformSelectionOverlayProps) {
  const frames = buildOverlayFrames(nodes, selectedPaths, renderScale)
  const inverseRenderScale = renderScale > 0 ? 1 / renderScale : 1

  return (
    <div
      className="freeform-ui-only freeform-selection-overlay"
      data-testid="freeform-selection-overlay"
      data-live-interaction={activeInteraction ?? undefined}
      role="presentation"
      style={{ '--freeform-inverse-scale': inverseRenderScale } as SelectionOverlayStyle}
    >
      {frames.map(({ target, matrix, width, height, vertices, shapeParamHandle }) => {
          const frameScale = decomposeSimilarity(matrix)?.scale ?? 1
          const itemStyle: SelectionOverlayStyle = {
            left: 0,
            top: 0,
            width,
            height,
            transform: matrixCss(matrix),
            '--freeform-inverse-scale': frameScale > 0
              ? inverseRenderScale / frameScale
              : inverseRenderScale,
          }
          const screenWidth = width * frameScale * renderScale
          const screenHeight = height * frameScale * renderScale
          // The rotate/move pill sits above the frame, or below it when the page edge is too close.
          const toolsBelow = target.worldBounds.y * renderScale < TOOLS_CLEARANCE_SCREEN_PX
          const polyline = vertices !== undefined && vertices.length > 0
          const cornerHandles = polyline || Math.min(screenWidth, screenHeight) < CORNER_HANDLE_MIN_SCREEN_PX
            ? []
            : CORNER_HANDLES
          // Only a single box can stretch along one edge; groups and multi-selections scale from a corner.
          const edgeHandles = target.kind === 'leaf' && !polyline
            ? EDGE_HANDLES.filter((handle) => (
                handle === 'n' || handle === 's'
                  ? screenWidth >= EDGE_HANDLE_MIN_SCREEN_PX
                  : screenHeight >= EDGE_HANDLE_MIN_SCREEN_PX
              ))
            : []

          return (
            <div
              key={target.key}
              className="freeform-selection-item"
              data-testid="freeform-selection-box"
              data-element-id={target.nodeIds.length === 1 ? target.nodeIds[0] : 'multi'}
              data-selection-kind={target.kind}
              style={itemStyle}
            >
              <span className="freeform-ui-only element-outline" aria-hidden="true" />
              {interactive && (
                <>
                  {[...edgeHandles, ...cornerHandles].map((handle) => (
                    <span
                      key={handle}
                      className={`freeform-ui-only freeform-resize-handle is-${EDGE_HANDLES.includes(handle) ? 'edge' : 'corner'}`}
                      data-handle={handle}
                      data-testid={`freeform-selection-resize-${handle}`}
                      aria-hidden="true"
                      onPointerDown={(event) => onResizePointerDown(event, target, handle)}
                    />
                  ))}
                  <button
                    className="freeform-ui-only element-resize freeform-selection-resize"
                    data-testid="freeform-selection-resize"
                    data-handle="se"
                    type="button"
                    aria-label={t(RESIZE_LABEL)}
                    onPointerDown={(event) => onResizePointerDown(event, target, 'se')}
                  />
                  <span className="freeform-ui-only freeform-selection-tools" data-placement={toolsBelow ? 'below' : 'above'}>
                    <button
                      className="freeform-ui-only element-rotate freeform-selection-rotate"
                      data-testid="freeform-selection-rotate"
                      type="button"
                      aria-label={t(ROTATE_LABEL)}
                      title={t('拖动旋转，按住 Shift 以 15° 为步长')}
                      onPointerDown={(event) => onRotatePointerDown(event, target)}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M13 8a5 5 0 1 1-1.46-3.54" />
                        <path d="M13 2.5v3h-3" />
                      </svg>
                    </button>
                    <button
                      className="freeform-ui-only element-drag freeform-selection-move"
                      data-testid="freeform-selection-move"
                      type="button"
                      aria-label={t(MOVE_LABEL)}
                      title={t(MOVE_TITLE)}
                      onPointerDown={(event) => onMovePointerDown(event, target)}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M8 1.75v12.5M1.75 8h12.5" />
                        <path d="M6.25 3.5 8 1.75 9.75 3.5M6.25 12.5 8 14.25l1.75-1.75M3.5 6.25 1.75 8l1.75 1.75M12.5 6.25 14.25 8l-1.75 1.75" />
                      </svg>
                    </button>
                  </span>
                </>
              )}
              {interactive && polyline && onVertexPointerDown && (
                <>
                  {vertices.map((vertex, index) => (
                    <button
                      key={`vertex-${index}`}
                      className="freeform-ui-only freeform-vertex-handle"
                      data-testid={`freeform-vertex-handle-${index}`}
                      type="button"
                      aria-label={t('拖动顶点 {n}', { n: index + 1 })}
                      style={{ left: vertex.x, top: vertex.y }}
                      onPointerDown={(event) => onVertexPointerDown(event, target, index)}
                      onDoubleClick={(event) => onVertexDoubleClick?.(event, target, index)}
                    />
                  ))}
                </>
              )}
              {interactive && shapeParamHandle && onShapeParamPointerDown && (
                <button
                  className="freeform-ui-only freeform-vertex-handle freeform-param-handle"
                  data-testid={`freeform-shape-param-${shapeParamHandle.param}`}
                  type="button"
                  aria-label={t(SHAPE_PARAM_LABEL[shapeParamHandle.param])}
                  title={t(SHAPE_PARAM_LABEL[shapeParamHandle.param])}
                  style={{ left: shapeParamHandle.x, top: shapeParamHandle.y }}
                  onPointerDown={(event) => onShapeParamPointerDown(event, target, shapeParamHandle.param)}
                />
              )}
              {badge && (
                <span
                  className="freeform-ui-only freeform-selection-badge"
                  data-testid="freeform-selection-badge"
                >
                  {badge}
                </span>
              )}
            </div>
          )
        })}
    </div>
  )
}
