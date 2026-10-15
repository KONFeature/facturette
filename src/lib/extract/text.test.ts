import { describe, expect, it } from "vitest"
import {
  detectDecimalStyle,
  findDates,
  parseDate,
  parseNumber,
  parsePercent,
  parseQuantity,
  unitCodeFor,
} from "./text"

describe("parseNumber", () => {
  it.each([
    ["1 234,56", 1234.56],
    ["1\u00a0234,56 €", 1234.56],
    ["1\u202f234,56\u00a0€", 1234.56],
    ["1.234,56 €", 1234.56],
    ["1234.56", 1234.56],
    ["1234.56 EUR", 1234.56],
    ["€ 1 234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["-380,00 €", -380],
    ["−12,5", -12.5],
    ["(380,00)", -380],
    ["850", 850],
    ["0,5", 0.5],
    ["12 345 678,90", 12345678.9],
  ])("parses %s", (raw, expected) => {
    expect(parseNumber(raw)).toBeCloseTo(expected, 5)
  })

  it("uses the document style for a lone separator followed by three digits", () => {
    expect(parseNumber("1.234", "comma")).toBe(1234)
    expect(parseNumber("1.234", "dot")).toBeCloseTo(1.234)
    expect(parseNumber("1,250", "comma")).toBeCloseTo(1.25)
  })

  it.each(["", "abc", "12 34", "1,2,3", "12/10/2026", "FR76", "1 234,", "20 %"])(
    "rejects %s",
    (raw) => {
      expect(parseNumber(raw)).toBeUndefined()
    },
  )
})

describe("detectDecimalStyle", () => {
  it("detects comma and dot styles", () => {
    expect(detectDecimalStyle("Total 1 234,56 € TVA 246,91 €")).toBe("comma")
    expect(detectDecimalStyle("Total 1234.56 EUR VAT 246.91 EUR")).toBe("dot")
  })
})

describe("parsePercent", () => {
  it.each([
    ["20 %", 20],
    ["5,5 %", 5.5],
    ["5.5%", 5.5],
    ["10\u00a0%", 10],
    ["2,1 %", 2.1],
  ])("parses %s", (raw, expected) => {
    expect(parsePercent(raw)).toBeCloseTo(expected, 5)
  })
  it("rejects non percentages", () => {
    expect(parsePercent("20")).toBeUndefined()
    expect(parsePercent("120 %")).toBeUndefined()
  })
})

describe("dates", () => {
  it.each([
    ["15/10/2026", "2026-10-15"],
    ["15-10-26", "2026-10-15"],
    ["15.10.2026", "2026-10-15"],
    ["2026-10-15", "2026-10-15"],
    ["1er octobre 2026", "2026-10-01"],
    ["15 oct. 2026", "2026-10-15"],
    ["3 février 2027", "2027-02-03"],
    ["le 29 février 2028", "2028-02-29"],
  ])("parses %s", (raw, iso) => {
    expect(parseDate(raw)).toBe(iso)
  })

  it.each(["31/02/2026", "29/02/2027", "15/13/2026", "2026-02-30", "32 octobre 2026", "15/10"])(
    "rejects the invalid calendar date %s",
    (raw) => {
      expect(parseDate(raw)).toBeUndefined()
    },
  )

  it("finds several dates in a sentence", () => {
    const dates = findDates("Période du 01/09/2026 au 30 septembre 2026")
    expect(dates.map((d) => d.iso)).toEqual(["2026-09-01", "2026-09-30"])
  })
})

describe("quantities and units", () => {
  it.each([
    ["2 j", 2, "DAY"],
    ["3,5 h", 3.5, "HUR"],
    ["0,5 jour", 0.5, "DAY"],
    ["7,5 heures", 7.5, "HUR"],
    ["1 forfait", 1, "LS"],
    ["4 u", 4, "C62"],
    ["12 kg", 12, "KGM"],
    ["3 mois", 3, "MON"],
  ])("parses %s", (raw, quantity, unitCode) => {
    expect(parseQuantity(raw)).toMatchObject({ quantity, unitCode })
  })
  it("keeps a bare number without unit", () => {
    expect(parseQuantity("48")).toEqual({ quantity: 48 })
  })
  it("refuses unknown unit words", () => {
    expect(parseQuantity("2 pommes")).toBeUndefined()
    expect(unitCodeFor("Jours")).toBe("DAY")
  })
})
