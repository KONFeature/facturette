/**
 * Low-level text helpers for French invoices: whitespace/ligature normalisation, number, date,
 * percentage and unit parsing. Pure, no dependency on the PDF layout.
 */

/** NBSP, narrow NBSP, thin spaces and friends become a plain space; ligatures are expanded. */
export function normalizeSpaces(s: string): string {
  return s
    .replace(/[\u00a0\u202f\u2007\u2009\u200a\u2002\u2003\u2004\u2005\u2006]/g, " ")
    .replace(/\ufb01/g, "fi")
    .replace(/\ufb02/g, "fl")
    .replace(/\ufb00/g, "ff")
    .replace(/\ufb03/g, "ffi")
    .replace(/\ufb04/g, "ffl")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[ \t]+/g, " ")
    .trim()
}

/** Lowercase, accent-free form used to match labels ("Échéance" → "echeance"). */
export function fold(s: string): string {
  return normalizeSpaces(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

export type DecimalStyle = "comma" | "dot"

/**
 * Which decimal separator the document uses for money, from the amounts it prints
 * ("1 234,56" → comma, "1234.56" → dot). Defaults to comma (French).
 */
export function detectDecimalStyle(text: string): DecimalStyle {
  const t = normalizeSpaces(text)
  const comma = (t.match(/\d,\d{2}(?!\d)/g) ?? []).length
  const dot = (t.match(/\d\.\d{2}(?!\d)/g) ?? []).length
  return dot > comma ? "dot" : "comma"
}

const CURRENCY_RE = /€|\bEUR\b|\beuros?\b/gi

/** Pattern of one amount-like token inside a longer string (used to find candidates). */
export const AMOUNT_TOKEN_RE =
  /(?:\(\s*)?[-\u2212]?\s?(?:€\s?)?\d{1,3}(?:[ .,]\d{3})*(?:[.,]\d+)?(?:\s?(?:€|EUR|euros?))?(?:\s*\))?|[-\u2212]?\d+(?:[.,]\d+)?/gi

/**
 * Parse a French or English formatted number. Accepts "1 234,56", "1.234,56", "1234.56",
 * "1,234.56", "€ 1 234,56", "1234.56 EUR", "-380,00 €", "(380,00)", "−12". Returns undefined
 * unless the whole string (minus currency and spaces) is a number.
 */
export function parseNumber(raw: string, style: DecimalStyle = "comma"): number | undefined {
  let s = normalizeSpaces(raw).replace(CURRENCY_RE, "").trim()
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1).trim()
  }
  if (/^[-\u2212]/.test(s)) {
    negative = !negative
    s = s.slice(1).trim()
  } else if (/^\+/.test(s)) {
    s = s.slice(1).trim()
  } else if (/[-\u2212]$/.test(s)) {
    negative = !negative
    s = s.slice(0, -1).trim()
  }
  s = s.replace(CURRENCY_RE, "").trim()
  if (!/^\d[\d .,]*$/.test(s) || /[ .,]$/.test(s)) return undefined
  // Spaces are only ever thousands separators, in groups of three.
  if (s.includes(" ")) {
    if (!/^\d{1,3}( \d{3})+([.,]\d+)?$/.test(s)) return undefined
    s = s.replace(/ /g, "")
  }
  const lastComma = s.lastIndexOf(",")
  const lastDot = s.lastIndexOf(".")
  let normalized: string
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : "."
    const thousands = decimal === "," ? "." : ","
    const [intPart = "", fracPart = ""] = s.split(decimal)
    if (s.split(decimal).length !== 2) return undefined
    if (!new RegExp(`^\\d{1,3}(\\${thousands}\\d{3})*$`).test(intPart)) return undefined
    normalized = `${intPart.split(thousands).join("")}.${fracPart}`
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : "."
    const groups = s.split(sep)
    if (groups.length > 2) {
      if (!groups.slice(1).every((g) => g.length === 3)) return undefined
      normalized = groups.join("")
    } else {
      const [intPart = "", frac = ""] = groups
      const separatorIsDecimal =
        frac.length !== 3 || (sep === "," ? style === "comma" : style === "dot")
      normalized = separatorIsDecimal ? `${intPart}.${frac}` : `${intPart}${frac}`
    }
  } else {
    normalized = s
  }
  const n = Number(normalized)
  if (!Number.isFinite(n)) return undefined
  return negative ? -n : n
}

/** "20 %", "5,5%", "20.00 %", "TVA 20%". Returns the percentage (20, 5.5). */
export function parsePercent(raw: string, style: DecimalStyle = "comma"): number | undefined {
  const m = normalizeSpaces(raw).match(/^(\d{1,2}(?:[.,]\d{1,3})?)\s?%$/)
  if (!m?.[1]) return undefined
  const n = parseNumber(m[1], style === "dot" && m[1].includes(".") ? "dot" : "comma")
  return n !== undefined && n >= 0 && n < 100 ? n : undefined
}

