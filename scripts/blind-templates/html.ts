/** HTML templates (rendered to PDF by Chromium). Each imitates a family of real French invoice layouts. */
import {
  type Ctx,
  esc,
  groupIban,
  groupSiren,
  groupSiret,
  lineGross,
  type TemplateId,
  unitLabel,
  vatRows,
} from "./common"

const shell = (title: string, css: string, body: string): string => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: A4; margin: 0 }
* { box-sizing: border-box }
body { margin: 0; padding: 0; }
table { border-collapse: collapse }
.r { text-align: right }
.c { text-align: center }
.b { font-weight: bold }
${css}
</style></head><body>${body}</body></html>`

const addrLines = (a: { line1: string; line2?: string; postalCode: string; city: string }) =>
  [a.line1, ...(a.line2 ? [a.line2] : []), `${a.postalCode} ${a.city}`].map(esc).join("<br>")

const legalNotes = (c: Ctx): string[] =>
  [
    c.inv.legalNotes?.latePaymentPenalty,
    c.inv.legalNotes?.recoveryFee,
    c.inv.legalNotes?.earlyPaymentDiscount,
  ].filter((s): s is string => Boolean(s))

// --- B03 Excel ---------------------------------------------------------------------------------
function excel(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${esc(l.name)}</td><td class="c">${unitLabel(l.unitCode)}</td><td class="r">${f.qty2(l.quantity)}</td><td class="r">${f.money(l.unitPrice)}</td><td class="c">${f.qty(l.vatRate)} %</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td><td class="r">${f.money(lineGross(c, i))}</td></tr>`,
    )
    .join("")
  const vatTotals = vatRows(c)
    .map(
      (v) =>
        `<tr><td colspan="5" class="r">TVA ${f.qty(v.rate)} %</td><td class="r" colspan="2">${f.money(v.tax)}</td></tr>`,
    )
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:Calibri,Carlito,Arial,sans-serif;font-size:10.5pt;padding:14mm}
h1{font-size:26pt;margin:0;color:#1f3864;letter-spacing:2px}
td,th{border:1px solid #444;padding:4px 6px}
th{background:#d9e2f3}
.nb td{border:none}
.box{border:1px solid #444;padding:6px;height:100%}`,
    `<table class="nb" style="width:100%"><tr><td style="width:55%"><h1>FACTURE</h1></td><td class="r"><b>${esc(s.name)}</b><br>${esc(s.address.line1)}<br>${esc(`${s.address.postalCode} ${s.address.city}`)}<br>Tél : ${esc(s.phone ?? "")}<br>${esc(s.email ?? "")}</td></tr></table>
<table style="width:100%;margin-top:10px"><tr><th>N° de facture</th><th>Date</th><th>Date de livraison</th><th>Échéance</th></tr>
<tr class="c"><td>${esc(inv.number)}</td><td>${f.date(inv.issueDate)}</td><td>${f.date(inv.deliveryDate ?? inv.issueDate)}</td><td>${f.date(inv.dueDate ?? inv.issueDate)}</td></tr></table>
<table class="nb" style="width:100%;margin-top:10px"><tr><td style="width:50%"><div class="box"><b>Client</b><br>${esc(inv.buyer.name)}<br>${addrLines(inv.buyer.address)}</div></td><td><div class="box"><b>Émetteur</b><br>${esc(s.legalForm ?? "")} au capital de ${esc(s.shareCapital ?? "")}<br>${esc(s.registration ?? "")}<br>SIRET : ${groupSiret(s.siret ?? "")}<br>TVA : ${esc(s.vatNumber ?? "")}</div></td></tr></table>
<p style="margin:12px 0 6px"><b>Objet :</b> ${esc(c.def.extra.subject ?? "")}</p>
<table style="width:100%"><tr><th>Désignation</th><th>Unité</th><th>Qté</th><th>PU HT</th><th>TVA</th><th>Total HT</th><th>Total TTC</th></tr>${rows}
<tr><td colspan="5" class="r b">TOTAL HT</td><td class="r" colspan="2">${f.money(t.taxBasisTotal)}</td></tr>${vatTotals}
<tr><td colspan="5" class="r b">TOTAL TTC</td><td class="r b" colspan="2">${f.money(t.grandTotal)}</td></tr></table>
<p style="margin-top:14px"><b>Conditions de paiement :</b> ${esc(inv.payment.termsText ?? "")}<br>Virement : IBAN ${groupIban(inv.payment.iban ?? "")} - BIC ${esc(inv.payment.bic ?? "")}</p>
<p style="font-size:8.5pt">${legalNotes(c).map(esc).join("<br>")}</p>`,
  )
}

// --- B04 Word letter ----------------------------------------------------------------------------
function letter(c: Ctx): string {
  const { inv, t, f, def } = c
  const s = inv.seller
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)} ${unitLabel(l.unitCode, true)}${l.quantity > 1 && l.unitCode !== "LS" ? "s" : ""}</td><td class="r">${f.money(l.unitPrice)}</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td></tr>`,
    )
    .join("")
  const vat = vatRows(c)
    .map(
      (v) =>
        `<tr><td colspan="3" class="r">TVA ${f.qty(v.rate)} %</td><td class="r">${f.money(v.tax)}</td></tr>`,
    )
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:Georgia,"Times New Roman",serif;font-size:11.5pt;padding:22mm 22mm 18mm 25mm;line-height:1.35}
.lh{border-bottom:1.5px solid #333;padding-bottom:6px;margin-bottom:22px}
.lh .n{font-size:16pt;font-weight:bold;letter-spacing:1px}
.lh small{font-size:8.5pt;color:#333}
td,th{padding:3px 6px;border-bottom:1px solid #999}
td:not(:first-child),th:not(:first-child){white-space:nowrap}`,
    `<div class="lh"><div class="n">${esc(s.name)}</div><small>${esc(s.address.line1)}, ${esc(`${s.address.postalCode} ${s.address.city}`)} - Tél. ${esc(s.phone ?? "")} - ${esc(s.email ?? "")}<br>${esc(s.legalForm ?? "")} au capital de ${esc(s.shareCapital ?? "")} - ${esc(s.registration ?? "")} - SIRET ${groupSiret(s.siret ?? "")} - N° TVA ${esc(s.vatNumber ?? "")}</small></div>
<div style="display:flex;justify-content:space-between"><div></div><div style="width:55%"><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}<br>SIREN ${groupSiren(inv.buyer.siren ?? "")}<br>N° TVA ${esc(inv.buyer.vatNumber ?? "")}</div></div>
<p style="text-align:right;margin:18px 0">Nantes, le ${f.date(inv.issueDate)}</p>
<p><b>Objet :</b> ${esc(def.extra.subject ?? "")}</p>
<p>${esc(def.extra.intro ?? "")}</p>
<table style="width:100%;margin:8px 0"><tr><th style="text-align:left">Désignation</th><th class="r">Quantité</th><th class="r">Prix unitaire HT</th><th class="r">Montant HT</th></tr>${rows}
<tr><td colspan="3" class="r">Total HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>${vat}
<tr><td colspan="3" class="r b">Total TTC</td><td class="r b">${f.money(t.grandTotal)}</td></tr></table>
<p>Facture n° ${esc(inv.number)} établie le ${f.date(inv.issueDate)}. Conditions : ${esc(inv.payment.termsText ?? "")}, soit une échéance au ${f.date(inv.dueDate ?? inv.issueDate)}.</p>
<p>Prestation réalisée le ${f.date(inv.deliveryDate ?? inv.issueDate)}. Coordonnées bancaires : IBAN ${groupIban(inv.payment.iban ?? "")}, BIC ${esc(inv.payment.bic ?? "")}.</p>
<p>${esc(def.extra.outro ?? "")}</p>
<p style="font-size:9pt">${legalNotes(c).map(esc).join(" ")}</p>`,
  )
}

