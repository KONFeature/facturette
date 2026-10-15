/**
 * Regenerates the BLIND evaluation set in fixtures/blind/ (PDFs, *.expected.json, manifest.json,
 * README.md). Usage: `bun scripts/make-blind-fixtures.ts`.
 *
 * expected.json, manifest.json and README.md are byte-identical across runs. PDFs get fixed
 * metadata dates; Chromium-rendered ones depend on the fonts installed on the machine.
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PDFDocument } from "@cantoo/pdf-lib"
import { chromium } from "@playwright/test"
import { invoiceSchema } from "../src/domain/invoice"
import { computeTotals } from "../src/domain/totals"
import { type BlindDef, type BlindFormats, makeCtx } from "./blind-templates/common"
import { BLIND } from "./blind-templates/data"
import { HTML_TEMPLATES } from "./blind-templates/html"
import { renderDolibarr, renderTimes } from "./blind-templates/pdflib"
import { printedPaths, textLeafPaths } from "./fixtures-templates/paths"

export const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/blind",
)

const FIXED_DATE = new Date("2026-10-16T08:00:00Z")

export interface BlindManifestEntry {
  file: string
  expected: string
  /** Invoice dot-paths whose value is visible as text in the PDF. */
  printed: string[]
  tags: string[]
  /** How dates and numbers are written in the PDF. */
  formats: BlindFormats
  pages: number
}

type Browser = Awaited<ReturnType<typeof chromium.launch>>

async function normalise(bytes: Uint8Array, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  doc.setCreationDate(FIXED_DATE)
  doc.setModificationDate(FIXED_DATE)
  doc.setTitle(title)
  doc.setProducer("Facturette blind fixtures (Chromium)")
  doc.setCreator("Facturette blind fixtures")
  return doc.save({ useObjectStreams: false })
}

async function renderPdf(browser: Browser, def: BlindDef): Promise<Uint8Array> {
  const c = makeCtx(def)
  if (def.template === "dolibarr") return renderDolibarr(c)
  if (def.template === "times") return renderTimes(c)
  const render = HTML_TEMPLATES[def.template]
  if (!render) throw new Error(`No template for ${def.template}`)
  const page = await browser.newPage()
  await page.setContent(render(c), { waitUntil: "load" })
  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true })
  await page.close()
  return normalise(pdf, `${def.invoice.typeCode === "381" ? "Avoir" : "Facture"} ${def.invoice.number}`)
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

export function printedOf(def: BlindDef): string[] {
  return printedPaths(def.invoice, def.hidden)
}

function readme(entries: { def: BlindDef; entry: BlindManifestEntry }[]): string {
  const rows = entries
    .map(
      ({ def, entry }) =>
        `### ${entry.file}\n\n**${def.title}**\n\n- Imite : ${def.imitates}\n- ${def.description}\n- Tags : ${def.tags.join(", ")}\n- Pages : ${entry.pages}${def.nonEmbeddedFont ? "\n- Police standard **non incorporée** (aucun FontFile)" : ""}\n- Formats : dates \`${entry.formats.date}\`, nombres séparateur de milliers « ${entry.formats.number.thousands} », décimale « ${entry.formats.number.decimal} », devise \`${entry.formats.number.currency}\`\n- Champs imprimés : ${entry.printed.length} / ${textLeafPaths(def.invoice).length} (non imprimés : ${def.hidden.length ? def.hidden.join(", ") : "aucun"})\n`,
    )
    .join("\n")
  return `# Jeu d'évaluation en aveugle (fictif)

Factures PDF « réalistes » écrites **indépendamment** de l'extracteur : mises en page et
vocabulaire inspirés d'outils et de modèles français courants, avec vérité terrain exacte.
Elles n'ont jamais servi à régler l'extraction : elles mesurent la précision hors échantillon.
**Toutes les données sont fictives** (sociétés, personnes, adresses, e-mails en \`.example\`,
téléphones en plages réservées). Les identifiants sont valides : SIREN/SIRET (Luhn), clé de TVA
française, IBAN (mod 97).

Fichiers (générés par \`bun scripts/make-blind-fixtures.ts\`, ne pas éditer à la main) :

- \`Bnn-slug.pdf\`, \`Bnn-slug.expected.json\` (type \`Invoice\`), \`manifest.json\` (même schéma que
  \`fixtures/invoices/manifest.json\` : \`{ file, expected, printed, tags, formats, pages }\`).
- Convention des avoirs : montants positifs et \`typeCode: "381"\` dans \`expected.json\`, montants
  imprimés en négatif dans le PDF.
- Lignes négatives (acompte, remise commerciale) : \`unitPrice\` négatif dans \`expected.json\`.
- Quand une remise % par ligne est imprimée (B07), \`unitPrice\` est le prix **net** et n'est pas listé
  dans \`printed\` ; le prix brut et le taux de remise sont seuls visibles.
- \`formats.number.currency\` : \`prefix\` désigne ici « €1,200.00 » (sans espace) pour B06.

${rows}`
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const entries: { def: BlindDef; entry: BlindManifestEntry }[] = []
  try {
    for (const def of BLIND) {
      invoiceSchema.parse(def.invoice)
      computeTotals(def.invoice)
      const bytes = await renderPdf(browser, def)
      const file = `${def.slug}.pdf`
      const expected = `${def.slug}.expected.json`
      await writeFile(path.join(OUT_DIR, file), bytes)
      await writeFile(path.join(OUT_DIR, expected), json(def.invoice))
      const pages = (await PDFDocument.load(bytes)).getPageCount()
      entries.push({
        def,
        entry: { file, expected, printed: printedOf(def), tags: def.tags, formats: def.formats, pages },
      })
      console.log(`${file}  ${(bytes.length / 1024).toFixed(1)} KB  ${pages} p`)
    }
  } finally {
    await browser.close()
  }
  await writeFile(path.join(OUT_DIR, "manifest.json"), json(entries.map((e) => e.entry)))
  await writeFile(path.join(OUT_DIR, "README.md"), readme(entries))
}

if (import.meta.main) await main()
