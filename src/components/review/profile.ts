/**
 * Draft <-> saved seller profile / saved customer. Saving is always an explicit user choice;
 * these helpers only build the objects (storage does the I/O).
 */
import { type InvoiceDraft, type Party, partySchema, sellerSchema } from "../../domain/invoice"
import type { SellerProfile } from "../../lib/storage"
import type { ValidationIssue } from "../../lib/validation"

export type SellerProfileInput = Omit<SellerProfile, "updatedAt">

const hasError = (issues: readonly ValidationIssue[], prefix: string): boolean =>
  issues.some(
    (i) => i.severity === "error" && (i.path === prefix || i.path.startsWith(`${prefix}.`)),
  )

/** The seller block is complete (schema) and has no blocking issue: worth remembering. */
export function canMemorizeSeller(
  draft: InvoiceDraft,
  issues: readonly ValidationIssue[],
): boolean {
  return sellerSchema.safeParse(draft.seller).success && !hasError(issues, "seller")
}

/** The buyer block is complete (schema) and has no blocking issue: worth remembering. */
export function canMemorizeBuyer(draft: InvoiceDraft, issues: readonly ValidationIssue[]): boolean {
  return partySchema.safeParse(draft.buyer).success && !hasError(issues, "buyer")
}

/** Seller + payment + legal notes + default VAT, as saved by `saveSellerProfile`. */
export function sellerProfileFromDraft(draft: InvoiceDraft): SellerProfileInput | null {
  const seller = sellerSchema.safeParse(draft.seller)
  if (!seller.success) return null

  const payment = draft.payment
  const line = draft.lines?.[0]
  const vatCategory =
    line?.vatCategory === "S" || line?.vatCategory === "E" ? line.vatCategory : undefined
  const profile: SellerProfileInput = { seller: seller.data }

  if (payment?.meansCode) {
    profile.payment = {
      meansCode: payment.meansCode,
      iban: payment.iban,
      bic: payment.bic,
      termsText: payment.termsText,
    }
  }
  if (draft.legalNotes) {
    const { latePaymentPenalty, recoveryFee, earlyPaymentDiscount } = draft.legalNotes
    if (latePaymentPenalty || recoveryFee || earlyPaymentDiscount) {
      profile.legalNotes = { latePaymentPenalty, recoveryFee, earlyPaymentDiscount }
    }
  }
  profile.defaults = {
    vatCategory,
    vatRate: vatCategory === "S" ? line?.vatRate : undefined,
    vatExemptionReason: draft.vatExemptionReason,
    unitCode: line?.unitCode,
  }
  return profile
}

/** The draft fields a profile can fill, to mark them "Profil enregistré" when they match. */
export function profileAsDraft(profile: SellerProfile | null): InvoiceDraft | undefined {
  if (!profile) return undefined
  return {
    seller: profile.seller,
    payment: profile.payment,
    legalNotes: profile.legalNotes,
    vatExemptionReason: profile.defaults?.vatExemptionReason,
  }
}

export function customerFromDraft(draft: InvoiceDraft): Party | null {
  const parsed = partySchema.safeParse(draft.buyer)
  return parsed.success ? parsed.data : null
}

/** "Profil enregistré le 3 mars 2026" (local date), or `null` when the stamp is unreadable. */
export function formatSavedDate(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)
}
