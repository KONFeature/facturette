/**
 * Core invoice model. Single source of truth shared by extraction, the form, validation,
 * Factur-X XML generation and storage.
 *
 * - `invoiceSchema` describes a *structurally complete* invoice (what the XML builder consumes).
 * - The form and the extractor work on `InvoiceDraft` (everything optional, deeply).
 * - Business rules (checksums, French mandatory mentions, conditional requirements) live in
 *   `src/lib/validation`, not here.
 *
 * Money and quantities are plain JS numbers at the edges; all arithmetic goes through
 * `src/domain/totals.ts` (decimal.js). Never sum amounts with `+` elsewhere.
 */
import { z } from "zod"

// ---------------------------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------------------------

/** EN 16931 VAT category codes (UNTDID 5305 subset). */
export const VAT_CATEGORIES = [
  { code: "S", label: "TVA applicable (taux normal ou réduit)" },
  { code: "Z", label: "Taux zéro" },
  { code: "E", label: "Exonéré de TVA (ex. franchise en base, art. 293 B du CGI)" },
  { code: "AE", label: "Autoliquidation" },
  { code: "K", label: "Livraison intracommunautaire exonérée" },
  { code: "G", label: "Exportation hors UE exonérée" },
  { code: "O", label: "Hors champ de la TVA" },
] as const
export type VatCategory = (typeof VAT_CATEGORIES)[number]["code"]
export const vatCategorySchema = z.enum(["S", "Z", "E", "AE", "K", "G", "O"])

/** Metropolitan France VAT rates, in percent. Overseas rates (8.5, 1.05) are free-typed. */
export const FRENCH_VAT_RATES = [20, 10, 5.5, 2.1] as const

/** UN/ECE Recommendation 20 unit codes offered in the UI. `C62` = "one" (unité). */
export const UNIT_CODES = [
  { code: "C62", label: "unité" },
  { code: "HUR", label: "heure" },
  { code: "DAY", label: "jour" },
  { code: "MON", label: "mois" },
  { code: "LS", label: "forfait" },
  { code: "KGM", label: "kg" },
  { code: "MTR", label: "m" },
  { code: "MTK", label: "m²" },
  { code: "LTR", label: "litre" },
] as const

/** UNTDID 4461 payment means subset. */
export const PAYMENT_MEANS = [
  { code: "58", label: "Virement SEPA" },
  { code: "30", label: "Virement" },
  { code: "59", label: "Prélèvement SEPA" },
  { code: "48", label: "Carte bancaire" },
  { code: "20", label: "Chèque" },
  { code: "10", label: "Espèces" },
] as const

/** UNTDID 1001 document type codes supported by the tool. */
export const INVOICE_TYPES = [
  { code: "380", label: "Facture" },
  { code: "381", label: "Avoir" },
] as const

export const OPERATION_CATEGORIES = [
  { code: "services", label: "Prestation de services" },
  { code: "goods", label: "Livraison de biens" },
  { code: "mixed", label: "Mixte (biens et services)" },
] as const

/**
 * Legal mentions that French B2B invoices must carry. Pre-filled as editable defaults.
 * - Late payment penalty rate: at least 3x the legal interest rate (art. L441-10 Code de commerce).
 * - Fixed recovery fee: 40 € (art. D441-5 Code de commerce).
 */
export const DEFAULT_LEGAL_NOTES = {
  latePaymentPenalty:
    "En cas de retard de paiement, une pénalité égale à 3 fois le taux d'intérêt légal sera appliquée.",
  recoveryFee:
    "Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 €.",
  earlyPaymentDiscount: "Pas d'escompte pour paiement anticipé.",
} as const

export const VAT_FRANCHISE_REASON = "TVA non applicable, art. 293 B du CGI"

// ---------------------------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------------------------

/** ISO 8601 calendar date, `YYYY-MM-DD`. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue : AAAA-MM-JJ")

export const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  postalCode: z.string().min(1),
  city: z.string().min(1),
  /** ISO 3166-1 alpha-2. */
  countryCode: z.string().length(2),
})
export type Address = z.infer<typeof addressSchema>

export const partySchema = z.object({
  name: z.string().min(1),
  /** `individual` = private customer (no SIREN expected). Sellers are always `company`. */
  kind: z.enum(["company", "individual"]).default("company"),
  /** 9 digits. Derivable from `siret` or a French VAT number. */
  siren: z.string().optional(),
  /** 14 digits (SIREN + NIC). */
  siret: z.string().optional(),
  /** Intra-community VAT number, e.g. `FR12345678901`. */
  vatNumber: z.string().optional(),
  address: addressSchema,
  email: z.string().optional(),
  phone: z.string().optional(),
})
export type Party = z.infer<typeof partySchema>

