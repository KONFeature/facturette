/**
 * Helpers around extraction suggestions: turning a candidate into a form value, showing it as a
 * short French label, and keeping line-indexed candidates attached to the right line when the
 * user adds, removes, duplicates or reorders lines.
 */
import {
  INVOICE_TYPES,
  OPERATION_CATEGORIES,
  PAYMENT_MEANS,
  UNIT_CODES,
  VAT_CATEGORIES,
} from "../../domain/invoice"
import type { Suggestion } from "../../lib/extract/types"
import { formatIban, formatSiren, formatSiret } from "../../lib/validation/identifiers"
import { getPath, isEmptyValue, normalizeForCompare } from "./fieldState"
import { formatNumberDisplay, formatNumberInput } from "./numbers"

const leafOf = (path: string): string => path.split(".").at(-1) ?? ""

/** What to write into the form input when the user applies a candidate. */
export function formValueForSuggestion(path: string, value: Suggestion["value"]): string | boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return formatNumberInput(value)
  switch (leafOf(path)) {
    case "siren":
      return formatSiren(value)
    case "siret":
      return formatSiret(value)
    case "iban":
      return formatIban(value)
    default:
      return value
  }
}

const labelIn = (list: readonly { code: string; label: string }[], code: string): string =>
  list.find((x) => x.code === code)?.label ?? code

const MAX_LABEL = 64

/** Short French rendering of a candidate for the "Suggestion : …" chip. */
export function suggestionLabel(path: string, value: Suggestion["value"]): string {
  if (typeof value === "boolean") return value ? "Oui" : "Non"
  if (typeof value === "number") {
    return leafOf(path) === "vatRate"
      ? `${formatNumberDisplay(value)} %`
      : formatNumberDisplay(value)
  }
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (date) return `${date[3]}/${date[2]}/${date[1]}`
  let text: string
  switch (leafOf(path)) {
    case "typeCode":
      text = labelIn(INVOICE_TYPES, value)
      break
    case "operationCategory":
      text = labelIn(OPERATION_CATEGORIES, value)
      break
    case "unitCode":
      text = labelIn(UNIT_CODES, value)
      break
    case "vatCategory":
      text = labelIn(VAT_CATEGORIES, value)
      break
    case "meansCode":
      text = labelIn(PAYMENT_MEANS, value)
      break
    default:
      text = String(formValueForSuggestion(path, value))
  }
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1).trimEnd()}…` : text
}

// ---------------------------------------------------------------------------------------------
// Line-indexed candidates
// ---------------------------------------------------------------------------------------------

const LINE_PATH = /^lines\.(\d+)\.(.+)$/

/**
 * `newToOld[newIndex]` = index the line had before the change, or `null` for a brand-new line.
 * Candidates follow their line; candidates of removed lines are dropped; a duplicated line
 * (mapped as `null`) starts without candidates.
 */
export function reindexLineSuggestions(
  suggestions: readonly Suggestion[],
  newToOld: readonly (number | null)[],
): Suggestion[] {
  const out: Suggestion[] = []
  for (const s of suggestions) {
    const m = LINE_PATH.exec(s.path)
    if (!m) {
      out.push(s)
      continue
    }
    const oldIndex = Number(m[1])
    const newIndex = newToOld.indexOf(oldIndex)
    if (newIndex >= 0) out.push({ ...s, path: `lines.${newIndex}.${m[2]}` })
  }
  return out
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i)

export const mappingAfterRemove = (length: number, index: number): number[] =>
  range(length).filter((i) => i !== index)

export function mappingAfterInsert(length: number, at: number): (number | null)[] {
  const out: (number | null)[] = range(length)
  out.splice(at, 0, null)
  return out
}

export function mappingAfterMove(length: number, from: number, to: number): number[] {
  const out = range(length)
  const [moved] = out.splice(from, 1)
  if (moved !== undefined) out.splice(to, 0, moved)
  return out
}

const matches = (s: Suggestion, draft: unknown): boolean => {
  const current = getPath(draft, s.path)
  return (
    !isEmptyValue(current) &&
    normalizeForCompare(s.path, current) === normalizeForCompare(s.path, s.value)
  )
}

/**
 * When the form is re-opened (Retour, then Continuer) the lines may have been reordered or edited
 * since the extraction. A line keeps its candidates only while it still holds its detected
 * designation (or, without a detected designation, a detected quantity / price / description):
 * shared values such as the unit or the VAT rate say nothing about which line it is, and the
 * candidates would otherwise be offered on the wrong line.
 */
export function pruneStaleLineSuggestions(
  suggestions: readonly Suggestion[],
  draft: unknown,
): Suggestion[] {
  const byLine = new Map<number, Suggestion[]>()
  for (const s of suggestions) {
    const m = LINE_PATH.exec(s.path)
    if (!m) continue
    const index = Number(m[1])
    byLine.set(index, [...(byLine.get(index) ?? []), s])
  }
  const alive = new Set<number>()
  for (const [index, own] of byLine) {
    const names = own.filter((s) => s.path.endsWith(".name"))
    const identity =
      names.length > 0
        ? names
        : own.filter((s) => /\.(quantity|unitPrice|description)$/.test(s.path))
    if (identity.some((s) => matches(s, draft))) alive.add(index)
  }
  return suggestions.filter((s) => {
    const m = LINE_PATH.exec(s.path)
    return !m || alive.has(Number(m[1]))
  })
}
