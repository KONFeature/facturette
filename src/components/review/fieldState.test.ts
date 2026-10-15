import { describe, expect, it } from "vitest"
import type { InvoiceDraft } from "../../domain/invoice"
import type { Suggestion } from "../../lib/extract/types"
import type { ValidationIssue } from "../../lib/validation"
import {
  candidatesFor,
  confidenceLevel,
  deriveFieldState,
  type FieldStateContext,
  isBelowThreshold,
  normalizeForCompare,
  RELIABLE_THRESHOLD,
  summarizeDetection,
} from "./fieldState"

const sug = (path: string, value: Suggestion["value"], confidence: number): Suggestion => ({
  path,
  value,
  confidence,
  evidence: { text: String(value), bbox: { page: 1, x: 10, y: 20, width: 30, height: 8 } },
  rule: "test",
})

const issue = (
  path: string,
  severity: ValidationIssue["severity"] = "error",
  code = "required",
): ValidationIssue => ({ path, severity, code, message: `${code} ${path}` })

function ctx(over: Partial<FieldStateContext> = {}): FieldStateContext {
  return {
    draft: {},
    suggestions: [],
    requiredPaths: new Set(),
    issues: [],
    touched: new Set(),
    submitted: false,
    ...over,
  }
}

describe("confidenceLevel", () => {
  it("is reliable from 0.85 and 'à vérifier' below", () => {
    expect(RELIABLE_THRESHOLD).toBe(0.85)
    expect(confidenceLevel(0.85)).toBe("reliable")
    expect(confidenceLevel(1)).toBe("reliable")
    expect(confidenceLevel(0.849)).toBe("check")
    expect(confidenceLevel(0.6)).toBe("check")
  })

  it("flags below-threshold candidates", () => {
    expect(isBelowThreshold(sug("number", "x", 0.59))).toBe(true)
    expect(isBelowThreshold(sug("number", "x", 0.6))).toBe(false)
  })
})

describe("deriveFieldState: source", () => {
  it("is empty for a blank value (also whitespace and NaN)", () => {
    expect(deriveFieldState("number", ctx()).source).toBe("empty")
    expect(deriveFieldState("number", ctx({ draft: { number: "  " } })).source).toBe("empty")
    expect(
      deriveFieldState("lines.0.quantity", ctx({ draft: { lines: [{ quantity: Number.NaN }] } }))
        .source,
    ).toBe("empty")
  })

  it("is detected when the value equals a candidate, with its confidence level", () => {
    const state = deriveFieldState(
      "number",
      ctx({ draft: { number: "F-2026-001" }, suggestions: [sug("number", "F-2026-001", 0.92)] }),
    )
    expect(state.source).toBe("detected")
    expect(state.detected?.level).toBe("reliable")
    expect(state.detected?.suggestion.evidence.bbox?.page).toBe(1)
    expect(state.alternatives).toEqual([])
  })

  it("marks a detected value below 0.85 as 'check'", () => {
    const state = deriveFieldState(
      "number",
      ctx({ draft: { number: "A1" }, suggestions: [sug("number", "A1", 0.7)] }),
    )
    expect(state.detected?.level).toBe("check")
  })

  it("loses the detected marker once the user edits the value", () => {
    const state = deriveFieldState(
      "number",
      ctx({ draft: { number: "F-2026-002" }, suggestions: [sug("number", "F-2026-001", 0.92)] }),
    )
    expect(state.source).toBe("manual")
    expect(state.detected).toBeNull()
    // …and the original candidate is offered again as an undo.
    expect(state.alternatives.map((s) => s.value)).toEqual(["F-2026-001"])
  })

  it("compares identifiers without spaces or case, and text without case or spacing runs", () => {
    expect(
      deriveFieldState(
        "seller.siret",
        ctx({
          draft: { seller: { siret: "73282932000074" } },
          suggestions: [sug("seller.siret", "732 829 320 00074", 0.9)],
        }),
      ).source,
    ).toBe("detected")
    expect(
      deriveFieldState(
        "seller.vatNumber",
        ctx({
          draft: { seller: { vatNumber: "fr44732829320" } },
          suggestions: [sug("seller.vatNumber", "FR 44 732 829 320", 0.9)],
        }),
      ).source,
    ).toBe("detected")
    expect(normalizeForCompare("seller.name", "  Ma   Société ")).toBe("ma société")
  })

  it("matches numbers by value and works on nested line paths", () => {
    const draft: InvoiceDraft = { lines: [{ name: "a", quantity: 2.5 }] }
    const state = deriveFieldState(
      "lines.0.quantity",
      ctx({ draft, suggestions: [sug("lines.0.quantity", 2.5, 0.9)] }),
    )
    expect(state.source).toBe("detected")
  })

  it("keeps a detected value that was also typed by the user (value equality is what counts)", () => {
    const state = deriveFieldState(
      "buyer.name",
      ctx({ draft: { buyer: { name: "ACME" } }, suggestions: [sug("buyer.name", "acme", 0.65)] }),
    )
    expect(state.source).toBe("detected")
    expect(state.detected?.level).toBe("check")
  })

  it("picks the highest-confidence candidate among those with the same value", () => {
    const state = deriveFieldState(
      "number",
      ctx({
        draft: { number: "F1" },
        suggestions: [sug("number", "F1", 0.5), sug("number", "f1", 0.9)],
      }),
    )
    expect(state.detected?.suggestion.confidence).toBe(0.9)
  })

  it("marks profile-filled fields, detection winning over the profile", () => {
    const profile: InvoiceDraft = {
      seller: { name: "Ma Société", vatNumber: "FR44732829320" },
      payment: { iban: "FR7630006000011234567890189" },
    }
    const draft: InvoiceDraft = {
      seller: { name: "Ma Société", vatNumber: "FR44732829320" },
      payment: { iban: "FR7630006000011234567890189" },
    }
    const base = ctx({
      draft,
      profile,
      suggestions: [sug("seller.vatNumber", "FR44732829320", 0.95)],
    })
    expect(deriveFieldState("seller.name", base).source).toBe("profile")
    expect(deriveFieldState("payment.iban", base).source).toBe("profile")
    expect(deriveFieldState("seller.vatNumber", base).source).toBe("detected")
    expect(deriveFieldState("seller.name", { ...base, profile: undefined }).source).toBe("manual")
  })

  it("does not mark a profile field the user changed", () => {
    const state = deriveFieldState(
      "seller.name",
      ctx({ draft: { seller: { name: "Autre" } }, profile: { seller: { name: "Ma Société" } } }),
    )
    expect(state.source).toBe("manual")
  })
})

