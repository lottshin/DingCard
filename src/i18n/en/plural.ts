import type { Translation, TranslationParams } from '../index'

function fill(template: string, params: TranslationParams) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match))
}

/** Picks the singular form when `params[key]` is 1. */
export function plural(one: string, other: string, key = 'n'): Translation {
  return (params) => fill(Number(params[key]) === 1 ? one : other, params)
}
