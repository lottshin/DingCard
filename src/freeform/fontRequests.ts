import { buildFontEmbedCSS } from '../fontEmbed'
import type { FreeformSlide, FreeformTextElement } from './types'

export interface FreeformFontRequest {
  fontFamily: string
  text: string
  fontWeights: Array<FreeformTextElement['fontWeight']>
}

export type FontCSSBuilder = (
  text: string,
  fontFamily: string,
  fontWeights: Iterable<string | number>,
) => Promise<string>

export function collectFreeformFontRequests(slides: FreeformSlide[]): FreeformFontRequest[] {
  const groups = new Map<
    string,
    { fontFamily: string; texts: string[]; fontWeights: Set<FreeformTextElement['fontWeight']> }
  >()

  for (const slide of slides) {
    for (const element of slide.elements) {
      if (element.type !== 'text' || element.fontFamily.trim().length === 0) continue
      let group = groups.get(element.fontFamily)
      if (!group) {
        group = {
          fontFamily: element.fontFamily,
          texts: [],
          fontWeights: new Set(),
        }
        groups.set(element.fontFamily, group)
      }
      group.texts.push(element.text)
      group.fontWeights.add(element.fontWeight)
    }
  }

  return Array.from(groups.values(), (group) => ({
    fontFamily: group.fontFamily,
    text: group.texts.join('\n'),
    fontWeights: Array.from(group.fontWeights),
  }))
}

export async function buildFreeformFontCSS(
  requests: FreeformFontRequest[],
  builder: FontCSSBuilder = buildFontEmbedCSS,
): Promise<string> {
  const parts = await Promise.all(
    requests.map(async (request) => {
      try {
        return await builder(request.text, request.fontFamily, request.fontWeights)
      } catch {
        return ''
      }
    }),
  )
  return parts.filter(Boolean).join('\n')
}
