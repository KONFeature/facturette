/** Checksum helpers: generate AND verify French identifiers (all fixture data is fictional). */

function luhnSum(digits: string, doubleFromRightmost: boolean): number {
  let sum = 0
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i])
    const pos = digits.length - 1 - i
    if ((pos % 2 === 0) === doubleFromRightmost) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum
}

export function isLuhnValid(digits: string): boolean {
  return /^\d+$/.test(digits) && luhnSum(digits, false) % 10 === 0
}

function withLuhn(partial: string): string {
  const check = (10 - (luhnSum(partial, true) % 10)) % 10
  return `${partial}${check}`
}

/** 8 free digits + Luhn check digit. */
export function makeSiren(base8: string): string {
  return withLuhn(base8)
}

/** SIREN + 4-digit NIC + Luhn check digit (14 digits, Luhn valid). */
export function makeSiret(siren: string, nic4: string): string {
  return withLuhn(`${siren}${nic4}`)
}

export function frenchVatKey(siren: string): string {
  return String((12 + 3 * (Number(siren) % 97)) % 97).padStart(2, "0")
}

export function makeFrenchVat(siren: string): string {
  return `FR${frenchVatKey(siren)}${siren}`
}

export function isFrenchVatValid(vat: string): boolean {
  const m = /^FR(\d{2})(\d{9})$/.exec(vat)
  return m !== null && m[1] === frenchVatKey(m[2] ?? "")
}

function mod97(numeric: string): number {
  let rest = 0
  for (const ch of numeric) rest = (rest * 10 + Number(ch)) % 97
  return rest
}

function ibanToNumeric(s: string): string {
  return [...s].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join("")
}

export function isIbanValid(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false
  return mod97(ibanToNumeric(iban.slice(4) + iban.slice(0, 4))) === 1
}

/** French IBAN from bank (5), branch (5) and account (11, digits only) with the RIB key. */
export function makeFrenchIban(bank5: string, branch5: string, account11: string): string {
  const ribKey = String(
    97 - Number((89n * BigInt(bank5) + 15n * BigInt(branch5) + 3n * BigInt(account11)) % 97n),
  ).padStart(2, "0")
  const bban = `${bank5}${branch5}${account11}${ribKey}`
  const check = String(98 - mod97(ibanToNumeric(`${bban}FR00`))).padStart(2, "0")
  return `FR${check}${bban}`
}
