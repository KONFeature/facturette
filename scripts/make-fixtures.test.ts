/**
 * Self-check of the fixture corpus: files exist, ground truth parses and is arithmetically
 * consistent, identifiers are checksum-valid, and every path declared "printed" really appears as
 * text in the PDF (extracted with pdf.js, whitespace/case-normalised).
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"
import { describe, expect, it } from "vitest"
import { type Invoice, invoiceSchema } from "../src/domain/invoice"
import { computeTotals } from "../src/domain/totals"
import { FIXTURES } from "./fixtures-templates/data"
import { formatDate, formatNumber } from "./fixtures-templates/format"
import { isFrenchVatValid, isIbanValid, isLuhnValid } from "./fixtures-templates/identifiers"
import { getPath, printedPaths, textLeafPaths } from "./fixtures-templates/paths"
import { type ManifestEntry, OUT_DIR } from "./make-fixtures"

const manifest: ManifestEntry[] = JSON.parse(
  readFileSync(path.join(OUT_DIR, "manifest.json"), "utf8"),
)

const norm = (s: string): string => s.normalize("NFC").replace(/\s+/g, "").toLowerCase()

async function pageTexts(file: string): Promise<string[]> {
  const data = new Uint8Array(readFileSync(path.join(OUT_DIR, file)))
  const task = pdfjs.getDocument({ data, verbosity: 0 })
  const doc = await task.promise
  const texts: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    texts.push(content.items.map((i) => ("str" in i ? i.str : "")).join(" "))
  }
  await task.destroy()
  return texts
}

/** Strings under which a value may legitimately appear in the PDF. */
function candidates(entry: ManifestEntry, p: string, value: unknown): string[] {
  if (typeof value === "string") {
    if (/(^|\.)(issueDate|dueDate|deliveryDate)$/.test(p))
      return [formatDate(value, entry.formats.date)]
    return [value]
  }
  if (typeof value === "number") {
    const style = entry.formats.number
    return [formatNumber(value, style), formatNumber(value, style, 2)].map((s) =>
      s.replace("-", ""),
    )
  }
  return []
}

