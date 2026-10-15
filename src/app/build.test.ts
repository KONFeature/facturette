import { describe, expect, it, vi } from "vitest"
import { BuildError, buildFacturX, facturxFilename } from "./build"
import { fakeDeps } from "./test-fakes"

const draft = {
  number: "2026/009 é",
  typeCode: "380" as const,
  issueDate: "2026-10-01",
  operationCategory: "services" as const,
  currency: "EUR",
  seller: {
    name: "Vendeur",
    kind: "company" as const,
    address: { line1: "1 rue A", postalCode: "75001", city: "Paris", countryCode: "FR" },
  },
  buyer: {
    name: "Client",
    kind: "company" as const,
    address: { line1: "2 rue B", postalCode: "69001", city: "Lyon", countryCode: "FR" },
  },
  lines: [
    {
      name: "Conseil",
      quantity: 2,
      unitCode: "HUR",
      unitPrice: 50,
      vatCategory: "S" as const,
      vatRate: 20,
    },
  ],
  payment: { meansCode: "58" },
}
const pdf = new Uint8Array([1, 2, 3])

describe("facturxFilename", () => {
  it("slugifies the invoice number", () => {
    expect(facturxFilename("2026/009 é")).toBe("facture-2026-009-e-facturx.pdf")
    expect(facturxFilename("///")).toBe("facture-sans-numero-facturx.pdf")
  })
})

describe("buildFacturX", () => {
  it("runs preflight → parse → xml → embed and computes totals", async () => {
    const embed = vi.fn(async () => new Uint8Array([9]))
    const out = await buildFacturX(
      draft,
      pdf,
      fakeDeps({
        embedFacturX: embed,
        preflightPdf: async () => ({
          canEmbed: true,
          issues: [{ code: "fonts", severity: "warning", message: "Polices non intégrées" }],
        }),
      }),
    )
    expect(out.bytes).toEqual(new Uint8Array([9]))
    expect(out.totals.taxBasisTotal).toBe(100)
    expect(out.totals.grandTotal).toBe(120)
    expect(out.warnings).toHaveLength(1)
    expect(out.filename).toBe("facture-2026-009-e-facturx.pdf")
    expect(embed).toHaveBeenCalledWith(
      pdf,
      "<xml/>",
      expect.objectContaining({ profile: "EN16931" }),
    )
  })

  it("blocks on a preflight blocker with its French message", async () => {
    const run = buildFacturX(
      draft,
      pdf,
      fakeDeps({
        preflightPdf: async () => ({
          canEmbed: false,
          issues: [{ code: "enc", severity: "blocker", message: "PDF chiffré." }],
        }),
      }),
    )
    await expect(run).rejects.toThrow("PDF chiffré.")
  })

  it("rejects an incomplete draft and wraps xml / embed failures", async () => {
    await expect(buildFacturX({ number: "1" }, pdf, fakeDeps())).rejects.toBeInstanceOf(BuildError)
    await expect(
      buildFacturX(
        draft,
        pdf,
        fakeDeps({
          buildFacturXXml: () => {
            throw new Error("x")
          },
        }),
      ),
    ).rejects.toThrow(/XML/)
    await expect(
      buildFacturX(
        draft,
        pdf,
        fakeDeps({
          embedFacturX: async () => {
            throw new Error("x")
          },
        }),
      ),
    ).rejects.toThrow(/intégration/)
  })
})
