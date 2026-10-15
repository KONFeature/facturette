/** Shared types and formatting helpers of the blind fixture set. All data is fictional. */
import type { Invoice } from "../../src/domain/invoice"
import { computeTotals, type InvoiceTotals } from "../../src/domain/totals"
import {
  type DateStyle,
  formatDate,
  formatNumber,
  type NumberStyle,
} from "../fixtures-templates/format"
import {
  makeFrenchIban,
  makeFrenchVat,
  makeSiren,
  makeSiret,
} from "../fixtures-templates/identifiers"

export interface BlindFormats {
  date: DateStyle
  number: NumberStyle
}

export type TemplateId =
  | "dolibarr"
  | "times"
  | "excel"
  | "letter"
  | "saas"
  | "footer"
  | "sections"
  | "bilingual"
  | "credit"
  | "quickbooks"
  | "freelance"
  | "long"
  | "buyerFirst"

export interface BlindExtra {
  /** Per-line discount percent (index = line index), for the "sections" template. */
  discounts?: number[]
  /** Section headings: first line index and title. */
  sections?: { from: number; title: string }[]
  /** Extra visible text paragraphs (letter template). */
  intro?: string
  outro?: string
  /** "Objet :" line. */
  subject?: string
  /** Long free-text description lines for the long template are in invoice lines. */
  label?: string
}

export interface BlindDef {
  slug: string
  title: string
  /** Real-world tool or template this fixture imitates (README). */
  imitates: string
  description: string
  tags: string[]
  invoice: Invoice
  formats: BlindFormats
  /** Expected paths that are NOT visible as text in the PDF. */
  hidden: string[]
  template: TemplateId
  /** True when the PDF must use non-embedded standard fonts. */
  nonEmbeddedFont: boolean
  extra: BlindExtra
}

export interface Fmt {
  money: (n: number) => string
  /** Money without currency symbol. */
  num: (n: number) => string
  qty: (n: number) => string
  qty2: (n: number) => string
  date: (iso: string) => string
  pct: (n: number) => string
}

export function makeFmt(f: BlindFormats): Fmt {
  const num = (n: number) => formatNumber(n, f.number, 2)
  return {
    num,
    money: (n) => {
      const s = num(n)
      if (f.number.currency === "prefix") return s.startsWith("-") ? `-€${s.slice(1)}` : `€${s}`
      if (f.number.currency === "code") return `${s} EUR`
      return `${s} €`
    },
    qty: (n) => formatNumber(n, f.number),
    qty2: (n) => formatNumber(n, f.number, 2),
    date: (iso) => formatDate(iso, f.date),
    pct: (n) => `${formatNumber(n, f.number)} %`,
  }
}

export interface Ctx {
  def: BlindDef
  inv: Invoice
  t: InvoiceTotals
  f: Fmt
}

export function makeCtx(def: BlindDef): Ctx {
  return { def, inv: def.invoice, t: computeTotals(def.invoice), f: makeFmt(def.formats) }
}

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const groupBy = (s: string, sizes: number[]): string => {
  const out: string[] = []
  let i = 0
  for (const n of sizes) {
    out.push(s.slice(i, i + n))
    i += n
  }
  if (i < s.length) out.push(s.slice(i))
  return out.join(" ")
}
export const groupSiren = (s: string): string => groupBy(s, [3, 3, 3])
export const groupSiret = (s: string): string => groupBy(s, [3, 3, 3, 5])
export const groupIban = (s: string): string => s.replace(/(.{4})/g, "$1 ").trim()

export function unitLabel(code: string, long = false): string {
  const short: Record<string, string> = {
    C62: "u",
    HUR: "h",
    DAY: "j",
    LS: "forfait",
    MON: "mois",
    MTK: "m²",
    MTR: "m",
    KGM: "kg",
    LTR: "L",
  }
  const longer: Record<string, string> = {
    C62: "unité",
    HUR: "heure",
    DAY: "jour",
    LS: "forfait",
    MON: "mois",
    MTK: "m²",
    MTR: "ml",
    KGM: "kg",
    LTR: "litre",
  }
  return (long ? longer : short)[code] ?? code
}

/** Net amount of a single line including VAT, through the shared arithmetic. */
export function lineGross(c: Ctx, index: number): number {
  const line = c.inv.lines[index]
  if (!line) return 0
  return computeTotals({ lines: [line] }).grandTotal
}

export { makeFrenchIban, makeFrenchVat, makeSiren, makeSiret }

/** Distinct VAT rates of standard lines, descending, with their tax amounts. */
export function vatRows(c: Ctx): { rate: number; base: number; tax: number }[] {
  return c.t.vatBreakdown
    .filter((v) => v.category === "S")
    .map((v) => ({ rate: v.rate, base: v.taxableAmount, tax: v.taxAmount }))
}
