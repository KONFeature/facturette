/**
 * Invoice validation: required fields, identifier checksums, French mandatory mentions and the
 * EN 16931 business rules the form can break.
 *
 * Legal basis (France):
 *  - Art. L441-9 Code de commerce + art. 242 nonies A CGI: mandatory invoice mentions (identity,
 *    SIREN, VAT number, number/date, lines, totals, due date, legal form / capital / RCS-RM).
 *  - Art. L441-10 + D441-5 Code de commerce: late-payment penalty rate, 40 € recovery fee,
 *    early-payment discount conditions ("pas d'escompte" is acceptable).
 *  - Decree 2022-1299 (e-invoicing reform): buyer SIREN, operation category, delivery address.
 *  - Art. 293 B CGI: VAT franchise (category E with legal text).
 *  - Art. 283-2 nonies CGI / 242 nonies A: reverse charge needs the buyer's VAT number.
 * EN 16931 rule ids are cited next to each rule (Schematron FACTUR-X_EN16931.sch from Mustang).
 *
 * Design: every "required" error comes from one list of requirements (`collectRequirements`),
 * which also feeds `requiredPaths`, so the two can never drift apart.
 *
 * OWNER: lane `validation`.
 */

import { type InvoiceDraft, VAT_FRANCHISE_REASON, type VatCategory } from "../../domain/invoice"
import { computeTotals } from "../../domain/totals"
import { isValidIban, isValidSiren, isValidSiret, vatNumberStatus } from "./identifiers"

export type IssueSeverity = "error" | "warning"

export interface ValidationIssue {
  /** Dot path matching `Suggestion.path` / react-hook-form field names, e.g. "seller.siret". */
  path: string
  /** Stable machine code, e.g. "required", "siret.checksum", "vat.key". */
  code: string
  severity: IssueSeverity
  /** French, user-facing, actionable. */
  message: string
}

export interface ValidationReport {
  issues: ValidationIssue[]
  /** True when there is no `error`: the Factur-X file may be built. Warnings never block. */
  ready: boolean
}

export interface ValidateOptions {
  /** Today as `YYYY-MM-DD`, injectable for tests. Defaults to the local date. */
  today?: string
}

/** Standard VAT rates (percent) without warning: metropolitan + overseas (8.5, 1.05) + 0. */
export const KNOWN_VAT_RATES: readonly number[] = [20, 10, 5.5, 2.1, 8.5, 1.05, 0]

/** Payment means that need a bank account: 30 transfer, 58 SEPA transfer, 59 SEPA direct debit. */
export const IBAN_PAYMENT_MEANS: readonly string[] = ["30", "58", "59"]

/** EN 16931 has no length limit on BT-1 but PDPs commonly cap it at 20 characters. */
export const INVOICE_NUMBER_SOFT_LIMIT = 20

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

type Party = NonNullable<InvoiceDraft["buyer"]>
type Line = NonNullable<InvoiceDraft["lines"]>[number]

function isBlank(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === "string") return v.trim() === ""
  if (typeof v === "number") return !Number.isFinite(v)
  return false
}

