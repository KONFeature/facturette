/**
 * Three PDFs drawn with pdf-lib and the standard fonts, deliberately NOT embedded (as produced by
 * core-font generators). Only WinAnsi characters: no narrow no-break space, no true minus sign.
 */
import {
  degrees,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "@cantoo/pdf-lib"
import {
  type Ctx,
  groupIban,
  groupSiren,
  groupSiret,
  legalNoteList,
  unitText,
  vatRows,
} from "./common"

const FIXED_DATE = new Date("2026-10-16T08:00:00Z")
const black = rgb(0, 0, 0)

interface Pen {
  doc: PDFDocument
  page: PDFPage
  text: (s: string, x: number, y: number, size?: number, bold?: boolean) => void
  right: (s: string, xr: number, y: number, size?: number, bold?: boolean) => void
  hline: (x1: number, x2: number, y: number, w?: number) => void
  width: (s: string, size: number, bold?: boolean) => number
}

async function newPen(c: Ctx, family: "helvetica" | "times", producer: string): Promise<Pen> {
  const doc = await PDFDocument.create()
  doc.setCreationDate(FIXED_DATE)
  doc.setModificationDate(FIXED_DATE)
  doc.setProducer(producer)
  doc.setCreator("Facturette blind2 fixtures")
  doc.setTitle(`${c.inv.typeCode === "381" ? "Avoir" : "Facture"} ${c.inv.number}`)
  const page = doc.addPage([595.28, 841.89])
  const regular: PDFFont = await doc.embedFont(
    family === "helvetica" ? StandardFonts.Helvetica : StandardFonts.TimesRoman,
  )
  const bold: PDFFont = await doc.embedFont(
    family === "helvetica" ? StandardFonts.HelveticaBold : StandardFonts.TimesRomanBold,
  )
  const pick = (b?: boolean) => (b ? bold : regular)
  return {
    doc,
    page,
    text: (s, x, y, size = 9, b = false) => page.drawText(s, { x, y, size, font: pick(b) }),
    right: (s, xr, y, size = 9, b = false) =>
      page.drawText(s, { x: xr - pick(b).widthOfTextAtSize(s, size), y, size, font: pick(b) }),
    hline: (x1, x2, y, w = 0.5) =>
      page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: w, color: black }),
    width: (s, size, b = false) => pick(b).widthOfTextAtSize(s, size),
  }
}

const save = (doc: PDFDocument) => doc.save({ useObjectStreams: false })

const idLine = (c: Ctx): string => {
  const s = c.inv.seller
  return [
    s.siren ? `SIREN ${groupSiren(s.siren)}` : "",
    s.siret ? `SIRET ${groupSiret(s.siret)}` : "",
    s.vatNumber ? `TVA ${s.vatNumber}` : "",
  ]
    .filter(Boolean)
    .join(" - ")
}

const legalLine = (c: Ctx): string => {
  const s = c.inv.seller
  return [
    s.legalForm ?? "",
    s.shareCapital ? `au capital de ${s.shareCapital}` : "",
    s.registration ?? "",
  ]
    .filter(Boolean)
    .join(", ")
}

