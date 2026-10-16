/** Shared types, formatting and builders of the second blind fixture set. All data is fictional. */
import type { Address, Invoice, InvoiceLine, Party, Seller } from "../../src/domain/invoice"
import { computeTotals, type InvoiceTotals } from "../../src/domain/totals"
import type { NumberStyle } from "../fixtures-templates/format"
import {
  makeFrenchIban,
  makeFrenchVat,
  makeSiren,
  makeSiret,
} from "../fixtures-templates/identifiers"

export type { NumberStyle }

/**
 * `dmy` 15/10/2026, `dmy-short` 15/10/26, `dot` 15.10.2026, `dash` 15-10-2026, `iso` 2026-10-15,
 * `slash-iso` 2026/10/15, `long` 15 octobre 2026 (1er), `abbr` 15 oct. 2026,
 * `weekday-long` lundi 5 octobre 2026.
 */
export type DateStyle2 =
  | "dmy"
  | "dmy-short"
  | "dot"
  | "dash"
  | "iso"
  | "slash-iso"
  | "long"
  | "abbr"
  | "weekday-long"

export interface Blind2Formats {
  date: DateStyle2
  number: NumberStyle
}

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
]
const MONTHS_ABBR = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
]
const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]

export function formatDate2(iso: string, style: DateStyle2): string {
  const [y = "", m = "", d = ""] = iso.split("-")
  const day = Number(d)
  const month = Number(m)
  switch (style) {
    case "iso":
      return iso
    case "slash-iso":
      return `${y}/${m}/${d}`
    case "dmy":
      return `${d}/${m}/${y}`
    case "dmy-short":
      return `${d}/${m}/${y.slice(2)}`
    case "dot":
      return `${d}.${m}.${y}`
    case "dash":
      return `${d}-${m}-${y}`
    case "long":
      return `${day === 1 ? "1er" : String(day)} ${MONTHS[month - 1]} ${y}`
    case "abbr":
      return `${day} ${MONTHS_ABBR[month - 1]} ${y}`
    case "weekday-long": {
      const wd = WEEKDAYS[new Date(Date.UTC(Number(y), month - 1, day)).getUTCDay()]
      return `${wd} ${day === 1 ? "1er" : String(day)} ${MONTHS[month - 1]} ${y}`
    }
  }
}

/** `decimals` undefined = shortest representation (quantities, rates, unit prices). */
export function formatNumber2(n: number, style: NumberStyle, decimals?: number): string {
  const abs = Math.abs(n)
  const raw = decimals === undefined ? String(abs) : abs.toFixed(decimals)
  const [int = "", frac] = raw.split(".")
  const grouped = style.thousands ? int.replace(/\B(?=(\d{3})+(?!\d))/g, style.thousands) : int
  const body = frac === undefined ? grouped : `${grouped}${style.decimal}${frac}`
  return n < 0 ? `-${body}` : body
}

export type TemplateId =
  | "odoo"
  | "memoire"
  | "noteHonoraires"
  | "situation"
  | "acompte"
  | "avoir"
  | "saas"
  | "utility"
  | "garage"
  | "repeatedHeader"
  | "plainGrid"
  | "shop"
  | "microRib"
  | "plumber"

export interface Blind2Extra {
  /** Print integer amounts without decimals ("1 200 €"). */
  trimZeros?: boolean
  /** Free-form strings some templates print (titles, subjects, periods…). */
  subject?: string
  periodText?: string
  watermark?: string
  /** Header labels of the long tables (page-break fixtures). */
  headerLabel?: string
  /** Rubber stamp text drawn over the page. */
  stamp?: string
  /** Situation invoice columns, one entry per line. */
  situation?: { market: number; pct: number; previous: number }[]
}

export interface Blind2Def {
  slug: string
  title: string
  /** Real-world tool or template this fixture imitates (README). */
  imitates: string
  description: string
  tags: string[]
  invoice: Invoice
  formats: Blind2Formats
  /** Expected paths that are NOT visible as text in the PDF. */
  hidden: string[]
  template: TemplateId
  /** True when the PDF must use non-embedded standard fonts. */
  nonEmbeddedFont: boolean
  extra: Blind2Extra
}

export interface Fmt {
  /** Amount with currency, per the document style (negative sign kept). */
  money: (n: number) => string
  /** Amount without currency symbol. */
  num: (n: number) => string
  qty: (n: number) => string
  /** Unit price: two decimals unless the price needs more. */
  unit: (n: number) => string
  date: (iso: string) => string
  /** Percent with the fixture's own spacing, e.g. "5,5 %" or "20%". */
  pct: (n: number, tight?: boolean) => string
}

