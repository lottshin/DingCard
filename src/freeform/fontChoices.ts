// What the font pickers offer and call a font-family value. A text's family
// can be a whole stack ("PingFang SC, Microsoft YaHei, system-ui, sans-serif"
// is what a new text box gets); it goes by the name of the font that stack
// starts with. Imported fonts (fontLibrary.ts) follow the built-in ones.

import { primaryFamily } from '../fontEmbed'
import { t } from '../i18n'
import type { SelectOption } from '../Select'
import { FONTS } from '../theme'
import { importedFontStack } from './fontFiles'
import type { ImportedFont } from './fontLibrary'

/** The option that opens the file picker instead of naming a font. */
export const IMPORT_FONT_OPTION = '__import-font__'

/** The built-in font a family value names: the exact stack, or the one its first family is. */
export function builtInFont(fontFamily: string): (typeof FONTS)[number] | undefined {
  const exact = FONTS.find((font) => font.id === fontFamily)
  if (exact) return exact
  const first = primaryFamily(fontFamily).toLowerCase()
  return FONTS.find((font) => primaryFamily(font.id).toLowerCase() === first)
}

/** The name to show for a family value: a built-in font's label, else the first family it lists. */
export function fontLabel(fontFamily: string): string {
  const font = builtInFont(fontFamily)
  return font ? t(font.label) : primaryFamily(fontFamily) || fontFamily
}

/** The option a family value selects: the built-in font it names, else the value itself. */
export function fontPickerValue(fontFamily: string): string {
  return builtInFont(fontFamily)?.id ?? fontFamily
}

/**
 * Built-in fonts, then imported ones; a value that is neither (a font imported
 * in another browser) stays listed under its own name, and `withImport` adds
 * the import action last.
 */
export function fontOptions(
  imported: readonly ImportedFont[],
  { current, withImport = false }: { current?: string; withImport?: boolean } = {},
): SelectOption[] {
  const options: SelectOption[] = [
    ...FONTS.map((font) => ({ id: font.id, label: t(font.label) })),
    ...imported.map((font) => ({ id: importedFontStack(font.family), label: font.family })),
  ]
  if (current !== undefined) {
    const value = fontPickerValue(current)
    if (!options.some((option) => option.id === value)) options.push({ id: value, label: fontLabel(value) })
  }
  if (withImport) options.push({ id: IMPORT_FONT_OPTION, label: t('导入字体…'), previewFont: 'inherit' })
  return options
}
