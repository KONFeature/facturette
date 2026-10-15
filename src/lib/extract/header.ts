/**
 * Document-level fields: number, type (invoice / credit note), dates, references, currency,
 * operation category and free notes.
 */
import type { Collector } from "./collect"
import { findLabeled, readFreeText, readReference, type ValueReader } from "./labels"
import type { Layout } from "./layout"
import { isItemTableHeader } from "./table"
import { findDates, parseDate } from "./text"

const readDate: ValueReader<string> = (s) => {
  const first = findDates(s)[0]
  if (!first || first.index > 3) return undefined
  return { value: first.iso, text: first.text }
}

/** Reference that is neither a date nor the start of an amount. */
const readDocumentNumber: ValueReader<string> = (s) => {
  const v = readReference(s)
  if (!v) return undefined
  if (parseDate(v.value)) return undefined
  const after = s.slice(v.text.length)
  if (/^[,.]\d/.test(after) || /^\s*(€|eur\b|%)/i.test(after)) return undefined
  return v
}

/** ISO 11649 creditor reference ("RF18 5390 0754 7034"), else a single reference token. */
const readPaymentReference: ValueReader<string> = (s) => {
  const rf = s.match(/^RF\d{2}(?:\s?[A-Z0-9]{4})*(?:\s?[A-Z0-9]{1,4})?(?=$|[\s,;])/)
  if (rf && rf[0].replace(/\s/g, "").length > 5) return { value: rf[0], text: rf[0] }
  return readReference(s)
}

interface LabelRule {
  re: RegExp
  confidence: number
  rule: string
}

