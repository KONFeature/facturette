import { describe, expect, it } from "vitest"
import { DEFAULT_LEGAL_NOTES, type InvoiceDraft } from "../../domain/invoice"
import {
  listCustomers,
  loadSellerProfile,
  MemoryStorage,
  saveCustomerChecked,
  saveSellerProfile,
} from "../../lib/storage"
import type { ValidationIssue } from "../../lib/validation"
import {
  canMemorizeBuyer,
  canMemorizeSeller,
  customerFromDraft,
  formatSavedDate,
  profileAsDraft,
  sellerProfileFromDraft,
} from "./profile"

const address = { line1: "1 rue A", postalCode: "75001", city: "Paris", countryCode: "FR" }
const draft: InvoiceDraft = {
  seller: {
    name: "Ma Société",
    kind: "company",
    siren: "732829320",
    vatNumber: "FR44732829320",
    legalForm: "SAS",
    address,
  },
  buyer: { name: "Client SA", kind: "company", siren: "849012349", address },
  payment: {
    meansCode: "58",
    iban: "FR7630006000011234567890189",
    termsText: "30 jours",
    reference: "R1",
  },
  legalNotes: { ...DEFAULT_LEGAL_NOTES },
  vatExemptionReason: "TVA non applicable, art. 293 B du CGI",
  lines: [{ name: "x", unitCode: "HUR", vatCategory: "E", vatRate: 0 }],
}
const err = (path: string): ValidationIssue => ({
  path,
  code: "x",
  severity: "error",
  message: "m",
})
const warn = (path: string): ValidationIssue => ({
  path,
  code: "x",
  severity: "warning",
  message: "m",
})

describe("sellerProfileFromDraft", () => {
  it("collects seller, payment (without the per-invoice reference), legal notes and defaults", () => {
    const p = sellerProfileFromDraft(draft)
    expect(p?.seller.name).toBe("Ma Société")
    expect(p?.payment).toEqual({
      meansCode: "58",
      iban: "FR7630006000011234567890189",
      bic: undefined,
      termsText: "30 jours",
    })
    expect(p?.legalNotes?.recoveryFee).toBe(DEFAULT_LEGAL_NOTES.recoveryFee)
    expect(p?.defaults).toMatchObject({
      vatCategory: "E",
      unitCode: "HUR",
      vatExemptionReason: draft.vatExemptionReason,
    })
    expect(p?.defaults?.vatRate).toBeUndefined()
  })

  it("keeps the VAT rate for category S and ignores other categories", () => {
    const s = sellerProfileFromDraft({ ...draft, lines: [{ vatCategory: "S", vatRate: 10 }] })
    expect(s?.defaults).toMatchObject({ vatCategory: "S", vatRate: 10 })
    const ae = sellerProfileFromDraft({ ...draft, lines: [{ vatCategory: "AE", vatRate: 0 }] })
    expect(ae?.defaults?.vatCategory).toBeUndefined()
  })

  it("returns null for an incomplete seller", () => {
    expect(sellerProfileFromDraft({ seller: { name: "X" } })).toBeNull()
  })

  it("produces something the storage accepts and returns intact", () => {
    const storage = new MemoryStorage()
    const p = sellerProfileFromDraft(draft)
    expect(p).not.toBeNull()
    if (!p) return
    expect(saveSellerProfile(p, storage)).toBe(true)
    expect(loadSellerProfile(storage)?.seller.siren).toBe("732829320")
  })

  it("remembers the seller's electronic address", () => {
    const storage = new MemoryStorage()
    const electronicAddress = { scheme: "0225", value: "732829320_73282932000074" }
    const p = sellerProfileFromDraft({ ...draft, seller: { ...draft.seller, electronicAddress } })
    if (!p) throw new Error("no profile")
    saveSellerProfile(p, storage)
    expect(loadSellerProfile(storage)?.seller.electronicAddress).toEqual(electronicAddress)
  })
})

describe("canMemorize*", () => {
  it("needs a complete block without blocking issue on it", () => {
    expect(canMemorizeSeller(draft, [])).toBe(true)
    expect(canMemorizeSeller(draft, [err("seller.siret")])).toBe(false)
    expect(canMemorizeSeller(draft, [warn("seller.vatNumber"), err("buyer.name")])).toBe(true)
    expect(canMemorizeSeller({ seller: { name: "X" } }, [])).toBe(false)
    expect(canMemorizeBuyer(draft, [])).toBe(true)
    expect(canMemorizeBuyer(draft, [err("buyer.address.city")])).toBe(false)
    expect(canMemorizeBuyer({}, [])).toBe(false)
  })

  it("does not confuse seller and sellerX prefixes", () => {
    expect(canMemorizeSeller(draft, [err("sellerNote")])).toBe(true)
  })
})

describe("customerFromDraft", () => {
  it("returns the buyer when it satisfies the party schema, else null", () => {
    expect(customerFromDraft(draft)?.name).toBe("Client SA")
    expect(customerFromDraft({ buyer: { name: "Seul" } })).toBeNull()
  })

  it("is accepted by the customer storage", () => {
    const storage = new MemoryStorage()
    const party = customerFromDraft(draft)
    expect(party).not.toBeNull()
    if (!party) return
    expect(saveCustomerChecked(party, storage).persisted).toBe(true)
    expect(listCustomers(storage)[0]?.party.name).toBe("Client SA")
  })

  it("remembers the customer's electronic address", () => {
    const storage = new MemoryStorage()
    const electronicAddress = { scheme: "0225", value: "849012349_STANDARD" }
    const party = customerFromDraft({ buyer: { ...draft.buyer, electronicAddress } })
    if (!party) throw new Error("no customer")
    saveCustomerChecked(party, storage)
    expect(listCustomers(storage)[0]?.party.electronicAddress).toEqual(electronicAddress)
  })
})

describe("profileAsDraft", () => {
  it("exposes the fields a profile fills, and nothing without a profile", () => {
    expect(profileAsDraft(null)).toBeUndefined()
    const profile = sellerProfileFromDraft(draft)
    if (!profile) throw new Error("profile expected")
    const asDraft = profileAsDraft({ ...profile, updatedAt: "2026-01-01T00:00:00Z" })
    expect(asDraft?.seller?.name).toBe("Ma Société")
    expect(asDraft?.payment?.iban).toBe("FR7630006000011234567890189")
    expect(asDraft?.vatExemptionReason).toBe(draft.vatExemptionReason)
  })
})

describe("formatSavedDate", () => {
  it("formats an ISO stamp in French and rejects garbage", () => {
    expect(formatSavedDate("2026-03-03T10:00:00Z")).toBe("3 mars 2026")
    expect(formatSavedDate("nope")).toBeNull()
  })
})
