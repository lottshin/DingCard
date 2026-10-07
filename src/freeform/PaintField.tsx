import { useContext, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  DEFAULT_PAGE_PAINT,
  isHexColor,
  isStopsGradient,
  paintFallbackColor,
  paintToCssBackground,
  toGradientPaint,
  toRadialPaint,
  toSolidPaint,
} from './paint'
import { GRADIENT_STOPS_MAX, GRADIENT_STOPS_MIN } from './appearance'
import {
  loadRecentColors,
  pushRecentColor,
  saveRecentColors,
} from './recentColors'
import { DeckColorsContext } from './deckColors'
import type { ColorPaint, GradientStop, ShapeFill, SlideBackground } from './types'
import { t } from '../i18n'
import { MinusIcon } from '../ui/icons'

export type PaintMode = 'solid' | 'linear-gradient' | 'radial-gradient' | 'transparent' | 'image'

type PaintValue = SlideBackground | ShapeFill | ColorPaint
type LegacyGradientPaint = { type: 'linear-gradient'; from: string; to: string; angle: number }
type StopsGradientPaint = { type: 'linear-gradient'; stops: GradientStop[]; angle: number }
type LinearGradientPaint = LegacyGradientPaint | StopsGradientPaint
type Rgb = { r: number; g: number; b: number }

const PRESET_COLORS = [
  '#18181b',
  '#52525b',
  '#ffffff',
  '#b34d4d',
  '#fed7aa',
  '#f97316',
  '#ef4444',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
]

interface PaintFieldProps {
  label: string
  value: PaintValue
  modes: PaintMode[]
  onChange: (value: PaintValue) => void
  fallbackPaint?: ColorPaint
  onChooseImage?: () => void
  onClearImage?: () => void
  onImageFitChange?: (fit: 'cover' | 'contain') => void
  onAdjustImageFraming?: () => void
  onResetImageFraming?: () => void
  imageFramingDisabled?: boolean
  imageFramingDisabledReason?: string
  imageFramingResetDisabled?: boolean
}

function isPaint(value: PaintValue): value is ColorPaint {
  return value.type === 'solid' || value.type === 'linear-gradient' || value.type === 'radial-gradient'
}

function currentPaint(value: PaintValue, fallbackPaint: ColorPaint): ColorPaint {
  return isPaint(value) ? value : fallbackPaint
}

/** A patterned page shows as its flat base colour here; its own controls live beside it. */
function modeOf(value: PaintValue): PaintMode {
  return value.type === 'pattern' ? 'solid' : value.type
}

interface ColorButtonProps {
  label: string
  color: string
  onChange: (color: string) => void
  /** Test id of the swatch button (the popover keeps its own). */
  testId?: string
  /** `text`: an "A" underlined in the colour, for a text colour control. */
  variant?: 'swatch' | 'text'
}

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(255, Math.round(value)))
}

