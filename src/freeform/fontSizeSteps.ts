/** Font size steps a designer reaches for; − / + buttons walk them. */
const FONT_SIZE_STEPS = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96, 112, 128, 144, 160, 200, 240]

export function nextFontSize(current: number, direction: 1 | -1): number {
  if (direction > 0) return FONT_SIZE_STEPS.find((step) => step > current) ?? Math.round(current * 1.25)
  return [...FONT_SIZE_STEPS].reverse().find((step) => step < current) ?? Math.max(1, Math.round(current * 0.8))
}
