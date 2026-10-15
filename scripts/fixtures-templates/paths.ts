/** Dot-path helpers over an Invoice (arrays use numeric segments: `lines.0.name`). */
import type { Invoice } from "../../src/domain/invoice"

/** Leaf fields that are codes/flags, never printed as such. */
const NON_TEXT_LEAVES = new Set([
  "typeCode",
  "kind",
  "currency",
  "operationCategory",
  "vatCategory",
  "unitCode",
  "meansCode",
  "countryCode",
  "vatOnDebits",
])

export function getPath(value: unknown, path: string): unknown {
  let cur: unknown = value
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

function collect(value: unknown, prefix: string, out: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      collect(v, prefix ? `${prefix}.${i}` : String(i), out)
    })
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collect(v, prefix ? `${prefix}.${k}` : k, out)
  } else if (value !== undefined) {
    out.push(prefix)
  }
}

/** Every defined leaf of the invoice, in document order. */
export function leafPaths(invoice: Invoice): string[] {
  const out: string[] = []
  collect(invoice, "", out)
  return out
}

/** Leaves that carry human-readable text or numbers (codes and flags excluded). */
export function textLeafPaths(invoice: Invoice): string[] {
  return leafPaths(invoice).filter((p) => !NON_TEXT_LEAVES.has(p.split(".").at(-1) ?? ""))
}

/** Paths the PDF is expected to show: text leaves, minus the fixture's hidden ones. */
export function printedPaths(invoice: Invoice, hidden: readonly string[]): string[] {
  const skip = new Set(hidden)
  return textLeafPaths(invoice).filter((p) => {
    if (skip.has(p)) return false
    const m = /^lines\.(\d+)\.vatRate$/.exec(p)
    // Non-standard-rated lines have no VAT rate to show.
    if (m && invoice.lines[Number(m[1])]?.vatCategory !== "S") return false
    return true
  })
}
