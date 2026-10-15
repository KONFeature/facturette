/**
 * Payment details (IBAN, BIC, means, terms), legal mentions (late-payment penalty, 40 € fee,
 * early-payment discount) and VAT exemption mentions.
 */
import { isValidIban, normalizeIban } from "../validation/identifiers"
import type { Collector } from "./collect"
import { type Cell, type Layout, partsOf } from "./layout"
import { fold } from "./text"

const IBAN_START_RE = /\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]){10,32})/
const BIC_RE =
  /\b(?:bic|swift|code bic|bic\/swift|swift\/bic)\s*(?:\/\s*swift)?\s*:?\s*([A-Z]{4}\s?[A-Z]{2}\s?[A-Z0-9]{2}(?:\s?[A-Z0-9]{3})?)\b/i

/** Longest prefix of the compacted text that is a checksum-valid IBAN. */
function validIbanPrefix(raw: string): string | undefined {
  const s = normalizeIban(raw)
  for (let len = Math.min(34, s.length); len >= 15; len--) {
    const candidate = s.slice(0, len)
    if (isValidIban(candidate)) return candidate
  }
  return undefined
}

function extractBank(layout: Layout, collector: Collector, buyerCells: Set<number>): void {
  let ibanCountry: string | undefined
  // With a direct debit, the printed IBAN is usually the buyer's debited account.
  const directDebit = layout.cells.some((c) => /\bprelev(ement|e)\b/.test(c.folded))
  for (const cell of layout.cells) {
    for (const part of partsOf(cell)) {
      const labelled =
        /^(iban|i\.b\.a\.n|n° iban|code iban|compte iban)\b/.test(part.folded) ||
        /\biban\s*:/.test(part.folded)
      const m = IBAN_START_RE.exec(part.text.toUpperCase())
      if (!m?.[1]) continue
      // Stop at the next label ("IBAN : FR76… BIC : …" in one run).
      const raw = m[1].split(/\s(?=BIC|SWIFT|CODE)/)[0] ?? m[1]
      const valid = validIbanPrefix(raw)
      if (valid && (buyerCells.has(cell.id) || directDebit)) {
        collector.add("payment.iban", valid, 0.45, [cell], "iban-buyer-or-debit")
        ibanCountry = valid.slice(0, 2)
      } else if (valid) {
        collector.add("payment.iban", valid, labelled ? 0.97 : 0.9, [cell], "iban-checksum")
        ibanCountry = valid.slice(0, 2)
      } else if (labelled) {
        const value = normalizeIban(raw)
        collector.add("payment.iban", value, 0.35, [cell], "iban-invalid")
        collector.warn(`L'IBAN lu dans le PDF (${value}) est invalide : vérifiez-le.`)
      }
    }
  }
  for (const cell of layout.cells) {
    for (const part of partsOf(cell)) {
      const m = BIC_RE.exec(part.text)
      if (!m?.[1]) continue
      const bic = m[1].replace(/\s/g, "").toUpperCase()
      if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) continue
      const matchesIban = ibanCountry !== undefined && bic.slice(4, 6) === ibanCountry
      if (buyerCells.has(cell.id) || directDebit) {
        collector.add("payment.bic", bic, 0.45, [cell], "bic-buyer-or-debit")
      } else {
        collector.add("payment.bic", bic, matchesIban ? 0.93 : 0.78, [cell], "bic-label")
      }
    }
  }
}

const MEANS: Array<[RegExp, string]> = [
  [/\bvirement (bancaire )?sepa\b|\bsepa credit transfer\b/, "58"],
  [/\bprelevement( sepa)?\b/, "59"],
  [/\bvirement\b|\bbank transfer\b/, "30"],
  [/\bcheques?\b/, "20"],
  [/\bcarte (bancaire|bleue)\b|\bcb\b|\bcredit card\b/, "48"],
  [/\bespeces\b|\bnumeraire\b|\bcash\b/, "10"],
]

