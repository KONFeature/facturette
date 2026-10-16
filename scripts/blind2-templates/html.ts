/** HTML templates (rendered to PDF by Chromium) of the second blind set. Each imitates a real-world layout family. */
import {
  type Ctx,
  esc,
  groupIban,
  groupSiren,
  groupSiret,
  legalNoteList,
  type TemplateId,
  unitText,
  vatRows,
} from "./common"

const shell = (title: string, css: string, body: string): string => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: A4; margin: 0 }
* { box-sizing: border-box }
body { margin: 0; padding: 0 }
table { border-collapse: collapse }
.r { text-align: right; white-space: nowrap }
.c { text-align: center }
.b { font-weight: bold }
.sm { font-size: 8pt }
.n { white-space: nowrap }
${css}
</style></head><body>${body}</body></html>`

const addrLines = (a: { line1: string; line2?: string; postalCode: string; city: string }) =>
  [a.line1, ...(a.line2 ? [a.line2] : []), `${a.postalCode} ${a.city}`].map(esc).join("<br>")

const vatSpaced = (v: string): string =>
  `${v.slice(0, 2)} ${v.slice(2, 4)} ${groupSiren(v.slice(4))}`

const sellerIds = (c: Ctx, spacedVat = false, sep = " - "): string => {
  const s = c.inv.seller
  return [
    s.siren ? `SIREN ${groupSiren(s.siren)}` : "",
    s.siret ? `SIRET ${groupSiret(s.siret)}` : "",
    s.vatNumber ? `TVA ${spacedVat ? vatSpaced(s.vatNumber) : s.vatNumber}` : "",
  ]
    .filter(Boolean)
    .join(sep)
}

const sellerLegal = (c: Ctx): string => {
  const s = c.inv.seller
  return [
    s.legalForm ?? "",
    s.shareCapital ? `au capital de ${s.shareCapital}` : "",
    s.registration ?? "",
  ]
    .filter(Boolean)
    .join(", ")
}

const bankLine = (c: Ctx): string =>
  c.inv.payment.iban
    ? `IBAN ${groupIban(c.inv.payment.iban)}${c.inv.payment.bic ? ` - BIC ${esc(c.inv.payment.bic)}` : ""}`
    : ""

const lineRows = (c: Ctx, cells: (i: number) => string, descriptionSpan: number): string =>
  c.inv.lines
    .map(
      (l, i) =>
        `<tr>${cells(i)}</tr>${
          l.description
            ? `<tr class="d"><td colspan="${descriptionSpan}" class="sm">${esc(l.description)}</td></tr>`
            : ""
        }`,
    )
    .join("")

const notesBlock = (c: Ctx): string => legalNoteList(c.inv).map(esc).join("<br>")

// --- C01 Odoo-like -----------------------------------------------------------------------------
function odoo(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const rows = lineRows(
    c,
    (i) => {
      const l = inv.lines[i]
      if (!l) return ""
      return `<td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)} ${unitText(l.unitCode)}</td><td class="r">${f.num(l.unitPrice)}</td><td class="r">${f.pct(l.vatRate)}</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td>`
    },
    5,
  )
  const vat = vatRows(c)
    .map((v) => `<tr><td>TVA ${f.pct(v.rate)}</td><td class="r">${f.money(v.tax)}</td></tr>`)
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:"Helvetica Neue",Arial,sans-serif;font-size:9.5pt;color:#222;padding:16mm 15mm}
.top{display:flex;justify-content:space-between;align-items:flex-start}
.logo{width:34mm;height:20mm;border:1px dashed #999;color:#999;display:flex;align-items:center;justify-content:center}
h1{font-size:19pt;color:#714b67;margin:14mm 0 4mm}
.hdr td{border-bottom:2px solid #714b67;padding:3px 8px 3px 0;vertical-align:top}
.hdr .l{font-weight:bold}
table.l{width:100%;margin-top:7mm}
table.l th{text-align:left;border-bottom:2px solid #714b67;padding:4px}
table.l td{padding:4px}
tr.d td{padding-top:0;color:#555}
.tot{margin-left:auto;margin-top:6mm;width:62mm}
.tot td{padding:3px 4px}`,
    `<div class="top"><div class="logo">LOGO</div>
<div style="text-align:right"><b>${esc(s.name)}</b><br>${addrLines(s.address)}<br>${esc(s.phone ?? "")}<br>${esc(s.email ?? "")}<br>${sellerIds(c)}</div></div>
<div style="margin:10mm 0 0 98mm"><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}<br>SIREN ${groupSiren(inv.buyer.siren ?? "")} - TVA ${esc(inv.buyer.vatNumber ?? "")}</div>
<h1>Facture N° ${esc(inv.number)}</h1>
<table class="hdr"><tr><td class="l" style="width:60mm">Date de la facture</td><td class="l" style="width:60mm">Date d'échéance</td><td class="l">Date de livraison</td></tr>
<tr><td>${f.date(inv.issueDate)}</td><td>${f.date(inv.dueDate ?? inv.issueDate)}</td><td>${f.date(inv.deliveryDate ?? inv.issueDate)}</td></tr></table>
<p>Votre référence : ${esc(inv.orderReference ?? "")}</p>
<table class="l"><tr><th>Description</th><th class="r">Quantité</th><th class="r">Prix unitaire</th><th class="r">Taxes</th><th class="r">Montant</th></tr>${rows}</table>
<table class="tot"><tr><td>Montant hors taxes</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>${vat}
<tr class="b"><td style="border-top:1px solid #222">Total</td><td class="r" style="border-top:1px solid #222">${f.money(t.grandTotal)}</td></tr></table>
<p style="margin-top:8mm">Communication de paiement : <b>${esc(inv.payment.reference ?? "")}</b><br>${esc(inv.payment.termsText ?? "")}<br>${bankLine(c)}</p>
<p class="sm" style="margin-top:12mm;border-top:1px solid #ccc;padding-top:3mm">${esc(sellerLegal(c))}<br>${notesBlock(c)}</p>`,
  )
}

