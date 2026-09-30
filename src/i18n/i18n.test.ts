import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'

import { en } from './en'
import { getLang, locale, setLang, t } from './index'

const CJK = /[\u3400-\u9fff]/

// Every app module as raw text (tests and the dictionaries themselves excluded).
const SOURCES = Object.entries(
  import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/i18n/**', '!/src/**/__tests__/**'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>,
)

/** Every literal first argument of t(…), including both branches of a ternary. */
function translationKeys(): Map<string, string> {
  const keys = new Map<string, string>()
  for (const [file, source] of SOURCES) {
    if (!source.includes('t(')) continue
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
        const [first] = node.arguments
        const candidates = first && ts.isConditionalExpression(first) ? [first.whenTrue, first.whenFalse] : [first]
        for (const candidate of candidates) {
          if (candidate && (ts.isStringLiteral(candidate) || ts.isNoSubstitutionTemplateLiteral(candidate)) && CJK.test(candidate.text)) {
            keys.set(candidate.text, `${file}:${sf.getLineAndCharacterOfPosition(candidate.getStart(sf)).line + 1}`)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return keys
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
}

describe('i18n', () => {
  afterEach(() => setLang('zh'))

  it('keeps Chinese as the source language and fills placeholders', () => {
    expect(getLang()).toBe('zh')
    expect(t('已保存')).toBe('已保存')
    expect(t('第 {n} 页', { n: 3 })).toBe('第 3 页')
    expect(locale()).toBe('zh-CN')
  })

  it('translates to English, picks plural forms, and falls back to the source text', () => {
    setLang('en')
    expect(t('已保存')).toBe('Saved')
    expect(t('{n} 页', { n: 1 })).toBe('1 page')
    expect(t('{n} 页', { n: 4 })).toBe('4 pages')
    expect(t('一句还没有英文的话')).toBe('一句还没有英文的话')
    expect(locale()).toBe('en-US')
  })

  it('has an English entry for every translated string in the app', () => {
    const keys = translationKeys()
    expect(keys.size).toBeGreaterThan(500)
    const missing = [...keys].filter(([key]) => !(key in en)).map(([key, where]) => `${where}  ${key}`)
    expect(missing).toEqual([])
  })

  it('keeps the same placeholders in every English entry', () => {
    const mismatched = Object.entries(en).flatMap(([key, value]) => {
      const expected = placeholders(key)
      if (typeof value === 'function') {
        const params = Object.fromEntries(expected.map((name) => [name, 2]))
        const output = value(params)
        return /\{\w+\}/.test(output) ? [`${key} -> ${output}`] : []
      }
      return JSON.stringify(placeholders(value)) === JSON.stringify(expected) ? [] : [`${key} -> ${value}`]
    })
    expect(mismatched).toEqual([])
  })
})
