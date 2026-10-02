import { memo, useMemo, useState, type DragEvent } from 'react'
import { useLang, t } from '../i18n'
import { SearchIcon, ShapePreviewIcon } from '../ui/icons'
import { COLLAGE_LAYOUTS, collageById } from './collageLayouts'
import {
  DECORATION_CATEGORIES,
  DECORATIONS,
  createDecorationNode,
  decorationBounds,
  searchDecorations,
  type DecorationDefinition,
} from './decorations'
import { FreeformSlidePreview } from './FreeformSlidePreview'
import { ICONS, searchIcons } from './icons'
import type { FreeformLineElement, FreeformShapeElement, FreeformSlide } from './types'

/** Something the Elements panel puts on the page, by click or by dragging it onto the canvas. */
export type ElementPick =
  | { kind: 'shape'; id: FreeformShapeElement['shape'] }
  | { kind: 'line'; id: FreeformLineElement['lineKind'] }
  | { kind: 'collage'; id: string }
  | { kind: 'decoration'; id: string }
  | { kind: 'icon'; id: string }

/** The drag data type an element tile carries onto the canvas. */
export const ELEMENT_DRAG_TYPE = 'application/x-dingcard-element'

export const SHAPES: Array<{ id: FreeformShapeElement['shape']; label: string }> = [
  { id: 'rect', label: '矩形' },
  { id: 'ellipse', label: '圆形' },
  { id: 'triangle', label: '三角形' },
  { id: 'star', label: '五角星' },
  { id: 'hexagon', label: '六边形' },
]

export const LINES: Array<{ id: FreeformLineElement['lineKind']; label: string }> = [
  { id: 'line', label: '直线' },
  { id: 'arrow', label: '箭头' },
]

/** Whether a drag carries an element tile (the data itself is only readable on drop). */
export function carriesElement(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(ELEMENT_DRAG_TYPE)
}

/** The element a drop carries, or null for anything else. */
export function droppedElement(dataTransfer: DataTransfer): ElementPick | null {
  try {
    const value = JSON.parse(dataTransfer.getData(ELEMENT_DRAG_TYPE)) as Partial<ElementPick>
    if (typeof value.id !== 'string') return null
    if (value.kind === 'shape' && SHAPES.some((shape) => shape.id === value.id)) return value as ElementPick
    if (value.kind === 'line' && LINES.some((line) => line.id === value.id)) return value as ElementPick
    if (value.kind === 'collage' && collageById(value.id)) return value as ElementPick
    if (value.kind === 'decoration' && DECORATIONS.some((decoration) => decoration.id === value.id)) return value as ElementPick
    if (value.kind === 'icon' && ICONS.some((icon) => icon.id === value.id)) return value as ElementPick
    return null
  } catch {
    return null
  }
}

function dragProps(pick: ElementPick) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent<HTMLButtonElement>) => {
      event.dataTransfer.setData(ELEMENT_DRAG_TYPE, JSON.stringify(pick))
      event.dataTransfer.effectAllowed = 'copy'
    },
  }
}

/** A decoration alone on a see-through page, for its tile. */
function previewSlide(decoration: DecorationDefinition, language: 'zh' | 'en'): FreeformSlide {
  const bounds = decorationBounds(decoration)
  const width = 240
  const height = (bounds.height * width) / bounds.width
  // Room for a turned stamp or a shadow.
  const margin = 18
  let n = 0
  return {
    id: `decoration-preview-${decoration.id}`,
    name: decoration.zh,
    width: Math.round(width + margin * 2),
    height: Math.round(height + margin * 2),
    background: { type: 'transparent' },
    nodes: [createDecorationNode(decoration, { x: margin, y: margin, width, language }, () => `decoration-preview-${decoration.id}-${n++}`)],
  }
}

function matchesLabel(label: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const haystack = `${label} ${t(label)}`.toLowerCase()
  return words.every((word) => haystack.includes(word))
}

/**
 * The Elements panel: shapes, lines, the decoration library and the icon set,
 * under one search. It keeps its own query, so typing never re-renders the
 * editor around it; give it a stable `onPick` so editor renders skip it too.
 */
