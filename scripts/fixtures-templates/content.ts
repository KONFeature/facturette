/**
 * Text content shared by every renderer (HTML and pdf-lib): which strings are shown for a given
 * invoice, honouring the fixture's `hidden` paths. Layout lives in html.ts / pdflib.ts.
 */
import { type Invoice, PAYMENT_MEANS, UNIT_CODES } from "../../src/domain/invoice"
import { computeTotals, type InvoiceTotals } from "../../src/domain/totals"
import type { FixtureDef, Labels } from "./data"
import { type Formats, formatDate, formatMoney, formatNumber } from "./format"
import { getPath } from "./paths"

export const DEFAULT_LABELS: Labels = {
  title: "Facture",
  number: "Facture n°",
  issueDate: "Date",
  dueDate: "Date d'échéance",
  deliveryDate: "Date de livraison",
  orderReference: "Votre commande",
  buyerReference: "Référence client",
  buyer: "Client",
  delivery: "Livraison",
  seller: "Émetteur",
  totalNet: "Total HT",
  totalVat: "Total TVA",
  totalGross: "Total TTC",
  prepaid: "Acompte versé",
  due: "Net à payer",
}

export interface Content {
  inv: Invoice
  formats: Formats
  labels: Labels
  totals: InvoiceTotals
  /** -1 for credit notes (amounts printed negative), else 1. */
  sign: 1 | -1
  groupIds: boolean
  /** The layout prints a dedicated amount-due row even without deposit. */
  explicitDue: boolean
  show: (path: string) => boolean
  money: (n: number) => string
  qty: (n: number) => string
  date: (iso: string) => string
}

const groupBy = (digits: string, sizes: number[]): string => {
  const parts: string[] = []
  let i = 0
  for (const s of sizes) {
    if (i >= digits.length) break
    parts.push(digits.slice(i, i + s))
    i += s
  }
  if (i < digits.length) parts.push(digits.slice(i))
  return parts.join(" ")
}

export function makeContent(
  def: FixtureDef,
  labelOverrides: Partial<Labels>,
  groupIds: boolean,
): Content {
  const inv = def.invoice
  const hidden = new Set(def.hidden)
  const sign = inv.typeCode === "381" ? -1 : 1
  const { number: style } = def.formats
  return {
    inv,
    formats: def.formats,
    labels: { ...DEFAULT_LABELS, ...labelOverrides },
    totals: computeTotals(inv),
    sign,
    groupIds,
    explicitDue: labelOverrides.due !== undefined,
    show: (path) => !hidden.has(path) && getPath(inv, path) !== undefined,
    money: (n) => formatMoney(n * sign, style),
    qty: (n) => formatNumber(n, style),
    date: (iso) => formatDate(iso, def.formats.date),
  }
}

export function unitLabel(code: string): string {
  const short: Record<string, string> = { HUR: "h", DAY: "j", LS: "forfait", C62: "u" }
  return short[code] ?? UNIT_CODES.find((u) => u.code === code)?.label ?? code
}

const idText = (c: Content, digits: string, sizes: number[]) =>
  c.groupIds ? groupBy(digits, sizes) : digits

/** Text rows describing a party (seller or buyer). */
export function partyLines(c: Content, who: "seller" | "buyer"): string[] {
  const p = c.inv[who]
  const at = (f: string) => `${who}.${f}`
  const out: string[] = []
  out.push(p.name)
  if (who === "seller") {
    const s = c.inv.seller
    const legal = [
      c.show("seller.legalForm") && s.legalForm,
      c.show("seller.shareCapital") && `au capital de ${s.shareCapital}`,
    ].filter(Boolean)
    if (legal.length) out.push(legal.join(" "))
    if (c.show("seller.registration")) out.push(String(s.registration))
  }
  out.push(p.address.line1)
  if (p.address.line2) out.push(p.address.line2)
  out.push(`${p.address.postalCode} ${p.address.city}`)
  if (p.siren && c.show(at("siren"))) out.push(`SIREN : ${idText(c, p.siren, [3, 3, 3])}`)
  if (p.siret && c.show(at("siret"))) out.push(`SIRET : ${idText(c, p.siret, [3, 3, 3, 5])}`)
  if (p.vatNumber && c.show(at("vatNumber"))) out.push(`N° TVA : ${p.vatNumber}`)
  if (p.email && c.show(at("email"))) out.push(p.email)
  if (p.phone && c.show(at("phone"))) out.push(`Tél. ${p.phone}`)
  return out
}

