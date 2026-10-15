/**
 * Two PDFs drawn with pdf-lib and the 14 standard fonts, deliberately NOT embedded (what Dolibarr/TCPDF,
 * FPDF and ReportLab produce with core fonts).
 */
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "@cantoo/pdf-lib"
import {
  type Ctx,
  groupIban,
  groupSiret,
  groupSiren,
  unitLabel,
  vatRows,
} from "./common"

const FIXED_DATE = new Date("2026-10-16T08:00:00Z")
const grey = rgb(0.85, 0.85, 0.85)
const black = rgb(0, 0, 0)

interface Pen {
  doc: PDFDocument
  page: PDFPage
  regular: PDFFont
  bold: PDFFont
  text: (s: string, x: number, y: number, size?: number, bold?: boolean) => void
  right: (s: string, xr: number, y: number, size?: number, bold?: boolean) => void
  wrap: (s: string, maxW: number, size?: number) => string[]
  hline: (x1: number, x2: number, y: number, w?: number) => void
}

async function newPen(
  c: Ctx,
  family: "helvetica" | "times",
): Promise<Pen> {
  const doc = await PDFDocument.create()
  doc.setCreationDate(FIXED_DATE)
  doc.setModificationDate(FIXED_DATE)
  doc.setProducer(family === "helvetica" ? "TCPDF 6.6.5 (fixture imitation)" : "FPDF 1.86 (fixture imitation)")
  doc.setCreator("Facturette blind fixtures")
  doc.setTitle(`Facture ${c.inv.number}`)
  const page = doc.addPage([595.28, 841.89])
  const regular = await doc.embedFont(
    family === "helvetica" ? StandardFonts.Helvetica : StandardFonts.TimesRoman,
  )
  const bold = await doc.embedFont(
    family === "helvetica" ? StandardFonts.HelveticaBold : StandardFonts.TimesRomanBold,
  )
  const pick = (b?: boolean) => (b ? bold : regular)
  return {
    doc,
    page,
    regular,
    bold,
    text: (s, x, y, size = 9, b = false) => page.drawText(s, { x, y, size, font: pick(b) }),
    right: (s, xr, y, size = 9, b = false) =>
      page.drawText(s, { x: xr - pick(b).widthOfTextAtSize(s, size), y, size, font: pick(b) }),
    wrap: (s, maxW, size = 9) => {
      const out: string[] = []
      let cur = ""
      for (const w of s.split(" ")) {
        const next = cur ? `${cur} ${w}` : w
        if (regular.widthOfTextAtSize(next, size) > maxW && cur) {
          out.push(cur)
          cur = w
        } else cur = next
      }
      if (cur) out.push(cur)
      return out
    },
    hline: (x1, x2, y, w = 0.5) =>
      page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: w, color: black }),
  }
}

const save = (doc: PDFDocument) => doc.save({ useObjectStreams: false })

/** Dolibarr-like: seller top-left, reference box top-right, billing address frame, grey table header. */
export async function renderDolibarr(c: Ctx): Promise<Uint8Array> {
  const p = await newPen(c, "helvetica")
  const { inv, t, f } = c
  const L = 40
  const R = 555
  let y = 800
  p.text(inv.seller.name, L, y, 13, true)
  y -= 15
  p.text(inv.seller.address.line1, L, y)
  y -= 11
  p.text(`${inv.seller.address.postalCode} ${inv.seller.address.city}`, L, y)
  y -= 11
  if (inv.seller.phone) {
    p.text(`Tél : ${inv.seller.phone}`, L, y)
    y -= 11
  }
  if (inv.seller.email) p.text(`Email : ${inv.seller.email}`, L, y)

  p.text(`Facture : ${inv.number}`, 330, 800, 12, true)
  p.text(`Date facture : ${f.date(inv.issueDate)}`, 330, 786, 9)
  if (inv.dueDate) p.text(`Date échéance : ${f.date(inv.dueDate)}`, 330, 775, 9)
  p.text("Code client : CU2610-0012", 330, 764, 9)
  if (inv.orderReference) p.text(`Réf. client : ${inv.orderReference}`, 330, 753, 9)

  p.page.drawRectangle({ x: 330, y: 665, width: 225, height: 70, borderWidth: 0.7, borderColor: black })
  p.text("Adresse de facturation", 336, 725, 8)
  p.text(inv.buyer.name, 336, 712, 10, true)
  p.text(inv.buyer.address.line1, 336, 700, 9)
  p.text(`${inv.buyer.address.postalCode} ${inv.buyer.address.city}`, 336, 689, 9)

  y = 630
  p.page.drawRectangle({ x: L, y: y - 4, width: R - L, height: 16, color: grey })
  p.text("Désignation", L + 4, y, 8, true)
  p.right("TVA", 330, y, 8, true)
  p.right("P.U. HT", 392, y, 8, true)
  p.right("Qté", 430, y, 8, true)
  p.text("Unité", 440, y, 8, true)
  p.right("Total HT", R - 4, y, 8, true)
  y -= 18
  inv.lines.forEach((l, i) => {
    p.text(l.name, L + 4, y, 9)
    p.right(`${f.qty(l.vatRate)}%`, 330, y, 9)
    p.right(f.num(l.unitPrice), 392, y, 9)
    p.right(f.qty(l.quantity), 430, y, 9)
    p.text(unitLabel(l.unitCode), 440, y, 9)
    p.right(f.num(t.lineNets[i] ?? 0), R - 4, y, 9)
    y -= 14
  })
  p.hline(L, R, y + 6)
  y -= 14
  const tr = (label: string, value: string, strong = false) => {
    p.page.drawRectangle({ x: 340, y: y - 4, width: 215, height: 15, borderWidth: 0.4, borderColor: black })
    p.text(label, 345, y, 9, strong)
    p.right(value, R - 4, y, 9, strong)
    y -= 15
  }
  tr("Total HT", f.money(t.taxBasisTotal))
  for (const v of vatRows(c)) tr(`Total TVA ${f.qty(v.rate)}%`, f.money(v.tax))
  tr("Total TTC", f.money(t.grandTotal), true)

  y -= 16
  p.text(`Conditions de règlement : ${inv.payment.termsText ?? ""}`, L, y, 9)
  y -= 12
  p.text("Mode de règlement : Virement bancaire", L, y, 9)
  y -= 18
  p.text("Coordonnées bancaires", L, y, 9, true)
  y -= 12
  p.text(`IBAN : ${groupIban(inv.payment.iban ?? "")}`, L, y, 9)
  y -= 11
  p.text(`BIC : ${inv.payment.bic ?? ""}`, L, y, 9)
  y -= 20
  for (const n of [
    inv.legalNotes?.latePaymentPenalty,
    inv.legalNotes?.recoveryFee,
    inv.legalNotes?.earlyPaymentDiscount,
  ]) {
    if (n) {
      p.text(n, L, y, 8)
      y -= 10
    }
  }
  const s = inv.seller
  p.hline(L, R, 52)
  p.text(
    `${s.name} au capital de ${s.shareCapital ?? ""} - ${s.registration ?? ""} - SIRET ${groupSiret(s.siret ?? "")}`,
    L,
    42,
    7,
  )
  p.text(`N° TVA : ${s.vatNumber ?? ""}`, L, 32, 7)
  return save(p.doc)
}

