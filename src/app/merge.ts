import { deriveSiren, emptyInvoiceDraft, emptyLine, type InvoiceDraft } from "../domain/invoice"
import type { SellerProfile } from "../lib/storage"

type Plain = Record<string, unknown>

const isPlain = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v)

const isBlank = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "")

/**
 * Deep-merge `high` over `low`. Objects merge key by key; arrays and scalars from `high`
 * replace. With `ignoreBlank`, undefined / "" / empty arrays in `high` never replace a value.
 */
export function mergeDeep<T extends Plain>(low: T, high: Plain, ignoreBlank: boolean): T {
  const out: Plain = { ...low }
  for (const [key, value] of Object.entries(high)) {
    if (value === undefined) continue
    if (ignoreBlank && (isBlank(value) || (Array.isArray(value) && value.length === 0))) continue
    const current = out[key]
    out[key] = isPlain(value) && isPlain(current) ? mergeDeep(current, value, ignoreBlank) : value
  }
  return out as T
}

/** Deep-merge a patch into a draft: the patch wins, including with empty strings (user edits). */
export function patchDraftValue(draft: InvoiceDraft, patch: InvoiceDraft): InvoiceDraft {
  return mergeDeep(draft, patch, false)
}

/**
 * Starting draft = brand-new defaults < saved profile defaults < values detected in the PDF
 * < saved seller profile, but only when the seller detected in the PDF is that same company
 * (same SIREN). Detected values therefore always beat defaults, and a profile for company A
 * is never mixed into an invoice issued by company B.
 */
export function buildStartingDraft(
  detected: InvoiceDraft,
  profile: SellerProfile | null,
  nextInvoiceNumber: string | null,
): InvoiceDraft {
  const base = emptyInvoiceDraft()
  const defaultsLine = { ...emptyLine(), ...definedOnly(profile?.defaults) }
  const lowLayer: InvoiceDraft = { ...base, lines: [defaultsLine] }

  if (profile) {
    lowLayer.payment = mergeDeep(base.payment ?? {}, definedOnly(profile.payment), true)
    lowLayer.legalNotes = mergeDeep(base.legalNotes ?? {}, definedOnly(profile.legalNotes), true)
    if (profile.defaults?.vatExemptionReason) {
      lowLayer.vatExemptionReason = profile.defaults.vatExemptionReason
    }
  }
  if (nextInvoiceNumber) lowLayer.number = nextInvoiceNumber

  const { lines: detectedLines, ...detectedRest } = detected
  let draft = mergeDeep(lowLayer, detectedRest, true)
  if (detectedLines && detectedLines.length > 0) draft.lines = detectedLines

  if (profile) {
    const profileSiren = deriveSiren(profile.seller)
    const detectedSiren = deriveSiren(detected.seller ?? {})
    const sameName =
      !!detected.seller?.name &&
      detected.seller.name.trim().toLowerCase() === profile.seller.name.trim().toLowerCase()
    if ((profileSiren && detectedSiren === profileSiren) || (!detectedSiren && sameName)) {
      draft = { ...draft, seller: mergeDeep(draft.seller ?? {}, definedOnly(profile.seller), true) }
    } else if (!detectedSiren && !detected.seller?.name) {
      // Nothing detected about the seller at all: the saved profile is the best guess.
      draft = { ...draft, seller: mergeDeep(draft.seller ?? {}, definedOnly(profile.seller), true) }
    }
  }
  return draft
}

/** Copy without undefined / blank values (profile objects may carry empty strings). */
function definedOnly<T extends object>(value: T | undefined): Plain {
  if (!value) return {}
  return mergeDeep({}, value as Plain, true)
}
