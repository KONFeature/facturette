/** Deliberately poor PDF: plain pdf-lib, standard Helvetica (not embedded), no metadata care. */
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib"
import {
  deliveryLines,
  legalLines,
  makeContent,
  metaRows,
  partyLines,
  paymentLines,
  totalRows,
  unitLabel,
} from "./content"
import type { FixtureDef } from "./data"

const FIXED_DATE = new Date("2026-10-15T08:00:00Z")

export async function renderPdfLib(def: FixtureDef): Promise<Uint8Array> {
  const c = makeContent(def, {}, false)
  const doc = await PDFDocument.create()
  doc.setCreationDate(FIXED_DATE)
  doc.setModificationDate(FIXED_DATE)
  doc.setProducer("pdf-lib (fixture)")
  doc.setCreator("pdf-lib (fixture)")
  doc.setTitle(`${c.labels.title} ${c.inv.number}`)
  const page = doc.addPage([595.28, 841.89])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const left = 40
  const right = 555
  let y = 800

  const text = (s: string, x: number, size = 10, isBold = false) =>
    page.drawText(s, { x, y, size, font: isBold ? bold : font })
  const textRight = (s: string, xr: number, size = 10, isBold = false) =>
    page.drawText(s, {
      x: xr - (isBold ? bold : font).widthOfTextAtSize(s, size),
      y,
      size,
      font: isBold ? bold : font,
    })
  const block = (lines: string[], x: number, startY: number, size = 10) => {
    let yy = startY
    lines.forEach((l, i) => {
      page.drawText(l, { x, y: yy, size: i === 0 ? size + 1 : size, font: i === 0 ? bold : font })
      yy -= 13
    })
    return yy
  }

  text(c.labels.title.toUpperCase(), left, 22, true)
  y -= 30
  const afterSeller = block(partyLines(c, "seller"), left, y)
  let metaY = y
  for (const [k, v] of metaRows(c)) {
    page.drawText(k, { x: 360, y: metaY, size: 10, font })
    page.drawText(v, { x: 450, y: metaY, size: 10, font: bold })
    metaY -= 13
  }
  y = Math.min(afterSeller, metaY) - 16
  page.drawText(c.labels.buyer, { x: left, y, size: 9, font: bold })
  y -= 14
  let buyerEnd = block(partyLines(c, "buyer"), left, y)
  const del = deliveryLines(c)
  if (del.length) buyerEnd = Math.min(buyerEnd, block(del, 360, y))
  y = buyerEnd - 18

  text("Désignation", left, 9, true)
  text("Qté", 300, 9, true)
  textRight("PU HT", 420, 9, true)
  textRight("TVA", 470, 9, true)
  textRight("Montant HT", right, 9, true)
  y -= 6
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.7 })
  y -= 14
  c.inv.lines.forEach((l, i) => {
    text(l.name, left)
    text(`${c.qty(l.quantity)} ${unitLabel(l.unitCode)}`, 300)
    textRight(c.money(l.unitPrice), 420)
    textRight(l.vatCategory === "S" ? `${c.qty(l.vatRate)} %` : "-", 470)
    textRight(c.money(c.totals.lineNets[i] ?? 0), right)
    y -= 15
  })
  y -= 10
  for (const r of totalRows(c, false)) {
    text(r.label, 360, 10, r.strong)
    textRight(r.value, right, 10, r.strong)
    y -= 15
  }
  y -= 12
  const pay = paymentLines(c)
  for (const l of [...pay.terms, ...pay.bank, ...legalLines(c)]) {
    text(l, left, 9)
    y -= 12
  }
  return doc.save({ useObjectStreams: false })
}
