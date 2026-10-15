/**
 * French / SEPA identifier helpers: SIREN, SIRET, French VAT number, IBAN.
 * Pure functions, no dependency. Checksums only prove an identifier is well formed, not that it
 * exists in the SIRENE register.
 */

/** Strips everything that is not a digit (spaces, dots, dashes, letters). */
export function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "")
}

/** Removes whitespace only (keeps letters, so that "12a" is not silently turned into "12"). */
function stripSpaces(s: string): string {
  return s.replace(/[\s\u00a0\u202f]+/g, "")
}

/** Luhn checksum over a string of digits (any length >= 2). */
function luhnValid(digits: string): boolean {
  if (!/^\d{2,}$/.test(digits)) return false
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (double) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

function digitSum(digits: string): number {
  let sum = 0
  for (const ch of digits) sum += ch.charCodeAt(0) - 48
  return sum
}

/** SIREN of La Poste: its SIRENs do not follow Luhn (INSEE exception). */
export const LA_POSTE_SIREN = "356000000"

/** 9 digits (spaces tolerated) and Luhn-valid. La Poste's SIREN 356000000 is accepted. */
export function isValidSiren(s: string): boolean {
  const v = stripSpaces(s)
  if (!/^\d{9}$/.test(v)) return false
  return v === LA_POSTE_SIREN || luhnValid(v)
}

/**
 * 14 digits (spaces tolerated), Luhn-valid. For La Poste establishments (SIREN 356000000) INSEE
 * numbers them so that the sum of the digits is a multiple of 5 rather than Luhn: either is accepted.
 */
export function isValidSiret(s: string): boolean {
  const v = stripSpaces(s)
  if (!/^\d{14}$/.test(v)) return false
  if (v.startsWith(LA_POSTE_SIREN)) return digitSum(v) % 5 === 0 || luhnValid(v)
  return luhnValid(v)
}

/** Two-digit numeric VAT key of a SIREN: (12 + 3 × (SIREN mod 97)) mod 97. Undefined if not 9 digits. */
export function frenchVatKey(siren: string): string | undefined {
  const v = stripSpaces(siren)
  if (!/^\d{9}$/.test(v)) return undefined
  const key = (12 + 3 * (Number(v) % 97)) % 97
  return key.toString().padStart(2, "0")
}

/** Normalizes a VAT number: no spaces/dots/dashes, uppercase. */
export function normalizeVatNumber(s: string): string {
  return s.replace(/[\s\u00a0\u202f.-]+/g, "").toUpperCase()
}

export type VatNumberStatus =
  /** Well formed and, for FR numbers, key and SIREN agree (or the key is the alphanumeric form). */
  | "ok"
  /** Not a plausible VAT number (country prefix + 2 to 12 alphanumerics; FR: key + 9 digits). */
  | "format"
  /** FR number whose numeric key does not match the SIREN. */
  | "key"
  /** FR number whose SIREN part fails the Luhn check. */
  | "siren"

/**
 * Detailed check of a VAT number. Only French numbers are checked deeper than their shape.
 * Numeric key: (12 + 3 × (SIREN mod 97)) mod 97. The alphanumeric key form (letters in the key,
 * used for some registrations) is tolerated: only the SIREN part is checked.
 */
export function vatNumberStatus(s: string): VatNumberStatus {
  const v = normalizeVatNumber(s)
  if (v.startsWith("FR")) {
    if (!/^FR[0-9A-Z]{2}\d{9}$/.test(v)) return "format"
    const key = v.slice(2, 4)
    const siren = v.slice(4)
    if (!isValidSiren(siren)) return "siren"
    if (/^\d{2}$/.test(key) && key !== frenchVatKey(siren)) return "key"
    return "ok"
  }
  return /^[A-Z]{2}[0-9A-Z+*]{2,12}$/.test(v) ? "ok" : "format"
}

export function isValidFrenchVatNumber(s: string): boolean {
  const v = normalizeVatNumber(s)
  return v.startsWith("FR") && vatNumberStatus(v) === "ok"
}

/** Strips spaces and uppercases an IBAN. */
export function normalizeIban(s: string): string {
  return stripSpaces(s).toUpperCase()
}

/** Exact IBAN length per country (SWIFT registry) for the countries we expect most. */
export const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  FR: 27,
  DE: 22,
  BE: 16,
  ES: 24,
  IT: 27,
  LU: 20,
  NL: 18,
  CH: 21,
  GB: 22,
}

/** ISO 7064 mod 97-10 on the rearranged IBAN. */
export function isValidIban(s: string): boolean {
  const v = normalizeIban(s)
  if (!/^[A-Z]{2}\d{2}[0-9A-Z]{11,30}$/.test(v)) return false
  const expected = IBAN_LENGTHS[v.slice(0, 2)]
  if (expected !== undefined && v.length !== expected) return false
  const rearranged = v.slice(4) + v.slice(0, 4)
  let remainder = 0
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0)
    const chunk = code >= 65 ? String(code - 55) : ch
    for (const digit of chunk) remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97
  }
  return remainder === 1
}

function groupBy(s: string, sizes: number[]): string {
  const parts: string[] = []
  let i = 0
  for (const size of sizes) {
    if (i >= s.length) break
    parts.push(s.slice(i, i + size))
    i += size
  }
  if (i < s.length) parts.push(s.slice(i))
  return parts.join(" ")
}

/** "732829320" → "732 829 320". Returns the input unchanged unless it holds 9 digits. */
export function formatSiren(s: string): string {
  const v = stripSpaces(s)
  return /^\d{9}$/.test(v) ? groupBy(v, [3, 3, 3]) : s
}

/** "73282932000074" → "732 829 320 00074". Returns the input unchanged unless it holds 14 digits. */
export function formatSiret(s: string): string {
  const v = stripSpaces(s)
  return /^\d{14}$/.test(v) ? groupBy(v, [3, 3, 3, 5]) : s
}

/** Groups an IBAN by 4 characters ("FR76 3000 6000 …"). */
export function formatIban(s: string): string {
  const v = normalizeIban(s)
  return v.length === 0 ? "" : (v.match(/.{1,4}/g) ?? []).join(" ")
}
