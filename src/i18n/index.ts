// UI language: Chinese (the source language) or English.
//
// Chinese strings stay in the code and double as translation keys, so
// `t('已保存')` reads naturally and falls back to Chinese when an English
// entry is missing. Placeholders use `{name}`: `t('第 {n} 页', { n: 3 })`.

import { useSyncExternalStore } from 'react'
import { en } from './en'

export type Lang = 'zh' | 'en'
export type TranslationParams = Record<string, string | number>
export type Translation = string | ((params: TranslationParams) => string)

export const LANGUAGES: readonly { id: Lang; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
]

const STORAGE_KEY = 'dingcard.lang.v1'
const dictionaries: Record<Exclude<Lang, 'zh'>, Readonly<Record<string, Translation>>> = { en }
const listeners = new Set<() => void>()

function readStoredLang(): Lang {
  if (typeof window === 'undefined') return 'zh'
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

let current: Lang = readStoredLang()

function applyDocumentLang(lang: Lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
}

applyDocumentLang(current)

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang) {
  if (lang === current) return
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // The choice still applies to this page.
  }
  applyDocumentLang(lang)
  for (const listener of [...listeners]) listener()
}

/** BCP 47 tag for dates, numbers and collation in the current language. */
export function locale(): string {
  return current === 'zh' ? 'zh-CN' : 'en-US'
}

function fill(template: string, params?: TranslationParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match))
}

/** Translate a Chinese source string into the current language. */
export function t(source: string, params?: TranslationParams): string {
  const entry = current === 'zh' ? undefined : dictionaries[current][source]
  if (entry === undefined) return fill(source, params)
  return typeof entry === 'function' ? entry(params ?? {}) : fill(entry, params)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang)
}

/** `t` for components; subscribing re-renders even memoized components on a switch. */
export function useT(): typeof t {
  useLang()
  return t
}
