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

type ColumnKind = "desc" | "qty" | "unit" | "unitPrice" | "vat" | "total" | "discount" | "other"

interface Column {
  kind: ColumnKind
  x0: number
  x1: number
  label: string
}

const HEADER_VOCAB: Array<[RegExp, ColumnKind]> = [
  [
    /^(designation|description|libelle|articles?|prestations?|produits?|intitule|details?|objet|services?|items?|nature|missions?)\b/,
    "desc",
  ],
  [/^(qte|qt\.|qtes?|quantites?|quant\.?|qty|nb|nombre|nbre|duree|temps|heures|jours)\b/, "qty"],
  [/^(unite|unites|u\.?|unit)$/, "unit"],
  [/^(remise|rem\.|reduction|rabais|discount)/, "discount"],
  [
    /^(p\.?\s?u\.?|prix unit|prix u\b|prix\b(?!\s*total)|tarif|taux horaire|unit price|cout unitaire|montant unitaire)/,
    "unitPrice",
  ],
  [/^(tva|taux tva|taux de tva|% tva|taux|vat)\b/, "vat"],
  [/^(total|montant|mt\b|net|prix total|amount|sous-total)/, "total"],
]

const TOTALS_RE =
  /^(total|sous-total|sous total|montant (h\.?t|ttc|tva|total|net|a payer|du)|net a payer|reste a payer|base ht|tva\b|acompte|deja|solde|a payer|remise globale|escompte)/

const HT_RE =
  /^(total|montant|sous-total|sous total|net)\s*(net\s*)?(h\.?\s?t\.?|hors tax\w*)\b|^base ht\b|^total ht\b/
const TVA_RE = /^(total|montant)\s*(de\s+(la\s+)?)?(tva|t\.v\.a)\b|^tva\s*:?$/
const TVA_RATE_RE = /^(?:tva|t\.v\.a\.?)\s*(?:a\s+)?(\d{1,2}(?:[.,]\d{1,2})?)\s?%/
const TTC_RE = /^(total|montant)\s*(t\.?\s?t\.?\s?c\.?|toutes taxes)\b|^ttc\b/
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
  cells: Record<string, Cell[]>
  rowCells: Cell[]
}

function classifyHeader(text: string): ColumnKind | undefined {
  const f = fold(text)
  for (const [re, kind] of HEADER_VOCAB) if (re.test(f)) return kind
  return undefined
}

/** Header items merged into labels: words closer than half a font size belong together. */
function headerColumns(row: Row): Column[] | undefined {
  const items = row.cells.flatMap((c) => c.items).sort((a, b) => a.x - b.x)
  const groups: PdfTextItem[][] = []
  for (const item of items) {
    const g = groups[groups.length - 1]
    const prev = g?.[g.length - 1]
    if (g && prev && item.x - (prev.x + prev.width) < 0.6 * Math.min(prev.fontSize, item.fontSize))
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

function columnFor(item: PdfTextItem, cols: Column[], style: DecimalStyle): Column | undefined {
  const isNumeric =
    /\d/.test(item.text) && parseNumber(item.text.replace(/%/, ""), style) !== undefined
  const desc = cols.find((c) => c.kind === "desc")
  const center = item.x + item.width / 2
  if (!isNumeric && desc) {
    const next = cols[cols.indexOf(desc) + 1]
    if (item.x < (next ? (desc.x1 + next.x0) / 2 : Number.POSITIVE_INFINITY)) return desc
  }
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
    for (const item of cell.items) {
      const col = columnFor(item, cols, style)
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
): ParsedLine | "continuation" | "end" {
  const first = row.cells[0]
  if (first && TOTALS_RE.test(first.folded) && row.cells.length <= 3) return "end"
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
    cells,
    rowCells: row.cells,
  }
}

function findTable(layout: Layout, style: DecimalStyle): ParsedLine[] {
  const lines: ParsedLine[] = []
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
      const qtyLabel = fold(header.find((c) => c.kind === "qty")?.label ?? "")
      qtyUnitHint = /heure/.test(qtyLabel) ? "HUR" : /jour/.test(qtyLabel) ? "DAY" : undefined
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
    if (inFooter && typeof parsed !== "object") continue
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
        open = false
      }
      continue
    }
    lines.push(parsed)
    last = { line: parsed, row }
  }
  return lines
}

const AMOUNT_TAIL_RE = /^(.*?)[\s:]+(\(?[-\u2212]?\s?(?:€\s?)?\d[\d\s.,]*(?:\s?(?:€|EUR))?\)?)$/

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
        const next = row.cells[c + 1]
        if (!next) continue
        amount = parseNumber(next.text, style)
        cells = [cell, next]
      }
      if (amount === undefined) continue
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
      else if (PREPAID_RE.test(label)) set("prepaid", amount, cells)
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
      quantity = 1
    }
    let implicit = false
    if (quantity === undefined && unitPrice === undefined && total !== undefined && !p.cells.qty) {
      // Amount-only table: one unit at the line amount.
      quantity = 1
      unitPrice = total
      implicit = true
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
    return { p, quantity, unitPrice, total, implicit }
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
      Math.abs(lineNet({ quantity: l.quantity, unitPrice: l.unitPrice }) - l.total) < 0.005
    // Structure (header columns) gives 0.75; arithmetic on the line and on the whole table confirms.
    let base = 0.75
    if (lineOk) base += 0.1
    if (htMatches) base += 0.08
    if (!lineOk && l.total !== undefined && !p.hasDiscount) base -= 0.15
    if (printedHt !== undefined && !htMatches) base = Math.min(base, 0.62)
    if (l.implicit) base -= 0.12
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
    collector.add(`${path}.quantity`, l.quantity, base, at("qty"), "table-row")
    collector.add(
      `${path}.unitPrice`,
      l.unitPrice,
      base,
      at("unitPrice").length ? at("unitPrice") : at("total"),
      "table-row",
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
      collector.add(`${path}.unitCode`, "C62", 0.6, at("qty"), "table-unit-default")
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
