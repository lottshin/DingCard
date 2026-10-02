// Collage layouts for MCP clients: the same picture grids the editor's
// Elements panel inserts. Each layout comes as a ready `example` group node
// (rect cells with even gaps and rounded corners) that a client inserts with
// apply_actions' node/insert-children, then fills cell by cell with
// node/update-style picture fills — the same flow the editor uses.

import {
  COLLAGE_LAYOUTS,
  collageBox,
  createCollageGroup,
  type CollageLayout,
} from '../../../src/freeform/collageLayouts'

export interface CollageEntry {
  id: string
  name: string
  /** How many picture cells the layout has. */
  cellCount: number
  /** The collage box's width / height. */
  aspect: number
  /** A ready group node: rounded rect cells, placeholder fills. */
  example: ReturnType<typeof createCollageGroup>
}

export interface CollageCatalogue {
  collages: CollageEntry[]
}

function entryFor(
  layout: CollageLayout,
  page: { width: number; height: number },
): CollageEntry {
  const box = collageBox(layout, page)
  return {
    id: layout.id,
    name: layout.label,
    cellCount: layout.cells.length,
    aspect: layout.aspect,
    example: createCollageGroup(layout, { box }),
  }
}

/** The collage layouts for a page size (the example's box is page-relative). */
export function listCollages(pageWidth = 1080, pageHeight = 1440): CollageCatalogue {
  const width = Number.isFinite(pageWidth) ? Math.max(128, Math.min(4096, pageWidth)) : 1080
  const height = Number.isFinite(pageHeight) ? Math.max(128, Math.min(4096, pageHeight)) : 1440
  return {
    collages: COLLAGE_LAYOUTS.map((layout) => entryFor(layout, { width, height })),
  }
}