export function makeFmt(f: Blind2Formats, trimZeros = false): Fmt {
  const num = (n: number) => formatNumber2(n, f.number, trimZeros && Number.isInteger(n) ? 0 : 2)
  return {
    num,
    money: (n) => {
      const s = num(n)
      if (f.number.currency === "prefix") return s.startsWith("-") ? `-€${s.slice(1)}` : `€${s}`
      if (f.number.currency === "code") return `${s} EUR`
      return `${s} €`
    },
    qty: (n) => formatNumber2(n, f.number),
    unit: (n) =>
      Math.abs(Math.round(n * 100) / 100 - n) < 1e-9 ? num(n) : formatNumber2(n, f.number),
    date: (iso) => formatDate2(iso, f.date),
    pct: (n, tight = false) => `${formatNumber2(n, f.number)}${tight ? "%" : " %"}`,
  }
}

export interface Ctx {
  def: Blind2Def
  inv: Invoice
  t: InvoiceTotals
  f: Fmt
}

export function makeCtx(def: Blind2Def): Ctx {
  return {
    def,
    inv: def.invoice,
    t: computeTotals(def.invoice),
    f: makeFmt(def.formats, def.extra.trimZeros),
  }
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

/** Short unit text printed after a quantity ("3 h", "2,5 j"). */
export function unitText(code: string): string {
  const map: Record<string, string> = {
    C62: "u",
    HUR: "h",
    DAY: "j",
    LS: "forfait",
    MON: "mois",
    MTK: "m²",
    MTR: "ml",
    KGM: "kg",
    LTR: "L",
    KWH: "kWh",
  }
  return map[code] ?? code
}

/** Gross (incl. VAT) amount of a single line through the shared arithmetic. */
export function lineGross(c: Ctx, index: number): number {
  const line = c.inv.lines[index]
  return line ? computeTotals({ lines: [line] }).grandTotal : 0
}

/** Standard-rated VAT groups, in breakdown order. */
export function vatRows(c: Ctx): { rate: number; base: number; tax: number }[] {
  return c.t.vatBreakdown
    .filter((v) => v.category === "S")
    .map((v) => ({ rate: v.rate, base: v.taxableAmount, tax: v.taxAmount }))
}

export const legalNoteList = (inv: Invoice): string[] =>
  [
    inv.legalNotes?.latePaymentPenalty,
    inv.legalNotes?.recoveryFee,
    inv.legalNotes?.earlyPaymentDiscount,
  ].filter((s): s is string => Boolean(s))

// --- data builders ------------------------------------------------------------------------------

export interface PartyInput {
  name: string
  base8: string
  nic: string
  address: Address
  vat?: boolean
  email?: string
  phone?: string
}

export function party(p: PartyInput): Party {
  const siren = makeSiren(p.base8)
  return {
    name: p.name,
    kind: "company",
    siren,
    siret: makeSiret(siren, p.nic),
    ...(p.vat === false ? {} : { vatNumber: makeFrenchVat(siren) }),
    address: p.address,
    ...(p.email ? { email: p.email } : {}),
    ...(p.phone ? { phone: p.phone } : {}),
  }
}

export function seller(
  p: PartyInput,
  legalForm: string,
  shareCapital: string | undefined,
  registration: string | undefined,
): Seller {
  return {
    ...party(p),
    legalForm,
    ...(shareCapital ? { shareCapital } : {}),
    ...(registration ? { registration } : {}),
  }
}

/** RCS text built from the seller SIREN, e.g. "RCS Dijon 531 826 475". */
export const rcs = (city: string, base8: string): string =>
  `RCS ${city} ${groupSiren(makeSiren(base8))}`

export function individual(name: string, address: Address): Party {
  return { name, kind: "individual", address }
}

export const addr = (line1: string, postalCode: string, city: string, line2?: string): Address => ({
  line1,
  ...(line2 ? { line2 } : {}),
  postalCode,
  city,
  countryCode: "FR",
})

export const line = (
  name: string,
  quantity: number,
  unitCode: string,
  unitPrice: number,
  vatRate = 20,
  description?: string,
): InvoiceLine => ({
  name,
  ...(description ? { description } : {}),
  quantity,
  unitCode,
  unitPrice,
  vatCategory: "S",
  vatRate,
})

export const ibanOf = (bank: string, branch: string, account: string) =>
  makeFrenchIban(bank, branch, account)
