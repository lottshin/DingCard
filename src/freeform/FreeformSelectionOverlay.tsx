import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
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
import type { FreeformSceneNode, ScenePath } from './types'

export type SelectionOverlayInteraction = 'move' | 'resize' | 'rotate' | null

export interface SelectionOverlayTarget {
  key: string
  kind: 'leaf' | 'group' | 'multi'
  nodeIds: string[]
  paths: ScenePath[]
  worldBounds: SceneBounds
  resizePivot: { x: number; y: number }
  center: { x: number; y: number }
}

export interface FreeformSelectionOverlayProps {
  nodes: readonly FreeformSceneNode[]
  selectedPaths: readonly ScenePath[]
  renderScale: number
  activeInteraction: SelectionOverlayInteraction
  interactive: boolean
  onMovePointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    target: SelectionOverlayTarget,
  ) => void
  onResizePointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    target: SelectionOverlayTarget,
  ) => void
  onRotatePointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    target: SelectionOverlayTarget,
  ) => void
}

type SelectionOverlayStyle = CSSProperties & {
  '--freeform-inverse-scale': number
}

const MOVE_LABEL = '\u79fb\u52a8\u5bf9\u8c61'
const MOVE_TITLE = '\u62d6\u62fd\u79fb\u52a8'
const RESIZE_LABEL = '\u8c03\u6574\u5927\u5c0f'
const ROTATE_LABEL = '\u65cb\u8f6c\u5bf9\u8c61'

interface OverlayFrame {
  target: SelectionOverlayTarget
  matrix: Matrix2D
  width: number
  height: number
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
    return [{
      target: {
        key: `multi:${paths.map(scenePathKey).join('|')}`,
        kind: 'multi',
        nodeIds: paths.map((path) => path[path.length - 1]),
        paths,
        worldBounds: bounds,
        resizePivot: { x: bounds.x, y: bounds.y },
        center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      },
      matrix: translation(bounds.x, bounds.y),
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
  return [{
    target: {
      key: scenePathKey(path),
      kind: node.type === 'group' ? 'group' : 'leaf',
      nodeIds: [node.id],
      paths: [path],
      worldBounds,
      resizePivot: transformPoint(frameMatrix, { x: 0, y: 0 }),
      center: transformPoint(frameMatrix, {
        x: localBounds.width / 2,
        y: localBounds.height / 2,
      }),
    },
    matrix: frameMatrix,
    width: localBounds.width,
    height: localBounds.height,
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
  onMovePointerDown,
  onResizePointerDown,
  onRotatePointerDown,
}: FreeformSelectionOverlayProps) {
  const frames = buildOverlayFrames(nodes, selectedPaths)
  const inverseRenderScale = renderScale > 0 ? 1 / renderScale : 1

  return (
    <div
      className="freeform-ui-only freeform-selection-overlay"
      data-testid="freeform-selection-overlay"
      data-live-interaction={activeInteraction ?? undefined}
      role="presentation"
      style={{ '--freeform-inverse-scale': inverseRenderScale } as SelectionOverlayStyle}
    >
      {frames.map(({ target, matrix, width, height }) => {
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
                  <button
                    className="freeform-ui-only element-drag freeform-selection-move"
                    data-testid="freeform-selection-move"
                    type="button"
                    aria-label={MOVE_LABEL}
                    title={MOVE_TITLE}
                    onPointerDown={(event) => onMovePointerDown(event, target)}
                  />
                  <button
                    className="freeform-ui-only element-resize freeform-selection-resize"
                    data-testid="freeform-selection-resize"
                    type="button"
                    aria-label={RESIZE_LABEL}
                    onPointerDown={(event) => onResizePointerDown(event, target)}
                  />
                  <button
                    className="freeform-ui-only element-rotate freeform-selection-rotate"
                    data-testid="freeform-selection-rotate"
                    type="button"
                    aria-label={ROTATE_LABEL}
                    onPointerDown={(event) => onRotatePointerDown(event, target)}
                  />
                </>
              )}
            </div>
          )
        })}
    </div>
  )
}
