import { z } from "zod"
import {
  deriveSiren,
  type InvoiceDraft,
  type LegalNotes,
  legalNotesSchema,
  type Party,
  type Payment,
  partySchema,
  type Seller,
  sellerSchema,
} from "../../domain/invoice"
import { invoiceDraftSchema } from "./draft-schema"
import {
  KEY_PREFIX,
  keyOf,
  readEnvelope,
  readEnvelopeData,
  removeKey,
  resolveStorage,
  writeEnvelope,
} from "./envelope"

export { type Envelope, MemoryStorage, STORAGE_VERSION } from "./envelope"

/**
 * localStorage persistence. Everything is namespaced `facturette:v1:*`, validated with zod on
 * read (corrupt or foreign data is ignored, never thrown), and takes an injectable `Storage`
 * so it is unit-testable without a DOM. All functions are synchronous.
 *
 * Writes return `false` (never throw) when the browser refuses them (quota, private mode).
 * When `localStorage` is unavailable, an in-memory fallback is used so the app keeps working
 * for the current session.
 *
 * Privacy: nothing leaves the browser. The imported PDF itself is never stored.
 *
 * OWNER: lane `storage`. Keep these signatures; additions are welcome.
 */

export interface SellerProfile {
  seller: Seller
  /** Payment details and legal texts reused on every new invoice. */
  payment?: Pick<Payment, "meansCode" | "iban" | "bic" | "termsText">
  legalNotes?: LegalNotes
  /** Default VAT for new lines. */
  defaults?: {
    vatCategory?: "S" | "E"
    vatRate?: number
    vatExemptionReason?: string
    unitCode?: string
  }
  updatedAt: string
}

export interface SavedCustomer {
  /** Stable id (SIREN if known, else slug of the name). */
  id: string
  party: Party
  updatedAt: string
}

/** Maximum number of remembered customers; the least recently updated are dropped. */
export const MAX_CUSTOMERS = 200

const KEYS = {
  profile: keyOf("profile"),
  customers: keyOf("customers"),
  draft: keyOf("draft"),
  lastNumber: keyOf("lastInvoiceNumber"),
} as const

const sellerProfileSchema = z.object({
  seller: sellerSchema,
  payment: z
    .object({
      meansCode: z.string().min(1),
      iban: z.string().optional(),
      bic: z.string().optional(),
      termsText: z.string().optional(),
    })
    .optional(),
  legalNotes: legalNotesSchema.optional(),
  defaults: z
    .object({
      vatCategory: z.enum(["S", "E"]).optional(),
      vatRate: z.number().optional(),
      vatExemptionReason: z.string().optional(),
      unitCode: z.string().optional(),
    })
    .optional(),
  updatedAt: z.string(),
})

const savedCustomerSchema = z.object({
  id: z.string().min(1),
  party: partySchema,
  updatedAt: z.string(),
})

// ---------------------------------------------------------------------------------------------
// Seller profile
// ---------------------------------------------------------------------------------------------

export const loadSellerProfile = (s?: Storage): SellerProfile | null =>
  readEnvelope(resolveStorage(s), KEYS.profile, sellerProfileSchema)

/**
 * Single record, overwritten. Returns false when the profile is structurally incomplete
 * (it must satisfy `sellerSchema` to be loadable) or when the write fails.
 */
export const saveSellerProfile = (p: Omit<SellerProfile, "updatedAt">, s?: Storage): boolean => {
  const profile: SellerProfile = { ...p, updatedAt: new Date().toISOString() }
  if (!sellerProfileSchema.safeParse(profile).success) return false
  return writeEnvelope(resolveStorage(s), KEYS.profile, profile)
}

export const clearSellerProfile = (s?: Storage): boolean =>
  removeKey(resolveStorage(s), KEYS.profile)

// ---------------------------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------------------------

const slugify = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

/** SIREN when derivable, else a slug of the name ("client" when the name has no letters). */
export const customerId = (party: Party): string =>
  deriveSiren(party) ?? (slugify(party.name) || "client")