function getPath(root: unknown, path: string): unknown {
  let cur: unknown = root
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

function localToday(): string {
  const n = new Date()
  const p = (x: number) => String(x).padStart(2, "0")
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`
}

/** Tokens of a legal form: "S.A.R.L." → ["SARL"], "Société anonyme (SA)" → [..., "SA"]. */
function legalFormTokens(form: string): string[] {
  const compact = form.toUpperCase().replace(/\./g, "")
  return compact.split(/[^A-Z0-9É]+/).filter(Boolean)
}

const CAPITAL_FORMS = new Set([
  "SARL",
  "EURL",
  "SAS",
  "SASU",
  "SA",
  "SCA",
  "SE",
  "SELARL",
  "SELURL",
  "SELAS",
  "SELASU",
  "SELAFA",
  "SELCA",
  "SAPI",
])

/** Capital companies must state their share capital (art. L123-... / R123-237 Code de commerce). */
export function isCapitalCompany(legalForm: string | undefined): boolean {
  if (!legalForm) return false
  const text = legalForm.toUpperCase()
  if (/SOCI[ÉE]T[ÉE] ANONYME|SOCI[ÉE]T[ÉE] PAR ACTIONS|RESPONSABILIT[ÉE] LIMIT[ÉE]E/.test(text)) {
    return true
  }
  return legalFormTokens(legalForm).some((t) => CAPITAL_FORMS.has(t))
}

const SOLE_TRADER_FORMS = new Set(["EI", "EIRL", "MICRO", "MICROENTREPRISE", "AUTOENTREPRENEUR"])

/** Sole traders (EI, micro-entreprise…): no share capital, registration is optional/varies. */
export function isSoleTrader(legalForm: string | undefined): boolean {
  if (!legalForm) return false
  const text = legalForm.toUpperCase()
  if (/ENTREPRISE INDIVIDUELLE|AUTO-?ENTREPRENEUR|MICRO-?ENTREPRISE/.test(text)) return true
  return legalFormTokens(legalForm).some((t) => SOLE_TRADER_FORMS.has(t))
}

const CATEGORIES_NEEDING_SELLER_VAT: readonly VatCategory[] = ["S", "Z", "AE", "K", "G"]
const CATEGORIES_NEEDING_EXEMPTION_REASON: readonly VatCategory[] = ["E", "AE", "K", "G", "O"]
const CATEGORIES_NEEDING_BUYER_VAT: readonly VatCategory[] = ["AE", "K"]

function categoriesOf(draft: InvoiceDraft): Set<VatCategory> {
  const set = new Set<VatCategory>()
  for (const line of draft.lines ?? []) if (line?.vatCategory) set.add(line.vatCategory)
  return set
}

function hasAny(set: Set<VatCategory>, wanted: readonly VatCategory[]): boolean {
  return wanted.some((c) => set.has(c))
}

// ---------------------------------------------------------------------------------------------
// Requirements (single source for `required` errors and `requiredPaths`)
// ---------------------------------------------------------------------------------------------

interface Requirement {
  path: string
  message: string
  /** Is the field required given the current draft? */
  applies: boolean
  /** Is the requirement met, possibly through an alternative field (SIREN vs SIRET…)? */
  satisfied: boolean
}

function hasIdentity(p: { siren?: string; siret?: string } | undefined): boolean {
  return !isBlank(p?.siren) || !isBlank(p?.siret)
}

function collectRequirements(draft: InvoiceDraft): Requirement[] {
  const reqs: Requirement[] = []
  const field = (path: string, message: string, applies = true) =>
    reqs.push({ path, message, applies, satisfied: !isBlank(getPath(draft, path)) })

  const seller = draft.seller
  const buyer = draft.buyer
  const categories = categoriesOf(draft)
  const totals = computeTotals(draft)

  // BT-1, BT-2, BT-3, BT-5; French "catégorie d'opération" (decree 2022-1299).
  field("number", "Renseignez le numéro de facture")
  field("issueDate", "Renseignez la date de facture")
  field("typeCode", "Choisissez le type de document (facture ou avoir)")
  field("currency", "Renseignez la devise")
  field(
    "operationCategory",
    "Choisissez la catégorie d'opération (livraison de biens, prestation de services ou mixte)",
  )
  // BT-25 / BR-FR-CO-05: a credit note must point at the invoice it corrects.
  field(
    "precedingInvoice.number",
    "Indiquez le numéro de la facture d'origine de l'avoir",
    draft.typeCode === "381",
  )

  // BR-6 / BR-8..11 / BR-CO-26: seller identity; L441-9 + 242 nonies A.
  field("seller.name", "Renseignez le nom ou la raison sociale du vendeur")
  field("seller.address.line1", "Renseignez l'adresse du vendeur")
  field("seller.address.postalCode", "Renseignez le code postal du vendeur")
  field("seller.address.city", "Renseignez la ville du vendeur")
  field("seller.address.countryCode", "Renseignez le pays du vendeur")
  // Seller SIREN or SIRET (242 nonies A; BR-CO-26 needs an identifier).
  reqs.push({
    path: "seller.siret",
    message: "Renseignez le SIRET (ou le SIREN) du vendeur",
    applies: true,
    satisfied: hasIdentity(seller),
  })
  // BR-S-02, BR-Z-02, BR-AE-02, BR-IC-02, BR-G-02: seller VAT id.
  field(
    "seller.vatNumber",
    "Renseignez le numéro de TVA intracommunautaire du vendeur (ex. FR12345678901)",
    hasAny(categories, CATEGORIES_NEEDING_SELLER_VAT),
  )
  // L441-9: legal form, capital, registration.
  field("seller.legalForm", "Renseignez la forme juridique du vendeur (SAS, SARL, EI…)")
  field(
    "seller.shareCapital",
    "Renseignez le capital social du vendeur (ex. 10 000 €)",
    isCapitalCompany(seller?.legalForm),
  )

  // Buyer: BR-7, BR-10..13; reform adds the buyer SIREN (B2B, French buyers only).
  field("buyer.name", "Renseignez le nom ou la raison sociale du client")
  field("buyer.address.line1", "Renseignez l'adresse du client")
  field("buyer.address.postalCode", "Renseignez le code postal du client")
  field("buyer.address.city", "Renseignez la ville du client")
  field("buyer.address.countryCode", "Renseignez le pays du client")
  const buyerCountry = buyer?.address?.countryCode?.trim().toUpperCase()
  reqs.push({
    path: "buyer.siret",
    message: "Renseignez le SIRET (ou le SIREN) du client",
    applies: buyer?.kind !== "individual" && (!buyerCountry || buyerCountry === "FR"),
    satisfied: hasIdentity(buyer),
  })
  // BR-IC-02 (buyer VA id for intra-community supply); reverse charge: BR-AE-02 + 242 nonies A.
  field(
    "buyer.vatNumber",
    "Renseignez le numéro de TVA du client (obligatoire pour une autoliquidation ou une livraison intracommunautaire)",
    hasAny(categories, CATEGORIES_NEEDING_BUYER_VAT),
  )

  // Lines: BR-16 (at least one), BR-25 (name), BR-22 (quantity), BR-23 (unit), BR-26 (price),
  // BR-CO-4 (VAT category), BR-S-05 (rate).
  const lines = draft.lines ?? []
  if (lines.length === 0) {
    reqs.push({
      path: "lines",
      message: "Ajoutez au moins une ligne de facture",
      applies: true,
      satisfied: false,
    })
  }
  lines.forEach((line, i) => {
    const p = `lines.${i}`
    field(`${p}.name`, "Renseignez la désignation de la ligne")
    field(`${p}.quantity`, "Renseignez la quantité de la ligne")
    field(`${p}.unitCode`, "Choisissez l'unité de la ligne")
    field(`${p}.unitPrice`, "Renseignez le prix unitaire HT de la ligne")
    field(`${p}.vatCategory`, "Choisissez la catégorie de TVA de la ligne")
    field(`${p}.vatRate`, "Renseignez le taux de TVA de la ligne", line?.vatCategory === "S")
  })

  // BR-E-10, BR-AE-10, BR-IC-10, BR-G-10, BR-O-10 (exemption reason text or code).
  // Not for Z: BR-Z-10 forbids an exemption reason on zero-rated breakdowns.
  field(
    "vatExemptionReason",
    `Indiquez le motif d'exonération de TVA (ex. « ${VAT_FRANCHISE_REASON} » pour la franchise en base)`,
    hasAny(categories, CATEGORIES_NEEDING_EXEMPTION_REASON),
  )

  // BR-CO-25: amount due > 0 ⇒ due date or payment terms (L441-9: date de règlement).
  reqs.push({
    path: "dueDate",
    message: "Renseignez la date d'échéance ou les conditions de paiement",
    applies: totals.dueAmount > 0,
    satisfied: !isBlank(draft.dueDate) || !isBlank(draft.payment?.termsText),
  })

  // Payment means; bank account for transfer / SEPA debit (codes 30, 58, 59).
  field("payment.meansCode", "Choisissez le moyen de paiement")
  field(
    "payment.iban",
    "Renseignez l'IBAN pour le virement ou le prélèvement",
    IBAN_PAYMENT_MEANS.includes(draft.payment?.meansCode ?? ""),
  )

  // L441-10 al. 12 (penalties), D441-5 (40 € fee), L441-9 (escompte). Business customers only:
  // these mentions are not required towards private individuals.
  const b2b = buyer?.kind !== "individual"
  field(
    "legalNotes.latePaymentPenalty",
    "Indiquez le taux des pénalités de retard (art. L441-10 du Code de commerce)",
    b2b,
  )
  field(
    "legalNotes.recoveryFee",
    "Indiquez l'indemnité forfaitaire de recouvrement de 40 € (art. D441-5 du Code de commerce)",
    b2b,
  )
  field(
    "legalNotes.earlyPaymentDiscount",
    "Indiquez les conditions d'escompte, ou « Pas d'escompte pour paiement anticipé »",
    b2b,
  )

  return reqs
}