function hexToRgb(color: string): Rgb {
  const hex = isHexColor(color) ? color.slice(1) : '000000'
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, '0'))
    .join('')}`
}

function mixHex(a: string, b: string): string {
  const left = hexToRgb(a)
  const right = hexToRgb(b)
  return rgbToHex({
    r: Math.round((left.r + right.r) / 2),
    g: Math.round((left.g + right.g) / 2),
    b: Math.round((left.b + right.b) / 2),
  })
}

function channelGradient(channel: keyof Rgb, rgb: Rgb): string {
  const start = { ...rgb, [channel]: 0 }
  const end = { ...rgb, [channel]: 255 }
  return `linear-gradient(90deg, ${rgbToHex(start)}, ${rgbToHex(end)})`
}

/** Minimal shape of the desktop-Chromium EyeDropper API (Chrome/Edge 95+). */
interface EyeDropperLike {
  open: () => Promise<{ sRGBHex: string }>
}
type EyeDropperConstructor = new () => EyeDropperLike

function eyeDropperConstructor(): EyeDropperConstructor | null {
  const ctor = (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper
  return typeof ctor === 'function' ? ctor : null
}

export function ColorPickerButton({ label, color, onChange, testId = 'paint-color-button', variant = 'swatch' }: ColorButtonProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [recentColors, setRecentColors] = useState<string[]>(loadRecentColors)
  const [eyedropperBusy, setEyedropperBusy] = useState(false)
  // The color this picker session last committed, recorded as a recent color
  // when the popover closes (channel-slider noise never lands in the list).
  const sessionColorRef = useRef<string | null>(null)
  const deck = useContext(DeckColorsContext)
  // The color the session started from: 全部替换 carries the change to the rest of the deck.
  const [startColor, setStartColor] = useState<string | null>(null)
  const rgb = hexToRgb(color)
  // No colour: drawn as a slashed chip, like "none" in a design tool.
  const empty = color === 'transparent'

  function openPopover() {
    // Re-read storage so parallel popovers (fill, gradient stops, stroke)
    // see each other's committed colors.
    setRecentColors(loadRecentColors())
    sessionColorRef.current = null
    setStartColor(isHexColor(color) ? color.toLowerCase() : null)
    setOpen(true)
  }

  function closePopover() {
    const sessionColor = sessionColorRef.current
    if (sessionColor) {
      const next = pushRecentColor(loadRecentColors(), sessionColor)
      saveRecentColors(next)
      setRecentColors(next)
    }
    sessionColorRef.current = null
    setOpen(false)
  }

  function commitColor(next: string) {
    if (isHexColor(next)) sessionColorRef.current = next
    onChange(next)
  }

  async function pickWithEyeDropper() {
    const EyeDropper = eyeDropperConstructor()
    if (!EyeDropper || eyedropperBusy) return
    setEyedropperBusy(true)
    try {
      const result = await new EyeDropper().open()
      if (isHexColor(result.sRGBHex)) commitColor(result.sRGBHex)
    } catch {
      // The user dismissed the native picker (AbortError): keep the color.
    } finally {
      setEyedropperBusy(false)
    }
  }

  useEffect(() => {
    if (!open) return

    function closeOnOutsidePointer(event: PointerEvent) {
      const root = rootRef.current
      if (root && !root.contains(event.target as Node)) closePopover()
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closePopover()
      requestAnimationFrame(() => triggerRef.current?.focus())
    }

    window.addEventListener('pointerdown', closeOnOutsidePointer, true)
    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer, true)
      window.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [open])

  function updateChannel(channel: keyof Rgb, value: string) {
    commitColor(rgbToHex({ ...rgb, [channel]: clampChannel(Number(value)) }))
  }

  const deckColors = deck?.colors.slice(0, 12) ?? []
  const current = isHexColor(color) ? color.toLowerCase() : null
  const canReplaceAll = Boolean(deck && startColor && current && current !== startColor && deck.colors.includes(startColor))

  return (
    <div className="paint-color" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`paint-color-button${empty ? ' is-empty' : ''}${variant === 'text' ? ' is-text' : ''}`}
        data-testid={testId}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={variant === 'text'
          ? ({ '--paint-color': color } as CSSProperties)
          : empty ? undefined : { background: color }}
        onClick={() => (open ? closePopover() : openPopover())}
      >
        {variant === 'text' && (
          <>
            <span className="paint-color-letter" aria-hidden="true">A</span>
            <span className="paint-color-bar" aria-hidden="true" />
          </>
        )}
      </button>
      {open && (
        <div className="paint-popover" data-testid="paint-popover" role="dialog" aria-label={t('{label} 色板', { label })}>
          <div className="paint-popover-head">
            <span className="paint-popover-sample" style={{ background: color }} />
            <input
              className="paint-popover-hex"
              value={color}
              aria-label={t('{label} 自定义 HEX', { label })}
              onChange={(event) => {
                const nextColor = event.currentTarget.value
                if (isHexColor(nextColor)) commitColor(nextColor)
              }}
            />
            {eyeDropperConstructor() && (
              <button
                type="button"
                className="paint-eyedropper"
                data-testid="paint-eyedropper"
                aria-label={t('{label} 屏幕取色', { label })}
                title={t('屏幕取色')}
                disabled={eyedropperBusy}
                onClick={() => { void pickWithEyeDropper() }}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M13.4 3.6a2.5 2.5 0 0 1 3.5 3.5l-1.5 1.4 1.1 1.1-1.4 1.4-1.1-1.1-6 6-3 0.7 0.7-3 6-6-1.1-1.1 1.4-1.4 1.1 1.1 1.4-1.5z" />
                </svg>
              </button>
            )}
          </div>
          {deckColors.length > 0 && (
            <div className="paint-swatch-grid paint-deck-grid" aria-label={t('{label} 本设计用色', { label })} data-testid="paint-deck-grid">
              {deckColors.map((used) => (
                <button
                  key={used}
                  type="button"
                  className="paint-swatch"
                  aria-label={t('{label} 本设计 {color}', { label, color: used })}
                  style={{ background: used }}
                  onClick={() => commitColor(used)}
                />
              ))}
            </div>
          )}
          <div className="paint-swatch-grid" aria-label={t('{label} 常用颜色', { label })}>
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="paint-swatch"
                aria-label={`${label} ${preset}`}
                style={{ background: preset }}
                onClick={() => commitColor(preset)}
              />
            ))}
          </div>
          {recentColors.length > 0 && (
            <div className="paint-swatch-grid paint-recent-grid" aria-label={t('{label} 最近使用', { label })} data-testid="paint-recent-grid">
              {recentColors.map((recent) => (
                <button
                  key={recent}
                  type="button"
                  className="paint-swatch"
                  data-testid="paint-recent-swatch"
                  aria-label={t('{label} 最近 {color}', { label, color: recent })}
                  style={{ background: recent }}
                  onClick={() => commitColor(recent)}
                />
              ))}
            </div>
          )}
          <div className="paint-channel-list">
            {(['r', 'g', 'b'] as const).map((channel) => (
              <label className="paint-channel" key={channel}>
                <span>{channel.toUpperCase()}</span>
                <input
                  className="paint-channel-range"
                  type="range"
                  min="0"
                  max="255"
                  value={rgb[channel]}
                  style={{ backgroundImage: channelGradient(channel, rgb) }}
                  onChange={(event) => updateChannel(channel, event.currentTarget.value)}
                />
                <input
                  className="paint-channel-number"
                  type="number"
                  min="0"
                  max="255"
                  value={rgb[channel]}
                  onChange={(event) => updateChannel(channel, event.currentTarget.value)}
                />
              </label>
            ))}
          </div>
          {canReplaceAll && deck && startColor && current && (
            <button
              type="button"
              className="paint-replace-all"
              data-testid="paint-replace-all"
              title={t('把整套里的 {from} 都换成 {to}', { from: startColor, to: current })}
              onClick={() => {
                deck.replace(startColor, current)
                setStartColor(current)
              }}
            >
              <span className="paint-replace-chip" style={{ background: startColor }} aria-hidden="true" />
              <span className="paint-replace-arrow" aria-hidden="true">→</span>
              <span className="paint-replace-chip" style={{ background: current }} aria-hidden="true" />
              {t('全部替换')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function PaintField({
  label,
  value,
  modes,
  onChange,
  fallbackPaint = DEFAULT_PAGE_PAINT,
  onChooseImage,
  onClearImage,
  onImageFitChange,
  onAdjustImageFraming,
  onResetImageFraming,
  imageFramingDisabled = false,
  imageFramingDisabledReason,
  imageFramingResetDisabled = true,
}: PaintFieldProps) {
  const activeMode = modeOf(value)
  const paint = currentPaint(value, fallbackPaint)
  const gradient = toGradientPaint(paint) as LinearGradientPaint

  function changeMode(mode: PaintMode) {
    if (mode === activeMode) return
    if (mode === 'solid') {
      onChange(isPaint(value) ? toSolidPaint(value) : fallbackPaint)
    } else if (mode === 'linear-gradient') {
      onChange(isPaint(value) ? toGradientPaint(value) : toGradientPaint(fallbackPaint))
    } else if (mode === 'radial-gradient') {
      onChange(isPaint(value) ? toRadialPaint(value) : toRadialPaint(fallbackPaint))
    } else if (mode === 'transparent') {
      onChange({ type: 'transparent' })
    } else if (mode === 'image') {
      if (value.type === 'image') return
      onChooseImage?.()
    }
  }

  function updateSolid(color: string) {
    if (isHexColor(color)) onChange({ type: 'solid', color })
  }

  function updateGradient(patch: Partial<Omit<LegacyGradientPaint, 'type'>>) {
    if (activeMode === 'radial-gradient' || isStopsGradient(gradient)) return
    onChange({ ...gradient, ...patch, type: 'linear-gradient' })
  }

  /** Emit a stops edit in whatever gradient form is active (linear carries the angle). */
  function emitStops(stops: GradientStop[]) {
    if (activeMode === 'radial-gradient') {
      onChange({ type: 'radial-gradient', stops })
      return
    }
    onChange({ type: 'linear-gradient', stops, angle: gradient.angle })
  }

  function updateAngle(angle: number) {
    if (activeMode === 'radial-gradient') return
    onChange(isStopsGradient(gradient)
      ? { type: 'linear-gradient', stops: gradient.stops, angle }
      : { ...gradient, angle, type: 'linear-gradient' })
  }

  /** Enter the v8 stops form: keep the two colors and add a midpoint stop. */
  function addStop() {
    if (isStopsGradient(gradient)) {
      if (gradient.stops.length >= GRADIENT_STOPS_MAX) return
      const stops = gradient.stops
      let gapIndex = 0
      let gapWidth = -1
      for (let index = 0; index < stops.length - 1; index += 1) {
        const width = stops[index + 1].offset - stops[index].offset
        if (width > gapWidth) {
          gapWidth = width
          gapIndex = index
        }
      }
      const before = stops[gapIndex]
      const after = stops[gapIndex + 1]
      const next = [...stops]
      next.splice(gapIndex + 1, 0, {
        offset: (before.offset + after.offset) / 2,
        color: mixHex(before.color, after.color),
      })
      emitStops(next)
      return
    }
    onChange({
      type: 'linear-gradient',
      angle: gradient.angle,
      stops: [
        { offset: 0, color: gradient.from },
        { offset: 0.5, color: mixHex(gradient.from, gradient.to) },
        { offset: 1, color: gradient.to },
      ],
    })
  }

  function updateStopColor(index: number, color: string) {
    if (!isStopsGradient(gradient)) return
    emitStops(
      gradient.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, color } : { ...stop }),
    )
  }

  /** Offsets are edited in whole percent, clamped strictly between neighbors. */
  function updateStopOffset(index: number, percent: number) {
    if (!isStopsGradient(gradient) || !Number.isFinite(percent)) return
    const stops = gradient.stops
    const minPercent = index === 0 ? 0 : Math.floor(stops[index - 1].offset * 100) + 1
    const maxPercent = index === stops.length - 1 ? 100 : Math.ceil(stops[index + 1].offset * 100) - 1
    const clamped = Math.max(minPercent, Math.min(maxPercent, Math.round(percent)))
    emitStops(
      stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, offset: clamped / 100 } : { ...stop }),
    )
  }

  function removeStop(index: number) {
    if (!isStopsGradient(gradient) || gradient.stops.length <= GRADIENT_STOPS_MIN) return
    emitStops(gradient.stops.filter((_, stopIndex) => stopIndex !== index))
  }

  return (
    <div className="paint-field" data-testid="freeform-paint-field">
      <div className="field-label">{label}</div>
      <div className="seg stretch paint-mode" aria-label={t('{label} 类型', { label })}>
        {modes.map((mode) => (
          <button
            key={mode}
            type="button"
            className={activeMode === mode ? 'seg-btn on' : 'seg-btn'}
            data-testid={`paint-mode-${mode}`}
            aria-label={mode === 'image' ? t('插入图片填充') : undefined}
            onClick={() => changeMode(mode)}
          >
            {mode === 'solid'
              ? t('纯色')
              : mode === 'linear-gradient'
                ? t('渐变')
                : mode === 'radial-gradient'
                  ? t('径向')
                  : mode === 'transparent'
                    ? t('透明')
                    : t('图片')}
          </button>
        ))}
      </div>

      {activeMode === 'solid' && (
        <div className="paint-row">
          <ColorPickerButton label={t('{label} 颜色', { label })} color={paintFallbackColor(paint)} onChange={updateSolid} />
          <input
            className="paint-hex"
            value={paintFallbackColor(paint)}
            onChange={(event) => updateSolid(event.currentTarget.value)}
            aria-label={`${label} hex`}
          />
        </div>
      )}

      {(activeMode === 'linear-gradient' || activeMode === 'radial-gradient') && (
        <div className="paint-gradient">
          {isStopsGradient(gradient) ? (
            <div className="paint-stops" data-testid="paint-stops-list">
              {gradient.stops.map((stop, index) => (
                <div className="paint-row paint-stop-row" key={index}>
                  <ColorPickerButton
                    label={t('{label} 色标 {n} 颜色', { label, n: index + 1 })}
                    color={stop.color}
                    onChange={(color) => updateStopColor(index, color)}
                  />
                  <input
                    className="paint-hex"
                    value={stop.color}
                    onChange={(event) =>
                      isHexColor(event.currentTarget.value) && updateStopColor(index, event.currentTarget.value)}
                    aria-label={t('{label} 色标 {n} hex', { label, n: index + 1 })}
                  />
                  <input
                    className="paint-angle"
                    data-testid={`paint-stop-${index}-offset`}
                    type="number"
                    min={index === 0 ? 0 : Math.floor(gradient.stops[index - 1].offset * 100) + 1}
                    max={
                      index === gradient.stops.length - 1
                        ? 100
                        : Math.ceil(gradient.stops[index + 1].offset * 100) - 1
                    }
                    value={Math.round(stop.offset * 100)}
                    onChange={(event) => updateStopOffset(index, Number(event.currentTarget.value))}
                    aria-label={t('{label} 色标 {n} 位置百分比', { label, n: index + 1 })}
                  />
                  <button
                    type="button"
                    className="paint-stop-remove"
                    data-testid={`paint-stop-${index}-remove`}
                    disabled={gradient.stops.length <= GRADIENT_STOPS_MIN}
                    onClick={() => removeStop(index)}
                    aria-label={t('{label} 删除色标 {n}', { label, n: index + 1 })}
                    title={t('删除色标')}
                  >
                    <MinusIcon />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="paint-row">
                <ColorPickerButton
                  label={t('{label} 渐变起始色', { label })}
                  color={gradient.from}
                  onChange={(color) => updateGradient({ from: color })}
                />
                <input
                  className="paint-hex"
                  value={gradient.from}
                  onChange={(event) => isHexColor(event.currentTarget.value) && updateGradient({ from: event.currentTarget.value })}
                  aria-label={t('{label} 渐变起始 hex', { label })}
                />
              </div>
              <div className="paint-row">
                <ColorPickerButton
                  label={t('{label} 渐变结束色', { label })}
                  color={gradient.to}
                  onChange={(color) => updateGradient({ to: color })}
                />
                <input
                  className="paint-hex"
                  value={gradient.to}
                  onChange={(event) => isHexColor(event.currentTarget.value) && updateGradient({ to: event.currentTarget.value })}
                  aria-label={t('{label} 渐变结束 hex', { label })}
                />
              </div>
            </>
          )}
          {activeMode === 'linear-gradient' && (
            <div className="paint-row">
              <input
                className="paint-range"
                data-testid="paint-gradient-angle"
                type="range"
                min="0"
                max="359"
                value={gradient.angle}
                onChange={(event) => updateAngle(Number(event.currentTarget.value))}
                aria-label={t('{label} 渐变角度', { label })}
              />
              <input
                className="paint-angle"
                type="number"
                min="0"
                max="359"
                value={gradient.angle}
                onChange={(event) => updateAngle(Number(event.currentTarget.value))}
                aria-label={t('{label} 渐变角度数值', { label })}
              />
            </div>
          )}
          <div className="paint-row">
            <button
              type="button"
              className="ghost"
              data-testid="paint-stops-add"
              disabled={isStopsGradient(gradient) && gradient.stops.length >= GRADIENT_STOPS_MAX}
              onClick={addStop}
              aria-label={t('{label} 添加色标', { label })}
            >
              {t('添加色标')}
            </button>
          </div>
          <div
            className="paint-preview"
            aria-hidden="true"
            style={{
              background: paintToCssBackground(
                activeMode === 'radial-gradient' && isStopsGradient(gradient)
                  ? { type: 'radial-gradient', stops: gradient.stops }
                  : gradient,
              ),
            }}
          />
        </div>
      )}

      {activeMode === 'image' && value.type === 'image' && (
        <div className="paint-image">
          <div className="seg stretch">
            {(['cover', 'contain'] as const).map((fit) => (
              <button
                key={fit}
                type="button"
                className={value.fit === fit ? 'seg-btn on' : 'seg-btn'}
                data-testid={`paint-image-fit-${fit}`}
                onClick={() => onImageFitChange?.(fit)}
              >
                {fit === 'cover' ? t('填满') : t('适应')}
              </button>
            ))}
          </div>
          <div className="inspector-actions">
            <button
              className="ghost"
              type="button"
              data-testid="freeform-adjust-framing"
              aria-label={t('调整图片取景')}
              title={imageFramingDisabled ? imageFramingDisabledReason : t('调整图片取景')}
              disabled={imageFramingDisabled}
              onClick={onAdjustImageFraming}
            >
              {t('调整取景')}
            </button>
            <button
              className="ghost"
              type="button"
              data-testid="freeform-reset-framing"
              aria-label={t('重置图片取景')}
              title={imageFramingResetDisabled ? t('当前已经是默认取景') : t('重置图片取景')}
              disabled={imageFramingResetDisabled}
              onClick={onResetImageFraming}
            >
              {t('重置取景')}
            </button>
            <button className="ghost" type="button" onClick={onChooseImage}>
              {t('替换图片')}
            </button>
            <button className="ghost" type="button" onClick={onClearImage}>
              {t('清除图片')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
