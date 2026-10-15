// Dev-time generator of the non-embedded-font test inputs built with pdf-lib (not bundled, not
// run by the tests):
//
//   bun src/lib/facturx/assets/test-inputs/make-font-inputs.mjs
//
// Produces, next to this file:
//   pdflib-standard12.pdf     pdf-lib StandardFonts, all 12 text variants (never embedded),
//                             accented French text and right-aligned amounts
//   descriptor-fonts.pdf      crafted Windows-style fonts with a FontDescriptor but no font
//                             program: ArialMT, Arial,Bold, ABCDEF+TimesNewRomanPSMT,
//                             CourierNewPS-BoldItalicMT (all with /Widths), an unknown
//                             Verdana-Italic with its own /Widths, a standard Helvetica with a
//                             /Differences encoding, a Courier font used only inside a form
//                             XObject and a Times-Bold font used only by an annotation appearance
//   unrepairable-fonts.pdf    Helvetica (repairable) next to Symbol, ZapfDingbats and a
//                             non-embedded Type0 (CIDFontType2) ArialMT: those three stay
//                             non-embedded
// The ReportLab and fpdf2 inputs come from make-font-inputs.py.
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
  rgb,
  StandardFonts,
} from "@cantoo/pdf-lib"

const dir = import.meta.dirname
const N = (n) => PDFName.of(n)
const FIXED_DATE = new Date(Date.UTC(2026, 9, 15, 9, 0, 0))
const FRENCH = "àâäçéèêëîïôöùûüÿœæ ÀÉÈÇŒ € « » “ ” ‘ ’ – — … ‰ ™"

async function create() {
  const doc = await PDFDocument.create()
  doc.setCreationDate(FIXED_DATE)
  doc.setModificationDate(FIXED_DATE)
  doc.setProducer("make-font-inputs.mjs")
  return doc
}

const save = (doc) => doc.save({ useObjectStreams: false })

function rightText(page, font, text, rightX, y, size) {
  page.drawText(text, { x: rightX - font.widthOfTextAtSize(text, size), y, size, font })
}

function invoiceTable(page, font, bold, top) {
  const lines = [
    ["Développement d’une application « Facturation »", "3", "500,00 €", "1 500,00 €"],
    ["Hébergement & maintenance — œuvre collective", "12", "45,90 €", "550,80 €"],
    ["Formation à l’outil, déplacement à Besançon", "1", "1 250,00 €", "1 250,00 €"],
  ]
  let y = top
  page.drawText("Désignation", { x: 50, y, size: 10, font: bold })
  rightText(page, bold, "Qté", 390, y, 10)
  rightText(page, bold, "PU HT", 470, y, 10)
  rightText(page, bold, "Total HT", 545, y, 10)
  for (const [label, qty, unit, total] of lines) {
    y -= 16
    page.drawText(label, { x: 50, y, size: 9, font })
    rightText(page, font, qty, 390, y, 9)
    rightText(page, font, unit, 470, y, 9)
    rightText(page, font, total, 545, y, 9)
  }
  return y
}

async function standard12() {
  const doc = await create()
  const page = doc.addPage([595.28, 841.89])
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)
  page.drawText("Facture FA-2026-0044", {
    x: 50,
    y: 790,
    size: 18,
    font: helvBold,
    color: rgb(0.1, 0.3, 0.5),
  })
  let y = invoiceTable(page, helv, helvBold, 750)
  y -= 30
  const names = [
    "Helvetica",
    "HelveticaBold",
    "HelveticaOblique",
    "HelveticaBoldOblique",
    "TimesRoman",
    "TimesRomanBold",
    "TimesRomanItalic",
    "TimesRomanBoldItalic",
    "Courier",
    "CourierBold",
    "CourierOblique",
    "CourierBoldOblique",
  ]
  for (const name of names) {
    const font = await doc.embedFont(StandardFonts[name])
    page.drawText(`${name} : ${FRENCH}`, { x: 50, y, size: 10, font })
    rightText(page, font, "1 234,56 €", 545, y, 10)
    y -= 18
  }
  writeFileSync(resolve(dir, "pdflib-standard12.pdf"), await save(doc))
}

