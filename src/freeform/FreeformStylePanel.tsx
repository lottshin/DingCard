import { memo, useMemo } from 'react'
import { t, useLang } from '../i18n'
import { Select } from '../Select'
import { FONTS } from '../theme'
import { ColorPickerButton } from './PaintField'
import { deckColors, deckFonts, FONT_SETS, PALETTES, type RestyleRequest } from './restyle'
import type { FreeformDocument } from './types'

/** How many of a deck's colours the panel lists, the most prominent first. */
const DECK_COLOR_LIMIT = 12

function fontLabel(fontFamily: string): string {
  const font = FONTS.find((candidate) => candidate.id === fontFamily)
  return font ? t(font.label) : fontFamily
}

/**
 * The 风格 drawer: a palette or a font set for the whole deck, or one of the
 * deck's own colours and fonts swapped wherever it appears. Every choice is
 * one undo step.
 */
export const FreeformStylePanel = memo(function FreeformStylePanel({
  document,
  onRestyle,
}: {
  document: FreeformDocument
  onRestyle: (request: RestyleRequest) => void
}) {
  useLang()
  const colors = useMemo(() => deckColors(document).slice(0, DECK_COLOR_LIMIT), [document])
  const fonts = useMemo(() => deckFonts(document), [document])

  return (
    <>
      <div className="freeform-drawer-section">{t('配色')}</div>
      <div className="freeform-palettes">
        {PALETTES.map((palette) => (
          <button
            key={palette.id}
            type="button"
            className="freeform-palette"
            data-testid={`style-palette-${palette.id}`}
            onClick={() => onRestyle({ palette: palette.id })}
          >
            <span className="freeform-palette-chip" style={{ background: palette.background, color: palette.text }} aria-hidden="true">
              Aa
              <span className="freeform-palette-accents">
                {palette.accents.map((accent) => <i key={accent} style={{ background: accent }} />)}
              </span>
            </span>
            <span className="freeform-palette-name">{t(palette.name)}</span>
          </button>
        ))}
      </div>

      <div className="freeform-drawer-section">{t('字体组合')}</div>
      <div className="freeform-font-sets">
        {FONT_SETS.map((set) => (
          <button
            key={set.id}
            type="button"
            className="freeform-font-set"
            data-testid={`style-font-set-${set.id}`}
            onClick={() => onRestyle({ fontSet: set.id })}
          >
            <span className="freeform-font-set-name" style={{ fontFamily: set.heading }}>{t(set.name)}</span>
            <span className="freeform-font-set-body" style={{ fontFamily: set.body }}>{fontLabel(set.body)}</span>
          </button>
        ))}
      </div>

      {colors.length > 0 && (
        <>
          <div className="freeform-drawer-section">{t('本套用色')}</div>
          <div className="freeform-deck-colors">
            {colors.map((entry, index) => (
              <ColorPickerButton
                key={index}
                label={t('颜色 {color}', { color: entry.color })}
                color={entry.color}
                testId={`style-deck-color-${index}`}
                onChange={(color) => onRestyle({ colors: { [entry.color]: color } })}
              />
            ))}
          </div>
        </>
      )}

      {fonts.length > 0 && (
        <>
          <div className="freeform-drawer-section">{t('本套字体')}</div>
          <div className="freeform-deck-fonts">
            {fonts.map((font, index) => (
              <Select
                key={index}
                value={font.fontFamily}
                title={t('字体 {font}', { font: fontLabel(font.fontFamily) })}
                testId={`style-deck-font-${index}`}
                previewFonts
                options={[
                  ...FONTS.map((option) => ({ id: option.id, label: t(option.label) })),
                  ...(FONTS.some((option) => option.id === font.fontFamily) ? [] : [{ id: font.fontFamily, label: font.fontFamily }]),
                ]}
                onChange={(fontFamily) => {
                  if (fontFamily !== font.fontFamily) onRestyle({ fonts: { [font.fontFamily]: fontFamily } })
                }}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
})