/** Distinct means named in a text; "virement SEPA" is not also counted as a plain "virement". */
function meansIn(folded: string): string[] {
  const codes = [...new Set(MEANS.filter(([re]) => re.test(folded)).map(([, c]) => c))]
  return codes.filter((c) => !(c === "30" && codes.includes("58")))
}

/** Parts of a cell, further split into sentences ("Date des travaux : … . Paiement à 15 jours."). */
function sentencesOf(cell: Cell): Array<{ text: string; folded: string }> {
  return partsOf(cell).flatMap((p) =>
    p.text.split(/(?<=[\p{Ll}\d)]\.)\s+(?=\p{Lu})/u).map((text) => ({ text, folded: fold(text) })),
  )
}

function extractMeans(layout: Layout, collector: Collector): void {
  for (const cell of layout.cells) {
    for (const part of sentencesOf(cell)) {
      const m =
        /^(mode|moyen|modalites?|methode|type) (de |du )?(reglement|paiement)\s*:?\s*(.*)$/.exec(
          part.folded,
        )
      if (m) {
        // "Virement ou chèque": several means, let the user choose.
        const codes = meansIn(m[4] ?? "")
        const code = codes[0]
        if (code) {
          const confidence = codes.length === 1 ? 0.86 : 0.45
          collector.add("payment.meansCode", code, confidence, [cell], "payment-means-label")
        }
        continue
      }
      if (!/\b(reglement|paiement|payable|payer|regler|payment)\b/.test(part.folded)) continue
      const codes = meansIn(part.folded)
      const code = codes.length === 1 ? codes[0] : undefined
      if (!code) continue
      // "Règlement par chèque", "payable par virement": explicit; a bare mention is weak.
      const explicit =
        /\b(reglement|paiement|payable|a regler|a payer)\s+(uniquement\s+)?(par|en)\b/.test(
          part.folded,
        )
      collector.add("payment.meansCode", code, explicit ? 0.74 : 0.55, [cell], "payment-means-word")
    }
  }
}