/**
 * Paths of the fields currently required, so the form can mark them. Conditional: depends on
 * the draft (e.g. `vatExemptionReason` only when a line is not category S).
 *
 * Either/or requirements (SIREN or SIRET, due date or payment terms) are listed only while the
 * requirement is unmet or the field itself is filled, so that a listed empty path always has an error.
 */
export function requiredPaths(draft: InvoiceDraft): string[] {
  return collectRequirements(draft)
    .filter((r) => r.applies && (!r.satisfied || !isBlank(getPath(draft, r.path))))
    .map((r) => r.path)
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

export function validateInvoice(
  draft: InvoiceDraft,
  options: ValidateOptions = {},
): ValidationReport {
  const issues: ValidationIssue[] = []
  const error = (path: string, code: string, message: string) =>
    issues.push({ path, code, severity: "error", message })
  const warning = (path: string, code: string, message: string) =>
    issues.push({ path, code, severity: "warning", message })
  const today = options.today ?? localToday()

  for (const r of collectRequirements(draft)) {
    if (r.applies && !r.satisfied) error(r.path, "required", r.message)
  }

  // --- Dates -------------------------------------------------------------------------------
  const dateFields = ["issueDate", "dueDate", "deliveryDate"] as const
  const validDate = new Set<string>()
  for (const f of dateFields) {
    const v = draft[f]
    if (isBlank(v) || typeof v !== "string") continue
    if (isRealDate(v)) validDate.add(f)
    else error(f, "date.invalid", "Date invalide : utilisez le format JJ/MM/AAAA")
  }
  if (validDate.has("issueDate") && validDate.has("dueDate") && draft.dueDate && draft.issueDate) {
    if (draft.dueDate < draft.issueDate) {
      warning(
        "dueDate",
        "dueDate.beforeIssue",
        "L'échéance précède la date de facture : vérifiez-la",
      )
    }
  }
  if (validDate.has("issueDate") && draft.issueDate && draft.issueDate > today) {
    warning("issueDate", "issueDate.future", "La date de facture est dans le futur : vérifiez-la")
  }

  // --- Number ------------------------------------------------------------------------------
  if (draft.number && draft.number.length > INVOICE_NUMBER_SOFT_LIMIT) {
    warning(
      "number",
      "number.long",
      `Numéro de facture de plus de ${INVOICE_NUMBER_SOFT_LIMIT} caractères : certaines plateformes le refusent`,
    )
  }
  // BR-FR-02: letters, digits and - + _ / only.
  if (draft.number && !/^[A-Za-z0-9+_/-]+$/.test(draft.number)) {
    warning(
      "number",
      "number.chars",
      "Le numéro de facture ne doit contenir que des lettres, des chiffres et les signes - + _ / (ni espace, ni point)",
    )
  }
  if (!isBlank(draft.currency) && draft.currency !== "EUR") {
    error("currency", "currency.unsupported", "Seule la devise EUR est prise en charge")
  }

  // --- Parties -----------------------------------------------------------------------------
  checkParty(draft.seller, "seller", "du vendeur", error, warning)
  checkParty(draft.buyer, "buyer", "du client", error, warning)

  // Seller SIREN/SIRET coherence with the VAT number.
  const sellerSiren = draft.seller?.siren?.replace(/\s+/g, "")
  const sellerSiret = draft.seller?.siret?.replace(/\s+/g, "")
  if (
    sellerSiren &&
    sellerSiret &&
    /^\d{14}$/.test(sellerSiret) &&
    !sellerSiret.startsWith(sellerSiren)
  ) {
    error(
      "seller.siret",
      "siret.sirenMismatch",
      "Le SIRET du vendeur ne correspond pas à son SIREN",
    )
  }
  const buyerSiren = draft.buyer?.siren?.replace(/\s+/g, "")
  const buyerSiret = draft.buyer?.siret?.replace(/\s+/g, "")
  if (
    buyerSiren &&
    buyerSiret &&
    /^\d{14}$/.test(buyerSiret) &&
    !buyerSiret.startsWith(buyerSiren)
  ) {
    error("buyer.siret", "siret.sirenMismatch", "Le SIRET du client ne correspond pas à son SIREN")
  }

  // Sole traders: RM / RCS / micro-entrepreneur registration mention is expected (L441-9).
  if (isSoleTrader(draft.seller?.legalForm) && isBlank(draft.seller?.registration)) {
    warning(
      "seller.registration",
      "registration.missing",
      "Indiquez l'immatriculation du vendeur (RM, RCS ou « Micro-entrepreneur dispensé d'immatriculation »)",
    )
  }

  const sellerVat = draft.seller?.vatNumber?.replace(/[\s.-]+/g, "").toUpperCase()
  const sellerId = sellerSiren || sellerSiret?.slice(0, 9)
  if (
    sellerVat?.startsWith("FR") &&
    sellerId &&
    /^\d{9}$/.test(sellerId) &&
    /^FR[0-9A-Z]{2}\d{9}$/.test(sellerVat) &&
    sellerVat.slice(4) !== sellerId
  ) {
    warning(
      "seller.vatNumber",
      "vat.sirenMismatch",
      "Le numéro de TVA ne contient pas le SIREN du vendeur",
    )
  }

  // --- Lines -------------------------------------------------------------------------------
  const lines = draft.lines ?? []
  lines.forEach((line, i) => {
    checkLine(line, i, error, warning)
  })

  // --- VAT categories ----------------------------------------------------------------------
  const categories = categoriesOf(draft)
  if (categories.has("O") && categories.size > 1) {
    // BR-O-11: "not subject to VAT" cannot be mixed with other breakdowns.
    error(
      "lines",
      "vat.outOfScopeMixed",
      "La catégorie « Hors champ de la TVA » ne peut pas être mélangée avec d'autres catégories",
    )
  }
  if (categories.has("O")) {
    // BR-O-02: no VAT identifier of seller or buyer on an out-of-scope invoice.
    if (!isBlank(draft.seller?.vatNumber)) {
      error(
        "seller.vatNumber",
        "vat.outOfScopeVatId",
        "Retirez le numéro de TVA : il est interdit avec la catégorie « Hors champ de la TVA »",
      )
    }
    if (!isBlank(draft.buyer?.vatNumber)) {
      error(
        "buyer.vatNumber",
        "vat.outOfScopeVatId",
        "Retirez le numéro de TVA du client : il est interdit avec la catégorie « Hors champ de la TVA »",
      )
    }
  }

  // --- Payment -----------------------------------------------------------------------------
  const iban = draft.payment?.iban
  if (!isBlank(iban) && typeof iban === "string" && !isValidIban(iban)) {
    error("payment.iban", "iban.checksum", "IBAN invalide : vérifiez les caractères saisis")
  }

  return { issues, ready: !issues.some((x) => x.severity === "error") }
}

type Report = (path: string, code: string, message: string) => void

function checkParty(
  party: Party | undefined,
  prefix: "seller" | "buyer",
  whose: string,
  error: Report,
  warning: Report,
): void {
  if (!party) return
  const siren = party.siren
  if (!isBlank(siren) && typeof siren === "string" && !isValidSiren(siren)) {
    error(
      `${prefix}.siren`,
      "siren.checksum",
      `SIREN ${whose} invalide : il doit comporter 9 chiffres valides`,
    )
  }
  const siret = party.siret
  if (!isBlank(siret) && typeof siret === "string" && !isValidSiret(siret)) {
    error(
      `${prefix}.siret`,
      "siret.checksum",
      `SIRET ${whose} invalide : il doit comporter 14 chiffres valides`,
    )
  }
  const vat = party.vatNumber
  if (!isBlank(vat) && typeof vat === "string") {
    const status = vatNumberStatus(vat)
    if (status === "format") {
      error(
        `${prefix}.vatNumber`,
        "vat.format",
        `Numéro de TVA ${whose} invalide : attendu un code pays suivi du numéro (ex. FR12345678901)`,
      )
    } else if (status === "key") {
      warning(
        `${prefix}.vatNumber`,
        "vat.key",
        `La clé du numéro de TVA ${whose} ne correspond pas au SIREN : vérifiez-le`,
      )
    } else if (status === "siren") {
      warning(
        `${prefix}.vatNumber`,
        "vat.siren",
        `Le SIREN du numéro de TVA ${whose} semble invalide : vérifiez-le`,
      )
    }
  }
  const country = party.address?.countryCode
  if (!isBlank(country) && typeof country === "string" && !/^[A-Za-z]{2}$/.test(country.trim())) {
    error(
      `${prefix}.address.countryCode`,
      "country.invalid",
      "Pays invalide : code ISO sur 2 lettres (ex. FR)",
    )
  }
}

function checkLine(line: Line | undefined, i: number, error: Report, warning: Report): void {
  if (!line) return
  const p = `lines.${i}`
  // A negative unit price is a legitimate discount line. BR-27 forbids it in the XML, so the
  // Factur-X builder moves the sign onto the quantity (verified VALID with Mustang): nothing to
  // report here.
  if (line.quantity === 0) {
    warning(`${p}.quantity`, "quantity.zero", "Quantité à zéro : la ligne vaut 0 €")
  }
  if (
    line.vatCategory === "S" &&
    typeof line.vatRate === "number" &&
    Number.isFinite(line.vatRate)
  ) {
    if (line.vatRate < 0) {
      error(`${p}.vatRate`, "vatRate.negative", "Le taux de TVA ne peut pas être négatif")
    } else if (line.vatRate === 0) {
      // BR-S-05: standard rated needs a rate > 0 (use category Z / E for 0 %).
      error(
        `${p}.vatRate`,
        "vatRate.zeroStandard",
        "Taux de TVA à 0 % : choisissez la catégorie « Taux zéro » ou « Exonéré »",
      )
    } else if (!KNOWN_VAT_RATES.includes(line.vatRate)) {
      warning(
        `${p}.vatRate`,
        "vatRate.unusual",
        "Taux de TVA inhabituel en France (20, 10, 5,5, 2,1 %) : vérifiez-le",
      )
    }
  }
}