export const sellerSchema = partySchema.extend({
  /** "SARL", "SAS", "EI", "Micro-entreprise"… */
  legalForm: z.string().optional(),
  /** Free text, e.g. "10 000 €". */
  shareCapital: z.string().optional(),
  /** Free text, e.g. "RCS Paris 123 456 789" or "RM 123 456 789 Lyon". */
  registration: z.string().optional(),
})
export type Seller = z.infer<typeof sellerSchema>

export const invoiceLineSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  quantity: z.number(),
  /** UN/ECE Rec. 20 code, see `UNIT_CODES`. */
  unitCode: z.string().min(1),
  /** Net (excl. VAT) unit price. */
  unitPrice: z.number(),
  vatCategory: vatCategorySchema,
  /** Percent, e.g. 20. Forced to 0 for every category except `S`. */
  vatRate: z.number().min(0),
})
export type InvoiceLine = z.infer<typeof invoiceLineSchema>

export const paymentSchema = z.object({
  /** UNTDID 4461, see `PAYMENT_MEANS`. */
  meansCode: z.string().min(1),
  iban: z.string().optional(),
  bic: z.string().optional(),
  /** Payment reference the buyer should quote (BT-83). */
  reference: z.string().optional(),
  /** Free text payment terms, e.g. "Paiement à 30 jours fin de mois". */
  termsText: z.string().optional(),
})
export type Payment = z.infer<typeof paymentSchema>

export const legalNotesSchema = z.object({
  latePaymentPenalty: z.string().optional(),
  recoveryFee: z.string().optional(),
  earlyPaymentDiscount: z.string().optional(),
})
export type LegalNotes = z.infer<typeof legalNotesSchema>

export const invoiceSchema = z.object({
  /** BT-1. Must be unique and chronological per seller. */
  number: z.string().min(1),
  /** BT-3, UNTDID 1001: "380" invoice, "381" credit note. */
  typeCode: z.enum(["380", "381"]),
  /** BT-2. */
  issueDate: isoDateSchema,
  /** BT-9. */
  dueDate: isoDateSchema.optional(),
  /** BT-72 delivery / service completion date. */
  deliveryDate: isoDateSchema.optional(),
  /** French e-invoicing mention "catégorie d'opération". */
  operationCategory: z.enum(["services", "goods", "mixed"]),
  /** French option "TVA sur les débits" (mention required when chosen). */
  vatOnDebits: z.boolean().optional(),
  /** BT-5. Only EUR is supported for now. */
  currency: z.string().length(3),
  seller: sellerSchema,
  buyer: partySchema,
  /** BT-70..: only when different from the buyer address. */
  deliveryAddress: addressSchema.optional(),
  /** BT-10, e.g. a service code required by public buyers. */
  buyerReference: z.string().optional(),
  /** BT-13 purchase order reference. */
  orderReference: z.string().optional(),
  lines: z.array(invoiceLineSchema).min(1),
  /** BT-120 free text; required for categories E/AE/K/G/O. */
  vatExemptionReason: z.string().optional(),
  /** BT-113 already paid amount (deposit). */
  prepaidAmount: z.number().min(0).optional(),
  payment: paymentSchema,
  legalNotes: legalNotesSchema.optional(),
  /** BT-22 free text printed as an invoice note. */
  notes: z.string().optional(),
})
export type Invoice = z.infer<typeof invoiceSchema>

// ---------------------------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------------------------

export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

/** What the form edits and what extraction produces: any field may be missing. */
export type InvoiceDraft = DeepPartial<Invoice>

export function emptyLine(): DeepPartial<InvoiceLine> {
  return { name: "", quantity: 1, unitCode: "C62", vatCategory: "S", vatRate: 20 }
}

/** Starting point for a brand-new draft. Sensible French defaults, no personal data. */
export function emptyInvoiceDraft(): InvoiceDraft {
  return {
    typeCode: "380",
    currency: "EUR",
    seller: { kind: "company", address: { countryCode: "FR" } },
    buyer: { kind: "company", address: { countryCode: "FR" } },
    lines: [emptyLine()],
    payment: { meansCode: "58" },
    legalNotes: { ...DEFAULT_LEGAL_NOTES },
  }
}

// ---------------------------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------------------------

/** SIREN = first 9 digits of a SIRET, or the last 9 digits of a French VAT number. */
export function deriveSiren(party: {
  siren?: string
  siret?: string
  vatNumber?: string
}): string | undefined {
  const digits = (s?: string) => s?.replace(/\s+/g, "")
  const siren = digits(party.siren)
  if (siren && /^\d{9}$/.test(siren)) return siren
  const siret = digits(party.siret)
  if (siret && /^\d{14}$/.test(siret)) return siret.slice(0, 9)
  const vat = digits(party.vatNumber)?.toUpperCase()
  if (vat && /^FR[0-9A-Z]{2}\d{9}$/.test(vat)) return vat.slice(4)
  return undefined
}
