import { describe, expect, it } from "vitest"
import {
  digitsOnly,
  formatIban,
  formatSiren,
  formatSiret,
  frenchVatKey,
  isValidFrenchVatNumber,
  isValidIban,
  isValidSiren,
  isValidSiret,
  normalizeIban,
  vatNumberStatus,
} from "./identifiers"

/** Appends the Luhn check digit to a digit payload. */
function withLuhn(payload: string): string {
  for (let c = 0; c < 10; c++) {
    const candidate = `${payload}${c}`
    let sum = 0
    let double = false
    for (let i = candidate.length - 1; i >= 0; i--) {
      let n = Number(candidate[i])
      if (double) {
        n *= 2
        if (n > 9) n -= 9
      }
      sum += n
      double = !double
    }
    if (sum % 10 === 0) return candidate
  }
  throw new Error("unreachable")
}

const SIREN = withLuhn("73282932") // 732829320, the repo's sample SIREN
const SIRET = withLuhn(`${SIREN}0007`)

describe("digitsOnly", () => {
  it.each([
    ["732 829 320", "732829320"],
    ["73.28-29", "732829"],
    ["", ""],
    ["abc", ""],
  ])("%j → %j", (input, expected) => {
    expect(digitsOnly(input)).toBe(expected)
  })
})

describe("isValidSiren", () => {
  it("computes the sample", () => {
    expect(SIREN).toBe("732829320")
  })
  it.each([SIREN, "732 829 320", withLuhn("12345678"), withLuhn("55203253"), "356000000"])(
    "accepts %s",
    (v) => {
      expect(isValidSiren(v)).toBe(true)
    },
  )
  it.each([
    "732829321",
    "73282932",
    "7328293200",
    "",
    "abcdefghi",
    "732-829-320",
    "356000001",
    "000000001",
  ])("rejects %j", (v) => {
    expect(isValidSiren(v)).toBe(false)
  })
})

describe("isValidSiret", () => {
  it("accepts Luhn-valid SIRETs", () => {
    expect(isValidSiret(SIRET)).toBe(true)
    expect(isValidSiret(`${SIRET.slice(0, 3)} ${SIRET.slice(3)}`)).toBe(true)
    expect(isValidSiret("73282932000074")).toBe(true)
  })
  it("rejects wrong checksum or length", () => {
    expect(isValidSiret("73282932000075")).toBe(false)
    expect(isValidSiret("7328293200007")).toBe(false)
    expect(isValidSiret(SIREN)).toBe(false)
    expect(isValidSiret("")).toBe(false)
    expect(isValidSiret("7328293200007x")).toBe(false)
  })
  it("applies the La Poste rule: digit sum multiple of 5", () => {
    // 356000000 + 00048: sum = 26 but Luhn-valid (real head office SIRET)
    expect(isValidSiret("35600000000048")).toBe(true)
    // sum = 3+5+6+5 = 19 → neither Luhn nor multiple of 5
    expect(isValidSiret("35600000000005")).toBe(false)
    // sum = 3+5+6+5+1 = 20 → multiple of 5, accepted even if Luhn fails
    expect(isValidSiret("35600000000051")).toBe(true)
  })
})

describe("frenchVatKey / isValidFrenchVatNumber", () => {
  it("computes the numeric key", () => {
    expect(frenchVatKey("732829320")).toBe("44")
    expect(frenchVatKey("732 829 320")).toBe("44")
    expect(frenchVatKey("12345")).toBeUndefined()
    // key below 10 is zero-padded: (12 + 3*(s mod 97)) mod 97 = 5 → "05"
    for (let s = 100000000; s < 100000200; s++) {
      if (Number(frenchVatKey(String(s))) < 10) {
        expect(frenchVatKey(String(s))).toHaveLength(2)
        break
      }
    }
  })
  it("accepts a correct number, with separators and lowercase", () => {
    expect(isValidFrenchVatNumber("FR44732829320")).toBe(true)
    expect(isValidFrenchVatNumber("fr 44 732 829 320")).toBe(true)
  })
  it("tolerates the alphanumeric key form", () => {
    expect(isValidFrenchVatNumber("FRAB732829320")).toBe(true)
  })
  it("rejects wrong key, wrong SIREN, wrong shape and foreign prefix", () => {
    expect(isValidFrenchVatNumber("FR45732829320")).toBe(false)
    expect(isValidFrenchVatNumber("FR44732829321")).toBe(false)
    expect(isValidFrenchVatNumber("FR4473282932")).toBe(false)
    expect(isValidFrenchVatNumber("DE123456789")).toBe(false)
    expect(isValidFrenchVatNumber("")).toBe(false)
  })
  it("reports the kind of problem", () => {
    expect(vatNumberStatus("FR44732829320")).toBe("ok")
    expect(vatNumberStatus("FR45732829320")).toBe("key")
    expect(vatNumberStatus("FR44732829321")).toBe("siren")
    expect(vatNumberStatus("FR44")).toBe("format")
    expect(vatNumberStatus("DE123456789")).toBe("ok")
    expect(vatNumberStatus("1234")).toBe("format")
  })
})

describe("IBAN", () => {
  it("normalizes", () => {
    expect(normalizeIban("fr76 3000 6000 0112 3456 7890 189")).toBe("FR7630006000011234567890189")
  })
  it.each([
    "FR7630006000011234567890189",
    "FR76 3000 6000 0112 3456 7890 189",
    "DE89370400440532013000",
    "BE68539007547034",
    "ES9121000418450200051332",
    "IT60X0542811101000000123456",
    "LU280019400644750000",
    "NL91ABNA0417164300",
    "CH9300762011623852957",
    "GB29NWBK60161331926819",
    "NO9386011117947", // generic mod 97, no length table
  ])("accepts %s", (v) => {
    expect(isValidIban(v)).toBe(true)
  })
  it.each([
    "FR7630006000011234567890188", // bad checksum
    "FR76300060000112345678901", // too short for FR
    "FR76300060000112345678901899", // too long for FR
    "DE89370400440532013001",
    "XX00",
    "",
    "7630006000011234567890189",
    "FR76-3000-6000-0112-3456-7890-189",
  ])("rejects %j", (v) => {
    expect(isValidIban(v)).toBe(false)
  })
})

describe("display formatting", () => {
  it("formats SIREN, SIRET, IBAN", () => {
    expect(formatSiren("732829320")).toBe("732 829 320")
    expect(formatSiret("73282932000074")).toBe("732 829 320 00074")
    expect(formatIban("fr7630006000011234567890189")).toBe("FR76 3000 6000 0112 3456 7890 189")
  })
  it("leaves malformed input untouched", () => {
    expect(formatSiren("123")).toBe("123")
    expect(formatSiret("abc")).toBe("abc")
    expect(formatIban("")).toBe("")
  })
})