// --- B05 SaaS -----------------------------------------------------------------------------------
function saas(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)}</td><td class="r">${f.money(l.unitPrice)}</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td></tr>`,
    )
    .join("")
  const vat = vatRows(c)
    .map(
      (v) =>
        `<tr><td colspan="3" class="r muted">TVA - France (${f.qty(v.rate)} % sur ${f.money(v.base)})</td><td class="r">${f.money(v.tax)}</td></tr>`,
    )
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:9.5pt;color:#1a1f36;padding:16mm 18mm}
.big{font-size:30pt;font-weight:700;margin:2px 0 4px}
.muted{color:#6b7280}
.g{background:#f6f8fa;border-radius:6px;padding:10px 12px}
td,th{padding:7px 4px;border-bottom:1px solid #e5e7eb;text-align:left}
th{font-size:8pt;text-transform:uppercase;color:#6b7280}
.foot{position:absolute;left:18mm;right:18mm;bottom:10mm;font-size:6.5pt;color:#9ca3af;line-height:1.4;border-top:1px solid #e5e7eb;padding-top:4px}`,
    `<div class="muted" style="font-size:11pt">Facture</div>
<div style="font-size:9.5pt;margin-bottom:6px">Montant dû</div><div class="big">${f.money(t.dueAmount)}</div>
<div class="muted">à régler pour le ${f.date(inv.dueDate ?? inv.issueDate)}</div>
<table style="width:100%;margin:16px 0 10px"><tr><td style="border:none;width:50%"><table><tr><td class="muted" style="border:none;padding:2px 14px 2px 0">Numéro de facture</td><td style="border:none;padding:2px 0">${esc(inv.number)}</td></tr><tr><td class="muted" style="border:none;padding:2px 14px 2px 0">Date d'émission</td><td style="border:none;padding:2px 0">${f.date(inv.issueDate)}</td></tr><tr><td class="muted" style="border:none;padding:2px 14px 2px 0">Date d'échéance</td><td style="border:none;padding:2px 0">${f.date(inv.dueDate ?? inv.issueDate)}</td></tr></table></td><td style="border:none"></td></tr></table>
<div style="display:flex;gap:12px"><div class="g" style="flex:1"><b>${esc(s.name)}</b><br>${addrLines(s.address)}<br>${esc(s.email ?? "")}</div><div class="g" style="flex:1"><div class="muted">Facturé à</div><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}</div></div>
<div style="font-size:13pt;font-weight:600;margin:20px 0 4px">${f.money(t.dueAmount)} dus le ${f.date(inv.dueDate ?? inv.issueDate)}</div>
<table style="width:100%"><tr><th>Description</th><th class="r">Qté</th><th class="r">Prix unitaire</th><th class="r">Montant</th></tr>${rows}
<tr><td colspan="3" class="r muted">Sous-total</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>${vat}
<tr><td colspan="3" class="r b">Total</td><td class="r b">${f.money(t.grandTotal)}</td></tr>
<tr><td colspan="3" class="r b">Montant dû</td><td class="r b">${f.money(t.dueAmount)}</td></tr></table>
<div class="g" style="margin-top:18px"><b>Payer par virement</b><br>IBAN ${groupIban(inv.payment.iban ?? "")} - BIC ${esc(inv.payment.bic ?? "")}<br><span class="muted">${esc(inv.payment.termsText ?? "")}. Référence : ${esc(inv.payment.reference ?? "")}</span></div>
<div class="foot">${esc(s.name)} - ${esc(s.legalForm ?? "")} au capital de ${esc(s.shareCapital ?? "")} - ${esc(s.registration ?? "")} - SIRET ${groupSiret(s.siret ?? "")} - TVA ${esc(s.vatNumber ?? "")}<br>${legalNotes(c).map(esc).join(" ")}</div>`,
  )
}

