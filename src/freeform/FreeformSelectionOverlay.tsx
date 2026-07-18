import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { FreeformElement } from './types'

export type SelectionOverlayInteraction = 'move' | 'resize' | null

export interface FreeformSelectionOverlayProps {
  elements: FreeformElement[]
  selectedIds: readonly string[]
  renderScale: number
  activeInteraction: SelectionOverlayInteraction
  onMovePointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    element: FreeformElement,
  ) => void
  onResizePointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    element: FreeformElement,
  ) => void
}

type SelectionOverlayStyle = CSSProperties & {
  '--freeform-inverse-scale': number
}

const MOVE_LABEL = '\u79fb\u52a8\u5bf9\u8c61'
const MOVE_TITLE = '\u62d6\u62fd\u79fb\u52a8'
const RESIZE_LABEL = '\u8c03\u6574\u5927\u5c0f'

/**
 * Selection chrome is deliberately rendered after artwork. The artwork keeps
 * its real stacking order while this layer owns all interactive hit targets.
 */
export function FreeformSelectionOverlay({
  elements,
  selectedIds,
  renderScale,
  activeInteraction,
  onMovePointerDown,
  onResizePointerDown,
}: FreeformSelectionOverlayProps) {
  const selected = new Set(selectedIds)
  const inverseScale = renderScale > 0 ? 1 / renderScale : 1

  return (
    <div
      className="freeform-ui-only freeform-selection-overlay"
      data-testid="freeform-selection-overlay"
      data-live-interaction={activeInteraction ?? undefined}
      role="presentation"
      style={{ '--freeform-inverse-scale': inverseScale } as SelectionOverlayStyle}
    >
      {elements
        .filter((element) => selected.has(element.id))
        .map((element) => {
          const itemStyle: SelectionOverlayStyle = {
            left: element.x,
            top: element.y,
            width: element.width,
            height: element.height,
            transform: `rotate(${element.rotation}deg) scale(${element.scale})`,
            '--freeform-inverse-scale': element.scale > 0
              ? inverseScale / element.scale
              : inverseScale,
          }

          return (
            <div
              key={element.id}
              className="freeform-selection-item"
              data-testid="freeform-selection-box"
              data-element-id={element.id}
              style={itemStyle}
            >
              <span className="freeform-ui-only element-outline" aria-hidden="true" />
              <button
                className="freeform-ui-only element-drag freeform-selection-move"
                data-testid="freeform-selection-move"
                type="button"
                aria-label={MOVE_LABEL}
                title={MOVE_TITLE}
                onPointerDown={(event) => onMovePointerDown(event, element)}
              />
              <button
                className="freeform-ui-only element-resize freeform-selection-resize"
                data-testid="freeform-selection-resize"
                type="button"
                aria-label={RESIZE_LABEL}
                onPointerDown={(event) => onResizePointerDown(event, element)}
              />
            </div>
          )
        })}
    </div>
  )
}
