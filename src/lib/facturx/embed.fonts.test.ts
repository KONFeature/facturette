/**
 * Repair of non-embedded fonts by metric-compatible substitution (embedFacturXDetailed).
 * Inputs: src/lib/facturx/assets/test-inputs/ (see make-font-inputs.{py,mjs}) and fixture 13.
 */
import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "@cantoo/pdf-lib"
import { describe, expect, it } from "vitest"
import { extractPdfText } from "../pdf/extract-text"
import { embedFacturX, embedFacturXDetailed, preflightPdf } from "./embed"
import {
  array,
  dict,
  makeHelveticaPdf,
  N,
  pageContents,
  resolve,
  streamData,
  TEST_INVOICE,
} from "./embed.testkit"
import { glyphNameToUnicode } from "./fonts/repair"
import { TrueTypeFont } from "./fonts/truetype"

const assets = resolvePath(import.meta.dirname, "assets")
const input = (name: string) =>
  new Uint8Array(readFileSync(resolvePath(assets, "test-inputs", name)))
const fixture13 = () =>
  new Uint8Array(
    readFileSync(
      resolvePath(import.meta.dirname, "../../../fixtures/invoices/13-pdflib-helvetica.pdf"),
    ),
  )
const XML = readFileSync(resolvePath(assets, "sample-en16931.xml"), "utf8")
const OPTIONS = { invoice: TEST_INVOICE, now: new Date(Date.UTC(2026, 9, 16, 8, 30, 0)) }
const load = (bytes: Uint8Array) => PDFDocument.load(bytes, { updateMetadata: false })

const REPAIRABLE: [string, () => Promise<Uint8Array> | Uint8Array][] = [
  ["13-pdflib-helvetica (fixture)", fixture13],
  ["pdf-lib Helvetica (testkit)", makeHelveticaPdf],
  ["reportlab-invoice", () => input("reportlab-invoice.pdf")],
  ["fpdf2-multipage", () => input("fpdf2-multipage.pdf")],
  ["pdflib-standard12", () => input("pdflib-standard12.pdf")],
  ["descriptor-fonts", () => input("descriptor-fonts.pdf")],
]

/** Every font dictionary reachable from page, form XObject and annotation resources. */
function fonts(doc: PDFDocument): PDFDict[] {
  const out = new Set<PDFDict>()
  const seen = new Set<PDFDict>()
  const walk = (resources: PDFDict | undefined) => {
    if (!resources || seen.has(resources)) return
    seen.add(resources)
    for (const v of dict(doc, resources.get(N("Font")))?.values() ?? []) {
      const f = dict(doc, v)
      if (f) out.add(f)
    }
    for (const v of dict(doc, resources.get(N("XObject")))?.values() ?? []) {
      walk(dict(doc, dict(doc, v)?.get(N("Resources"))))
    }
  }
  for (const page of doc.getPages()) {
    walk(dict(doc, page.node.get(N("Resources"))))
    for (const a of array(doc, page.node.get(N("Annots")))) {
      const ap = dict(doc, dict(doc, a)?.get(N("AP")))
      walk(dict(doc, dict(doc, ap?.get(N("N")))?.get(N("Resources"))))
    }
  }
  return [...out]
}

function baseFont(doc: PDFDocument, font: PDFDict): string {
  const name = resolve(doc, font.get(N("BaseFont")))
  return name instanceof PDFName ? name.decodeText() : ""
}

function isEmbedded(doc: PDFDocument, font: PDFDict): boolean {
  const descriptor = dict(doc, font.get(N("FontDescriptor")))
  return ["FontFile", "FontFile2", "FontFile3"].some((k) => descriptor?.has(N(k)))
}

const num = (doc: PDFDocument, obj: Parameters<typeof resolve>[1]) => {
  const v = resolve(doc, obj)
  return v instanceof PDFNumber ? v.asNumber() : undefined
}

interface Item {
  text: string
  x: number
  y: number
  width: number
  page: number
}

async function textItems(pdf: Uint8Array): Promise<Item[]> {
  const doc = await extractPdfText(pdf)
  return doc.pages.flatMap((p) =>
    p.items.map((i) => ({ text: i.text, x: i.x, y: i.y, width: i.width, page: i.page })),
  )
}