// --- B06 footer identity ------------------------------------------------------------------------
function footer(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)} ${unitLabel(l.unitCode)}</td><td class="r">${f.money(l.unitPrice)}</td><td class="r">${f.qty(l.vatRate)} %</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td></tr>`,
    )
    .join("")
  const vat = vatRows(c)
    .map(
      (v) =>
        `<div class="tr"><span>TVA ${f.qty(v.rate)} % sur ${f.money(v.base)}</span><span>${f.money(v.tax)}</span></div>`,
    )
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:Helvetica,Arial,sans-serif;font-size:10pt;padding:18mm 16mm;color:#222}
.logo{width:46px;height:46px;border-radius:50%;background:#7a4a1c;display:inline-block}
td,th{padding:6px 5px;border-bottom:1px solid #ddd;text-align:left}
th{background:#f1ece6;font-size:9pt}
.tr{display:flex;justify-content:space-between;width:260px;margin-left:auto;padding:3px 0}
.foot{position:absolute;left:16mm;right:16mm;bottom:10mm;text-align:center;font-size:7.5pt;color:#444;border-top:1px solid #aaa;padding-top:5px;line-height:1.5}`,
    `<div style="display:flex;justify-content:space-between;align-items:center"><span class="logo"></span><div class="r"><div style="font-size:24pt;letter-spacing:3px">FACTURE</div>No ${esc(inv.number)}</div></div>
<div style="display:flex;justify-content:space-between;margin:26px 0 24px"><div><b>Facturé à</b><br>${esc(inv.buyer.name)}<br>${addrLines(inv.buyer.address)}</div><div class="r">Date : ${f.date(inv.issueDate)}<br>Échéance : ${f.date(inv.dueDate ?? inv.issueDate)}<br>Paiement : ${esc(inv.payment.termsText ?? "")}</div></div>
<table style="width:100%"><tr><th>Produit / service</th><th class="r">Quantité</th><th class="r">Prix HT</th><th class="r">TVA</th><th class="r">Total HT</th></tr>${rows}</table>
<div style="margin-top:14px"><div class="tr"><span>Total HT</span><span>${f.money(t.taxBasisTotal)}</span></div>${vat}<div class="tr b"><span>Total TTC</span><span>${f.money(t.grandTotal)}</span></div><div class="tr b"><span>Net à payer</span><span>${f.money(t.dueAmount)}</span></div></div>
<p style="margin-top:26px;font-size:9pt">Règlement par virement : IBAN ${groupIban(inv.payment.iban ?? "")} - BIC ${esc(inv.payment.bic ?? "")}</p>
<p style="font-size:8pt">${legalNotes(c).map(esc).join("<br>")}</p>
<div class="foot">${esc(s.name)} - ${esc(s.address.line1)}, ${esc(`${s.address.postalCode} ${s.address.city}`)} - Tél. ${esc(s.phone ?? "")} - ${esc(s.email ?? "")}<br>${esc(s.legalForm ?? "")} au capital de ${esc(s.shareCapital ?? "")} - ${esc(s.registration ?? "")} - TVA ${esc(s.vatNumber ?? "")} - SIRET ${groupSiret(s.siret ?? "")}</div>`,
  )
}

