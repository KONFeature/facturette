/**
 * French number input/output for the form. The form keeps what the user typed as text; the draft
 * holds real numbers. No arithmetic happens here (see `src/domain/totals.ts`).
 */

const SPACES = /[\s\u00a0\u202f]/g

/**
 * Parse French or plain input: "1 234,56", "1234.56", "1.234,56", "-12", "12 €".
 * Returns `null` for blank text and `Number.NaN` for text that is not a number.
 *
 * When both "." and "," appear, the last one is the decimal mark. A lone "." is a decimal mark
 * ("1.5" → 1.5); a lone "," always is.
 */
export function parseFrNumber(text: string): number | null {
  const cleaned = text
    .replace(SPACES, "")
    .replace(/[€%]/g, "")
    .replace(/\u2212/g, "-")
  if (cleaned === "") return null
  const lastComma = cleaned.lastIndexOf(",")
  const lastDot = cleaned.lastIndexOf(".")
  let normalized: string
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalMark = lastComma > lastDot ? "," : "."
    const thousandsMark = decimalMark === "," ? "." : ","
    normalized = cleaned.split(thousandsMark).join("").replace(decimalMark, ".")
  } else if (lastComma >= 0) {
    normalized = cleaned.replace(",", ".")
  } else {
    normalized = cleaned
  }
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return Number.NaN
  return Number(normalized)
}

const plain = new Intl.NumberFormat("fr-FR", { useGrouping: false, maximumFractionDigits: 10 })

/** Text shown in an input: no thousands separator (easy to edit), French decimal comma. */
export function formatNumberInput(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return ""
  return plain.format(value)
}

const grouped = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 10 })

/** Read-only display with thousands separators: 1234.5 → "1 234,5". */
export function formatNumberDisplay(value: number): string {
  return grouped.format(value)
}

const amount = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })

/** Amount in euros for read-only display: 1234.5 → "1 234,50 €". */
export function formatAmount(value: number): string {
  return amount.format(value)
}
