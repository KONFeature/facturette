import { describe, expect, it } from "vitest"
import type { Suggestion } from "../src/lib/extract"
import { canonicalLineSigns, canonicalSuggestions, scoreFixture } from "./eval-extraction"

const suggestion = (path: string, value: Suggestion["value"], confidence = 0.9): Suggestion => ({
  path,
  value,
  confidence,
  evidence: { text: "" },
  rule: "test",
})

const score = (expected: unknown, printed: string[], suggestions: Suggestion[], draft: unknown) =>
  scoreFixture("t.pdf", "holdout", expected, printed, { suggestions, draft, warnings: [] }, true, 0)

describe("canonicalLineSigns", () => {
  it("moves a negative unit price's sign onto the quantity", () => {
    expect(canonicalLineSigns({ lines: [{ quantity: 1, unitPrice: -1440 }] })).toEqual({
      lines: [{ quantity: -1, unitPrice: 1440 }],
    })
  })

  it("leaves positive prices and odd input untouched", () => {
    const invoice = { lines: [{ quantity: -1, unitPrice: 1440 }, null, "x"] }
    expect(canonicalLineSigns(invoice)).toEqual(invoice)
    expect(canonicalLineSigns(undefined)).toBeUndefined()
    expect(canonicalLineSigns({ number: "F1" })).toEqual({ number: "F1" })
  })

  it("flips the suggestions of a line whose draft unit price is negative", () => {
    const flipped = canonicalSuggestions(
      [suggestion("lines.0.quantity", 1), suggestion("lines.0.unitPrice", -5)],
      { lines: [{ quantity: 1, unitPrice: -5 }] },
    )
    expect(flipped.map((s) => s.value)).toEqual([-1, 5])
  })
})

describe("scoreFixture", () => {
  const expected = { lines: [{ name: "Acompte", quantity: 1, unitPrice: -1440 }] }
  const printed = ["lines.0.name", "lines.0.quantity", "lines.0.unitPrice"]

  it("scores -1 x 1440 and 1 x -1440 as the same line", () => {
    const suggestions = [
      suggestion("lines.0.name", "Acompte"),
      suggestion("lines.0.quantity", -1),
      suggestion("lines.0.unitPrice", 1440),
    ]
    const s = score(expected, printed, suggestions, {
      lines: [{ name: "Acompte", quantity: -1, unitPrice: 1440 }],
    })
    expect(s.hit).toBe(3)
    expect(s.confidentErrors).toEqual([])
  })

  it("still reports a wrong magnitude or a sign lost on both sides", () => {
    const wrongAmount = score(
      expected,
      printed,
      [suggestion("lines.0.quantity", -1), suggestion("lines.0.unitPrice", 1400)],
      { lines: [{ name: "Acompte", quantity: -1, unitPrice: 1400 }] },
    )
    expect(wrongAmount.confidentErrors.map((e) => e.path)).toEqual(["lines.0.unitPrice"])
    const positive = score(
      expected,
      printed,
      [suggestion("lines.0.quantity", 1), suggestion("lines.0.unitPrice", 1440)],
      { lines: [{ name: "Acompte", quantity: 1, unitPrice: 1440 }] },
    )
    expect(positive.confidentErrors.map((e) => e.path)).toEqual(["lines.0.quantity"])
  })

  it("counts a value at a path absent from the ground truth as a confident error", () => {
    const s = score({ number: "F1" }, ["number"], [suggestion("prepaidAmount", 1)], {
      number: "F1",
      prepaidAmount: 1,
    })
    expect(s.confidentErrors.map((e) => e.path)).toEqual(["prepaidAmount"])
    expect(s.wrong).toBe(1)
  })

  it("ignores suggestions below the pre-fill threshold", () => {
    const s = score({ number: "F1" }, ["number"], [suggestion("number", "F2", 0.5)], {})
    expect(s.confidentErrors).toEqual([])
    expect(s.missed.map((e) => e.path)).toEqual(["number"])
  })
})
