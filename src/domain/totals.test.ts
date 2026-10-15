import { describe, expect, it } from "vitest"
import { computeTotals, lineNet } from "./totals"

describe("lineNet", () => {
  it("rounds half-up to 2 decimals without float drift", () => {
    // 1.005 * 1 would round to 1.00 with naive Math.round(x * 100) / 100
    expect(lineNet({ quantity: 1, unitPrice: 1.005 })).toBe(1.01)
    expect(lineNet({ quantity: 3, unitPrice: 0.1 })).toBe(0.3)
    expect(lineNet({ quantity: 2.5, unitPrice: 19.99 })).toBe(49.98)
  })

  it("treats missing or non-finite values as 0", () => {
    expect(lineNet({})).toBe(0)
    expect(lineNet({ quantity: Number.NaN, unitPrice: 10 })).toBe(0)
  })
})

describe("computeTotals", () => {
  it("computes a single-rate invoice", () => {
    const t = computeTotals({
      lines: [
        { quantity: 2, unitPrice: 100, vatCategory: "S", vatRate: 20 },
        { quantity: 1, unitPrice: 50, vatCategory: "S", vatRate: 20 },
      ],
    })
    expect(t.lineTotal).toBe(250)
    expect(t.taxBasisTotal).toBe(250)
    expect(t.taxTotal).toBe(50)
    expect(t.grandTotal).toBe(300)
    expect(t.dueAmount).toBe(300)
    expect(t.vatBreakdown).toEqual([{ category: "S", rate: 20, taxableAmount: 250, taxAmount: 50 }])
  })

  it("computes VAT per breakdown, not per line", () => {
    // Per line: 3 × round(0.33 × 0.2 = 0.066 → 0.07) = 0.21. Per breakdown: round(0.99 × 0.2) = 0.20.
    const t = computeTotals({
      lines: [
        { quantity: 1, unitPrice: 0.33, vatCategory: "S", vatRate: 20 },
        { quantity: 1, unitPrice: 0.33, vatCategory: "S", vatRate: 20 },
        { quantity: 1, unitPrice: 0.33, vatCategory: "S", vatRate: 20 },
      ],
    })
    expect(t.vatBreakdown[0]?.taxAmount).toBe(0.2)
    expect(t.grandTotal).toBe(1.19)
  })

  it("groups by (category, rate) and orders S first, highest rate first", () => {
    const t = computeTotals({
      lines: [
        { quantity: 1, unitPrice: 100, vatCategory: "S", vatRate: 5.5 },
        { quantity: 1, unitPrice: 100, vatCategory: "E", vatRate: 0 },
        { quantity: 1, unitPrice: 100, vatCategory: "S", vatRate: 20 },
      ],
    })
    expect(t.vatBreakdown.map((v) => [v.category, v.rate])).toEqual([
      ["S", 20],
      ["S", 5.5],
      ["E", 0],
    ])
    expect(t.taxTotal).toBe(25.5)
    expect(t.grandTotal).toBe(325.5)
  })

  it("forces a 0 rate for non-standard categories even if a rate is typed", () => {
    const t = computeTotals({
      lines: [{ quantity: 1, unitPrice: 100, vatCategory: "E", vatRate: 20 }],
    })
    expect(t.taxTotal).toBe(0)
    expect(t.vatBreakdown).toEqual([{ category: "E", rate: 0, taxableAmount: 100, taxAmount: 0 }])
  })

  it("subtracts the prepaid amount from the amount due", () => {
    const t = computeTotals({
      lines: [{ quantity: 1, unitPrice: 100, vatCategory: "S", vatRate: 20 }],
      prepaidAmount: 30,
    })
    expect(t.grandTotal).toBe(120)
    expect(t.prepaid).toBe(30)
    expect(t.dueAmount).toBe(90)
  })

  it("tolerates empty drafts", () => {
    const t = computeTotals({})
    expect(t.grandTotal).toBe(0)
    expect(t.vatBreakdown).toEqual([])
  })
})
