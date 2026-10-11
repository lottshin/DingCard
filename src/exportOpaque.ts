// JPEG and PDF pages have no transparency. A page is drawn as it is, with its
// own background, and then set on white, so only what it leaves clear (a
// transparent page, rounded corners) turns white. html-to-image's
// backgroundColor option would instead replace the page's own background
// colour with white.

/** The picture with white painted behind it, in place: clear pixels turn white, the rest stay as drawn. */
export function onWhite(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('export canvas unavailable')
  context.save()
  context.globalCompositeOperation = 'destination-over'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.restore()
  return canvas
}