const MONTHS: Record<string, number> = {
  janvier: 1,
  janv: 1,
  jan: 1,
  fevrier: 2,
  fevr: 2,
  fev: 2,
  mars: 3,
  mar: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  aout: 8,
  septembre: 9,
  sept: 9,
  sep: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12,
}

function isoDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1) return undefined
  if (date.getUTCDate() !== day) return undefined
  if (year < 1990 || year > 2100) return undefined
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
}

const expandYear = (y: string): number => (y.length === 2 ? 2000 + Number(y) : Number(y))

export interface DateMatch {
  iso: string
  /** The matched text, as printed. */
  text: string
  index: number
}

const NUMERIC_DATE_RE = /(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/g
const ISO_DATE_RE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g
const LONG_DATE_RE = /(?<![\p{L}\d])(1er|\d{1,2})\s+([\p{L}]{3,9})\.?\s+(\d{4})(?!\d)/giu

/** All valid calendar dates in a string, in reading order. Numeric dates are DD/MM. */
export function findDates(raw: string): DateMatch[] {
  const s = normalizeSpaces(raw)
  const out: DateMatch[] = []
  for (const m of s.matchAll(ISO_DATE_RE)) {
    const iso = isoDate(Number(m[1]), Number(m[2]), Number(m[3]))
    if (iso) out.push({ iso, text: m[0], index: m.index ?? 0 })
  }
  for (const m of s.matchAll(NUMERIC_DATE_RE)) {
    const index = m.index ?? 0
    if (out.some((d) => index >= d.index && index < d.index + d.text.length)) continue
    const iso = isoDate(expandYear(m[3] ?? ""), Number(m[2]), Number(m[1]))
    if (iso) out.push({ iso, text: m[0], index })
  }
  for (const m of s.matchAll(LONG_DATE_RE)) {
    const month = MONTHS[fold(m[2] ?? "")]
    if (!month) continue
    const day = m[1]?.toLowerCase() === "1er" ? 1 : Number(m[1])
    const iso = isoDate(Number(m[3]), month, day)
    if (iso) out.push({ iso, text: m[0], index: m.index ?? 0 })
  }
  return out.sort((a, b) => a.index - b.index)
}

/** The string is (almost) only a date. */
export function parseDate(raw: string): string | undefined {
  const s = normalizeSpaces(raw)
    .replace(/^(le|du|au)\s+/i, "")
    .replace(/[.,;:]$/, "")
  const dates = findDates(s)
  const first = dates[0]
  if (!first || dates.length > 1) return undefined
  const rest = s.replace(first.text, "").trim()
  return rest === "" ? first.iso : undefined
}

/** Unit words printed next to quantities → UN/ECE Rec. 20 code. */
const UNIT_WORDS: Array<[RegExp, string]> = [
  [/^(h|hr?s?|heures?|hrs)$/, "HUR"],
  [/^(j|jrs?|jours?|journees?|jh|j\/h|days?)$/, "DAY"],
  [/^(mois|month)$/, "MON"],
  [/^(forfaits?|ft|fft|forf\.?)$/, "LS"],
  [/^(u|un|unites?|pcs?|pces?|pieces?|ex|ea|units?|article?s?)$/, "C62"],
  [/^(kg|kilos?|kilogrammes?)$/, "KGM"],
  [/^(m2|m²|metres? carres?)$/, "MTK"],
  [/^(ml|m|metres?|metres? lineaires?)$/, "MTR"],
  [/^(l|litres?)$/, "LTR"],
]

export function unitCodeFor(word: string): string | undefined {
  const w = fold(word).replace(/\.$/, "")
  for (const [re, code] of UNIT_WORDS) if (re.test(w)) return code
  return undefined
}

/** "2 j", "3,5 h", "1 forfait", "7.5", "0,5 jour" → quantity and optional unit word. */
export function parseQuantity(
  raw: string,
  style: DecimalStyle = "comma",
): { quantity: number; unit?: string; unitCode?: string } | undefined {
  const s = normalizeSpaces(raw)
  const m = s.match(/^([-\u2212]?\d+(?:[.,]\d+)?)\s*([\p{L}²/.]+(?:\s[\p{L}]+)?)?$/u)
  if (!m?.[1]) return undefined
  const quantity = parseNumber(m[1], style === "dot" && m[1].includes(".") ? "dot" : "comma")
  if (quantity === undefined) return undefined
  const unit = m[2]
  if (!unit) return { quantity }
  const unitCode = unitCodeFor(unit)
  if (!unitCode) return undefined
  return { quantity, unit, unitCode }
}

/** Collapse every kind of whitespace, used for identifiers. */
export function compact(s: string): string {
  return s.replace(/[\s\u00a0\u202f]+/g, "")
}
