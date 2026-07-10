export interface FreeformDocument {
  documentVersion: 1
  slides: FreeformSlide[]
  activeSlideId: string
}

export interface FreeformSlide {
  id: string
  name: string
  width: number
  height: number
  background: SlideBackground
  elements: FreeformElement[]
}

export type SlideBackground =
  | { type: 'solid'; color: string }
  | { type: 'transparent' }

export type FreeformElement = never
