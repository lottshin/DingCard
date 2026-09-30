// English UI strings, keyed by the Chinese source text.
import type { Translation } from './index'
import { app } from './en/app'
import { data } from './en/data'
import { editor } from './en/editor'

export const en: Readonly<Record<string, Translation>> = {
  ...data,
  ...editor,
  ...app,
}
