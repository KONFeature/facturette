/** HTML/CSS templates (rendered to PDF by Chromium). One parametrised layout family. */
import {
  type Content,
  deliveryLines,
  legalLines,
  makeContent,
  metaRows,
  partyLines,
  paymentLines,
  totalRows,
  unitLabel,
} from "./content"
import type { FixtureDef, HtmlOptions } from "./data"
import { formatNumber } from "./format"

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const rows = (lines: string[]): string => lines.map((l) => `<div>${esc(l)}</div>`).join("")

function css(o: HtmlOptions): string {
  return `
@page { size: A4; margin: 14mm 14mm ${o.bank === "footer" ? "30mm" : "14mm"} 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: ${o.font}; font-size: 12px; color: #1b1b1b; line-height: 1.4; }
:root { --accent: ${o.accent}; }
h1 { margin: 0; font-size: 26px; color: var(--accent); }
.head { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
.band { background: var(--accent); color: #fff; padding: 14px 18px; margin: 0 0 18px; display: flex; justify-content: space-between; align-items: baseline; }
.band h1 { color: #fff; }
.seller-name, .name { font-weight: 700; font-size: 14px; }
.right { text-align: right; }
.logo { display: inline-block; width: 54px; height: 54px; border-radius: 50%; background: var(--accent); color: #fff; font-weight: 700; font-size: 20px; line-height: 54px; text-align: center; margin-bottom: 6px; }
.meta td { padding: 1px 10px 1px 0; border: 0; }
.meta td:first-child { color: #666; }
.parties { display: flex; gap: 20px; margin: 0 0 22px; }
.box { border: 1px solid #bbb; border-radius: 4px; padding: 10px 14px; min-width: 230px; }
.box h3, .section h3 { margin: 0 0 6px; font-size: 10px; text-transform: uppercase; color: var(--accent); }
table.items { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
table.items th { background: var(--accent); color: #fff; text-align: left; padding: 6px 8px; font-size: 11px; }
table.items td { padding: 6px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
table.items tr { page-break-inside: avoid; }
.num { text-align: right; white-space: nowrap; }
.desc { color: #666; font-size: 11px; }
${o.zebra ? "table.items tbody tr:nth-child(even) td { background: #f3f3f3; }" : ""}
.totals { margin-left: auto; width: 290px; border-collapse: collapse; page-break-inside: avoid; }
.totals td { padding: 4px 8px; }
.totals .strong td { font-weight: 700; border-top: 2px solid var(--accent); font-size: 14px; }
.summary { border-collapse: collapse; margin: 0 0 12px; font-size: 11px; page-break-inside: avoid; }
.summary th, .summary td { border: 1px solid #bbb; padding: 3px 10px; }
.summary th { background: #eee; }
.section { margin-top: 18px; page-break-inside: avoid; }
.legal { font-size: 10.5px; color: #444; margin-top: 12px; }
.legal div { margin-bottom: 3px; }
footer.bank { position: fixed; left: 0; right: 0; bottom: -22mm; border-top: 2px solid var(--accent); padding-top: 6px; font-size: 11px; display: flex; gap: 28px; }
${o.css ?? ""}
`
}

function itemsTable(c: Content): string {
  const showVat = c.inv.lines.some((l) => l.vatCategory === "S")
  const body = c.inv.lines
    .map((l, i) => {
      const net = c.totals.lineNets[i] ?? 0
      const desc =
        l.description && c.show(`lines.${i}.description`)
          ? `<div class="desc">${esc(l.description)}</div>`
          : ""
      const rate =
        l.vatCategory === "S" ? `${esc(formatNumber(l.vatRate, c.formats.number))} %` : "—"
      return `<tr><td>${esc(l.name)}${desc}</td>
<td class="num">${esc(c.qty(l.quantity))} ${esc(unitLabel(l.unitCode))}</td>
<td class="num">${esc(c.money(l.unitPrice))}</td>
${showVat ? `<td class="num">${rate}</td>` : ""}
<td class="num">${esc(c.money(net))}</td></tr>`
    })
    .join("\n")
  return `<table class="items"><thead><tr><th>Désignation</th><th class="num">Quantité</th>
<th class="num">Prix unitaire HT</th>${showVat ? '<th class="num">TVA</th>' : ""}<th class="num">Montant HT</th></tr></thead>
<tbody>${body}</tbody></table>`
}