// --- B07 sections + discount -----------------------------------------------------------------------
function sections(c: Ctx): string {
  const { inv, t, f, def } = c
  const s = inv.seller
  const disc = def.extra.discounts ?? []
  const secs = def.extra.sections ?? []
  let body = ""
  let secTotal = 0
  const flush = (title: string) => {
    body += `<tr class="sub"><td colspan="6" class="r">Sous-total ${esc(title)}</td><td class="r">${f.money(secTotal)}</td></tr>`
    secTotal = 0
  }
  let currentTitle = ""
  inv.lines.forEach((l, i) => {
    const sec = secs.find((x) => x.from === i)
    if (sec) {
      if (currentTitle) flush(currentTitle)
      currentTitle = sec.title.split(" - ")[0] ?? sec.title
      body += `<tr class="sec"><td colspan="7">${esc(sec.title)}</td></tr>`
    }
    const r = disc[i] ?? 0
    const gross = Math.round((l.unitPrice / (1 - r / 100)) * 100) / 100
    secTotal = Math.round((secTotal + (t.lineNets[i] ?? 0)) * 100) / 100
    body += `<tr><td>${esc(l.name)}</td><td class="c">${unitLabel(l.unitCode)}</td><td class="r">${f.qty2(l.quantity)}</td><td class="r">${f.num(gross)}</td><td class="r">${r ? `${f.qty(r)} %` : ""}</td><td class="r">${f.qty(l.vatRate)} %</td><td class="r">${f.num(t.lineNets[i] ?? 0)}</td></tr>`
  })
  flush(currentTitle)
  const vat = vatRows(c)
    .map(
      (v) =>
        `<tr><td>${f.qty(v.rate)} %</td><td class="r">${f.money(v.base)}</td><td class="r">${f.money(v.tax)}</td></tr>`,
    )
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:Helvetica,Arial,sans-serif;font-size:9pt;padding:14mm 14mm}
td,th{padding:4px 5px;border:1px solid #bbb}
th{background:#e8eef4;font-size:8pt}
.sec td{background:#f4f4f4;font-weight:bold}
.sub td{font-style:italic;background:#fafafa}
h1{margin:0;font-size:20pt}`,
    `<div style="display:flex;justify-content:space-between"><div><div class="b" style="font-size:12pt">${esc(s.name)}</div>${addrLines(s.address)}<br>Tél : ${esc(s.phone ?? "")} - ${esc(s.email ?? "")}<br>SIRET ${groupSiret(s.siret ?? "")} - TVA ${esc(s.vatNumber ?? "")}<br>${esc(s.legalForm ?? "")} au capital de ${esc(s.shareCapital ?? "")} - ${esc(s.registration ?? "")}</div>
<div class="r"><h1>FACTURE</h1>N° ${esc(inv.number)}<br>Date : ${f.date(inv.issueDate)}<br>${esc(inv.orderReference ? `Réf. marché : ${inv.orderReference.replace("Marché ", "")}` : "")}</div></div>
<div style="margin:16px 0 14px;border:1px solid #888;padding:8px;width:48%;margin-left:auto"><b>Client</b><br>${esc(inv.buyer.name)}<br>${addrLines(inv.buyer.address)}</div>
<p>Objet : Travaux de rénovation, ${esc(inv.orderReference ?? "")}</p>
<table style="width:100%"><tr><th>Libellé</th><th>U</th><th>Qté</th><th>P.U.</th><th>Rem.</th><th>TVA</th><th>Montant HT</th></tr>${body}</table>
<table style="width:55%;margin:12px 0 0 auto"><tr><th>TVA</th><th>Base HT</th><th>Montant TVA</th></tr>${vat}</table>
<table style="width:55%;margin:6px 0 0 auto"><tr><td>Total HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr><tr><td>Total TVA</td><td class="r">${f.money(t.taxTotal)}</td></tr><tr><td class="b">Total TTC</td><td class="r b">${f.money(t.grandTotal)}</td></tr><tr><td class="b">Net à payer</td><td class="r b">${f.money(t.dueAmount)}</td></tr></table>
<p style="margin-top:14px">Conditions de règlement : ${esc(inv.payment.termsText ?? "")}<br>IBAN ${groupIban(inv.payment.iban ?? "")} - BIC ${esc(inv.payment.bic ?? "")}</p>
<p style="font-size:8pt">${legalNotes(c).map(esc).join("<br>")}</p>`,
  )
}

// --- B08 bilingual ------------------------------------------------------------------------------------
function bilingual(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)}</td><td class="r">${f.money(l.unitPrice)}</td><td class="r">${f.qty(l.vatRate)} %</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td></tr>`,
    )
    .join("")
  const vat = vatRows(c)
    .map(
      (v) => `<tr><td>VAT / TVA ${f.qty(v.rate)} %</td><td class="r">${f.money(v.tax)}</td></tr>`,
    )
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:Verdana,"DejaVu Sans",sans-serif;font-size:8.5pt;padding:15mm}
.hd{background:#0b3d5c;color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center}
td,th{padding:5px 6px;border-bottom:1px solid #ccc;text-align:left}
th{font-size:7.5pt;color:#0b3d5c;border-bottom:2px solid #0b3d5c}
.k{color:#555}`,
    `<div class="hd"><div style="font-size:14pt;font-weight:bold">${esc(s.name)}</div><div class="r" style="font-size:12pt">Facture / Invoice</div></div>
<table style="width:100%;margin-top:12px"><tr><td style="border:none;width:50%;vertical-align:top">${addrLines(s.address)}<br>${esc(s.email ?? "")} - ${esc(s.phone ?? "")}<br>${esc(s.legalForm ?? "")} au capital de ${esc(s.shareCapital ?? "")}<br>${esc(s.registration ?? "")}<br>SIRET ${groupSiret(s.siret ?? "")}<br>VAT / TVA ${esc(s.vatNumber ?? "")}</td>
<td style="border:none;vertical-align:top"><b>Facture / Invoice No. ${esc(inv.number)}</b><br>Date / Date of issue : ${f.date(inv.issueDate)}<br>Due date / Échéance : ${f.date(inv.dueDate ?? inv.issueDate)}<br>Your ref. / Votre réf. : ${esc(inv.orderReference ?? "")}</td></tr></table>
<div style="margin:14px 0;padding:8px 10px;background:#eef3f6"><b>Client / Customer</b><br>${esc(inv.buyer.name)}<br>${esc(inv.buyer.address.line1)}, ${esc(`${inv.buyer.address.postalCode} ${inv.buyer.address.city}`)}<br>SIREN ${groupSiren(inv.buyer.siren ?? "")} - VAT / TVA ${esc(inv.buyer.vatNumber ?? "")}</div>
<table style="width:100%"><tr><th>Description</th><th class="r">Qty / Qté</th><th class="r">Unit price / PU</th><th class="r">VAT / TVA</th><th class="r">Amount / Montant</th></tr>${rows}</table>
<table style="width:55%;margin:12px 0 0 auto"><tr><td>Total excl. VAT / Total HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>${vat}<tr><td class="b">Total incl. VAT / Total TTC</td><td class="r b">${f.money(t.grandTotal)}</td></tr><tr><td class="b">Amount due / Net à payer</td><td class="r b">${f.money(t.dueAmount)}</td></tr></table>
<p style="margin-top:16px">Bank transfer / Virement : IBAN ${groupIban(inv.payment.iban ?? "")} - BIC / SWIFT ${esc(inv.payment.bic ?? "")}</p>
<p class="k" style="font-size:7.5pt">${legalNotes(c).map(esc).join("<br>")}<br>Late payment: penalty of 3 times the legal interest rate and a fixed 40 EUR recovery fee.</p>`,
  )
}

// --- B09 credit note ---------------------------------------------------------------------------------
function credit(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const neg = (n: number) => f.money(-Math.abs(n))
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)}</td><td class="r">${neg(l.unitPrice)}</td><td class="r">${f.qty(l.vatRate)} %</td><td class="r">${neg(t.lineNets[i] ?? 0)}</td></tr>`,
    )
    .join("")
  const vat = vatRows(c)
    .map((v) => `<tr><td>TVA ${f.qty(v.rate)} %</td><td class="r">${neg(v.tax)}</td></tr>`)
    .join("")
  const pre = inv.precedingInvoice
  return shell(
    `Avoir ${inv.number}`,
    `body{font-family:"Open Sans","Helvetica Neue",Arial,sans-serif;font-size:9.5pt;padding:0}
.band{background:#d9480f;color:#fff;padding:16mm 16mm 8mm}
.band h1{margin:0;font-size:26pt;font-weight:300}
.in{padding:8mm 16mm}
td,th{padding:6px 6px;text-align:left;border-bottom:1px solid #e3e3e3}
th{background:#faf0ea;font-size:8.5pt}`,
    `<div class="band"><h1>AVOIR N° ${esc(inv.number)}</h1><div>Date : ${f.date(inv.issueDate)}</div></div>
<div class="in"><div style="display:flex;justify-content:space-between"><div><b>${esc(s.name)}</b><br>${addrLines(s.address)}<br>${esc(s.email ?? "")}<br>${esc(s.legalForm ?? "")} au capital de ${esc(s.shareCapital ?? "")} - ${esc(s.registration ?? "")}<br>SIRET : ${groupSiret(s.siret ?? "")}<br>N° TVA : ${esc(s.vatNumber ?? "")}</div>
<div style="width:46%;background:#f5f5f5;padding:10px"><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}<br>SIREN : ${groupSiren(inv.buyer.siren ?? "")}<br>TVA : ${esc(inv.buyer.vatNumber ?? "")}</div></div>
<p style="margin:18px 0 10px;padding:8px;border:1px dashed #d9480f"><b>Avoir sur facture n° ${esc(pre?.number ?? "")} du ${f.date(pre?.issueDate ?? inv.issueDate)}</b></p>
<table style="width:100%"><tr><th>Désignation</th><th class="r">Qté</th><th class="r">Prix unitaire HT</th><th class="r">TVA</th><th class="r">Montant HT</th></tr>${rows}</table>
<table style="width:50%;margin:12px 0 0 auto"><tr><td>Total HT</td><td class="r">${neg(t.taxBasisTotal)}</td></tr>${vat}<tr><td class="b">Total TTC</td><td class="r b">${neg(t.grandTotal)}</td></tr><tr><td class="b">Montant à nous rembourser / à déduire</td><td class="r b">${neg(t.dueAmount)}</td></tr></table>
<p style="margin-top:18px">${esc(inv.payment.termsText ?? "")}<br>IBAN ${groupIban(inv.payment.iban ?? "")} - BIC ${esc(inv.payment.bic ?? "")}</p>
<p style="font-size:8pt">${legalNotes(c).map(esc).join("<br>")}</p></div>`,
  )
}

// --- B10 QuickBooks-like -----------------------------------------------------------------------------------
function quickbooks(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)}</td><td class="r">${f.money(l.unitPrice)}</td><td class="r">${f.qty(l.vatRate)} %</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td></tr>`,
    )
    .join("")
  const vat = vatRows(c)
    .map((v) => `<tr><td>TVA ${f.qty(v.rate)} %</td><td class="r">${f.money(v.tax)}</td></tr>`)
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:"Avenir Next",Helvetica,Arial,sans-serif;font-size:10pt;padding:16mm;color:#393a3d}
h1{font-size:22pt;color:#2ca01c;margin:0 0 6px;font-weight:400}
th{border-bottom:2px solid #2ca01c;text-align:left;padding:6px;font-size:9pt}
td{padding:7px 6px;border-bottom:1px solid #eee}
.tot td{border:none;padding:4px 6px}
.due{background:#e8f5e6;font-size:13pt}`,
    `<div style="display:flex;justify-content:space-between"><div><h1>Facture</h1><div class="b">${esc(s.name)}</div>${addrLines(s.address)}<br>${esc(s.email ?? "")} - ${esc(s.phone ?? "")}<br>SIRET ${esc(s.siret ?? "")}<br>${esc(s.legalForm ?? "")} au capital de ${esc(s.shareCapital ?? "")} - ${esc(s.registration ?? "")}<br>N° TVA ${esc(s.vatNumber ?? "")}</div>
<div class="r"><table style="margin-left:auto"><tr><td style="border:none" class="r">Réf. facture</td><td style="border:none" class="b">${esc(inv.number)}</td></tr><tr><td style="border:none" class="r">Date de la facture</td><td style="border:none">${f.date(inv.issueDate)}</td></tr><tr><td style="border:none" class="r">Date limite de paiement</td><td style="border:none">${f.date(inv.dueDate ?? inv.issueDate)}</td></tr></table></div></div>
<div style="margin:22px 0 14px"><div style="color:#6b6c72;font-size:8.5pt">FACTURÉ À</div><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}<br>SIREN ${esc(inv.buyer.siren ?? "")} - TVA ${esc(inv.buyer.vatNumber ?? "")}</div>
<table style="width:100%"><tr><th>Description</th><th class="r">Qté</th><th class="r">Prix unitaire</th><th class="r">TVA</th><th class="r">Montant</th></tr>${rows}</table>
<table class="tot" style="width:46%;margin:12px 0 0 auto"><tr><td>Total HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>${vat}<tr><td class="b">Total TTC</td><td class="r b">${f.money(t.grandTotal)}</td></tr><tr class="due"><td class="b">Solde dû</td><td class="r b">${f.money(t.dueAmount)}</td></tr></table>
<p style="margin-top:20px">Conditions : ${esc(inv.payment.termsText ?? "")}<br>Virement : IBAN ${esc(inv.payment.iban ?? "")} - BIC ${esc(inv.payment.bic ?? "")}</p>
<p style="font-size:8pt">${legalNotes(c).map(esc).join("<br>")}</p>`,
  )
}

// --- B11 freelancer -----------------------------------------------------------------------------------
function freelance(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${esc(l.name)}</td><td class="r">${f.qty2(l.quantity)} ${unitLabel(l.unitCode)}</td><td class="r">${f.money(l.unitPrice)}</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td></tr>`,
    )
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:"Nunito","Helvetica Neue",Arial,sans-serif;font-size:10pt;padding:18mm;color:#2b2d42}
h1{font-size:20pt;margin:0;color:#5a54d8}
td,th{padding:7px 6px;border-bottom:1px solid #e6e6f0;text-align:left}
th{background:#f0effc;font-size:9pt}
.rib{border:1px solid #c9c7f0;border-radius:6px;padding:10px;margin-top:20px}`,
    `<div style="display:flex;justify-content:space-between"><div><div class="b" style="font-size:13pt">${esc(s.name)}</div>Micro-entrepreneur, développeuse web freelance<br>${addrLines(s.address)}<br>${esc(s.email ?? "")} - ${esc(s.phone ?? "")}<br>SIRET : ${groupSiret(s.siret ?? "")}</div>
<div class="r"><h1>Facture ${esc(inv.number)}</h1>Date d'émission : ${f.date(inv.issueDate)}<br>Date de prestation : ${f.date(inv.deliveryDate ?? inv.issueDate)}<br>Échéance : ${f.date(inv.dueDate ?? inv.issueDate)}</div></div>
<div style="margin:24px 0;padding:10px;background:#f7f7fb;width:55%"><div style="font-size:8.5pt;color:#777">DESTINATAIRE</div><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}<br>SIRET : ${groupSiret(inv.buyer.siret ?? "")}</div>
<table style="width:100%"><tr><th>Prestation</th><th class="r">Quantité</th><th class="r">Prix unitaire</th><th class="r">Total</th></tr>${rows}</table>
<table style="width:42%;margin:12px 0 0 auto"><tr><td>Total HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr><tr><td class="b">Total à payer</td><td class="r b">${f.money(t.dueAmount)}</td></tr></table>
<p style="margin-top:10px;font-size:9pt">${esc(inv.vatExemptionReason ?? "")}</p>
<div class="rib"><b>Coordonnées bancaires (RIB)</b><br>Titulaire : ${esc(s.name)}<br>IBAN : ${groupIban(inv.payment.iban ?? "")}<br>BIC : ${esc(inv.payment.bic ?? "")}<br>${esc(inv.payment.termsText ?? "")}</div>
<p style="font-size:8pt;margin-top:16px">${legalNotes(c).map(esc).join("<br>")}</p>`,
  )
}

