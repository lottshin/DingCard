import { describe, expect, it } from 'vitest'

import {
  QR_DARK_DEFAULT,
  QR_ECL_DEFAULT,
  QR_LIGHT_DEFAULT,
  QR_PAYLOAD_MAX_LENGTH,
  QR_QUIET_ZONE_DEFAULT,
  isValidQrEcl,
  isValidQrPayload,
  isValidQrQuietZone,
} from '../qrCode'
import { qrMatrix, qrModulePaths } from '../qrMatrix'
import { createQrCodeElement, createFreeformDocument, freeformReducer } from '../document'
import { normalizeFreeformDocument } from '../sceneDocument'
import type { FreeformDocument, FreeformQrCodeElement, FreeformSlide } from '../types'

describe('qr payload validation', () => {
  it('accepts 1–512 non-blank characters and rejects everything else', () => {
    expect(isValidQrPayload('https://dingcard.app')).toBe(true)
    expect(isValidQrPayload('x')).toBe(true)
    expect(isValidQrPayload('a'.repeat(QR_PAYLOAD_MAX_LENGTH))).toBe(true)
    expect(isValidQrPayload('')).toBe(false)
    expect(isValidQrPayload('   ')).toBe(false)
    expect(isValidQrPayload('a'.repeat(QR_PAYLOAD_MAX_LENGTH + 1))).toBe(false)
    expect(isValidQrPayload(42)).toBe(false)
  })

  it('accepts the four correction levels only', () => {
    for (const level of ['L', 'M', 'Q', 'H'] as const) expect(isValidQrEcl(level)).toBe(true)
    expect(isValidQrEcl('low')).toBe(false)
    expect(isValidQrEcl(undefined)).toBe(false)
  })

  it('accepts quiet zones of 0–4 modules and rejects everything else', () => {
    expect(QR_QUIET_ZONE_DEFAULT).toBe(2)
    for (const width of [0, 1, 2, 3, 4]) expect(isValidQrQuietZone(width)).toBe(true)
    expect(isValidQrQuietZone(-0.5)).toBe(false)
    expect(isValidQrQuietZone(4.5)).toBe(false)
    expect(isValidQrQuietZone(Number.NaN)).toBe(false)
    expect(isValidQrQuietZone('2')).toBe(false)
    expect(isValidQrQuietZone(undefined)).toBe(false)
  })
})

describe('qr matrix', () => {
  it('encodes a known payload into the finder-patterned module grid', () => {
    const matrix = qrMatrix('HELLO WORLD', 'M')!
    expect(matrix).not.toBeNull()
    expect(matrix.size).toBe(21)
    expect(matrix.rows).toHaveLength(21)
    // The top-left finder pattern is a 7×7 dark ring, a light ring, and a
    // 3×3 dark centre.
    const finder = matrix.rows.slice(0, 7).map((row) => row.slice(0, 7))
    expect(finder[0].every(Boolean)).toBe(true)
    expect(finder[1][1]).toBe(false)
    expect(finder[3].slice(2, 5).every(Boolean)).toBe(true)
    expect(matrix.rows[0][7]).toBe(false)
  })

  it('grows with the payload and draws one square per dark module', () => {
    const short = qrMatrix('HELLO WORLD', 'M')!
    const long = qrMatrix('https://example.com/with/a/much/longer/path?and=query', 'M')!
    expect(long!.size).toBeGreaterThan(short.size)
    const dark = short.rows.flat().filter(Boolean).length
    const squarePaths = qrModulePaths(short, 2, 'square')
    const squares = `${squarePaths.finder}${squarePaths.data}`.match(/M\d/g)?.length ?? 0
    expect(squares).toBe(dark)
    // The quiet zone offsets every square by two modules.
    expect(`${squarePaths.finder}${squarePaths.data}`).toContain('M2 2h1v1h-1z')
  })

  it('shapes the data modules by style, keeping the finders square', () => {
    const matrix = qrMatrix('HELLO WORLD', 'M')!
    const square = qrModulePaths(matrix, 2, 'square')
    // The whole code is plain squares.
    expect(`${square.finder}${square.data}`).not.toContain('a0.42')

    const dot = qrModulePaths(matrix, 2, 'dot')
    // Data modules become dot arcs, away from the finder areas.
    expect(dot.data).toContain('a0.42 0.42 0 1 0')
    expect(dot.finder).not.toContain('a0.42')
    // The top-left finder stays seven square modules wide.
    expect(dot.finder).toContain('M2 2h1v1h-1z')
    expect(dot.finder).toContain('M8 2h1v1h-1z')
    expect(dot.data).not.toContain('M2 2h1v1h-1z')

    // Rounded keeps square outlines; the view strokes their joins round.
    const rounded = qrModulePaths(matrix, 2, 'rounded')
    expect(`${rounded.finder}${rounded.data}`).not.toContain('a0.42')
  })

  it('returns null for payloads the encoder cannot handle', () => {
    expect(qrMatrix('', 'M')).toBeNull()
  })
})

