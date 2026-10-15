/**
 * Regenerates the fixture corpus in fixtures/invoices/ (PDFs, *.expected.json, manifest.json,
 * README.md). Usage: `bun scripts/make-fixtures.ts`.
 *
 * Deterministic: expected.json, manifest.json and README.md are byte-identical across runs; PDFs
 * get fixed metadata dates and are post-processed to be reproducible on the same machine
 * (system fonts differ between machines, so PDFs may differ across OSes).
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PDFDocument } from "@cantoo/pdf-lib"
import { chromium } from "@playwright/test"
import { invoiceSchema } from "../src/domain/invoice"
import { computeTotals } from "../src/domain/totals"
import { FIXTURES, type FixtureDef, type HtmlOptions } from "./fixtures-templates/data"
import { renderHtml } from "./fixtures-templates/html"
import { printedPaths, textLeafPaths } from "./fixtures-templates/paths"
import { renderPdfLib } from "./fixtures-templates/pdflib"

export const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/invoices",
)

const FIXED_DATE = new Date("2026-10-16T08:00:00Z")

export interface ManifestEntry {
  file: string
  expected: string
  /** Invoice dot-paths whose value is visible as text in the PDF. */
  printed: string[]
  tags: string[]
  /** How dates and numbers are written in the PDF. */
  formats: FixtureDef["formats"]
  /** Pages in the PDF. */
  pages: number
}

type Browser = Awaited<ReturnType<typeof chromium.launch>>

/** Chromium output with normalised metadata so the bytes do not depend on the run time. */
async function normalise(bytes: Uint8Array, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  doc.setCreationDate(FIXED_DATE)
  doc.setModificationDate(FIXED_DATE)
  doc.setTitle(title)
  doc.setProducer("Facturette fixtures (Chromium)")
  doc.setCreator("Facturette fixtures")
  return doc.save({ useObjectStreams: false })
}

async function renderChromiumPdf(browser: Browser, html: string, title: string) {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: "load" })
  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true })
  await page.close()
  return normalise(pdf, title)
}

/** Rasterise the HTML and wrap the picture in a PDF page: no text layer at all. */
async function renderImageOnlyPdf(browser: Browser, html: string, o: HtmlOptions) {
  void o
  const page = await browser.newPage({
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: 1.6,
  })
  await page.setContent(html, { waitUntil: "load" })
  const jpg = await page.screenshot({ type: "jpeg", quality: 62, fullPage: false })
  await page.close()
  const doc = await PDFDocument.create()
  doc.setCreationDate(FIXED_DATE)
  doc.setModificationDate(FIXED_DATE)
  doc.setProducer("Facturette fixtures (scan simulation)")
  doc.setTitle("Scan")
  const img = await doc.embedJpg(jpg)
  const p = doc.addPage([595.28, 841.89])
  p.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 })
  return doc.save({ useObjectStreams: false })
}

async function renderPdf(browser: Browser, def: FixtureDef): Promise<Uint8Array> {
  const { recipe } = def
  if (recipe.kind === "pdflib") return renderPdfLib(def)
  const html = renderHtml(def, recipe.options)
  if (recipe.kind === "image") return renderImageOnlyPdf(browser, html, recipe.options)
  return renderChromiumPdf(
    browser,
    html,
    `${recipe.options.labels.title ?? "Facture"} ${def.invoice.number}`,
  )
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

function readme(entries: { def: FixtureDef; entry: ManifestEntry }[]): string {
  const rows = entries
    .map(
      ({ def, entry }) =>
        `### ${entry.file}\n\n**${def.title}**. ${def.description}\n\n- Tags : ${def.tags.join(", ")}\n- Pages : ${entry.pages}\n- Champs imprimés : ${entry.printed.length} / ${textLeafPaths(def.invoice).length} (non imprimés : ${def.hidden.length ? def.hidden.join(", ") : "aucun"})\n`,
    )
    .join("\n")
  return `# Factures de test (fictives)

Corpus de factures PDF « classiques » avec vérité terrain exacte, pour évaluer l'extraction et
tester le flux complet. **Toutes les données sont fictives** (sociétés, personnes, coordonnées
inventées ; numéros de téléphone en plages réservées à la fiction, e-mails en \`.example\`).
Les identifiants sont néanmoins valides : SIREN/SIRET (Luhn), clé de TVA française, IBAN (mod 97).

Fichiers (générés par \`bun scripts/make-fixtures.ts\`, ne pas éditer à la main) :

- \`NN-slug.pdf\` : la facture ;
- \`NN-slug.expected.json\` : vérité terrain au format \`Invoice\` (\`src/domain/invoice.ts\`) ;
- \`manifest.json\` : pour chaque fixture \`{ file, expected, printed, tags, formats, pages }\`.
  \`printed\` liste les chemins de l'\`Invoice\` réellement **visibles comme texte** dans le PDF ;
  les autres champs existent dans \`expected.json\` mais l'utilisateur devrait les saisir.
  Les codes (type, devise, catégorie de TVA, code unité, moyen de paiement, pays) ne sont jamais
  listés : ils ne sont pas imprimés tels quels.

Convention des avoirs : \`expected.json\` contient des montants positifs et \`typeCode: "381"\` ;
le PDF imprime les montants en négatif.

${rows}`
}

async function countPages(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount()
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const entries: { def: FixtureDef; entry: ManifestEntry }[] = []
  try {
    for (const def of FIXTURES) {
      invoiceSchema.parse(def.invoice)
      computeTotals(def.invoice)
      const bytes = await renderPdf(browser, def)
      const file = `${def.slug}.pdf`
      const expected = `${def.slug}.expected.json`
      await writeFile(path.join(OUT_DIR, file), bytes)
      await writeFile(path.join(OUT_DIR, expected), json(def.invoice))
      entries.push({
        def,
        entry: {
          file,
          expected,
          printed: def.recipe.kind === "image" ? [] : printedPaths(def.invoice, def.hidden),
          tags: def.tags,
          formats: def.formats,
          pages: await countPages(bytes),
        },
      })
      console.log(`${file}  ${(bytes.length / 1024).toFixed(1)} KB`)
    }
  } finally {
    await browser.close()
  }
  await writeFile(path.join(OUT_DIR, "manifest.json"), json(entries.map((e) => e.entry)))
  await writeFile(path.join(OUT_DIR, "README.md"), readme(entries))
}

if (import.meta.main) await main()
