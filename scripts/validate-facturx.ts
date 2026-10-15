/**
 * Validate a Factur-X PDF (or a bare CII XML) with the Mustang CLI.
 * Mustang checks the XML (XSD + Schematron + arithmetic) and, for PDFs, PDF/A-3 conformance.
 *
 *   bun scripts/validate-facturx.ts <file.pdf|file.xml> [--json]
 *
 * Exit code: 0 = valid, 1 = invalid, 2 = tool/usage error.
 * The jar is downloaded once into .tools/ (gitignored). Requires `java` on PATH.
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const MUSTANG_VERSION = "2.26.0"
const JAR = resolve(import.meta.dirname, "..", ".tools", "mustang.jar")
const JAR_URL = `https://repo1.maven.org/maven2/org/mustangproject/Mustang-CLI/${MUSTANG_VERSION}/Mustang-CLI-${MUSTANG_VERSION}.jar`

export interface ValidationResult {
  valid: boolean
  /** "valid" | "invalid" per section when Mustang reports one. */
  pdf: string | null
  xml: string | null
  errors: string[]
  warnings: string[]
  notices: string[]
}

async function ensureJar() {
  if (existsSync(JAR)) return
  mkdirSync(dirname(JAR), { recursive: true })
  console.error(`Downloading Mustang ${MUSTANG_VERSION}…`)
  const res = await fetch(JAR_URL)
  if (!res.ok) throw new Error(`Cannot download Mustang: HTTP ${res.status}`)
  writeFileSync(JAR, new Uint8Array(await res.arrayBuffer()))
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()

function collect(xml: string, tag: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, "g")
  for (const m of xml.matchAll(re)) {
    const attrs = decode(m[1] ?? "")
    const body = decode(m[2] ?? "")
    out.push(attrs ? `[${attrs}] ${body}` : body)
  }
  return out
}

export function parseMustangOutput(stdout: string): ValidationResult {
  const section = (name: string) => {
    const m = stdout.match(new RegExp(`<${name}>[\\s\\S]*?<summary status="(\\w+)"`))
    return m?.[1] ?? null
  }
  const overall = [...stdout.matchAll(/<summary status="(\w+)"/g)].pop()?.[1] ?? "invalid"
  return {
    valid: overall === "valid",
    pdf: section("pdf"),
    xml: section("xml"),
    errors: [...collect(stdout, "error"), ...collect(stdout, "exception")],
    warnings: collect(stdout, "warning"),
    notices: collect(stdout, "notice"),
  }
}

export async function validateFacturX(file: string): Promise<ValidationResult> {
  await ensureJar()
  const run = spawnSync(
    "java",
    ["-jar", JAR, "--action", "validate", "--source", resolve(file), "--disable-file-logging"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
  if (run.error) throw run.error
  return parseMustangOutput(run.stdout ?? "")
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const file = args.find((a) => !a.startsWith("--"))
  if (!file) {
    console.error("usage: bun scripts/validate-facturx.ts <file.pdf|file.xml> [--json]")
    process.exit(2)
  }
  try {
    const r = await validateFacturX(file)
    if (args.includes("--json")) {
      console.log(JSON.stringify(r, null, 2))
    } else {
      console.log(
        `${r.valid ? "VALID" : "INVALID"}  (pdf: ${r.pdf ?? "n/a"}, xml: ${r.xml ?? "n/a"})`,
      )
      for (const e of r.errors) console.log(`  error:   ${e}`)
      for (const w of r.warnings) console.log(`  warning: ${w}`)
    }
    process.exit(r.valid ? 0 : 1)
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(2)
  }
}
