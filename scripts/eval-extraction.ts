/**
 * Extraction quality scorecard over the fixture corpus.
 *
 *   bun scripts/eval-extraction.ts [--set dev|holdout|all] [--verbose] [--json]
 *
 * For every fixture of fixtures/invoices/manifest.json: real PDF bytes → extractPdfText →
 * extractInvoice, compared with the `.expected.json` ground truth.
 *
 * - Recall: share of the manifest's `printed` paths whose value is correct in the draft.
 * - Precision: share of the draft's leaf values that are correct (a value at a path absent from
 *   the ground truth is a hallucination, hence an error).
 * - Confident errors: any suggestion with confidence >= PREFILL_THRESHOLD whose value is wrong.
 * - Ground-truth sanity check: expected identifiers that fail their own checksum (SIREN, SIRET,
 *   French VAT number, IBAN) are excluded from every metric and listed separately.
 *
 * Gate (exit code 1 when missed): on the dev set, recall >= 0.90 and zero confident errors;
 * image-only fixtures must yield an empty result with a warning. Hold-out numbers are reported,
 * never gated: they measure generalisation.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { extractInvoice, PREFILL_THRESHOLD, type Suggestion } from "../src/lib/extract"
import { extractPdfText } from "../src/lib/pdf/extract-text"
import {
  isValidFrenchVatNumber,
  isValidIban,
  isValidSiren,
  isValidSiret,
} from "../src/lib/validation/identifiers"

const FIXTURES_DIR = resolve(import.meta.dirname, "..", "fixtures", "invoices")

/** Fixtures the extractor was developed against. Everything else is hold-out. */
export const DEV_FIXTURES = ["01", "02", "03", "04", "05", "06", "11", "12"]
export const RECALL_THRESHOLD = 0.9

export type FixtureSet = "dev" | "holdout" | "all"

export const FIELD_GROUPS = [
  "header",
  "seller",
  "buyer",
  "delivery",
  "lines",
  "payment",
  "legal",
  "amounts",
] as const
export type FieldGroup = (typeof FIELD_GROUPS)[number]

interface ManifestEntry {
  file: string
  expected: string
  printed: string[]
  tags: string[]
  pages: number
}

export interface PathError {
  path: string
  got: unknown
  expected: unknown
  confidence?: number
  rule?: string
}

export interface GroupScore {
  printed: number
  hit: number
  draft: number
  wrong: number
}

export interface FixtureScore {
  file: string
  set: "dev" | "holdout"
  textLayer: boolean
  printed: number
  hit: number
  draft: number
  wrong: number
  missed: PathError[]
  draftErrors: PathError[]
  confidentErrors: PathError[]
  groundTruthInvalid: string[]
  groups: Record<FieldGroup, GroupScore>
  warnings: string[]
  ms: number
  /** Image-only fixture: must produce no suggestion and at least one warning. */
  negativeOk?: boolean
}

export interface EvalReport {
  fixtures: FixtureScore[]
  dev: Aggregate
  holdout: Aggregate
  passed: boolean
  failures: string[]
}

export interface Aggregate {
  printed: number
  hit: number
  recall: number
  draft: number
  wrong: number
  precision: number
  confidentErrors: number
  groups: Record<FieldGroup, GroupScore>
}

export function groupOf(path: string): FieldGroup {
  const head = path.split(".")[0] ?? ""
  if (head === "seller") return "seller"
  if (head === "buyer") return "buyer"
  if (head === "deliveryAddress") return "delivery"
  if (head === "lines") return "lines"
  if (head === "payment") return "payment"
  if (head === "legalNotes" || head === "vatExemptionReason") return "legal"
  if (head === "prepaidAmount") return "amounts"
  return "header"
}

export function flatten(
  value: unknown,
  prefix = "",
  out = new Map<string, unknown>(),
): Map<string, unknown> {
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      flatten(v, prefix ? `${prefix}.${i}` : String(i), out)
    })
  } else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out)
  } else if (value !== undefined) {
    out.set(prefix, value)
  }
  return out
}

