import { describe, expect, it } from 'vitest'
import { TEMPLATE_REGISTRY } from './registry'

const doc = (series: string) => {
  const template = TEMPLATE_REGISTRY.find((candidate) => candidate.series === series)
  return template!.createFreeform!()
}
const node = (series: string, name: string) => {
  const found = doc(series).slides[0].nodes.find((candidate: { name: string }) => candidate.name === name)
  expect(found, `${series}: ${name}`).toBeDefined()
  return found as { x: number; y: number; width: number; height: number; type: string }
}
const inside = (series: string, inner: string, outer: string, margin: number, verticalMargin = margin) => {
  const a = node(series, inner)
  const b = node(series, outer)
  expect(a.x - b.x, `${series} ${inner} left`).toBeGreaterThanOrEqual(margin)
  expect(b.x + b.width - (a.x + a.width), `${series} ${inner} right`).toBeGreaterThanOrEqual(margin)
  expect(a.y - b.y, `${series} ${inner} top`).toBeGreaterThanOrEqual(verticalMargin)
  expect(b.y + b.height - (a.y + a.height), `${series} ${inner} bottom`).toBeGreaterThanOrEqual(verticalMargin)
}
const clear = (series: string, a: string, b: string) => {
  const first = node(series, a)
  const second = node(series, b)
  const overlap = first.x < second.x + second.width && second.x < first.x + first.width
    && first.y < second.y + second.height && second.y < first.y + first.height
  expect(overlap, `${series}: ${a} overlaps ${b}`).toBe(false)
}

describe('template placement', () => {
  it('squares the QR code inside its card with breathing room', () => {
    inside('contact-card', '二维码', '二维码卡', 24)
    inside('follow-card', '二维码', '二维码卡', 24)
    clear('contact-card', '二维码卡', '姓名')
    clear('contact-card', '二维码卡', '职位')
    clear('follow-card', '二维码卡', '标题')
    clear('follow-card', '二维码卡', '爱心一')
    clear('follow-card', '二维码卡', '爱心二')
    clear('follow-card', '二维码卡', '气泡')
  })

  it('keeps the chart and its caption inside the white card', () => {
    inside('data-roundup', '图表', '图表卡', 40)
    inside('data-roundup', '图表标注', '图表卡', 40)
    clear('data-roundup', '图表卡', '标题')
    clear('data-roundup', '图表卡', '副标题')
    clear('data-roundup', '图表卡', '信息一')
    clear('data-roundup', '图表卡', '信息二')
    clear('data-roundup', '图表卡', '信息三')
  })

  it('centres the button copy on its plate and keeps the page clear of the edge', () => {
    // The copy shares the plate's box and centres itself, as price-list does.
    inside('follow-card', '按钮文字', '按钮底板', 0, 16)
    for (const series of ['contact-card', 'data-roundup', 'follow-card']) {
      for (const leaf of doc(series).slides[0].nodes as Array<{ x: number; y: number; width: number; height: number }>) {
        expect(leaf.x, `${series} left edge`).toBeGreaterThanOrEqual(0)
        expect(leaf.y, `${series} top edge`).toBeGreaterThanOrEqual(0)
        const size = { 'contact-card': 1080, 'data-roundup': 1920, 'follow-card': 1080 }[series]!
        expect(leaf.y + leaf.height, `${series} bottom edge`).toBeLessThanOrEqual(size)
      }
    }
  })
})
