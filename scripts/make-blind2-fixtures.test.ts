/**
 * Self-check of the second blind corpus: ground truth parses, arithmetic and identifiers are valid,
 * the application's own validation reports no error, every "printed" path really appears in the PDF
 * text (pdf.js via the app's extractor), non-embedded-font fixtures have no FontFile, and no
 * identifier or name is shared with the other fixture sets. Never runs the field extractor.
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
import { formatDate2, formatNumber2 } from "./blind2-templates/common"
import { BLIND2 } from "./blind2-templates/data"
import { getPath, textLeafPaths } from "./fixtures-templates/paths"
import { type Blind2ManifestEntry, OUT_DIR, printedOf } from "./make-blind2-fixtures"

const manifest: Blind2ManifestEntry[] = JSON.parse(
  readFileSync(path.join(OUT_DIR, "manifest.json"), "utf8"),
)
const norm = (s: string): string => s.normalize("NFC").replace(/\s+/g, "").toLowerCase()

function candidates(
  entry: Blind2ManifestEntry,
  p: string,
  value: unknown,
  trim: boolean,
): string[] {
  if (typeof value === "string") {
    if (/(^|\.)(issueDate|dueDate|deliveryDate)$/.test(p))
      return [formatDate2(value, entry.formats.date)]
    return [value]
  }
  if (typeof value === "number")
    return [
      formatNumber2(value, entry.formats.number),
      formatNumber2(value, entry.formats.number, 2),
      ...(trim ? [formatNumber2(value, entry.formats.number, 0)] : []),
    ].map((s) => s.replace("-", ""))
  return []
}

/** Identifiers, names and numbers of the two other corpora, to prove independence. */
function otherCorpora(): { ids: Set<string>; names: Set<string>; numbers: Set<string> } {
  const ids = new Set<string>()
  const names = new Set<string>()
  const numbers = new Set<string>()
  for (const dir of ["invoices", "blind"]) {
    const full = path.join(OUT_DIR, "..", dir)
    for (const f of readdirSync(full).filter((x) => x.endsWith(".expected.json"))) {
      const inv = JSON.parse(readFileSync(path.join(full, f), "utf8")) as Invoice
      numbers.add(inv.number)
      for (const p of [inv.seller, inv.buyer]) {
        names.add(norm(p.name))
        if (p.siren) ids.add(p.siren)
        if (p.siret) ids.add(p.siret)
        if (p.vatNumber) ids.add(p.vatNumber)
      }
      if (inv.payment.iban) ids.add(inv.payment.iban)
    }
  }
  return { ids, names, numbers }
}

describe("blind2 corpus", () => {
  it("ships at least 14 fixtures covering the requested scenarios", () => {
    expect(manifest.length).toBeGreaterThanOrEqual(14)
    expect(manifest.map((m) => m.file)).toEqual(BLIND2.map((d) => `${d.slug}.pdf`))
    const tags = new Set(manifest.flatMap((m) => m.tags))
    for (const t of [
      "memoire-honoraires",
      "note-honoraires",
      "situation",
      "acompte",
      "credit-note",
      "autoliquidation",
      "non-embedded-font",
      "repeated-header",
      "no-repeated-header",
      "watermark",
      "stamp",
      "multi-column-address",
      "rib-block",
      "logo-placeholder",
      "qr-placeholder",
      "franchise-tva",
      "negative-line",
      "qty-with-unit",
      "long-names",
    ])
      expect(tags.has(t), t).toBe(true)
    expect(BLIND2.filter((d) => d.nonEmbeddedFont).length).toBeGreaterThanOrEqual(3)
    expect(new Set(BLIND2.map((d) => d.formats.date)).size).toBeGreaterThanOrEqual(8)
  })

  it("does not reuse identifiers, names or invoice numbers of the other corpora", () => {
    const other = otherCorpora()
    const usedIds = new Set<string>()
    const usedNames = new Set<string>()
    for (const d of BLIND2) {
      expect(other.numbers.has(d.invoice.number), `number ${d.invoice.number}`).toBe(false)
      for (const p of [d.invoice.seller, d.invoice.buyer]) {
        expect(other.names.has(norm(p.name)), p.name).toBe(false)
        expect(usedNames.has(norm(p.name)), `duplicate ${p.name}`).toBe(false)
        usedNames.add(norm(p.name))
        for (const id of [p.siren, p.siret, p.vatNumber]) {
          if (!id) continue
          expect(other.ids.has(id), `${id} in another corpus`).toBe(false)
          expect(usedIds.has(id), `duplicate ${id}`).toBe(false)
          usedIds.add(id)
        }
      }
      const iban = d.invoice.payment.iban
      if (iban) {
        expect(other.ids.has(iban), `IBAN ${iban} reused`).toBe(false)
        expect(usedIds.has(iban), `duplicate IBAN ${iban}`).toBe(false)
        usedIds.add(iban)
      }
    }
  })

  for (const def of BLIND2) {
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
        const trim = def.extra.trimZeros === true
        const bytes = new Uint8Array(readFileSync(path.join(OUT_DIR, entry.file)))
        const doc = await extractPdfText(bytes)
        expect(doc.pageCount).toBe(entry.pages)
        const all = norm(doc.pages.map((p) => p.text).join(" "))
        const missing: string[] = []
        for (const p of entry.printed) {
          const value = getPath(invoice, p)
          if (!candidates(entry, p, value, trim).some((c) => all.includes(norm(c))))
            missing.push(`${p} = ${JSON.stringify(value)}`)
        }
        expect(missing).toEqual([])

        const money = (n: number) => {
          const abs = Math.abs(n)
          return trim && Number.isInteger(abs)
            ? norm(formatNumber2(abs, entry.formats.number, 0))
            : norm(formatNumber2(abs, entry.formats.number, 2))
        }
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
          expect(entry.pages).toBe(2)
          expect(norm(doc.pages.at(-1)?.text ?? "")).toContain(money(t.grandTotal))
          expect(norm(doc.pages[0]?.text ?? "")).not.toContain(money(t.grandTotal))
          const label = norm(def.extra.headerLabel ?? "?")
          expect(norm(doc.pages[0]?.text ?? "")).toContain(label)
          if (def.tags.includes("repeated-header"))
            expect(norm(doc.pages[1]?.text ?? "")).toContain(label)
          if (def.tags.includes("no-repeated-header"))
            expect(norm(doc.pages[1]?.text ?? "")).not.toContain(label)
        } else expect(entry.pages).toBe(1)
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

  it("watermark and stamp texts are present in the PDF text layer", async () => {
    for (const d of BLIND2) {
      const word = d.extra.watermark ?? d.extra.stamp
      if (!word) continue
      const doc = await extractPdfText(
        new Uint8Array(readFileSync(path.join(OUT_DIR, `${d.slug}.pdf`))),
      )
      expect(norm(doc.pages.map((p) => p.text).join(" ")), d.slug).toContain(norm(word))
    }
  })
})
