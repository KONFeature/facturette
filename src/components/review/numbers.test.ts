import { describe, expect, it } from "vitest"
import { formatAmount, formatNumberDisplay, formatNumberInput, parseFrNumber } from "./numbers"

describe("parseFrNumber", () => {
  it.each([
    ["1 234,56", 1234.56],
    ["1\u00a0234,56", 1234.56],
    ["1\u202f234,56", 1234.56],
    ["1234,5", 1234.5],
    ["1234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["-12,5", -12.5],
    ["\u221212,5", -12.5],
    ["20 %", 20],
    ["850 €", 850],
    ["0,001", 0.001],
    [",5", 0.5],
    ["12.", 12],
    ["0", 0],
  ])("parses %j", (text, expected) => {
    expect(parseFrNumber(text)).toBe(expected)
  })

  it("returns null for blank text", () => {
    expect(parseFrNumber("")).toBeNull()
    expect(parseFrNumber("  \u00a0 ")).toBeNull()
  })

  it.each(["abc", "12,50,3", "1e5", "--1", "1 2 x", "-", ","])("returns NaN for %j", (text) => {
    expect(parseFrNumber(text)).toBeNaN()
  })

  it("keeps full double precision", () => {
    expect(parseFrNumber("0,1")).toBe(0.1)
    expect(parseFrNumber("19,99")).toBe(19.99)
    expect(parseFrNumber("1234567,891")).toBe(1234567.891)
  })
})

describe("formatNumberInput", () => {
  it("uses a decimal comma and no grouping", () => {
    expect(formatNumberInput(1234.5)).toBe("1234,5")
    expect(formatNumberInput(20)).toBe("20")
    expect(formatNumberInput(-0.25)).toBe("-0,25")
  })

  it("does not leak float noise", () => {
    expect(formatNumberInput(0.1)).toBe("0,1")
    expect(formatNumberInput(19.99)).toBe("19,99")
    expect(formatNumberInput(0.1 + 0.2)).toBe("0,3")
  })

  it("is blank for missing or non-finite numbers", () => {
    expect(formatNumberInput(undefined)).toBe("")
    expect(formatNumberInput(Number.NaN)).toBe("")
  })

  it("round-trips through parseFrNumber", () => {
    for (const n of [0, 1, 12.5, 1234.56, 0.001, 99999.99, -3.2]) {
      expect(parseFrNumber(formatNumberInput(n))).toBe(n)
    }
  })
})

describe("display formats", () => {
  it("groups thousands for display", () => {
    expect(formatNumberDisplay(1234.5).replace(/\s/g, " ")).toBe("1 234,5")
  })

  it("formats euros with two decimals", () => {
    expect(formatAmount(1234.5).replace(/\s/g, " ")).toBe("1 234,50 €")
  })
})
