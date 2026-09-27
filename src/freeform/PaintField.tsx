import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_PAGE_PAINT,
  isHexColor,
  isStopsGradient,
  paintFallbackColor,
  paintToCssBackground,
  toGradientPaint,
  toSolidPaint,
} from './paint'
import { GRADIENT_STOPS_MAX, GRADIENT_STOPS_MIN } from './appearance'
import type { ColorPaint, GradientStop, ShapeFill, SlideBackground } from './types'

export type PaintMode = 'solid' | 'linear-gradient' | 'transparent' | 'image'

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
  return value.type === 'solid' || value.type === 'linear-gradient'
}

function currentPaint(value: PaintValue, fallbackPaint: ColorPaint): ColorPaint {
  return isPaint(value) ? value : fallbackPaint
}

function modeOf(value: PaintValue): PaintMode {
  return value.type
}

interface ColorButtonProps {
  label: string
  color: string
  onChange: (color: string) => void
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

export function ColorPickerButton({ label, color, onChange }: ColorButtonProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const rgb = hexToRgb(color)

  useEffect(() => {
    if (!open) return

    function closeOnOutsidePointer(event: PointerEvent) {
      const root = rootRef.current
      if (root && !root.contains(event.target as Node)) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
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
    onChange(rgbToHex({ ...rgb, [channel]: clampChannel(Number(value)) }))
  }

  return (
    <div className="paint-color" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="paint-color-button"
        data-testid="paint-color-button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{ background: color }}
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div className="paint-popover" data-testid="paint-popover" role="dialog" aria-label={`${label} 色板`}>
          <div className="paint-popover-head">
            <span className="paint-popover-sample" style={{ background: color }} />
            <input
              className="paint-popover-hex"
              value={color}
              aria-label={`${label} 自定义 HEX`}
              onChange={(event) => {
                const nextColor = event.currentTarget.value
                if (isHexColor(nextColor)) onChange(nextColor)
              }}
            />
          </div>
          <div className="paint-swatch-grid" aria-label={`${label} 常用颜色`}>
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="paint-swatch"
                aria-label={`${label} ${preset}`}
                style={{ background: preset }}
                onClick={() => onChange(preset)}
              />
            ))}
          </div>
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
    if (isStopsGradient(gradient)) return
    onChange({ ...gradient, ...patch, type: 'linear-gradient' })
  }

