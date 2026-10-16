/**
 * Form values <-> `InvoiceDraft`.
 *
 * Inside the form every input is text (numbers stay as typed, "1 234,56"), so nothing is
 * reformatted under the user's cursor. `formToDraft` produces the draft (real numbers, blanks
 * omitted, identifiers stripped of spaces) that validation, totals and the store consume.
 * Form field names are the draft paths ("seller.address.city", "lines.0.name"): the same path
 * addresses a suggestion, a validation issue and a DOM input.
 */
import {
  type Address,
  FR_DIRECTORY_SCHEME,
  type InvoiceDraft,
  OPERATION_CATEGORIES,
  UNIT_CODES,
  VAT_CATEGORIES,
  type VatCategory,
} from "../../domain/invoice"
import type { ValidationIssue } from "../../lib/validation"
import {
  formatIban,
  formatSiren,
  formatSiret,
  normalizeIban,
} from "../../lib/validation/identifiers"
import { formatNumberInput, parseFrNumber } from "./numbers"

export interface AddressValues {
  line1: string
  line2: string
  postalCode: string
  city: string
  countryCode: string
}

export interface PartyValues {
  name: string
  kind: "company" | "individual"
  siren: string
  siret: string
  vatNumber: string
  email: string
  phone: string
  address: AddressValues
  /** BT-34 / BT-49. A blank value leaves it out of the draft (the file falls back to the SIREN). */
  electronicAddress: { scheme: string; value: string }
}

export interface SellerValues extends PartyValues {
  legalForm: string
  shareCapital: string
  registration: string
}

export interface LineValues {
  name: string
  description: string
  quantity: string
  unitCode: string
  unitPrice: string
  vatCategory: string
  vatRate: string
}

export interface FormValues {
  number: string
  typeCode: string
  issueDate: string
  dueDate: string
  deliveryDate: string
  operationCategory: string
  vatOnDebits: boolean
  currency: string
  seller: SellerValues
  buyer: PartyValues
  /** UI switch: the delivery address is only part of the draft when this is on. */
  hasDeliveryAddress: boolean
  deliveryAddress: AddressValues
  buyerReference: string
  orderReference: string
  /** BT-25 / BT-26: only meaningful for a credit note (typeCode 381). */
  precedingInvoice: { number: string; issueDate: string }
  lines: LineValues[]
  vatExemptionReason: string
  prepaidAmount: string
  payment: {
    meansCode: string
    iban: string
    bic: string
    reference: string
    termsText: string
  }
  legalNotes: {
    latePaymentPenalty: string
    recoveryFee: string
    earlyPaymentDiscount: string
  }
  notes: string
}

const str = (v: string | undefined): string => v ?? ""
const clean = (v: string): string | undefined => {
  const t = v.trim()
  return t === "" ? undefined : t
}
const stripSpaces = (v: string): string | undefined => clean(v.replace(/[\s\u00a0\u202f]+/g, ""))

function addressToForm(a: Partial<Address> | undefined): AddressValues {
  return {
    line1: str(a?.line1),
    line2: str(a?.line2),
    postalCode: str(a?.postalCode),
    city: str(a?.city),
    countryCode: str(a?.countryCode) || "FR",
  }
}

function partyToForm(p: NonNullable<InvoiceDraft["buyer"]> | undefined): PartyValues {
  return {
    name: str(p?.name),
    kind: p?.kind === "individual" ? "individual" : "company",
    siren: p?.siren ? formatSiren(p.siren) : "",
    siret: p?.siret ? formatSiret(p.siret) : "",
    vatNumber: str(p?.vatNumber),
    email: str(p?.email),
    phone: str(p?.phone),
    address: addressToForm(p?.address),
    electronicAddress: {
      scheme: str(p?.electronicAddress?.scheme) || FR_DIRECTORY_SCHEME,
      value: str(p?.electronicAddress?.value),
    },
  }
}

