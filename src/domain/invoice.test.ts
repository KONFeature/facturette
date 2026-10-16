import { describe, expect, it } from "vitest"
import { z } from "zod"
import { deriveSiren, emptyInvoiceDraft, invoiceSchema } from "./invoice"

describe("zod configuration", () => {
  it("runs without JIT so that the strict CSP (no unsafe-eval) sees no violation", () => {
    expect(z.config().jitless).toBe(true)
  })
})

describe("deriveSiren", () => {
  it("reads a SIREN, a SIRET or a French VAT number", () => {
    expect(deriveSiren({ siren: "732 829 320" })).toBe("732829320")
    expect(deriveSiren({ siret: "73282932000074" })).toBe("732829320")
    expect(deriveSiren({ vatNumber: "FR44732829320" })).toBe("732829320")
  })

  it("returns undefined when nothing usable is given", () => {
    expect(deriveSiren({})).toBeUndefined()
    expect(deriveSiren({ siret: "123" })).toBeUndefined()
    expect(deriveSiren({ vatNumber: "DE123456789" })).toBeUndefined()
  })
})

describe("invoiceSchema", () => {
  it("rejects the empty draft and accepts a complete invoice", () => {
    expect(invoiceSchema.safeParse(emptyInvoiceDraft()).success).toBe(false)

    const complete = {
      number: "2026-001",
      typeCode: "380",
      issueDate: "2026-10-01",
      operationCategory: "services",
      currency: "EUR",
      seller: {
        name: "ACME SAS",
        kind: "company",
        siret: "73282932000074",
        address: {
          line1: "1 rue de la Paix",
          postalCode: "75002",
          city: "Paris",
          countryCode: "FR",
        },
      },
      buyer: {
        name: "Client SARL",
        kind: "company",
        address: { line1: "2 avenue Foch", postalCode: "69006", city: "Lyon", countryCode: "FR" },
      },
      lines: [
        {
          name: "Développement",
          quantity: 2,
          unitCode: "DAY",
          unitPrice: 500,
          vatCategory: "S",
          vatRate: 20,
        },
      ],
      payment: { meansCode: "58", iban: "FR7630006000011234567890189" },
    }
    expect(invoiceSchema.safeParse(complete).success).toBe(true)
  })

  it("rejects malformed dates", () => {
    const draft = { ...emptyInvoiceDraft(), issueDate: "01/10/2026" }
    const r = invoiceSchema.safeParse(draft)
    expect(r.success).toBe(false)
  })
})