/** FPDF/ReportLab-like: Times, simple rules, Vendeur / Acheteur, Reste à payer. */
export async function renderTimes(c: Ctx): Promise<Uint8Array> {
  const p = await newPen(c, "times")
  const { inv, t, f } = c
  const L = 50
  const R = 545
  let y = 790
  p.text(`FACTURE N° ${inv.number}`, L, y, 20, true)
  y -= 20
  p.text(`Émise le ${f.date(inv.issueDate)}`, L, y, 11)
  if (inv.dueDate) p.text(`À régler avant le ${f.date(inv.dueDate)}`, 300, y, 11, true)
  y -= 34
  p.text("Vendeur", L, y, 10, true)
  p.text("Acheteur", 310, y, 10, true)
  y -= 14
  const s = inv.seller
  const sl = [
    s.name,
    s.address.line1,
    `${s.address.postalCode} ${s.address.city}`,
    `SIREN ${groupSiren(s.siren ?? "")} - SIRET ${groupSiret(s.siret ?? "")}`,
    `TVA intracommunautaire : ${s.vatNumber ?? ""}`,
    `${s.legalForm ?? ""} au capital de ${s.shareCapital ?? ""} - ${s.registration ?? ""}`,
    `${s.email ?? ""} - ${s.phone ?? ""}`,
  ]
  sl.forEach((l, i) => p.text(l, L, y - i * 12, 10, i === 0))
  const b = inv.buyer
  const bl = [
    b.name,
    b.address.line1,
    `${b.address.postalCode} ${b.address.city}`,
    `SIREN ${groupSiren(b.siren ?? "")}`,
    `TVA : ${b.vatNumber ?? ""}`,
  ]
  bl.forEach((l, i) => p.text(l, 310, y - i * 12, 10, i === 0))
  y -= sl.length * 12 + 26

  p.hline(L, R, y + 12, 1)
  p.text("Description", L, y, 10, true)
  p.right("Quantité", 330, y, 10, true)
  p.right("Prix unitaire", 430, y, 10, true)
  p.right("Montant", R, y, 10, true)
  y -= 6
  p.hline(L, R, y, 1)
  y -= 16
  inv.lines.forEach((l, i) => {
    p.text(l.name, L, y, 10)
    p.right(`${f.qty2(l.quantity)} ${unitLabel(l.unitCode, true)}`, 330, y, 10)
    p.right(f.money(l.unitPrice), 430, y, 10)
    p.right(f.money(t.lineNets[i] ?? 0), R, y, 10)
    y -= 16
  })
  p.hline(L, R, y + 8, 0.5)
  y -= 12
  const tr = (label: string, value: string, strong = false) => {
    p.text(label, 330, y, 10.5, strong)
    p.right(value, R, y, 10.5, strong)
    y -= 15
  }
  tr("Sous-total", f.money(t.taxBasisTotal))
  for (const v of vatRows(c)) tr(`TVA ${f.qty(v.rate)} %`, f.money(v.tax))
  tr("Total TTC", f.money(t.grandTotal), true)
  if (t.prepaid) tr("Acompte déjà réglé", f.money(-t.prepaid))
  tr("Reste à payer", f.money(t.dueAmount), true)
  y -= 18
  p.text(`Règlement : ${inv.payment.termsText ?? ""}`, L, y, 10)
  y -= 14
  p.text(`RIB : IBAN ${groupIban(inv.payment.iban ?? "")} - BIC ${inv.payment.bic ?? ""}`, L, y, 10)
  y -= 24
  for (const n of [
    inv.legalNotes?.latePaymentPenalty,
    inv.legalNotes?.recoveryFee,
    inv.legalNotes?.earlyPaymentDiscount,
  ]) {
    if (n) {
      p.text(n, L, y, 9)
      y -= 11
    }
  }
  return save(p.doc)
}
