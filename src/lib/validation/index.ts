import type { InvoiceDraft } from "../../domain/invoice"

export type IssueSeverity = "error" | "warning"

export interface ValidationIssue {
  /** Dot path matching `Suggestion.path` / react-hook-form field names, e.g. "seller.siret". */
  path: string
  /** Stable machine code, e.g. "required", "siret.checksum", "vat.key". */
  code: string
  severity: IssueSeverity
  /** French, user-facing, actionable. */
  message: string
}

export interface ValidationReport {
  issues: ValidationIssue[]
  /** True when there is no `error`: the Factur-X file may be built. Warnings never block. */
  ready: boolean
}

/**
 * Everything that must hold before a compliant Factur-X can be produced: required fields
 * (conditional ones included), identifier checksums, French mandatory mentions, EN 16931
 * business rules that the form can break (VAT category vs. exemption reason, totals…).
 *
 * OWNER: lane `validation`. Keep these signatures.
 */
export function validateInvoice(_draft: InvoiceDraft): ValidationReport {
  throw new Error("validateInvoice: not implemented")
}

/**
 * Paths of the fields currently required, so the form can mark them. Conditional: depends on
 * the draft (e.g. `vatExemptionReason` only when a line is not category S).
 */
export function requiredPaths(_draft: InvoiceDraft): string[] {
  throw new Error("requiredPaths: not implemented")
}
