import { z } from "zod"
import { vatCategorySchema } from "../../domain/invoice"

/**
 * Lenient mirror of `invoiceSchema` for in-progress drafts: every field optional and no
 * `min(1)`/length constraints (the form legitimately holds empty strings). Types and enums
 * are still enforced so foreign or corrupt data is rejected. Unknown keys are dropped.
 */
const addressDraft = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  countryCode: z.string().optional(),
})

const partyDraftShape = {
  name: z.string().optional(),
  kind: z.enum(["company", "individual"]).optional(),
  siren: z.string().optional(),
  siret: z.string().optional(),
  vatNumber: z.string().optional(),
  address: addressDraft.optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
}

const partyDraft = z.object(partyDraftShape)

const sellerDraft = z.object({
  ...partyDraftShape,
  legalForm: z.string().optional(),
  shareCapital: z.string().optional(),
  registration: z.string().optional(),
})

const lineDraft = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unitCode: z.string().optional(),
  unitPrice: z.number().optional(),
  vatCategory: vatCategorySchema.optional(),
  vatRate: z.number().optional(),
})

const paymentDraft = z.object({
  meansCode: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  reference: z.string().optional(),
  termsText: z.string().optional(),
})

const legalNotesDraft = z.object({
  latePaymentPenalty: z.string().optional(),
  recoveryFee: z.string().optional(),
  earlyPaymentDiscount: z.string().optional(),
})

export const invoiceDraftSchema = z.object({
  number: z.string().optional(),
  typeCode: z.enum(["380", "381"]).optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  operationCategory: z.enum(["services", "goods", "mixed"]).optional(),
  vatOnDebits: z.boolean().optional(),
  currency: z.string().optional(),
  seller: sellerDraft.optional(),
  buyer: partyDraft.optional(),
  deliveryAddress: addressDraft.optional(),
  buyerReference: z.string().optional(),
  orderReference: z.string().optional(),
  lines: z.array(lineDraft).optional(),
  vatExemptionReason: z.string().optional(),
  prepaidAmount: z.number().optional(),
  payment: paymentDraft.optional(),
  legalNotes: legalNotesDraft.optional(),
  notes: z.string().optional(),
})