export const FreeformElementsPanel = memo(function FreeformElementsPanel({
  onPick,
}: {
  onPick: (pick: ElementPick) => void
}) {
  const lang = useLang()
  const language = lang === 'en' ? 'en' : 'zh'
  const [query, setQuery] = useState('')
  const searching = query.trim().length > 0
  const shapes = useMemo(() => SHAPES.filter((shape) => !searching || matchesLabel(shape.label, query)), [query, searching, lang])
  const lines = useMemo(() => LINES.filter((line) => !searching || matchesLabel(line.label, query)), [query, searching, lang])
  const collages = useMemo(() => COLLAGE_LAYOUTS.filter((layout) => !searching || matchesLabel(layout.label, query)), [query, searching, lang])
  const decorations = useMemo(() => searchDecorations(query), [query])
  const icons = useMemo(() => searchIcons(query), [query])
  const previews = useMemo(() => new Map(DECORATIONS.map((decoration) => [decoration.id, previewSlide(decoration, language)])), [language])
  const nothing = shapes.length + lines.length + collages.length + decorations.length + icons.length === 0

  return (
    <>
      <label className="search-field freeform-element-search">
        <SearchIcon />
        <input
          type="search"
          value={query}
          placeholder={t('搜索元素')}
          aria-label={t('搜索元素')}
          data-testid="freeform-element-search"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      {shapes.length > 0 && (
        <>
          <div className="freeform-drawer-section">{t('形状')}</div>
          <div className="freeform-element-tiles" role="group" aria-label={t('形状')}>
            {shapes.map((shape) => (
              <button
                key={shape.id}
                type="button"
                className="freeform-element-tile"
                data-testid={`insert-shape-${shape.id}`}
                {...dragProps({ kind: 'shape', id: shape.id })}
                onClick={() => onPick({ kind: 'shape', id: shape.id })}
              >
                <ShapePreviewIcon shape={shape.id} />
                <span>{t(shape.label)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {lines.length > 0 && (
        <>
          <div className="freeform-drawer-section">{t('线条')}</div>
          <div className="freeform-element-tiles" role="group" aria-label={t('线条')}>
            {lines.map((line) => (
              <button
                key={line.id}
                type="button"
                className="freeform-element-tile"
                data-testid={`insert-line-${line.id}`}
                {...dragProps({ kind: 'line', id: line.id })}
                onClick={() => onPick({ kind: 'line', id: line.id })}
              >
                <ShapePreviewIcon shape={line.id} />
                <span>{t(line.label)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {collages.length > 0 && (
        <>
          <div className="freeform-drawer-section">{t('拼图')}</div>
          <div className="freeform-element-tiles" role="group" aria-label={t('拼图')}>
            {collages.map((layout) => (
              <button
                key={layout.id}
                type="button"
                className="freeform-element-tile"
                data-testid={`insert-collage-${layout.id}`}
                {...dragProps({ kind: 'collage', id: layout.id })}
                onClick={() => onPick({ kind: 'collage', id: layout.id })}
              >
                <span
                  className="collage-preview"
                  aria-hidden="true"
                  style={{ aspectRatio: `${layout.aspect}` }}
                >
                  {layout.cells.map((cell, index) => (
                    <span
                      key={index}
                      style={{
                        left: `${cell.x * 100}%`,
                        top: `${cell.y * 100}%`,
                        width: `${cell.width * 100}%`,
                        height: `${cell.height * 100}%`,
                      }}
                    />
                  ))}
                </span>
                <span>{t(layout.label)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {DECORATION_CATEGORIES.map((category) => {
        const group = decorations.filter((decoration) => decoration.category === category.id)
        if (group.length === 0) return null
        const label = language === 'en' ? category.en : category.zh
        return (
          <div key={category.id} className="freeform-decoration-group">
            <div className="freeform-drawer-section">{label}</div>
            <div className={`freeform-decoration-grid is-${category.id}`} role="group" aria-label={label}>
              {group.map((decoration) => {
                const name = language === 'en' ? decoration.en : decoration.zh
                const wide = category.id === 'label'
                return (
                  <button
                    key={decoration.id}
                    type="button"
                    className="freeform-decoration-tile"
                    data-testid={`insert-decoration-${decoration.id}`}
                    aria-label={name}
                    title={name}
                    {...dragProps({ kind: 'decoration', id: decoration.id })}
                    onClick={() => onPick({ kind: 'decoration', id: decoration.id })}
                  >
                    <FreeformSlidePreview
                      slide={previews.get(decoration.id)!}
                      frameWidth={wide ? 72 : 46}
                      frameHeight={wide ? 48 : 46}
                      className="freeform-decoration-preview"
                    />
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      {icons.length > 0 && (
        <>
          <div className="freeform-drawer-section">{t('图标')}</div>
          <div className="freeform-icon-grid" role="group" aria-label={t('图标')}>
            {icons.map((icon) => {
              const name = lang === 'en' ? icon.en : icon.zh
              return (
                <button
                  key={icon.id}
                  type="button"
                  className="freeform-icon-tile"
                  data-testid={`insert-icon-${icon.id}`}
                  aria-label={name}
                  title={name}
                  {...dragProps({ kind: 'icon', id: icon.id })}
                  onClick={() => onPick({ kind: 'icon', id: icon.id })}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={icon.d} />
                  </svg>
                </button>
              )
            })}
          </div>
        </>
      )}
      {nothing && <p className="freeform-element-empty" data-testid="freeform-element-empty">{t('没有找到元素')}</p>}
    </>
  )
})
