import type { ReactNode } from 'react'

/** Small line icons that stand in for a field's label inside inspector number fields. */
export type InspectorGlyphName =
  | 'rotate'
  | 'radius'
  | 'opacity'
  | 'stroke'
  | 'font-size'
  | 'line-height'
  | 'letter-spacing'
  | 'blur'
  | 'dash'
  | 'paragraph-spacing'

const GLYPHS: Record<InspectorGlyphName, ReactNode> = {
  rotate: (
    <>
      <path d="M13 8a5 5 0 1 1-1.46-3.54" />
      <path d="M13 2.5v3h-3" />
    </>
  ),
  radius: <path d="M3 13.5V8.5a5.5 5.5 0 0 1 5.5-5.5h5" />,
  opacity: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" />
    </>
  ),
  stroke: (
    <>
      <path d="M2.5 3.75h11" strokeWidth="1" />
      <path d="M2.5 7.75h11" strokeWidth="1.75" />
      <path d="M2.5 12.25h11" strokeWidth="2.5" />
    </>
  ),
  'font-size': <path d="m1.75 13 3.5-9 3.5 9M3 10h4.5M10 13l2.25-5.5L14.5 13M10.75 11.25h3" />,
  'line-height': <path d="M2.5 2.75h11M2.5 13.25h11M8 5.25v5.5M6.25 7 8 5.25 9.75 7M6.25 9 8 10.75 9.75 9" />,
  'letter-spacing': <path d="M2 2.5v11M14 2.5v11M5.25 11.5 8 4.5l2.75 7M6.1 9.25h3.8" />,
  blur: <path d="M8 2.25c2.6 3.1 4 5.1 4 7.1a4 4 0 0 1-8 0c0-2 1.4-4 4-7.1z" />,
  dash: <path d="M1.75 8h2.5M6.75 8h2.5M11.75 8h2.5" />,
  'paragraph-spacing': <path d="M2.5 2.75h7M2.5 5h5M2.5 11h7M2.5 13.25h5M12.5 5.25v5.5M11 6.75l1.5-1.5 1.5 1.5M11 9.25l1.5 1.5 1.5-1.5" />,
}

export function InspectorGlyph({ name }: { name: InspectorGlyphName }) {
  return (
    <svg className="field-glyph" viewBox="0 0 16 16" aria-hidden="true">
      {GLYPHS[name]}
    </svg>
  )
}