  function updateAngle(angle: number) {
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
      onChange({ type: 'linear-gradient', stops: next, angle: gradient.angle })
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
    onChange({
      type: 'linear-gradient',
      angle: gradient.angle,
      stops: gradient.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, color } : { ...stop }),
    })
  }

  /** Offsets are edited in whole percent, clamped strictly between neighbors. */
  function updateStopOffset(index: number, percent: number) {
    if (!isStopsGradient(gradient) || !Number.isFinite(percent)) return
    const stops = gradient.stops
    const minPercent = index === 0 ? 0 : Math.floor(stops[index - 1].offset * 100) + 1
    const maxPercent = index === stops.length - 1 ? 100 : Math.ceil(stops[index + 1].offset * 100) - 1
    const clamped = Math.max(minPercent, Math.min(maxPercent, Math.round(percent)))
    onChange({
      type: 'linear-gradient',
      angle: gradient.angle,
      stops: stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, offset: clamped / 100 } : { ...stop }),
    })
  }

  function removeStop(index: number) {
    if (!isStopsGradient(gradient) || gradient.stops.length <= GRADIENT_STOPS_MIN) return
    onChange({
      type: 'linear-gradient',
      angle: gradient.angle,
      stops: gradient.stops.filter((_, stopIndex) => stopIndex !== index),
    })
  }

  return (
    <div className="paint-field" data-testid="freeform-paint-field">
      <div className="field-label">{label}</div>
      <div className="seg stretch paint-mode" aria-label={`${label} 类型`}>
        {modes.map((mode) => (
          <button
            key={mode}
            type="button"
            className={activeMode === mode ? 'seg-btn on' : 'seg-btn'}
            data-testid={`paint-mode-${mode}`}
            aria-label={mode === 'image' ? '插入图片填充' : undefined}
            onClick={() => changeMode(mode)}
          >
            {mode === 'solid' ? '纯色' : mode === 'linear-gradient' ? '渐变' : mode === 'transparent' ? '透明' : '图片'}
          </button>
        ))}
      </div>

      {activeMode === 'solid' && (
        <div className="paint-row">
          <ColorPickerButton label={`${label} 颜色`} color={paintFallbackColor(paint)} onChange={updateSolid} />
          <input
            className="paint-hex"
            value={paintFallbackColor(paint)}
            onChange={(event) => updateSolid(event.currentTarget.value)}
            aria-label={`${label} hex`}
          />
        </div>
      )}

      {activeMode === 'linear-gradient' && (
        <div className="paint-gradient">
          {isStopsGradient(gradient) ? (
            <div className="paint-stops" data-testid="paint-stops-list">
              {gradient.stops.map((stop, index) => (
                <div className="paint-row" key={index}>
                  <ColorPickerButton
                    label={`${label} 色标 ${index + 1} 颜色`}
                    color={stop.color}
                    onChange={(color) => updateStopColor(index, color)}
                  />
                  <input
                    className="paint-hex"
                    value={stop.color}
                    onChange={(event) =>
                      isHexColor(event.currentTarget.value) && updateStopColor(index, event.currentTarget.value)}
                    aria-label={`${label} 色标 ${index + 1} hex`}
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
                    aria-label={`${label} 色标 ${index + 1} 位置百分比`}
                  />
                  <button
                    type="button"
                    className="ghost"
                    data-testid={`paint-stop-${index}-remove`}
                    disabled={gradient.stops.length <= GRADIENT_STOPS_MIN}
                    onClick={() => removeStop(index)}
                    aria-label={`${label} 删除色标 ${index + 1}`}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="paint-row">
                <ColorPickerButton
                  label={`${label} 渐变起始色`}
                  color={gradient.from}
                  onChange={(color) => updateGradient({ from: color })}
                />
                <input
                  className="paint-hex"
                  value={gradient.from}
                  onChange={(event) => isHexColor(event.currentTarget.value) && updateGradient({ from: event.currentTarget.value })}
                  aria-label={`${label} 渐变起始 hex`}
                />
              </div>
              <div className="paint-row">
                <ColorPickerButton
                  label={`${label} 渐变结束色`}
                  color={gradient.to}
                  onChange={(color) => updateGradient({ to: color })}
                />
                <input
                  className="paint-hex"
                  value={gradient.to}
                  onChange={(event) => isHexColor(event.currentTarget.value) && updateGradient({ to: event.currentTarget.value })}
                  aria-label={`${label} 渐变结束 hex`}
                />
              </div>
            </>
          )}
          <div className="paint-row">
            <input
              className="paint-range"
              data-testid="paint-gradient-angle"
              type="range"
              min="0"
              max="359"
              value={gradient.angle}
              onChange={(event) => updateAngle(Number(event.currentTarget.value))}
              aria-label={`${label} 渐变角度`}
            />
            <input
              className="paint-angle"
              type="number"
              min="0"
              max="359"
              value={gradient.angle}
              onChange={(event) => updateAngle(Number(event.currentTarget.value))}
              aria-label={`${label} 渐变角度数值`}
            />
          </div>
          <div className="paint-row">
            <button
              type="button"
              className="ghost"
              data-testid="paint-stops-add"
              disabled={isStopsGradient(gradient) && gradient.stops.length >= GRADIENT_STOPS_MAX}
              onClick={addStop}
              aria-label={`${label} 添加色标`}
            >
              添加色标
            </button>
          </div>
          <div
            className="paint-preview"
            aria-hidden="true"
            style={{ background: paintToCssBackground(gradient) }}
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
                {fit === 'cover' ? '填满' : '适应'}
              </button>
            ))}
          </div>
          <div className="inspector-actions">
            <button
              className="ghost"
              type="button"
              data-testid="freeform-adjust-framing"
              aria-label="调整图片取景"
              title={imageFramingDisabled ? imageFramingDisabledReason : '调整图片取景'}
              disabled={imageFramingDisabled}
              onClick={onAdjustImageFraming}
            >
              调整取景
            </button>
            <button
              className="ghost"
              type="button"
              data-testid="freeform-reset-framing"
              aria-label="重置图片取景"
              title={imageFramingResetDisabled ? '当前已经是默认取景' : '重置图片取景'}
              disabled={imageFramingResetDisabled}
              onClick={onResetImageFraming}
            >
              重置取景
            </button>
            <button className="ghost" type="button" onClick={onChooseImage}>
              替换图片
            </button>
            <button className="ghost" type="button" onClick={onClearImage}>
              清除图片
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
