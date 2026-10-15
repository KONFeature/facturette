/**
 * Issue -> field mapping. A validation issue path ("seller.siret", "lines.2.unitPrice") is also
 * the `name` of the matching form input, so focusing a field is a DOM lookup by name. Paths with
 * no input of their own (e.g. "lines" when there is no line) fall back to their section.
 */
import type { ValidationIssue } from "../../lib/validation"

export const SECTIONS = [
  { id: "facture", label: "Facture" },
  { id: "vendeur", label: "Vendeur" },
  { id: "client", label: "Client" },
  { id: "lignes", label: "Lignes" },
  { id: "tva", label: "TVA et mentions" },
  { id: "paiement", label: "Paiement" },
] as const
export type SectionId = (typeof SECTIONS)[number]["id"]

export const sectionLabel = (id: SectionId): string =>
  SECTIONS.find((s) => s.id === id)?.label ?? id

const INVOICE_PATHS = new Set([
  "number",
  "typeCode",
  "issueDate",
  "dueDate",
  "deliveryDate",
  "operationCategory",
  "vatOnDebits",
  "currency",
])
const VAT_PATHS = new Set(["vatExemptionReason", "notes"])
const PAYMENT_PATHS = new Set(["prepaidAmount"])

export function sectionForPath(path: string): SectionId {
  const root = path.split(".")[0] ?? ""
  if (root === "seller") return "vendeur"
  if (root === "buyer" || root === "deliveryAddress") return "client"
  if (root === "buyerReference" || root === "orderReference") return "client"
  if (root === "lines") return "lignes"
  if (root === "legalNotes" || VAT_PATHS.has(root)) return "tva"
  if (root === "payment" || PAYMENT_PATHS.has(root)) return "paiement"
  if (INVOICE_PATHS.has(root)) return "facture"
  return "facture"
}

export interface IssueCounts {
  errors: number
  warnings: number
}

export function countIssues(issues: readonly ValidationIssue[]): IssueCounts {
  let errors = 0
  let warnings = 0
  for (const i of issues) {
    if (i.severity === "error") errors++
    else warnings++
  }
  return { errors, warnings }
}

/** Errors first, then warnings; each group keeps the validator's order. */
export function sortIssues(issues: readonly ValidationIssue[]): ValidationIssue[] {
  const rank = (i: ValidationIssue) => (i.severity === "error" ? 0 : 1)
  return [...issues].sort((a, b) => rank(a) - rank(b))
}

/** Group issues by section, in the order of the form. Empty sections are omitted. */
export function groupIssuesBySection(
  issues: readonly ValidationIssue[],
): { section: SectionId; issues: ValidationIssue[] }[] {
  return SECTIONS.map(({ id }) => ({
    section: id,
    issues: sortIssues(issues.filter((i) => sectionForPath(i.path) === id)),
  })).filter((g) => g.issues.length > 0)
}

/** Message of the "continue" button's reason line, in French. */
export function blockingReason({ errors }: IssueCounts): string | null {
  if (errors === 0) return null
  return errors === 1
    ? "Corrigez 1 erreur pour continuer."
    : `Corrigez ${errors} erreurs pour continuer.`
}

export function issueCountLabel({ errors, warnings }: IssueCounts): string {
  const e = errors === 0 ? "Aucune erreur" : errors === 1 ? "1 erreur" : `${errors} erreurs`
  const w =
    warnings === 0 ? "" : warnings === 1 ? ", 1 avertissement" : `, ${warnings} avertissements`
  return `${e}${w}`
}

/**
 * Validator issues plus the form's own number issues. When the user typed text that is not a
 * number, the draft no longer holds the value, so the validator reports "required" for the same
 * path: the more precise form issue replaces it.
 */
export function mergeIssues(
  validatorIssues: readonly ValidationIssue[],
  formIssues: readonly ValidationIssue[],
): ValidationIssue[] {
  const formPaths = new Set(formIssues.map((i) => i.path))
  return [
    ...formIssues,
    ...validatorIssues.filter((i) => !(i.code === "required" && formPaths.has(i.path))),
  ]
}
