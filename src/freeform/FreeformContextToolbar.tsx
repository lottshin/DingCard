import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { getLang, t } from '../i18n'
import { Select } from '../Select'
import { FONTS } from '../theme'
import {
  CopyIcon,
  GraphicIcon,
  ImageIcon,
  LineToolIcon,
  LockIcon,
  PanelRightIcon,
  ShapePreviewIcon,
  ShapesIcon,
  TextIcon,
  TrashIcon,
} from '../ui/icons'
import { FreeformInsertMenu } from './FreeformInsertMenu'
import { InspectorGlyph, type InspectorGlyphName } from './InspectorGlyph'
import { InspectorNumberInput } from './InspectorNumberInput'
import { ColorPickerButton } from './PaintField'
import { paintFallbackColor } from './paint'
import { DELETE_KEY, shortcutLabel } from './shortcutLabels'
import type { ScenePropertyEdit } from './sceneProperties'
import type {
  FreeformImageElement,
  FreeformLineElement,
  FreeformNodeStylePatch,
  FreeformPathElement,
  FreeformShapeElement,
  FreeformTextElement,
  ShapeFill,
} from './types'

/** What the toolbar is about: nothing selected (the page), one object, or several. */
export type ContextToolbarSubject =
  | { kind: 'page' }
  | { kind: 'text'; node: FreeformTextElement; fontSize: number }
  | { kind: 'shape'; node: FreeformShapeElement; strokeWidth: number; canFrame: boolean; frameDisabledReason: string | null }
  | { kind: 'image'; node: FreeformImageElement; canCrop: boolean; cropDisabledReason: string | null }
  | { kind: 'line'; node: FreeformLineElement; strokeWidth: number }
  | { kind: 'path'; node: FreeformPathElement; strokeWidth: number }
  | { kind: 'group'; name: string }
  | { kind: 'multi'; count: number }
  | { kind: 'locked'; name: string }

export type ToolbarAlignment = 'left' | 'h-center' | 'right' | 'top' | 'v-center' | 'bottom'
export type ToolbarOrder = 'front' | 'forward' | 'backward' | 'back'

export interface FreeformContextToolbarProps {
  isActive: boolean
  subject: ContextToolbarSubject
  /** Remounts number fields when the selection or document changes under them. */
  resetKey: unknown
  canAlign: boolean
  canDistribute: boolean
  canGroup: boolean
  onStyle: (patch: FreeformNodeStylePatch) => void
  onProperty: (edit: ScenePropertyEdit) => void
  onFontFamily: (fontFamily: string) => void
  onShapeFill: (fill: ShapeFill) => void
  onAlign: (alignment: ToolbarAlignment) => void
  onDistribute: (axis: 'horizontal' | 'vertical') => void
  onOrder: (order: ToolbarOrder) => void
  onGroup: () => void
  onUngroup: () => void
  onCrop: () => void
  onAdjustFraming: () => void
  onDuplicate: () => void
  onToggleLock: () => void
  onDelete: () => void
  /** Whether the settings panel is open on its properties tab. */
  panelOpen: boolean
  onTogglePanel: () => void
  /** Cropping or framing a picture: the bar steps aside but keeps its row, so the canvas doesn't jump. */
  suspended?: boolean
}

const SHAPE_OPTIONS: Array<{ id: FreeformShapeElement['shape']; label: string }> = [
  { id: 'rect', label: '矩形' },
  { id: 'ellipse', label: '圆形' },
  { id: 'triangle', label: '三角形' },
  { id: 'star', label: '五角星' },
  { id: 'hexagon', label: '六边形' },
]

