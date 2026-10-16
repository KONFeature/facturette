/**
 * Regenerates the SECOND blind evaluation set in fixtures/blind2/ (PDFs, *.expected.json,
 * manifest.json, README.md). Usage: `bun scripts/make-blind2-fixtures.ts`.
 *
 * expected.json, manifest.json and README.md are byte-identical across runs. PDFs get fixed
 * metadata dates; Chromium-rendered ones depend on the fonts installed on the machine.
 */
import { spawnSync } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PDFDocument } from "@cantoo/pdf-lib"
import { chromium } from "@playwright/test"
import { invoiceSchema } from "../src/domain/invoice"
import { computeTotals } from "../src/domain/totals"
import { type Blind2Def, type Blind2Formats, makeCtx } from "./blind2-templates/common"
import { BLIND2 } from "./blind2-templates/data"
import { HTML_TEMPLATES } from "./blind2-templates/html"
import { renderAvoir, renderGarage, renderNoteHonoraires } from "./blind2-templates/pdflib"
import { printedPaths, textLeafPaths } from "./fixtures-templates/paths"

export const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/blind2",
)

const FIXED_DATE = new Date("2026-10-16T08:00:00Z")

export interface Blind2ManifestEntry {
  file: string
  expected: string
  /** Invoice dot-paths whose value is visible as text in the PDF. */
  printed: string[]
  tags: string[]
  /** How dates and numbers are written in the PDF. */
  formats: Blind2Formats
  pages: number
}

type Browser = Awaited<ReturnType<typeof chromium.launch>>

async function normalise(bytes: Uint8Array, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  doc.setCreationDate(FIXED_DATE)
  doc.setModificationDate(FIXED_DATE)
  doc.setTitle(title)
  doc.setProducer("Facturette blind2 fixtures (Chromium)")
  doc.setCreator("Facturette blind2 fixtures")
  return doc.save({ useObjectStreams: false })
}

async function renderPdf(browser: Browser, def: Blind2Def): Promise<Uint8Array> {
  const c = makeCtx(def)
  if (def.template === "noteHonoraires") return renderNoteHonoraires(c)
  if (def.template === "avoir") return renderAvoir(c)
  if (def.template === "garage") return renderGarage(c)
  const render = HTML_TEMPLATES[def.template]
  if (!render) throw new Error(`No template for ${def.template}`)
  const page = await browser.newPage()
  await page.setContent(render(c), { waitUntil: "load" })
  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true })
  await page.close()
  return normalise(pdf, `Facture ${def.invoice.number}`)
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

export function printedOf(def: Blind2Def): string[] {
  return printedPaths(def.invoice, def.hidden)
}

function readme(entries: { def: Blind2Def; entry: Blind2ManifestEntry }[]): string {
  const rows = entries
    .map(
      ({ def, entry }) =>
        `### ${entry.file}\n\n**${def.title}**\n\n- Imite : ${def.imitates}\n- ${def.description}\n- Tags : ${def.tags.join(", ")}\n- Pages : ${entry.pages}${def.nonEmbeddedFont ? "\n- Police standard **non incorporée** (aucun FontFile)" : ""}\n- Formats : dates \`${entry.formats.date}\` (ex. ${exampleDate(def)}), nombres séparateur de milliers « ${entry.formats.number.thousands} », décimale « ${entry.formats.number.decimal} », devise \`${entry.formats.number.currency}\`${def.extra.trimZeros ? ", montants entiers sans décimales" : ""}\n- Champs imprimés : ${entry.printed.length} / ${textLeafPaths(def.invoice).length} (non imprimés : ${def.hidden.length ? def.hidden.join(", ") : "aucun"})\n`,
    )
    .join("\n")
  return `# Deuxième jeu d'évaluation en aveugle (fictif)

Factures PDF « réalistes » écrites **indépendamment** de l'extracteur et **différentes** des jeux
\`fixtures/invoices\` et \`fixtures/blind\` (mises en page, vocabulaire, montants, identifiants). Ce jeu
n'a jamais servi à régler l'extraction : c'est le test hors échantillon, à ne lancer qu'après le
réglage sur les deux autres jeux.
**Toutes les données sont fictives** (sociétés, personnes, adresses, e-mails en \`.example\`,
téléphones en plages réservées). Les identifiants sont valides : SIREN/SIRET (Luhn), clé de TVA
française, IBAN (mod 97).

Fichiers (générés par \`bun scripts/make-blind2-fixtures.ts\`, ne pas éditer à la main) :

- \`Cnn-slug.pdf\`, \`Cnn-slug.expected.json\` (type \`Invoice\`), \`manifest.json\` (même schéma que
  \`fixtures/blind/manifest.json\` : \`{ file, expected, printed, tags, formats, pages }\`).
- **Nouveauté de \`formats.date\`** : en plus de \`dmy\`, \`iso\`, \`long\`, ce jeu utilise \`dot\`
  (15.10.2026), \`dash\` (15-10-2026), \`slash-iso\` (2026/10/15), \`abbr\` (15 oct. 2026),
  \`weekday-long\` (lundi 5 octobre 2026) et \`dmy-short\` (15/10/26). \`long\` écrit « 1er » pour le 1.
- \`formats.number.thousands\` peut valoir une espace insécable (U+00A0) ou fine insécable (U+202F).
- C05 imprime les montants entiers sans décimales (« 2 835 € ») : ce n'est pas décrit dans
  \`formats\`, seulement ici.
- Convention des avoirs : montants positifs et \`typeCode: "381"\` dans \`expected.json\`, montants
  imprimés en négatif dans le PDF.
- Lignes négatives (remise, code promo) : \`unitPrice\` négatif dans \`expected.json\`.
- Facture de situation (C04) : \`unitPrice\` = montant de la situation, quantité 1 non imprimée
  (listée dans les champs non imprimés).
- Prélèvement (C08) : aucun IBAN imprimé (celui du client), donc aucun \`payment.iban\` attendu.

${rows}`
}

function exampleDate(def: Blind2Def): string {
  return makeCtx(def).f.date("2026-10-05")
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const entries: { def: Blind2Def; entry: Blind2ManifestEntry }[] = []
  try {
    for (const def of BLIND2) {
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
        entry: {
          file,
          expected,
          printed: printedOf(def),
          tags: def.tags,
          formats: def.formats,
          pages,
        },
      })
      console.log(`${file}  ${(bytes.length / 1024).toFixed(1)} KB  ${pages} p`)
    }
  } finally {
    await browser.close()
  }
  const manifestPath = path.join(OUT_DIR, "manifest.json")
  await writeFile(manifestPath, json(entries.map((e) => e.entry)))
  // Same compact array style as the repo formatter, so `bun run check` stays green.
  spawnSync("bunx", ["biome", "format", "--write", manifestPath], { stdio: "ignore" })
  await writeFile(path.join(OUT_DIR, "README.md"), readme(entries))
}

if (import.meta.main) await main()
