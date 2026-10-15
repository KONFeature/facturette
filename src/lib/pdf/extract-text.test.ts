import { degrees, PDFDocument, rgb, StandardFonts } from "@cantoo/pdf-lib"
import { describe, expect, it } from "vitest"
import { extractPdfText, PdfReadError } from "./extract-text"

const PAGE_W = 595
const PAGE_H = 842

/** Draw text at (x, baselineFromTop) in top-left coordinates. */
async function makePdf(
  draw: (ctx: {
    doc: PDFDocument
    pageAt: (index: number) => ReturnType<PDFDocument["addPage"]>
    font: Awaited<ReturnType<PDFDocument["embedFont"]>>
    text: (page: number, str: string, x: number, yTop: number, size?: number) => void
  }) => void,
  pages = 1,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const list = Array.from({ length: pages }, () => doc.addPage([PAGE_W, PAGE_H]))
  const pageAt = (index: number) => list[index] ?? doc.addPage()
  draw({
    doc,
    pageAt,
    font,
    text: (page, str, x, yTop, size = 12) =>
      pageAt(page).drawText(str, { x, y: PAGE_H - yTop, size, font }),
  })
  return doc.save()
}

describe("extractPdfText", () => {
  it("returns items at the expected top-left coordinates", async () => {
    const bytes = await makePdf(({ text }) => text(0, "Facture FA-2026-001 ACME", 72, 100, 14))
    const doc = await extractPdfText(bytes)
    expect(doc.pageCount).toBe(1)
    expect(doc.hasTextLayer).toBe(true)
    const page = doc.pages[0]
    expect(page?.width).toBeCloseTo(PAGE_W, 0)
    expect(page?.height).toBeCloseTo(PAGE_H, 0)
    const item = page?.items[0]
    expect(item?.text).toBe("Facture FA-2026-001 ACME")
    expect(item?.x).toBeCloseTo(72, 0)
    // baseline at 100 from the top, box top = baseline - fontSize
    expect((item?.y ?? 0) + (item?.height ?? 0)).toBeCloseTo(100, 0)
    expect(item?.fontSize).toBeCloseTo(14, 1)
    expect(item?.width).toBeGreaterThan(120)
    expect(item?.width).toBeLessThan(180)
    expect(item?.fontName).toBeTruthy()
    expect(page?.text).toBe("Facture FA-2026-001 ACME")
  })

  it("keeps two far-apart columns on the same baseline on one line", async () => {
    const bytes = await makePdf(({ text }) => {
      text(0, "Total HT", 72, 200)
      text(0, "1 250,00 €", 450, 200)
    })
    const doc = await extractPdfText(bytes)
    expect(doc.pages[0]?.lines).toHaveLength(1)
    expect(doc.pages[0]?.lines[0]?.text).toBe("Total HT 1 250,00 €")
    expect(doc.pages[0]?.lines[0]?.items).toHaveLength(2)
  })

  it("keeps a 5-cell table row on one line, in left-to-right order", async () => {
    const bytes = await makePdf(({ text }) => {
      text(0, "Prestation de conseil", 50, 300)
      text(0, "2", 280, 300)
      text(0, "jour", 330, 300)
      text(0, "150,00", 400, 300)
      text(0, "300,00", 500, 300)
      text(0, "Autre ligne", 50, 320)
    })
    const doc = await extractPdfText(bytes)
    const lines = doc.pages[0]?.lines ?? []
    expect(lines).toHaveLength(2)
    expect(lines[0]?.text).toBe("Prestation de conseil 2 jour 150,00 300,00")
    expect(lines[0]?.items.map((i) => i.text)).toEqual([
      "Prestation de conseil",
      "2",
      "jour",
      "150,00",
      "300,00",
    ])
    expect(lines[1]?.text).toBe("Autre ligne")
    expect(lines[0]?.x0).toBeCloseTo(50, 0)
    expect(lines[0]?.x1).toBeGreaterThan(500)
  })

  it("does not insert a space inside adjacent runs and inserts one at a visible gap", async () => {
    const bytes = await makePdf(({ text, font }) => {
      text(0, "Fact", 72, 100)
      text(0, "ure", 72 + font.widthOfTextAtSize("Fact", 12), 100)
      text(0, "N°", 72 + font.widthOfTextAtSize("Facture", 12) + 6, 100)
    })
    const doc = await extractPdfText(bytes)
    expect(doc.pages[0]?.text).toBe("Facture N°")
  })

  it("groups mixed font sizes sharing a baseline, and separates tight lines", async () => {
    const bytes = await makePdf(({ text }) => {
      text(0, "TOTAL", 72, 400, 18)
      text(0, "TTC", 150, 400, 8)
      text(0, "ligne suivante", 72, 412, 8)
    })
    const doc = await extractPdfText(bytes)
    const lines = doc.pages[0]?.lines ?? []
    expect(lines.map((l) => l.text)).toEqual(["TOTAL TTC", "ligne suivante"])
    expect(lines[0]?.items.map((i) => Math.round(i.fontSize))).toEqual([18, 8])
  })

  it("reads several pages in order and joins them with a blank line", async () => {
    const bytes = await makePdf(({ text }) => {
      text(0, "Page un contenu", 72, 100)
      text(1, "Page deux contenu", 72, 100)
    }, 2)
    const doc = await extractPdfText(bytes)
    expect(doc.pageCount).toBe(2)
    expect(doc.pages.map((p) => p.number)).toEqual([1, 2])
    expect(doc.pages[1]?.items[0]?.page).toBe(2)
    expect(doc.text).toBe("Page un contenu\n\nPage deux contenu")
  })

  it("handles /Rotate 90 by reporting coordinates in the displayed orientation", async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = doc.addPage([PAGE_W, PAGE_H])
    page.setRotation(degrees(90))
    page.drawText("Texte tourne sur la page", { x: 100, y: 200, size: 12, font })
    const result = await extractPdfText(await doc.save())
    const out = result.pages[0]
    // Displayed page is landscape.
    expect(out?.width).toBeCloseTo(PAGE_H, 0)
    expect(out?.height).toBeCloseTo(PAGE_W, 0)
    const item = out?.items[0]
    expect(item?.text).toBe("Texte tourne sur la page")
    // Text runs top→bottom on screen: tall, narrow box.
    expect(item?.height).toBeGreaterThan(item?.width ?? 0)
    // Rotated 90° clockwise: user-space (x, y) lands at screen (y, x).
    expect(item?.x ?? 0).toBeGreaterThan(190)
    expect(item?.x ?? 0).toBeLessThan(215)
    expect(item?.y).toBeCloseTo(100, -1)
  })

  it("reports hasTextLayer=false for a rectangle-only PDF", async () => {
    const bytes = await makePdf(({ pageAt }) =>
      pageAt(0).drawRectangle({ x: 50, y: 50, width: 200, height: 100, color: rgb(0.8, 0.2, 0.2) }),
    )
    const doc = await extractPdfText(bytes)
    expect(doc.hasTextLayer).toBe(false)
    expect(doc.text).toBe("")
    expect(doc.pages[0]?.lines).toEqual([])
  })

  it("reads document info", async () => {
    const pdf = await PDFDocument.create()
    pdf.setTitle("Ma facture")
    pdf.setAuthor("ACME SAS")
    pdf.addPage()
    const doc = await extractPdfText(await pdf.save())
    expect(doc.info.title).toBe("Ma facture")
    expect(doc.info.author).toBe("ACME SAS")
    expect(doc.info.isEncrypted).toBe(false)
  })

  it("accepts an ArrayBuffer and does not detach the caller's bytes", async () => {
    const bytes = await makePdf(({ text }) => text(0, "Une facture avec assez de texte", 72, 100))
    const copy = bytes.slice()
    await extractPdfText(bytes)
    expect(bytes.byteLength).toBe(copy.byteLength)
    const doc = await extractPdfText(copy.buffer)
    expect(doc.hasTextLayer).toBe(true)
  })

  it("throws PdfReadError('invalid') on garbage bytes", async () => {
    const garbage = new TextEncoder().encode("ceci n'est absolument pas un PDF")
    await expect(extractPdfText(garbage)).rejects.toMatchObject({
      name: "PdfReadError",
      reason: "invalid",
    })
    await expect(extractPdfText(new Uint8Array())).rejects.toBeInstanceOf(PdfReadError)
  })

  it("throws PdfReadError('encrypted') on a password-protected PDF", async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    pdf.addPage().drawText("Secret", { x: 50, y: 700, size: 12, font })
    pdf.encrypt({ userPassword: "secret", ownerPassword: "owner" })
    const bytes = await pdf.save()
    await expect(extractPdfText(bytes)).rejects.toMatchObject({ reason: "encrypted" })
  })

  it("flags owner-only encryption (empty user password) via info.isEncrypted", async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    pdf
      .addPage()
      .drawText("Facture protégée en écriture seulement", { x: 50, y: 700, size: 12, font })
    pdf.encrypt({ userPassword: "", ownerPassword: "owner" })
    const doc = await extractPdfText(await pdf.save())
    expect(doc.info.isEncrypted).toBe(true)
    expect(doc.hasTextLayer).toBe(true)
  })

  it("extracts a 5-page text PDF in under one second", async () => {
    const bytes = await makePdf(({ text }) => {
      for (let p = 0; p < 5; p++) {
        for (let row = 0; row < 40; row++) {
          text(p, `Ligne ${row} de la page ${p + 1}`, 50, 60 + row * 18)
          text(p, `${row * 10},00`, 450, 60 + row * 18)
        }
      }
    }, 5)
    await extractPdfText(bytes) // warm up pdf.js
    const start = performance.now()
    const doc = await extractPdfText(bytes)
    const elapsed = performance.now() - start
    expect(doc.pageCount).toBe(5)
    expect(doc.pages[4]?.lines).toHaveLength(40)
    expect(elapsed).toBeLessThan(1000)
  })
})
