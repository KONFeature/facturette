import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import {
  expect,
  fillMissingFromExpected,
  generate,
  importToReview,
  readFixture,
  tabTo,
  test,
} from "./helpers"

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze()
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.impact} ${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    )
}

async function toDone(page: Page): Promise<void> {
  const fixture = readFixture("02")
  await importToReview(page, fixture.pdfPath)
  await fillMissingFromExpected(page, fixture, { record: false })
  await generate(page)
}

test.describe("accessibility (axe): no serious or critical violation", () => {
  test("/", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect(await seriousViolations(page)).toEqual([])
  })

  test("/review after an import", async ({ page }) => {
    await importToReview(page, readFixture("02").pdfPath)
    expect(await seriousViolations(page)).toEqual([])
  })

  test("/done", async ({ page }) => {
    await toDone(page)
    expect(await seriousViolations(page)).toEqual([])
  })
})

test.describe("375 px wide", () => {
  test.use({ viewport: { width: 375, height: 740 } })

  const overflow = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  test("no horizontal overflow on /, /review, /done; Générer reachable by keyboard", async ({
    page,
  }) => {
    await page.goto("/")
    expect(await overflow(page), "/ overflow (px)").toBeLessThanOrEqual(0)

    const fixture = readFixture("02")
    await importToReview(page, fixture.pdfPath)
    expect(await overflow(page), "/review overflow (px)").toBeLessThanOrEqual(0)

    await fillMissingFromExpected(page, fixture, { record: false })
    await page.locator("body").focus()
    await tabTo(page, "button", "Générer la facture Factur-X")
    await page.keyboard.press("Enter")
    await page.waitForURL("**/done")
    await expect(
      page.getByRole("heading", { name: "Votre facture Factur-X est prête" }),
    ).toBeVisible()
    expect(await overflow(page), "/done overflow (px)").toBeLessThanOrEqual(0)
  })
})