// --- B12 long two pages ------------------------------------------------------------------------------
function long(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td style="width:55%"><b>${esc(l.name)}</b><div class="d">${esc(l.description ?? "")}</div></td><td class="r">${f.qty2(l.quantity)}</td><td class="c">${unitLabel(l.unitCode)}</td><td class="r">${f.num(l.unitPrice)}</td><td class="r">${f.qty(l.vatRate)} %</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td></tr>`,
    )
    .join("")
  const vat = vatRows(c)
    .map((v) => `<tr><td>TVA ${f.qty(v.rate)} %</td><td class="r">${f.money(v.tax)}</td></tr>`)
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:9pt;padding:14mm;color:#1d2433}
td,th{padding:5px 5px;border-bottom:1px solid #dfe3ea;vertical-align:top;text-align:left}
th{font-size:8pt;background:#eef1f6}
tr{break-inside:avoid}
.d{color:#555;font-size:8pt;margin-top:2px;line-height:1.35}
.pg{position:fixed;bottom:8mm;right:14mm;font-size:8pt;color:#777}`,
    `<div style="display:flex;justify-content:space-between"><div><div class="b" style="font-size:13pt">${esc(s.name)}</div>${addrLines(s.address)}<br>${esc(s.email ?? "")} - ${esc(s.phone ?? "")}<br>${esc(s.legalForm ?? "")} au capital de ${esc(s.shareCapital ?? "")} - ${esc(s.registration ?? "")}<br>SIRET ${groupSiret(s.siret ?? "")} - TVA ${esc(s.vatNumber ?? "")}</div>
<div class="r"><div style="font-size:18pt;font-weight:bold">Facture n° ${esc(inv.number)}</div>Émise le ${f.date(inv.issueDate)}<br>Échéance : ${f.date(inv.dueDate ?? inv.issueDate)}<br>Bon de commande : ${esc(inv.orderReference ?? "")}<br>Service : ${esc(inv.buyerReference ?? "")}</div></div>
<div style="margin:14px 0;padding:8px;background:#f5f6f9;width:50%"><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}<br>SIRET ${groupSiret(inv.buyer.siret ?? "")} - TVA ${esc(inv.buyer.vatNumber ?? "")}</div>
<table style="width:100%"><thead><tr><th>Désignation</th><th class="r">Quantité</th><th>Unité</th><th class="r">PU HT</th><th class="r">TVA</th><th class="r">Total HT</th></tr></thead><tbody>${rows}</tbody></table>
<div style="break-inside:avoid;margin-top:14px"><table style="width:45%;margin-left:auto"><tr><td>Total HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>${vat}<tr><td class="b">Total TTC</td><td class="r b">${f.money(t.grandTotal)}</td></tr><tr><td class="b">Net à payer</td><td class="r b">${f.money(t.dueAmount)}</td></tr></table>
<p>Conditions de règlement : ${esc(inv.payment.termsText ?? "")}<br>IBAN ${groupIban(inv.payment.iban ?? "")} - BIC ${esc(inv.payment.bic ?? "")}</p>
<p style="font-size:8pt">${legalNotes(c).map(esc).join("<br>")}</p></div>`,
  )
}