/** Note d'honoraires: seller block flush right, three-column date header. */
export async function renderNoteHonoraires(c: Ctx): Promise<Uint8Array> {
  const p = await newPen(c, "helvetica", "ReportLab PDF Library (fixture imitation)")
  const { inv, t, f } = c
  const s = inv.seller
  const R = 545
  const L = 50
  let y = 790
  const sl = [
    s.name,
    s.address.line1,
    `${s.address.postalCode} ${s.address.city}`,
    `Tél. ${s.phone ?? ""}`,
    s.email ?? "",
    legalLine(c),
    idLine(c),
  ]
  for (const [i, l] of sl.entries()) p.right(l, R, y - i * 12, i === 0 ? 11 : 8.5, i === 0)
  p.text(`NOTE D'HONORAIRES N° ${inv.number}`, L, 700, 16, true)
  p.hline(L, R, 690, 1.5)
  const cols = [L, 230, 400]
  p.text("Date de la note", cols[0] ?? L, 672, 8, true)
  p.text("Prestations réalisées le", cols[1] ?? L, 672, 8, true)
  p.text("Échéance", cols[2] ?? L, 672, 8, true)
  p.text(f.date(inv.issueDate), cols[0] ?? L, 659, 10)
  p.text(f.date(inv.deliveryDate ?? inv.issueDate), cols[1] ?? L, 659, 10)
  p.text(f.date(inv.dueDate ?? inv.issueDate), cols[2] ?? L, 659, 10)
  const b = inv.buyer
  p.text("Adressée à", L, 625, 8, true)
  const bl = [
    b.name,
    b.address.line1,
    `${b.address.postalCode} ${b.address.city}`,
    `SIREN ${groupSiren(b.siren ?? "")} - SIRET ${groupSiret(b.siret ?? "")}`,
    `N° TVA ${b.vatNumber ?? ""}`,
    `Votre commande : ${inv.orderReference ?? ""}`,
  ]
  for (const [i, l] of bl.entries()) p.text(l, L, 611 - i * 12, 10, i === 0)
  y = 520
  p.hline(L, R, y + 14, 0.8)
  p.text("Mission", L, y, 9, true)
  p.right("Quantité", 360, y, 9, true)
  p.right("Tarif", 450, y, 9, true)
  p.right("Montant HT", R, y, 9, true)
  p.hline(L, R, y - 6, 0.8)
  y -= 22
  for (const [i, l] of inv.lines.entries()) {
    p.text(l.name, L, y, 10)
    p.right(`${f.qty(l.quantity)} ${unitText(l.unitCode)}`, 360, y, 10)
    p.right(f.num(l.unitPrice), 450, y, 10)
    p.right(f.num(t.lineNets[i] ?? 0), R, y, 10)
    y -= 17
  }
  p.hline(L, R, y + 8, 0.5)
  y -= 14
  const tr = (label: string, value: string, strong = false) => {
    p.text(label, 340, y, 10, strong)
    p.right(value, R, y, 10, strong)
    y -= 15
  }
  tr("Total HT", f.money(t.taxBasisTotal))
  for (const v of vatRows(c)) tr(`TVA ${f.pct(v.rate)}`, f.money(v.tax))
  tr("Total TTC", f.money(t.grandTotal), true)
  y -= 14
  p.text(`Conditions : ${inv.payment.termsText ?? ""}`, L, y, 9)
  y -= 13
  p.text(
    `Virement sur IBAN ${groupIban(inv.payment.iban ?? "")} - BIC ${inv.payment.bic ?? ""}`,
    L,
    y,
    9,
  )
  y -= 26
  for (const n of legalNoteList(inv)) {
    p.text(n, L, y, 7.5)
    y -= 10
  }
  return save(p.doc)
}

/** Avoir in Times: title and reference to the original invoice, amounts printed negative. */
export async function renderAvoir(c: Ctx): Promise<Uint8Array> {
  const p = await newPen(c, "times", "FPDF 1.86 (fixture imitation)")
  const { inv, t, f } = c
  const s = inv.seller
  const R = 545
  const L = 50
  const neg = (n: number) => f.money(-n)
  p.right(s.name, R, 800, 14, true)
  const sl = [
    s.address.line1,
    `${s.address.postalCode} ${s.address.city}`,
    `${s.phone ?? ""} - ${s.email ?? ""}`,
    legalLine(c),
    idLine(c),
  ]
  for (const [i, l] of sl.entries()) p.right(l, R, 785 - i * 12, 9.5)
  p.text(`AVOIR N° ${inv.number}`, L, 700, 22, true)
  p.text(`Date : ${f.date(inv.issueDate)}`, L, 676, 11)
  p.text(
    `Avoir sur la facture n° ${inv.precedingInvoice?.number ?? ""} du ${f.date(inv.precedingInvoice?.issueDate ?? inv.issueDate)}`,
    L,
    660,
    11,
    true,
  )
  p.text(`Référence du retour : ${inv.orderReference ?? ""}`, L, 644, 11)
  const b = inv.buyer
  p.text("Client", 340, 700, 10, true)
  const bl = [
    b.name,
    b.address.line1,
    `${b.address.postalCode} ${b.address.city}`,
    `SIREN ${groupSiren(b.siren ?? "")}`,
    `N° TVA ${b.vatNumber ?? ""}`,
  ]
  for (const [i, l] of bl.entries()) p.text(l, 340, 686 - i * 12, 10.5, i === 0)
  let y = 570
  p.hline(L, R, y + 14, 1)
  p.text("Article", L, y, 10, true)
  p.right("Qté", 330, y, 10, true)
  p.right("Prix unit. HT", 410, y, 10, true)
  p.right("TVA", 455, y, 10, true)
  p.right("Total HT", R, y, 10, true)
  p.hline(L, R, y - 6, 1)
  y -= 22
  for (const [i, l] of inv.lines.entries()) {
    p.text(l.name, L, y, 10)
    p.right(f.qty(l.quantity), 330, y, 10)
    p.right(f.num(l.unitPrice), 410, y, 10)
    p.right(f.pct(l.vatRate), 455, y, 10)
    p.right(neg(t.lineNets[i] ?? 0), R, y, 10)
    y -= 16
  }
  p.hline(L, R, y + 8, 0.5)
  y -= 14
  const tr = (label: string, value: string, strong = false) => {
    p.text(label, 350, y, 11, strong)
    p.right(value, R, y, 11, strong)
    y -= 16
  }
  tr("Total HT", neg(t.taxBasisTotal))
  for (const v of vatRows(c)) tr(`TVA ${f.pct(v.rate)}`, neg(v.tax))
  tr("Total TTC", neg(t.grandTotal), true)
  y -= 16
  p.text(inv.payment.termsText ?? "", L, y, 10.5)
  y -= 30
  for (const n of legalNoteList(inv)) {
    p.text(n, L, y, 9)
    y -= 11
  }
  return save(p.doc)
}