// --- C02 Mémoire d'honoraires ------------------------------------------------------------------
function memoire(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)} ${unitText(l.unitCode)}</td><td class="r">${f.num(l.unitPrice)}</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td></tr>`,
    )
    .join("")
  const vat = vatRows(c)
    .map(
      (v) =>
        `<tr><td colspan="3" class="r">TVA à ${f.pct(v.rate)}</td><td class="r">${f.money(v.tax)}</td></tr>`,
    )
    .join("")
  return shell(
    `Mémoire d'honoraires ${inv.number}`,
    `body{font-family:Georgia,serif;font-size:12pt;padding:20mm 24mm;line-height:1.3}
.hd{text-align:center;border-bottom:3px double #444;padding-bottom:4mm}
.hd .n{font-size:17pt;font-variant:small-caps;letter-spacing:1px}
.hd small{display:block;font-size:9pt}
h2{text-align:center;font-size:15pt;margin:9mm 0 1mm;letter-spacing:1px}
table.l{width:100%;margin-top:6mm}
table.l th{border-top:1px solid #000;border-bottom:1px solid #000;padding:4px;text-align:left}
table.l td{padding:4px}`,
    `<div class="hd"><div class="n">${esc(s.name)}</div><small>${esc(s.address.line1)}, ${esc(`${s.address.postalCode} ${s.address.city}`)} - Téléphone ${esc(s.phone ?? "")} - ${esc(s.email ?? "")}</small><small>${esc(sellerLegal(c))}</small><small>${sellerIds(c, true)}</small></div>
<h2>MÉMOIRE D'HONORAIRES N° ${esc(inv.number)}</h2>
<p class="c" style="margin:0">Établi à ${esc(s.address.city)}, le ${f.date(inv.issueDate)}</p>
<p style="margin:8mm 0 0 95mm"><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}<br>SIREN ${groupSiren(inv.buyer.siren ?? "")}<br>N° TVA ${vatSpaced(inv.buyer.vatNumber ?? "")}</p>
<p><b>Référence :</b> ${esc(inv.orderReference ?? "")}<br><b>Objet :</b> ${esc(inv.notes ?? "")}</p>
<table class="l"><tr><th>Diligences accomplies</th><th class="r">Temps</th><th class="r">Taux</th><th class="r">Honoraires HT</th></tr>${rows}
<tr><td colspan="3" class="r">Total des honoraires HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>${vat}
<tr><td colspan="3" class="r b">Total TTC</td><td class="r b">${f.money(t.grandTotal)}</td></tr>
<tr><td colspan="3" class="r">Provision déjà versée</td><td class="r">${f.money(inv.prepaidAmount ?? 0)}</td></tr>
<tr><td colspan="3" class="r b">Solde à régler</td><td class="r b">${f.money(t.dueAmount)}</td></tr></table>
<p style="margin-top:8mm">Ce mémoire est payable ${esc(inv.payment.termsText ?? "")}, soit au plus tard le ${f.date(inv.dueDate ?? inv.issueDate)}.<br>Règlement par virement : ${bankLine(c)}.</p>
<p style="font-size:9pt">${notesBlock(c)}</p>`,
  )
}