const normText = (s: string) =>
  s
    .replace(/[\s\u00a0\u202f\u2009]+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .trim()
    .toLowerCase()

export function sameValue(got: unknown, expected: unknown): boolean {
  if (typeof expected === "number") {
    const n = typeof got === "number" ? got : typeof got === "string" ? Number(got) : Number.NaN
    return Number.isFinite(n) && Math.abs(n - expected) <= 0.005
  }
  if (typeof expected === "string") {
    if (typeof got !== "string" && typeof got !== "number") return false
    return normText(String(got)) === normText(expected)
  }
  return got === expected
}

/** Expected identifier values that fail their own checksum: the ground truth is wrong there. */
export function groundTruthInvalid(path: string, value: unknown): boolean {
  if (typeof value !== "string") return false
  if (path.endsWith(".siret")) return !isValidSiret(value)
  if (path.endsWith(".siren")) return !isValidSiren(value)
  if (path.endsWith(".vatNumber") && value.toUpperCase().startsWith("FR"))
    return !isValidFrenchVatNumber(value)
  if (path === "payment.iban") return !isValidIban(value)
  return false
}

function emptyGroups(): Record<FieldGroup, GroupScore> {
  return Object.fromEntries(
    FIELD_GROUPS.map((g) => [g, { printed: 0, hit: 0, draft: 0, wrong: 0 }]),
  ) as Record<FieldGroup, GroupScore>
}

export function scoreFixture(
  file: string,
  set: "dev" | "holdout",
  expectedInvoice: unknown,
  printedPaths: string[],
  result: { suggestions: Suggestion[]; draft: unknown; warnings: string[] },
  textLayer: boolean,
  ms: number,
): FixtureScore {
  const expected = flatten(expectedInvoice)
  const draft = flatten(result.draft)
  const invalid = [...expected].filter(([p, v]) => groundTruthInvalid(p, v)).map(([p]) => p)
  const excluded = new Set(invalid)
  const groups = emptyGroups()
  const missed: PathError[] = []
  let hit = 0
  let printed = 0
  for (const path of printedPaths) {
    if (excluded.has(path)) continue
    printed++
    const g = groups[groupOf(path)]
    g.printed++
    if (draft.has(path) && sameValue(draft.get(path), expected.get(path))) {
      hit++
      g.hit++
    } else {
      missed.push({ path, got: draft.get(path), expected: expected.get(path) })
    }
  }
  const draftErrors: PathError[] = []
  let draftCount = 0
  for (const [path, value] of draft) {
    if (excluded.has(path)) continue
    draftCount++
    const g = groups[groupOf(path)]
    g.draft++
    if (!expected.has(path) || !sameValue(value, expected.get(path))) {
      g.wrong++
      draftErrors.push({ path, got: value, expected: expected.get(path) })
    }
  }
  const confidentErrors: PathError[] = []
  for (const s of result.suggestions) {
    if (s.confidence < PREFILL_THRESHOLD || excluded.has(s.path)) continue
    if (!expected.has(s.path) || !sameValue(s.value, expected.get(s.path))) {
      confidentErrors.push({
        path: s.path,
        got: s.value,
        expected: expected.get(s.path),
        confidence: s.confidence,
        rule: s.rule,
      })
    }
  }
  return {
    file,
    set,
    textLayer,
    printed,
    hit,
    draft: draftCount,
    wrong: draftErrors.length,
    missed,
    draftErrors,
    confidentErrors,
    groundTruthInvalid: invalid,
    groups,
    warnings: result.warnings,
    ms,
  }
}

function aggregate(scores: FixtureScore[]): Aggregate {
  const groups = emptyGroups()
  let printed = 0
  let hit = 0
  let draft = 0
  let wrong = 0
  let confidentErrors = 0
  for (const s of scores) {
    printed += s.printed
    hit += s.hit
    draft += s.draft
    wrong += s.wrong
    confidentErrors += s.confidentErrors.length
    for (const g of FIELD_GROUPS) {
      groups[g].printed += s.groups[g].printed
      groups[g].hit += s.groups[g].hit
      groups[g].draft += s.groups[g].draft
      groups[g].wrong += s.groups[g].wrong
    }
  }
  return {
    printed,
    hit,
    recall: printed === 0 ? 1 : hit / printed,
    draft,
    wrong,
    precision: draft === 0 ? 1 : (draft - wrong) / draft,
    confidentErrors,
    groups,
  }
}

export async function evaluate(set: FixtureSet = "dev"): Promise<EvalReport> {
  const manifest = JSON.parse(
    readFileSync(resolve(FIXTURES_DIR, "manifest.json"), "utf8"),
  ) as ManifestEntry[]
  const fixtures: FixtureScore[] = []
  const failures: string[] = []
  for (const entry of manifest) {
    const fixtureSet = DEV_FIXTURES.includes(entry.file.slice(0, 2)) ? "dev" : "holdout"
    if (set !== "all" && set !== fixtureSet) continue
    const bytes = new Uint8Array(readFileSync(resolve(FIXTURES_DIR, entry.file)))
    const expectedInvoice: unknown = JSON.parse(
      readFileSync(resolve(FIXTURES_DIR, entry.expected), "utf8"),
    )
    const doc = await extractPdfText(bytes)
    const start = performance.now()
    const result = extractInvoice(doc)
    const ms = performance.now() - start
    const score = scoreFixture(
      entry.file,
      fixtureSet,
      expectedInvoice,
      entry.printed,
      result,
      doc.hasTextLayer,
      ms,
    )
    if (!doc.hasTextLayer) {
      score.negativeOk = result.suggestions.length === 0 && result.warnings.length > 0
      if (!score.negativeOk)
        failures.push(`${entry.file}: PDF sans texte mais résultat non vide ou sans avertissement`)
    }
    fixtures.push(score)
  }
  const dev = aggregate(fixtures.filter((f) => f.set === "dev"))
  const holdout = aggregate(fixtures.filter((f) => f.set === "holdout"))
  if (set !== "holdout") {
    if (dev.recall < RECALL_THRESHOLD)
      failures.push(`dev recall ${dev.recall.toFixed(3)} < ${RECALL_THRESHOLD}`)
    if (dev.confidentErrors > 0) failures.push(`dev confident errors: ${dev.confidentErrors}`)
  }
  return { fixtures, dev, holdout, passed: failures.length === 0, failures }
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const ratio = (a: number, b: number) => (b === 0 ? "-" : `${a}/${b}`)

export function formatReport(report: EvalReport, verbose = false): string {
  const out: string[] = []
  out.push(
    "| fixture | set | recall (printed) | precision (draft) | confident errors | GT invalid | ms |",
  )
  out.push("|---|---|---|---|---|---|---|")
  for (const f of report.fixtures) {
    if (!f.textLayer) {
      out.push(
        `| ${f.file} | ${f.set} | (no text layer: ${f.negativeOk ? "empty + warning OK" : "FAIL"}) | | | | ${f.ms.toFixed(1)} |`,
      )
      continue
    }
    out.push(
      `| ${f.file} | ${f.set} | ${ratio(f.hit, f.printed)} ${pct(f.printed ? f.hit / f.printed : 1)} | ${ratio(f.draft - f.wrong, f.draft)} ${pct(f.draft ? (f.draft - f.wrong) / f.draft : 1)} | ${f.confidentErrors.length} | ${f.groundTruthInvalid.length} | ${f.ms.toFixed(1)} |`,
    )
  }
  for (const [name, agg] of [
    ["dev", report.dev],
    ["holdout", report.holdout],
  ] as const) {
    if (agg.printed === 0 && agg.draft === 0) continue
    out.push("")
    out.push(
      `**${name}**: recall ${ratio(agg.hit, agg.printed)} = ${pct(agg.recall)}, precision ${ratio(agg.draft - agg.wrong, agg.draft)} = ${pct(agg.precision)}, confident errors ${agg.confidentErrors}`,
    )
    out.push("")
    out.push("| group | recall | precision |")
    out.push("|---|---|---|")
    for (const g of FIELD_GROUPS) {
      const s = agg.groups[g]
      if (s.printed === 0 && s.draft === 0) continue
      out.push(
        `| ${g} | ${ratio(s.hit, s.printed)} ${s.printed ? pct(s.hit / s.printed) : ""} | ${ratio(s.draft - s.wrong, s.draft)} ${s.draft ? pct((s.draft - s.wrong) / s.draft) : ""} |`,
      )
    }
  }
  const invalid = report.fixtures.flatMap((f) => f.groundTruthInvalid.map((p) => `${f.file}:${p}`))
  if (invalid.length > 0) {
    out.push("")
    out.push(`Ground truth failing its own checksum (excluded from metrics): ${invalid.join(", ")}`)
  }
  for (const f of report.fixtures) {
    if (f.confidentErrors.length > 0) {
      out.push("")
      out.push(`CONFIDENT ERRORS ${f.file}:`)
      for (const e of f.confidentErrors)
        out.push(
          `  ${e.path}: got ${JSON.stringify(e.got)} expected ${JSON.stringify(e.expected)} (${e.confidence} ${e.rule})`,
        )
    }
    if (verbose) {
      if (f.missed.length > 0) {
        out.push(`missed ${f.file}:`)
        for (const e of f.missed)
          out.push(
            `  ${e.path}: got ${JSON.stringify(e.got)} expected ${JSON.stringify(e.expected)}`,
          )
      }
      const wrongNotConfident = f.draftErrors.filter(
        (e) => !f.confidentErrors.some((c) => c.path === e.path),
      )
      for (const e of wrongNotConfident)
        out.push(`  draft error ${f.file} ${e.path}: ${JSON.stringify(e.got)}`)
      if (f.warnings.length > 0) out.push(`warnings ${f.file}: ${f.warnings.join(" | ")}`)
    }
  }
  out.push("")
  out.push(report.passed ? "PASS" : `FAIL: ${report.failures.join("; ")}`)
  return out.join("\n")
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const setIndex = args.indexOf("--set")
  const setArg = setIndex >= 0 ? args[setIndex + 1] : "dev"
  const set: FixtureSet = setArg === "holdout" || setArg === "all" ? setArg : "dev"
  const report = await evaluate(set)
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2))
  else console.log(formatReport(report, args.includes("--verbose")))
  process.exit(report.passed ? 0 : 1)
}
