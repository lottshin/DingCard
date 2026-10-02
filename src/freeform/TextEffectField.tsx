import { t, useLang } from '../i18n'
import { ColorPickerButton } from './PaintField'
import { InspectorNumberInput } from './InspectorNumberInput'
import { TextEffectSample } from './TextEffectSample'
import { ANGLED_TEXT_EFFECTS, defaultTextEffect, TEXT_EFFECT_TYPES, type TextEffectType } from './textEffects'
import type { ColorPaint, TextEffect } from './types'

const EFFECT_LABELS: Record<TextEffectType, string> = {
  neon: '霓虹',
  outline: '描边',
  hollow: '镂空',
  splice: '错位',
  offset: '投影',
  echo: '回声',
  glitch: '故障',
  extrude: '立体',
  background: '底色',
  marker: '荧光笔',
}

/** What the effect's size means for it. */
const AMOUNT_LABELS: Record<TextEffectType, string> = {
  neon: '强度',
  outline: '粗细',
  hollow: '粗细',
  splice: '偏移',
  offset: '偏移',
  echo: '偏移',
  glitch: '偏移',
  extrude: '厚度',
  background: '扩展',
  marker: '高度',
}

const solid = (color: string): ColorPaint => ({ type: 'solid', color })

/** How each choice shows its look: on a page and in colours it reads best in (as its 花字 does). */
const SAMPLES: Record<TextEffectType, { page: string; fill: ColorPaint; effect: TextEffect }> = {
  neon: { page: '#0b1020', fill: solid('#e8fdff'), effect: { type: 'neon', color: '#22d3ee', amount: 55 } },
  outline: { page: '#fbbf24', fill: solid('#1f2937'), effect: { type: 'outline', color: '#ffffff', amount: 60 } },
  hollow: { page: '#f4f4f5', fill: solid('#18181b'), effect: { type: 'hollow', amount: 50 } },
  splice: { page: '#fffbeb', fill: solid('#18181b'), effect: { type: 'splice', color: '#f59e0b', amount: 50, angle: 45 } },
  offset: { page: '#fef3c7', fill: solid('#ea580c'), effect: { type: 'offset', color: '#1c1917', amount: 45, angle: 45 } },
  echo: { page: '#f5f3ff', fill: solid('#6d28d9'), effect: { type: 'echo', color: '#6d28d9', amount: 45, angle: 0 } },
  glitch: { page: '#0a0a0a', fill: solid('#ffffff'), effect: { type: 'glitch', color: '#00e5ff', color2: '#ff2bd6', amount: 45 } },
  extrude: { page: '#1e1b4b', fill: solid('#fde047'), effect: { type: 'extrude', color: '#c2410c', amount: 50, angle: 45 } },
  background: { page: '#f4f4f5', fill: solid('#ffffff'), effect: { type: 'background', color: '#18181b', amount: 40, radius: 30 } },
  marker: { page: '#ffffff', fill: solid('#18181b'), effect: { type: 'marker', color: '#fde68a', amount: 50 } },
}

/**
 * The 效果 section for a text: the effect picker (none plus every effect,
 * each tile showing its look) and the chosen effect's colours and sizes.
 */
export function TextEffectField({
  effect,
  textColor,
  resetKey,
  onChange,
}: {
  effect: TextEffect | undefined
  /** The text's colour (or its gradient's first), which new effects are picked to suit. */
  textColor: string
  resetKey: unknown
  onChange: (effect: TextEffect | null) => void
}) {
  useLang()
  const pick = (type: TextEffectType | null) => {
    if (type === null) {
      if (effect) onChange(null)
      return
    }
    if (effect?.type !== type) onChange(defaultTextEffect(type, textColor))
  }

  return (
    <>
      <div className="text-effect-grid" role="group" aria-label={t('效果')}>
        <button
          type="button"
          className="text-effect-choice"
          data-testid="text-effect-none"
          aria-pressed={!effect}
          onClick={() => pick(null)}
        >
          <span className="text-effect-choice-sample" style={{ background: '#f4f4f5' }}>
            <TextEffectSample text="Aa" fontSize={20} textFill={solid('#18181b')} effect={null} />
          </span>
          <span className="text-effect-choice-name">{t('无')}</span>
        </button>
        {TEXT_EFFECT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className="text-effect-choice"
            data-testid={`text-effect-${type}`}
            aria-pressed={effect?.type === type}
            onClick={() => pick(type)}
          >
            <span className="text-effect-choice-sample" style={{ background: SAMPLES[type].page }}>
              <TextEffectSample text="Aa" fontSize={20} textFill={SAMPLES[type].fill} effect={SAMPLES[type].effect} />
            </span>
            <span className="text-effect-choice-name">{t(EFFECT_LABELS[type])}</span>
          </button>
        ))}
      </div>

      {effect && (
        <div className="text-effect-settings" data-testid="text-effect-settings">
          {'color' in effect && (
            <div className="field-grid with-gap">
              <div className="stroke-color-field" data-testid="text-effect-color">
                <span className="stroke-color-label">{t('颜色')}</span>
                <div className="color-field">
                  <span className="color-field-value">{effect.color.toUpperCase()}</span>
                  <ColorPickerButton
                    label={t('效果颜色')}
                    color={effect.color}
                    onChange={(color) => onChange({ ...effect, color })}
                  />
                </div>
              </div>
              {effect.type === 'glitch' && (
                <div className="stroke-color-field" data-testid="text-effect-color2">
                  <span className="stroke-color-label">{t('颜色')}</span>
                  <div className="color-field">
                    <span className="color-field-value">{effect.color2.toUpperCase()}</span>
                    <ColorPickerButton
                      label={t('效果第二种颜色')}
                      color={effect.color2}
                      onChange={(color2) => onChange({ ...effect, color2 })}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="field-grid">
            <label title={t(AMOUNT_LABELS[effect.type])}>
              <span className="field-glyph is-word" aria-hidden="true">{t(AMOUNT_LABELS[effect.type])}</span>
              <InspectorNumberInput
                ariaLabel={t(AMOUNT_LABELS[effect.type])}
                min={0}
                max={100}
                resetKey={resetKey}
                value={effect.amount}
                onCommit={(amount) => onChange({ ...effect, amount })}
              />
            </label>
            {ANGLED_TEXT_EFFECTS.has(effect.type) && 'angle' in effect && (
              <label title={t('方向')}>
                <span className="field-glyph is-word" aria-hidden="true">{t('方向')}</span>
                <InspectorNumberInput
                  ariaLabel={t('方向')}
                  min={0}
                  max={360}
                  resetKey={resetKey}
                  value={effect.angle}
                  onCommit={(angle) => onChange({ ...effect, angle: angle === 360 ? 0 : angle })}
                />
                <span className="field-suffix" aria-hidden="true">°</span>
              </label>
            )}
            {effect.type === 'background' && (
              <label title={t('圆角')}>
                <span className="field-glyph is-word" aria-hidden="true">{t('圆角')}</span>
                <InspectorNumberInput
                  ariaLabel={t('圆角')}
                  min={0}
                  max={100}
                  resetKey={resetKey}
                  value={effect.radius}
                  onCommit={(radius) => onChange({ ...effect, radius })}
                />
              </label>
            )}
          </div>
        </div>
      )}
    </>
  )
}
