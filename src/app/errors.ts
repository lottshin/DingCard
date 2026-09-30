import { t } from '../i18n'

/** A thrown error's message for people; storage and model messages are translation keys. */
export function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? t(error.message) : fallback
}
