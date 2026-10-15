import type { FacturXProfile } from "./types"

export interface EmbedOptions {
  profile?: FacturXProfile
  /** Used for the PDF Info dictionary and XMP metadata. */
  invoice: { number: string; issueDate: string; sellerName: string; typeCode?: "380" | "381" }
}

export interface PreflightIssue {
  code: string
  /** `blocker`: cannot produce a conformant file. `warning`: may not pass strict PDF/A-3 checks. */
  severity: "blocker" | "warning"
  /** French, user-facing. */
  message: string
}

export interface PreflightReport {
  issues: PreflightIssue[]
  /** False if there is a blocker (e.g. encrypted PDF). */
  canEmbed: boolean
}

/**
 * Turn an ordinary PDF into a Factur-X PDF: attach `factur-x.xml` (AFRelationship, /AF, names
 * tree), write the XMP metadata (PDF/A-3 identification + Factur-X extension schema), add an
 * sRGB output intent when needed. The visual content of the original PDF is untouched.
 * Runs in the browser; pure bytes in, bytes out.
 *
 * Acceptance: `bun scripts/validate-facturx.ts out.pdf` must report VALID for the PDFs produced
 * by the fixtures lane.
 *
 * OWNER: lane `facturx-pdf`. Keep these signatures.
 */
export async function embedFacturX(
  _pdf: Uint8Array,
  _xml: string,
  _options: EmbedOptions,
): Promise<Uint8Array> {
  throw new Error("embedFacturX: not implemented")
}

/** Cheap, offline checks telling the user up-front if the PDF is a poor PDF/A-3 candidate. */
export async function preflightPdf(_pdf: Uint8Array): Promise<PreflightReport> {
  throw new Error("preflightPdf: not implemented")
}
