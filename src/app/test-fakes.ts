import type { InvoiceDraft } from "../domain/invoice"
import type { ExtractionResult } from "../lib/extract/types"
import type { PdfTextDocument } from "../lib/pdf/types"
import type { SellerProfile } from "../lib/storage"
import type { AppDeps } from "./deps"
import type { PdfFileLike } from "./pipeline"

/** Test helpers: a File-like and a fully faked `AppDeps`. Not imported by app code. */
export function pdfFile(
  overrides: Partial<{ name: string; type: string; bytes: Uint8Array; size: number }> = {},
): PdfFileLike {
  const bytes = overrides.bytes ?? new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n")
  return {
    name: overrides.name ?? "facture.pdf",
    type: overrides.type ?? "application/pdf",
    size: overrides.size ?? bytes.length,
    arrayBuffer: async () => bytes.slice().buffer,
  }
}

export function textDoc(hasTextLayer = true): PdfTextDocument {
  return {
    pageCount: 1,
    pages: [],
    text: hasTextLayer ? "Facture F-1" : "",
    hasTextLayer,
    info: { isEncrypted: false },
  }
}

export function extraction(draft: InvoiceDraft): ExtractionResult {
  return { suggestions: [], draft, warnings: [] }
}

export const sellerProfile: SellerProfile = {
  seller: {
    name: "Ma Société SAS",
    kind: "company",
    siren: "732829320",
    vatNumber: "FR44732829320",
    legalForm: "SAS",
    address: { line1: "1 rue Profil", postalCode: "75001", city: "Paris", countryCode: "FR" },
  },
  payment: { meansCode: "30", iban: "FR7630006000011234567890189", termsText: "30 jours" },
  legalNotes: { latePaymentPenalty: "Pénalité profil" },
  defaults: { vatCategory: "E", vatRate: 0, vatExemptionReason: "Franchise", unitCode: "HUR" },
  updatedAt: "2026-01-01T00:00:00Z",
}

export function fakeDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    extractPdfText: async () => textDoc(),
    extractInvoice: () => extraction({}),
    loadSellerProfile: () => null,
    suggestNextInvoiceNumber: () => null,
    rememberInvoiceNumber: () => {},
    clearAllData: () => {},
    validateInvoice: () => ({ issues: [], ready: true }),
    buildFacturXXml: () => "<xml/>",
    embedFacturX: async (pdf) => pdf,
    preflightPdf: async () => ({ issues: [], canEmbed: true }),
    ...overrides,
  }
}
