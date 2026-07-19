import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_PAGE_PAINT,
  isHexColor,
  paintFallbackColor,
  paintToCssBackground,
  toGradientPaint,
  toSolidPaint,
} from './paint'
import type { ColorPaint, ShapeFill, SlideBackground } from './types'

export type PaintMode = 'solid' | 'linear-gradient' | 'transparent' | 'image'

type PaintValue = SlideBackground | ShapeFill | ColorPaint
type LinearGradientPaint = Extract<ColorPaint, { type: 'linear-gradient' }>
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

  function updateGradient(patch: Partial<Omit<LinearGradientPaint, 'type'>>) {
    onChange({ ...gradient, ...patch, type: 'linear-gradient' })
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
          <div className="paint-row">
            <input
              className="paint-range"
              data-testid="paint-gradient-angle"
              type="range"
              min="0"
              max="359"
              value={gradient.angle}
              onChange={(event) => updateGradient({ angle: Number(event.currentTarget.value) })}
              aria-label={`${label} 渐变角度`}
            />
            <input
              className="paint-angle"
              type="number"
              min="0"
              max="359"
              value={gradient.angle}
              onChange={(event) => updateGradient({ angle: Number(event.currentTarget.value) })}
              aria-label={`${label} 渐变角度数值`}
            />
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
                onClick={() => onImageFitChange?.(fit)}
              >
                {fit === 'cover' ? '填满' : '适应'}
              </button>
            ))}
          </div>
          <div className="inspector-actions">
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
