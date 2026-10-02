// The page sizes templates are drawn at, for the template center's filter
// and the size a poster shows under its name.

import type { TemplateFormatId } from './types'

export interface TemplateFormat {
  id: TemplateFormatId
  name: string
  ratio: string
  width: number
  height: number
}

export const TEMPLATE_FORMATS: readonly TemplateFormat[] = [
  { id: 'xhs', name: '小红书套图', ratio: '3:4', width: 1080, height: 1440 },
  { id: 'story', name: '竖版海报', ratio: '9:16', width: 1080, height: 1920 },
  { id: 'square', name: '方图', ratio: '1:1', width: 1080, height: 1080 },
  { id: 'landscape', name: '横版封面', ratio: '16:9', width: 1920, height: 1080 },
  { id: 'wechat-cover', name: '公众号首图', ratio: '2.35:1', width: 1800, height: 766 },
  { id: 'a4', name: 'A4 印刷', ratio: 'A4', width: 1240, height: 1754 },
]

export function templateFormat(id: TemplateFormatId): TemplateFormat {
  return TEMPLATE_FORMATS.find((format) => format.id === id) ?? TEMPLATE_FORMATS[0]
}
