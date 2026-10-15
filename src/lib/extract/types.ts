import type { InvoiceDraft } from "../../domain/invoice"

export interface BoundingBox {
  /** 1-based. Same coordinate system as `PdfTextItem` (top-left origin, PDF points). */
  page: number
  x: number
  y: number
  width: number
  height: number
}

/** One candidate value for one invoice field, with where it came from. */
export interface Suggestion {
  /** Dot path into `Invoice`, e.g. "number", "seller.siret", "buyer.address.city", "lines.0.name". */
  path: string
  value: string | number | boolean
  /** 0..1. The UI pre-fills at >= 0.6 and only offers the value below that. */
  confidence: number
  /** The raw PDF text the value was read from, shown to the user as proof. */
  evidence: { text: string; bbox?: BoundingBox }
  /** Stable id of the rule that produced it (debugging, evaluation). */
  rule: string
}

export interface ExtractionOptions {
  /** Known seller (from the saved profile) helps tell seller from buyer. */
  hints?: { sellerSiren?: string; sellerVatNumber?: string; sellerName?: string }
}

export interface ExtractionResult {
  /** All candidates. Several may share a `path`; sorted by confidence, best first. */
  suggestions: Suggestion[]
  /** Best suggestion per path folded into a draft (what the form is pre-filled with). */
  draft: InvoiceDraft
  /** Human-readable French notes, e.g. "Aucun texte détecté : PDF scanné ?" */
  warnings: string[]
}