function expectSameLayout(before: Item[], after: Item[]) {
  expect(after.length).toBe(before.length)
  expect(after.map((i) => i.text)).toEqual(before.map((i) => i.text))
  before.forEach((b, k) => {
    const a = after[k]
    expect(a?.page).toBe(b.page)
    expect(Math.abs((a?.x ?? Number.NaN) - b.x)).toBeLessThanOrEqual(0.5)
    expect(Math.abs((a?.y ?? Number.NaN) - b.y)).toBeLessThanOrEqual(0.5)
    expect(Math.abs((a?.width ?? Number.NaN) - b.width)).toBeLessThanOrEqual(0.5)
  })
}

describe("embedFacturXDetailed font repair", () => {
  for (const [name, source] of REPAIRABLE) {
    it(`${name}: embeds every font, keeps contents and text layout`, async () => {
      const original = await source()
      const { pdf, report } = await embedFacturXDetailed(original, XML, OPTIONS)
      expect(report.fontsUnrepairable).toEqual([])
      expect(report.fontsReplaced.length).toBeGreaterThan(0)
      const before = await load(original)
      const after = await load(pdf)
      expect(fonts(after).every((f) => isEmbedded(after, f))).toBe(true)
      expect(pageContents(after)).toEqual(pageContents(before))
      expectSameLayout(await textItems(original), await textItems(pdf))
      const preflight = await preflightPdf(pdf)
      expect(preflight.issues).toEqual([])
    })
  }

  it("keeps the extracted text of accented French, euro and quotes", async () => {
    const { pdf } = await embedFacturXDetailed(input("reportlab-invoice.pdf"), XML, OPTIONS)
    const text = (await extractPdfText(pdf)).text
    for (const s of ["Développement d’une application « Facturation »", "3 990,36 €", "œuvre"]) {
      expect(text).toContain(s)
    }
    expect(text).toContain("àâäçéèêëîïôöùûüÿœæ ÀÉÈÇŒ € « » “ ” ‘ ’ – — … ‰ ™")
  })

  it("maps the standard families and styles to Arimo, Tinos and Cousine", async () => {
    const { report } = await embedFacturXDetailed(input("pdflib-standard12.pdf"), XML, OPTIONS)
    const map = Object.fromEntries(report.fontsReplaced.map((f) => [f.original, f.substitute]))
    expect(map).toEqual({
      Helvetica: "Arimo",
      "Helvetica-Bold": "Arimo-Bold",
      "Helvetica-Oblique": "Arimo-Italic",
      "Helvetica-BoldOblique": "Arimo-BoldItalic",
      "Times-Roman": "Tinos",
      "Times-Bold": "Tinos-Bold",
      "Times-Italic": "Tinos-Italic",
      "Times-BoldItalic": "Tinos-BoldItalic",
      Courier: "Cousine",
      "Courier-Bold": "Cousine-Bold",
      "Courier-Oblique": "Cousine-Italic",
      "Courier-BoldOblique": "Cousine-BoldItalic",
    })
  })

  it("handles descriptor fonts, unknown fonts with widths, form XObjects and annotations", async () => {
    const source = input("descriptor-fonts.pdf")
    const { pdf, report } = await embedFacturXDetailed(source, XML, OPTIONS)
    const map = Object.fromEntries(report.fontsReplaced.map((f) => [f.original, f.substitute]))
    expect(map).toEqual({
      ArialMT: "Arimo",
      "Arial,Bold": "Arimo-Bold",
      TimesNewRomanPSMT: "Tinos",
      "CourierNewPS-BoldItalicMT": "Cousine-BoldItalic",
      "Verdana-Italic": "Arimo-Italic",
      Helvetica: "Arimo",
      Courier: "Cousine",
      "Times-Bold": "Tinos-Bold",
    })
    // The /Widths of fonts that had them are kept as is.
    const before = await load(source)
    const after = await load(pdf)
    const widthsOf = (doc: PDFDocument) =>
      Object.fromEntries(
        fonts(doc)
          .filter((f) => f.has(N("Widths")))
          .map((f) => [
            baseFont(doc, f).replace(/^[A-Z]{6}\+/, ""),
            array(doc, f.get(N("Widths"))).map((w) => num(doc, w)),
          ]),
      )
    const kept = widthsOf(before)
    const afterByOriginal = new Map(
      fonts(after).map((f) => [array(after, f.get(N("Widths"))).join(" "), f]),
    )
    for (const widths of Object.values(kept)) {
      expect(afterByOriginal.has(widths.join(" "))).toBe(true)
    }
  })

  it("writes PDF/A-conformant TrueType dictionaries whose program widths match /Widths", async () => {
    for (const [, source] of REPAIRABLE) {
      const { pdf } = await embedFacturXDetailed(await source(), XML, OPTIONS)
      const doc = await load(pdf)
      for (const font of fonts(doc)) {
        if (font.get(N("Subtype")) !== PDFName.of("TrueType")) continue
        const descriptor = dict(doc, font.get(N("FontDescriptor")))
        const file = resolve(doc, descriptor?.get(N("FontFile2")))
        if (!(file instanceof PDFRawStream)) continue
        expect(baseFont(doc, font)).toMatch(/^[A-Z]{6}\+(Arimo|Tinos|Cousine)/)
        const flags = num(doc, descriptor?.get(N("Flags"))) ?? 0
        expect(flags & 32).toBe(32)
        expect(flags & 4).toBe(0)
        const bytes = streamData(doc, file)
        expect(num(doc, file.dict.get(N("Length1")))).toBe(bytes.length)
        const program = new TrueTypeFont(bytes)
        const encoding = resolve(doc, font.get(N("Encoding")))
        const baseObj =
          encoding instanceof PDFName ? encoding : dict(doc, encoding)?.get(N("BaseEncoding"))
        const base = baseObj instanceof PDFName ? baseObj.decodeText() : ""
        expect(["WinAnsiEncoding", "MacRomanEncoding"]).toContain(base)
        // Every glyph reachable through the encoding has the dictionary width (+-1/1000 em).
        const first = num(doc, font.get(N("FirstChar"))) ?? 0
        const differences = new Map<number, string>()
        if (encoding instanceof PDFDict) {
          let code = 0
          for (const item of array(doc, encoding.get(N("Differences")))) {
            if (item instanceof PDFNumber) code = item.asNumber()
            else if (item instanceof PDFName) differences.set(code++, item.decodeText())
          }
        }
        const decoder = new TextDecoder("windows-1252")
        array(doc, font.get(N("Widths"))).forEach((w, i) => {
          const code = first + i
          const name = differences.get(code)
          const unicode =
            name !== undefined
              ? glyphNameToUnicode(name)
              : code >= 32 && ![0x7f, 0x81, 0x8d, 0x8f, 0x90, 0x9d].includes(code)
                ? decoder.decode(new Uint8Array([code])).codePointAt(0)
                : undefined
          if (base !== "WinAnsiEncoding" || unicode === undefined) return
          const gid = program.glyphForUnicode(
            unicode === 0xa0 ? 0x20 : unicode === 0xad ? 0x2d : unicode,
          )
          if (gid === undefined) return
          const programWidth = ((program.advances[gid] ?? 0) * 1000) / program.unitsPerEm
          expect(Math.abs(programWidth - (num(doc, w) ?? 0))).toBeLessThanOrEqual(1)
        })
      }
    }
  })

  it("rewrites /Differences with AGL names", async () => {
    const { pdf } = await embedFacturXDetailed(input("descriptor-fonts.pdf"), XML, OPTIONS)
    const doc = await load(pdf)
    const fdiff = dict(
      doc,
      dict(doc, dict(doc, doc.getPage(0).node.get(N("Resources")))?.get(N("Font")))?.get(
        N("FDiff"),
      ),
    )
    const encoding = dict(doc, fdiff?.get(N("Encoding")))
    expect(encoding?.get(N("BaseEncoding"))).toBe(PDFName.of("WinAnsiEncoding"))
    const diffs = array(doc, encoding?.get(N("Differences"))).map((o) => o.toString())
    expect(diffs.slice(0, 5)).toEqual(["1", "/Euro", "/oe", "/Ydieresis", "/quotedblleft"])
  })

  it("translates the implicit StandardEncoding of core fonts", async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 200])
    const ctx = doc.context
    const font = ctx.register(ctx.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Times-Roman" }))
    page.node.setFontDictionary(N("F1"), font)
    page.node.addContentStream(
      ctx.register(ctx.stream("BT /F1 12 Tf 20 100 Td (l'\\341t\\351) Tj ET")),
    )
    const source = await doc.save()
    const { pdf, report } = await embedFacturXDetailed(source, XML, OPTIONS)
    expect(report.fontsReplaced.map((f) => f.substitute)).toEqual(["Tinos"])
    const out = await load(pdf)
    const repaired = fonts(out)[0]
    const encoding = dict(out, repaired?.get(N("Encoding")))
    const diffs = array(out, encoding?.get(N("Differences"))).map((o) => o.toString())
    // 047 is quoteright and 0341 is AE in StandardEncoding (quotesingle / aacute in WinAnsi).
    expect(diffs).toContain("/quoteright")
    expect(diffs).toContain("/AE")
    expectSameLayout(await textItems(source), await textItems(pdf))
  })

  it("reports the pages where each font is used", async () => {
    const { report } = await embedFacturXDetailed(input("fpdf2-multipage.pdf"), XML, OPTIONS)
    const helveticaBold = report.fontsReplaced.find((f) => f.original === "Helvetica-Bold")
    expect(helveticaBold?.pages).toEqual([1, 2, 3])
  })

  it("is idempotent and never touches embedded fonts", async () => {
    const once = await embedFacturX(input("reportlab-invoice.pdf"), XML, OPTIONS)
    const twice = await embedFacturXDetailed(once, XML, OPTIONS)
    expect(twice.report).toEqual({ fontsReplaced: [], fontsUnrepairable: [] })
    const a = await load(once)
    const b = await load(twice.pdf)
    const summary = (doc: PDFDocument) =>
      fonts(doc).map(
        (f) =>
          `${baseFont(doc, f)} ${streamData(doc, dict(doc, f.get(N("FontDescriptor")))?.get(N("FontFile2"))).length}`,
      )
    expect(summary(b)).toEqual(summary(a))
    expect(twice.pdf.length).toBeLessThan(once.length + 2048)

    const chromium = await embedFacturXDetailed(input("chromium-invoice.pdf"), XML, OPTIONS)
    expect(chromium.report).toEqual({ fontsReplaced: [], fontsUnrepairable: [] })
  })

  it("shares one font program between dictionaries of the same font", async () => {
    const { pdf } = await embedFacturXDetailed(input("fpdf2-multipage.pdf"), XML, OPTIONS)
    const doc = await load(pdf)
    const programs = doc.context
      .enumerateIndirectObjects()
      .filter(([, o]) => o instanceof PDFRawStream && o.dict.has(N("Length1")))
    expect(programs).toHaveLength(12)
  })

  it("can be disabled", async () => {
    const { pdf, report } = await embedFacturXDetailed(await makeHelveticaPdf(), XML, {
      ...OPTIONS,
      repairFonts: false,
    })
    expect(report.fontsReplaced).toEqual([])
    expect(report.fontsUnrepairable).toEqual([
      { name: "Helvetica", reason: "remplacement des polices désactivé" },
    ])
    const doc = await load(pdf)
    expect(fonts(doc).some((f) => isEmbedded(doc, f))).toBe(false)
  })

  it("reports Symbol, ZapfDingbats and non-embedded Type0 fonts and leaves them untouched", async () => {
    const source = input("unrepairable-fonts.pdf")
    const { pdf, report } = await embedFacturXDetailed(source, XML, OPTIONS)
    expect(report.fontsReplaced.map((f) => f.original)).toEqual(["Helvetica"])
    expect(report.fontsUnrepairable.map((f) => f.name)).toEqual([
      "Symbol",
      "ZapfDingbats",
      "ArialMT",
    ])
    expect(report.fontsUnrepairable[2]?.reason).toMatch(/Type0/)
    const doc = await load(pdf)
    const left = fonts(doc)
      .filter((f) => !isEmbedded(doc, f))
      .map((f) => `${f.get(N("Subtype"))} ${baseFont(doc, f)}`)
    expect(left.sort()).toEqual(["/Type0 ArialMT", "/Type1 Symbol", "/Type1 ZapfDingbats"])
    expectSameLayout(await textItems(source), await textItems(pdf))
  })

  it("leaves a font it cannot read untouched instead of failing", async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 200])
    const ctx = doc.context
    const odd = ctx.obj({
      Type: "Font",
      Subtype: "Type1",
      BaseFont: "Helvetica",
      Encoding: "MacExpertEncoding",
    })
    const badWidths = ctx.obj({
      Type: "Font",
      Subtype: "TrueType",
      BaseFont: "ArialMT",
      FirstChar: 32,
      LastChar: 33,
      Widths: [PDFName.of("x"), 278],
      Encoding: "WinAnsiEncoding",
    })
    const custom = ctx.obj({
      Type: "Font",
      Subtype: "Type1",
      BaseFont: "Helvetica",
      Encoding: { Differences: [1, "g123"] },
    })
    const noWidths = ctx.obj({ Type: "Font", Subtype: "Type1", BaseFont: "FooSans" })
    const entries = { F1: odd, F2: badWidths, F3: custom, F4: noWidths }
    for (const [key, value] of Object.entries(entries)) {
      page.node.setFontDictionary(N(key), ctx.register(value))
    }
    const snapshot = Object.values(entries).map((d) => d.toString())
    const { pdf, report } = await embedFacturXDetailed(await doc.save(), XML, OPTIONS)
    expect(report.fontsReplaced).toEqual([])
    expect(report.fontsUnrepairable.map((f) => f.reason)).toEqual([
      "encodage MacExpertEncoding non pris en charge",
      "largeurs de caractères illisibles",
      "police inconnue sans largeurs de caractères : la mise en page ne pourrait pas être conservée",
    ])
    const out = await load(pdf)
    expect(fonts(out).map((f) => f.toString())).toEqual(snapshot)
  })
})

