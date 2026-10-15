/**
 * Builds a `PdfTextDocument` from text rows with x positions, for layout tests that do not need
 * a real PDF. Widths are estimated from the character count (Helvetica-like average advance).
 */
import type { PdfPage, PdfTextDocument, PdfTextItem, PdfTextLine } from "../pdf/types"

export interface SynthItem {
  x: number
  text: string
  size?: number
}

/** One visual row: top y and its items. `[x, text]` tuples are accepted as shorthand. */
export type SynthRow = [y: number, items: Array<SynthItem | [number, string]>]

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const DEFAULT_SIZE = 9

function toItem(raw: SynthItem | [number, string], y: number, page: number): PdfTextItem {
  const item = Array.isArray(raw) ? { x: raw[0], text: raw[1] } : raw
  const size = item.size ?? DEFAULT_SIZE
  return {
    text: item.text,
    x: item.x,
    y,
    width: item.text.length * size * 0.5,
    height: size,
    fontSize: size,
    page,
  }
}

export function syntheticDoc(pages: SynthRow[][]): PdfTextDocument {
  const built: PdfPage[] = pages.map((rows, index) => {
    const number = index + 1
    // Rows sharing a y are one visual line, as pdf.js would group them.
    const byY = new Map<number, Array<SynthItem | [number, string]>>()
    for (const [y, raw] of rows) byY.set(y, [...(byY.get(y) ?? []), ...raw])
    const lines: PdfTextLine[] = [...byY.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([y, raw]) => {
        const items = raw.map((r) => toItem(r, y, number)).sort((a, b) => a.x - b.x)
        return {
          page: number,
          y,
          x0: Math.min(...items.map((i) => i.x)),
          x1: Math.max(...items.map((i) => i.x + i.width)),
          height: Math.max(...items.map((i) => i.height)),
          text: items.map((i) => i.text).join(" "),
          items,
        }
      })
    return {
      number,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      items: lines.flatMap((l) => l.items),
      lines,
      text: lines.map((l) => l.text).join("\n"),
    }
  })
  const text = built.map((p) => p.text).join("\n\n")
  return {
    pageCount: built.length,
    pages: built,
    text,
    hasTextLayer: text.replace(/\s/g, "").length >= 20,
    info: { isEncrypted: false },
  }
}

/** Single-column text: one row per string, 14 pt apart, starting at `y`. */
export function stackedRows(x: number, y: number, texts: string[], pitch = 14): SynthRow[] {
  return texts.map((text, i) => [y + i * pitch, [[x, text]]])
}