const NUMBER_LABELS: LabelRule[] = [
  {
    re: /^(facture d'avoir|facture|avoir|note de credit|invoice|credit note)\s*(number|numero|num\.|n°|nº|no\.?|n\.|#)(?![a-z])\s*:?/,
    confidence: 0.88,
    rule: "number-label",
  },
  {
    re: /^(n°|nº|no\.?|numero|num\.?)\s*(de\s+)?(la\s+|l')?\s*(facture|avoir|piece|document)\s*:?/,
    confidence: 0.88,
    rule: "number-label",
  },
  {
    re: /^(reference|ref\.?)\s*(de\s+)?(la\s+)?(facture|avoir)\s*:?/,
    confidence: 0.82,
    rule: "number-label-ref",
  },
  {
    re: /^(facture d'avoir|facture|avoir|invoice)\s+(?=\S*\d)/,
    confidence: 0.72,
    rule: "number-title",
  },
]

const ISSUE_DATE_LABELS: LabelRule[] = [
  {
    re: /^(date\s*(de\s+(la\s+)?|d')?\s*(facture|facturation|emission|edition|l'avoir|avoir|piece)|invoice date|date of issue)\b/,
    confidence: 0.88,
    rule: "issue-date-label",
  },
  { re: /^(emise?|etablie?|editee?)\s+le\b/, confidence: 0.85, rule: "issue-date-label" },
  { re: /^date\b(?!\s*(d'|de\b|du\b|des\b|limite|d’))/, confidence: 0.8, rule: "issue-date-plain" },
  { re: /^([a-z' -]{2,30},\s*)?le\b/, confidence: 0.66, rule: "issue-date-letter" },
]

const DUE_DATE_LABELS: LabelRule[] = [
  {
    re: /^(date\s*(d'|de |d )?\s*echeance|echeance|date limite de (paiement|reglement)|a (regler|payer) (avant|au plus tard|le|pour)( le)?|payable (le|avant le|au plus tard le|au)|date de (paiement|reglement)|paiement (avant|au plus tard)( le)?|due date|due|payment due|date d'exigibilite)\b/,
    confidence: 0.86,
    rule: "due-date-label",
  },
]

const DELIVERY_DATE_LABELS: LabelRule[] = [
  {
    re: /^(date\s*(de\s+|d'|des\s+)?\s*(livraison|execution|la prestation|prestation|intervention|realisation|fin de prestation|travaux|l'operation|operation|service)|livree?s? le|(prestation|intervention|travaux|service) (realisee?s?|effectuee?s?|executee?s?|rendue?s?) le|delivery date|date of supply)\b/,
    confidence: 0.84,
    rule: "delivery-date-label",
  },
]

const ORDER_LABELS: LabelRule[] = [
  {
    re: /^(votre commande|v\/commande|vos commandes?|n°\s*(de\s+)?commande|numero de commande|commande\s*(n°|no\.?|client)?|bon de commande(\s*n°)?|bc\s*n°|ref(\.|erence)?\s*(de\s+)?commande|purchase order|po\s*(number|n°|#)|order\s*(n°|number|#))\s*:?/,
    confidence: 0.82,
    rule: "order-ref-label",
  },
]

const BUYER_REF_LABELS: LabelRule[] = [
  {
    re: /^(votre reference|vos references?|v\/ref(\.|erence)?|code service|service executant|reference d'engagement|n° d'engagement|your reference|buyer reference)\s*:?/,
    confidence: 0.75,
    rule: "buyer-ref-label",
  },
  {
    re: /^(reference client|ref\.? client|reference acheteur)\s*:?/,
    confidence: 0.68,
    rule: "buyer-ref-label",
  },
  {
    re: /^(code client|n°\s*client|numero client|compte client)\s*:?/,
    confidence: 0.45,
    rule: "buyer-ref-client-code",
  },
]

const PAYMENT_REF_LABELS: LabelRule[] = [
  {
    re: /^(reference a (rappeler|indiquer|mentionner)|reference (de|du) (paiement|virement|reglement)|ref\.? (de )?(paiement|virement)|libelle du virement|motif du virement|communication|a rappeler)\s*:?/,
    confidence: 0.82,
    rule: "payment-ref-label",
  },
]

function applyLabels<T extends string>(
  layout: Layout,
  collector: Collector,
  path: string,
  rules: LabelRule[],
  read: ValueReader<T>,
): void {
  for (const rule of rules) {
    for (const m of findLabeled(layout, rule.re, read)) {
      // A "Date" column of the line-item table is not a document date.
      const labelRow = layout.rows[m.labelCell.line]
      if (m.placement === "below" && labelRow && isItemTableHeader(labelRow)) continue
      const penalty = m.placement === "below" ? 0.06 : 0
      const cells = m.valueCell === m.labelCell ? [m.labelCell] : [m.labelCell, m.valueCell]
      collector.add(
        path,
        m.value,
        rule.confidence - penalty,
        cells,
        rule.rule,
        `${m.label} ${m.text}`.trim(),
      )
    }
  }
}

/** True when the document announces itself as a credit note (title or number label). */
export function detectCreditNote(layout: Layout): boolean {
  return detectType(layout)?.code === "381"
}

/** "F A C T U R E" (letter-spaced title) → "facture". */
function titleText(folded: string): string {
  return /^(\p{L} ){3,}\p{L}$/u.test(folded) ? folded.replace(/ /g, "") : folded
}

const TITLE_TAIL = String.raw`(\s*$|\s*(n°|no\b|nº|numero|number|:|#)|\s+\S*\d|\s*/\s*\p{L}+$)`
const CREDIT_TITLE_RE = new RegExp(
  `^(facture d'avoir|avoir|note de credit|credit note)${TITLE_TAIL}`,
  "u",
)
const INVOICE_TITLE_RE = new RegExp(`^(facture|invoice)${TITLE_TAIL}`, "u")

function detectType(layout: Layout): { code: "380" | "381"; cells: Layout["cells"] } | undefined {
  const top = layout.cells.filter(
    (c) => c.page === 1 && c.y < 0.45 * (layout.pageHeights[0] ?? 842),
  )
  const credit = top.filter((c) => CREDIT_TITLE_RE.test(titleText(c.folded)))
  if (credit.length > 0) return { code: "381", cells: credit.slice(0, 1) }
  const invoice = top.filter((c) => INVOICE_TITLE_RE.test(titleText(c.folded)))
  if (invoice.length > 0) return { code: "380", cells: invoice.slice(0, 1) }
  return undefined
}

export function extractHeader(layout: Layout, collector: Collector): { isCreditNote: boolean } {
  const type = detectType(layout)
  if (type) {
    collector.add("typeCode", type.code, type.code === "381" ? 0.92 : 0.9, type.cells, "type-title")
  }

  applyLabels(layout, collector, "number", NUMBER_LABELS, readDocumentNumber)
  applyLabels(layout, collector, "issueDate", ISSUE_DATE_LABELS, readDate)
  applyLabels(layout, collector, "dueDate", DUE_DATE_LABELS, readDate)
  applyLabels(layout, collector, "deliveryDate", DELIVERY_DATE_LABELS, readDate)
  applyLabels(layout, collector, "orderReference", ORDER_LABELS, readReference)
  applyLabels(layout, collector, "buyerReference", BUYER_REF_LABELS, readFreeText)
  applyLabels(layout, collector, "payment.reference", PAYMENT_REF_LABELS, readPaymentReference)
  extractPeriod(layout, collector)
  extractCurrency(layout, collector)
  extractOperationCategory(layout, collector)
  if (type?.code === "381") extractCreditNoteNote(layout, collector)
  return { isCreditNote: type?.code === "381" }
}

/** "Période : du 01/09/2026 au 30/09/2026" → delivery date candidate = end of the period. */
function extractPeriod(layout: Layout, collector: Collector): void {
  for (const cell of layout.cells) {
    const m = cell.folded.match(
      /^(periode|periode de (facturation|prestation|reference)|prestations? du|du)\b/,
    )
    if (!m) continue
    const dates = findDates(cell.text)
    const last = dates[dates.length - 1]
    if (dates.length === 2 && last) {
      collector.add("deliveryDate", last.iso, 0.5, [cell], "delivery-period-end")
    }
  }
}

function extractCurrency(layout: Layout, collector: Collector): void {
  const euro = layout.cells.find((c) => /€|\beur\b|\beuros?\b/i.test(c.text))
  const other = layout.cells.find((c) => /\$|£|\b(usd|gbp|chf|cad|jpy)\b/i.test(c.text))
  if (euro && !other) collector.add("currency", "EUR", 0.9, [euro], "currency-euro")
  else if (other)
    collector.warn("Une devise autre que l'euro semble utilisée : seul l'euro est pris en charge.")
}

const SERVICE_WORDS =
  /\b(prestations?|honoraires|missions?|conseils?|formations?|interventions?|main d'oeuvre|heures?|journees?|developpement|maintenance|abonnement|reportage|retouches?|creation|design|audit|accompagnement|assistance|consulting|redaction|pose|mise en service|service)\b/
const GOODS_WORDS =
  /\b(livraison de biens|vente de|marchandises?|fournitures?|articles?|produits?|materiels?|equipements?|tirages?|plateaux?|bouteilles?|cartouches?|ramettes?)\b/

function extractOperationCategory(layout: Layout, collector: Collector): void {
  // Explicit mention required by the 2026 reform.
  for (const cell of layout.cells) {
    const m = cell.folded.match(/categorie (de l'|d')?operations?\s*:?\s*(.*)$/)
    if (!m) continue
    const v = m[2] ?? ""
    const value = /mixte/.test(v)
      ? "mixed"
      : /prestation|service/.test(v)
        ? "services"
        : /livraison|bien/.test(v)
          ? "goods"
          : undefined
    if (value) collector.add("operationCategory", value, 0.85, [cell], "operation-category-label")
  }
  let services = 0
  let goods = 0
  for (const cell of layout.cells) {
    services += [...cell.folded.matchAll(new RegExp(SERVICE_WORDS, "g"))].length
    goods += [...cell.folded.matchAll(new RegExp(GOODS_WORDS, "g"))].length
  }
  if (services === 0 && goods === 0) return
  const value = services > 0 && goods > 0 ? "mixed" : services > 0 ? "services" : "goods"
  const first = layout.cells.find((c) => SERVICE_WORDS.test(c.folded) || GOODS_WORDS.test(c.folded))
  collector.add(
    "operationCategory",
    value,
    0.4,
    first ? [first] : [],
    "operation-category-vocabulary",
    `${services} terme(s) de prestation, ${goods} terme(s) de vente de biens`,
  )
}

/** "Avoir sur facture F-2026-0412 du 12/09/2026" → note carrying the original invoice reference. */
function extractCreditNoteNote(layout: Layout, collector: Collector): void {
  for (const cell of layout.cells) {
    if (
      /^(avoir|annule et remplace|annulation|en reference a|relatif a)\b.*\bfacture\b.*\d/.test(
        cell.folded,
      )
    ) {
      collector.add("notes", cell.text, 0.66, [cell], "credit-note-reference")
      return
    }
  }
}
