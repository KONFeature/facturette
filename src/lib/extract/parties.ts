/**
 * Seller, buyer and delivery address. Party blocks are found by their labels ("Facturé à",
 * "Client", "Destinataire", "Émetteur"…), by position (the top-left letterhead is the seller),
 * by the known seller hints and, for sellers that only print their legal identity in the page
 * footer, by the footer lines.
 */
import {
  isValidFrenchVatNumber,
  isValidSiren,
  isValidSiret,
  normalizeVatNumber,
} from "../validation/identifiers"
import type { Collector } from "./collect"
import { wrappedPairs } from "./labels"
import { blockOfCell, type Cell, cellToTheRight, type Layout, partsOf } from "./layout"
import { compact, fold, normalizeSpaces } from "./text"
import type { ExtractionOptions } from "./types"

type Role = "seller" | "buyer" | "delivery"

interface PartyLine {
  text: string
  folded: string
  cell: Cell
}

interface PartyBlock {
  role: Role
  /** Multiplies every field confidence: how sure we are that this block is that party. */
  factor: number
  rule: string
  /** First line is the party name unless `hasName` is false. */
  lines: PartyLine[]
  hasName: boolean
}

const BUYER_LABEL_RE =
  /^(client|facture a|facturer a|factures? adressee?s? a|adresse de facturation|adresse facturation|adresse a|adressee? a|destinataire|acheteur|a l'attention de|bill to|billed to|invoice to|customer|donneur d'ordre|commanditaire|vendu a|sold to)\s*:?\s*/
