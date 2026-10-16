/**
 * Line-item table and printed totals. The table is located by its header row (Désignation /
 * Qté / PU HT / TVA / Montant HT…); every following row is cut into columns using the header's
 * x positions. Tables may repeat their header on each page, or continue on the next page
 * without it. Printed totals are read to cross-check the parsed lines.
 */
import { computeTotals, lineNet } from "../../domain/totals"
import type { PdfTextItem } from "../pdf/types"
import type { Collector } from "./collect"
import type { Cell, Layout, Row } from "./layout"
import {
  type DecimalStyle,
  fold,
  normalizeSpaces,
  parseNumber,
  parsePercent,
  parseQuantity,
  unitCodeFor,
} from "./text"

type ColumnKind =
  | "index"
  | "desc"
  | "ref"
  | "qty"
  | "unit"
  | "unitPrice"
  | "vat"
  | "total"
  | "discount"
  | "other"

interface Column {
  kind: ColumnKind
  x0: number
  x1: number
  label: string
}

const HEADER_VOCAB: Array<[RegExp, ColumnKind]> = [
  // Row-number column ("N° | Désignation | Qté…"): never a quantity.
  [/^(n°|n o|no\.?|num\.?|numero|pos\.?|position|poste|#|ligne|lig\.?|item no\.?)$/, "index"],
  [
    /^(designation|description|libelle|articles?|prestations?|produits?|intitule|details?|objet|services?|items?|nature|missions?)\b/,
    "desc",
  ],
  [/^(ref\.?|reference|code|sku|code article)$/, "ref"],
  [
    /^(qte|qt\.|qtes?|quantites?|quant\.?|qty|quantity|nb|nombre|nbre|duree|temps|heures|jours|hours|days|units)\b/,
    "qty",
  ],
  [/^(unite|unites|u\.?|unit)$/, "unit"],
  [/^(remise|rem\.|reduction|rabais|discount)/, "discount"],
  [
    /^(p\.?\s?u\.?|prix unit|prix u\b|prix\b(?!\s*total)|tarif|taux horaire|taux journalier|tjm|unit price|price|rate|daily rate|hourly rate|cout unitaire|montant unitaire)/,
    "unitPrice",
  ],
  [/^(tva|taux tva|taux de tva|% tva|taux|vat)\b/, "vat"],
  [/^(total|montant|mt\b|net|prix total|amount|sous-total)/, "total"],
]

/**
 * Rows that belong to the totals or VAT-summary area even when their first cell is not a totals
 * label ("Taux | Base HT | Montant TVA" summary header, "20 % | 813,00 | 162,60" rows read as
 * columns of the item table).
 */
const SUMMARY_ROW_RE =
  /\b(base (h\.?t\.?|imposable|hors tax\w*)|montant (de (la )?)?tva|total (h\.?t\.?|ttc|tva)|net a payer)\b/
/** Intermediate totals inside the table ("Sous-total LOT 1"): skipped, the table goes on. */
const SUBTOTAL_RE = /^(sous-total|sous total|subtotal|total (du )?lot|total lot)\b/

const TOTALS_RE =
  /^(total|sous-total|sous total|montant (h\.?t|ttc|tva|total|net|a payer|du)|net a payer|reste a payer|base ht|tva\b|acompte|deja|solde|a payer|remise globale|escompte)/

const HT_RE =
  /^(total|montant|sous-total|sous total|net)\s*(net\s*)?(h\.?\s?t\.?|hors tax\w*)\b|^base ht\b|^total ht\b|^(total|subtotal) (excl\.?|excluding|before|net of) (vat|tax)/
const TVA_RE = /^(total|montant)\s*(de\s+(la\s+)?)?(tva|t\.v\.a)\b|^tva\s*:?$/
const TVA_RATE_RE = /^(?:tva|t\.v\.a\.?|vat)\s*\(?(?:a\s+)?(\d{1,2}(?:[.,]\d{1,2})?)\s?%/
const TTC_RE =
  /^(total|montant)\s*(t\.?\s?t\.?\s?c\.?|toutes taxes)\b|^ttc\b|^total (incl\.?|including) (vat|tax)/
const DUE_RE =
  /^(net a payer|total a payer|reste a payer|reste du|montant a payer|solde a (payer|regler)|montant du\b|a payer\b|solde du\b|montant a votre credit|total du\b|net a regler|amount due)/
const PREPAID_RE =
  /^(acomptes?|deja (regle|paye|verse|percu)|avance (versee|percue|recue)|montant deja (regle|paye|verse)|paiement recu|versement)\b/

export interface PrintedTotals {
  ht?: number
  tva?: number
  ttc?: number
  due?: number
  prepaid?: number
  vatRates: number[]
  cells: Record<string, Cell[]>
}

interface ParsedLine {
  name?: string
  description?: string
  quantity?: number
  unitCode?: string
  unitPrice?: number
  vatRate?: number
  total?: number
  hasDiscount: boolean
  /** Printed discount of the line: a percentage ("10 %") or an amount. */
  discount?: { percent?: number; amount?: number }
  /** The unit price column is labelled TTC: gross prices, not the net price the invoice needs. */
  grossPrice: boolean
  cells: Record<string, Cell[]>
  rowCells: Cell[]
}

function classifyHeader(text: string): ColumnKind | undefined {
  const f = fold(text)
  for (const [re, kind] of HEADER_VOCAB) if (re.test(f)) return kind
  return undefined
}

/** Header items merged into labels: words closer than half a font size belong together. */
/** True for the header row of a line-item table ("Désignation | Qté | PU HT | Montant"). */
export function isItemTableHeader(row: Row): boolean {
  return headerColumns(row) !== undefined
}

function headerColumns(row: Row): Column[] | undefined {
  const items = row.cells.flatMap((c) => c.items).sort((a, b) => a.x - b.x)
  const groups: PdfTextItem[][] = []
  for (const item of items) {
    const g = groups[groups.length - 1]
    const prev = g?.[g.length - 1]
    if (g && prev && item.x - (prev.x + prev.width) < 1.2 * Math.min(prev.fontSize, item.fontSize))
      g.push(item)
    else groups.push([item])
  }
  const cols: Column[] = []
  for (const g of groups) {
    const label = normalizeSpaces(g.map((i) => i.text).join(" "))
    const kind = classifyHeader(label)
    if (!kind) {
      if (/\d/.test(label)) return undefined
      cols.push({
        kind: "other",
        x0: Math.min(...g.map((i) => i.x)),
        x1: Math.max(...g.map((i) => i.x + i.width)),
        label,
      })
      continue
    }
    cols.push({
      kind,
      x0: Math.min(...g.map((i) => i.x)),
      x1: Math.max(...g.map((i) => i.x + i.width)),
      label,
    })
  }
  const kinds = cols.map((c) => c.kind)
  const known = kinds.filter((k) => k !== "other").length
  // "Désignation | Qté | PU | Montant" or the minimal "Description | Montant".
  const minimal = cols.length === 2 && known === 2
  if (!kinds.includes("desc") || (known < 3 && !minimal) || known < cols.length - 1)
    return undefined
  if (!kinds.includes("total") && !kinds.includes("unitPrice")) return undefined
  return cols
}

/**
 * Column of a numeric item from the header geometry. Numbers are usually right-aligned under a
 * left-aligned, centred or right-aligned header: whatever the alignment, the number's RIGHT edge
 * lies between its header's left edge and the next header's left edge. A number ending before the
 * first header starts is a row number printed without a header: no column.
 */
function numericColumnFor(item: PdfTextItem, cols: Column[]): Column | undefined {
  const right = item.x + item.width
  const tolerance = 0.3 * item.fontSize
  let found: Column | undefined
  for (const col of cols) if (col.x0 <= right + tolerance) found = col
  if (!found) return undefined
  // A long left-aligned number overflowing into the next header: its left edge decides.
  const index = cols.indexOf(found)
  const prev = cols[index - 1]
  if (
    prev &&
    prev.kind !== "desc" &&
    prev.kind !== "index" &&
    item.x < prev.x1 &&
    item.x < found.x0 - item.width / 2
  )
    return prev
  return found
}

function columnFor(item: PdfTextItem, cols: Column[], style: DecimalStyle): Column | undefined {
  const isNumeric =
    /\d/.test(item.text) &&
    (parseNumber(item.text.replace(/%/, ""), style) !== undefined ||
      parseQuantity(item.text, style) !== undefined)
  const desc = cols.find((c) => c.kind === "desc")
  const center = item.x + item.width / 2
  if (!isNumeric && desc) {
    // Text starting in the description column belongs to it, even when it overflows rightwards.
    const index = cols.indexOf(desc)
    const prev = cols[index - 1]
    const next = cols[index + 1]
    const lo = prev ? (prev.x1 + desc.x0) / 2 : Number.NEGATIVE_INFINITY
    const hi = next ? (desc.x1 + next.x0) / 2 : Number.POSITIVE_INFINITY
    if (item.x >= lo && item.x < hi) return desc
  }
  if (isNumeric) return numericColumnFor(item, cols)
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i]
    if (!col) continue
    const prev = cols[i - 1]
    const next = cols[i + 1]
    const lo = prev ? (prev.x1 + col.x0) / 2 : Number.NEGATIVE_INFINITY
    const hi = next ? (col.x1 + next.x0) / 2 : Number.POSITIVE_INFINITY
    if (center >= lo && center < hi) return col
  }
  return undefined
}

function rowColumns(
  row: Row,
  cols: Column[],
  style: DecimalStyle,
): Map<ColumnKind, { text: string; cells: Cell[] }> {
  const out = new Map<ColumnKind, { text: string; cells: Cell[]; items: PdfTextItem[] }>()
  for (const cell of row.cells) {
    // A wrapped description sentence overflows the description column: a cell that starts in it
    // and does not end with a number is text only, whatever columns its later words fall under.
    const firstItem = cell.items[0]
    const wholeDesc =
      firstItem !== undefined &&
      columnFor(firstItem, cols, style)?.kind === "desc" &&
      !/\d\s*%?$/.test(cell.text)
    for (const item of cell.items) {
      const col = wholeDesc ? cols.find((c) => c.kind === "desc") : columnFor(item, cols, style)
      if (!col) continue
      const entry = out.get(col.kind) ?? { text: "", cells: [], items: [] }
      entry.items.push(item)
      if (!entry.cells.includes(cell)) entry.cells.push(cell)
      out.set(col.kind, entry)
    }
  }
  const result = new Map<ColumnKind, { text: string; cells: Cell[] }>()
  for (const [kind, entry] of out) {
    const items = entry.items.sort((a, b) => a.x - b.x)
    let text = ""
    let prev: PdfTextItem | undefined
    for (const item of items) {
      if (prev && item.x - (prev.x + prev.width) > 0.17 * Math.min(prev.fontSize, item.fontSize))
        text += " "
      text += item.text
      prev = item
    }
    result.set(kind, { text: normalizeSpaces(text), cells: entry.cells })
  }
  return result
}

function parseRow(
  row: Row,
  cols: Column[],
  style: DecimalStyle,
  qtyUnitHint: string | undefined,
): ParsedLine | "continuation" | "end" | "subtotal" {
  const first = row.cells[0]
  if (row.cells.some((c) => SUBTOTAL_RE.test(c.folded))) return "subtotal"
  if (first && TOTALS_RE.test(first.folded) && row.cells.length <= 3) return "end"
  if (SUMMARY_ROW_RE.test(fold(row.text))) return "end"
  const values = rowColumns(row, cols, style)
  const num = (kind: ColumnKind) => {
    const v = values.get(kind)
    return v ? parseNumber(v.text, style) : undefined
  }
  const unitPrice = num("unitPrice")
  const total = num("total")
  const qtyText = values.get("qty")?.text
  const qty = qtyText ? parseQuantity(qtyText, style) : undefined
  const desc = values.get("desc")?.text
  if (unitPrice === undefined && total === undefined) {
    const onlyDesc = [...values.keys()].every((k) => k === "desc")
    return desc && onlyDesc ? "continuation" : "end"
  }
  const vatText = values.get("vat")?.text
  const unitText = values.get("unit")?.text
  const cells: Record<string, Cell[]> = {}
  for (const [kind, v] of values) cells[kind] = v.cells
  return {
    name: desc,
    quantity: qty?.quantity,
    unitCode:
      qty?.unitCode ??
      (unitText ? unitCodeFor(unitText) : undefined) ??
      (qty ? qtyUnitHint : undefined),
    unitPrice,
    vatRate: vatText
      ? parsePercent(vatText.includes("%") ? vatText : `${vatText} %`, style)
      : undefined,
    total,
    hasDiscount: values.has("discount"),
    discount: readDiscount(values.get("discount")?.text, style),
    grossPrice: false,
    cells,
    rowCells: row.cells,
  }
}

function readDiscount(
  text: string | undefined,
  style: DecimalStyle,
): ParsedLine["discount"] | undefined {
  if (!text) return undefined
  if (text.includes("%")) {
    const percent = parsePercent(text, style)
    return percent !== undefined && percent > 0 && percent < 100 ? { percent } : undefined
  }
  const amount = parseNumber(text, style)
  return amount !== undefined && amount !== 0 ? { amount: Math.abs(amount) } : undefined
}

function findTable(layout: Layout, style: DecimalStyle): ParsedLine[] {
  const lines: ParsedLine[] = []
  let grossPrice = false
  let cols: Column[] | undefined
  let qtyUnitHint: string | undefined
  let open = false
  /** Table still open at a page break: wait for the first item row of the next page. */
  let awaitingPage = 0
  let last: { line: ParsedLine; row: Row } | undefined
  for (const row of layout.rows) {
    const header = headerColumns(row)
    if (header) {
      cols = header
      grossPrice = /\bttc\b/.test(fold(header.find((c) => c.kind === "unitPrice")?.label ?? ""))
      const qtyLabel = fold(header.find((c) => c.kind === "qty")?.label ?? "")
      qtyUnitHint = /heure|hour/.test(qtyLabel)
        ? "HUR"
        : /jour|day/.test(qtyLabel)
          ? "DAY"
          : undefined
      open = true
      awaitingPage = 0
      last = undefined
      continue
    }
    if (!cols || !open) continue
    if (last && row.page !== last.row.page && awaitingPage !== row.page) {
      awaitingPage = row.page
    }
    const pageHeight = layout.pageHeights[row.page - 1] ?? 842
    const inFooter = row.y > 0.9 * pageHeight || /^page\s*\d/.test(row.cells[0]?.folded ?? "")
    const parsed = parseRow(row, cols, style, qtyUnitHint)
    if (awaitingPage === row.page) {
      // Top of a continuation page: skip letterhead rows until the first item row.
      if (typeof parsed === "object" && parsed.name) awaitingPage = 0
      else if (parsed === "end" && TOTALS_RE.test(row.cells[0]?.folded ?? "")) {
        open = false
        continue
      } else continue
    }
    if (parsed === "subtotal") continue
    // Page footers are skipped, except a wrapped description row glued to the last item row.
    const glued =
      parsed === "continuation" &&
      last !== undefined &&
      last.row.page === row.page &&
      row.y - last.row.y1 <= 1.0 * (row.cells[0]?.fontSize ?? 10)
    if (inFooter && typeof parsed !== "object" && !glued) continue
    if (parsed === "end") {
      open = false
      continue
    }
    if (parsed === "continuation") {
      const fontSize = row.cells[0]?.fontSize ?? 10
      if (last && last.row.page === row.page && row.y - last.row.y1 <= 1.0 * fontSize) {
        const text = row.cells.map((c) => c.text).join(" ")
        last.line.description = last.line.description ? `${last.line.description} ${text}` : text
        last.line.cells.description = [...(last.line.cells.description ?? []), ...row.cells]
        last = { line: last.line, row }
      } else if (last && last.row.page === row.page && row.y - last.row.y1 > 2.5 * fontSize) {
        // A section heading inside the table ("LOT 2 - Menuiseries") is followed by item rows;
        // any other far text row ends the table.
        const next = layout.rows[row.index + 1]
        const nextParsed = next ? parseRow(next, cols, style, qtyUnitHint) : "end"
        const sectionHeading =
          typeof nextParsed === "object" &&
          nextParsed.quantity !== undefined &&
          nextParsed.total !== undefined
        if (!sectionHeading) open = false
      }
      continue
    }
    parsed.grossPrice = grossPrice
    lines.push(parsed)
    last = { line: parsed, row }
  }
  return lines
}

const AMOUNT_TAIL_RE = /^(.*?)[\s:]+(\(?[-\u2212]?\s?(?:€\s?)?\d[\d\s.,]*(?:\s?(?:€|EUR))?\)?)$/

/**
 * Amount printed at the right of a label but on a slightly different baseline (table cells
 * vertically centred next to a wrapped label).
 */
function amountBeside(layout: Layout, row: Row, cell: Cell, style: DecimalStyle): Cell | undefined {
  for (let r = row.index - 2; r <= row.index + 2; r++) {
    const other = layout.rows[r]
    if (!other || r === row.index || other.page !== row.page) continue
    if (Math.abs(other.y - row.y) > 0.9 * cell.fontSize) continue
    const candidate = other.cells.find(
      (c) => c.x0 > cell.x1 && parseNumber(c.text, style) !== undefined,
    )
    if (candidate && other.cells.every((c) => c === candidate || c.x1 < cell.x0)) return candidate
  }
  return undefined
}

export function readPrintedTotals(layout: Layout, style: DecimalStyle): PrintedTotals {
  const totals: PrintedTotals = { vatRates: [], cells: {} }
  const set = (key: "ht" | "tva" | "ttc" | "due" | "prepaid", value: number, cells: Cell[]) => {
    if (totals[key] === undefined) {
      totals[key] = value
      totals.cells[key] = cells
    }
  }
  for (const row of layout.rows) {
    for (let c = 0; c < row.cells.length; c++) {
      const cell = row.cells[c]
      if (!cell) continue
      // "Label   amount" in two cells, or "Label : amount" in one.
      let label = cell.folded
      let amount: number | undefined
      let cells: Cell[] = [cell]
      const inline = AMOUNT_TAIL_RE.exec(cell.text)
      const inlineAmount = inline?.[2] ? parseNumber(inline[2], style) : undefined
      if (inline?.[1] && inlineAmount !== undefined && /\p{L}/u.test(inline[1])) {
        label = fold(inline[1])
        amount = inlineAmount
      } else {
        const next = row.cells[c + 1] ?? amountBeside(layout, row, cell, style)
        if (!next) continue
        amount = parseNumber(next.text, style)
        cells = [cell, next]
      }
      if (amount === undefined) continue
      if (!/\p{L}/u.test(label)) continue
      const rate = TVA_RATE_RE.exec(label)
      if (rate?.[1]) {
        const r = parseNumber(rate[1], "comma")
        if (r !== undefined && !totals.vatRates.includes(r)) totals.vatRates.push(r)
        continue
      }
      if (HT_RE.test(label)) set("ht", amount, cells)
      else if (TVA_RE.test(label)) set("tva", amount, cells)
      else if (TTC_RE.test(label)) set("ttc", amount, cells)
      else if (DUE_RE.test(label)) set("due", amount, cells)
      else if (PREPAID_RE.test(label)) {
        // "Acompte versé (30 %) | 1 | -1 440,00 | …" is an item row, not the prepaid total: the
        // amount of a totals row is the last cell of its row.
        const amountCell = cells[cells.length - 1]
        if (amountCell === row.cells[row.cells.length - 1] || cells.length === 1)
          set("prepaid", amount, cells)
      }
    }
  }
  return totals
}

const fmt = (n: number) =>
  `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u00a0\u202f]/g, " ")} €`

export function extractLines(
  layout: Layout,
  collector: Collector,
  style: DecimalStyle,
  context: { isCreditNote: boolean; exemptCategory?: string; exemptReason?: string },
): void {
  const parsed = findTable(layout, style)
  if (parsed.some((p) => p.grossPrice)) {
    collector.warn("Les prix du tableau semblent TTC : vérifiez les prix unitaires hors taxes.")
  }
  const printed = readPrintedTotals(layout, style)
  const sign = (n: number | undefined) =>
    n === undefined ? undefined : context.isCreditNote ? Math.abs(n) : n
  const abs = (n: number | undefined) => (n === undefined ? undefined : Math.abs(n))

  if (printed.prepaid !== undefined) {
    const prepaid = Math.abs(printed.prepaid)
    const ttc = abs(printed.ttc)
    const due = abs(printed.due)
    const confirmed =
      ttc !== undefined && due !== undefined && Math.abs(ttc - prepaid - due) < 0.005
    collector.add(
      "prepaidAmount",
      prepaid,
      confirmed ? 0.93 : 0.72,
      printed.cells.prepaid ?? [],
      "prepaid-label",
    )
  }

  if (parsed.length === 0) {
    if (layout.rows.length > 0)
      collector.warn("Aucun tableau de lignes reconnu : saisissez les lignes de la facture.")
    return
  }

  // Draft lines with sign normalisation.
  const draftLines = parsed.map((p) => {
    let quantity = sign(p.quantity)
    let unitPrice = sign(p.unitPrice)
    let qtyGuessed = false
    const total = sign(p.total)
    if (!context.isCreditNote && unitPrice !== undefined && unitPrice < 0) {
      // BR-27: a unit price is never negative; carry the sign on the quantity.
      unitPrice = -unitPrice
      quantity = quantity === undefined ? undefined : -Math.abs(quantity)
    }
    if (
      quantity === undefined &&
      unitPrice !== undefined &&
      total !== undefined &&
      Math.abs(unitPrice - total) < 0.005
    ) {
      // Guess: nothing on the row says how many units were sold.
      quantity = 1
      qtyGuessed = true
    }
    // No per-line discount in the invoice model: the net unit price after the printed discount
    // is what it needs. Kept only when the printed line total confirms it.
    let discountNet: "confirmed" | "unconfirmed" | undefined
    const d = p.discount
    if (d && unitPrice !== undefined && quantity !== undefined && quantity !== 0) {
      const net =
        d.percent !== undefined
          ? Math.round(unitPrice * (100 - d.percent)) / 100
          : Math.round((unitPrice - (d.amount ?? 0) / Math.abs(quantity)) * 100) / 100
      const confirmed =
        total !== undefined && Math.abs(lineNet({ quantity, unitPrice: net }) - total) < 0.015
      discountNet = confirmed ? "confirmed" : "unconfirmed"
      unitPrice = net
    }
    let implicit = false
    if (quantity === undefined && unitPrice === undefined && total !== undefined && !p.cells.qty) {
      // Amount-only table: one unit at the line amount (a negative amount is a negative quantity).
      quantity = total < 0 ? -1 : 1
      unitPrice = Math.abs(total)
      implicit = true
      qtyGuessed = true
    }
    if (
      unitPrice === undefined &&
      quantity !== undefined &&
      quantity !== 0 &&
      total !== undefined
    ) {
      const derived = Math.round((total / quantity) * 100) / 100
      if (Math.abs(lineNet({ quantity, unitPrice: derived }) - total) < 0.005) unitPrice = derived
    }
    return { p, quantity, unitPrice, total, implicit, qtyGuessed, discountNet }
  })

  const singleRate =
    printed.vatRates.length === 1 && !parsed.some((p) => p.vatRate !== undefined)
      ? printed.vatRates[0]
      : undefined

  const computed = computeTotals({
    lines: draftLines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      vatCategory: context.exemptCategory === "E" ? "E" : "S",
      vatRate: l.p.vatRate ?? singleRate ?? 0,
    })),
  })
  const printedHt = printed.ht !== undefined ? Math.abs(printed.ht) : undefined
  const htMatches = printedHt !== undefined && Math.abs(computed.lineTotal - printedHt) < 0.005
  const allLinesCheck = draftLines.every(
    (l) =>
      l.total !== undefined &&
      l.quantity !== undefined &&
      l.unitPrice !== undefined &&
      Math.abs(lineNet({ quantity: l.quantity, unitPrice: l.unitPrice }) - l.total) < 0.005,
  )
  if (printedHt !== undefined && !htMatches) {
    collector.warn(
      `Le total calculé (${fmt(computed.lineTotal)}) diffère du total du PDF (${fmt(printedHt)}) : vérifiez les lignes.`,
    )
  }
  const printedTva = printed.tva !== undefined ? Math.abs(printed.tva) : undefined
  const tvaMatches = printedTva !== undefined && Math.abs(computed.taxTotal - printedTva) < 0.005

  draftLines.forEach((l, i) => {
    const p = l.p
    const lineOk =
      l.total !== undefined &&
      l.quantity !== undefined &&
      l.unitPrice !== undefined &&
      Math.abs(lineNet({ quantity: l.quantity, unitPrice: l.unitPrice }) - l.total) <
        (l.discountNet === "confirmed" ? 0.015 : 0.005)
    // Structure (header columns) gives 0.75; arithmetic on the line and on the whole table confirms.
    let base = p.grossPrice ? 0.5 : 0.75
    if (lineOk) base += 0.1
    if (htMatches) base += 0.08
    if (!lineOk && l.total !== undefined && !p.hasDiscount) base -= 0.15
    if (printedHt !== undefined && !htMatches) base = Math.min(base, 0.62)
    if (p.grossPrice) base = Math.min(base, 0.5)
    if (l.implicit) base -= 0.12
    // Quantity 1 and price = line total is a guess when no quantity was read: never pre-filled.
    const qtyConfidence = l.qtyGuessed ? Math.min(base, 0.5) : base
    const priceConfidence =
      l.discountNet === "unconfirmed" || l.qtyGuessed ? Math.min(base, 0.5) : base
    const at = (k: string) => [...(p.cells[k] ?? [])]
    const path = `lines.${i}`
    collector.add(`${path}.name`, p.name, base, at("desc"), "table-row")
    if (p.description)
      collector.add(
        `${path}.description`,
        p.description,
        0.66,
        at("description"),
        "table-row-second-line",
      )
    collector.add(
      `${path}.quantity`,
      l.quantity,
      qtyConfidence,
      at("qty"),
      l.qtyGuessed ? "table-row-quantity-assumed" : "table-row",
    )
    collector.add(
      `${path}.unitPrice`,
      l.unitPrice,
      priceConfidence,
      at("unitPrice").length ? at("unitPrice") : at("total"),
      l.discountNet ? "table-row-net-of-discount" : "table-row",
    )
    if (p.unitCode) {
      const explicit =
        p.quantity !== undefined && /\p{L}/u.test(p.cells.qty?.map((c) => c.text).join(" ") ?? "")
      collector.add(
        `${path}.unitCode`,
        p.unitCode,
        explicit || p.cells.unit ? 0.85 : 0.7,
        at("qty").concat(at("unit")),
        "table-unit",
      )
    } else if (l.quantity !== undefined) {
      // No unit column: "unité" is only a guess, offered below the pre-fill threshold (the form
      // already defaults to it).
      collector.add(`${path}.unitCode`, "C62", 0.5, at("qty"), "table-unit-default")
    }
    if (context.exemptCategory) {
      collector.add(
        `${path}.vatCategory`,
        context.exemptCategory,
        0.88,
        at("desc"),
        "vat-exemption-mention",
        context.exemptReason,
      )
      collector.add(
        `${path}.vatRate`,
        0,
        0.88,
        at("desc"),
        "vat-exemption-mention",
        context.exemptReason,
      )
    } else if (p.vatRate !== undefined) {
      collector.add(
        `${path}.vatRate`,
        p.vatRate,
        tvaMatches || allLinesCheck ? 0.92 : 0.82,
        at("vat"),
        "table-vat-column",
      )
      if (p.vatRate > 0)
        collector.add(`${path}.vatCategory`, "S", 0.88, at("vat"), "table-vat-column")
    } else if (singleRate !== undefined) {
      collector.add(
        `${path}.vatRate`,
        singleRate,
        tvaMatches ? 0.85 : 0.7,
        printed.cells.tva ?? [],
        "vat-single-rate",
      )
      if (singleRate > 0)
        collector.add(
          `${path}.vatCategory`,
          "S",
          tvaMatches ? 0.85 : 0.7,
          printed.cells.tva ?? [],
          "vat-single-rate",
        )
    }
  })
}
