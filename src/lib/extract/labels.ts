/**
 * Label → value lookup. French invoices print a value after its label on the same text run
 * ("Date : 15/10/2026"), in the next cell of the same row (two-column header), or right under
 * the label (header table with labels on one row and values on the next).
 */
import { type Cell, cellToTheRight, type Layout, type Part, partsOf } from "./layout"

export interface ValueMatch<T> {
  value: T
  /** Printed text of the value. */
  text: string
}

/** Reads a value at the START of a string. */
export type ValueReader<T> = (s: string) => ValueMatch<T> | undefined

export interface LabeledValue<T> {
  value: T
  text: string
  label: string
  labelCell: Cell
  valueCell: Cell
  placement: "inline" | "right" | "below"
}

const LEADING_PUNCT_RE = /^[\s:.\-–—=]+/

/** Same offset in `text` as `foldedLength` characters of its folded form (fold keeps length). */
function sliceAfter(part: Part, foldedLength: number): string {
  return part.text.length === part.folded.length
    ? part.text.slice(foldedLength)
    : part.folded.slice(foldedLength)
}

/**
 * Every place where `label` (a regex on folded text, anchored at the start of a cell part)
 * is followed by a value that `read` accepts.
 */
export function findLabeled<T>(
  layout: Layout,
  label: RegExp,
  read: ValueReader<T>,
): LabeledValue<T>[] {
  const out: LabeledValue<T>[] = []
  for (const cell of layout.cells) {
    const parts = partsOf(cell)
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p]
      if (!part) continue
      const m = label.exec(part.folded)
      if (m?.index !== 0) continue
      const labelText = part.text.slice(0, m[0].length)
      const rest = sliceAfter(part, m[0].length).replace(LEADING_PUNCT_RE, "")
      if (rest !== "") {
        const v = read(rest)
        if (v) {
          out.push({
            ...v,
            label: labelText,
            labelCell: cell,
            valueCell: cell,
            placement: "inline",
          })
        }
        continue
      }
      if (p !== parts.length - 1) continue
      const right = cellToTheRight(layout, cell)
      if (right && right.x0 - cell.x1 < 0.45 * (layout.pageWidths[cell.page - 1] ?? 600)) {
        const v = read(right.text.replace(LEADING_PUNCT_RE, ""))
        if (v) {
          out.push({
            ...v,
            label: labelText,
            labelCell: cell,
            valueCell: right,
            placement: "right",
          })
          continue
        }
      }
      const below = cellUnder(layout, cell)
      if (below) {
        const v = read(below.text.replace(LEADING_PUNCT_RE, ""))
        if (v)
          out.push({
            ...v,
            label: labelText,
            labelCell: cell,
            valueCell: below,
            placement: "below",
          })
      }
    }
  }
  return out
}

/** The cell on the next row that horizontally overlaps `cell` (value printed under its label). */
export function cellUnder(layout: Layout, cell: Cell): Cell | undefined {
  const row = layout.rows[cell.line]
  if (!row) return undefined
  for (let r = cell.line + 1; r < layout.rows.length && r <= cell.line + 2; r++) {
    const next = layout.rows[r]
    if (!next || next.page !== cell.page) return undefined
    if (next.y - row.y1 > 2.2 * cell.fontSize) return undefined
    const under = next.cells.find((c) => c.x0 < cell.x1 + 2 && c.x1 > cell.x0 - 2)
    if (under) return under
  }
  return undefined
}

// ---------------------------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------------------------

/** An invoice/order/reference identifier: one token with at least one digit. */
export const readReference: ValueReader<string> = (s) => {
  const m = s.match(/^(?:n°|no\.?|#)?\s*([A-Za-z0-9][A-Za-z0-9/_.-]*[A-Za-z0-9]|\d)(?=$|[\s,;])/u)
  const token = m?.[1]
  if (!token || !/\d/.test(token) || token.length > 32) return undefined
  return { value: token, text: m?.[0] ?? token }
}

/** Free text up to the end of the part (labels like "Référence client : Séminaire direction"). */
export const readFreeText: ValueReader<string> = (s) => {
  const t = s.trim()
  if (t === "" || t.length > 80) return undefined
  return { value: t, text: t }
}
