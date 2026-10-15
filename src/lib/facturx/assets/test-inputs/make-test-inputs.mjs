// Dev-time generator for the embed test inputs (not bundled, not run by the tests).
//
//   bun src/lib/facturx/assets/test-inputs/make-test-inputs.mjs
//
// Produces, next to this file:
//   chromium-invoice.pdf        Chromium print-to-PDF of invoice.html (embedded TrueType subsets)
//   chromium-multipage.pdf      same invoice with 120 lines (several pages)
//   chromium-linearized.pdf     chromium-invoice.pdf linearized by qpdf (needs `qpdf` on PATH)
//   chromium-objstreams.pdf     chromium-invoice.pdf rewritten with object streams by qpdf
//   encrypted.pdf               chromium-invoice.pdf with AES-256, empty user password (qpdf)
//   truetype-embedded.pdf       pdf-lib document with an embedded DejaVu Sans subset; needs
//                               @cantoo/fontkit (not a project dependency) resolvable through
//                               NODE_PATH and DEJAVU_TTF pointing to DejaVuSans.ttf.
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { chromium } from "@playwright/test"

const dir = import.meta.dirname
const html = readFileSync(resolve(dir, "invoice.html"), "utf8")

const line =
  '<tr><td>Développement application web</td><td class="num">3</td><td>jour</td><td class="num">500,00 €</td><td class="num">20 %</td><td class="num">1 500,00 €</td></tr>'
const longHtml = html.replace(
  /<tbody id="lines">[\s\S]*?<\/tbody>/,
  `<tbody id="lines">${line.repeat(120)}</tbody>`,
)

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, content] of [
  ["chromium-invoice.pdf", html],
  ["chromium-multipage.pdf", longHtml],
]) {
  await page.setContent(content)
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "15mm", bottom: "15mm", left: "15mm", right: "15mm" },
  })
  writeFileSync(resolve(dir, name), pdf)
  console.log(`wrote ${name}`)
}
await browser.close()

const qpdf = (args) => {
  const run = spawnSync("qpdf", args, { encoding: "utf8" })
  if (run.error || (run.status ?? 0) > 2) console.warn(`qpdf failed: ${run.stderr || run.error}`)
}
qpdf(["--linearize", resolve(dir, "chromium-invoice.pdf"), resolve(dir, "chromium-linearized.pdf")])
qpdf([
  "--object-streams=generate",
  resolve(dir, "chromium-invoice.pdf"),
  resolve(dir, "chromium-objstreams.pdf"),
])

qpdf([
  "--encrypt",
  "",
  "owner",
  "256",
  "--print=none",
  "--",
  resolve(dir, "chromium-invoice.pdf"),
  resolve(dir, "encrypted.pdf"),
])

try {
  const { PDFDocument, rgb } = await import("@cantoo/pdf-lib")
  const fontkit = (await import("@cantoo/fontkit")).default
  const ttf = process.env.DEJAVU_TTF
  if (!ttf) throw new Error("DEJAVU_TTF is not set")
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(readFileSync(ttf), { subset: true })
  const p = doc.addPage([595.28, 841.89])
  p.drawText("Facture FA-2026-0042", { x: 50, y: 780, size: 20, font, color: rgb(0.12, 0.3, 0.55) })
  p.drawText("Atelier Dupont SAS — 12 rue de la Paix, 75002 Paris", {
    x: 50,
    y: 750,
    size: 11,
    font,
  })
  p.drawText("Développement application web : 3 jours × 500,00 € = 1 500,00 € HT", {
    x: 50,
    y: 700,
    size: 11,
    font,
  })
  p.drawText("TVA 20 % : 300,00 € — Total TTC : 1 800,00 €", { x: 50, y: 680, size: 11, font })
  writeFileSync(resolve(dir, "truetype-embedded.pdf"), await doc.save())
  console.log("wrote truetype-embedded.pdf")
} catch (e) {
  console.warn(`skipped truetype-embedded.pdf: ${e instanceof Error ? e.message : e}`)
}
