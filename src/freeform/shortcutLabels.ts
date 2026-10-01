const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** The platform's name for the Ctrl/⌘ modifier. */
export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl'

/** The key that deletes the selection, as the keyboard labels it. */
export const DELETE_KEY = IS_MAC ? '⌫' : 'Del'

/** A shortcut as the platform writes it: "⇧⌘V" on a Mac, "Ctrl+Shift+V" elsewhere. */
export function shortcutLabel(key: string, modifiers: { mod?: boolean; shift?: boolean; alt?: boolean } = {}): string {
  if (IS_MAC) return `${modifiers.alt ? '⌥' : ''}${modifiers.shift ? '⇧' : ''}${modifiers.mod ? '⌘' : ''}${key}`
  return [modifiers.mod && 'Ctrl', modifiers.shift && 'Shift', modifiers.alt && 'Alt', key].filter(Boolean).join('+')
}
