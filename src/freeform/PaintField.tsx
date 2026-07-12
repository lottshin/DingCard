import { useRef } from 'react'
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

function ColorButton({ label, color, onChange }: ColorButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="paint-color">
      <button
        type="button"
        className="paint-color-button"
        data-testid="paint-color-button"
        aria-label={label}
        style={{ background: color }}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        className="paint-native-input"
        tabIndex={-1}
        type="color"
        value={color}
        aria-hidden="true"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
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
            onClick={() => changeMode(mode)}
          >
            {mode === 'solid' ? '纯色' : mode === 'linear-gradient' ? '渐变' : mode === 'transparent' ? '透明' : '图片'}
          </button>
        ))}
      </div>

      {activeMode === 'solid' && (
        <div className="paint-row">
          <ColorButton label={`${label} 颜色`} color={paintFallbackColor(paint)} onChange={updateSolid} />
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
            <ColorButton
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
            <ColorButton
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
