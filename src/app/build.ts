import { type Invoice, type InvoiceDraft, invoiceSchema } from "../domain/invoice"
import { computeTotals, type InvoiceTotals } from "../domain/totals"
import type { PreflightIssue } from "../lib/facturx/embed"
import { DEFAULT_PROFILE, type FacturXProfile } from "../lib/facturx/types"
import type { AppDeps } from "./deps"

export interface BuiltFacturX {
  /** Factur-X PDF bytes (original visual + embedded factur-x.xml). */
  bytes: Uint8Array
  invoice: Invoice
  totals: InvoiceTotals
  profile: FacturXProfile
  /** Non-blocking findings from the preflight (e.g. fonts not embedded). */
  warnings: PreflightIssue[]
  filename: string
}

/** A user-facing failure of the build step; `message` is French. */
export class BuildError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BuildError"
  }
}

/** `facture-<slug>-facturx.pdf`, with the number made filesystem-safe. */
export function facturxFilename(number: string): string {
  const slug = number
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `facture-${slug || "sans-numero"}-facturx.pdf`
}

/** preflight → schema parse → XML → embed. Throws `BuildError` with French messages. */
export async function buildFacturX(
  draft: InvoiceDraft,
  originalPdf: Uint8Array,
  deps: AppDeps,
  profile: FacturXProfile = DEFAULT_PROFILE,
): Promise<BuiltFacturX> {
  const preflight = await deps.preflightPdf(originalPdf)
  const blockers = preflight.issues.filter((i) => i.severity === "blocker")
  if (!preflight.canEmbed || blockers.length > 0) {
    throw new BuildError(
      blockers.map((b) => b.message).join(" ") ||
        "Ce PDF ne peut pas recevoir la pièce jointe Factur-X.",
    )
  }

  const parsed = invoiceSchema.safeParse(draft)
  if (!parsed.success) {
    throw new BuildError(
      "La facture est incomplète ou invalide. Revenez à l’étape « Vérifier » pour compléter les champs.",
    )
  }
  const invoice = parsed.data

  let xml: string
  try {
    xml = deps.buildFacturXXml(invoice, { profile })
  } catch {
    throw new BuildError("La génération du XML Factur-X a échoué. Vérifiez les données saisies.")
  }

  let bytes: Uint8Array
  try {
    bytes = await deps.embedFacturX(originalPdf, xml, {
      profile,
      invoice: {
        number: invoice.number,
        issueDate: invoice.issueDate,
        sellerName: invoice.seller.name,
        typeCode: invoice.typeCode,
      },
    })
  } catch {
    throw new BuildError(
      "L’intégration du XML dans le PDF a échoué. Essayez avec un PDF réexporté depuis votre logiciel.",
    )
  }

  return {
    bytes,
    invoice,
    totals: computeTotals(invoice),
    profile,
    warnings: preflight.issues.filter((i) => i.severity === "warning"),
    filename: facturxFilename(invoice.number),
  }
}
