import type { Page } from "@playwright/test"
import {
  downloadResult,
  expect,
  fillMissingFromExpected,
  generate,
  generateButton,
  importPdf,
  importToReview,
  readFixture,
  tabTo,
  test,
  validateDownloaded,
} from "./helpers"

const storageEntries = (page: Page) =>
  page.evaluate(() => {
    const out: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key !== null) out[key] = localStorage.getItem(key) ?? ""
    }
    return out
  })

test("12 scanned PDF: warning, fill everything by hand, VALID", async ({ page }, testInfo) => {
  const fixture = readFixture("12")
  await importPdf(page, fixture.pdfPath)
  await expect(page.getByText("Aucun texte détecté dans ce PDF")).toBeVisible()
  await page.getByRole("button", { name: "Continuer et remplir à la main" }).click()
  await page.waitForURL("**/review")

  const report = await fillMissingFromExpected(page, fixture)
  const prefilled = Object.entries(report.fields).filter(
    ([, f]) => f.outcome === "correct" || f.outcome === "wrong",
  )
  // Only form defaults can match (country FR, standard legal texts...), never extraction.
  console.log(`[scanned 12] values already present: ${prefilled.map(([p]) => p).join(", ")}`)

  await generate(page)
  const file = await downloadResult(page, (n) => testInfo.outputPath(n))
  await validateDownloaded(file.path)
})

test("profile and customer: save, reuse on a new invoice, then erase everything", async ({
  page,
}) => {
  page.on("dialog", (d) => void d.accept())
  const first = readFixture("02")
  await importToReview(page, first.pdfPath)
  await fillMissingFromExpected(page, first, { record: false })
  await page.getByLabel("Mémoriser mon entreprise pour les prochaines factures").check()
  await page.getByLabel("Mémoriser ce client").check()
  await generate(page)

  // New invoice from the same seller.
  await page.getByRole("button", { name: "Nouvelle facture" }).click()
  await page.waitForURL((u) => u.pathname === "/")
  const second = readFixture("11")
  await importToReview(page, second.pdfPath)

  // Same seller: the block holds the profile values. Every one of them is also detected in this
  // PDF, and a detected value shows "Détecté" (it has precedence over the profile marker).
  await expect(page.getByText(/Profil enregistré le .+ : Atelier Lumière SARL/)).toBeVisible()
  await expect(page.locator('[name="seller.siret"]')).toHaveValue(/523\s?456\s?788\s?00026/)
  await expect(page.locator('[name="seller.name"]')).toHaveValue(first.expected.seller.name)
  await expect(page.locator('[name="seller.vatNumber"]')).toHaveValue(
    first.expected.seller.vatNumber ?? "",
  )

  // Customer picker fills the buyer block with the saved customer of the first invoice.
  const picker = page.getByLabel("Client enregistré")
  await picker.selectOption({
    label: `${first.expected.buyer.name} (${first.expected.buyer.address.city})`,
  })
  await expect(page.locator('[name="buyer.name"]')).toHaveValue(first.expected.buyer.name)
  await expect(page.getByText(`Client « ${first.expected.buyer.name} » appliqué.`)).toBeVisible()

  // A PDF where nothing is detected: the seller block comes from the profile, with its marker.
  await page.getByRole("button", { name: "Recommencer avec un autre PDF" }).click()
  await page.waitForURL((u) => u.pathname === "/")
  await importPdf(page, readFixture("12").pdfPath)
  await page.getByRole("button", { name: "Continuer et remplir à la main" }).click()
  await page.waitForURL("**/review")
  const sellerBlock = page.getByRole("region", { name: "Vendeur" })
  await expect(sellerBlock.getByText("Profil enregistré").first()).toBeVisible()
  await expect(page.locator('[name="seller.name"]')).toHaveValue(first.expected.seller.name)
  await expect(page.locator('[name="seller.siret"]')).toHaveValue(/523\s?456\s?788\s?00026/)
  const markers = await sellerBlock.getByText("Profil enregistré", { exact: true }).count()
  console.log(`[profile] ${markers} seller fields marked "Profil enregistré" on the scanned PDF`)

  const before = Object.keys(await storageEntries(page))
  expect(before.filter((k) => k.startsWith("facturette:")).sort()).toEqual(
    expect.arrayContaining(["facturette:v1:customers", "facturette:v1:profile"]),
  )

  await page.getByRole("button", { name: "Effacer mes données" }).click()
  await expect(page.getByText("Données effacées.")).toBeVisible()
  const after = Object.keys(await storageEntries(page))
  expect(after.filter((k) => k.startsWith("facturette"))).toEqual([])
})

