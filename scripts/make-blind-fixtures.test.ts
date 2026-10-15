/**
 * Self-check of the blind corpus: ground truth parses, arithmetic and identifiers are valid, the
 * application's own validation reports no error, every "printed" path really appears in the PDF
 * text (pdf.js via the app's extractor), and non-embedded-font fixtures have no FontFile.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { type Invoice, invoiceSchema } from "../src/domain/invoice"
import { computeTotals } from "../src/domain/totals"
import { extractPdfText } from "../src/lib/pdf/extract-text"
import { validateInvoice } from "../src/lib/validation"
import {
  isValidFrenchVatNumber,
  isValidIban,
  isValidSiren,
  isValidSiret,
} from "../src/lib/validation/identifiers"
import { BLIND } from "./blind-templates/data"
import { formatDate, formatNumber } from "./fixtures-templates/format"
import { getPath, textLeafPaths } from "./fixtures-templates/paths"
import { type BlindManifestEntry, OUT_DIR, printedOf } from "./make-blind-fixtures"

const manifest: BlindManifestEntry[] = JSON.parse(
  readFileSync(path.join(OUT_DIR, "manifest.json"), "utf8"),
)
const norm = (s: string): string => s.normalize("NFC").replace(/\s+/g, "").toLowerCase()

function candidates(entry: BlindManifestEntry, p: string, value: unknown): string[] {
  if (typeof value === "string") {
    if (/(^|\.)(issueDate|dueDate|deliveryDate)$/.test(p))
      return [formatDate(value, entry.formats.date)]
    return [value]
  }
  if (typeof value === "number")
    return [
      formatNumber(value, entry.formats.number),
      formatNumber(value, entry.formats.number, 2),
    ].map((s) => s.replace("-", ""))
  return []
}

describe("blind corpus", () => {
  it("covers the requested scenarios and ships at least 12 fixtures", () => {
    expect(manifest.length).toBeGreaterThanOrEqual(12)
    expect(manifest.map((m) => m.file)).toEqual(BLIND.map((d) => `${d.slug}.pdf`))
    const tags = new Set(manifest.flatMap((m) => m.tags))
    for (const t of [
      "dolibarr",
      "non-embedded-font",
      "excel",
      "word",
      "saas",
      "footer-identity-only",
      "discount-column",
      "sections",
      "bilingual",
      "credit-note",
      "deposit",
      "negative-line",
      "franchise-tva",
      "rib-block",
      "multi-page",
      "buyer-first",
      "delivery-address",
    ])
      expect(tags.has(t), t).toBe(true)
  })

  it("does not reuse identifiers of the tuning corpus", () => {
    const tuning = new Set<string>()
    for (const f of readdirSync(path.join(OUT_DIR, "../invoices")))
      if (f.endsWith(".expected.json")) {
        const inv = JSON.parse(
          readFileSync(path.join(OUT_DIR, "../invoices", f), "utf8"),
        ) as Invoice
        for (const p of [inv.seller, inv.buyer]) if (p.siren) tuning.add(p.siren)
        if (inv.payment.iban) tuning.add(inv.payment.iban)
      }
    const used = new Set<string>()
    for (const d of BLIND) {
      for (const p of [d.invoice.seller, d.invoice.buyer]) {
        if (!p.siren) continue
        expect(used.has(p.siren), `duplicate SIREN ${p.siren}`).toBe(false)
        used.add(p.siren)
        expect(tuning.has(p.siren), `SIREN ${p.siren} is in the tuning corpus`).toBe(false)
      }
      if (d.invoice.payment.iban)
        expect(tuning.has(d.invoice.payment.iban), "IBAN reused").toBe(false)
    }
  })

  for (const def of BLIND) {
    const entry = manifest.find((m) => m.file === `${def.slug}.pdf`)
    describe(def.slug, () => {
      const invoice = JSON.parse(
        readFileSync(path.join(OUT_DIR, `${def.slug}.expected.json`), "utf8"),
      ) as Invoice

      it("ground truth parses, totals and identifiers are valid", () => {
        expect(invoiceSchema.parse(invoice)).toEqual(invoice)
        expect(invoice).toEqual(def.invoice)
        const t = computeTotals(invoice)
        expect(t.grandTotal).toBeCloseTo(t.taxBasisTotal + t.taxTotal, 2)
        expect(t.dueAmount).toBeCloseTo(t.grandTotal - (invoice.prepaidAmount ?? 0), 2)
        expect(t.grandTotal).toBeGreaterThan(0)
        for (const p of [invoice.seller, invoice.buyer]) {
          if (p.siren) expect(isValidSiren(p.siren)).toBe(true)
          if (p.siret) {
            expect(isValidSiret(p.siret)).toBe(true)
            expect(p.siret.startsWith(p.siren ?? "")).toBe(true)
          }
          if (p.vatNumber) {
            expect(isValidFrenchVatNumber(p.vatNumber)).toBe(true)
            expect(p.vatNumber.endsWith(p.siren ?? "?")).toBe(true)
          }
        }
        if (invoice.payment.iban) expect(isValidIban(invoice.payment.iban)).toBe(true)
        if (invoice.typeCode === "381") {
          expect(invoice.precedingInvoice?.number).toBeTruthy()
          for (const l of invoice.lines) {
            expect(l.quantity).toBeGreaterThan(0)
            expect(l.unitPrice).toBeGreaterThan(0)
          }
        }
      })

      it("validateInvoice reports no error", () => {
        const report = validateInvoice(invoice, { today: "2026-10-16" })
        expect(report.issues.filter((i) => i.severity === "error")).toEqual([])
      })

      it("manifest entry matches the definition and the PDF stays small", () => {
        expect(entry?.printed).toEqual(printedOf(def))
        expect(entry?.formats).toEqual(def.formats)
        const textPaths = new Set(textLeafPaths(invoice))
        for (const p of entry?.printed ?? []) expect(textPaths.has(p), p).toBe(true)
        expect(statSync(path.join(OUT_DIR, `${def.slug}.pdf`)).size).toBeLessThan(100 * 1024)
      })

      it("printed values, line amounts and totals appear in the PDF text", async () => {
        if (!entry) throw new Error("missing manifest entry")
        const bytes = new Uint8Array(readFileSync(path.join(OUT_DIR, entry.file)))
        const doc = await extractPdfText(bytes)
        expect(doc.pageCount).toBe(entry.pages)
        const all = norm(doc.pages.map((p) => p.text).join(" "))
        const missing: string[] = []
        for (const p of entry.printed) {
          const value = getPath(invoice, p)
          if (!candidates(entry, p, value).some((c) => all.includes(norm(c))))
            missing.push(`${p} = ${JSON.stringify(value)}`)
        }
        expect(missing).toEqual([])

        const money = (n: number) => norm(formatNumber(Math.abs(n), entry.formats.number, 2))
        const t = computeTotals(invoice)
        for (const n of [
          ...t.lineNets,
          t.taxBasisTotal,
          ...t.vatBreakdown.map((v) => v.taxAmount),
          t.grandTotal,
          t.dueAmount,
        ])
          expect(all, `amount ${n}`).toContain(money(n))
        if (invoice.typeCode === "381") expect(all).toContain("-")
        if (def.tags.includes("multi-page")) {
          expect(entry.pages).toBeGreaterThanOrEqual(2)
          expect(norm(doc.pages.at(-1)?.text ?? "")).toContain(money(t.grandTotal))
          expect(norm(doc.pages[0]?.text ?? "")).not.toContain(money(t.grandTotal))
        }
      })

      it("font embedding matches the declaration", () => {
        const raw = readFileSync(path.join(OUT_DIR, `${def.slug}.pdf`), "latin1")
        if (def.nonEmbeddedFont) {
          expect(raw).toMatch(/\/BaseFont\s*\/(Helvetica|Times-Roman)/)
          expect(raw).not.toContain("/FontFile")
        } else {
          expect(raw).toContain("/FontFile")
        }
      })
    })
  }

  it("seller identity of B06 appears only in the footer line", async () => {
    const entry = manifest.find((m) => m.file.startsWith("B06"))
    if (!entry) throw new Error("B06 missing")
    const doc = await extractPdfText(new Uint8Array(readFileSync(path.join(OUT_DIR, entry.file))))
    const lines = doc.pages.flatMap((p) => p.lines)
    const def = BLIND.find((d) => d.slug.startsWith("B06"))
    const siret = def?.invoice.seller.siret ?? "?"
    const hits = lines.filter((l) => norm(l.text).includes(siret))
    expect(hits.length).toBeGreaterThan(0)
    const name = norm(def?.invoice.seller.name ?? "?")
    const top = doc.pages[0]?.height ?? 0
    for (const l of lines.filter((x) => norm(x.text).includes(name))) {
      expect(l.y, l.text).toBeGreaterThan(top * 0.8)
    }
  })
})
