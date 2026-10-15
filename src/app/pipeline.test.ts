import { describe, expect, it, vi } from "vitest"
import { PdfReadError } from "../lib/pdf/extract-text"
import { loadPdfPipeline, MAX_PDF_BYTES, PdfLoadError } from "./pipeline"
import { extraction, fakeDeps, pdfFile, sellerProfile, textDoc } from "./test-fakes"

const loadError = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (e) {
    return e
  }
  throw new Error("expected rejection")
}

describe("loadPdfPipeline", () => {
  it("reads, extracts and returns a starting draft with French defaults", async () => {
    const deps = fakeDeps({
      extractInvoice: () =>
        extraction({
          number: "F-2026-001",
          buyer: { name: "Client SARL" },
          lines: [{ name: "Conseil", quantity: 2, unitPrice: 100 }],
        }),
    })
    const out = await loadPdfPipeline(pdfFile(), deps)
    expect(out.scanned).toBe(false)
    expect(out.draft.number).toBe("F-2026-001")
    expect(out.draft.buyer?.name).toBe("Client SARL")
    expect(out.draft.buyer?.address?.countryCode).toBe("FR")
    expect(out.draft.currency).toBe("EUR")
    expect(out.draft.lines).toHaveLength(1)
    expect(out.draft.lines?.[0]?.name).toBe("Conseil")
    expect(out.pdf.bytes.length).toBeGreaterThan(0)
  })

  it("passes saved seller hints to the extractor", async () => {
    const extractInvoice = vi.fn(() => extraction({}))
    await loadPdfPipeline(
      pdfFile(),
      fakeDeps({ extractInvoice, loadSellerProfile: () => sellerProfile }),
    )
    expect(extractInvoice).toHaveBeenCalledWith(expect.anything(), {
      hints: {
        sellerSiren: "732829320",
        sellerVatNumber: "FR44732829320",
        sellerName: "Ma Société SAS",
      },
    })
  })

  it("scanned PDF: no extraction call, empty draft, flagged, warning kept", async () => {
    const extractInvoice = vi.fn(() => extraction({ number: "X" }))
    const out = await loadPdfPipeline(
      pdfFile(),
      fakeDeps({ extractPdfText: async () => textDoc(false), extractInvoice }),
    )
    expect(out.scanned).toBe(true)
    expect(extractInvoice).not.toHaveBeenCalled()
    expect(out.draft.number).toBeUndefined()
    expect(out.extraction.warnings[0]).toMatch(/Aucun texte détecté/)
  })

  it("encrypted PDF maps PdfReadError('encrypted') to a French error", async () => {
    const deps = fakeDeps({
      extractPdfText: async () => {
        throw new PdfReadError("encrypted", "x")
      },
    })
    const e = await loadError(loadPdfPipeline(pdfFile(), deps))
    expect(e).toBeInstanceOf(PdfLoadError)
    expect((e as PdfLoadError).kind).toBe("encrypted")
    expect((e as PdfLoadError).message).toMatch(/mot de passe/)
  })

  it("corrupt PDF becomes 'unreadable'", async () => {
    const deps = fakeDeps({
      extractPdfText: async () => {
        throw new PdfReadError("invalid", "x")
      },
    })
    expect(((await loadError(loadPdfPipeline(pdfFile(), deps))) as PdfLoadError).kind).toBe(
      "unreadable",
    )
  })

  it("rejects wrong mime, missing magic bytes, empty and oversized files", async () => {
    const deps = fakeDeps()
    const kind = async (f: ReturnType<typeof pdfFile>) =>
      ((await loadError(loadPdfPipeline(f, deps))) as PdfLoadError).kind
    expect(await kind(pdfFile({ type: "image/png" }))).toBe("not-pdf")
    expect(await kind(pdfFile({ bytes: new TextEncoder().encode("hello world, not a pdf") }))).toBe(
      "not-pdf",
    )
    expect(await kind(pdfFile({ size: 0, bytes: new Uint8Array() }))).toBe("empty")
    expect(await kind(pdfFile({ size: MAX_PDF_BYTES + 1 }))).toBe("too-big")
  })

  it("accepts a PDF with an empty mime type when the magic bytes are right", async () => {
    const out = await loadPdfPipeline(pdfFile({ type: "" }), fakeDeps())
    expect(out.pdf.name).toBe("facture.pdf")
  })

  it("survives a storage that throws and an extractor that throws", async () => {
    const out = await loadPdfPipeline(
      pdfFile(),
      fakeDeps({
        loadSellerProfile: () => {
          throw new Error("storage off")
        },
        extractInvoice: () => {
          throw new Error("boom")
        },
      }),
    )
    expect(out.extraction.warnings).toHaveLength(1)
    expect(out.draft.currency).toBe("EUR")
  })

  describe("merge precedence", () => {
    const withProfile = (detected: Parameters<typeof extraction>[0], next: string | null = null) =>
      loadPdfPipeline(
        pdfFile(),
        fakeDeps({
          loadSellerProfile: () => sellerProfile,
          suggestNextInvoiceNumber: () => next,
          extractInvoice: () => extraction(detected),
        }),
      )

    it("detected values beat profile defaults and the suggested number", async () => {
      const out = await withProfile(
        {
          number: "F-DETECTED",
          payment: { meansCode: "58", iban: "FR1420041010050500013M02606" },
          legalNotes: { latePaymentPenalty: "Pénalité du PDF" },
          lines: [
            {
              name: "Ligne",
              quantity: 1,
              unitPrice: 10,
              vatCategory: "S",
              vatRate: 20,
              unitCode: "C62",
            },
          ],
          seller: { name: "Autre Vendeur", siren: "552100554", address: { city: "Lyon" } },
        },
        "F-NEXT",
      )
      expect(out.draft.number).toBe("F-DETECTED")
      expect(out.draft.payment?.meansCode).toBe("58")
      expect(out.draft.payment?.iban).toBe("FR1420041010050500013M02606")
      expect(out.draft.payment?.termsText).toBe("30 jours") // gap filled from profile
      expect(out.draft.legalNotes?.latePaymentPenalty).toBe("Pénalité du PDF")
      expect(out.draft.lines?.[0]?.vatCategory).toBe("S")
      // different SIREN: the saved seller identity must NOT leak in
      expect(out.draft.seller?.name).toBe("Autre Vendeur")
      expect(out.draft.seller?.address?.line1).toBeUndefined()
      expect(out.draft.seller?.vatNumber).toBeUndefined()
    })

    it("saved seller profile wins when the PDF seller has the same SIREN", async () => {
      const out = await withProfile({
        seller: { name: "MA SOCIETE (OCR)", siren: "732829320", address: { city: "Paris 1er" } },
      })
      expect(out.draft.seller?.name).toBe("Ma Société SAS")
      expect(out.draft.seller?.vatNumber).toBe("FR44732829320")
      expect(out.draft.seller?.address?.city).toBe("Paris")
    })

    it("uses profile defaults for the blank line, the number suggestion and legal notes", async () => {
      const out = await withProfile({}, "F-NEXT")
      expect(out.draft.number).toBe("F-NEXT")
      expect(out.draft.lines).toHaveLength(1)
      expect(out.draft.lines?.[0]).toMatchObject({ vatCategory: "E", vatRate: 0, unitCode: "HUR" })
      expect(out.draft.vatExemptionReason).toBe("Franchise")
      expect(out.draft.payment?.meansCode).toBe("30")
      expect(out.draft.legalNotes?.latePaymentPenalty).toBe("Pénalité profil")
      // not in profile: keeps the built-in default
      expect(out.draft.legalNotes?.recoveryFee).toMatch(/40 €/)
      // nothing detected about the seller: profile is the best guess
      expect(out.draft.seller?.name).toBe("Ma Société SAS")
    })
  })
})