test.describe("route guards", () => {
  test("/review without a PDF redirects to /", async ({ page }) => {
    await page.goto("/review")
    await expect(page).toHaveURL((u) => u.pathname === "/")
    await expect(page.getByRole("heading", { name: "Importez votre facture PDF" })).toBeVisible()
  })

  test("/done without a PDF redirects to /", async ({ page }) => {
    await page.goto("/done")
    await expect(page).toHaveURL((u) => u.pathname === "/")
  })

  test("a reload on /review returns to /", async ({ page }) => {
    await importToReview(page, readFixture("01").pdfPath)
    await page.reload()
    await expect(page).toHaveURL((u) => u.pathname === "/")
  })
})

test("privacy: no foreign request and the exact localStorage keys without consent", async ({
  page,
  requests,
}, testInfo) => {
  const fixture = readFixture("01")
  await importToReview(page, fixture.pdfPath)
  await fillMissingFromExpected(page, fixture, { record: false })
  await generate(page)
  await downloadResult(page, (n) => testInfo.outputPath(n))

  const entries = await storageEntries(page)
  console.log(
    `[privacy] localStorage after a flow with no save box ticked: ${JSON.stringify(entries)}`,
  )
  console.log(`[privacy] ${requests.all.length} requests, foreign: ${requests.foreign.length}`)
  // FINDING: the done step remembers the invoice number without any opt-in.
  expect(Object.keys(entries)).toEqual(["facturette:v1:lastInvoiceNumber"])
  expect(entries["facturette:v1:lastInvoiceNumber"]).toContain(fixture.expected.number)
  expect(requests.foreign).toEqual([])
})

test.describe("13 non-embedded Helvetica", () => {
  test("the preflight warning is shown on /done", async ({ page }) => {
    const fixture = readFixture("13")
    await importToReview(page, fixture.pdfPath)
    await fillMissingFromExpected(page, fixture)
    await generate(page)
    const alert = page.getByText("Points d’attention sur votre PDF")
    await expect(alert).toBeVisible()
    const text = await page.getByRole("alert").or(page.locator("[role=status]")).allInnerTexts()
    console.log(`[preflight 13] ${text.join(" | ").replace(/\s+/g, " ")}`)
  })

  // Font substitution is the facturx-fonts lane (not on main yet): until then veraPDF rejects the
  // non-embedded standard fonts (PDF/A-3 6.2.11.4.1).
  test.fixme("the result is VALID (needs the facturx-fonts lane)", async ({ page }, testInfo) => {
    const fixture = readFixture("13")
    await importToReview(page, fixture.pdfPath)
    await fillMissingFromExpected(page, fixture, { record: false })
    await generate(page)
    const file = await downloadResult(page, (n) => testInfo.outputPath(n))
    await validateDownloaded(file.path)
  })
})

test("keyboard only: import, complete, generate and download", async ({ page }, testInfo) => {
  const fixture = readFixture("02")
  await page.goto("/")
  const chooser = page.waitForEvent("filechooser")
  await tabTo(page, "button[aria-describedby='aide-import']")
  await page.keyboard.press("Enter")
  await (await chooser).setFiles(fixture.pdfPath)
  await page.waitForURL("**/review")

  // Extraction leaves only the operation category empty for this fixture (see accuracy report).
  await tabTo(page, "select[name='operationCategory']")
  await page.keyboard.type("Prestation")
  await expect(page.locator("select[name='operationCategory']")).toHaveValue("services")

  await expect(generateButton(page)).not.toHaveAttribute("aria-disabled", "true")
  await tabTo(page, "button", "Générer la facture Factur-X")
  await page.keyboard.press("Enter")
  await page.waitForURL("**/done")

  const download = page.waitForEvent("download")
  await tabTo(page, "a[download]", "Télécharger la facture Factur-X")
  await page.keyboard.press("Enter")
  const file = await download
  const path = testInfo.outputPath(file.suggestedFilename())
  await file.saveAs(path)
  await validateDownloaded(path)
})