/** Widths of codes 32..255 of a pdf-lib standard font, read through windows-1252. */
function winAnsiWidths(font, scale = 1) {
  const decoder = new TextDecoder("windows-1252")
  const widths = []
  for (let code = 32; code <= 255; code++) {
    const ch = decoder.decode(new Uint8Array([code]))
    let w = 0
    try {
      w = Math.round(font.widthOfTextAtSize(ch, 1000) * scale)
    } catch {
      w = 0
    }
    widths.push(w)
  }
  return widths
}

function fontDicts(doc) {
  const out = new Map()
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(N("Type")) === N("Font")) {
      out.set(obj.get(N("BaseFont"))?.decodeText(), { ref, dict: obj })
    }
  }
  return out
}

async function descriptorFonts() {
  const doc = await create()
  const page = doc.addPage([595.28, 841.89])
  const variants = [
    // pdf-lib font, new BaseFont, Subtype, descriptor extras, width scale
    ["Helvetica", "ArialMT", "TrueType", { Flags: 32 }, 1],
    ["HelveticaBold", "Arial,Bold", "TrueType", { Flags: 32 + 0x40000, FontWeight: 700 }, 1],
    ["TimesRoman", "ABCDEF+TimesNewRomanPSMT", "TrueType", { Flags: 34 }, 1],
    [
      "CourierBoldOblique",
      "CourierNewPS-BoldItalicMT",
      "TrueType",
      { Flags: 32 + 64 + 1, ItalicAngle: -12, FontWeight: 700 },
      1,
    ],
    ["HelveticaOblique", "Verdana-Italic", "Type1", { Flags: 96, ItalicAngle: -10 }, 1.1],
  ]
  const fonts = []
  let y = 790
  for (const [std, , , , scale] of variants) {
    const font = await doc.embedFont(StandardFonts[std])
    fonts.push(font)
    const text = `${std} : Facture FA-2026-0045 – ${FRENCH}`
    page.drawText(text, { x: 40, y, size: 9, font })
    y -= 16
    page.drawText("Montant", { x: 40, y, size: 10, font })
    const amount = "12 345,67 €"
    page.drawText(amount, {
      x: 545 - font.widthOfTextAtSize(amount, 10) * scale,
      y,
      size: 10,
      font,
    })
    y -= 22
  }
  invoiceTable(page, fonts[0], fonts[1], 560)
  const first = await PDFDocument.load(await save(doc), { updateMetadata: false })
  const ctx = first.context
  const dicts = fontDicts(first)
  variants.forEach(([std, baseFont, subtype, extras, scale], i) => {
    const entry = dicts.get(fonts[i].name)
    if (!entry) throw new Error(`font ${std} not found`)
    const descriptor = ctx.obj({
      Type: "FontDescriptor",
      FontName: baseFont,
      Flags: 32,
      FontBBox: [-200, -220, 1100, 950],
      ItalicAngle: 0,
      Ascent: 905,
      Descent: -212,
      CapHeight: 716,
      StemV: 80,
      ...extras,
    })
    entry.dict.set(N("BaseFont"), N(baseFont))
    entry.dict.set(N("Subtype"), N(subtype))
    entry.dict.set(N("FirstChar"), PDFNumber.of(32))
    entry.dict.set(N("LastChar"), PDFNumber.of(255))
    entry.dict.set(N("Widths"), ctx.obj(winAnsiWidths(fonts[i], scale)))
    entry.dict.set(N("FontDescriptor"), ctx.register(descriptor))
  })

  const p = first.getPage(0)
  const resources = p.node.Resources()
  const fontRes = resources.lookup(N("Font"), PDFDict)
  // Standard Helvetica with a /Differences encoding (codes 1-4).
  const diffFont = ctx.register(
    ctx.obj({
      Type: "Font",
      Subtype: "Type1",
      BaseFont: "Helvetica",
      Encoding: {
        Type: "Encoding",
        BaseEncoding: "WinAnsiEncoding",
        Differences: [1, "Euro", "oe", "Ydieresis", "quotedblleft"],
      },
    }),
  )
  fontRes.set(N("FDiff"), diffFont)
  // Courier used only inside a form XObject.
  const courier = ctx.register(
    ctx.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Courier", Encoding: "WinAnsiEncoding" }),
  )
  const form = ctx.register(
    ctx.stream("BT /FC 10 Tf 0 4 Td (Bloc XObject : 42,00 EUR) Tj ET", {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, 300, 20],
      Resources: { Font: { FC: courier } },
    }),
  )
  const xobjects = resources.lookupMaybe(N("XObject"), PDFDict) ?? ctx.obj({})
  xobjects.set(N("XForm"), form)
  resources.set(N("XObject"), xobjects)
  const extra = ctx.register(
    ctx.stream("BT /FDiff 14 Tf 50 100 Td <01020304> Tj ET\nq 1 0 0 1 50 130 cm /XForm Do Q"),
  )
  p.node.addContentStream(extra)
  // Times-Bold used only by a FreeText annotation appearance.
  const timesBold = ctx.register(
    ctx.obj({
      Type: "Font",
      Subtype: "Type1",
      BaseFont: "Times-Bold",
      Encoding: "WinAnsiEncoding",
    }),
  )
  const ap = ctx.register(
    ctx.stream("BT /FT 11 Tf 2 6 Td (Annotation : r\\351gl\\351e) Tj ET", {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, 200, 24],
      Resources: { Font: { FT: timesBold } },
    }),
  )
  const annot = ctx.register(
    ctx.obj({
      Type: "Annot",
      Subtype: "FreeText",
      Rect: [340, 60, 540, 84],
      F: 4,
      Contents: PDFHexString.fromText("Annotation : réglée"),
      DA: PDFString.of("/FT 11 Tf 0 g"),
      AP: { N: ap },
    }),
  )
  p.node.set(N("Annots"), ctx.obj([annot]))
  writeFileSync(resolve(dir, "descriptor-fonts.pdf"), await save(first))
}