const TERMS_RE =
  /(\b\d{1,3}\s*jours\b|\b\d{1,3}\s*days\b|\ba (la )?reception\b|\bcomptant\b|\bfin de mois\b|\ba l'echeance\b|\bimmediat|\bsous huitaine\b|\bdes reception\b|\bau plus tard\b|\bnet\s*\d+\b)/
const TERMS_START_RE =
  /^(paiement|payable|reglement|solde|a regler|a payer|delai de paiement|conditions de (paiement|reglement)|termes de paiement|echeance|net a \d+|net \d+ (jours|days)|montant a deduire|a deduire|cet avoir)/
const TERMS_LABEL_RE =
  /^(conditions de (paiement|reglement)|delais? de paiement|termes de paiement|modalites de paiement|payment terms)\s*:\s*(.+)$/
const LEGAL_NOTE_RE = /penalite|indemnite|recouvrement|escompte|interet/

function extractTerms(layout: Layout, collector: Collector, isCreditNote: boolean): void {
  for (const cell of layout.cells) {
    for (const part of sentencesOf(cell)) {
      const f = part.folded
      if (LEGAL_NOTE_RE.test(f) || f.length > 140) continue
      const labelled = TERMS_LABEL_RE.exec(f)
      if (labelled?.[3]) {
        const text = part.text.slice(part.text.length - labelled[3].length)
        collector.add("payment.termsText", text, 0.8, [cell], "payment-terms-label")
        continue
      }
      if (TERMS_START_RE.test(f) && TERMS_RE.test(f) && !/^(mode|moyen)/.test(f)) {
        collector.add("payment.termsText", part.text, 0.76, [cell], "payment-terms-sentence")
      } else if (
        isCreditNote &&
        /\b(a deduire|sera deduit|sera rembourse|remboursement|a imputer)\b/.test(f)
      ) {
        collector.add("payment.termsText", part.text, 0.62, [cell], "credit-note-terms")
      }
    }
  }
}

/** A sentence may wrap: join following rows of the same block until it ends with a full stop. */
function sentenceFrom(layout: Layout, cell: Cell): { text: string; cells: Cell[] } {
  const block = layout.blocks[layout.blockOf[cell.id] ?? -1] ?? [cell]
  const cells = [cell]
  let text = cell.text
  for (let i = block.indexOf(cell) + 1; i < block.length && !/[.!]$/.test(text); i++) {
    const next = block[i]
    if (!next || !/^[\p{Ll}\d(]/u.test(next.text)) break
    text = `${text} ${next.text}`
    cells.push(next)
    if (cells.length > 4) break
  }
  return { text, cells }
}

function extractLegalNotes(layout: Layout, collector: Collector): void {
  const consumed = new Set<number>()
  for (const cell of layout.cells) {
    const f = cell.folded
    if (f.length < 15 || consumed.has(cell.id)) continue
    const { text, cells } = sentenceFrom(layout, cell)
    for (const c of cells) consumed.add(c.id)
    for (const sentence of text.split(/(?<=[.!])\s+(?=[\p{Lu}])/u)) {
      const ft = fold(sentence)
      // One sentence may carry both the penalty and the 40 € fee: it then fills both mentions.
      if (/\b(indemnite forfaitaire|frais de recouvrement)\b/.test(ft) && /\b40\b/.test(ft)) {
        collector.add("legalNotes.recoveryFee", sentence, 0.85, cells, "legal-recovery-fee")
      }
      if (
        /\bpenalites?\b|\binterets? de retard\b|\btaux d'interet legal\b|\btaux de refinancement\b/.test(
          ft,
        )
      ) {
        collector.add("legalNotes.latePaymentPenalty", sentence, 0.85, cells, "legal-late-penalty")
      } else if (/\bescompte\b/.test(ft)) {
        collector.add(
          "legalNotes.earlyPaymentDiscount",
          sentence,
          0.85,
          cells,
          "legal-early-discount",
        )
      }
    }
  }
}

export interface VatExemption {
  category: string
  reason: string
}

/** "TVA non applicable, art. 293 B du CGI" and other exemption mentions. */
export function extractVatExemption(
  layout: Layout,
  collector: Collector,
): VatExemption | undefined {
  for (const cell of layout.cells) {
    for (const part of partsOf(cell)) {
      const f = part.folded
      const franchise =
        /tva non applicable[^;]{0,40}?293\s*b(\s+du\s+(cgi|code general des impots))?|franchise en base de tva[^.;]*/.exec(
          f,
        )
      if (franchise) {
        const start = f.indexOf(franchise[0])
        const reason =
          part.text.length === f.length
            ? part.text.slice(start, start + franchise[0].length)
            : franchise[0]
        collector.add("vatExemptionReason", reason, 0.9, [cell], "vat-franchise-293b")
        return { category: "E", reason }
      }
    }
  }
  for (const cell of layout.cells) {
    const f = cell.folded
    const special: Array<[RegExp, string]> = [
      [/autoliquidation/, "AE"],
      [/livraison intracommunautaire|262 ter/, "K"],
      [/exportation|262 i\b|hors ue/, "G"],
      [/exoneration de tva|exonere de tva|art(icle|\.)?\s*261/, "E"],
    ]
    for (const [re, category] of special) {
      if (re.test(f) && /\btva\b|\bcgi\b|\bart/.test(f)) {
        collector.add("vatExemptionReason", cell.text, 0.62, [cell], `vat-exemption-${category}`)
        return { category, reason: cell.text }
      }
    }
  }
  return undefined
}

export function extractPayment(
  layout: Layout,
  collector: Collector,
  isCreditNote: boolean,
  buyerCells: Set<number>,
): void {
  extractBank(layout, collector, buyerCells)
  extractMeans(layout, collector)
  extractTerms(layout, collector, isCreditNote)
  extractLegalNotes(layout, collector)
}