export function draftToForm(draft: InvoiceDraft): FormValues {
  const seller = draft.seller
  const delivery = draft.deliveryAddress
  const lines = draft.lines && draft.lines.length > 0 ? draft.lines : [{}]
  return {
    number: str(draft.number),
    typeCode: draft.typeCode === "381" ? "381" : "380",
    issueDate: str(draft.issueDate),
    dueDate: str(draft.dueDate),
    deliveryDate: str(draft.deliveryDate),
    operationCategory: str(draft.operationCategory),
    vatOnDebits: draft.vatOnDebits === true,
    currency: str(draft.currency) || "EUR",
    seller: {
      ...partyToForm(seller),
      kind: "company",
      legalForm: str(seller?.legalForm),
      shareCapital: str(seller?.shareCapital),
      registration: str(seller?.registration),
    },
    buyer: partyToForm(draft.buyer),
    hasDeliveryAddress: !!delivery && Object.values(delivery).some((v) => !!v),
    deliveryAddress: addressToForm(delivery),
    buyerReference: str(draft.buyerReference),
    orderReference: str(draft.orderReference),
    precedingInvoice: {
      number: str(draft.precedingInvoice?.number),
      issueDate: str(draft.precedingInvoice?.issueDate),
    },
    lines: lines.map((l) => ({
      name: str(l?.name),
      description: str(l?.description),
      quantity: formatNumberInput(l?.quantity),
      unitCode: str(l?.unitCode) || "C62",
      unitPrice: formatNumberInput(l?.unitPrice),
      vatCategory: str(l?.vatCategory) || "S",
      vatRate: formatNumberInput(l?.vatRate),
    })),
    vatExemptionReason: str(draft.vatExemptionReason),
    prepaidAmount: formatNumberInput(draft.prepaidAmount),
    payment: {
      meansCode: str(draft.payment?.meansCode),
      iban: draft.payment?.iban ? formatIban(draft.payment.iban) : "",
      bic: str(draft.payment?.bic),
      reference: str(draft.payment?.reference),
      termsText: str(draft.payment?.termsText),
    },
    legalNotes: {
      latePaymentPenalty: str(draft.legalNotes?.latePaymentPenalty),
      recoveryFee: str(draft.legalNotes?.recoveryFee),
      earlyPaymentDiscount: str(draft.legalNotes?.earlyPaymentDiscount),
    },
    notes: str(draft.notes),
  }
}

function addressToDraft(a: AddressValues): NonNullable<InvoiceDraft["deliveryAddress"]> {
  return {
    line1: clean(a.line1),
    line2: clean(a.line2),
    postalCode: clean(a.postalCode),
    city: clean(a.city),
    countryCode: clean(a.countryCode)?.toUpperCase(),
  }
}

function partyToDraft(p: PartyValues): NonNullable<InvoiceDraft["buyer"]> {
  const individual = p.kind === "individual"
  return {
    name: clean(p.name),
    kind: p.kind,
    siren: individual ? undefined : stripSpaces(p.siren),
    siret: individual ? undefined : stripSpaces(p.siret),
    vatNumber: stripSpaces(p.vatNumber)?.toUpperCase(),
    email: clean(p.email),
    phone: clean(p.phone),
    address: addressToDraft(p.address),
    electronicAddress: electronicAddressToDraft(p),
  }
}

/** Private customers have none; spaces are typing noise (BR-FR-23 forbids them anyway). */
function electronicAddressToDraft(
  p: PartyValues,
): NonNullable<InvoiceDraft["buyer"]>["electronicAddress"] {
  const value = stripSpaces(p.electronicAddress.value)
  if (p.kind === "individual" || !value) return undefined
  return { scheme: clean(p.electronicAddress.scheme) ?? FR_DIRECTORY_SCHEME, value }
}

/** Number text → number. Blank and unparseable text both give `undefined` (see `numberIssues`). */
function toNumber(text: string): number | undefined {
  const n = parseFrNumber(text)
  return n === null || Number.isNaN(n) ? undefined : n
}

