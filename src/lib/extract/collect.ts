/**
 * Suggestion collector: rules push candidates, then the best candidate per path above the
 * pre-fill threshold is folded into the draft.
 */
import type { InvoiceDraft } from "../../domain/invoice"
import type { Cell } from "./layout"
import { evidenceOf } from "./layout"
import { normalizeSpaces } from "./text"
import { PREFILL_THRESHOLD, type Suggestion } from "./types"

export class Collector {
  readonly suggestions: Suggestion[] = []
  readonly warnings: string[] = []

  add(
    path: string,
    value: string | number | boolean | undefined,
    confidence: number,
    cells: Cell[],
    rule: string,
    evidenceText?: string,
  ): void {
    if (value === undefined) return
    if (typeof value === "string" && value.trim() === "") return
    if (typeof value === "number" && !Number.isFinite(value)) return
    const clean = typeof value === "string" ? normalizeSpaces(value) : value
    const conf = Math.max(0, Math.min(0.99, Math.round(confidence * 100) / 100))
    const existing = this.suggestions.find((s) => s.path === path && sameValue(s.value, clean))
    if (existing) {
      // Two independent rules agreeing is extra evidence.
      if (existing.rule !== rule)
        existing.confidence = Math.min(0.99, Math.max(existing.confidence, conf) + 0.03)
      return
    }
    this.suggestions.push({
      path,
      value: clean,
      confidence: conf,
      evidence: evidenceOf(cells, evidenceText),
      rule,
    })
  }

  warn(message: string): void {
    if (!this.warnings.includes(message)) this.warnings.push(message)
  }

  best(path: string): Suggestion | undefined {
    let best: Suggestion | undefined
    for (const s of this.suggestions)
      if (s.path === path && (!best || s.confidence > best.confidence)) best = s
    return best
  }

  value(path: string, min = PREFILL_THRESHOLD): Suggestion["value"] | undefined {
    const b = this.best(path)
    return b && b.confidence >= min ? b.value : undefined
  }

  all(path: string): Suggestion[] {
    return this.suggestions.filter((s) => s.path === path)
  }

  /** Scale every suggestion of a path (e.g. when two rules disagree). */
  demote(path: string, factor: number): void {
    for (const s of this.suggestions)
      if (s.path === path) s.confidence = Math.round(s.confidence * factor * 100) / 100
  }

  remove(predicate: (s: Suggestion) => boolean): void {
    for (let i = this.suggestions.length - 1; i >= 0; i--) {
      const s = this.suggestions[i]
      if (s && predicate(s)) this.suggestions.splice(i, 1)
    }
  }
}

export function sameValue(a: Suggestion["value"], b: Suggestion["value"]): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.005
  if (typeof a === "string" && typeof b === "string")
    return normalizeSpaces(a).toLowerCase() === normalizeSpaces(b).toLowerCase()
  return a === b
}

/**
 * When two different values compete for one path with similar confidence, neither is trusted
 * enough to be pre-filled: the user picks.
 */
export function resolveConflicts(collector: Collector): void {
  const byPath = new Map<string, Suggestion[]>()
  for (const s of collector.suggestions) {
    const list = byPath.get(s.path) ?? []
    list.push(s)
    byPath.set(s.path, list)
  }
  for (const list of byPath.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => b.confidence - a.confidence)
    const [first, second] = list
    if (!first || !second) continue
    if (!sameValue(first.value, second.value) && second.confidence >= first.confidence - 0.1) {
      first.confidence = Math.min(first.confidence, PREFILL_THRESHOLD - 0.05)
    }
    // Alternatives are offered, never pre-filled: keep them under the threshold.
    for (const s of list.slice(1)) {
      if (!sameValue(s.value, first.value))
        s.confidence = Math.min(s.confidence, PREFILL_THRESHOLD - 0.05)
    }
  }
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".")
  let node: Record<string, unknown> | unknown[] = target
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] ?? ""
    const last = i === keys.length - 1
    const nextIsIndex = /^\d+$/.test(keys[i + 1] ?? "")
    if (Array.isArray(node)) {
      const index = Number(key)
      if (last) node[index] = value
      else {
        const child = node[index]
        if (typeof child !== "object" || child === null) node[index] = nextIsIndex ? [] : {}
        node = node[index] as Record<string, unknown> | unknown[]
      }
    } else {
      if (last) node[key] = value
      else {
        const child = node[key]
        if (typeof child !== "object" || child === null) node[key] = nextIsIndex ? [] : {}
        node = node[key] as Record<string, unknown> | unknown[]
      }
    }
  }
}

export function buildDraft(suggestions: Suggestion[]): InvoiceDraft {
  const draft: Record<string, unknown> = {}
  const done = new Set<string>()
  const sorted = [...suggestions].sort((a, b) => b.confidence - a.confidence)
  for (const s of sorted) {
    if (s.confidence < PREFILL_THRESHOLD || done.has(s.path)) continue
    done.add(s.path)
    setPath(draft, s.path, s.value)
  }
  const lines = draft.lines
  if (Array.isArray(lines)) {
    // Keep indices aligned with the suggestion paths: a line with nothing confident stays empty.
    draft.lines = Array.from(lines, (l) => (typeof l === "object" && l !== null ? l : {}))
  }
  return draft as InvoiceDraft
}
