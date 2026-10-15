import type { PdfTextDocument } from "../pdf/types"
import type { ExtractionOptions, ExtractionResult } from "./types"

/**
 * Heuristically extract invoice fields from a PDF text layer. Pure and synchronous: no I/O.
 * Must never throw on odd input; return fewer suggestions and a warning instead.
 *
 * OWNER: lane `extract`. Keep this signature.
 */
export function extractInvoice(
  _doc: PdfTextDocument,
  _options?: ExtractionOptions,
): ExtractionResult {
  throw new Error("extractInvoice: not implemented")
}

export type * from "./types"
