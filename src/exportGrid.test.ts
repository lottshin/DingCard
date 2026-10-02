import { describe, expect, it } from 'vitest'
import { gridCells, isGridPage } from './exportGrid'

describe('nine-square grid', () => {
  it('cuts only square pages', () => {
    expect(isGridPage({ width: 3240, height: 3240 })).toBe(true)
    expect(isGridPage({ width: 1080, height: 1440 })).toBe(false)
  })

  it('cuts a picture into nine squares in reading order that meet without gaps', () => {
    const cells = gridCells(3240, 3240)
    expect(cells).toHaveLength(9)
    expect(cells[0]).toEqual({ x: 0, y: 0, width: 1080, height: 1080 })
    expect(cells[1]).toEqual({ x: 1080, y: 0, width: 1080, height: 1080 })
    expect(cells[3]).toEqual({ x: 0, y: 1080, width: 1080, height: 1080 })
    expect(cells[8]).toEqual({ x: 2160, y: 2160, width: 1080, height: 1080 })
    // A side that doesn't divide by three still fills edge to edge.
    const odd = gridCells(1000, 1000)
    expect(odd.slice(0, 3).map((cell) => cell.width)).toEqual([333, 334, 333])
    expect(odd[2].x + odd[2].width).toBe(1000)
  })
})
