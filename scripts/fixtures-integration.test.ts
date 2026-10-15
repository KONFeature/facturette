/**
 * Cross-lane contract: the fixtures' ground truth must be accepted by the application's OWN
 * validators and XML builder. Each lane tests itself in isolation; this is the check that the
 * pieces agree with each other (it is what catches e.g. a fixture generator producing 15-digit
 * SIRETs that the app's checksum would reject).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { invoiceSchema } from "../src/domain/invoice"
import { buildFacturXXml } from "../src/lib/facturx/xml"
import { validateInvoice } from "../src/lib/validation"
import {
  isValidFrenchVatNumber,
  isValidIban,
  isValidSiren,
  isValidSiret,
} from "../src/lib/validation/identifiers"

const DIR = resolve(import.meta.dirname, "..", "fixtures", "invoices")

interface Entry {
  file: string
  expected: string
  tags: string[]
}

const manifest: Entry[] = JSON.parse(readFileSync(resolve(DIR, "manifest.json"), "utf8"))

describe.each(manifest)("fixture $file against the app's own rules", (entry) => {
  const invoice = JSON.parse(readFileSync(resolve(DIR, entry.expected), "utf8"))

  it("uses identifiers that pass the application's checksums", () => {
    for (const party of [invoice.seller, invoice.buyer]) {
      if (party.siren) expect(isValidSiren(party.siren), `siren ${party.siren}`).toBe(true)
      if (party.siret) expect(isValidSiret(party.siret), `siret ${party.siret}`).toBe(true)
      if (party.vatNumber)
        expect(isValidFrenchVatNumber(party.vatNumber), `vat ${party.vatNumber}`).toBe(true)
    }
    if (invoice.payment.iban)
      expect(isValidIban(invoice.payment.iban), `iban ${invoice.payment.iban}`).toBe(true)
  })

  it("is a complete invoice that validateInvoice accepts with zero errors", () => {
    const errors = validateInvoice(invoice).issues.filter((i) => i.severity === "error")
    expect(errors.map((e) => `${e.path}: ${e.code}`)).toEqual([])
  })

  it("serialises to Factur-X XML", () => {
    const parsed = invoiceSchema.parse(invoice)
    const xml = buildFacturXXml(parsed, { profile: "EN16931" })
    expect(xml.startsWith("<?xml")).toBe(true)
    expect(xml).toContain(`<ram:ID>${parsed.number.replace(/&/g, "&amp;")}</ram:ID>`)
  })
})
