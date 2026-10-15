/**
 * Conformance tests: run the produced PDFs through the Mustang validator (veraPDF PDF/A-3 + XML).
 * Slow and needs Java: skipped unless `MUSTANG=1` and `java` is on PATH.
 *
 *   MUSTANG=1 bunx vitest run src/lib/facturx
 */
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { cmyk, PDFDocument } from "@cantoo/pdf-lib"
import { describe, expect, it } from "vitest"
import { type ValidationResult, validateFacturX } from "../../../scripts/validate-facturx"
import { type EmbedOptions, embedFacturX } from "./embed"
import { decoratePdf, makeHelveticaPdf, TEST_INVOICE } from "./embed.testkit"

const hasJava = spawnSync("java", ["-version"]).status === 0
const enabled = process.env.MUSTANG === "1" && hasJava

const assets = resolve(import.meta.dirname, "assets")
const input = (name: string) => new Uint8Array(readFileSync(resolve(assets, "test-inputs", name)))
const XML = readFileSync(resolve(assets, "sample-en16931.xml"), "utf8")
const BASIC_XML = XML.replace(
  "<ram:ID>urn:cen.eu:en16931:2017</ram:ID>",
  "<ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic</ram:ID>",
)
const OPTIONS: EmbedOptions = { invoice: TEST_INVOICE }
const outDir = enabled ? mkdtempSync(join(tmpdir(), "facturx-embed-")) : ""

async function validate(name: string, pdf: Uint8Array): Promise<ValidationResult> {
  const file = join(outDir, `${name}.pdf`)
  writeFileSync(file, pdf)
  return validateFacturX(file)
}

/**
 * Failed veraPDF clauses. `validateFacturX` does not surface them (they are plain text inside
 * Mustang's <pdf> element), so read Mustang's raw output; the jar was fetched by the call above.
 */
function failedPdfaClauses(name: string): string[] {
  const jar = resolve(import.meta.dirname, "..", "..", "..", ".tools", "mustang.jar")
  const file = join(outDir, `${name}.pdf`)
  const run = spawnSync(
    "java",
    ["-jar", jar, "--action", "validate", "--source", file, "--disable-file-logging"],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  )
  const clauses = [
    ...(run.stdout ?? "").matchAll(/clause=([\d.]+), testNumber=(\d+)\], status=failed/g),
  ]
  return [...new Set(clauses.map((m) => `${m[1]}-${m[2]}`))]
}

/** Mustang's overall status ignores a failed PDF/A section: check both sections explicitly. */
function expectValid(r: ValidationResult) {
  expect({ pdf: r.pdf, xml: r.xml, errors: r.errors }).toEqual({
    pdf: "valid",
    xml: "valid",
    errors: [],
  })
}

const TIMEOUT = 180_000

describe.skipIf(!enabled)("embedFacturX conformance (Mustang)", () => {
  const validCases: [string, () => Promise<Uint8Array>][] = [
    ["1-chromium", async () => embedFacturX(input("chromium-invoice.pdf"), XML, OPTIONS)],
    ["2-truetype-embedded", async () => embedFacturX(input("truetype-embedded.pdf"), XML, OPTIONS)],
    ["4-multipage", async () => embedFacturX(input("chromium-multipage.pdf"), XML, OPTIONS)],
    [
      "5-existing-xmp-outputintent-attachment",
      async () =>
        embedFacturX(
          await decoratePdf(input("chromium-invoice.pdf"), {
            xmp: true,
            outputIntent: "pdfa",
            attachment: true,
            info: true,
          }),
          XML,
          OPTIONS,
        ),
    ],
    [
      "5b-pdfx-outputintent",
      async () =>
        embedFacturX(
          await decoratePdf(input("chromium-invoice.pdf"), { outputIntent: "pdfx" }),
          XML,
          OPTIONS,
        ),
    ],
    [
      "6-reembed",
      async () =>
        embedFacturX(
          await embedFacturX(input("chromium-invoice.pdf"), XML, OPTIONS),
          XML.replace("FA-2026-0042", "FA-2026-0043"),
          OPTIONS,
        ),
    ],
    ["linearized", async () => embedFacturX(input("chromium-linearized.pdf"), XML, OPTIONS)],
    ["object-streams", async () => embedFacturX(input("chromium-objstreams.pdf"), XML, OPTIONS)],
    [
      "javascript-removed",
      async () =>
        embedFacturX(
          await decoratePdf(input("chromium-invoice.pdf"), { javascript: true }),
          XML,
          OPTIONS,
        ),
    ],
    [
      "basic-profile",
      async () =>
        embedFacturX(input("chromium-invoice.pdf"), BASIC_XML, { ...OPTIONS, profile: "BASIC" }),
    ],
  ]

  for (const [name, build] of validCases) {
    it(`${name} is VALID`, async () => expectValid(await validate(name, await build())), TIMEOUT)
  }

  // Known limitations: the original PDF itself breaks PDF/A rules we cannot repair client-side.
  it(
    "3-helvetica (non-embedded font) fails PDF/A 6.2.11.4.1",
    async () => {
      const r = await validate(
        "3-helvetica",
        await embedFacturX(await makeHelveticaPdf(), XML, OPTIONS),
      )
      expect(r.xml).toBe("valid")
      expect(r.pdf).toBe("invalid")
      expect(failedPdfaClauses("3-helvetica")).toEqual(["6.2.11.4.1-1"])
    },
    TIMEOUT,
  )

  it(
    "DeviceCMYK content fails PDF/A 6.2.4.3",
    async () => {
      const doc = await PDFDocument.load(input("chromium-invoice.pdf"))
      doc.getPage(0).drawRectangle({ x: 10, y: 10, width: 20, height: 20, color: cmyk(0, 1, 1, 0) })
      const r = await validate("cmyk", await embedFacturX(await doc.save(), XML, OPTIONS))
      expect(r.xml).toBe("valid")
      expect(r.pdf).toBe("invalid")
      expect(failedPdfaClauses("cmyk")).toEqual(["6.2.4.3-3"])
    },
    TIMEOUT,
  )
})
