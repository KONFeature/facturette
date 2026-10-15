import { PDFDocument } from "@cantoo/pdf-lib"
import { describe, expect, it } from "vitest"
import { openPdfPreview } from "./preview"

describe("openPdfPreview", () => {
  it("reports the page count and can be destroyed twice", async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.addPage()
    const preview = await openPdfPreview(await doc.save())
    expect(preview.pageCount).toBe(2)
    preview.destroy()
    preview.destroy()
    await expect(preview.renderPage(1, {} as HTMLCanvasElement, { width: 300 })).rejects.toThrow()
  })

  it("rejects garbage bytes with a PdfReadError", async () => {
    await expect(openPdfPreview(new TextEncoder().encode("nope"))).rejects.toMatchObject({
      reason: "invalid",
    })
  })
})
