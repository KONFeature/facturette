/**
 * Conformance: every scenario and profile must be VALID under Mustang (XSD + EN 16931 /
 * Factur-X Schematron + arithmetic). Slow (one JVM per file), so opt-in:
 *
 *   MUSTANG=1 bunx vitest run src/lib/facturx
 *
 * Skipped when `java` is missing or MUSTANG is not "1". Set MUSTANG_OUT=dir to keep the XML.
 */
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { validateFacturX } from "../../../scripts/validate-facturx"
import { scenarios } from "./fixtures/scenarios"
import { buildFacturXXml } from "./xml"

const hasJava = !spawnSync("java", ["-version"]).error
const enabled = process.env.MUSTANG === "1" && hasJava

const outDir = process.env.MUSTANG_OUT
  ? resolve(process.env.MUSTANG_OUT)
  : mkdtempSync(join(tmpdir(), "facturx-"))
mkdirSync(outDir, { recursive: true })

describe.skipIf(!enabled)("Mustang conformance", () => {
  it("has at least 12 scenarios and 3 BASIC ones", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(12)
    expect(scenarios.filter((s) => s.profiles.includes("BASIC")).length).toBeGreaterThanOrEqual(3)
  })

  for (const s of scenarios) {
    for (const profile of s.profiles) {
      it(`${s.name} [${profile}] is VALID`, { timeout: 120_000 }, async () => {
        const file = join(outDir, `${s.name}.${profile}.xml`)
        writeFileSync(file, buildFacturXXml(s.invoice, { profile }))
        const result = await validateFacturX(file)
        expect(result.errors).toEqual([])
        expect(result.valid).toBe(true)
      })
    }
  }
})
