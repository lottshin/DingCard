import { buildFontEmbedCSS } from '../fontEmbed'
import { walkScene } from './sceneTree'
import type { FreeformSlide, FreeformSlideV3, FreeformTextElement } from './types'

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

interface FontRequestGroup {
  fontFamily: string
  texts: string[]
  fontWeights: Set<FreeformTextElement['fontWeight']>
}

type FontText = Pick<FreeformTextElement, 'fontFamily' | 'fontWeight' | 'text'>

function addFontText(groups: Map<string, FontRequestGroup>, text: FontText): void {
  if (text.fontFamily.trim().length === 0) return
  let group = groups.get(text.fontFamily)
  if (!group) {
    group = {
      fontFamily: text.fontFamily,
      texts: [],
      fontWeights: new Set(),
    }
    groups.set(text.fontFamily, group)
  }
  group.texts.push(text.text)
  group.fontWeights.add(text.fontWeight)
}

function finishFontRequests(groups: Map<string, FontRequestGroup>): FreeformFontRequest[] {
  return Array.from(groups.values(), (group) => ({
    fontFamily: group.fontFamily,
    text: group.texts.join('\n'),
    fontWeights: Array.from(group.fontWeights),
  }))
}

export function collectFreeformFontRequests(slides: FreeformSlide[]): FreeformFontRequest[] {
  const groups = new Map<string, FontRequestGroup>()

  for (const slide of slides) {
    for (const element of slide.elements) {
      if (element.type === 'text') addFontText(groups, element)
    }
  }

  return finishFontRequests(groups)
}

/** Collect v3 font requests recursively, including text under hidden groups. */
export function collectFreeformFontRequestsV3(
  slides: readonly FreeformSlideV3[],
): FreeformFontRequest[] {
  const groups = new Map<string, FontRequestGroup>()
  for (const slide of slides) {
    walkScene(slide.nodes, (node) => {
      if (node.type === 'text') addFontText(groups, node)
    })
  }
  return finishFontRequests(groups)
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