const DELIVERY_LABEL_RE =
  /^(adresse de livraison|adresse livraison|livre a|livrer a|livraison a|lieu de livraison|lieu d'intervention|adresse d'intervention|adresse du chantier|lieu d'execution|ship to|delivery address)\s*:?\s*/
const SELLER_LABEL_RE =
  /^(emetteur|vendeur|prestataire|fournisseur|expediteur|societe emettrice|seller|supplier|de\s*:|from\s*:)\s*:?\s*/

/** Lines that end a party block (document metadata, tables). */
const STOP_RE =
  /^(facture|avoir|date|echeance|(n°|numero)\s*(de\s+)?(la\s+)?(facture|avoir|commande|client|piece)|reference|ref\b|votre|objet|designation|description|total|mode de|conditions|page\b|iban|bic)/

const STREET_RE =
  /^(\d+[\s,]*(bis|ter|quater|[a-d])?\b|bp\s*\d|cs\s*\d|(rue|avenue|av\.|bd|boulevard|chemin|impasse|quai|place|allee|route|cours|square|passage|voie|lieu-dit|hameau|zone|za|zi|zac|parc|residence|batiment|bat\.|immeuble|chez)\b)/
const STREET_WORD_RE =
  /\b(rue|avenue|av\.|bd|boulevard|chemin|impasse|quai|place|allee|route|cours|square|passage|voie|faubourg|chaussee|promenade|esplanade|parvis|lotissement)\b/
const POSTAL_RE =
  /^(?:(.*?)[,\s]+)?(?:f-|fr-)?(\d{5})\s+([\p{L}][\p{L}'’ -]*?(?:\s+cedex(?:\s+\d{1,2})?)?)\s*(?:,?\s*(france))?$/iu
const COUNTRY_RE = /^(france|belgique|suisse|luxembourg|allemagne|espagne|italie|monaco)$/
const COUNTRY_CODES: Record<string, string> = {
  france: "FR",
  belgique: "BE",
  suisse: "CH",
  luxembourg: "LU",
  allemagne: "DE",
  espagne: "ES",
  italie: "IT",
  monaco: "MC",
}

const LEGAL_FORMS: Array<[RegExp, string]> = [
  [/\bmicro[- ]entrepreneur\b/, "Micro-entrepreneur"],
  [/\bmicro[- ]entreprise\b/, "Micro-entreprise"],
  [/\bauto[- ]entrepreneur\b/, "Auto-entrepreneur"],
  [/\bentrepreneur individuel\b/, "Entrepreneur individuel"],
  [/\bentreprise individuelle\b/, "Entreprise individuelle"],
  [/\bselarl\b/, "SELARL"],
  [/\bselas\b/, "SELAS"],
  [/\bsasu\b/, "SASU"],
  [/\bsarlu\b/, "SARLU"],
  [/\beurl\b/, "EURL"],
  [/\bsarl\b/, "SARL"],
  [/\bsas\b/, "SAS"],
  [/\bsa\b/, "SA"],
  [/\bsnc\b/, "SNC"],
  [/\bsci\b/, "SCI"],
  [/\bscop\b/, "SCOP"],
  [/\bscp\b/, "SCP"],
  [/\beirl\b/, "EIRL"],
  [/\bei\b/, "EI"],
]

const CIVILITY_RE =
  /^(m\.|mr\.?|mme|mlle|madame|monsieur|mademoiselle|m et mme|m\. et mme|docteur|dr\.?|maitre|me)\s/

/** Lines that carry legal identity, not an address. */
const LEGAL_LINE_RE =
  /\b(siren|siret|rcs|r\.c\.s|rm|tva|capital|immatricul|entrepreneur|entreprise|ape|naf|code ape|tel|tel\.|telephone|fax|mobile|portable|e-?mail|courriel|site|www|http|iban|bic)\b|@/

function line(cell: Cell, text = cell.text): PartyLine {
  return { text, folded: fold(text), cell }
}

/** A dense line ("SIRET … – TVA …") is split into parts; a name like "X – Design" is not. */
function linesOfCells(cells: Cell[]): PartyLine[] {
  return cells.flatMap((c) => {
    const parts = partsOf(c)
    const informative = parts
      .slice(1)
      .some((p) => LEGAL_LINE_RE.test(p.folded) || POSTAL_RE.test(p.text))
    return informative ? parts.map((p) => line(c, p.text)) : [line(c)]
  })
}

/** Cells of the block that starts at `start` (inclusive), until a stop line. */
function blockFrom(layout: Layout, start: Cell): Cell[] {
  const block = blockOfCell(layout, start)
  const from = Math.max(0, block.indexOf(start))
  const out: Cell[] = []
  for (const cell of block.slice(from)) {
    if (out.length > 0 && (STOP_RE.test(cell.folded) || isPartyLabel(cell.folded))) break
    out.push(cell)
    if (out.length >= 14) break
  }
  return out
}

function isPartyLabel(folded: string): boolean {
  const labelOnly = (re: RegExp) => {
    const m = re.exec(folded)
    return !!m && m.index === 0
  }
  return labelOnly(BUYER_LABEL_RE) || labelOnly(DELIVERY_LABEL_RE) || labelOnly(SELLER_LABEL_RE)
}

/** The content of a labelled block: inline text after the label, then the cells below. */
function labelledBlock(layout: Layout, labelCell: Cell, labelLength: number): PartyLine[] {
  const inline = normalizeSpaces(labelCell.text.slice(labelLength)).replace(/^[:\s]+/, "")
  const lines: PartyLine[] = []
  if (inline !== "") {
    lines.push(line(labelCell, inline))
    const below = blockFrom(layout, labelCell).slice(1)
    lines.push(...linesOfCells(below))
    return lines
  }
  const right = cellToTheRight(layout, labelCell)
  if (right && right.x0 - labelCell.x1 < 6 * labelCell.fontSize && !isPartyLabel(right.folded)) {
    return linesOfCells(blockFrom(layout, right))
  }
  const below = blockFrom(layout, labelCell).slice(1)
  if (below.length > 0) return linesOfCells(below)
  return []
}

function findLabelledBlocks(layout: Layout): PartyBlock[] {
  const blocks: PartyBlock[] = []
  const buyerLabels: Array<{ cell: Cell; folded: string; length: number }> = []
  // Fragments of wrapped labels ("Référence / client") are not party labels.
  const wrapped = new Set(
    wrappedPairs(layout).flatMap((p) => p.labelCells.slice(1).map((c) => c.id)),
  )
  for (const cell of layout.cells) {
    if (wrapped.has(cell.id) || !/^[^\p{L}]*\p{Lu}/u.test(cell.text)) continue
    for (const [re, role] of [
      [BUYER_LABEL_RE, "buyer"],
      [DELIVERY_LABEL_RE, "delivery"],
      [SELLER_LABEL_RE, "seller"],
    ] as const) {
      const m = re.exec(cell.folded)
      if (m?.index !== 0) continue
      // Bilingual label "Client / Customer": the translation is part of the label.
      const gloss = /^\/\s*[a-z' ]{2,30}?\s*:?\s*$/.exec(cell.folded.slice(m[0].length))
      const labelLength = m[0].length + (gloss?.[0].length ?? 0)
      // "Client : Brasserie…" or a bare label; refuse long sentences starting with "Client".
      const rest = cell.folded.slice(labelLength)
      if (rest.length > 60 || /^(s |e |ele|eles)/.test(rest)) continue
      if (role === "buyer") buyerLabels.push({ cell, folded: cell.folded, length: labelLength })
      else {
        const lines = labelledBlock(layout, cell, labelLength)
        if (lines.length > 0) {
          blocks.push({
            role,
            factor: role === "delivery" ? 0.85 : 1,
            rule: `${role}-label`,
            lines,
            hasName: true,
          })
        }
      }
      break
    }
  }
  // "Facturé à" + "Destinataire": the bill-to block is the buyer, the other one the delivery address.
  const strong = buyerLabels.filter((l) => !/^destinataire/.test(l.folded))
  for (const label of buyerLabels) {
    const lines = labelledBlock(layout, label.cell, label.length)
    if (lines.length === 0) continue
    const isRecipient = /^destinataire/.test(label.folded)
    if (isRecipient && strong.length > 0) {
      blocks.push({
        role: "delivery",
        factor: 0.75,
        rule: "delivery-recipient-label",
        lines,
        hasName: true,
      })
    } else {
      blocks.push({ role: "buyer", factor: 1, rule: "buyer-label", lines, hasName: true })
    }
  }
  return blocks
}

function blockScore(lines: PartyLine[]): number {
  let score = 0
  const all = lines.map((l) => l.folded).join(" \n ")
  if (/\b(siren|siret|rcs|r\.c\.s|rm \d|capital|immatricul)\b/.test(all)) score += 3
  if (/\bfr\s?[0-9a-z]{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/.test(all)) score += 2
  if (lines.some((l) => POSTAL_RE.test(l.text))) score += 2
  if (/@|\btel\b|\btelephone\b/.test(all)) score += 1
  return score
}

function hintMatches(lines: PartyLine[], hints: ExtractionOptions["hints"]): boolean {
  if (!hints) return false
  const digits = lines.map((l) => compact(l.text)).join(" ")
  if (
    hints.sellerSiren &&
    compact(hints.sellerSiren).length === 9 &&
    digits.includes(compact(hints.sellerSiren))
  )
    return true
  if (
    hints.sellerVatNumber &&
    digits.toUpperCase().includes(normalizeVatNumber(hints.sellerVatNumber))
  )
    return true
  if (hints.sellerName && lines[0] && fold(lines[0].text) === fold(hints.sellerName)) return true
  return false
}

/** Rows in the bottom band of a page that carry legal identity: the seller's footer. */
const FOOTER_LEGAL_RE =
  /\b(siren|siret|rcs|r\.c\.s|capital|tva intra|n° tva|immatricul)\b|\bfr\s?[0-9a-z]{2}\s?\d{3}/

function footerLines(layout: Layout, used: Set<number>): PartyLine[] {
  const inBand = (cell: Cell) => cell.y >= 0.8 * (layout.pageHeights[cell.page - 1] ?? 842)
  const legal = layout.cells.filter(
    (c) => !used.has(c.id) && inBand(c) && FOOTER_LEGAL_RE.test(c.folded),
  )
  const out: PartyLine[] = []
  for (const cell of layout.cells) {
    if (used.has(cell.id) || !inBand(cell)) continue
    // The footer often spreads the identity over two rows: "Name - street, city - Tél." above
    // "SARL au capital … - SIRET …". A row right next to a legal row belongs to the same footer.
    const isLegal = legal.includes(cell)
    const besideLegal = legal.some(
      (l) => l.page === cell.page && Math.abs(l.y - cell.y) <= 2.5 * cell.fontSize,
    )
    if (!isLegal && !(besideLegal && cell.y < Math.min(...legal.map((l) => l.y)))) continue
    out.push(...linesOfCells([cell]))
  }
  return out
}

/** Returns the ids of the cells read as the buyer's block (its IBAN is not the payee's). */
export function extractParties(
  layout: Layout,
  collector: Collector,
  options?: ExtractionOptions,
): Set<number> {
  const hints = options?.hints
  const labelled = findLabelledBlocks(layout)
  const used = new Set<number>()
  for (const b of labelled) for (const l of b.lines) used.add(l.cell.id)

  const parties: PartyBlock[] = [...labelled]
  const firstPageHeight = layout.pageHeights[0] ?? 842
  const firstPageWidth = layout.pageWidths[0] ?? 595

  // Unlabelled blocks on the top of page 1, scored as party candidates.
  const candidates: Array<{
    lines: PartyLine[]
    score: number
    x0: number
    y: number
    hinted: boolean
  }> = []
  for (const block of layout.blocks) {
    const cell = block.find(
      (c) => !used.has(c.id) && !STOP_RE.test(c.folded) && !isPartyLabel(c.folded),
    )
    if (cell?.page !== 1 || cell.y > 0.5 * firstPageHeight) continue
    const cells = blockFrom(layout, cell).filter((c) => !used.has(c.id))
    const lines = linesOfCells(cells)
    if (lines.length === 0) continue
    candidates.push({
      lines,
      score: blockScore(lines),
      x0: cell.x0,
      y: cell.y,
      hinted: hintMatches(lines, hints),
    })
  }

  const hasSeller = parties.some((p) => p.role === "seller")
  const hasBuyer = parties.some((p) => p.role === "buyer")
  const remaining = [...candidates]
  if (!hasSeller) {
    const hinted = remaining.find((c) => c.hinted)
    const ranked = [...remaining]
      .filter((c) => c.score >= 3)
      .sort(
        (a, b) =>
          b.score +
            (b.x0 < firstPageWidth / 2 ? 1 : 0) -
            (a.score + (a.x0 < firstPageWidth / 2 ? 1 : 0)) || a.y - b.y,
      )
    const chosen = hinted ?? ranked[0]
    if (chosen) {
      parties.push({
        role: "seller",
        factor: hinted ? 1 : hasBuyer ? 0.95 : 0.85,
        rule: hinted ? "seller-hint" : "seller-letterhead",
        lines: chosen.lines,
        hasName: true,
      })
      remaining.splice(remaining.indexOf(chosen), 1)
    }
  }
  if (!hasBuyer) {
    // Letter layout: the recipient's address block, without any label.
    const addressBlocks = remaining.filter(
      (c) => c.lines.some((l) => POSTAL_RE.test(l.text)) && !c.hinted && c.lines.length >= 2,
    )
    const only = addressBlocks.length === 1 ? addressBlocks[0] : undefined
    if (only) {
      parties.push({
        role: "buyer",
        factor: 0.8,
        rule: "buyer-address-block",
        lines: only.lines,
        hasName: true,
      })
    }
  }

  for (const p of parties) for (const l of p.lines) used.add(l.cell.id)
  const footer = footerLines(layout, used)
  const seller = parties.find((p) => p.role === "seller")
  if (footer.length > 0) {
    if (seller) parseIdentity("seller", footer, 0.9, "seller-footer", collector)
    else parseFooterSeller(footer, collector)
  }

  for (const party of parties) {
    if (party.role === "delivery") {
      // A labelled delivery block ("Adresse de livraison", "Livré à", or "Destinataire" beside a
      // bill-to label) is read like the buyer block; its factor already carries the label's
      // reliability (0.85 explicit, 0.75 recipient).
      parseAddress("deliveryAddress", party.lines, party.factor, party.rule, collector)
    } else parseParty(party, party.role, collector)
  }
  checkSirenConsistency(collector)
  // The whole layout block, including rows after a stop line (e.g. the buyer's own bank details).
  return new Set(
    parties
      .filter((p) => p.role === "buyer")
      .flatMap((p) => p.lines.flatMap((l) => blockOfCell(layout, l.cell).map((c) => c.id))),
  )
}

function parseParty(party: PartyBlock, prefix: "seller" | "buyer", collector: Collector): void {
  const f = party.factor
  const lines = party.lines
  const first = lines[0]
  let nameLine: PartyLine | undefined
  if (
    first &&
    party.hasName &&
    !LEGAL_LINE_RE.test(first.folded) &&
    !POSTAL_RE.test(first.text) &&
    !STREET_RE.test(first.folded)
  ) {
    nameLine = first
    collector.add(`${prefix}.name`, first.text, 0.84 * f, [first.cell], party.rule)
  }
  const rest = lines.filter((l) => l !== nameLine)
  parseAddress(`${prefix}.address`, rest, f, party.rule, collector)
  parseIdentity(prefix, lines, f, party.rule, collector)

  if (prefix === "seller") {
    if (nameLine) collector.add("seller.kind", "company", 0.9 * f, [nameLine.cell], party.rule)
    // Legal form printed as a suffix of the name ("Atelier Lumière SARL").
    if (nameLine) {
      for (const [re, form] of LEGAL_FORMS) {
        if (re.test(nameLine.folded)) {
          collector.add("seller.legalForm", form, 0.72 * f, [nameLine.cell], "legal-form-name")
          break
        }
      }
    }
  } else if (nameLine) {
    const hasId = rest.some((l) => /\b(siren|siret)\b|\bfr\s?[0-9a-z]{2}\s?\d{3}/.test(l.folded))
    const hasForm = LEGAL_FORMS.some(([re]) => re.test(nameLine.folded))
    if (CIVILITY_RE.test(nameLine.folded) && !hasId) {
      collector.add("buyer.kind", "individual", 0.86 * f, [nameLine.cell], "buyer-civility")
    } else if (hasId || hasForm) {
      collector.add("buyer.kind", "company", 0.86 * f, [nameLine.cell], "buyer-company-evidence")
    } else if (/^[\p{Lu}][\p{Ll}'-]+(\s[\p{Lu}][\p{L}'-]+){1,2}$/u.test(nameLine.text)) {
      collector.add("buyer.kind", "individual", 0.5, [nameLine.cell], "buyer-person-like-name")
    }
  }
}

function parseAddress(
  prefix: string,
  lines: PartyLine[],
  f: number,
  rule: string,
  collector: Collector,
): void {
  const postalIndex = lines.findIndex(
    (l) => POSTAL_RE.test(l.text) && !LEGAL_LINE_RE.test(l.folded),
  )
  const postalLine = lines[postalIndex]
  if (!postalLine) return
  const m = POSTAL_RE.exec(postalLine.text)
  if (!m) return
  const inlineStreet = m[1]?.trim()
  const postalCode = m[2] ?? ""
  const city = (m[3] ?? "").trim()
  collector.add(`${prefix}.postalCode`, postalCode, 0.9 * f, [postalLine.cell], `${rule}-postal`)
  collector.add(`${prefix}.city`, city, 0.88 * f, [postalLine.cell], `${rule}-postal`)

  const after = lines[postalIndex + 1]
  const countryWord = m[4]
    ? "france"
    : after && COUNTRY_RE.test(after.folded)
      ? after.folded
      : undefined
  const countryCode = countryWord ? COUNTRY_CODES[countryWord] : "FR"
  if (countryCode) {
    collector.add(
      `${prefix}.countryCode`,
      countryCode,
      (countryWord ? 0.9 : 0.75) * f,
      [countryWord && after && !m[4] ? after.cell : postalLine.cell],
      countryWord ? `${rule}-country` : `${rule}-french-postcode`,
    )
  }

  if (inlineStreet && STREET_RE.test(fold(inlineStreet))) {
    collector.add(`${prefix}.line1`, inlineStreet, 0.8 * f, [postalLine.cell], `${rule}-street`)
    return
  }
  // Address lines: the contiguous non-legal lines right above the postcode line.
  const above: PartyLine[] = []
  for (let i = postalIndex - 1; i >= 0 && above.length < 3; i--) {
    const l = lines[i]
    if (!l || LEGAL_LINE_RE.test(l.folded) || (i === 0 && !STREET_RE.test(l.folded))) break
    above.unshift(l)
  }
  if (above.length === 0) return
  const streetIndex = above.findIndex(
    (l) => STREET_RE.test(l.folded) || STREET_WORD_RE.test(l.folded),
  )
  if (streetIndex >= 0) {
    const street = above[streetIndex]
    if (street)
      collector.add(`${prefix}.line1`, street.text, 0.84 * f, [street.cell], `${rule}-street`)
    const next = above[streetIndex + 1]
    const previous = above[streetIndex - 1]
    if (next)
      collector.add(
        `${prefix}.line2`,
        next.text,
        0.7 * f,
        [next.cell],
        `${rule}-address-complement`,
      )
    else if (previous)
      collector.add(
        `${prefix}.line2`,
        previous.text,
        0.5 * f,
        [previous.cell],
        `${rule}-address-complement`,
      )
  } else {
    const last = above[above.length - 1]
    if (last)
      collector.add(`${prefix}.line1`, last.text, 0.62 * f, [last.cell], `${rule}-address-line`)
  }
}

const SIREN_RE = /\bsiren\s*(?:n°|:)?\s*:?\s*((?:\d[\s.]?){8,}\d)/
const SIRET_RE = /\bsiret\s*(?:n°|:)?\s*:?\s*((?:\d[\s.]?){13,}\d)/
const VAT_FR_RE = /\bFR\s?[0-9A-Z]{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/
const VAT_LABEL_RE =
  /\b(tva|vat|n° tva|tva intracom\w*|identifiant tva)\b[^:]*:?\s*([A-Z]{2}[\s0-9A-Z]{2,14})/i
const RCS_RE =
  /(?:immatricul\S*\s+au\s+)?\b(R\.?\s?C\.?\s?S\.?|R\.?\s?M\.?|Registre du commerce(?: et des sociétés)?|Répertoire des métiers)\s*(?:de\s+|d')?(?:[A-Z]\s+)?([\p{Lu}][\p{L}'’-]*(?:[ -][\p{Lu}][\p{L}'’-]*)*\s+)?(?:[A-Z]\s+)?(?:n°\s*)?(\d{3}\s?\d{3}\s?\d{3})(?:\s+(?!\d)([\p{Lu}][\p{L}'’-]*(?:[ -][\p{Lu}][\p{L}'’-]*)*))?/u
const CAPITAL_RE = /capital(?:\s+social)?\s*(?:de|:)?\s*(\d[\d\s.,]*\s?(?:€|euros?|EUR))/i
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/
const PHONE_RE = /(?:\+33\s?\(0\)\s?|\+33\s?|0033\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/

function parseIdentity(
  prefix: "seller" | "buyer",
  lines: PartyLine[],
  f: number,
  rule: string,
  collector: Collector,
): void {
  const who = prefix === "seller" ? "du vendeur" : "du client"
  for (const l of lines) {
    const siren = SIREN_RE.exec(l.folded)?.[1]
    if (siren) {
      const v = compact(siren).replace(/\./g, "")
      if (v.length === 9 && isValidSiren(v))
        collector.add(`${prefix}.siren`, v, 0.95 * f, [l.cell], `${rule}-siren`)
      else {
        collector.add(`${prefix}.siren`, v, 0.35, [l.cell], `${rule}-siren-invalid`)
        collector.warn(`Le SIREN ${who} lu dans le PDF (${v}) est invalide : vérifiez-le.`)
      }
    }
    const siret = SIRET_RE.exec(l.folded)?.[1]
    if (siret) {
      const v = compact(siret).replace(/\./g, "")
      if (v.length === 14 && isValidSiret(v)) {
        collector.add(`${prefix}.siret`, v, 0.95 * f, [l.cell], `${rule}-siret`)
        collector.add(
          `${prefix}.siren`,
          v.slice(0, 9),
          0.88 * f,
          [l.cell],
          `${rule}-siren-from-siret`,
        )
      } else {
        collector.add(`${prefix}.siret`, v, 0.35, [l.cell], `${rule}-siret-invalid`)
        collector.warn(`Le SIRET ${who} lu dans le PDF (${v}) est invalide : vérifiez-le.`)
      }
    }
    const vatFr = VAT_FR_RE.exec(l.text.toUpperCase())?.[0]
    if (vatFr) {
      const v = normalizeVatNumber(vatFr)
      if (isValidFrenchVatNumber(v)) {
        collector.add(`${prefix}.vatNumber`, v, 0.95 * f, [l.cell], `${rule}-vat`)
        collector.add(`${prefix}.siren`, v.slice(4), 0.88 * f, [l.cell], `${rule}-siren-from-vat`)
      } else {
        collector.add(`${prefix}.vatNumber`, v, 0.35, [l.cell], `${rule}-vat-invalid`)
        collector.warn(`Le numéro de TVA ${who} lu dans le PDF (${v}) est invalide : vérifiez-le.`)
      }
    } else {
      const foreign = VAT_LABEL_RE.exec(l.text)
      const raw = foreign?.[2] ? normalizeVatNumber(foreign[2]) : undefined
      if (
        raw &&
        /^[A-Z]{2}[0-9A-Z]{2,12}$/.test(raw) &&
        /\d{4}/.test(raw) &&
        !raw.startsWith("FR")
      ) {
        collector.add(`${prefix}.vatNumber`, raw, 0.7 * f, [l.cell], `${rule}-vat-foreign`)
      }
    }
    const email = EMAIL_RE.exec(l.text)?.[0]
    if (email) collector.add(`${prefix}.email`, email, 0.86 * f, [l.cell], `${rule}-email`)
    if (!/\bfax\b/.test(l.folded)) {
      const phone = PHONE_RE.exec(l.text)?.[0]
      if (phone && !/\b(siren|siret|iban|rcs)\b/.test(l.folded)) {
        collector.add(`${prefix}.phone`, normalizeSpaces(phone), 0.8 * f, [l.cell], `${rule}-phone`)
      }
    }
    if (prefix === "seller") parseSellerLegal(l, f, rule, collector)
  }
}

function parseSellerLegal(l: PartyLine, f: number, rule: string, collector: Collector): void {
  const rcs = RCS_RE.exec(l.text)
  if (rcs) {
    collector.add("seller.registration", rcs[0].trim(), 0.85 * f, [l.cell], `${rule}-registration`)
    const digits = compact(rcs[3] ?? "")
    if (isValidSiren(digits))
      collector.add("seller.siren", digits, 0.88 * f, [l.cell], `${rule}-siren-from-rcs`)
  } else {
    const exempt = /\bdispensee? d'immatriculation\b.*$/.exec(l.folded)
    if (exempt) {
      const text = l.text.length === l.folded.length ? l.text.slice(exempt.index) : exempt[0]
      collector.add(
        "seller.registration",
        text.replace(/[.;]$/, ""),
        0.8 * f,
        [l.cell],
        `${rule}-registration-exempt`,
      )
    }
  }
  const capital = CAPITAL_RE.exec(l.text)
  if (capital?.[1]) {
    collector.add(
      "seller.shareCapital",
      normalizeSpaces(capital[1]),
      0.88 * f,
      [l.cell],
      `${rule}-capital`,
    )
    const before = fold(l.text.slice(0, capital.index))
    for (const [re, form] of LEGAL_FORMS) {
      if (re.test(before)) {
        collector.add("seller.legalForm", form, 0.86 * f, [l.cell], `${rule}-legal-form-capital`)
        break
      }
    }
  } else if (l.folded.length < 40) {
    // A line that is only a legal form ("Micro-entrepreneur", "EURL").
    for (const [re, form] of LEGAL_FORMS) {
      const m = re.exec(l.folded)
      if (m && l.folded.replace(m[0], "").replace(/[\s,.:-]/g, "") === "") {
        collector.add("seller.legalForm", form, 0.8 * f, [l.cell], `${rule}-legal-form-line`)
        break
      }
    }
  }
}

/** Seller identity printed only in the footer: "Name – SARL au capital… – 12 rue… 75001 Paris – SIRET…". */
function parseFooterSeller(lines: PartyLine[], collector: Collector): void {
  const f = 0.8
  parseIdentity("seller", lines, f, "seller-footer", collector)
  const first = lines[0]
  if (
    first &&
    !LEGAL_LINE_RE.test(first.folded) &&
    !POSTAL_RE.test(first.text) &&
    !STREET_RE.test(first.folded)
  ) {
    collector.add("seller.name", first.text, 0.66, [first.cell], "seller-footer-name")
    collector.add("seller.kind", "company", 0.7, [first.cell], "seller-footer-name")
  }
  parseAddress("seller.address", lines, f, "seller-footer", collector)
}

/** SIREN read directly and SIREN derived from SIRET/VAT must agree, otherwise nothing is trusted. */
function checkSirenConsistency(collector: Collector): void {
  for (const prefix of ["seller", "buyer"]) {
    const values = new Set(
      collector
        .all(`${prefix}.siren`)
        .filter((s) => s.confidence >= 0.6)
        .map((s) => String(s.value)),
    )
    if (values.size > 1) {
      collector.demote(`${prefix}.siren`, 0.6)
      collector.demote(`${prefix}.siret`, 0.6)
      collector.demote(`${prefix}.vatNumber`, 0.6)
      collector.warn(
        `Plusieurs SIREN différents ont été trouvés pour le ${prefix === "seller" ? "vendeur" : "client"} : vérifiez les identifiants.`,
      )
    }
  }
}
