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

export interface FreeformElement {
  id: string
}

export type FreeformAction =
  | { type: 'slide/add-after-active' }
  | { type: 'slide/duplicate'; slideId: string }
  | { type: 'slide/delete'; slideId: string }
  | { type: 'slide/select'; slideId: string }
  | { type: 'slide/resize'; slideId: string; width: number; height: number }
  | { type: 'element/add'; slideId: string; element: FreeformElement }
  | { type: 'element/update'; slideId: string; elementId: string; patch: Partial<FreeformElement> }
  | { type: 'element/delete'; slideId: string; elementIds: string[] }
  | {
      type: 'element/reorder'
      slideId: string
      elementIds: string[]
      direction: 'forward' | 'backward' | 'front' | 'back'
    }