describe("fixture corpus", () => {
  it("covers the required scenarios", () => {
    const tags = new Set(manifest.flatMap((m) => m.tags))
    for (const t of [
      "franchise-tva",
      "multi-rate",
      "vat-summary-table",
      "multi-page",
      "credit-note",
      "signed-amounts-printed",
      "individual-customer",
      "alt-wording",
      "date-iso",
      "date-long-fr",
      "number-dot-decimal",
      "number-dot-thousands",
      "euro-before",
      "decimal-quantities",
      "line-description",
      "deposit",
      "no-text-layer",
      "non-embedded-font",
    ])
      expect(tags.has(t), t).toBe(true)
    expect(manifest.length).toBeGreaterThanOrEqual(10)
  })

  it("manifest matches the generator definitions", () => {
    expect(manifest.map((m) => m.file)).toEqual(FIXTURES.map((f) => `${f.slug}.pdf`))
    for (const def of FIXTURES) {
      const entry = manifest.find((m) => m.file === `${def.slug}.pdf`)
      expect(entry?.printed, def.slug).toEqual(
        def.recipe.kind === "image" ? [] : printedPaths(def.invoice, def.hidden),
      )
    }
  })

  for (const entry of manifest) {
    describe(entry.file, () => {
      const pdfPath = path.join(OUT_DIR, entry.file)
      const expectedPath = path.join(OUT_DIR, entry.expected)

      it("files exist and stay small", () => {
        expect(existsSync(pdfPath)).toBe(true)
        expect(existsSync(expectedPath)).toBe(true)
        expect(statSync(pdfPath).size).toBeLessThan(100 * 1024)
      })

      const invoice = JSON.parse(readFileSync(expectedPath, "utf8")) as Invoice

      it("ground truth parses and printed paths exist", () => {
        const parsed = invoiceSchema.parse(invoice)
        expect(parsed).toEqual(invoice)
        const text = new Set(textLeafPaths(invoice))
        for (const p of entry.printed) {
          expect(text.has(p), `${p} is not a defined text leaf`).toBe(true)
          expect(getPath(invoice, p)).not.toBeUndefined()
        }
      })

      it("identifiers are checksum-valid", () => {
        for (const party of [invoice.seller, invoice.buyer]) {
          if (party.siren) {
            expect(party.siren, "a SIREN has exactly 9 digits").toMatch(/^\d{9}$/)
            expect(isLuhnValid(party.siren)).toBe(true)
          }
          if (party.siret) {
            expect(party.siret, "a SIRET has exactly 14 digits").toMatch(/^\d{14}$/)
            expect(isLuhnValid(party.siret)).toBe(true)
            expect(party.siret.startsWith(party.siren ?? "")).toBe(true)
          }
          if (party.vatNumber) {
            expect(isFrenchVatValid(party.vatNumber)).toBe(true)
            expect(party.vatNumber.endsWith(party.siren ?? "?")).toBe(true)
          }
        }
        if (invoice.payment.iban) expect(isIbanValid(invoice.payment.iban)).toBe(true)
      })

      it("has no negative quantity or unit price (BR-27)", () => {
        for (const l of invoice.lines) {
          expect(l.quantity).toBeGreaterThanOrEqual(0)
          expect(l.unitPrice).toBeGreaterThanOrEqual(0)
        }
      })

      it("totals are consistent", () => {
        const t = computeTotals(invoice)
        expect(t.grandTotal).toBeCloseTo(t.taxBasisTotal + t.taxTotal, 2)
        expect(t.dueAmount).toBeCloseTo(t.grandTotal - (invoice.prepaidAmount ?? 0), 2)
        if (invoice.prepaidAmount) expect(t.dueAmount).not.toBe(t.grandTotal)
        const notStandard = invoice.lines.some((l) => l.vatCategory !== "S")
        if (notStandard) expect(invoice.vatExemptionReason).toBeTruthy()
      })

      it("printed values and totals appear in the PDF text", async () => {
        const pages = await pageTexts(entry.file)
        expect(pages).toHaveLength(entry.pages)
        const all = norm(pages.join(" "))
        if (entry.printed.length === 0) {
          expect(all).toBe("")
          return
        }
        const missing: string[] = []
        for (const p of entry.printed) {
          const value = getPath(invoice, p)
          const found = candidates(entry, p, value).some((c) => all.includes(norm(c)))
          if (!found) missing.push(`${p} = ${JSON.stringify(value)}`)
        }
        expect(missing).toEqual([])

        const t = computeTotals(invoice)
        const money = (n: number) => norm(formatNumber(Math.abs(n), entry.formats.number, 2))
        expect(all).toContain(money(t.taxBasisTotal))
        expect(all).toContain(money(t.grandTotal))
        expect(all).toContain(money(t.dueAmount))
        if (t.taxTotal !== 0) expect(all).toContain(money(t.taxTotal))
        for (const v of t.vatBreakdown) expect(all).toContain(money(v.taxableAmount))

        if (entry.tags.includes("multi-page")) {
          expect(entry.pages).toBeGreaterThanOrEqual(2)
          const last = norm(pages.at(-1) ?? "")
          const first = norm(pages[0] ?? "")
          expect(last).toContain(money(t.grandTotal))
          expect(first).not.toContain(money(t.grandTotal))
        }
      })
    })
  }

  it("image-only fixture has no text and the pdf-lib one uses a non-embedded Helvetica", () => {
    const image = readFileSync(path.join(OUT_DIR, "12-image-seule-sans-texte.pdf"), "latin1")
    expect(image).toContain("/Subtype /Image")
    expect(image).not.toMatch(/\/Type\s*\/Font\b/)
    const plain = readFileSync(path.join(OUT_DIR, "13-pdflib-helvetica.pdf"), "latin1")
    expect(plain).toContain("/BaseFont /Helvetica")
    expect(plain).not.toContain("/FontFile")
  })

  it("credit note prints negative amounts and quotes the original invoice", async () => {
    const pages = await pageTexts("05-avoir.pdf")
    const text = pages.join(" ")
    expect(text).toContain("-380,00")
    expect(norm(text)).toContain(norm("Avoir sur facture F-2026-0412 du 12/09/2026"))
  })
})
