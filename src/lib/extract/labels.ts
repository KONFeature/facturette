/**
 * Label → value lookup. French invoices print a value after its label on the same text run
 * ("Date : 15/10/2026"), in the next cell of the same row (two-column header), or right under
 * the label (header table with labels on one row and values on the next).
 */
import { type Cell, cellToTheRight, type Layout, type Part, partsOf } from "./layout"
import { fold } from "./text"

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

/**
 * What may follow a matched label and still belong to it ("Date d'exigibilité du paiement",
 * "Date d'émission de la facture : 15/10/2026"), never part of the value.
 */
const LABEL_COMPLEMENT_RE =
  /^(du|de la|de l'|de|des)\s*(paiement|reglement|facture|document|avoir|piece)\b[\s:.\-–—=]*/

/** Same offset in `text` as `foldedLength` characters of its folded form (fold keeps length). */
function sliceAfter(part: Part, foldedLength: number): string {
  return part.text.length === part.folded.length
    ? part.text.slice(foldedLength)
    : part.folded.slice(foldedLength)
}

/**
 * Bilingual labels "Facture / Invoice No. 2026-FR-0031", "Due date / Échéance : 06/11/2026":
 * after a matched label, a "/ translation" (letters only, up to a colon or to the first token
 * holding a digit) is part of the label, never of the value.
 */
export function stripLabelGloss(rest: string): string {
  if (!rest.startsWith("/")) return rest
  const colon = /^\/[^:\d]{1,40}?:\s*/.exec(rest)
  if (colon) return rest.slice(colon[0].length)
  const words = /^\/(\s*[\p{L}.'#°º]+){1,4}\s*/u.exec(rest)
  return words ? rest.slice(words[0].length) : rest
}

/** "Facture / Invoice No. 2026": the second-language half as a part of its own. */
function glossVariant(part: Part): Part | undefined {
  const m = /^[^/\d:]{2,30}?\s+\/\s+(?=\p{L})/u.exec(part.text)
  if (!m) return undefined
  const text = part.text.slice(m[0].length)
  return { cell: part.cell, text, folded: part.folded.slice(m[0].length) }
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
      const original = parts[p]
      if (!original) continue
      let part = original
      let m = label.exec(part.folded)
      if (m?.index !== 0) {
        const variant = glossVariant(original)
        m = variant ? label.exec(variant.folded) : null
        if (!variant || m?.index !== 0) continue
        part = variant
      }
      let labelText = part.text.slice(0, m[0].length)
      let rest = stripLabelGloss(sliceAfter(part, m[0].length).replace(/^\s+/, "")).replace(
        LEADING_PUNCT_RE,
        "",
      )
      const restFolded = fold(rest)
      const complement = LABEL_COMPLEMENT_RE.exec(restFolded)?.[0]
      if (complement && restFolded.length === rest.length) {
        labelText = `${labelText} ${rest.slice(0, complement.length)}`.trim()
        rest = rest.slice(complement.length)
      }
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
  for (const pair of wrappedPairs(layout)) {
    const m = label.exec(pair.labelFolded)
    if (m?.index !== 0 || pair.labelFolded.slice(m[0].length).replace(/[\s:.]+/g, "") !== "")
      continue
    const v = read(pair.valueText.replace(LEADING_PUNCT_RE, ""))
    const labelCell = pair.labelCells[0]
    const valueCell = pair.valueCells[0]
    if (v && labelCell && valueCell) {
      out.push({ ...v, label: pair.labelText, labelCell, valueCell, placement: "right" })
    }
  }
  return out
}

/** A label (and maybe its value) wrapped over several rows of a narrow label column. */
interface WrappedPair {
  labelText: string
  labelFolded: string
  labelCells: Cell[]
  valueText: string
  valueCells: Cell[]
}

const wrappedCache = new WeakMap<Layout, WrappedPair[]>()

const centre = (c: Cell) => (c.y + c.y1) / 2

/**
 * Narrow label columns wrap labels: "Date / d'émission" on two rows with the value vertically
 * centred between them, or "Référence | Service" / "client | achats" with label and value
 * both wrapped row by row.
 */
export function wrappedPairs(layout: Layout): WrappedPair[] {
  const cached = wrappedCache.get(layout)
  if (cached) return cached
  const pairs: WrappedPair[] = []
  const maxGap = 0.45 * Math.max(...layout.pageWidths, 600)
  const rightOf = (c: Cell) => cellToTheRight(layout, c)
  /** Something printed on the value's row between the label's left edge and the value. */
  const blocked = (label: Cell, value: Cell) =>
    layout.rows[value.line]?.cells.some(
      (o) => o !== value && o.x1 > label.x0 - 2 && o.x0 < value.x0,
    ) ?? false
  // 1. Orphan label fragments (nothing on their right) grouped around an orphan value.
  const groups = new Map<Cell, Cell[]>()
  for (const label of layout.cells) {
    if (rightOf(label) || !/\p{L}/u.test(label.text) || label.text.length > 30) continue
    let best: Cell | undefined
    let bestDistance = Number.POSITIVE_INFINITY
    const nearby = layout.rows
      .slice(Math.max(0, label.line - 3), label.line + 4)
      .flatMap((r) => r.cells)
    for (const value of nearby) {
      if (value.page !== label.page || value.line === label.line || value.x0 <= label.x1) continue
      if (value.x0 - label.x1 > maxGap || blocked(label, value)) continue
      const distance = Math.abs(centre(value) - centre(label))
      if (distance <= 1.3 * label.fontSize && distance < bestDistance) {
        best = value
        bestDistance = distance
      }
    }
    if (best) groups.set(best, [...(groups.get(best) ?? []), label])
  }
  for (const [value, labels] of groups) {
    if (labels.length < 2) continue
    const sorted = [...labels].sort((a, b) => a.y - b.y)
    const labelText = sorted.map((c) => c.text).join(" ")
    pairs.push({
      labelText,
      labelFolded: fold(labelText),
      labelCells: sorted,
      valueText: value.text,
      valueCells: [value],
    })
  }
  // 2. Label and value both wrapped, row by row; the label continuation starts in lowercase.
  for (const block of layout.blocks) {
    for (let i = 0; i + 1 < block.length; i++) {
      const first = block[i]
      const next = block[i + 1]
      if (!first || !next || !/^\p{Ll}/u.test(next.text)) continue
      const v1 = rightOf(first)
      const v2 = rightOf(next)
      if (!v1 || !v2 || Math.abs(v1.x0 - v2.x0) > 4 || rightOf(v1) || rightOf(v2)) continue
      const labelText = `${first.text} ${next.text}`
      pairs.push({
        labelText,
        labelFolded: fold(labelText),
        labelCells: [first, next],
        valueText: `${v1.text} ${v2.text}`,
        valueCells: [v1, v2],
      })
    }
  }
  wrappedCache.set(layout, pairs)
  return pairs
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