/** Valid customers, most recently updated first. Invalid entries are skipped individually. */
export const listCustomers = (s?: Storage): SavedCustomer[] => {
  const data = readEnvelopeData(resolveStorage(s), KEYS.customers)
  if (!Array.isArray(data)) return []
  const customers: SavedCustomer[] = []
  for (const item of data) {
    const parsed = savedCustomerSchema.safeParse(item)
    if (parsed.success) customers.push(parsed.data)
  }
  // Array.prototype.sort is stable: ties keep stored order.
  return customers.sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
  )
}

/** Like `saveCustomer` but also reports whether the write reached the storage. */
export const saveCustomerChecked = (
  party: Party,
  s?: Storage,
): { customer: SavedCustomer; persisted: boolean } => {
  const storage = resolveStorage(s)
  const customer: SavedCustomer = {
    id: customerId(party),
    party,
    updatedAt: new Date().toISOString(),
  }
  if (!partySchema.safeParse(party).success) return { customer, persisted: false }
  const others = listCustomers(storage).filter((c) => c.id !== customer.id)
  const next = [customer, ...others].slice(0, MAX_CUSTOMERS)
  return { customer, persisted: writeEnvelope(storage, KEYS.customers, next) }
}

/** Upsert by id (SIREN or name slug); the saved customer becomes the most recent. */
export const saveCustomer = (party: Party, s?: Storage): SavedCustomer =>
  saveCustomerChecked(party, s).customer

export const deleteCustomer = (id: string, s?: Storage): boolean => {
  const storage = resolveStorage(s)
  const all = listCustomers(storage)
  const next = all.filter((c) => c.id !== id)
  if (next.length === all.length) return true
  return writeEnvelope(storage, KEYS.customers, next)
}

// ---------------------------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------------------------

/** In-progress form values, so a refresh does not lose the work. */
export const loadDraft = (s?: Storage): InvoiceDraft | null =>
  readEnvelope(resolveStorage(s), KEYS.draft, invoiceDraftSchema)

/** Saved as given (empty strings kept). The imported PDF is never part of a draft. */
export const saveDraft = (d: InvoiceDraft, s?: Storage): boolean =>
  writeEnvelope(resolveStorage(s), KEYS.draft, d)

export const clearDraft = (s?: Storage): boolean => removeKey(resolveStorage(s), KEYS.draft)

// ---------------------------------------------------------------------------------------------
// Invoice numbering
// ---------------------------------------------------------------------------------------------

/** Remember the last issued number to propose the next one ("2026-009" → "2026-010"). */
export const rememberInvoiceNumber = (number: string, s?: Storage): boolean => {
  const trimmed = number.trim()
  if (!trimmed) return false
  return writeEnvelope(resolveStorage(s), KEYS.lastNumber, trimmed)
}

/** Increment a run of digits as a string (no overflow), keeping leading zeros. */
const incrementDigits = (digits: string): string => {
  const chars = digits.split("")
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] === "9") {
      chars[i] = "0"
    } else {
      chars[i] = String(Number(chars[i]) + 1)
      return chars.join("")
    }
  }
  return `1${chars.join("")}`
}

/** Increment the last run of digits of `value`, preserving prefix, suffix and zero padding. */
export const incrementInvoiceNumber = (value: string): string | null => {
  const match = /^(.*?)(\d+)(\D*)$/s.exec(value)
  if (!match) return null
  const [, prefix = "", digits = "", suffix = ""] = match
  return `${prefix}${incrementDigits(digits)}${suffix}`
}

export const suggestNextInvoiceNumber = (s?: Storage): string | null => {
  const last = readEnvelope(resolveStorage(s), KEYS.lastNumber, z.string())
  return last ? incrementInvoiceNumber(last) : null
}

// ---------------------------------------------------------------------------------------------
// Wipe
// ---------------------------------------------------------------------------------------------

/** Wipe every `facturette:*` key (any version) and leave foreign keys alone. */
export const clearAllData = (s?: Storage): boolean => {
  const storage = resolveStorage(s)
  try {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(KEY_PREFIX)) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
    return true
  } catch {
    return false
  }
}