describe("deriveFieldState: alternatives", () => {
  it("offers a below-threshold best candidate on an empty field", () => {
    const state = deriveFieldState(
      "issueDate",
      ctx({ suggestions: [sug("issueDate", "2026-10-01", 0.4)] }),
    )
    expect(state.source).toBe("empty")
    expect(state.alternatives).toHaveLength(1)
    expect(state.alternatives[0]?.value).toBe("2026-10-01")
  })

  it("lists the other candidates, best first, one per distinct value", () => {
    const state = deriveFieldState(
      "dueDate",
      ctx({
        draft: { dueDate: "2026-10-31" },
        suggestions: [
          sug("dueDate", "2026-11-15", 0.55),
          sug("dueDate", "2026-10-31", 0.9),
          sug("dueDate", "2026-11-30", 0.7),
          sug("dueDate", "2026-11-30", 0.3),
        ],
      }),
    )
    expect(state.source).toBe("detected")
    expect(state.alternatives.map((s) => [s.value, s.confidence])).toEqual([
      ["2026-11-30", 0.7],
      ["2026-11-15", 0.55],
    ])
  })

  it("ignores blank candidates and candidates of other paths", () => {
    const state = deriveFieldState(
      "number",
      ctx({ suggestions: [sug("number", "  ", 0.9), sug("buyer.name", "X", 0.9)] }),
    )
    expect(state.alternatives).toEqual([])
    expect(
      candidatesFor([sug("number", "A", 0.2), sug("number", "B", 0.8)], "number").map(
        (s) => s.value,
      ),
    ).toEqual(["B", "A"])
  })
})

describe("deriveFieldState: required and issues", () => {
  it("reports required paths", () => {
    const state = deriveFieldState("number", ctx({ requiredPaths: new Set(["number"]) }))
    expect(state.required).toBe(true)
    expect(deriveFieldState("notes", ctx({ requiredPaths: new Set(["number"]) })).required).toBe(
      false,
    )
  })

  it("hides issues on load, shows them once touched", () => {
    const issues = [issue("number")]
    const untouched = deriveFieldState("number", ctx({ issues }))
    expect(untouched.error).toBeNull()
    expect(untouched.hasError).toBe(true)

    const touched = deriveFieldState("number", ctx({ issues, touched: new Set(["number"]) }))
    expect(touched.error?.code).toBe("required")
  })

  it("shows everything after a submit attempt", () => {
    const state = deriveFieldState("number", ctx({ issues: [issue("number")], submitted: true }))
    expect(state.error).not.toBeNull()
  })

  it("only shows issues of its own path", () => {
    const state = deriveFieldState(
      "seller.siret",
      ctx({ issues: [issue("seller.siren")], submitted: true }),
    )
    expect(state.error).toBeNull()
    expect(state.hasError).toBe(false)
  })

  it("separates warnings from errors and never lets a warning count as an error", () => {
    const issues = [issue("issueDate", "warning", "issueDate.future")]
    const state = deriveFieldState("issueDate", ctx({ issues, submitted: true }))
    expect(state.error).toBeNull()
    expect(state.hasError).toBe(false)
    expect(state.warning?.code).toBe("issueDate.future")
  })

  it("keeps both an error and a warning on the same field", () => {
    const issues = [
      issue("seller.vatNumber", "warning", "vat.key"),
      issue("seller.vatNumber", "error", "vat.format"),
    ]
    const state = deriveFieldState("seller.vatNumber", ctx({ issues, submitted: true }))
    expect(state.error?.code).toBe("vat.format")
    expect(state.warning?.code).toBe("vat.key")
  })
})

describe("summarizeDetection", () => {
  it("counts applied versus not applied candidates per path", () => {
    const suggestions = [
      sug("number", "F1", 0.9),
      sug("issueDate", "2026-01-01", 0.4),
      sug("issueDate", "2026-02-01", 0.3),
      sug("buyer.name", "ACME", 0.8),
    ]
    const draft: InvoiceDraft = { number: "F1", buyer: { name: "Autre" } }
    expect(summarizeDetection(suggestions, draft)).toEqual({
      withCandidates: 3,
      detected: 1,
      toReview: 2,
    })
  })

  it("is zero without suggestions", () => {
    expect(summarizeDetection([], {})).toEqual({ withCandidates: 0, detected: 0, toReview: 0 })
  })
})
