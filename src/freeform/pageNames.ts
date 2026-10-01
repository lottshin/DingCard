import { t } from '../i18n'

// New pages are stored as "Page 3", and duplicates as "Page 3 copy". Nobody
// typed those, so the editor calls such a page by where it sits now, in the
// interface language; a name someone gave is shown as written.

const DEFAULT_NAME = /^Page \d+$/
const COPY_SUFFIX = /^(.*\S) copy$/

/** True for the names the editor gives pages on its own. */
export function isDefaultPageName(name: string): boolean {
  let current = name.trim()
  for (let copy = COPY_SUFFIX.exec(current); copy; copy = COPY_SUFFIX.exec(current)) current = copy[1]
  return DEFAULT_NAME.test(current)
}

/** What the editor calls the page at `index`: 「第 3 页」 for an automatic or empty name, 「封面 副本」 for a copy of 「封面」. */
export function slideDisplayName(name: string, index: number): string {
  const trimmed = name.trim()
  if (!trimmed || isDefaultPageName(trimmed)) return t('第 {n} 页', { n: index + 1 })
  const copy = COPY_SUFFIX.exec(trimmed)
  return copy ? t('{name} 副本', { name: slideDisplayName(copy[1], index) }) : trimmed
}