// --- B13 buyer first --------------------------------------------------------------------------------
function buyerFirst(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${esc(l.name)}</td><td class="r">${f.qty2(l.quantity)}</td><td class="c">${unitLabel(l.unitCode)}</td><td class="r">${f.num(l.unitPrice)}</td><td class="r">${f.qty(l.vatRate)} %</td><td class="r">${f.num(t.lineNets[i] ?? 0)}</td></tr>`,
    )
    .join("")
  const vat = vatRows(c)
    .map(
      (v) =>
        `<tr><td>${f.qty(v.rate)} %</td><td class="r">${f.money(v.base)}</td><td class="r">${f.money(v.tax)}</td></tr>`,
    )
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:Tahoma,Verdana,"DejaVu Sans",sans-serif;font-size:9pt;padding:14mm}
td,th{padding:4px 6px;border:1px solid #999}
th{background:#ddd}
.bl{border:1px solid #666;padding:8px;min-height:85px}
.nb td{border:none;padding:0 6px 0 0}`,
    `<table class="nb" style="width:100%"><tr><td style="width:50%"><div class="bl"><b>Adresse de facturation</b><br>${esc(inv.buyer.name)}<br>${addrLines(inv.buyer.address)}<br>SIREN : ${groupSiren(inv.buyer.siren ?? "")}<br>TVA : ${esc(inv.buyer.vatNumber ?? "")}</div></td>
<td><div class="bl"><b>Adresse de livraison</b><br>${esc(inv.buyer.name)}<br>${inv.deliveryAddress ? addrLines(inv.deliveryAddress) : ""}</div></td></tr></table>
<div style="margin:14px 0;display:flex;justify-content:space-between;align-items:flex-start"><div><div class="b" style="font-size:9.5pt">Émetteur</div><b>${esc(s.name)}</b><br>${addrLines(s.address)}<br>Tél : ${esc(s.phone ?? "")} - ${esc(s.email ?? "")}<br>SIRET : ${groupSiret(s.siret ?? "")}<br>TVA : ${esc(s.vatNumber ?? "")}<br>${esc(s.legalForm ?? "")} au capital de ${esc(s.shareCapital ?? "")} - ${esc(s.registration ?? "")}</div>
<table style="width:46%"><tr><th colspan="2" style="font-size:12pt">FACTURE</th></tr><tr><td>N° de facture</td><td class="b">${esc(inv.number)}</td></tr><tr><td>Date de facture</td><td>${f.date(inv.issueDate)}</td></tr><tr><td>Date de livraison</td><td>${f.date(inv.deliveryDate ?? inv.issueDate)}</td></tr><tr><td>N° de commande</td><td>${esc(inv.orderReference ?? "")}</td></tr><tr><td>Échéance</td><td>${f.date(inv.dueDate ?? inv.issueDate)}</td></tr></table></div>
<table style="width:100%"><tr><th>Article</th><th>Quantité</th><th>U</th><th>Prix unitaire</th><th>TVA</th><th>Montant HT</th></tr>${rows}</table>
<div style="display:flex;justify-content:space-between;margin-top:12px"><table style="width:44%"><tr><th>Taux</th><th>Base HT</th><th>TVA</th></tr>${vat}</table>
<table style="width:44%"><tr><td>Total HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr><tr><td>Total TVA</td><td class="r">${f.money(t.taxTotal)}</td></tr><tr><td class="b">Total TTC</td><td class="r b">${f.money(t.grandTotal)}</td></tr><tr><td class="b">Reste à payer</td><td class="r b">${f.money(t.dueAmount)}</td></tr></table></div>
<p style="margin-top:12px">Règlement : ${esc(inv.payment.termsText ?? "")} - IBAN ${groupIban(inv.payment.iban ?? "")} - BIC ${esc(inv.payment.bic ?? "")}</p>
<p style="font-size:8pt">${legalNotes(c).map(esc).join("<br>")}</p>`,
  )
}

export const HTML_TEMPLATES: Partial<Record<TemplateId, (c: Ctx) => string>> = {
  excel,
  letter,
  saas,
  footer,
  sections,
  bilingual,
  credit,
  quickbooks,
  freelance,
  long,
  buyerFirst,
}