async function unrepairable() {
  const doc = await create()
  const page = doc.addPage([595.28, 841.89])
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const symbol = await doc.embedFont(StandardFonts.Symbol)
  const dingbats = await doc.embedFont(StandardFonts.ZapfDingbats)
  page.drawText("Facture FA-2026-0046 – total 99,00 €", { x: 50, y: 790, size: 14, font: helv })
  page.drawText("αβγ ∑ ∞ ≤ ≥", { x: 50, y: 760, size: 14, font: symbol })
  page.drawText("✓ ✔ ✗", { x: 50, y: 730, size: 14, font: dingbats })
  const first = await PDFDocument.load(await save(doc), { updateMetadata: false })
  const ctx = first.context
  const descendant = ctx.obj({
    Type: "Font",
    Subtype: "CIDFontType2",
    BaseFont: "ArialMT",
    CIDSystemInfo: {
      Registry: PDFString.of("Adobe"),
      Ordering: PDFString.of("Identity"),
      Supplement: 0,
    },
    DW: 1000,
    W: [36, [667]],
    CIDToGIDMap: "Identity",
    FontDescriptor: ctx.register(
      ctx.obj({
        Type: "FontDescriptor",
        FontName: "ArialMT",
        Flags: 32,
        FontBBox: [-665, -325, 2000, 1040],
        ItalicAngle: 0,
        Ascent: 905,
        Descent: -212,
        CapHeight: 716,
        StemV: 80,
      }),
    ),
  })
  const type0 = ctx.register(
    ctx.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: "ArialMT",
      Encoding: "Identity-H",
      DescendantFonts: [ctx.register(descendant)],
    }),
  )
  const p = first.getPage(0)
  p.node.Resources().lookup(N("Font"), PDFDict).set(N("FT0"), type0)
  p.node.addContentStream(ctx.register(ctx.stream("BT /FT0 14 Tf 50 700 Td <0024> Tj ET")))
  writeFileSync(resolve(dir, "unrepairable-fonts.pdf"), await save(first))
}

await standard12()
await descriptorFonts()
await unrepairable()
