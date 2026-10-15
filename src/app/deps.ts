/**
 * Injection points for everything heavy or I/O-bound. The app wires the real modules
 * (`defaultDeps`, pdf.js and pdf-lib are loaded lazily); unit tests pass fakes.
 */
import type { Invoice, InvoiceDraft } from "../domain/invoice"
import { extractInvoice } from "../lib/extract"
import type { ExtractionOptions, ExtractionResult } from "../lib/extract/types"
import type { EmbedOptions, PreflightReport } from "../lib/facturx/embed"
import type { FacturXProfile } from "../lib/facturx/types"
import { buildFacturXXml } from "../lib/facturx/xml"
import type { PdfTextDocument } from "../lib/pdf/types"
import {
  clearAllData,
  loadSellerProfile,
  rememberInvoiceNumber,
  type SellerProfile,
  suggestNextInvoiceNumber,
} from "../lib/storage"
import { type ValidationReport, validateInvoice } from "../lib/validation"

export interface AppDeps {
  extractPdfText(data: Uint8Array): Promise<PdfTextDocument>
  extractInvoice(doc: PdfTextDocument, options?: ExtractionOptions): ExtractionResult
  loadSellerProfile(): SellerProfile | null
  suggestNextInvoiceNumber(): string | null
  rememberInvoiceNumber(number: string): void
  clearAllData(): void
  validateInvoice(draft: InvoiceDraft): ValidationReport
  buildFacturXXml(invoice: Invoice, options?: { profile?: FacturXProfile }): string
  embedFacturX(pdf: Uint8Array, xml: string, options: EmbedOptions): Promise<Uint8Array>
  preflightPdf(pdf: Uint8Array): Promise<PreflightReport>
}

/** Light synchronous modules are bound directly; pdf.js and pdf-lib are loaded on demand. */
export const defaultDeps: AppDeps = {
  extractPdfText: async (data) => (await import("../lib/pdf/extract-text")).extractPdfText(data),
  extractInvoice,
  loadSellerProfile: () => loadSellerProfile(),
  suggestNextInvoiceNumber: () => suggestNextInvoiceNumber(),
  rememberInvoiceNumber: (n) => rememberInvoiceNumber(n),
  clearAllData: () => clearAllData(),
  validateInvoice,
  buildFacturXXml,
  embedFacturX: async (pdf, xml, options) =>
    (await import("../lib/facturx/embed")).embedFacturX(pdf, xml, options),
  preflightPdf: async (pdf) => (await import("../lib/facturx/embed")).preflightPdf(pdf),
}
