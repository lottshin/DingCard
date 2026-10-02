import { memo, useMemo } from 'react'
import { t, useLang } from '../i18n'
import { CloseIcon, UploadIcon } from '../ui/icons'
import { fontLabel } from './fontChoices'
import { importedFontStack } from './fontFiles'
import { fontLibrary, useImportedFonts } from './fontLibrary'
import { deckFonts, FONT_SETS, PALETTES, STYLE_LOOKS, type RestyleRequest } from './restyle'
import type { FreeformDocument } from './types'

/**
 * The 风格 drawer puts a whole look on every page at once: a look (palette
 * and fonts together), a palette, or a font set — imported fonts among them,
 * each setting all the text. Every choice is one undo step. Changing one
 * colour or font of the deck everywhere is done where that colour or font is
 * edited (全部替换 in the settings panel).
 */
export const FreeformStylePanel = memo(function FreeformStylePanel({
  document,
  onRestyle,
  onImportFont,
}: {
  document: FreeformDocument
  onRestyle: (request: RestyleRequest) => void
  /** Opens the font file picker; the font joins the font sets. */
  onImportFont: () => void
}) {
  useLang()
  const families = useMemo(() => deckFonts(document).map((font) => font.fontFamily), [document])
  const imported = useImportedFonts()
  const setEverywhere = (stack: string) => {
    const changed = families.filter((family) => family !== stack)
    if (changed.length > 0) onRestyle({ fonts: Object.fromEntries(changed.map((family) => [family, stack])) })
  }

  return (
    <>
      <div className="freeform-drawer-section">{t('搭配')}</div>
      <div className="freeform-looks">
        {STYLE_LOOKS.map((look) => {
          const palette = PALETTES.find((candidate) => candidate.id === look.palette)!
          const fonts = FONT_SETS.find((candidate) => candidate.id === look.fontSet)!
          return (
            <button
              key={look.id}
              type="button"
              className="freeform-look"
              data-testid={`style-look-${look.id}`}
              onClick={() => onRestyle({ palette: look.palette, fontSet: look.fontSet })}
            >
              <span className="freeform-look-page" style={{ background: palette.background, color: palette.text }} aria-hidden="true">
                <span className="freeform-look-title" style={{ fontFamily: fonts.heading }}>{t('标题')}</span>
                <i className="freeform-look-accent" style={{ background: palette.accents[0] }} />
                <span className="freeform-look-body" style={{ fontFamily: fonts.body }}>{t('正文内容')}</span>
              </span>
              <span className="freeform-palette-name">{t(look.name)}</span>
            </button>
          )
        })}
      </div>

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
            <span className="freeform-font-set-body">
              <span style={{ fontFamily: set.heading }}>{fontLabel(set.heading)}</span>
              {set.body !== set.heading && <> + <span style={{ fontFamily: set.body }}>{fontLabel(set.body)}</span></>}
            </span>
          </button>
        ))}
        {imported.map((font) => (
          <div key={font.id} className="freeform-my-font">
            <button
              type="button"
              className="freeform-font-set"
              data-testid={`style-my-font-${font.id}`}
              title={font.family}
              onClick={() => setEverywhere(importedFontStack(font.family))}
            >
              <span className="freeform-font-set-name" style={{ fontFamily: importedFontStack(font.family) }}>{font.family}</span>
              <span className="freeform-font-set-body">{t('我的字体')}</span>
            </button>
            <button
              type="button"
              className="freeform-my-font-remove"
              aria-label={t('删除字体 {font}', { font: font.family })}
              title={t('删除字体 {font}', { font: font.family })}
              onClick={() => { void fontLibrary.remove(font.id).catch(() => undefined) }}
            >
              <CloseIcon />
            </button>
          </div>
        ))}
        <button type="button" className="freeform-font-import" data-testid="style-import-font" onClick={onImportFont}>
          <UploadIcon />
          {t('导入字体')}
        </button>
      </div>
    </>
  )
})