describe("preflightPdf font messages", () => {
  it("announces the replacement of repairable fonts", async () => {
    const report = await preflightPdf(await makeHelveticaPdf())
    expect(report.canEmbed).toBe(true)
    expect(report.issues).toHaveLength(1)
    const issue = report.issues[0]
    expect(issue).toMatchObject({
      code: "fonts-not-embedded",
      severity: "warning",
      repairable: true,
    })
    expect(issue?.message).toContain("Helvetica")
    expect(issue?.message).toContain("remplacées par des polices équivalentes de même largeur")
    expect(issue?.message).toContain("Arimo")
  })

  it("says when fonts cannot be repaired", async () => {
    const report = await preflightPdf(input("unrepairable-fonts.pdf"))
    expect(report.issues.map((i) => [i.code, i.severity, i.repairable])).toEqual([
      ["fonts-not-embedded", "warning", true],
      ["fonts-not-embedded", "warning", false],
    ])
    const message = report.issues[1]?.message ?? ""
    expect(message).toContain("Symbol, ZapfDingbats, ArialMT")
    expect(message).toContain("ne pourra pas être conforme PDF/A-3")
    expect(message).toContain("refusé par certaines plateformes")
  })
})

describe("TrueTypeFont", () => {
  it("rewrites advance widths and keeps a valid sfnt checksum", async () => {
    const { family } = await import("./fonts/arimo")
    const bytes = Uint8Array.from(atob(family.styles.regular.program), (c) => c.charCodeAt(0))
    const font = new TrueTypeFont(bytes)
    const a = font.glyphForUnicode(0x61)
    expect(a).toBeDefined()
    expect(font.advances[a ?? 0]).toBe(1139)
    const advances = [...font.advances]
    advances[a ?? 0] = 1300
    const patched = new TrueTypeFont(font.withAdvances(advances))
    expect(patched.advances).toEqual(advances)
    expect(patched.glyphForUnicode(0x20ac)).toBe(font.glyphForUnicode(0x20ac))
    // Whole-file checksum is 0xB1B0AFBA once checkSumAdjustment is in place.
    const out = patched.bytes
    let sum = 0
    for (let i = 0; i < out.length; i += 4) {
      sum =
        (sum +
          (((out[i] ?? 0) << 24) |
            ((out[i + 1] ?? 0) << 16) |
            ((out[i + 2] ?? 0) << 8) |
            (out[i + 3] ?? 0))) >>>
        0
    }
    expect(sum).toBe(0xb1b0afba)
  })

  it("resolves glyph names through the AGL and uniXXXX conventions", () => {
    expect(glyphNameToUnicode("Euro")).toBe(0x20ac)
    expect(glyphNameToUnicode("oe")).toBe(0x153)
    expect(glyphNameToUnicode("uni00E9")).toBe(0xe9)
    expect(glyphNameToUnicode("u1F600")).toBe(0x1f600)
    expect(glyphNameToUnicode("g123")).toBeUndefined()
  })
})
