/**
 * Invoice arithmetic following EN 16931 (business terms BT-106 … BT-115) with decimal.js.
 *
 * Rounding rules (half-up to 2 decimals):
 *  - line net amount (BT-131)  = round(quantity × unit price)
 *  - VAT per breakdown (BT-117) = round(taxable amount × rate / 100), where the taxable amount
 *    (BT-116) is the sum of the line nets that share the same (category, rate).
 * The tax is computed per breakdown, never per line, so the totals match what the Mustang /
 * Schematron arithmetic checks recompute.
 *
 * Accepts drafts: lines with missing or non-finite numbers contribute 0.
 */
import Decimal from "decimal.js"
import type { InvoiceDraft, VatCategory } from "./invoice"

const ROUND = Decimal.ROUND_HALF_UP
const d = (n: unknown): Decimal => {
  const num = typeof n === "number" ? n : Number.NaN
  return Number.isFinite(num) ? new Decimal(num) : new Decimal(0)
}
const round2 = (x: Decimal): Decimal => x.toDecimalPlaces(2, ROUND)

export interface VatBreakdown {
  category: VatCategory
  /** Percent. 0 for every category except `S`. */
  rate: number
  /** BT-116 */
  taxableAmount: number
  /** BT-117 */
  taxAmount: number
}

export interface InvoiceTotals {
  /** BT-131 per line, same order as the input lines. */
  lineNets: number[]
  /** BT-106 sum of line nets. */
  lineTotal: number
  /** BT-109 total excl. VAT. */
  taxBasisTotal: number
  /** BT-110 total VAT. */
  taxTotal: number
  /** BT-112 total incl. VAT. */
  grandTotal: number
  /** BT-113 already paid. */
  prepaid: number
  /** BT-115 amount due. */
  dueAmount: number
  vatBreakdown: VatBreakdown[]
}

const CATEGORY_ORDER: VatCategory[] = ["S", "Z", "E", "AE", "K", "G", "O"]

export function lineNet(line: { quantity?: number; unitPrice?: number }): number {
  return round2(d(line.quantity).mul(d(line.unitPrice))).toNumber()
}

export function computeTotals(input: Pick<InvoiceDraft, "lines" | "prepaidAmount">): InvoiceTotals {
  const lines = input.lines ?? []
  const groups = new Map<string, { category: VatCategory; rate: Decimal; taxable: Decimal }>()
  const lineNets: number[] = []
  let lineTotal = new Decimal(0)

  for (const line of lines) {
    const net = round2(d(line?.quantity).mul(d(line?.unitPrice)))
    lineNets.push(net.toNumber())
    lineTotal = lineTotal.plus(net)

    const category: VatCategory = line?.vatCategory ?? "S"
    const rate = category === "S" ? d(line?.vatRate) : new Decimal(0)
    const key = `${category}|${rate.toString()}`
    const group = groups.get(key) ?? { category, rate, taxable: new Decimal(0) }
    group.taxable = group.taxable.plus(net)
    groups.set(key, group)
  }

  const vatBreakdown: VatBreakdown[] = [...groups.values()]
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
        b.rate.comparedTo(a.rate),
    )
    .map((g) => ({
      category: g.category,
      rate: g.rate.toNumber(),
      taxableAmount: round2(g.taxable).toNumber(),
      taxAmount: round2(g.taxable.mul(g.rate).div(100)).toNumber(),
    }))

  const taxTotal = vatBreakdown.reduce((acc, v) => acc.plus(v.taxAmount), new Decimal(0))
  const taxBasisTotal = round2(lineTotal)
  const grandTotal = taxBasisTotal.plus(taxTotal)
  const prepaid = round2(d(input.prepaidAmount))

  return {
    lineNets,
    lineTotal: round2(lineTotal).toNumber(),
    taxBasisTotal: taxBasisTotal.toNumber(),
    taxTotal: taxTotal.toNumber(),
    grandTotal: grandTotal.toNumber(),
    prepaid: prepaid.toNumber(),
    dueAmount: grandTotal.minus(prepaid).toNumber(),
    vatBreakdown,
  }
}