const ALIGN_OPTIONS: Array<{ id: ToolbarAlignment | 'distribute-h' | 'distribute-v'; label: string; icon: string }> = [
  { id: 'left', label: '左对齐', icon: 'M4 3v14M7 6.5h9M7 13.5h5.5' },
  { id: 'h-center', label: '水平居中', icon: 'M10 3v14M5 6.5h10M6.75 13.5h6.5' },
  { id: 'right', label: '右对齐', icon: 'M16 3v14M4 6.5h9M7.5 13.5H13' },
  { id: 'top', label: '顶对齐', icon: 'M3 4h14M6.5 7v9M13.5 7v5.5' },
  { id: 'v-center', label: '垂直居中', icon: 'M3 10h14M6.5 5v10M13.5 6.75v6.5' },
  { id: 'bottom', label: '底对齐', icon: 'M3 16h14M6.5 4v9M13.5 7.5V13' },
  { id: 'distribute-h', label: '水平均分', icon: 'M4 4v12M16 4v12M8.5 7h3v6h-3z' },
  { id: 'distribute-v', label: '垂直均分', icon: 'M4 4h12M4 16h12M7 8.5h6v3H7z' },
]

const ORDER_OPTIONS: Array<{ id: ToolbarOrder; label: string; icon: string }> = [
  { id: 'front', label: '置于顶层', icon: 'M10 16V7M6.5 10.5 10 7l3.5 3.5M5 3.5h10' },
  { id: 'forward', label: '上移一层', icon: 'M10 15.5V5.5M6.5 9 10 5.5 13.5 9' },
  { id: 'backward', label: '下移一层', icon: 'M10 4.5v10M6.5 11 10 14.5l3.5-3.5' },
  { id: 'back', label: '移到底层', icon: 'M10 4v9M6.5 9.5 10 13l3.5-3.5M5 16.5h10' },
]

const TEXT_ALIGNS: Array<{ id: FreeformTextElement['align']; label: string; icon: string }> = [
  { id: 'left', label: '文字左对齐', icon: 'M2.5 4h11M2.5 8h7M2.5 12h9' },
  { id: 'center', label: '文字居中', icon: 'M2.5 4h11M4.5 8h7M3.5 12h9' },
  { id: 'right', label: '文字右对齐', icon: 'M2.5 4h11M6.5 8h7M4.5 12h9' },
]