// --- C04 Facture de situation ------------------------------------------------------------------
function situation(c: Ctx): string {
  const { inv, t, f, def } = c
  const s = inv.seller
  const sit = def.extra.situation ?? []
  const cum = (i: number) =>
    Math.round((((sit[i]?.market ?? 0) * (sit[i]?.pct ?? 0)) / 100) * 100) / 100
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${esc(l.name)}</td><td class="r">${f.num(sit[i]?.market ?? 0)}</td><td class="r">${f.qty(sit[i]?.pct ?? 0)} %</td><td class="r">${f.num(cum(i))}</td><td class="r">${f.num(sit[i]?.previous ?? 0)}</td><td class="r b">${f.num(l.unitPrice)}</td></tr>`,
    )
    .join("")
  return shell(
    `Facture de situation ${inv.number}`,
    `body{font-family:Verdana,"DejaVu Sans",sans-serif;font-size:8.5pt;padding:12mm}
.band{background:#2f4858;color:#fff;padding:5mm;display:flex;justify-content:space-between}
.band h1{margin:0;font-size:15pt}
.cols{display:flex;gap:8mm;margin-top:6mm}.cols>div{flex:1;border:1px solid #2f4858;padding:3mm}
table.l{width:100%;margin-top:7mm}
table.l th{background:#dfe8ee;border:1px solid #2f4858;padding:4px;font-size:8pt}
table.l td{border:1px solid #9fb2bd;padding:4px}
table.l td:first-child{width:58mm}
.tot{width:75mm;margin:5mm 0 0 auto}.tot td{border:1px solid #9fb2bd;padding:4px}`,
    `<div class="band"><h1>FACTURE DE SITUATION N° 3</h1><div style="text-align:right">Facture n° ${esc(inv.number)}<br>Émise le ${f.date(inv.issueDate)}</div></div>
<div class="cols"><div><b>Entreprise</b><br><b>${esc(s.name)}</b><br>${addrLines(s.address)}<br>${esc(s.phone ?? "")}<br>${esc(s.email ?? "")}<br>SIREN ${groupSiren(s.siren ?? "")}<br>SIRET ${groupSiret(s.siret ?? "")}<br>N° TVA ${esc(s.vatNumber ?? "")}</div>
<div><b>Maître d'ouvrage / entreprise principale</b><br><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}<br>SIREN ${groupSiren(inv.buyer.siren ?? "")}<br>N° TVA ${esc(inv.buyer.vatNumber ?? "")}</div></div>
<p>Opération : ${esc(inv.orderReference ?? "")}<br>Situation arrêtée au : ${f.date(inv.deliveryDate ?? inv.issueDate)}<br>Échéance de paiement : ${f.date(inv.dueDate ?? inv.issueDate)}</p>
<table class="l"><tr><th>Désignation</th><th>Marché HT</th><th>% cumulé</th><th>Cumul HT</th><th>Situations précédentes</th><th>Situation n° 3 HT</th></tr>${rows}</table>
<table class="tot"><tr><td>Total HT de la situation</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>
<tr><td>TVA autoliquidation</td><td class="r">${f.money(t.taxTotal)}</td></tr>
<tr class="b"><td>Net à payer TTC</td><td class="r">${f.money(t.grandTotal)}</td></tr></table>
<p><b>${esc(inv.vatExemptionReason ?? "")}</b></p>
<p>${esc(inv.payment.termsText ?? "")}<br>${bankLine(c)}</p>
<p class="sm">${esc(sellerLegal(c))}<br>${notesBlock(c)}</p>`,
  )
}

// --- C05 Facture d'acompte ---------------------------------------------------------------------
function acompte(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const rows = lineRows(
    c,
    (i) => {
      const l = inv.lines[i]
      if (!l) return ""
      return `<td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)}</td><td class="r">${f.money(l.unitPrice)}</td><td class="r">${f.pct(l.vatRate, true)}</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td>`
    },
    5,
  )
  const vat = vatRows(c)
    .map((v) => `<tr><td>TVA ${f.pct(v.rate, true)}</td><td class="r">${f.money(v.tax)}</td></tr>`)
    .join("")
  return shell(
    `Facture d'acompte ${inv.number}`,
    `body{font-family:"Trebuchet MS","Lucida Sans",sans-serif;font-size:10pt;padding:0}
.band{background:#c2571a;color:#fff;padding:12mm 14mm 8mm}
.band h1{margin:0;font-size:22pt;letter-spacing:2px}
.in{padding:8mm 14mm}
.cols{display:flex;justify-content:space-between}
.box{border:2px solid #c2571a;padding:4mm;width:80mm;border-radius:3mm}
table.l{width:100%;margin-top:8mm}
table.l th{background:#f6e3d6;padding:5px;text-align:left}
table.l td{padding:5px;border-bottom:1px solid #ddd;vertical-align:top}
tr.d td{color:#555;border-bottom:1px solid #ddd}
.tot{width:70mm;margin:6mm 0 0 auto}.tot td{padding:4px}`,
    `<div class="band"><h1>FACTURE D'ACOMPTE</h1>N° ${esc(inv.number)} - du ${f.date(inv.issueDate)}</div>
<div class="in"><div class="cols"><div><b>${esc(s.name)}</b><br>${addrLines(s.address)}<br>Tél. ${esc(s.phone ?? "")}<br>${esc(s.email ?? "")}<br><span class="sm">${sellerIds(c)}</span></div>
<div class="box"><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}</div></div>
<p style="margin-top:6mm">Référence : ${esc(inv.orderReference ?? "")}</p>
<table class="l"><tr><th>Désignation</th><th class="r">Qté</th><th class="r">Prix HT</th><th class="r">TVA</th><th class="r">Total HT</th></tr>${rows}</table>
<table class="tot"><tr><td>Total HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>${vat}
<tr class="b"><td>Acompte TTC à régler</td><td class="r">${f.money(t.dueAmount)}</td></tr>
<tr><td>Total TTC</td><td class="r">${f.money(t.grandTotal)}</td></tr></table>
<p>Échéance : ${f.date(inv.dueDate ?? inv.issueDate)}. ${esc(inv.payment.termsText ?? "")}.</p>
<p class="sm" style="margin-top:14mm">${esc(sellerLegal(c))}<br>${notesBlock(c)}</p></div>`,
  )
}

// --- C07 SaaS ----------------------------------------------------------------------------------
function saas(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const rows = lineRows(
    c,
    (i) => {
      const l = inv.lines[i]
      if (!l) return ""
      return `<td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)}</td><td class="r">${f.money(l.unitPrice)}</td><td class="r">${f.pct(l.vatRate)}</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td>`
    },
    5,
  )
  const vat = vatRows(c)
    .map(
      (v) =>
        `<tr><td colspan="4" class="r">TVA ${f.pct(v.rate)} sur ${f.money(v.base)}</td><td class="r">${f.money(v.tax)}</td></tr>`,
    )
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:"Segoe UI",Helvetica,Arial,sans-serif;font-size:9.5pt;color:#1a1f36;padding:18mm 16mm}
h1{font-size:24pt;margin:0 0 6mm;font-weight:600}
.kv td{padding:1px 14px 1px 0}.kv td:first-child{color:#697386}
.two{display:flex;gap:16mm;margin:8mm 0}
.big{font-size:15pt;font-weight:600;margin:6mm 0}
table.l{width:100%;margin-top:4mm}
table.l th{text-align:left;color:#697386;font-weight:500;border-bottom:1px solid #e3e8ee;padding:4px 0}
table.l td{padding:6px 0;border-bottom:1px solid #e3e8ee}
tr.d td{color:#697386;border:none}
.qr{width:26mm;height:26mm;border:3px solid #1a1f36;background:repeating-conic-gradient(#1a1f36 0 25%,#fff 0 50%) 0 0/6mm 6mm}`,
    `<h1>Facture</h1>
<table class="kv"><tr><td>Numéro de facture</td><td>${esc(inv.number)}</td></tr><tr><td>Date d'émission</td><td>${f.date(inv.issueDate)}</td></tr><tr><td>Date d'échéance</td><td>${f.date(inv.dueDate ?? inv.issueDate)}</td></tr></table>
<div class="two"><div><b>${esc(s.name)}</b><br>${addrLines(s.address)}<br>${esc(s.email ?? "")}<br>${sellerIds(c, true, "<br>")}</div>
<div><b>Facturé à</b><br>${esc(inv.buyer.name)}<br>${addrLines(inv.buyer.address)}<br>SIREN ${groupSiren(inv.buyer.siren ?? "")}<br>TVA ${vatSpaced(inv.buyer.vatNumber ?? "")}</div></div>
<div class="big">${f.money(t.dueAmount)} dus le ${f.date(inv.dueDate ?? inv.issueDate)}</div>
<table class="l"><tr><th>Description</th><th class="r">Qté</th><th class="r">Prix unitaire</th><th class="r">TVA</th><th class="r">Montant</th></tr>${rows}
<tr><td colspan="4" class="r">Sous-total</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>${vat}
<tr class="b"><td colspan="4" class="r">Total</td><td class="r">${f.money(t.grandTotal)}</td></tr></table>
<div style="display:flex;gap:8mm;margin-top:10mm;align-items:center"><div class="qr"></div><div>Payer en ligne : scannez le code.<br>Virement : ${bankLine(c)}<br>Référence : ${esc(inv.payment.reference ?? "")}<br>${esc(inv.payment.termsText ?? "")}</div></div>
<p class="sm" style="margin-top:12mm;color:#697386">${esc(sellerLegal(c))}<br>${notesBlock(c)}</p>`,
  )
}

// --- C08 Utility -------------------------------------------------------------------------------
function utility(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const rows = lineRows(
    c,
    (i) => {
      const l = inv.lines[i]
      if (!l) return ""
      return `<td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)} ${unitText(l.unitCode)}</td><td class="r">${f.unit(l.unitPrice)}</td><td class="r">${f.pct(l.vatRate, true)}</td><td class="r">${f.num(t.lineNets[i] ?? 0)}</td>`
    },
    5,
  )
  const vat = vatRows(c)
    .map(
      (v) =>
        `<tr><td>${f.pct(v.rate, true)}</td><td class="r">${f.money(v.base)}</td><td class="r">${f.money(v.tax)}</td></tr>`,
    )
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:Tahoma,"DejaVu Sans",sans-serif;font-size:9pt;display:flex;min-height:297mm}
.side{width:70mm;background:#0b4f8a;color:#fff;padding:12mm 7mm;font-size:8pt}
.side .amt{font-size:17pt;font-weight:bold;margin:2mm 0 5mm}
.main{flex:1;padding:12mm 10mm}
h1{font-size:15pt;color:#0b4f8a;margin:0 0 3mm}
table.l{width:100%;margin-top:5mm}
table.l th{background:#e6eef6;text-align:left;padding:4px}
table.l td{padding:4px;border-bottom:1px solid #d3dde6}
table.l td:first-child{white-space:nowrap}
tr.d td{color:#555}
.v{width:90mm;margin-top:5mm}.v th,.v td{border:1px solid #9db6cc;padding:3px}`,
    `<div class="side"><div class="b">${esc(s.name)}</div><br>${addrLines(s.address)}<br><br>${esc(s.phone ?? "")}<br>${esc(s.email ?? "")}<br><br>Montant à payer<div class="amt">${f.money(t.dueAmount)}</div>Prélèvement le<br><b>${f.date(inv.dueDate ?? inv.issueDate)}</b><br><br>Votre contrat<br><b>${esc(inv.payment.reference ?? "")}</b></div>
<div class="main"><div style="margin-left:60mm"><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}<br>SIREN ${groupSiren(inv.buyer.siren ?? "")}<br>TVA ${esc(inv.buyer.vatNumber ?? "")}</div>
<h1>Votre facture d'électricité n° ${esc(inv.number)}</h1>
<div>Facture émise le ${f.date(inv.issueDate)}</div>
<table class="l"><tr><th>Détail</th><th class="r">Quantité</th><th class="r">Prix unitaire HT</th><th class="r">TVA</th><th class="r">Montant HT</th></tr>${rows}</table>
<table class="v"><tr><th>Taux de TVA</th><th>Base HT</th><th>Montant TVA</th></tr>${vat}</table>
<p>Total HT : <b>${f.money(t.taxBasisTotal)}</b><br>Total TVA : <b>${f.money(t.taxTotal)}</b><br>Total TTC : <b>${f.money(t.grandTotal)}</b></p>
<p>${esc(inv.payment.termsText ?? "")}.</p>
<p class="sm" style="margin-top:16mm">${sellerIds(c)}<br>${esc(sellerLegal(c))}<br>${notesBlock(c)}</p></div>`,
  )
}

// --- C10 repeated header / C11 no repeated header ----------------------------------------------
function longTable(c: Ctx, repeat: boolean): string {
  const { inv, t, f } = c
  const s = inv.seller
  const head = repeat ? `Réf. et désignation` : (c.def.extra.headerLabel ?? "Désignation")
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td class="c">${i + 1}</td><td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)}${repeat ? "" : ` ${unitText(l.unitCode)}`}</td><td class="r">${f.num(l.unitPrice)}</td><td class="r">${f.num(t.lineNets[i] ?? 0)}</td></tr>`,
    )
    .join("")
  const vat = vatRows(c)
    .map((v) => `<tr><td>TVA ${f.pct(v.rate)}</td><td class="r">${f.money(v.tax)}</td></tr>`)
    .join("")
  const headerLabel = repeat ? `${c.def.extra.headerLabel ?? "Désignation"}` : head
  return shell(
    `Facture ${inv.number}`,
    repeat
      ? `body{font-family:Arial,Helvetica,sans-serif;font-size:8.5pt;padding:12mm 12mm}
h1{font-size:14pt;margin:4mm 0}
.two{display:flex;justify-content:space-between}
table.l{width:100%;margin-top:4mm}
table.l thead{display:table-header-group}
table.l th{background:#3b3b3b;color:#fff;padding:4px;text-align:left}
table.l td{padding:3px 4px;border-bottom:1px solid #ccc}
tr{page-break-inside:avoid}
.tot{width:70mm;margin:6mm 0 0 auto}.tot td{padding:3px;border:1px solid #999}`
      : `body{font-family:Calibri,Carlito,Arial,sans-serif;font-size:10pt;padding:12mm}
h1{font-size:20pt;margin:0;color:#375623}
table.g{width:100%;margin-top:4mm}
table.g thead{display:table-row-group}
table.g th{background:#e2efda;border:1px solid #7f7f7f;padding:4px;text-align:left}
table.g td{border:1px solid #7f7f7f;padding:4px}
.tot{width:80mm;margin:6mm 0 0 auto}.tot td{padding:3px;border:1px solid #7f7f7f}
.two{display:flex;justify-content:space-between}`,
    repeat
      ? `<div class="two"><div><b>${esc(s.name)}</b><br>${addrLines(s.address)}<br>${esc(s.phone ?? "")} - ${esc(s.email ?? "")}<br>${sellerIds(c)}<br>${esc(sellerLegal(c))}</div>
<div style="width:70mm"><b>Facturé à :</b><br>${esc(inv.buyer.name)}<br>${addrLines(inv.buyer.address)}<br>SIREN ${groupSiren(inv.buyer.siren ?? "")}<br>SIRET ${groupSiret(inv.buyer.siret ?? "")}<br>Code service : ${esc(inv.buyerReference ?? "")}</div></div>
<h1>Facture ${esc(inv.number)}</h1>
<div>Date : ${f.date(inv.issueDate)} - Échéance : ${f.date(inv.dueDate ?? inv.issueDate)} - Bon de commande : ${esc(inv.orderReference ?? "")}</div>
<table class="l"><thead><tr><th>N°</th><th>${esc(headerLabel)}</th><th class="r">Qté</th><th class="r">PU HT</th><th class="r">Montant HT</th></tr></thead><tbody>${rows}</tbody></table>
<table class="tot"><tr><td>Total HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>${vat}
<tr class="b"><td>Net à payer TTC</td><td class="r">${f.money(t.grandTotal)}</td></tr></table>
<p>${esc(inv.payment.termsText ?? "")}. ${bankLine(c)}</p>
<p class="sm">${notesBlock(c)}</p>`
      : `<div class="two"><div><h1>FACTURE</h1><b>${esc(s.name)}</b><br>${addrLines(s.address)}<br>${esc(s.phone ?? "")} - ${esc(s.email ?? "")}<br>${sellerIds(c)}<br>${esc(sellerLegal(c))}</div>
<div style="width:75mm"><br><br><b>Client</b><br>${esc(inv.buyer.name)}<br>${addrLines(inv.buyer.address)}<br>SIREN ${groupSiren(inv.buyer.siren ?? "")}<br>SIRET ${groupSiret(inv.buyer.siret ?? "")}<br>TVA ${esc(inv.buyer.vatNumber ?? "")}</div></div>
<p>Facture n° <b>${esc(inv.number)}</b> du ${f.date(inv.issueDate)} - à payer avant le ${f.date(inv.dueDate ?? inv.issueDate)} - ${esc(inv.orderReference ?? "")}</p>
<table class="g"><thead><tr><th>N°</th><th>${esc(headerLabel)}</th><th class="r">Quantité</th><th class="r">Prix unitaire</th><th class="r">Total HT</th></tr></thead><tbody>${rows}</tbody></table>
<table class="tot"><tr><td>Total HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>${vat}
<tr class="b"><td>Total TTC</td><td class="r">${f.money(t.grandTotal)}</td></tr></table>
<p>${esc(inv.payment.termsText ?? "")}. Virement : ${bankLine(c)}</p>
<p class="sm">${notesBlock(c)}</p>`,
  )
}

// --- C12 Shop ----------------------------------------------------------------------------------
function shop(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const d = inv.deliveryAddress
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)}</td><td class="r">${f.num(l.unitPrice)}</td><td class="r">${f.pct(l.vatRate)}</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td></tr>`,
    )
    .join("")
  const vat = vatRows(c)
    .map((v) => `<tr><td>Dont TVA ${f.pct(v.rate)}</td><td class="r">${f.money(v.tax)}</td></tr>`)
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:Roboto,"Helvetica Neue",Arial,sans-serif;font-size:9pt;color:#333;padding:14mm}
h1{font-size:26pt;font-weight:300;margin:0 0 2mm;letter-spacing:4px}
.cols{display:flex;gap:5mm;margin:7mm 0}.cols>div{flex:1;background:#f5f5f0;padding:3mm;min-height:36mm}
.cols h3{margin:0 0 2mm;font-size:8pt;text-transform:uppercase;color:#7a7a6a}
table.l{width:100%}
table.l th{border-bottom:2px solid #333;text-align:left;padding:4px}
table.l td{padding:5px 4px;border-bottom:1px solid #ddd}
.tot{width:75mm;margin:5mm 0 0 auto}.tot td{padding:3px 4px}`,
    `<h1>FACTURE</h1><div>N° ${esc(inv.number)} - ${esc(inv.orderReference ?? "")} - Émise le ${f.date(inv.issueDate)} - Livrée le ${f.date(inv.deliveryDate ?? inv.issueDate)} - Échéance ${f.date(inv.dueDate ?? inv.issueDate)}</div>
<div class="cols"><div><h3>Vendeur</h3><b>${esc(s.name)}</b><br>${addrLines(s.address)}<br>${esc(s.phone ?? "")}<br>${esc(s.email ?? "")}</div>
<div><h3>Adresse de facturation</h3><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}<br>SIREN ${groupSiren(inv.buyer.siren ?? "")}<br>TVA ${esc(inv.buyer.vatNumber ?? "")}</div>
<div><h3>Adresse de livraison</h3>${d ? addrLines(d) : ""}</div></div>
<table class="l"><tr><th>Produit</th><th class="r">Qté</th><th class="r">Prix HT</th><th class="r">TVA</th><th class="r">Total HT</th></tr>${rows}</table>
<table class="tot"><tr><td>Sous-total HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>${vat}
<tr class="b"><td>Total TTC</td><td class="r">${f.money(t.grandTotal)}</td></tr></table>
<p>Mode de paiement : ${esc(inv.payment.termsText ?? "")}<br>${bankLine(c)}</p>
<p class="sm" style="margin-top:10mm">${sellerIds(c)}<br>${esc(sellerLegal(c))}<br>${notesBlock(c)}</p>`,
  )
}

// --- C13 Micro-entrepreneur with RIB block -----------------------------------------------------
function microRib(c: Ctx): string {
  const { inv, t, f } = c
  const s = inv.seller
  const iban = inv.payment.iban ?? ""
  const bban = iban.slice(4)
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)}</td><td class="r">${f.unit(l.unitPrice)} €</td><td class="r">${f.money(t.lineNets[i] ?? 0)}</td></tr>`,
    )
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:Helvetica,sans-serif;font-size:9pt;color:#2b2b2b;padding:14mm}
.top{display:flex;justify-content:space-between;align-items:center}
.logo{width:28mm;height:28mm;border-radius:50%;background:#e8e8e8;color:#888;display:flex;align-items:center;justify-content:center}
.qr{width:22mm;height:22mm;border:2px solid #333;background:repeating-conic-gradient(#333 0 25%,#fff 0 50%) 0 0/4mm 4mm}
h1{font-size:20pt;margin:0;color:#1f6f6b;text-align:right}
.cols{display:flex;justify-content:space-between;margin:8mm 0}
table.l{width:100%}
table.l th{background:#1f6f6b;color:#fff;padding:5px;text-align:left}
table.l td{padding:5px;border-bottom:1px solid #ccc}
.tot{width:70mm;margin:5mm 0 0 auto}.tot td{padding:3px 4px}
.foot{display:flex;gap:6mm;margin-top:14mm;border-top:2px solid #1f6f6b;padding-top:4mm;font-size:8pt}.foot>div{flex:1}
.rib td{border:1px solid #999;padding:2px 4px;white-space:nowrap}
.foot>div:last-child{flex:1.7}`,
    `<div class="top"><div class="logo">LOGO</div><div><h1>FACTURE</h1><div class="r">N° ${esc(inv.number)}<br>Date : ${f.date(inv.issueDate)}<br>Échéance : ${f.date(inv.dueDate ?? inv.issueDate)}</div></div><div class="qr"></div></div>
<div class="cols"><div><b>${esc(s.name)}</b><br>${esc(s.legalForm ?? "")}<br>${addrLines(s.address)}<br>${esc(s.phone ?? "")}<br>${esc(s.email ?? "")}<br>SIREN ${groupSiren(s.siren ?? "")}<br>SIRET ${groupSiret(s.siret ?? "")}</div>
<div style="width:70mm"><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}<br>SIREN ${groupSiren(inv.buyer.siren ?? "")}<br>SIRET ${groupSiret(inv.buyer.siret ?? "")}<br>TVA ${esc(inv.buyer.vatNumber ?? "")}</div></div>
<table class="l"><tr><th>Désignation</th><th class="r">Quantité</th><th class="r">Prix unitaire</th><th class="r">Montant</th></tr>${rows}</table>
<table class="tot"><tr><td>Total HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr><tr><td>TVA</td><td class="r">${f.money(t.taxTotal)}</td></tr>
<tr class="b"><td>Net à payer</td><td class="r">${f.money(t.grandTotal)}</td></tr></table>
<p><b>${esc(inv.vatExemptionReason ?? "")}</b></p>
<p class="sm" style="margin-top:8mm">${notesBlock(c)}</p>
<div class="foot"><div><b>Paiement</b><br>${esc(inv.payment.termsText ?? "")}</div>
<div><b>Mentions légales</b><br>${esc(s.registration ?? "")}</div>
<div><b>Relevé d'identité bancaire</b><table class="rib"><tr><td>Code banque</td><td>${bban.slice(0, 5)}</td><td>Code guichet</td><td>${bban.slice(5, 10)}</td></tr><tr><td>N° de compte</td><td>${bban.slice(10, 21)}</td><td>Clé RIB</td><td>${bban.slice(21)}</td></tr><tr><td>IBAN</td><td colspan="3">${groupIban(iban)}</td></tr><tr><td>BIC</td><td colspan="3">${esc(inv.payment.bic ?? "")}</td></tr></table></div></div>`,
  )
}

// --- C14 Plumber / long names ------------------------------------------------------------------
function plumber(c: Ctx): string {
  const { inv, t, f, def } = c
  const s = inv.seller
  const rows = lineRows(
    c,
    (i) => {
      const l = inv.lines[i]
      if (!l) return ""
      return `<td>${esc(l.name)}</td><td class="r">${f.qty(l.quantity)} ${unitText(l.unitCode)}</td><td class="r">${f.num(l.unitPrice)}</td><td class="r">${f.pct(l.vatRate)}</td><td class="r">${f.num(t.lineNets[i] ?? 0)}</td>`
    },
    5,
  )
  const vat = vatRows(c)
    .map(
      (v) =>
        `<tr><td>TVA ${f.pct(v.rate)} sur ${f.money(v.base)}</td><td class="r">${f.money(v.tax)}</td></tr>`,
    )
    .join("")
  return shell(
    `Facture ${inv.number}`,
    `body{font-family:Helvetica,sans-serif;font-size:9.5pt;padding:14mm;position:relative}
.stamp{position:absolute;top:92mm;right:22mm;transform:rotate(-14deg);border:3px solid #b3261e;color:#b3261e;font-size:22pt;font-weight:bold;padding:2mm 6mm;opacity:.75;letter-spacing:3px}
.cols{display:flex;gap:10mm}.cols>div{flex:1}
h1{font-size:17pt;margin:8mm 0 2mm}
table.l{width:100%;margin-top:4mm}
table.l th{border-top:2px solid #333;border-bottom:2px solid #333;padding:4px;text-align:left}
table.l td{padding:4px}
tr.d td{color:#555}
.tot{width:85mm;margin:5mm 0 0 auto}.tot td{padding:3px 4px;border-bottom:1px solid #ccc}`,
    `<div><b style="font-size:11pt">${esc(s.name)}</b><br>${addrLines(s.address)}<br>Tél. ${esc(s.phone ?? "")} - ${esc(s.email ?? "")}<br>${sellerIds(c, true)}<br>${esc(sellerLegal(c))}</div>
<div style="border:1px solid #333;padding:3mm;margin-top:6mm"><b>Destinataire :</b><br><b>${esc(inv.buyer.name)}</b><br>${addrLines(inv.buyer.address)}<br>SIREN ${groupSiren(inv.buyer.siren ?? "")}<br>SIRET ${groupSiret(inv.buyer.siret ?? "")}</div>
<div class="stamp">${esc(def.extra.stamp ?? "")}</div>
<h1>Facture n° ${esc(inv.number)}</h1>
<div>Date de facture : ${f.date(inv.issueDate)}<br>Travaux réalisés le : ${f.date(inv.deliveryDate ?? inv.issueDate)}<br>Date limite de règlement : ${f.date(inv.dueDate ?? inv.issueDate)}<br>${esc(inv.orderReference ?? "")} - Code service : ${esc(inv.buyerReference ?? "")}</div>
<table class="l"><tr><th>Désignation des travaux</th><th class="r">Quantité</th><th class="r">Prix unitaire HT</th><th class="r">TVA</th><th class="r">Total HT</th></tr>${rows}</table>
<table class="tot"><tr><td>Total HT</td><td class="r">${f.money(t.taxBasisTotal)}</td></tr>${vat}
<tr class="b"><td>Total TTC</td><td class="r">${f.money(t.grandTotal)}</td></tr></table>
<p>Option pour le paiement de la TVA d'après les débits.<br>${esc(inv.payment.termsText ?? "")}. Virement : ${bankLine(c)}</p>
<p class="sm">${notesBlock(c)}</p>`,
  )
}

export const HTML_TEMPLATES: Partial<Record<TemplateId, (c: Ctx) => string>> = {
  odoo,
  memoire,
  situation,
  acompte,
  saas,
  utility,
  repeatedHeader: (c) => longTable(c, true),
  plainGrid: (c) => longTable(c, false),
  shop,
  microRib,
  plumber,
}
