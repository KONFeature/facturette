/**
 * Per-field state of the review form, derived (pure, no React) from:
 *  - the extraction candidates (`Suggestion[]`, several may share a path),
 *  - the current draft (what the form holds right now),
 *  - the paths currently required, the validation issues and which fields were touched,
 *  - the saved seller profile (to mark fields it filled).
 *
 * Contract used by the field components:
 *  - `source`: where the CURRENT value comes from.
 *      "detected" = it equals an extraction candidate (pre-filled, or applied with one click);
 *      "profile"  = not detected, but equals the saved seller profile value;
 *      "manual"   = filled, but by neither (typed by the user: the detected marker is lost);
 *      "empty"    = blank.
 *  - `detected`: the candidate that matches the current value (the one with the highest
 *      confidence when several candidates carry the same value) and its confidence cue.
 *      Its `evidence.bbox` is what "Voir dans le PDF" highlights.
 *  - `alternatives`: candidates whose value differs from the current one, best first, one per
 *      distinct value. Rendered as "Suggestion : … [Utiliser]" chips.
 *  - `error` / `warning`: the first issue of that severity on the path, only once the field was
 *      touched or a submit was attempted (nothing is shouted at on load). `hasError` is not gated.
 */
import type { Suggestion } from "../../lib/extract/types"
import { PREFILL_THRESHOLD } from "../../lib/extract/types"
import type { ValidationIssue } from "../../lib/validation"

/** Confidence at or above which a detected value is labelled "fiable". */
export const RELIABLE_THRESHOLD = 0.85

export type ConfidenceLevel = "reliable" | "check"
export type FieldSource = "detected" | "profile" | "manual" | "empty"

export const confidenceLevel = (confidence: number): ConfidenceLevel =>
  confidence >= RELIABLE_THRESHOLD ? "reliable" : "check"

export interface DetectedInfo {
  suggestion: Suggestion
  level: ConfidenceLevel
}

export interface FieldState {
  path: string
  required: boolean
  source: FieldSource
  detected: DetectedInfo | null
  alternatives: Suggestion[]
  error: ValidationIssue | null
  warning: ValidationIssue | null
  /** An error exists on this path whether or not it is displayed yet. */
  hasError: boolean
}

export interface FieldStateContext {
  /** Draft built from the current form values. */
  draft: unknown
  suggestions: readonly Suggestion[]
  requiredPaths: ReadonlySet<string>
  issues: readonly ValidationIssue[]
  touched: ReadonlySet<string>
  /** True once the user tried to continue: every issue becomes visible. */
  submitted: boolean
  /** Draft view of the saved seller profile (seller, payment, legalNotes, vatExemptionReason). */
  profile?: unknown
}

export function getPath(root: unknown, path: string): unknown {
  let cur: unknown = root
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim() === ""
  if (typeof value === "number") return !Number.isFinite(value)
  return false
}

const IDENTIFIER_LEAVES = new Set(["siren", "siret", "vatNumber", "iban", "bic"])

/** Comparable form of a value: identifiers ignore spaces/case, text ignores case and spacing runs. */
export function normalizeForCompare(path: string, value: unknown): string {
  if (typeof value === "number") return String(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value !== "string") return ""
  const leaf = path.split(".").at(-1) ?? ""
  if (IDENTIFIER_LEAVES.has(leaf)) return value.replace(/[\s\u00a0\u202f]+/g, "").toUpperCase()
  return value.replace(/\s+/g, " ").trim().toLowerCase()
}

/** Candidates for `path`, best confidence first, stable for ties. */
export function candidatesFor(suggestions: readonly Suggestion[], path: string): Suggestion[] {
  return suggestions.filter((s) => s.path === path).sort((a, b) => b.confidence - a.confidence)
}

export function deriveFieldState(path: string, ctx: FieldStateContext): FieldState {
  const value = getPath(ctx.draft, path)
  const empty = isEmptyValue(value)
  const current = empty ? "" : normalizeForCompare(path, value)

  const candidates = candidatesFor(ctx.suggestions, path)
  const matching = empty
    ? undefined
    : candidates.find((s) => normalizeForCompare(path, s.value) === current)

  const seen = new Set<string>()
  const alternatives: Suggestion[] = []
  for (const s of candidates) {
    const key = normalizeForCompare(path, s.value)
    if (key === "" || key === current || seen.has(key)) continue
    seen.add(key)
    alternatives.push(s)
  }

  let source: FieldSource
  if (empty) source = "empty"
  else if (matching) source = "detected"
  else if (
    ctx.profile !== undefined &&
    normalizeForCompare(path, getPath(ctx.profile, path)) === current
  ) {
    source = "profile"
  } else source = "manual"

  const visible = ctx.submitted || ctx.touched.has(path)
  const onPath = ctx.issues.filter((i) => i.path === path)
  const firstError = onPath.find((i) => i.severity === "error") ?? null
  const firstWarning = onPath.find((i) => i.severity === "warning") ?? null

  return {
    path,
    required: ctx.requiredPaths.has(path),
    source,
    detected: matching
      ? { suggestion: matching, level: confidenceLevel(matching.confidence) }
      : null,
    alternatives,
    error: visible ? firstError : null,
    warning: visible ? firstWarning : null,
    hasError: firstError !== null,
  }
}

/** True when the extractor found the value but was not sure enough to pre-fill the form. */
export const isBelowThreshold = (s: Suggestion): boolean => s.confidence < PREFILL_THRESHOLD

export interface DetectionSummary {
  /** Distinct paths with at least one candidate. */
  withCandidates: number
  /** Paths whose current value matches a candidate. */
  detected: number
  /** Paths with a candidate that is not (yet) applied. */
  toReview: number
}

/** Counts shown in the page header. Line paths count per line. */
export function summarizeDetection(
  suggestions: readonly Suggestion[],
  draft: unknown,
): DetectionSummary {
  const paths = [...new Set(suggestions.map((s) => s.path))]
  let detected = 0
  let toReview = 0
  for (const path of paths) {
    const value = getPath(draft, path)
    const current = isEmptyValue(value) ? null : normalizeForCompare(path, value)
    const hit =
      current !== null &&
      candidatesFor(suggestions, path).some((s) => normalizeForCompare(path, s.value) === current)
    if (hit) detected++
    else toReview++
  }
  return { withCandidates: paths.length, detected, toReview }
}