export function deliveryLines(c: Content): string[] {
  const a = c.inv.deliveryAddress
  if (!a) return []
  return [a.line1, ...(a.line2 ? [a.line2] : []), `${a.postalCode} ${a.city}`]
}

/** [label, value] pairs for the invoice reference block. */
export function metaRows(c: Content): [string, string][] {
  const { inv, labels: l } = c
  const rows: [string, string][] = [[l.number, inv.number]]
  rows.push([l.issueDate, c.date(inv.issueDate)])
  if (inv.dueDate && c.show("dueDate")) rows.push([l.dueDate, c.date(inv.dueDate)])
  if (inv.deliveryDate && c.show("deliveryDate"))
    rows.push([l.deliveryDate, c.date(inv.deliveryDate)])
  if (inv.orderReference && c.show("orderReference"))
    rows.push([l.orderReference, inv.orderReference])
  if (inv.buyerReference && c.show("buyerReference"))
    rows.push([l.buyerReference, inv.buyerReference])
  return rows
}

/** Payment lines; bank details are split out so layouts can place them in a footer. */
export function paymentLines(c: Content): { terms: string[]; bank: string[] } {
  const { payment } = c.inv
  const means = PAYMENT_MEANS.find((m) => m.code === payment.meansCode)?.label
  const terms: string[] = []
  if (means) terms.push(`Mode de règlement : ${means}`)
  if (payment.termsText && c.show("payment.termsText")) terms.push(payment.termsText)
  const bank: string[] = []
  if (payment.iban && c.show("payment.iban"))
    bank.push(`IBAN : ${c.groupIds ? groupBy(payment.iban, [4, 4, 4, 4, 4, 4, 3]) : payment.iban}`)
  if (payment.bic && c.show("payment.bic")) bank.push(`BIC : ${payment.bic}`)
  if (payment.reference && c.show("payment.reference"))
    bank.push(`Référence à rappeler : ${payment.reference}`)
  return { terms, bank }
}

/** Reason, legal mentions and free notes, as separate paragraphs. */
export function legalLines(c: Content): string[] {
  const { inv } = c
  const out: string[] = []
  if (inv.vatExemptionReason && c.show("vatExemptionReason")) out.push(inv.vatExemptionReason)
  if (inv.notes && c.show("notes")) out.push(inv.notes)
  const n = inv.legalNotes
  if (n?.earlyPaymentDiscount && c.show("legalNotes.earlyPaymentDiscount"))
    out.push(n.earlyPaymentDiscount)
  if (n?.latePaymentPenalty && c.show("legalNotes.latePaymentPenalty"))
    out.push(n.latePaymentPenalty)
  if (n?.recoveryFee && c.show("legalNotes.recoveryFee")) out.push(n.recoveryFee)
  return out
}

export interface TotalRow {
  label: string
  value: string
  strong?: boolean
}

/** Totals block rows (VAT rows only when some VAT is due or the breakdown is itemised). */
export function totalRows(c: Content, itemisedVat: boolean): TotalRow[] {
  const { totals: t, labels: l } = c
  const rows: TotalRow[] = [{ label: l.totalNet, value: c.money(t.taxBasisTotal) }]
  if (!itemisedVat) {
    for (const v of t.vatBreakdown) {
      if (v.category === "S")
        rows.push({
          label: `TVA ${formatNumber(v.rate, c.formats.number)} %`,
          value: c.money(v.taxAmount),
        })
    }
  }
  if (t.taxTotal !== 0) rows.push({ label: l.totalVat, value: c.money(t.taxTotal) })
  rows.push({ label: l.totalGross, value: c.money(t.grandTotal), strong: t.prepaid === 0 })
  if (t.prepaid !== 0) {
    rows.push({ label: l.prepaid, value: c.money(-t.prepaid * c.sign) })
    rows.push({ label: l.due, value: c.money(t.dueAmount), strong: true })
  } else if (c.explicitDue) {
    rows.push({ label: l.due, value: c.money(t.dueAmount), strong: true })
  }
  return rows
}