const isVatCategory = (v: string): v is VatCategory => VAT_CATEGORIES.some((c) => c.code === v)

export function formToDraft(values: FormValues): InvoiceDraft {
  const operation = OPERATION_CATEGORIES.find((c) => c.code === values.operationCategory)
  return {
    number: clean(values.number),
    typeCode: values.typeCode === "381" ? "381" : "380",
    issueDate: clean(values.issueDate),
    dueDate: clean(values.dueDate),
    deliveryDate: clean(values.deliveryDate),
    operationCategory: operation?.code,
    vatOnDebits: values.vatOnDebits ? true : undefined,
    currency: clean(values.currency),
    seller: {
      ...partyToDraft({ ...values.seller, kind: "company" }),
      legalForm: clean(values.seller.legalForm),
      shareCapital: clean(values.seller.shareCapital),
      registration: clean(values.seller.registration),
    },
    buyer: partyToDraft(values.buyer),
    deliveryAddress: values.hasDeliveryAddress ? addressToDraft(values.deliveryAddress) : undefined,
    buyerReference: clean(values.buyerReference),
    orderReference: clean(values.orderReference),
    // A reference without a number is meaningless: drop it rather than send half a record.
    precedingInvoice: values.precedingInvoice.number.trim()
      ? {
          number: values.precedingInvoice.number.trim(),
          issueDate: clean(values.precedingInvoice.issueDate),
        }
      : undefined,
    lines: values.lines.map((l) => {
      const category = isVatCategory(l.vatCategory) ? l.vatCategory : undefined
      return {
        name: clean(l.name),
        description: clean(l.description),
        quantity: toNumber(l.quantity),
        unitCode: UNIT_CODES.some((u) => u.code === l.unitCode) ? l.unitCode : clean(l.unitCode),
        unitPrice: toNumber(l.unitPrice),
        vatCategory: category,
        // The rate only exists for category S (the domain forces 0 otherwise).
        vatRate: category === "S" ? toNumber(l.vatRate) : category ? 0 : undefined,
      }
    }),
    vatExemptionReason: clean(values.vatExemptionReason),
    prepaidAmount: toNumber(values.prepaidAmount),
    payment: {
      meansCode: clean(values.payment.meansCode),
      iban: clean(normalizeIban(values.payment.iban)),
      bic: stripSpaces(values.payment.bic)?.toUpperCase(),
      reference: clean(values.payment.reference),
      termsText: clean(values.payment.termsText),
    },
    legalNotes: {
      latePaymentPenalty: clean(values.legalNotes.latePaymentPenalty),
      recoveryFee: clean(values.legalNotes.recoveryFee),
      earlyPaymentDiscount: clean(values.legalNotes.earlyPaymentDiscount),
    },
    notes: clean(values.notes),
  }
}

const INVALID_NUMBER = "Nombre invalide : saisissez un nombre, par exemple 1 234,56"

/**
 * Blocking issues for number inputs that hold text but no number (typing "abc"). Validation only
 * sees the draft, where that text is already gone, so these are added by the form.
 */
export function numberIssues(values: FormValues): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const check = (path: string, text: string, requireNonNegative = false) => {
    const n = parseFrNumber(text)
    if (n === null) return
    if (Number.isNaN(n)) {
      issues.push({ path, code: "number.invalid", severity: "error", message: INVALID_NUMBER })
    } else if (requireNonNegative && n < 0) {
      issues.push({
        path,
        code: "number.negative",
        severity: "error",
        message: "Le montant déjà payé ne peut pas être négatif",
      })
    }
  }
  values.lines.forEach((line, i) => {
    check(`lines.${i}.quantity`, line.quantity)
    check(`lines.${i}.unitPrice`, line.unitPrice)
    if (line.vatCategory === "S") check(`lines.${i}.vatRate`, line.vatRate)
  })
  check("prepaidAmount", values.prepaidAmount, true)
  return issues
}
