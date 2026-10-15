/**
 * Layout model on top of the pdf.js text lines: lines are cut into "cells" (runs of items
 * separated by a wide horizontal gap: side-by-side blocks, label/value columns, table cells),
 * and cells are chained vertically into "blocks" (left-aligned runs of consecutive rows such as
 * an address block).
 */
import type { PdfTextDocument, PdfTextItem } from "../pdf/types"
import { fold, normalizeSpaces } from "./text"
import type { BoundingBox } from "./types"

export interface Cell {
  /** Stable index in `Layout.cells` (reading order). */
  id: number
  page: number
  /** Index of the source line in `Layout.lines`. */
  line: number
  text: string
  /** Accent-free lowercase text, for label matching. */
  folded: string
  x0: number
  x1: number
  y: number
  /** Bottom edge. */
  y1: number
  fontSize: number
  items: PdfTextItem[]
}

export interface Row {
  index: number
  page: number
  y: number
  y1: number
  text: string
  cells: Cell[]
}

export interface Layout {
  pageCount: number
  pageHeights: number[]
  pageWidths: number[]
  rows: Row[]
  cells: Cell[]
  /** `blockOf[cell.id]` = index in `blocks`. */
  blocks: Cell[][]
  blockOf: number[]
}

/** Two items on a row belong to different cells beyond this gap, in font sizes. */
const CELL_GAP_RATIO = 1.1
/** Two vertically consecutive cells chain into one block within this many font sizes. */
const BLOCK_GAP_RATIO = 1.0
/** Left (or right) edges of cells in one block may differ by this many points. */
const BLOCK_ALIGN_TOLERANCE = 4

export function bboxOf(items: PdfTextItem[]): BoundingBox | undefined {
  const first = items[0]
  if (!first) return undefined
  const same = items.filter((i) => i.page === first.page)
  const x = Math.min(...same.map((i) => i.x))
  const y = Math.min(...same.map((i) => i.y))
  const x1 = Math.max(...same.map((i) => i.x + i.width))
  const y1 = Math.max(...same.map((i) => i.y + i.height))
  return { page: first.page, x, y, width: x1 - x, height: y1 - y }
}

function joinItems(items: PdfTextItem[]): string {
  let text = ""
  let previous: PdfTextItem | undefined
  for (const item of items) {
    if (previous) {
      const gap = item.x - (previous.x + previous.width)
      const ref = Math.min(previous.fontSize, item.fontSize)
      if (gap > 0.17 * ref && !/\s$/.test(text) && !/^\s/.test(item.text)) text += " "
    }
    text += item.text
    previous = item
  }
  return normalizeSpaces(text)
}

function makeCell(id: number, page: number, line: number, items: PdfTextItem[]): Cell {
  const text = joinItems(items)
  return {
    id,
    page,
    line,
    text,
    folded: fold(text),
    x0: Math.min(...items.map((i) => i.x)),
    x1: Math.max(...items.map((i) => i.x + i.width)),
    y: Math.min(...items.map((i) => i.y)),
    y1: Math.max(...items.map((i) => i.y + i.height)),
    fontSize: Math.max(...items.map((i) => i.fontSize || i.height || 1)),
    items,
  }
}

export function buildLayout(doc: PdfTextDocument): Layout {
  const rows: Row[] = []
  const cells: Cell[] = []
  for (const page of doc.pages) {
    for (const line of page.lines) {
      const items = [...line.items].filter((i) => i.text.trim() !== "").sort((a, b) => a.x - b.x)
      if (items.length === 0) continue
      const rowIndex = rows.length
      const rowCells: Cell[] = []
      let current: PdfTextItem[] = []
      for (const item of items) {
        const prev = current[current.length - 1]
        if (prev) {
          const gap = item.x - (prev.x + prev.width)
          const ref = Math.max(1, Math.min(prev.fontSize || 1, item.fontSize || 1))
          if (gap > CELL_GAP_RATIO * ref) {
            const cell = makeCell(cells.length, page.number, rowIndex, current)
            cells.push(cell)
            rowCells.push(cell)
            current = []
          }
        }
        current.push(item)
      }
      if (current.length > 0) {
        const cell = makeCell(cells.length, page.number, rowIndex, current)
        cells.push(cell)
        rowCells.push(cell)
      }
      rows.push({
        index: rowIndex,
        page: page.number,
        y: Math.min(...rowCells.map((c) => c.y)),
        y1: Math.max(...rowCells.map((c) => c.y1)),
        text: rowCells.map((c) => c.text).join("  "),
        cells: rowCells,
      })
    }
  }
  const { blocks, blockOf } = buildBlocks(cells)
  return {
    pageCount: doc.pageCount,
    pageHeights: doc.pages.map((p) => p.height),
    pageWidths: doc.pages.map((p) => p.width),
    rows,
    cells,
    blocks,
    blockOf,
  }
}