describe('qrcode element in the document', () => {
  const slide: FreeformSlide = {
    id: 'slide-1',
    name: '第一页',
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    nodes: [],
  }
  const document: FreeformDocument = { documentVersion: 43, activeSlideId: slide.id, slides: [slide] }

  it('creates a centred square with the defaults', () => {
    const element = createQrCodeElement(slide)
    expect(element.type).toBe('qrcode')
    expect(element.name).toBe('二维码')
    expect(element.width).toBe(element.height)
    expect(element.payload).toBeTruthy()
    expect(element.dark).toBe(QR_DARK_DEFAULT)
    expect(element.light).toBe(QR_LIGHT_DEFAULT)
    expect(element.ecl).toBeUndefined()
    expect(QR_ECL_DEFAULT).toBe('M')
  })

  it('updates the payload through node/update-content and nothing else', () => {
    const withQr: FreeformDocument = {
      ...document,
      slides: [{ ...slide, nodes: [createQrCodeElement(slide)] }],
    }
    const qr = withQr.slides[0].nodes[0] as FreeformQrCodeElement
    const patched = freeformReducer(withQr, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [qr.id], patch: { payload: 'https://dingcard.app/docs' } }],
    })
    const next = patched.slides[0].nodes[0] as FreeformQrCodeElement
    expect(next.payload).toBe('https://dingcard.app/docs')
    // A blank or over-long payload rejects the patch and keeps the element.
    const rejected = freeformReducer(patched, {
      type: 'node/update-content',
      slideId: slide.id,
      updates: [{ path: [qr.id], patch: { payload: '   ' } }],
    })
    expect(rejected).toBe(patched)
  })

  it('styles colors and correction, restoring defaults on null', () => {
    const withQr: FreeformDocument = {
      ...document,
      slides: [{ ...slide, nodes: [createQrCodeElement(slide)] }],
    }
    const qr = withQr.slides[0].nodes[0] as FreeformQrCodeElement
    const styled = freeformReducer(withQr, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [qr.id], patch: { dark: '#1d4ed8', light: '#fef9c3', ecl: 'H' } }],
    })
    const next = styled.slides[0].nodes[0] as FreeformQrCodeElement
    expect(next.dark).toBe('#1d4ed8')
    expect(next.light).toBe('#fef9c3')
    expect(next.ecl).toBe('H')
    // null restores every default instead of removing the required fields.
    const restored = freeformReducer(styled, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [qr.id], patch: { dark: null, light: null, ecl: null } }],
    })
    const back = restored.slides[0].nodes[0] as FreeformQrCodeElement
    expect(back.dark).toBe(QR_DARK_DEFAULT)
    expect(back.light).toBe(QR_LIGHT_DEFAULT)
    expect('ecl' in back).toBe(false)
    // An invalid color rejects the patch.
    const badColor = freeformReducer(restored, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [qr.id], patch: { dark: 'blue' } }],
    })
    expect(badColor).toBe(restored)
  })

  it('normalizes qrcode nodes at v23 and rejects them at v21', () => {
    const qrSlide = {
      ...slide,
      nodes: [createQrCodeElement(slide)],
    }
    const v23 = normalizeFreeformDocument({ documentVersion: 23, activeSlideId: slide.id, slides: [qrSlide] })
    expect(v23).not.toBeNull()
    expect((v23!.slides[0].nodes[0] as FreeformQrCodeElement).payload).toBeTruthy()
    const v22 = normalizeFreeformDocument({ documentVersion: 22, activeSlideId: slide.id, slides: [qrSlide] })
    expect(v22).not.toBeNull()
    const v21 = normalizeFreeformDocument({ documentVersion: 21, activeSlideId: slide.id, slides: [qrSlide] })
    expect(v21).toBeNull()
  })

  it('carries module styles at v23 and rejects them at v22', () => {
    const styled: FreeformQrCodeElement = { ...createQrCodeElement(slide), moduleStyle: 'dot' }
    const qrSlide = { ...slide, nodes: [styled] }
    const v23 = normalizeFreeformDocument({ documentVersion: 23, activeSlideId: slide.id, slides: [qrSlide] })
    expect(v23).not.toBeNull()
    expect((v23!.slides[0].nodes[0] as FreeformQrCodeElement).moduleStyle).toBe('dot')
    const v22 = normalizeFreeformDocument({ documentVersion: 22, activeSlideId: slide.id, slides: [qrSlide] })
    expect(v22).toBeNull()
    // The style patch round-trips through the reducer, and null restores square.
    const base = createQrCodeElement(slide)
    const patched = freeformReducer(
      { documentVersion: 43, activeSlideId: slide.id, slides: [{ ...slide, nodes: [base] }] },
      { type: 'node/update-style', slideId: slide.id, updates: [{ path: [base.id], patch: { moduleStyle: 'rounded' } }] },
    )
    const next = patched.slides[0].nodes[0] as FreeformQrCodeElement
    expect(next.moduleStyle).toBe('rounded')
    const restored = freeformReducer(patched, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { moduleStyle: null } }],
    })
    expect('moduleStyle' in (restored.slides[0].nodes[0] as FreeformQrCodeElement)).toBe(false)
  })

  it('carries a centre logo at v25 and rejects it at v24', () => {
    const marked: FreeformQrCodeElement = { ...createQrCodeElement(slide), logoSrc: 'img:logo1' }
    const qrSlide = { ...slide, nodes: [marked] }
    const v25 = normalizeFreeformDocument({ documentVersion: 25, activeSlideId: slide.id, slides: [qrSlide] })
    expect(v25).not.toBeNull()
    expect((v25!.slides[0].nodes[0] as FreeformQrCodeElement).logoSrc).toBe('img:logo1')
    const v24 = normalizeFreeformDocument({ documentVersion: 24, activeSlideId: slide.id, slides: [qrSlide] })
    expect(v24).toBeNull()
    // The style patch stamps and removes the logo; a blank one rejects.
    const base = createQrCodeElement(slide)
    const stamped = freeformReducer(
      { documentVersion: 43, activeSlideId: slide.id, slides: [{ ...slide, nodes: [base] }] },
      { type: 'node/update-style', slideId: slide.id, updates: [{ path: [base.id], patch: { logoSrc: '/templates/mark.svg' } }] },
    )
    expect((stamped.slides[0].nodes[0] as FreeformQrCodeElement).logoSrc).toBe('/templates/mark.svg')
    const removed = freeformReducer(stamped, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { logoSrc: null } }],
    })
    expect('logoSrc' in (removed.slides[0].nodes[0] as FreeformQrCodeElement)).toBe(false)
    const blank = freeformReducer(stamped, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { logoSrc: '   ' } }],
    })
    expect(blank).toBe(stamped)
  })

  it('carries a quiet zone at v30 and rejects it at v29', () => {
    const spaced: FreeformQrCodeElement = { ...createQrCodeElement(slide), quietZone: 4 }
    const qrSlide = { ...slide, nodes: [spaced] }
    const v30 = normalizeFreeformDocument({ documentVersion: 32, activeSlideId: slide.id, slides: [qrSlide] })
    expect(v30).not.toBeNull()
    expect((v30!.slides[0].nodes[0] as FreeformQrCodeElement).quietZone).toBe(4)
    const v29 = normalizeFreeformDocument({ documentVersion: 29, activeSlideId: slide.id, slides: [qrSlide] })
    expect(v29).toBeNull()
    // The style patch widens the margin and null restores the default 2 by
    // removing the field; out-of-range widths reject.
    const base = createQrCodeElement(slide)
    const widened = freeformReducer(
      { documentVersion: 43, activeSlideId: slide.id, slides: [{ ...slide, nodes: [base] }] },
      { type: 'node/update-style', slideId: slide.id, updates: [{ path: [base.id], patch: { quietZone: 4 } }] },
    )
    expect((widened.slides[0].nodes[0] as FreeformQrCodeElement).quietZone).toBe(4)
    const restored = freeformReducer(widened, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { quietZone: null } }],
    })
    expect('quietZone' in (restored.slides[0].nodes[0] as FreeformQrCodeElement)).toBe(false)
    const tooWide = freeformReducer(restored, {
      type: 'node/update-style',
      slideId: slide.id,
      updates: [{ path: [base.id], patch: { quietZone: 5 } }],
    })
    expect(tooWide).toBe(restored)
  })

  it('keeps a v22 document without any qrcode valid', () => {
    expect(normalizeFreeformDocument(createFreeformDocument())).not.toBeNull()
  })
})
