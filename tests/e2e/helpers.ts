/**
 * Shared helpers for the end-to-end suite: they drive the PRODUCTION build through the real UI
 * (file input, form, download link) and check the downloaded file with the Mustang oracle.
 */
import { spawnSync } from "node:child_process"
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { PDFDocument } from "@cantoo/pdf-lib"
import { test as base, expect, type Locator, type Page } from "@playwright/test"
import { validateFacturX } from "../../scripts/validate-facturx"
import type { Invoice } from "../../src/domain/invoice"
import { computeTotals } from "../../src/domain/totals"

export const ROOT = resolve(import.meta.dirname, "..", "..")
export const FIXTURES_DIR = join(ROOT, "fixtures", "invoices")
/** Through-the-UI accuracy reports land here (gitignored). */
export const REPORT_DIR = join(ROOT, ".out", "e2e")

// ---- fixtures ---------------------------------------------------------------------------------

export interface Fixture {
  id: string
  pdfPath: string
  expected: Invoice
}

/** `readFixture("04")` → the PDF path and its ground truth. */
export function readFixture(id: string): Fixture {
  const pdf = readdirSync(FIXTURES_DIR).find((f) => f.startsWith(`${id}-`) && f.endsWith(".pdf"))
  if (!pdf) throw new Error(`No fixture PDF starting with ${id}-`)
  const expectedPath = join(FIXTURES_DIR, pdf.replace(/\.pdf$/, ".expected.json"))
  const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as Invoice
  return { id, pdfPath: join(FIXTURES_DIR, pdf), expected }
}

// ---- network privacy --------------------------------------------------------------------------

export interface RequestTracker {
  /** Every request URL seen, in order. */
  all: string[]
  /** Requests whose origin is not the preview server (blob:/data: are local, so allowed). */
  foreign: string[]
}

/**
 * `test` with an automatic request tracker: any request leaving the preview origin fails the test
 * at teardown.
 */
