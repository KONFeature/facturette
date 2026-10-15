import type { InvoiceDraft, LegalNotes, Party, Payment, Seller } from "../../domain/invoice"

/**
 * localStorage persistence. Everything is namespaced `facturette:v1:*`, validated with zod on
 * read (corrupt or foreign data is ignored, never thrown), and takes an injectable `Storage`
 * so it is unit-testable without a DOM. All functions are synchronous.
 *
 * Privacy: nothing leaves the browser. The imported PDF itself is never stored.
 *
 * OWNER: lane `storage`. Keep these signatures; additions are welcome.
 */

export interface SellerProfile {
  seller: Seller
  /** Payment details and legal texts reused on every new invoice. */
  payment?: Pick<Payment, "meansCode" | "iban" | "bic" | "termsText">
  legalNotes?: LegalNotes
  /** Default VAT for new lines. */
  defaults?: {
    vatCategory?: "S" | "E"
    vatRate?: number
    vatExemptionReason?: string
    unitCode?: string
  }
  updatedAt: string
}

export interface SavedCustomer {
  /** Stable id (SIREN if known, else slug of the name). */
  id: string
  party: Party
  updatedAt: string
}

export const loadSellerProfile = (_s?: Storage): SellerProfile | null => {
  throw new Error("not implemented")
}
export const saveSellerProfile = (_p: Omit<SellerProfile, "updatedAt">, _s?: Storage): void => {
  throw new Error("not implemented")
}
export const clearSellerProfile = (_s?: Storage): void => {
  throw new Error("not implemented")
}

export const listCustomers = (_s?: Storage): SavedCustomer[] => {
  throw new Error("not implemented")
}
/** Upsert by id. */
export const saveCustomer = (_party: Party, _s?: Storage): SavedCustomer => {
  throw new Error("not implemented")
}
export const deleteCustomer = (_id: string, _s?: Storage): void => {
  throw new Error("not implemented")
}

/** In-progress form values, so a refresh does not lose the work. */
export const loadDraft = (_s?: Storage): InvoiceDraft | null => {
  throw new Error("not implemented")
}
export const saveDraft = (_d: InvoiceDraft, _s?: Storage): void => {
  throw new Error("not implemented")
}
export const clearDraft = (_s?: Storage): void => {
  throw new Error("not implemented")
}

/** Remember the last issued number to propose the next one ("2026-009" → "2026-010"). */
export const rememberInvoiceNumber = (_number: string, _s?: Storage): void => {
  throw new Error("not implemented")
}
export const suggestNextInvoiceNumber = (_s?: Storage): string | null => {
  throw new Error("not implemented")
}

/** Wipe every `facturette:*` key. Exposed in the UI as "Effacer mes données". */
export const clearAllData = (_s?: Storage): void => {
  throw new Error("not implemented")
}
