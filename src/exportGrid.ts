// 九宫格: one square page cut into a three-by-three grid of pictures, in the
// order WeChat Moments lays nine out — left to right, then top to bottom —
// so posted together they make the page again.

export const GRID_SIZE = 3

/** Whether a page can be cut into a grid of squares: a square one. */
export function isGridPage(page: { width: number; height: number }): boolean {
  return page.width > 0 && page.width === page.height
}

/** The squares of a width × height picture, in reading order, on whole pixels (so they meet without gaps). */
export function gridCells(width: number, height: number, size = GRID_SIZE): Array<{ x: number; y: number; width: number; height: number }> {
  const edge = (total: number, index: number) => Math.round((total * index) / size)
  return Array.from({ length: size * size }, (_, index) => {
    const column = index % size
    const row = Math.floor(index / size)
    const x = edge(width, column)
    const y = edge(height, row)
    return { x, y, width: edge(width, column + 1) - x, height: edge(height, row + 1) - y }
  })
}

/** A picture cut into its grid of squares. */
export function sliceIntoGrid(source: HTMLCanvasElement, size = GRID_SIZE): HTMLCanvasElement[] {
  return gridCells(source.width, source.height, size).map((cell) => {
    const canvas = document.createElement('canvas')
    canvas.width = cell.width
    canvas.height = cell.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('grid canvas unavailable')
    context.drawImage(source, cell.x, cell.y, cell.width, cell.height, 0, 0, cell.width, cell.height)
    return canvas
  })
}