export const test = base.extend<{ requests: RequestTracker }>({
  requests: [
    async ({ page, baseURL }, use) => {
      const origin = new URL(baseURL ?? "http://localhost:4173").origin
      const tracker: RequestTracker = { all: [], foreign: [] }
      page.on("request", (req) => {
        const url = req.url()
        tracker.all.push(url)
        if (url.startsWith("blob:") || url.startsWith("data:")) return
        if (new URL(url).origin !== origin) tracker.foreign.push(url)
      })
      await use(tracker)
      expect(tracker.foreign, "requests outside the preview origin").toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

// ---- import -----------------------------------------------------------------------------------

/** Pick the PDF through the real (hidden) file input of the import step. */
export async function importPdf(page: Page, pdfPath: string): Promise<void> {
  await page.goto("/")
  await page.getByTestId("file-input").setInputFiles(pdfPath)
}

/** Import a PDF that has a text layer and wait for the review step. */
export async function importToReview(page: Page, pdfPath: string): Promise<void> {
  await importPdf(page, pdfPath)
  await page.waitForURL("**/review")
  await expect(
    page.getByRole("heading", { name: "Vérifiez et complétez la facture" }),
  ).toBeVisible()
}

// ---- form filling + accuracy -------------------------------------------------------------------

export type FieldOutcome = "correct" | "wrong" | "empty" | "extra"

export interface AccuracyReport {
  fixture: string
  fields: Record<string, { outcome: FieldOutcome; found: string; expected: string }>
  summary: Record<string, Record<FieldOutcome, number>>
}

type Kind = "text" | "number" | "id" | "select" | "vatRate"

const NUMBER_LEAVES = new Set(["quantity", "unitPrice", "prepaidAmount"])
const ID_LEAVES = new Set(["siren", "siret", "vatNumber", "iban", "bic"])
const SELECT_PATHS = new Set(["typeCode", "operationCategory", "buyer.kind", "payment.meansCode"])
const SELECT_LEAVES = new Set(["unitCode", "vatCategory"])
/** Domain values with no form control (forced or implicit). */
const NOT_IN_FORM = new Set(["currency", "seller.kind"])
/**
 * Optional free fields extraction may fill: when the ground truth has no value there, the test
 * clears them (recorded as "extra") so that the generated invoice only carries expected data.
 */
const CLEARABLE = [
  "dueDate",
  "deliveryDate",
  "buyerReference",
  "orderReference",
  "notes",
  "vatExemptionReason",
  "prepaidAmount",
  "seller.vatNumber",
  "seller.shareCapital",
  "seller.legalForm",
  "seller.registration",
  "seller.email",
  "seller.phone",
  "seller.address.line2",
  "buyer.vatNumber",
  "buyer.email",
  "buyer.phone",
  "buyer.address.line2",
  "payment.iban",
  "payment.bic",
  "payment.reference",
  "payment.termsText",
]

function kindOf(path: string): Kind {
  const leaf = path.split(".").pop() ?? path
  if (path.startsWith("lines.") && leaf === "vatRate") return "vatRate"
  if (SELECT_PATHS.has(path) || (path.startsWith("lines.") && SELECT_LEAVES.has(leaf))) {
    return "select"
  }
  if (NUMBER_LEAVES.has(leaf)) return "number"
  if (ID_LEAVES.has(leaf)) return "id"
  return "text"
}

/** 1234.5 → "1 234,5" (what a French user types). */
export function frenchNumber(n: number): string {
  const [int = "0", frac] = String(Math.abs(n)).split(".")
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  return `${n < 0 ? "-" : ""}${grouped}${frac ? `,${frac}` : ""}`
}

const parseFr = (text: string): number | null => {
  const t = text.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".")
  if (t === "") return null
  const n = Number(t)
  return Number.isNaN(n) ? null : n
}

const normText = (s: string) =>
  s
    .replace(/[’‘]/g, "'")
    .replace(/[\s\u00a0\u202f]+/g, " ")
    .trim()

function same(kind: Kind, found: string, expected: string): boolean {
  if (kind === "number" || kind === "vatRate") return parseFr(found) === parseFr(expected)
  if (kind === "id") {
    return found.replace(/\s+/g, "").toUpperCase() === expected.replace(/\s+/g, "").toUpperCase()
  }
  return normText(found) === normText(expected)
}

function leaves(value: unknown, prefix = ""): Array<[string, string]> {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${prefix}.${i}`))
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k))
  }
  return [[prefix, String(value)]]
}

const control = (page: Page, path: string): Locator =>
  page.locator(`form [name="${path}"], form select[data-field="${path}"]`).first()

const customRate = (page: Page, lineIndex: number): Locator =>
  page
    .getByRole("listitem", { name: `Ligne ${lineIndex + 1}` })
    .getByLabel("Taux de TVA personnalisé en pourcent")

async function readValue(page: Page, path: string, kind: Kind): Promise<string> {
  if (kind === "vatRate") {
    const select = page.locator(`select[data-field="${path}"]`)
    if ((await select.count()) === 0) return ""
    const v = await select.inputValue()
    if (v !== "other") return v
    return customRate(page, Number(path.split(".")[1])).inputValue()
  }
  const el = control(page, path)
  if ((await el.count()) === 0) return ""
  return el.inputValue()
}

async function writeValue(page: Page, path: string, kind: Kind, value: string): Promise<void> {
  if (kind === "vatRate") {
    const select = page.locator(`select[data-field="${path}"]`)
    const known = await select.locator(`option[value="${value}"]`).count()
    if (known > 0) {
      await select.selectOption(value)
    } else {
      await select.selectOption("other")
      await customRate(page, Number(path.split(".")[1])).fill(value)
    }
    return
  }
  const el = control(page, path)
  if (kind === "select") await el.selectOption(value)
  else await el.fill(value)
}

const groupOf = (path: string): string => {
  if (path.startsWith("lines.")) return "lignes"
  if (path.startsWith("seller.")) return "vendeur"
  if (path.startsWith("buyer.") || path.startsWith("deliveryAddress.")) return "client"
  if (path.startsWith("payment.") || path === "prepaidAmount") return "paiement"
  if (path.startsWith("legalNotes.") || path === "vatExemptionReason" || path === "notes") {
    return "mentions"
  }
  return "en-tête"
}

/** Expected value as the user would type/select it in the form. */
function formText(path: string, kind: Kind, raw: string): string {
  if (kind === "number" || kind === "vatRate") return frenchNumber(Number(raw))
  if (path === "payment.iban") return raw.replace(/(.{4})/g, "$1 ").trim()
  return raw
}

/**
 * Compare what the app pre-filled with the ground truth, type only what is missing or wrong, and
 * return the through-the-UI accuracy report (also written to `.out/e2e/<fixture>.json`).
 */
export async function fillMissingFromExpected(
  page: Page,
  fixture: Fixture,
  options: { record?: boolean } = {},
): Promise<AccuracyReport> {
  const expected = fixture.expected
  const report: AccuracyReport = { fixture: fixture.id, fields: {}, summary: {} }
  const record = (path: string, outcome: FieldOutcome, found: string, want: string) => {
    report.fields[path] = { outcome, found, expected: want }
    const g = groupOf(path)
    report.summary[g] ??= { correct: 0, wrong: 0, empty: 0, extra: 0 }
    report.summary[g][outcome] += 1
  }

  const handle = async (path: string, raw: string) => {
    if (NOT_IN_FORM.has(path)) return
    const kind = kindOf(path)
    const want = formText(path, kind, raw)
    const found = await readValue(page, path, kind)
    if (same(kind, found, want)) {
      record(path, "correct", found, want)
      return
    }
    record(path, found.trim() === "" ? "empty" : "wrong", found, want)
    await writeValue(page, path, kind, want)
    expect(same(kind, await readValue(page, path, kind), want), `typed ${path}`).toBe(true)
  }

  // The review form renders after the route change: never read a control before it exists.
  await expect(page.locator('form [name="number"]')).toBeVisible()
  const all = new Map(leaves(expected))
  const take = async (path: string) => {
    const raw = all.get(path)
    if (raw === undefined) return
    all.delete(path)
    await handle(path, raw)
  }

  // Controls that reveal or hide other fields go first.
  await take("typeCode")
  await take("buyer.kind")
  if (expected.deliveryAddress) {
    await page.locator("#cb-hasDeliveryAddress").check()
  }

  // Same number of lines as the ground truth.
  const lineNames = page.locator('form input[name^="lines."][name$=".name"]')
  const want = expected.lines.length
  while ((await lineNames.count()) < want) {
    await page.getByRole("button", { name: "Ajouter une ligne" }).click()
  }
  while ((await lineNames.count()) > want) {
    const n = await lineNames.count()
    await page.getByRole("button", { name: `Supprimer la ligne ${n}`, exact: true }).click()
  }
  for (let i = 0; i < want; i++) {
    for (const leaf of ["name", "description", "quantity", "unitCode", "unitPrice"]) {
      await take(`lines.${i}.${leaf}`)
    }
    await take(`lines.${i}.vatCategory`)
    const rate = all.get(`lines.${i}.vatRate`)
    all.delete(`lines.${i}.vatRate`)
    if (expected.lines[i]?.vatCategory === "S" && rate !== undefined) {
      await handle(`lines.${i}.vatRate`, rate)
    }
  }

  for (const [path, raw] of [...all]) await handle(path, raw)

  // Clear what extraction added beyond the ground truth.
  const expectedPaths = new Set(leaves(expected).map(([p]) => p))
  for (const path of CLEARABLE) {
    if (expectedPaths.has(path)) continue
    const el = control(page, path)
    if ((await el.count()) === 0) continue
    const found = await el.inputValue()
    if (found.trim() === "") continue
    record(path, "extra", found, "")
    await el.fill("")
  }

  if (options.record !== false) {
    mkdirSync(REPORT_DIR, { recursive: true })
    writeFileSync(
      join(REPORT_DIR, `accuracy-${fixture.id}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
    )
    console.log(`[accuracy ${fixture.id}] ${JSON.stringify(report.summary)}`)
  }
  return report
}

// ---- generate + download ----------------------------------------------------------------------

export const generateButton = (page: Page): Locator =>
  page.getByRole("button", { name: "Générer la facture Factur-X" })

/** The list of blocking issues shown by the summary bar (for failure messages). */
async function issueList(page: Page): Promise<string> {
  const toggle = page.locator("button[aria-controls][aria-expanded]").last()
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click()
  const id = await toggle.getAttribute("aria-controls")
  return id ? page.locator(`[id="${id}"]`).innerText() : ""
}

/** Assert the build action is enabled (it uses aria-disabled), click it, wait for /done. */
export async function generate(page: Page): Promise<void> {
  const button = generateButton(page)
  if ((await button.getAttribute("aria-disabled")) === "true") {
    throw new Error(`Generate is blocked:\n${await issueList(page)}`)
  }
  await button.click()
  await page.waitForURL("**/done")
  await expect(page.getByRole("heading", { name: "Votre facture Factur-X est prête" })).toBeVisible(
    { timeout: 30_000 },
  )
}

/** Click the download link and save the file into the test output dir. */
export async function downloadResult(
  page: Page,
  outputPath: (name: string) => string,
): Promise<{ path: string; filename: string; bytes: Uint8Array }> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Télécharger la facture Factur-X" }).click(),
  ])
  const filename = download.suggestedFilename()
  const path = outputPath(filename)
  await download.saveAs(path)
  return { path, filename, bytes: new Uint8Array(readFileSync(path)) }
}

