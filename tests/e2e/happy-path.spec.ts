import { readFileSync } from "node:fs"
import { extractPdfText } from "../../src/lib/pdf/extract-text"
import {
  downloadResult,
  expect,
  expectedFilename,
  expectedTotals,
  fillMissingFromExpected,
  generate,
  importToReview,
  normSpaces,
  readEmbeddedXml,
  readFixture,
  recapValue,
  test,
  validateDownloaded,
  xmlFacts,
} from "./helpers"

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })
const money = (n: number) => normSpaces(euro.format(n))

const CASES = [
  ["01", "franchise TVA"],
  ["02", "SARL, trois lignes"],
  ["03", "multi-taux"],
  ["04", "deux pages"],
  ["05", "avoir"],
  ["06", "client particulier"],
  ["11", "acompte déjà versé"],
] as const

/** Text of every page, joined, to compare the visual before and after embedding. */
async function pageTexts(bytes: Uint8Array): Promise<{ pages: number; text: string[] }> {
  const doc = await extractPdfText(bytes.slice())
  return {
    pages: doc.pages.length,
    text: doc.pages.map((p) => p.lines.map((l) => l.text).join("\n")),
  }
}

for (const [id, label] of CASES) {
  test(`${id} ${label}: import → review → Factur-X VALID`, async ({ page }, testInfo) => {
    const fixture = readFixture(id)
    const started = Date.now()
    await importToReview(page, fixture.pdfPath)
    console.log(`[timing ${id}] import → review ${Date.now() - started} ms`)

    await fillMissingFromExpected(page, fixture)
    await generate(page)

    // Recap totals equal the domain totals of the ground truth.
    const totals = expectedTotals(fixture.expected)
    expect(await recapValue(page, "Total HT")).toBe(money(totals.taxBasisTotal))
    expect(await recapValue(page, "TVA")).toBe(money(totals.taxTotal))
    expect(await recapValue(page, "Total TTC")).toBe(money(totals.grandTotal))
    expect(await recapValue(page, "Net à payer")).toBe(money(totals.dueAmount))
    if (totals.prepaid > 0) expect(await recapValue(page, "Déjà réglé")).toBe(money(totals.prepaid))

    const file = await downloadResult(page, (n) => testInfo.outputPath(n))
    expect(file.filename).toBe(expectedFilename(fixture.expected.number))
    await validateDownloaded(file.path)

    const facts = xmlFacts(await readEmbeddedXml(file.bytes))
    expect(facts.number).toBe(fixture.expected.number)
    expect(facts.sellerSiret).toBe(fixture.expected.seller.siret ?? null)
    expect(facts.buyerName).toBe(fixture.expected.buyer.name)
    expect(facts.grandTotal).toBe(totals.grandTotal)
    expect(facts.dueAmount).toBe(totals.dueAmount)

    // Visual untouched: same pages, same text.
    const before = await pageTexts(new Uint8Array(readFileSync(fixture.pdfPath)))
    const after = await pageTexts(file.bytes)
    expect(after.pages).toBe(before.pages)
    expect(after.text).toEqual(before.text)
  })
}
