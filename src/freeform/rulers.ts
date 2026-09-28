/**
 * Pure ruler tick math shared by the horizontal and vertical stage rulers.
 * Positions are page/world coordinates; the caller maps them onto the
 * viewport by scaling with the current render scale.
 */

export const RULER_SIZE = 20

/** Screen px between two labeled ticks at minimum; keeps labels readable. */
const MIN_LABELED_SCREEN_STEP = 48

/** World-unit steps considered when picking one for the current zoom. */
const RULER_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000] as const

/** Every Nth tick is labeled (and drawn taller). */
const TICKS_PER_LABEL = 5

export interface RulerTick {
  position: number
  label: string | null
}

/** Pick the smallest world step that still spans enough screen pixels. */
export function pickRulerStep(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return RULER_STEPS[RULER_STEPS.length - 1]
  for (const step of RULER_STEPS) {
    if (step * scale >= MIN_LABELED_SCREEN_STEP) return step
  }
  return RULER_STEPS[RULER_STEPS.length - 1]
}

/** Ticks for the inclusive world range [start, end] at the given step. */
export function rulerTicks(start: number, end: number, step: number): RulerTick[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
  if (!Number.isFinite(step) || step <= 0) return []
  const first = Math.ceil(start / step)
  const last = Math.floor(end / step)
  const ticks: RulerTick[] = []
  for (let index = first; index <= last; index += 1) {
    const position = index * step
    ticks.push({
      position: position === 0 ? 0 : position,
      label: index % TICKS_PER_LABEL === 0 ? String(position === 0 ? 0 : position) : null,
    })
  }
  return ticks
}