/** Garage bill with a diagonal grey ACQUITTÉE watermark. */
export async function renderGarage(c: Ctx): Promise<Uint8Array> {
  const p = await newPen(c, "helvetica", "DMS print driver (fixture imitation)")
  const { inv, t, f, def } = c
  const s = inv.seller
  const R = 550
  const L = 45
  p.page.drawText(def.extra.watermark ?? "", {
    x: 110,
    y: 280,
    size: 96,
    font: await p.doc.embedFont(StandardFonts.HelveticaBold),
    color: rgb(0.88, 0.88, 0.88),
    rotate: degrees(35),
  })
  p.page.drawRectangle({ x: L, y: 765, width: 60, height: 45, borderWidth: 1, borderColor: black })
  p.text("LOGO", L + 14, 783, 9)
  const sl = [
    s.name,
    `${s.address.line1}, ${s.address.postalCode} ${s.address.city}`,
    `Tél. ${s.phone ?? ""} - ${s.email ?? ""}`,
    idLine(c),
    legalLine(c),
  ]
  for (const [i, l] of sl.entries()) p.text(l, L + 72, 800 - i * 11.5, i === 0 ? 12 : 8.5, i === 0)
  p.text(`FACTURE N° ${inv.number}`, L, 715, 15, true)
  p.text(`du ${f.date(inv.issueDate)}`, 300, 715, 11)
  p.text(`Ordre de réparation : ${inv.orderReference ?? ""}`, L, 697, 9.5)
  p.text(inv.notes ?? "", L, 684, 9.5)
  const b = inv.buyer
  p.page.drawRectangle({
    x: 330,
    y: 610,
    width: 220,
    height: 62,
    borderWidth: 0.8,
    borderColor: black,
  })
  p.text(b.name, 338, 656, 10.5, true)
  p.text(b.address.line1, 338, 642, 10)
  p.text(`${b.address.postalCode} ${b.address.city}`, 338, 629, 10)
  let y = 570
  p.page.drawRectangle({ x: L, y: y - 5, width: R - L, height: 17, color: rgb(0.82, 0.86, 0.9) })
  p.text("Libellé", L + 4, y, 8.5, true)
  p.right("Qté", 340, y, 8.5, true)
  p.right("PU HT", 430, y, 8.5, true)
  p.right("TVA", 475, y, 8.5, true)
  p.right("Montant HT", R - 4, y, 8.5, true)
  y -= 22
  for (const [i, l] of inv.lines.entries()) {
    p.text(l.name, L + 4, y, 9.5)
    p.right(`${f.qty(l.quantity)} ${unitText(l.unitCode)}`, 340, y, 9.5)
    p.right(f.num(l.unitPrice), 430, y, 9.5)
    p.right(f.pct(l.vatRate), 475, y, 9.5)
    p.right(f.num(t.lineNets[i] ?? 0), R - 4, y, 9.5)
    y -= 16
  }
  p.hline(L, R, y + 8, 0.6)
  y -= 16
  const tr = (label: string, value: string, strong = false) => {
    p.text(label, 360, y, 10.5, strong)
    p.right(value, R - 4, y, 10.5, strong)
    y -= 15
  }
  tr("Total HT", f.money(t.taxBasisTotal))
  for (const v of vatRows(c)) tr(`TVA ${f.pct(v.rate)}`, f.money(v.tax))
  tr("Total TTC", f.money(t.grandTotal), true)
  y -= 14
  p.text(inv.payment.termsText ?? "", L, y, 10, true)
  return save(p.doc)
}
