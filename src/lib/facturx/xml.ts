import Decimal from "decimal.js"
import {
  type Address,
  deriveSiren,
  electronicAddressOf,
  type Invoice,
  type Party,
  VAT_FRANCHISE_REASON,
  type VatCategory,
} from "../../domain/invoice"
import { computeTotals, type InvoiceTotals } from "../../domain/totals"
import { DEFAULT_PROFILE, type FacturXProfile } from "./types"

// ---------------------------------------------------------------------------------------------
// Tiny deterministic XML tree + serializer
// ---------------------------------------------------------------------------------------------

interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  text?: string
}

type Child = XmlNode | undefined | false

/** Remove characters that are illegal in XML 1.0 (control chars, lone surrogates, U+FFFE/FFFF). */
export function stripIllegalXmlChars(value: string): string {
  let out = ""
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0
    const legal =
      cp === 0x9 ||
      cp === 0xa ||
      cp === 0xd ||
      (cp >= 0x20 && cp <= 0xd7ff) ||
      (cp >= 0xe000 && cp <= 0xfffd) ||
      (cp >= 0x10000 && cp <= 0x10ffff)
    if (legal) out += ch
  }
  return out
}

/** Escape text for element content and double-quoted attribute values. */
export function escapeXml(value: string): string {
  return stripIllegalXmlChars(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** Element with children. Falsy children are skipped so optional parts read naturally. */
function node(name: string, children: Child[], attrs: Record<string, string> = {}): XmlNode {
  return { name, attrs, children: children.filter((c): c is XmlNode => !!c) }
}

/** Leaf element with text content. */
function leaf(name: string, text: string, attrs: Record<string, string> = {}): XmlNode {
  return { name, attrs, children: [], text }
}

function render(n: XmlNode, depth: number): string {
  const pad = "  ".repeat(depth)
  const attrs = Object.entries(n.attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join("")
  if (n.text !== undefined) return `${pad}<${n.name}${attrs}>${escapeXml(n.text)}</${n.name}>`
  if (n.children.length === 0) return `${pad}<${n.name}${attrs}/>`
  const inner = n.children.map((c) => render(c, depth + 1)).join("\n")
  return `${pad}<${n.name}${attrs}>\n${inner}\n${pad}</${n.name}>`
}

// ---------------------------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------------------------

/** Plain decimal string (never exponent), at least `minDecimals` and no trailing zeros beyond. */
function formatDecimal(value: number, minDecimals: number): string {
  const fixed = new Decimal(value).toFixed()
  const [int = "0", frac = ""] = fixed.split(".")
  const trimmed = frac.replace(/0+$/, "")
  return `${int}.${trimmed.padEnd(minDecimals, "0")}`
}

const amount = (value: number): string => new Decimal(value).toFixed(2)
/** Unit prices, quantities, rates: 2 decimals minimum, more only when significant. */
const precise = (value: number): string => formatDecimal(value, 2)

/** `YYYY-MM-DD` → `YYYYMMDD` (UN/CEFACT format code 102). */
const date102 = (iso: string): string => iso.replace(/-/g, "")

function dateTime(name: string, iso: string): XmlNode {
  return node(name, [leaf("udt:DateTimeString", date102(iso), { format: "102" })])
}

const compact = (value: string | undefined): string | undefined => {
  const v = value?.replace(/\s+/g, "")
  return v ? v : undefined
}

// ---------------------------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------------------------

const GUIDELINE_IDS: Record<FacturXProfile, string> = {
  EN16931: "urn:cen.eu:en16931:2017",
  BASIC: "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic",
}

/** VATEX codes (CEF VATEX list) per exempt category. `E` is handled separately (franchise). */
const EXEMPTION_CODES: Partial<Record<VatCategory, string>> = {
  AE: "VATEX-EU-AE",
  K: "VATEX-EU-IC",
  G: "VATEX-EU-G",
  O: "VATEX-EU-O",
}

/** Fallback BT-120 text when the user left the reason empty (validation normally prevents it). */
const DEFAULT_EXEMPTION_REASONS: Partial<Record<VatCategory, string>> = {
  E: VAT_FRANCHISE_REASON,
  AE: "Autoliquidation",
  K: "Exonération de TVA, art. 262 ter I du CGI",
  G: "Exportation hors Union européenne, art. 262 I du CGI",
  O: "TVA non applicable",
}

/** Which exempt regime receives the user's typed exemption reason when an invoice mixes several. */
const EXEMPTION_PRIORITY: readonly VatCategory[] = ["E", "AE", "K", "G", "O"]

/** First letter of the BT-23 billing mode (XP Z12-012): Service, Bien (goods), Mixte. */
const BILLING_LETTER: Record<Invoice["operationCategory"], string> = {
  services: "S",
  goods: "B",
  mixed: "M",
}

/**
 * BT-23 "cadre de facturation", per the FNFE-MPE French schematron (BR-FR-08, BR-FR-CO-08/09) and
 * its flash notes:
 *  - 2 = invoice already paid: needs BT-113 = BT-112 and BT-115 = 0 (and BT-9 = payment date);
 *  - 4 = final invoice after a deposit: BT-3 stays 380 and the deposit invoice is referenced in
 *    BT-25 (we only claim it when the user gave that reference);
 *  - 1 = anything else (a plain invoice, or a partial payment with no deposit invoice).
 */
function billingMode(invoice: Invoice, totals: InvoiceTotals): string {
  const letter = BILLING_LETTER[invoice.operationCategory]
  if (totals.prepaid > 0 && totals.dueAmount === 0) return `${letter}2`
  if (
    invoice.typeCode === "380" &&
    totals.prepaid > 0 &&
    totals.dueAmount > 0 &&
    invoice.precedingInvoice?.number.trim()
  ) {
    return `${letter}4`
  }
  return `${letter}1`
}

/**
 * The franchise en base mention: art. 293 B du CGI, which service-public says becomes "art. L. 223
 * et s. du CIBS" from 1 September 2026 (the old wording stays tolerated until end 2027). Both
 * wordings are recognised so that the VATEX-FR-FRANCHISE code is never lost to a wording change.
 */
const isFranchiseReason = (reason: string | undefined): boolean =>
  !!reason && /293\s*B|L\.?\s*223|CIBS/i.test(reason)

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

interface Note {
  content: string
  subjectCode: string
}

function noteNode(note: Note): XmlNode {
  return node("ram:IncludedNote", [
    leaf("ram:Content", note.content),
    leaf("ram:SubjectCode", note.subjectCode),
  ])
}

/**
 * Document-level notes, in a fixed order:
 * ABL seller legal identity, PMD late-payment penalty, PMT recovery fee, AAB early-payment
 * discount, TXD tax mention (VAT on debits), AAI free text.
 */
function buildNotes(invoice: Invoice): Note[] {
  const notes: Note[] = []
  const { seller, legalNotes } = invoice
  const identity = [
    seller.legalForm,
    seller.shareCapital ? `Capital social : ${seller.shareCapital}` : undefined,
    seller.registration,
  ].filter((p): p is string => !!p?.trim())
  if (identity.length > 0) {
    notes.push({ content: [seller.name, ...identity].join(" - "), subjectCode: "ABL" })
  }
  // The French schematron (BR-FR-05) wants PMD, PMT and AAB on every invoice. Towards a private
  // customer the 40 \u20ac recovery indemnity (art. D441-5) cannot be charged, so the PMT text is
  // always "not applicable" there, whatever was typed; the other two fall back to the same wording.
  const b2c = invoice.buyer.kind === "individual"
  const notApplicable = "Non applicable (client non professionnel)."
  const penalty = legalNotes?.latePaymentPenalty?.trim() || (b2c ? notApplicable : undefined)
  const recoveryFee = b2c
    ? "Indemnit\u00e9 forfaitaire de recouvrement non applicable (client non professionnel)."
    : legalNotes?.recoveryFee?.trim()
  const discount = legalNotes?.earlyPaymentDiscount?.trim() || (b2c ? notApplicable : undefined)
  if (penalty) notes.push({ content: penalty, subjectCode: "PMD" })
  if (recoveryFee) notes.push({ content: recoveryFee, subjectCode: "PMT" })
  if (discount) notes.push({ content: discount, subjectCode: "AAB" })
  // BAR tells the platform how to route the invoice; B2C is e-reporting, not e-invoicing.
  if (b2c) notes.push({ content: "B2C", subjectCode: "BAR" })
  if (invoice.vatOnDebits) {
    notes.push({
      content: "Option pour le paiement de la TVA d'après les débits.",
      subjectCode: "TXD",
    })
  }
  if (invoice.notes?.trim()) notes.push({ content: invoice.notes, subjectCode: "AAI" })
  return notes
}

/** "SARL - Capital social : 10 000 \u20ac" (BT-33), or undefined when there is nothing to say. */
function sellerLegalDescription(seller: Invoice["seller"]): string | undefined {
  const parts = [
    seller.legalForm?.trim(),
    seller.shareCapital?.trim() ? `Capital social : ${seller.shareCapital.trim()}` : undefined,
  ].filter((p): p is string => !!p)
  return parts.length > 0 ? parts.join(" - ") : undefined
}

function addressNode(address: Address): XmlNode {
  return node("ram:PostalTradeAddress", [
    leaf("ram:PostcodeCode", address.postalCode),
    leaf("ram:LineOne", address.line1),
    address.line2?.trim() ? leaf("ram:LineTwo", address.line2) : undefined,
    leaf("ram:CityName", address.city),
    leaf("ram:CountryID", address.countryCode.toUpperCase()),
  ])
}

interface PartyOptions {
  /** Emit the VAT number (BT-31 / BT-48). False for category O (BR-O-02). */
  withVatNumber: boolean
  /** BASIC has no DefinedTradeContact in its schema. */
  withContact: boolean
  /** Seller without VAT number: SIREN as fiscal registration (BT-32, scheme FC). */
  fiscalRegistrationFallback: boolean
  /** BT-33 "seller additional legal information" (legal form, share capital). EN 16931 only. */
  description?: string
}

function partyNode(name: string, party: Party, options: PartyOptions): XmlNode {
  const siren = deriveSiren(party)
  const endpoint = electronicAddressOf(party)
  const siret = compact(party.siret)
  const vat = compact(party.vatNumber)?.toUpperCase()
  const email = party.email?.trim()
  const phone = party.phone?.trim()
  const registrations: XmlNode[] = []
  if (vat && options.withVatNumber) {
    registrations.push(
      node("ram:SpecifiedTaxRegistration", [leaf("ram:ID", vat, { schemeID: "VA" })]),
    )
  } else if (!vat && options.fiscalRegistrationFallback && siren) {
    registrations.push(
      node("ram:SpecifiedTaxRegistration", [leaf("ram:ID", siren, { schemeID: "FC" })]),
    )
  }
  return node(name, [
    siret && /^\d{14}$/.test(siret) ? leaf("ram:GlobalID", siret, { schemeID: "0009" }) : undefined,
    leaf("ram:Name", party.name),
    options.description ? leaf("ram:Description", options.description) : undefined,
    siren
      ? node("ram:SpecifiedLegalOrganization", [leaf("ram:ID", siren, { schemeID: "0002" })])
      : undefined,
    options.withContact && (phone || email)
      ? node("ram:DefinedTradeContact", [
          phone
            ? node("ram:TelephoneUniversalCommunication", [leaf("ram:CompleteNumber", phone)])
            : undefined,
          email
            ? node("ram:EmailURIUniversalCommunication", [leaf("ram:URIID", email)])
            : undefined,
        ])
      : undefined,
    addressNode(party.address),
    // BT-34 / BT-49: the e-invoicing address (French directory scheme 0225 by default).
    endpoint
      ? node("ram:URIUniversalCommunication", [
          leaf("ram:URIID", endpoint.value, { schemeID: endpoint.scheme }),
        ])
      : undefined,
    ...registrations,
  ])
}

function taxNode(
  category: VatCategory,
  rate: number,
  extra: {
    calculated?: number
    basis?: number
    reason?: string
    reasonCode?: string
    dueCode?: string
  },
): XmlNode {
  const hasRate = category !== "O"
  return node("ram:ApplicableTradeTax", [
    extra.calculated !== undefined
      ? leaf("ram:CalculatedAmount", amount(extra.calculated))
      : undefined,
    leaf("ram:TypeCode", "VAT"),
    extra.reason ? leaf("ram:ExemptionReason", extra.reason) : undefined,
    extra.basis !== undefined ? leaf("ram:BasisAmount", amount(extra.basis)) : undefined,
    leaf("ram:CategoryCode", category),
    extra.reasonCode ? leaf("ram:ExemptionReasonCode", extra.reasonCode) : undefined,
    extra.dueCode ? leaf("ram:DueDateTypeCode", extra.dueCode) : undefined,
    hasRate ? leaf("ram:RateApplicablePercent", precise(rate)) : undefined,
  ])
}

function lineNodes(invoice: Invoice, totals: InvoiceTotals, profile: FacturXProfile): XmlNode[] {
  return invoice.lines.map((line, index) => {
    const category = line.vatCategory
    const rate = category === "S" ? line.vatRate : 0
    const net = totals.lineNets[index] ?? 0
    // BR-27: the net price may not be negative. Move the sign into the quantity so that
    // quantity x price still equals the signed line net (e.g. a "Remise commerciale" line).
    const negativePrice = line.unitPrice < 0
    const price = negativePrice ? -line.unitPrice : line.unitPrice
    const quantity = negativePrice ? -line.quantity : line.quantity
    return node("ram:IncludedSupplyChainTradeLineItem", [
      node("ram:AssociatedDocumentLineDocument", [leaf("ram:LineID", String(index + 1))]),
      node("ram:SpecifiedTradeProduct", [
        leaf("ram:Name", line.name),
        profile === "EN16931" && line.description?.trim()
          ? leaf("ram:Description", line.description)
          : undefined,
      ]),
      node("ram:SpecifiedLineTradeAgreement", [
        node("ram:NetPriceProductTradePrice", [leaf("ram:ChargeAmount", precise(price))]),
      ]),
      node("ram:SpecifiedLineTradeDelivery", [
        leaf("ram:BilledQuantity", precise(quantity), { unitCode: line.unitCode }),
      ]),
      node("ram:SpecifiedLineTradeSettlement", [
        taxNode(category, rate, {}),
        node("ram:SpecifiedTradeSettlementLineMonetarySummation", [
          leaf("ram:LineTotalAmount", amount(net)),
        ]),
      ]),
    ])
  })
}

function paymentMeansNode(invoice: Invoice, profile: FacturXProfile): XmlNode {
  const { payment } = invoice
  const iban = compact(payment.iban)?.toUpperCase()
  const bic = compact(payment.bic)?.toUpperCase()
  const isDirectDebit = payment.meansCode === "59"
  return node("ram:SpecifiedTradeSettlementPaymentMeans", [
    leaf("ram:TypeCode", payment.meansCode),
    iban && isDirectDebit
      ? node("ram:PayerPartyDebtorFinancialAccount", [leaf("ram:IBANID", iban)])
      : undefined,
    iban && !isDirectDebit
      ? node("ram:PayeePartyCreditorFinancialAccount", [leaf("ram:IBANID", iban)])
      : undefined,
    bic && !isDirectDebit && profile === "EN16931"
      ? node("ram:PayeeSpecifiedCreditorFinancialInstitution", [leaf("ram:BICID", bic)])
      : undefined,
  ])
}

function settlementNode(invoice: Invoice, totals: InvoiceTotals, profile: FacturXProfile): XmlNode {
  const { payment } = invoice
  // The invoice carries ONE free-text exemption reason, which can only describe ONE regime. With
  // several exempt categories on the same invoice, giving it to all of them would print a wrong
  // legal basis on the others (CGI 242 nonies A annexe II wants the provision per operation): the
  // typed text goes to the primary regime and the others use their standard wording.
  const exemptCategories = new Set<VatCategory>(
    totals.vatBreakdown.map((b) => b.category).filter((c) => c !== "S" && c !== "Z"),
  )
  const primaryExempt = EXEMPTION_PRIORITY.find((c) => exemptCategories.has(c))
  const reasonFor = (category: VatCategory): string | undefined => {
    if (category === "S" || category === "Z") return undefined
    const typed = category === primaryExempt ? invoice.vatExemptionReason?.trim() : undefined
    return typed || DEFAULT_EXEMPTION_REASONS[category]
  }
  const reasonCodeFor = (category: VatCategory, reason: string | undefined): string | undefined => {
    if (category === "E") return isFranchiseReason(reason) ? "VATEX-FR-FRANCHISE" : undefined
    return EXEMPTION_CODES[category]
  }
  const hasTerms = !!payment.termsText?.trim() || !!invoice.dueDate
  return node("ram:ApplicableHeaderTradeSettlement", [
    payment.reference?.trim() ? leaf("ram:PaymentReference", payment.reference) : undefined,
    leaf("ram:InvoiceCurrencyCode", invoice.currency.toUpperCase()),
    paymentMeansNode(invoice, profile),
    ...totals.vatBreakdown.map((b) => {
      const reason = reasonFor(b.category)
      return taxNode(b.category, b.rate, {
        calculated: b.taxAmount,
        basis: b.taxableAmount,
        reason,
        reasonCode: reasonCodeFor(b.category, reason),
        // VAT on debits: tax becomes chargeable at invoice issue (UNTDID 2005 code 5).
        dueCode: invoice.vatOnDebits ? "5" : undefined,
      })
    }),
    hasTerms
      ? node("ram:SpecifiedTradePaymentTerms", [
          payment.termsText?.trim() ? leaf("ram:Description", payment.termsText) : undefined,
          invoice.dueDate ? dateTime("ram:DueDateDateTime", invoice.dueDate) : undefined,
        ])
      : undefined,
    node("ram:SpecifiedTradeSettlementHeaderMonetarySummation", [
      leaf("ram:LineTotalAmount", amount(totals.lineTotal)),
      leaf("ram:TaxBasisTotalAmount", amount(totals.taxBasisTotal)),
      leaf("ram:TaxTotalAmount", amount(totals.taxTotal), {
        currencyID: invoice.currency.toUpperCase(),
      }),
      leaf("ram:GrandTotalAmount", amount(totals.grandTotal)),
      totals.prepaid !== 0 ? leaf("ram:TotalPrepaidAmount", amount(totals.prepaid)) : undefined,
      leaf("ram:DuePayableAmount", amount(totals.dueAmount)),
    ]),
    // BT-25 / BT-26: the invoice a credit note corrects (comes after the monetary summation).
    invoice.precedingInvoice?.number.trim()
      ? node("ram:InvoiceReferencedDocument", [
          leaf("ram:IssuerAssignedID", invoice.precedingInvoice.number.trim()),
          invoice.precedingInvoice.issueDate
            ? node("ram:FormattedIssueDateTime", [
                leaf("qdt:DateTimeString", date102(invoice.precedingInvoice.issueDate), {
                  format: "102",
                }),
              ])
            : undefined,
        ])
      : undefined,
  ])
}

/**
 * Serialize an invoice as UN/CEFACT CII D16B XML for the given Factur-X profile.
 * Input must already be a complete `Invoice` (validated). Pure, synchronous, deterministic
 * (same input → same bytes: no timestamps). Output is UTF-8 text starting with an XML
 * declaration. See docs of the lane report for the field → element mapping.
 */
export function buildFacturXXml(invoice: Invoice, options?: { profile?: FacturXProfile }): string {
  const profile = options?.profile ?? DEFAULT_PROFILE
  const totals = computeTotals(invoice)
  const categories = new Set(totals.vatBreakdown.map((b) => b.category))
  // BR-O-02: "not subject to VAT" invoices must carry no seller / buyer VAT identifier.
  const notSubject = categories.has("O")

  // BR-IC-11/12: intra-community supplies need a delivery date and a deliver-to country.
  const intraCommunity = categories.has("K")
  const shipTo = invoice.deliveryAddress ?? (intraCommunity ? invoice.buyer.address : undefined)
  // The delivery element may not be empty; the issue date is the accepted default (BT-72).
  const deliveryDate = invoice.deliveryDate ?? invoice.issueDate

  const root = node(
    "rsm:CrossIndustryInvoice",
    [
      node("rsm:ExchangedDocumentContext", [
        node("ram:BusinessProcessSpecifiedDocumentContextParameter", [
          leaf("ram:ID", billingMode(invoice, totals)),
        ]),
        node("ram:GuidelineSpecifiedDocumentContextParameter", [
          leaf("ram:ID", GUIDELINE_IDS[profile]),
        ]),
      ]),
      node("rsm:ExchangedDocument", [
        leaf("ram:ID", invoice.number),
        leaf("ram:TypeCode", invoice.typeCode),
        dateTime("ram:IssueDateTime", invoice.issueDate),
        ...buildNotes(invoice).map(noteNode),
      ]),
      node("rsm:SupplyChainTradeTransaction", [
        ...lineNodes(invoice, totals, profile),
        node("ram:ApplicableHeaderTradeAgreement", [
          invoice.buyerReference?.trim()
            ? leaf("ram:BuyerReference", invoice.buyerReference)
            : undefined,
          partyNode("ram:SellerTradeParty", invoice.seller, {
            withVatNumber: !notSubject,
            withContact: profile === "EN16931",
            fiscalRegistrationFallback: true,
            // Legal form and share capital are BT-33; the RCS identity stays in the ABL note.
            description: profile === "EN16931" ? sellerLegalDescription(invoice.seller) : undefined,
          }),
          partyNode("ram:BuyerTradeParty", invoice.buyer, {
            withVatNumber: !notSubject,
            withContact: profile === "EN16931",
            fiscalRegistrationFallback: false,
          }),
          invoice.orderReference?.trim()
            ? node("ram:BuyerOrderReferencedDocument", [
                leaf("ram:IssuerAssignedID", invoice.orderReference),
              ])
            : undefined,
        ]),
        node("ram:ApplicableHeaderTradeDelivery", [
          shipTo
            ? node("ram:ShipToTradeParty", [
                leaf("ram:Name", invoice.buyer.name),
                addressNode(shipTo),
              ])
            : undefined,
          node("ram:ActualDeliverySupplyChainEvent", [
            dateTime("ram:OccurrenceDateTime", deliveryDate),
          ]),
        ]),
        settlementNode(invoice, totals, profile),
      ]),
    ],
    {
      "xmlns:rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
      "xmlns:ram":
        "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
      "xmlns:qdt": "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
      "xmlns:udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
      "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
    },
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n${render(root, 0)}\n`
}