/** Chain cells that share a left edge and follow each other closely on the same page. */
function buildBlocks(cells: Cell[]): { blocks: Cell[][]; blockOf: number[] } {
  const blocks: Cell[][] = []
  const blockOf: number[] = new Array(cells.length).fill(-1)
  const open: number[] = []
  for (const cell of cells) {
    let best = -1
    let bestGap = Number.POSITIVE_INFINITY
    for (const b of open) {
      const block = blocks[b]
      const last = block?.[block.length - 1]
      if (!last || last.page !== cell.page || last.line === cell.line) continue
      // Left-aligned or right-aligned (letterheads printed flush right).
      const leftAligned = Math.abs(last.x0 - cell.x0) <= BLOCK_ALIGN_TOLERANCE
      const rightAligned = Math.abs(last.x1 - cell.x1) <= BLOCK_ALIGN_TOLERANCE
      if (!leftAligned && !rightAligned) continue
      const gap = cell.y - last.y1
      const ref = Math.max(last.fontSize, cell.fontSize)
      if (gap < -0.5 * ref || gap > BLOCK_GAP_RATIO * ref) continue
      if (gap < bestGap) {
        bestGap = gap
        best = b
      }
    }
    if (best >= 0) {
      blocks[best]?.push(cell)
      blockOf[cell.id] = best
    } else {
      blocks.push([cell])
      blockOf[cell.id] = blocks.length - 1
      open.push(blocks.length - 1)
    }
  }
  return { blocks, blockOf }
}

export function blockOfCell(layout: Layout, cell: Cell): Cell[] {
  return layout.blocks[layout.blockOf[cell.id] ?? -1] ?? [cell]
}

/** The cell right of `cell` on the same row, if any. */
export function cellToTheRight(layout: Layout, cell: Cell): Cell | undefined {
  const row = layout.rows[cell.line]
  return row?.cells.find((c) => c.x0 > cell.x1 - 0.5)
}

/** The next cell below `cell` in its block (same left edge, next row). */
export function cellBelow(layout: Layout, cell: Cell): Cell | undefined {
  const block = blockOfCell(layout, cell)
  const i = block.indexOf(cell)
  return i >= 0 ? block[i + 1] : undefined
}

/**
 * A cell "part": the text of a cell split on visual separators used in footers and dense
 * lines ("IBAN : … – BIC : … – Réf. : …", "SIRET … | TVA …").
 */
export interface Part {
  cell: Cell
  text: string
  folded: string
}

const PART_SEPARATOR_RE = /\s+[–—|•·]\s+|\s+-\s+(?=[\p{Lu}])/u

const partsCache = new WeakMap<Cell, Part[]>()

export function partsOf(cell: Cell): Part[] {
  const cached = partsCache.get(cell)
  if (cached) return cached
  const parts = cell.text
    .split(PART_SEPARATOR_RE)
    .map((t) => t.trim())
    .filter((t) => t !== "")
    .map((text) => ({ cell, text, folded: fold(text) }))
  partsCache.set(cell, parts)
  return parts
}

export function evidenceOf(cells: Cell[], text?: string): { text: string; bbox?: BoundingBox } {
  const items = cells.flatMap((c) => c.items)
  return { text: text ?? cells.map((c) => c.text).join(" "), bbox: bboxOf(items) }
}