// ---- oracle -----------------------------------------------------------------------------------

export const javaAvailable = (): boolean => !spawnSync("java", ["-version"]).error

/** Mustang (XSD + Schematron + veraPDF): asserts VALID with no error. Skips without java. */
export async function validateDownloaded(path: string): Promise<void> {
  test.skip(!javaAvailable(), "java is not available: Mustang cannot run")
  const result = await validateFacturX(path)
  console.log(
    `[mustang] ${result.valid ? "VALID" : "INVALID"} (pdf: ${result.pdf}, xml: ${result.xml}) ${path.split("/").pop()}`,
  )
  expect(result.errors, "Mustang errors").toEqual([])
  expect(result.valid, "Mustang verdict").toBe(true)
}

/** The `factur-x.xml` attachment of a PDF, as text. */
export async function readEmbeddedXml(pdfBytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false })
  const file = doc.getAttachments().find((a) => a.name === "factur-x.xml")
  if (!file) throw new Error("No factur-x.xml attachment")
  return new TextDecoder().decode(file.data)
}

const inside = (xml: string, tag: string): string => {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`))
  if (!m?.[1]) throw new Error(`<${tag}> not found in the XML`)
  return m[1]
}
const leafText = (xml: string, tag: string): string => inside(xml, tag).trim()

export interface XmlFacts {
  number: string
  sellerSiret: string | null
  buyerName: string
  grandTotal: number
  dueAmount: number
}

export function xmlFacts(xml: string): XmlFacts {
  const seller = inside(xml, "ram:SellerTradeParty")
  const buyer = inside(xml, "ram:BuyerTradeParty")
  const siret = seller.match(/<ram:GlobalID schemeID="0009">(\d+)<\/ram:GlobalID>/)?.[1] ?? null
  const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&apos;/g, "'")
  return {
    number: leafText(inside(xml, "rsm:ExchangedDocument"), "ram:ID"),
    sellerSiret: siret,
    buyerName: decode(leafText(buyer, "ram:Name")),
    grandTotal: Number(leafText(xml, "ram:GrandTotalAmount")),
    dueAmount: Number(leafText(xml, "ram:DuePayableAmount")),
  }
}

/** Totals of the ground truth through the domain (the app's own arithmetic). */
export const expectedTotals = (expected: Invoice) => computeTotals(expected)

/** "1 234,56 €" with any kind of space, for comparing displayed amounts. */
export const normSpaces = (s: string) => s.replace(/[\s\u00a0\u202f]+/g, " ").trim()

/** Text of the recap row whose label is `label` on /done. */
export async function recapValue(page: Page, label: string): Promise<string> {
  const row = page.locator("dl > div").filter({ has: page.locator("dt", { hasText: label }) })
  return normSpaces(await row.locator("dd").first().innerText())
}

/** facture-<number>-facturx.pdf, the number lower-cased with every other character as "-". */
export const expectedFilename = (number: string): string =>
  `facture-${number
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}-facturx.pdf`

// ---- keyboard ---------------------------------------------------------------------------------

/**
 * Press Tab until the focused element matches `selector` (and has exactly `text` when given).
 * Fails after `max` presses.
 */
export async function tabTo(page: Page, selector: string, text?: string, max = 400): Promise<void> {
  for (let i = 0; i < max; i++) {
    const hit = await page.evaluate(
      ([sel, txt]) => {
        const el = document.activeElement
        if (!el?.matches(sel)) return false
        return txt === null || el.textContent?.trim() === txt
      },
      [selector, text ?? null] as const,
    )
    if (hit) return
    await page.keyboard.press("Tab")
  }
  throw new Error(`${selector} ${text ?? ""} not reachable with Tab`)
}