function PathIcon({ d, viewBox = '0 0 20 20' }: { d: string; viewBox?: string }) {
  return (
    <svg className="ctx-icon" viewBox={viewBox} aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function Divider({ className }: { className?: string }) {
  return <span className={className ? `ctx-divider ${className}` : 'ctx-divider'} aria-hidden="true" />
}

/** How many fold steps freeform.css has for a bar still too narrow for one row. */
const FOLD_STEPS = 6

/**
 * Keep the bar to one row: show everything, then hide the next set of
 * less-needed controls (the 更多 label, the position and order menus,
 * duplicate and lock, secondary number fields, delete, the selection's name)
 * until it stops wrapping. It runs before paint, so the canvas below never
 * jumps when the selection changes; everything folded away is still in the
 * settings panel, the right-click menu or a shortcut.
 */
function foldToOneRow(bar: HTMLElement) {
  const oneRow = Number.parseFloat(getComputedStyle(bar).minHeight) + 1
  const steps: string[] = []
  bar.removeAttribute('data-fold')
  while (bar.offsetHeight > oneRow && steps.length < FOLD_STEPS) {
    steps.push(String(steps.length + 1))
    bar.setAttribute('data-fold', steps.join(' '))
  }
}

/** A compact number field: a glyph, the value, and an optional unit. */
function ToolbarNumber({
  label,
  glyph,
  value,
  min,
  max,
  unit,
  resetKey,
  className,
  onCommit,
}: {
  label: string
  glyph: InspectorGlyphName | string
  value: number
  min?: number
  max?: number
  unit?: string
  resetKey: unknown
  className?: string
  onCommit: (value: number) => void
}) {
  return (
    <label className={className ? `ctx-number ${className}` : 'ctx-number'} title={label}>
      {glyph.length <= 2
        ? <span className="field-glyph" aria-hidden="true">{glyph}</span>
        : <InspectorGlyph name={glyph as InspectorGlyphName} />}
      <InspectorNumberInput ariaLabel={label} value={value} min={min} max={max} resetKey={resetKey} onCommit={onCommit} />
      {unit && <span className="ctx-unit" aria-hidden="true">{unit}</span>}
    </label>
  )
}

function ToolbarButton({
  label,
  pressed,
  disabled,
  title,
  testId,
  className,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  disabled?: boolean
  title?: string
  testId?: string
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={className ? `ctx-btn ${className}` : 'ctx-btn'}
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function SubjectChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="ctx-subject" data-testid="freeform-context-subject">
      {icon}
      <span>{label}</span>
    </span>
  )
}

/** Font size steps a designer reaches for; the − / + buttons walk them. */
const FONT_SIZE_STEPS = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96, 112, 128, 144, 160, 200, 240]

function nextFontSize(current: number, direction: 1 | -1): number {
  if (direction > 0) return FONT_SIZE_STEPS.find((step) => step > current) ?? Math.round(current * 1.25)
  return [...FONT_SIZE_STEPS].reverse().find((step) => step < current) ?? Math.max(1, Math.round(current * 0.8))
}

/**
 * The bar above the canvas: the few settings the selection is most often
 * changed by, one click away. Everything else stays in the inspector.
 */
export function FreeformContextToolbar(props: FreeformContextToolbarProps) {
  const { subject, resetKey, suspended = false } = props
  const objectSelected = subject.kind !== 'page'
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (suspended) root.setAttribute('inert', '')
    else root.removeAttribute('inert')
  }, [suspended])

  // Refold when what the bar holds changes...
  const foldKey = [
    subject.kind,
    'node' in subject ? subject.node.id : '',
    subject.kind === 'shape' ? `${subject.node.shape} ${subject.node.fill.type}` : '',
    'name' in subject ? subject.name : '',
    'count' in subject ? subject.count : '',
    props.canAlign,
    getLang(),
  ].join('|')
  useLayoutEffect(() => {
    if (rootRef.current) foldToOneRow(rootRef.current)
  }, [foldKey])

  // ...and when the stage it sits on gets wider or narrower. The pane is
  // watched rather than the bar, whose height folding itself changes.
  useEffect(() => {
    const bar = rootRef.current
    const pane = bar?.parentElement
    if (!bar || !pane) return
    let width = -1
    const observer = new ResizeObserver(() => {
      const next = pane.getBoundingClientRect().width
      if (next === width) return
      width = next
      foldToOneRow(bar)
    })
    observer.observe(pane)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={rootRef}
      className={`freeform-context-toolbar${suspended ? ' is-suspended' : ''}`}
      role="toolbar"
      aria-label={t('对象工具条')}
      data-testid="freeform-context-toolbar"
      data-subject={subject.kind}
    >
      {/* With nothing selected the bar stays empty but keeps its height, so the
          canvas doesn't jump; page settings are behind 更多. */}
      <div className="ctx-group">
        {subject.kind === 'text' && (
          <>
            <SubjectChip icon={<TextIcon />} label={t('文本')} />
            <Divider />
            <div className="ctx-font">
              <Select
                value={subject.node.fontFamily}
                onChange={props.onFontFamily}
                title={t('字体')}
                testId="ctx-font-select"
                previewFonts
                options={FONTS.map((font) => ({ id: font.id, label: t(font.label) }))}
              />
            </div>
            <div className="ctx-stepper">
              <button
                type="button"
                className="ctx-btn is-small ctx-fold-details"
                aria-label={t('缩小字号')}
                title={t('缩小字号')}
                onClick={() => props.onProperty({ property: 'fontSize', value: nextFontSize(subject.fontSize, -1) })}
              >
                <PathIcon d="M5 10h10" />
              </button>
              <ToolbarNumber
                label={t('文字大小')}
                glyph="font-size"
                value={subject.fontSize}
                min={Number.MIN_VALUE}
                max={Number.MAX_VALUE}
                resetKey={resetKey}
                onCommit={(value) => props.onProperty({ property: 'fontSize', value })}
              />
              <button
                type="button"
                className="ctx-btn is-small ctx-fold-details"
                aria-label={t('放大字号')}
                title={t('放大字号')}
                onClick={() => props.onProperty({ property: 'fontSize', value: nextFontSize(subject.fontSize, 1) })}
              >
                <PathIcon d="M10 5v10M5 10h10" />
              </button>
            </div>
            <ColorPickerButton
              label={t('文字填充颜色')}
              testId="ctx-text-color"
              variant="text"
              color={paintFallbackColor(subject.node.textFill)}
              onChange={(color) => props.onStyle({ textFill: { type: 'solid', color } })}
            />
            <Divider />
            <ToolbarButton
              label={t('加粗文字')}
              pressed={subject.node.fontWeight === 'bold'}
              onClick={() => props.onStyle({ fontWeight: subject.node.fontWeight === 'bold' ? 'normal' : 'bold' })}
            >
              <b className="ctx-glyph">B</b>
            </ToolbarButton>
            <ToolbarButton
              label={t('倾斜文字')}
              pressed={subject.node.italic === true}
              onClick={() => props.onStyle({ italic: !subject.node.italic })}
            >
              <i className="ctx-glyph is-italic">I</i>
            </ToolbarButton>
            {TEXT_ALIGNS.map((option) => (
              <ToolbarButton
                key={option.id}
                label={t(option.label)}
                className="ctx-text-align"
                pressed={subject.node.align === option.id}
                onClick={() => props.onStyle({ align: option.id })}
              >
                <PathIcon viewBox="0 0 16 16" d={option.icon} />
              </ToolbarButton>
            ))}
          </>
        )}

        {subject.kind === 'shape' && (
          <>
            <SubjectChip icon={<ShapesIcon />} label={t('形状')} />
            <Divider />
            <FreeformInsertMenu
              isActive={props.isActive}
              testId="ctx-shape-menu"
              label={t(SHAPE_OPTIONS.find((option) => option.id === subject.node.shape)?.label ?? '形状')}
              icon={<ShapePreviewIcon shape={subject.node.shape} />}
              options={SHAPE_OPTIONS.map((option) => ({
                id: option.id,
                label: option.label,
                icon: <ShapePreviewIcon shape={option.id} />,
              }))}
              onSelect={(shape) => props.onStyle({ shape })}
            />
            {subject.node.fill.type === 'image' ? (
              <button
                type="button"
                className="ctx-btn is-text"
                data-testid="ctx-adjust-framing"
                disabled={!subject.canFrame}
                title={subject.canFrame ? t('调整取景') : subject.frameDisabledReason ?? undefined}
                onClick={props.onAdjustFraming}
              >
                <PathIcon d="M6 2.5V14h11.5M2.5 6H14v11.5" />
                <span>{t('调整取景')}</span>
              </button>
            ) : (
              <>
                <span className="ctx-label">{t('填充')}</span>
                <ColorPickerButton
                  label={t('形状填充颜色')}
                  testId="ctx-shape-fill"
                  color={subject.node.fill.type === 'transparent' ? 'transparent' : paintFallbackColor(subject.node.fill)}
                  onChange={(color) => props.onShapeFill({ type: 'solid', color })}
                />
              </>
            )}
            <span className="ctx-label">{t('描边')}</span>
            <ColorPickerButton
              label={t('形状轮廓颜色')}
              testId="ctx-shape-stroke"
              color={subject.node.stroke}
              onChange={(stroke) => props.onStyle({ stroke })}
            />
            <ToolbarNumber
              label={t('轮廓粗细')}
              glyph="stroke"
              value={subject.strokeWidth}
              min={0}
              max={Number.MAX_VALUE}
              resetKey={resetKey}
              className="ctx-fold-details"
              onCommit={(value) => props.onProperty({ property: 'strokeWidth', value })}
            />
            {subject.node.shape === 'rect' && (
              <ToolbarNumber
                label={t('转角弧度')}
                glyph="radius"
                value={subject.node.cornerRadius ?? 16}
                min={0}
                max={2000}
                resetKey={resetKey}
                className="ctx-fold-details"
                onCommit={(value) => props.onStyle({ cornerRadius: value })}
              />
            )}
          </>
        )}

        {subject.kind === 'image' && (
          <>
            <SubjectChip icon={<ImageIcon />} label={t('图片')} />
            <Divider />
            <button
              type="button"
              className="ctx-btn is-text"
              data-testid="ctx-crop"
              disabled={!subject.canCrop}
              title={subject.canCrop ? t('裁剪图片') : subject.cropDisabledReason ?? undefined}
              onClick={props.onCrop}
            >
              <PathIcon d="M6 2.5V14h11.5M2.5 6H14v11.5" />
              <span>{t('裁剪')}</span>
            </button>
            <div className="ctx-seg" role="group" aria-label={t('图片填充方式')}>
              {(['cover', 'contain'] as const).map((fit) => (
                <button
                  key={fit}
                  type="button"
                  className={subject.node.fit === fit ? 'ctx-seg-btn on' : 'ctx-seg-btn'}
                  aria-pressed={subject.node.fit === fit}
                  onClick={() => props.onStyle({ fit })}
                >
                  {fit === 'cover' ? t('填满') : t('适应')}
                </button>
              ))}
            </div>
          </>
        )}

        {subject.kind === 'line' && (
          <>
            <SubjectChip icon={<LineToolIcon />} label={subject.node.lineKind === 'arrow' ? t('箭头') : t('直线')} />
            <Divider />
            <span className="ctx-label">{t('颜色')}</span>
            <ColorPickerButton
              label={t('线条描边颜色')}
              testId="ctx-line-stroke"
              color={subject.node.stroke}
              onChange={(stroke) => props.onStyle({ stroke })}
            />
            <ToolbarNumber
              label={t('线条粗细')}
              glyph="stroke"
              value={subject.strokeWidth}
              min={Number.MIN_VALUE}
              max={Number.MAX_VALUE}
              resetKey={resetKey}
              className="ctx-fold-details"
              onCommit={(value) => props.onProperty({ property: 'strokeWidth', value })}
            />
            <ToolbarButton
              label={t('末端箭头')}
              pressed={subject.node.lineKind === 'arrow'}
              onClick={() => props.onStyle({ lineKind: subject.node.lineKind === 'arrow' ? 'line' : 'arrow' })}
            >
              <PathIcon d="M3 10h13M12 6l4 4-4 4" />
            </ToolbarButton>
          </>
        )}

        {subject.kind === 'path' && (
          <>
            <SubjectChip icon={<GraphicIcon />} label={t('图形')} />
            <Divider />
            <span className="ctx-label">{t('填充')}</span>
            <ColorPickerButton
              label={t('图形填充颜色')}
              testId="ctx-path-fill"
              color={subject.node.fill.type === 'transparent' ? 'transparent' : paintFallbackColor(subject.node.fill)}
              onChange={(color) => props.onStyle({ fill: { type: 'solid', color } })}
            />
            <span className="ctx-label">{t('描边')}</span>
            <ColorPickerButton
              label={t('图形描边颜色')}
              testId="ctx-path-stroke"
              color={subject.node.stroke}
              onChange={(stroke) => props.onStyle({ stroke })}
            />
            <ToolbarNumber
              label={t('描边粗细')}
              glyph="stroke"
              value={subject.strokeWidth}
              min={0}
              max={Number.MAX_VALUE}
              resetKey={resetKey}
              className="ctx-fold-details"
              onCommit={(value) => props.onProperty({ property: 'strokeWidth', value })}
            />
          </>
        )}

        {subject.kind === 'group' && (
          <>
            <SubjectChip icon={<PathIcon d="M3.5 3.5h6v6h-6zM10.5 10.5h6v6h-6z" />} label={subject.name} />
            <Divider />
            <button type="button" className="ctx-btn is-text" onClick={props.onUngroup}>
              <span>{t('取消编组')}</span>
            </button>
          </>
        )}

        {subject.kind === 'multi' && (
          <>
            <SubjectChip icon={<PathIcon d="M3.5 3.5h6v6h-6zM10.5 10.5h6v6h-6z" />} label={t('{n} 个对象', { n: subject.count })} />
            <Divider />
            <button type="button" className="ctx-btn is-text" disabled={!props.canGroup} onClick={props.onGroup}>
              <span>{t('编成一组')}</span>
            </button>
          </>
        )}

        {subject.kind === 'locked' && (
          <>
            <SubjectChip icon={<LockIcon />} label={subject.name} />
          </>
        )}
      </div>

      <div className="ctx-group is-end">
      {objectSelected && (
        <>
          {subject.kind !== 'locked' && subject.kind !== 'group' && subject.kind !== 'multi' && (
            <ToolbarNumber
              label={t('透明度')}
              glyph="opacity"
              value={Math.round((subject.node.opacity ?? 1) * 100)}
              min={0}
              max={100}
              unit="%"
              resetKey={resetKey}
              className="ctx-opacity"
              onCommit={(value) => props.onStyle({ opacity: Math.round(value) / 100 })}
            />
          )}
          {subject.kind !== 'locked' && (
            <>
              <div className="ctx-fold-menus">
                {props.canAlign && (
                  <FreeformInsertMenu
                    isActive={props.isActive}
                    testId="ctx-align-menu"
                    label={t('位置')}
                    icon={<PathIcon d="M4 3v14M7 6.5h9M7 13.5h5.5" />}
                    options={ALIGN_OPTIONS
                      .filter((option) => props.canDistribute || !option.id.startsWith('distribute'))
                      .map((option) => ({ id: option.id, label: option.label, icon: <PathIcon d={option.icon} /> }))}
                    onSelect={(id) => {
                      if (id === 'distribute-h') props.onDistribute('horizontal')
                      else if (id === 'distribute-v') props.onDistribute('vertical')
                      else props.onAlign(id)
                    }}
                  />
                )}
                <FreeformInsertMenu
                  isActive={props.isActive}
                  testId="ctx-order-menu"
                  label={t('层级')}
                  icon={<PathIcon d="m10 3.5 6.5 3.25L10 10 3.5 6.75zM3.5 10.25 10 13.5l6.5-3.25M3.5 13.75 10 17l6.5-3.25" />}
                  options={ORDER_OPTIONS.map((option) => ({ id: option.id, label: option.label, icon: <PathIcon d={option.icon} /> }))}
                  onSelect={props.onOrder}
                />
                <Divider />
              </div>
              <ToolbarButton
                label={t('复制一份')}
                title={t('复制一份（{keys}）', { keys: shortcutLabel('D', { mod: true }) })}
                testId="ctx-duplicate"
                className="ctx-fold-actions"
                onClick={props.onDuplicate}
              >
                <CopyIcon />
              </ToolbarButton>
            </>
          )}
          <ToolbarButton
            label={subject.kind === 'locked' ? t('解锁对象') : t('锁定对象')}
            pressed={subject.kind === 'locked'}
            testId="ctx-lock"
            className={subject.kind === 'locked' ? undefined : 'ctx-fold-actions'}
            onClick={props.onToggleLock}
          >
            <LockIcon />
          </ToolbarButton>
          {subject.kind !== 'locked' && (
            <ToolbarButton
              label={t('删除对象')}
              title={t('删除对象（{keys}）', { keys: DELETE_KEY })}
              testId="ctx-delete"
              className="ctx-fold-delete"
              onClick={props.onDelete}
            >
              <TrashIcon />
            </ToolbarButton>
          )}
          <Divider className={subject.kind === 'locked' ? undefined : 'ctx-fold-delete'} />
        </>
      )}
        <button
          type="button"
          className="ctx-btn is-text ctx-more"
          data-testid="ctx-more"
          aria-pressed={props.panelOpen}
          title={props.panelOpen ? t('收起面板') : t('更多设置')}
          onClick={props.onTogglePanel}
        >
          <PanelRightIcon />
          <span>{t('更多')}</span>
        </button>
      </div>
    </div>
  )
}
