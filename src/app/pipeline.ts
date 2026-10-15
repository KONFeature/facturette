import { deriveSiren, type InvoiceDraft } from "../domain/invoice"
import type { ExtractionResult } from "../lib/extract/types"
import type { PdfTextDocument } from "../lib/pdf/types"
import type { SellerProfile } from "../lib/storage"
import type { AppDeps } from "./deps"
import { buildStartingDraft } from "./merge"

export const MAX_PDF_BYTES = 20 * 1024 * 1024

export type PdfLoadErrorKind = "not-pdf" | "too-big" | "empty" | "encrypted" | "unreadable"

/** A user-facing failure of the import step. `message` is French and actionable. */
export class PdfLoadError extends Error {
  constructor(
    public readonly kind: PdfLoadErrorKind,
    message: string,
  ) {
    super(message)
    this.name = "PdfLoadError"
  }
}

/** The minimal File surface the pipeline needs (a real `File` satisfies it). */
export interface PdfFileLike {
  name: string
  size: number
  type: string
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface LoadedPdf {
  pdf: { name: string; size: number; bytes: Uint8Array }
  textDoc: PdfTextDocument
  extraction: ExtractionResult
  /** Starting draft for the review form: defaults merged under what was detected. */
  draft: InvoiceDraft
  /** True when the PDF has no text layer: nothing was detected, the user fills everything. */
  scanned: boolean
}

export const SCANNED_WARNING =
  "Aucun texte détecté : ce PDF est probablement une numérisation. Aucun champ n’a pu être pré-rempli."

/** `%PDF-` may be preceded by a few junk bytes; the spec allows it in the first 1024. */
export function hasPdfMagic(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - 4, 1024)
  for (let i = 0; i < limit; i++) {
    if (
      bytes[i] === 0x25 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x44 &&
      bytes[i + 3] === 0x46 &&
      bytes[i + 4] === 0x2d
    ) {
      return true
    }
  }
  return false
}

function mapReadError(error: unknown): PdfLoadError {
  // Duck-typed on purpose: importing PdfReadError would pull pdf.js into the entry bundle.
  const reason =
    error instanceof Error && error.name === "PdfReadError"
      ? (error as Error & { reason?: string }).reason
      : undefined
  if (reason === "encrypted") {
    return new PdfLoadError(
      "encrypted",
      "Ce PDF est protégé par un mot de passe. Retirez la protection (ou réexportez le PDF sans mot de passe), puis réessayez.",
    )
  }
  if (reason === "unsupported") {
    return new PdfLoadError(
      "unreadable",
      "Ce format de PDF n’est pas pris en charge. Réexportez la facture en PDF standard depuis votre logiciel.",
    )
  }
  return new PdfLoadError(
    "unreadable",
    "Impossible de lire ce PDF : le fichier semble corrompu. Réexportez-le depuis votre logiciel de facturation et réessayez.",
  )
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn()
  } catch {
    return null
  }
}

/**
 * Import pipeline: validate the file, read the text layer, extract invoice fields (hinted with
 * the saved seller profile), then merge saved defaults under the detected values.
 * Throws `PdfLoadError` for every expected failure.
 */
export async function loadPdfPipeline(file: PdfFileLike, deps: AppDeps): Promise<LoadedPdf> {
  if (file.type && file.type !== "application/pdf") {
    throw new PdfLoadError(
      "not-pdf",
      "Ce fichier n’est pas un PDF. Déposez votre facture au format PDF.",
    )
  }
  if (file.size === 0) {
    throw new PdfLoadError(
      "empty",
      "Ce fichier est vide. Choisissez un PDF contenant votre facture.",
    )
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new PdfLoadError(
      "too-big",
      "Ce PDF dépasse 20 Mo. Réexportez-le en version allégée puis réessayez.",
    )
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    throw new PdfLoadError("unreadable", "Le fichier n’a pas pu être lu. Réessayez.")
  }
  if (!hasPdfMagic(bytes)) {
    throw new PdfLoadError(
      "not-pdf",
      "Ce fichier n’est pas un PDF valide (en-tête %PDF absent). Déposez votre facture au format PDF.",
    )
  }

  let textDoc: PdfTextDocument
  try {
    // pdf.js may detach the buffer it receives: hand it a copy, keep the original bytes.
    textDoc = await deps.extractPdfText(bytes.slice())
  } catch (error) {
    throw mapReadError(error)
  }

  const profile: SellerProfile | null = safe(() => deps.loadSellerProfile())
  const nextNumber = safe(() => deps.suggestNextInvoiceNumber())
  const scanned = !textDoc.hasTextLayer

  let extraction: ExtractionResult
  if (scanned) {
    extraction = { suggestions: [], draft: {}, warnings: [SCANNED_WARNING] }
  } else {
    extraction = safe(() =>
      deps.extractInvoice(textDoc, {
        hints: profile
          ? {
              sellerSiren: deriveSiren(profile.seller),
              sellerVatNumber: profile.seller.vatNumber,
              sellerName: profile.seller.name,
            }
          : undefined,
      }),
    ) ?? {
      suggestions: [],
      draft: {},
      warnings: ["La détection automatique a échoué : renseignez les champs à la main."],
    }
  }

  return {
    pdf: { name: file.name, size: file.size, bytes },
    textDoc,
    extraction,
    draft: buildStartingDraft(extraction.draft, profile, nextNumber),
    scanned,
  }
}
