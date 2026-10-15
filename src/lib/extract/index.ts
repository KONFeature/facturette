import type { PdfTextDocument } from "../pdf/types"
import { buildDraft, Collector, resolveConflicts } from "./collect"
import { extractHeader } from "./header"
import { buildLayout } from "./layout"
import { extractParties } from "./parties"
import { extractPayment, extractVatExemption } from "./payment"
import { extractLines } from "./table"
import { detectDecimalStyle } from "./text"
import type { ExtractionOptions, ExtractionResult } from "./types"

export const NO_TEXT_WARNING =
  "Aucun texte détecté dans ce PDF (document scanné ?) : saisissez les informations à la main."
const ERROR_WARNING =
  "L'analyse automatique du PDF a échoué : saisissez les informations à la main."
const NOTHING_FOUND_WARNING =
  "Aucune information de facture reconnue dans ce PDF : saisissez les informations à la main."

/**
 * Heuristically extract invoice fields from a PDF text layer. Pure and synchronous: no I/O.
 * Must never throw on odd input; return fewer suggestions and a warning instead.
 *
 * OWNER: lane `extract`. Keep this signature.
 */
export function extractInvoice(
  doc: PdfTextDocument,
  options?: ExtractionOptions,
): ExtractionResult {
  if (!doc?.hasTextLayer || !Array.isArray(doc.pages) || doc.pages.length === 0) {
    return { suggestions: [], draft: {}, warnings: [NO_TEXT_WARNING] }
  }
  try {
    return run(doc, options)
  } catch {
    return { suggestions: [], draft: {}, warnings: [ERROR_WARNING] }
  }
}

function run(doc: PdfTextDocument, options?: ExtractionOptions): ExtractionResult {
  const layout = buildLayout(doc)
  const collector = new Collector()
  const style = detectDecimalStyle(doc.text)

  const { isCreditNote } = extractHeader(layout, collector)
  extractParties(layout, collector, options)
  const exemption = extractVatExemption(layout, collector)
  extractLines(layout, collector, style, {
    isCreditNote,
    exemptCategory: exemption?.category,
    exemptReason: exemption?.reason,
  })
  extractPayment(layout, collector, isCreditNote)

  resolveConflicts(collector)
  const suggestions = [...collector.suggestions].sort(
    (a, b) => b.confidence - a.confidence || a.path.localeCompare(b.path),
  )
  const warnings = [...collector.warnings]
  if (suggestions.length === 0) warnings.push(NOTHING_FOUND_WARNING)
  return { suggestions, draft: buildDraft(suggestions), warnings }
}

export type * from "./types"
export { PREFILL_THRESHOLD } from "./types"
