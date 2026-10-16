import { PDFDocument } from "@cantoo/pdf-lib"
import { describe, expect, it } from "vitest"
import { extractPdfText, MAX_PDF_PAGES, PdfReadError } from "./extract-text"

async function blankPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([200, 200])
  return doc.save()
}

describe("page limit", () => {
  it("refuses a document with more pages than any invoice would have", async () => {
    const bytes = await blankPdf(MAX_PDF_PAGES + 1)
    const error = await extractPdfText(bytes).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PdfReadError)
    expect((error as PdfReadError).reason).toBe("unsupported")
    expect((error as PdfReadError).message).toContain(String(MAX_PDF_PAGES + 1))
  })

  it("accepts a document exactly at the limit", async () => {
    const doc = await extractPdfText(await blankPdf(MAX_PDF_PAGES))
    expect(doc.pageCount).toBe(MAX_PDF_PAGES)
  })
})
