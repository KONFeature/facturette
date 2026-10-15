/**
 * Keeps the extraction scorecard honest in `bun run verify`: real fixture PDFs → extractPdfText →
 * extractInvoice, compared with the ground truth (see scripts/eval-extraction.ts).
 */
import { beforeAll, describe, expect, it } from "vitest"
import {
  type EvalReport,
  evaluate,
  formatReport,
  RECALL_THRESHOLD,
} from "../../../scripts/eval-extraction"

describe("extraction scorecard (dev fixtures)", () => {
  let report: EvalReport
  beforeAll(async () => {
    report = await evaluate("dev")
  }, 60_000)

  it("meets the recall threshold with zero confident errors", () => {
    const summary = formatReport(report)
    expect(report.fixtures.length, summary).toBeGreaterThan(0)
    expect(report.dev.recall, summary).toBeGreaterThanOrEqual(RECALL_THRESHOLD)
    expect(
      report.fixtures.flatMap((f) => f.confidentErrors.map((e) => `${f.file} ${e.path}`)),
      summary,
    ).toEqual([])
    expect(report.failures, summary).toEqual([])
  })

  it("returns an empty result plus a warning for image-only fixtures", () => {
    const scanned = report.fixtures.filter((f) => !f.textLayer)
    expect(scanned.length).toBeGreaterThan(0)
    for (const f of scanned) expect(f.negativeOk, f.file).toBe(true)
  })
})
