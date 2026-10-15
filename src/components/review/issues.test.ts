import { describe, expect, it } from "vitest"
import { emptyInvoiceDraft } from "../../domain/invoice"
import { requiredPaths, type ValidationIssue, validateInvoice } from "../../lib/validation"
import { draftToForm, formToDraft } from "./formModel"
import {
  blockingReason,
  countIssues,
  groupIssuesBySection,
  issueCountLabel,
  mergeIssues,
  SECTIONS,
  sectionForPath,
  sortIssues,
} from "./issues"

const issue = (path: string, severity: "error" | "warning" = "error"): ValidationIssue => ({
  path,
  code: "x",
  severity,
  message: path,
})

describe("sectionForPath", () => {
  it.each([
    ["number", "facture"],
    ["issueDate", "facture"],
    ["operationCategory", "facture"],
    ["currency", "facture"],
    ["seller.siret", "vendeur"],
    ["seller.address.city", "vendeur"],
    ["buyer.name", "client"],
    ["deliveryAddress.city", "client"],
    ["buyerReference", "client"],
    ["lines", "lignes"],
    ["lines.3.unitPrice", "lignes"],
    ["vatExemptionReason", "tva"],
    ["legalNotes.recoveryFee", "tva"],
    ["payment.iban", "paiement"],
    ["prepaidAmount", "paiement"],
    ["unknown.thing", "facture"],
  ])("%s -> %s", (path, section) => {
    expect(sectionForPath(path)).toBe(section)
  })

  it("maps every issue and required path the real validator can emit to a section", () => {
    const draft = emptyInvoiceDraft()
    const paths = [...validateInvoice(draft).issues.map((i) => i.path), ...requiredPaths(draft)]
    expect(paths.length).toBeGreaterThan(10)
    const ids = new Set<string>(SECTIONS.map((s) => s.id))
    for (const p of paths) expect(ids.has(sectionForPath(p))).toBe(true)
  })

  it("every required path of a blank form names an input of the form model", () => {
    const form = draftToForm({})
    const draft = formToDraft(form)
    const get = (root: unknown, path: string): unknown =>
      path
        .split(".")
        .reduce<unknown>(
          (cur, k) =>
            cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined,
          root,
        )
    for (const p of requiredPaths(draft)) {
      // A form input exists for the path (even if blank): the form model is keyed by draft paths.
      expect(get(form, p), p).not.toBeUndefined()
    }
  })
})

describe("issue counting and ordering", () => {
  const issues = [issue("a", "warning"), issue("b"), issue("c", "warning"), issue("d")]

  it("counts errors and warnings", () => {
    expect(countIssues(issues)).toEqual({ errors: 2, warnings: 2 })
  })

  it("puts errors first and keeps order inside a group", () => {
    expect(sortIssues(issues).map((i) => i.path)).toEqual(["b", "d", "a", "c"])
  })

  it("groups by section in form order and drops empty sections", () => {
    const grouped = groupIssuesBySection([
      issue("payment.iban"),
      issue("number", "warning"),
      issue("seller.name"),
      issue("lines.0.name"),
    ])
    expect(grouped.map((g) => g.section)).toEqual(["facture", "vendeur", "lignes", "paiement"])
  })
})

describe("labels", () => {
  it("pluralises the counts", () => {
    expect(issueCountLabel({ errors: 0, warnings: 0 })).toBe("Aucune erreur")
    expect(issueCountLabel({ errors: 1, warnings: 0 })).toBe("1 erreur")
    expect(issueCountLabel({ errors: 3, warnings: 1 })).toBe("3 erreurs, 1 avertissement")
    expect(issueCountLabel({ errors: 0, warnings: 2 })).toBe("Aucune erreur, 2 avertissements")
  })

  it("explains why the main action is blocked", () => {
    expect(blockingReason({ errors: 0, warnings: 4 })).toBeNull()
    expect(blockingReason({ errors: 1, warnings: 0 })).toBe("Corrigez 1 erreur pour continuer.")
    expect(blockingReason({ errors: 5, warnings: 0 })).toBe("Corrigez 5 erreurs pour continuer.")
  })
})

describe("mergeIssues", () => {
  const required = (path: string): ValidationIssue => ({
    path,
    code: "required",
    severity: "error",
    message: "Renseignez",
  })
  const invalid = (path: string): ValidationIssue => ({
    path,
    code: "number.invalid",
    severity: "error",
    message: "Nombre invalide",
  })

  it("replaces a 'required' issue by the more precise form issue on the same path", () => {
    const merged = mergeIssues(
      [required("lines.0.quantity"), required("number")],
      [invalid("lines.0.quantity")],
    )
    expect(merged.map((i) => [i.path, i.code])).toEqual([
      ["lines.0.quantity", "number.invalid"],
      ["number", "required"],
    ])
  })

  it("keeps other validator issues on the same path (e.g. a warning)", () => {
    const warning: ValidationIssue = {
      path: "lines.0.quantity",
      code: "quantity.zero",
      severity: "warning",
      message: "0",
    }
    expect(mergeIssues([warning], [invalid("lines.0.quantity")])).toHaveLength(2)
  })
})
