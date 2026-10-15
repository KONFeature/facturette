/** Pure number/date formatting shared by the fixture generator and its tests. */

export type DateStyle = "dmy" | "iso" | "long"
export type CurrencyPlacement = "suffix" | "prefix" | "code"

export interface NumberStyle {
  /** Thousands separator ("" for none). */
  thousands: string
  decimal: "," | "."
  currency: CurrencyPlacement
}

export interface Formats {
  date: DateStyle
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

export function formatDate(iso: string, style: DateStyle): string {
  const [y = "", m = "", d = ""] = iso.split("-")
  if (style === "iso") return iso
  if (style === "dmy") return `${d}/${m}/${y}`
  const day = Number(d)
  return `${day === 1 ? "1er" : String(day)} ${MONTHS[Number(m) - 1]} ${y}`
}

/** `decimals` undefined = shortest representation (quantities, rates). */
export function formatNumber(n: number, style: NumberStyle, decimals?: number): string {
  const abs = Math.abs(n)
  const raw = decimals === undefined ? String(abs) : abs.toFixed(decimals)
  const [int = "", frac] = raw.split(".")
  const grouped = style.thousands ? int.replace(/\B(?=(\d{3})+(?!\d))/g, style.thousands) : int
  const body = frac === undefined ? grouped : `${grouped}${style.decimal}${frac}`
  return n < 0 ? `-${body}` : body
}

export function formatMoney(n: number, style: NumberStyle): string {
  const num = formatNumber(n, style, 2)
  if (style.currency === "prefix") return `€ ${num}`
  if (style.currency === "code") return `${num} EUR`
  return `${num} €`
}
