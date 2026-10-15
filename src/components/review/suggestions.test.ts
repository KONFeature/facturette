import { describe, expect, it } from "vitest"
import type { Suggestion } from "../../lib/extract/types"
import {
  formValueForSuggestion,
  mappingAfterInsert,
  mappingAfterMove,
  mappingAfterRemove,
  pruneStaleLineSuggestions,
  reindexLineSuggestions,
  suggestionLabel,
} from "./suggestions"

const sug = (path: string, value: Suggestion["value"], confidence = 0.8): Suggestion => ({
  path,
  value,
  confidence,
  evidence: { text: String(value) },
  rule: "t",
})

describe("formValueForSuggestion", () => {
  it("writes numbers with a decimal comma", () => {
    expect(formValueForSuggestion("lines.0.unitPrice", 1234.5)).toBe("1234,5")
  })

  it("formats identifiers for display", () => {
    expect(formValueForSuggestion("seller.siret", "73282932000074")).toBe("732 829 320 00074")
    expect(formValueForSuggestion("buyer.siren", "732829320")).toBe("732 829 320")
    expect(formValueForSuggestion("payment.iban", "FR7630006000011234567890189")).toBe(
      "FR76 3000 6000 0112 3456 7890 189",
    )
  })

  it("passes plain text and booleans through", () => {
    expect(formValueForSuggestion("number", "F-1")).toBe("F-1")
    expect(formValueForSuggestion("vatOnDebits", true)).toBe(true)
  })
})

describe("suggestionLabel", () => {
  it("shows dates the French way", () => {
    expect(suggestionLabel("issueDate", "2026-10-01")).toBe("01/10/2026")
  })

  it("uses the reference labels for coded values", () => {
    expect(suggestionLabel("typeCode", "381")).toBe("Avoir")
    expect(suggestionLabel("operationCategory", "goods")).toBe("Livraison de biens")
    expect(suggestionLabel("lines.0.unitCode", "HUR")).toBe("heure")
    expect(suggestionLabel("payment.meansCode", "58")).toBe("Virement SEPA")
    expect(suggestionLabel("lines.0.vatCategory", "Z")).toContain("zéro")
  })

  it("renders numbers and rates", () => {
    expect(suggestionLabel("lines.0.vatRate", 5.5)).toBe("5,5 %")
    expect(suggestionLabel("lines.0.quantity", 2)).toBe("2")
  })

  it("truncates long text", () => {
    const label = suggestionLabel("notes", "x".repeat(200))
    expect(label.length).toBeLessThanOrEqual(64)
    expect(label.endsWith("…")).toBe(true)
  })

  it("renders booleans", () => {
    expect(suggestionLabel("vatOnDebits", true)).toBe("Oui")
  })
})

describe("line index mappings", () => {
  it("computes the old index of every line after a change", () => {
    expect(mappingAfterRemove(4, 1)).toEqual([0, 2, 3])
    expect(mappingAfterInsert(3, 2)).toEqual([0, 1, null, 2])
    expect(mappingAfterMove(4, 0, 2)).toEqual([1, 2, 0, 3])
    expect(mappingAfterMove(4, 3, 0)).toEqual([3, 0, 1, 2])
  })
})

describe("reindexLineSuggestions", () => {
  const all = [
    sug("number", "F1"),
    sug("lines.0.name", "A"),
    sug("lines.1.name", "B"),
    sug("lines.1.unitPrice", 10),
    sug("lines.2.name", "C"),
  ]

  it("leaves non-line candidates alone", () => {
    const out = reindexLineSuggestions(all, mappingAfterRemove(3, 0))
    expect(out.find((s) => s.path === "number")?.value).toBe("F1")
  })

  it("drops the candidates of a removed line and shifts the following ones", () => {
    const out = reindexLineSuggestions(all, mappingAfterRemove(3, 1))
    expect(out.map((s) => [s.path, s.value])).toEqual([
      ["number", "F1"],
      ["lines.0.name", "A"],
      ["lines.1.name", "C"],
    ])
  })

  it("moves candidates with their line", () => {
    const out = reindexLineSuggestions(all, mappingAfterMove(3, 0, 2))
    expect(out.filter((s) => s.path.startsWith("lines")).map((s) => [s.path, s.value])).toEqual([
      ["lines.2.name", "A"],
      ["lines.0.name", "B"],
      ["lines.0.unitPrice", 10],
      ["lines.1.name", "C"],
    ])
  })

  it("gives an inserted or duplicated line no candidates", () => {
    const out = reindexLineSuggestions(all, mappingAfterInsert(3, 1))
    expect(out.filter((s) => s.path.startsWith("lines")).map((s) => [s.path, s.value])).toEqual([
      ["lines.0.name", "A"],
      ["lines.2.name", "B"],
      ["lines.2.unitPrice", 10],
      ["lines.3.name", "C"],
    ])
  })

  it("does not mutate its input", () => {
    const copy = JSON.stringify(all)
    reindexLineSuggestions(all, mappingAfterRemove(3, 0))
    expect(JSON.stringify(all)).toBe(copy)
  })
})

describe("pruneStaleLineSuggestions", () => {
  const all = [
    sug("number", "F1"),
    sug("lines.0.name", "A"),
    sug("lines.0.unitPrice", 10),
    sug("lines.1.name", "B"),
  ]

  it("keeps everything while the lines still hold their detected values", () => {
    const draft = { lines: [{ name: "A", unitPrice: 10 }, { name: "B" }] }
    expect(pruneStaleLineSuggestions(all, draft)).toHaveLength(4)
  })

  it("drops the candidates of a line that now holds something else", () => {
    // Lines were swapped: index 0 holds B, index 1 holds A.
    const draft = { lines: [{ name: "B" }, { name: "A" }] }
    const out = pruneStaleLineSuggestions(all, draft)
    expect(out.map((s) => s.path)).toEqual(["number"])
  })

  it("ignores shared values: a matching unit or VAT rate does not keep a line alive", () => {
    const withShared = [...all, sug("lines.1.vatRate", 20), sug("lines.0.vatRate", 20)]
    const draft = {
      lines: [
        { name: "B", vatRate: 20 },
        { name: "A", vatRate: 20 },
      ],
    }
    expect(pruneStaleLineSuggestions(withShared, draft).map((s) => s.path)).toEqual(["number"])
  })

  it("drops a line whose detected designation was edited", () => {
    const draft = { lines: [{ name: "Edited", unitPrice: 10 }, { name: "B" }] }
    expect(pruneStaleLineSuggestions(all, draft).map((s) => s.path)).toEqual([
      "number",
      "lines.1.name",
    ])
  })

  it("falls back to quantity / price when no designation was detected", () => {
    const noName = [sug("lines.0.unitPrice", 10), sug("lines.0.vatRate", 20)]
    expect(pruneStaleLineSuggestions(noName, { lines: [{ unitPrice: 10 }] })).toHaveLength(2)
    expect(
      pruneStaleLineSuggestions(noName, { lines: [{ unitPrice: 11, vatRate: 20 }] }),
    ).toHaveLength(0)
  })
})