function vatSummary(c: Content): string {
  const body = c.totals.vatBreakdown
    .map(
      (v) =>
        `<tr><td>${esc(formatNumber(v.rate, c.formats.number))} %</td><td class="num">${esc(c.money(v.taxableAmount))}</td><td class="num">${esc(c.money(v.taxAmount))}</td></tr>`,
    )
    .join("")
  return `<table class="summary"><thead><tr><th>Taux de TVA</th><th>Base HT</th><th>Montant TVA</th></tr></thead><tbody>${body}</tbody></table>`
}

function metaTable(c: Content): string {
  return `<table class="meta">${metaRows(c)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`)
    .join("")}</table>`
}

function header(c: Content, o: HtmlOptions): string {
  const seller = `<div class="seller-name">${esc(c.inv.seller.name)}</div>${rows(partyLines(c, "seller").slice(1))}`
  const buyer = `<div class="box"><h3>${esc(c.labels.buyer)}</h3><div class="name">${esc(c.inv.buyer.name)}</div>${rows(partyLines(c, "buyer").slice(1))}</div>`
  const del = deliveryLines(c)
  const delivery = del.length
    ? `<div class="box"><h3>${esc(c.labels.delivery)}</h3>${rows(del)}</div>`
    : ""
  switch (o.header) {
    case "right":
      return `<div class="head"><div><span class="logo">${esc(o.logo ?? "")}</span><h1>${esc(c.labels.title)}</h1></div>
<div class="right">${seller}</div></div>
<div class="parties">${buyer}${delivery}<div style="margin-left:auto">${metaTable(c)}</div></div>`
    case "band":
      return `<div class="band"><h1>${esc(c.labels.title)}</h1><span>${esc(c.inv.seller.name)}</span></div>
<div class="head"><div>${seller}</div><div>${metaTable(c)}</div></div>
<div class="parties">${buyer}${delivery}</div>`
    case "plain":
      return `<div class="head"><div>${seller}</div><div class="right"><h1>${esc(c.labels.title)}</h1></div></div>
${metaTable(c)}<div class="parties" style="margin-top:18px">${buyer}${delivery}</div>`
    default:
      return `<div class="head"><div>${seller}</div><div><h1>${esc(c.labels.title)}</h1>${metaTable(c)}</div></div>
<div class="parties" style="justify-content:flex-end">${buyer}${delivery}</div>`
  }
}

export function renderHtml(def: FixtureDef, o: HtmlOptions): string {
  const c = makeContent(def, o.labels, o.groupIds)
  const pay = paymentLines(c)
  const totals = totalRows(c, o.vatSummary)
    .map(
      (r) =>
        `<tr class="${r.strong ? "strong" : ""}"><td>${esc(r.label)}</td><td class="num">${esc(r.value)}</td></tr>`,
    )
    .join("")
  const bankBlock =
    o.bank === "box"
      ? `<div class="box section"><h3>Règlement par virement</h3>${rows(pay.bank)}</div>`
      : o.bank === "inline"
        ? `<div class="section">${esc(pay.bank.join(" – "))}</div>`
        : `<footer class="bank">${pay.bank.map((l) => `<span>${esc(l)}</span>`).join("")}</footer>`
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(c.labels.title)} ${esc(c.inv.number)}</title>
<style>${css(o)}</style></head><body>
${header(c, o)}
${itemsTable(c)}
${o.vatSummary ? vatSummary(c) : ""}
<table class="totals"><tbody>${totals}</tbody></table>
<div class="section">${rows(pay.terms)}</div>
${bankBlock}
<div class="legal">${rows(legalLines(c))}</div>
</body></html>`
}
