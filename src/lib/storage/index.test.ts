import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Party } from "../../domain/invoice"
import { emptyInvoiceDraft } from "../../domain/invoice"
import { MemoryStorage } from "./envelope"
import {
  clearAllData,
  clearDraft,
  clearSellerProfile,
  deleteCustomer,
  incrementInvoiceNumber,
  listCustomers,
  loadDraft,
  loadSellerProfile,
  MAX_CUSTOMERS,
  rememberInvoiceNumber,
  saveCustomer,
  saveCustomerChecked,
  saveDraft,
  saveSellerProfile,
  suggestNextInvoiceNumber,
} from "./index"

const address = { line1: "1 rue de la Paix", postalCode: "75002", city: "Paris", countryCode: "FR" }
const party = (over: Partial<Party> = {}): Party => ({
  name: "Acme SARL",
  kind: "company",
  address,
  ...over,
})

class QuotaStorage extends MemoryStorage {
  override setItem(): void {
    throw new DOMException("full", "QuotaExceededError")
  }
}

let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("seller profile", () => {
  const profile = {
    seller: { ...party({ name: "Moi", siret: "73282932000074" }), legalForm: "SAS" },
    payment: { meansCode: "58", iban: "FR7630006000011234567890189" },
    legalNotes: { recoveryFee: "40 €" },
    defaults: { vatCategory: "S" as const, vatRate: 20 },
  }
  it("round trips and namespaces the key", () => {
    expect(loadSellerProfile(storage)).toBeNull()
    expect(saveSellerProfile(profile, storage)).toBe(true)
    const loaded = loadSellerProfile(storage)
    expect(loaded?.seller.name).toBe("Moi")
    expect(loaded?.payment?.iban).toBe(profile.payment.iban)
    expect(loaded?.updatedAt).toMatch(/^\d{4}-/)
    expect(storage.key(0)).toBe("facturette:v1:profile")
  })
  it("overwrites the single record and clears it", () => {
    saveSellerProfile(profile, storage)
    saveSellerProfile({ ...profile, seller: { ...profile.seller, name: "Autre" } }, storage)
    expect(loadSellerProfile(storage)?.seller.name).toBe("Autre")
    expect(storage.length).toBe(1)
    expect(clearSellerProfile(storage)).toBe(true)
    expect(loadSellerProfile(storage)).toBeNull()
  })
  it("refuses structurally incomplete profiles", () => {
    expect(saveSellerProfile({ seller: party({ name: "" }) }, storage)).toBe(false)
    expect(storage.length).toBe(0)
  })
  it("returns null on corrupt JSON, wrong shape and wrong version", () => {
    storage.setItem("facturette:v1:profile", "{nope")
    expect(loadSellerProfile(storage)).toBeNull()
    storage.setItem(
      "facturette:v1:profile",
      JSON.stringify({ v: 1, data: { seller: 3 }, updatedAt: "x" }),
    )
    expect(loadSellerProfile(storage)).toBeNull()
    saveSellerProfile(profile, storage)
    const raw = JSON.parse(storage.getItem("facturette:v1:profile") ?? "{}")
    storage.setItem("facturette:v1:profile", JSON.stringify({ ...raw, v: 2 }))
    expect(loadSellerProfile(storage)).toBeNull()
    storage.setItem("facturette:v1:profile", "null")
    expect(loadSellerProfile(storage)).toBeNull()
  })
  it("returns false on quota exceeded", () => {
    expect(saveSellerProfile(profile, new QuotaStorage())).toBe(false)
  })
})

describe("customers", () => {
  it("uses the SIREN as id when derivable, else a slug", () => {
    expect(saveCustomer(party({ siret: "73282932000074" }), storage).id).toBe("732829320")
    expect(saveCustomer(party({ vatNumber: "FR44732829320" }), storage).id).toBe("732829320")
    expect(saveCustomer(party({ name: "Café  de l'Été !" }), storage).id).toBe("cafe-de-l-ete")
    expect(saveCustomer(party({ name: "!!!" }), storage).id).toBe("client")
  })
  it("upserts and dedupes by id", () => {
    saveCustomer(party({ siren: "732829320", name: "Old" }), storage)
    saveCustomer(party({ siret: "73282932000074", name: "New" }), storage)
    const list = listCustomers(storage)
    expect(list).toHaveLength(1)
    expect(list[0]?.party.name).toBe("New")
  })
  it("sorts by most recently updated", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"))
    saveCustomer(party({ name: "A" }), storage)
    vi.setSystemTime(new Date("2026-01-02T10:00:00Z"))
    saveCustomer(party({ name: "B" }), storage)
    vi.setSystemTime(new Date("2026-01-03T10:00:00Z"))
    saveCustomer(party({ name: "A" }), storage)
    expect(listCustomers(storage).map((c) => c.party.name)).toEqual(["A", "B"])
  })
  it("keeps newest first even with identical timestamps", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"))
    saveCustomer(party({ name: "A" }), storage)
    saveCustomer(party({ name: "B" }), storage)
    expect(listCustomers(storage).map((c) => c.party.name)).toEqual(["B", "A"])
  })
  it("caps at 200, dropping the oldest", () => {
    for (let i = 0; i < MAX_CUSTOMERS + 5; i++)
      saveCustomer(party({ name: `Client ${i}` }), storage)
    const list = listCustomers(storage)
    expect(list).toHaveLength(MAX_CUSTOMERS)
    expect(list[0]?.party.name).toBe(`Client ${MAX_CUSTOMERS + 4}`)
    expect(list.some((c) => c.party.name === "Client 0")).toBe(false)
  })
  it("deletes by id", () => {
    const a = saveCustomer(party({ name: "A" }), storage)
    saveCustomer(party({ name: "B" }), storage)
    expect(deleteCustomer(a.id, storage)).toBe(true)
    expect(deleteCustomer("unknown", storage)).toBe(true)
    expect(listCustomers(storage).map((c) => c.id)).toEqual(["b"])
  })
  it("skips corrupt entries and survives corrupt storage", () => {
    saveCustomer(party({ name: "A" }), storage)
    const raw = JSON.parse(storage.getItem("facturette:v1:customers") ?? "{}")
    storage.setItem(
      "facturette:v1:customers",
      JSON.stringify({ ...raw, data: [...raw.data, { id: "x" }, 4, null] }),
    )
    expect(listCustomers(storage)).toHaveLength(1)
    storage.setItem("facturette:v1:customers", JSON.stringify({ ...raw, data: "oops" }))
    expect(listCustomers(storage)).toEqual([])
    storage.setItem("facturette:v1:customers", "][")
    expect(listCustomers(storage)).toEqual([])
    storage.setItem("facturette:v1:customers", JSON.stringify({ ...raw, v: 2 }))
    expect(listCustomers(storage)).toEqual([])
  })
  it("reports quota failures without throwing", () => {
    const result = saveCustomerChecked(party(), new QuotaStorage())
    expect(result.persisted).toBe(false)
    expect(result.customer.id).toBe("acme-sarl")
    expect(saveCustomerChecked(party(), storage).persisted).toBe(true)
  })
  it("does not persist an invalid party", () => {
    expect(saveCustomerChecked(party({ name: "" }), storage).persisted).toBe(false)
    expect(listCustomers(storage)).toEqual([])
  })
})

describe("draft", () => {
  it("round trips a draft with empty strings untouched", () => {
    const draft = emptyInvoiceDraft()
    draft.number = ""
    draft.buyer = { ...draft.buyer, name: "", siren: "" }
    expect(saveDraft(draft, storage)).toBe(true)
    expect(loadDraft(storage)).toEqual(draft)
  })
  it("returns null for corrupt, wrong-shape and wrong-version data", () => {
    expect(loadDraft(storage)).toBeNull()
    storage.setItem("facturette:v1:draft", "not json")
    expect(loadDraft(storage)).toBeNull()
    storage.setItem(
      "facturette:v1:draft",
      JSON.stringify({ v: 1, data: { lines: "x" }, updatedAt: "t" }),
    )
    expect(loadDraft(storage)).toBeNull()
    storage.setItem(
      "facturette:v1:draft",
      JSON.stringify({ v: 1, data: { typeCode: "999" }, updatedAt: "t" }),
    )
    expect(loadDraft(storage)).toBeNull()
    storage.setItem("facturette:v1:draft", JSON.stringify({ v: 2, data: {}, updatedAt: "t" }))
    expect(loadDraft(storage)).toBeNull()
    storage.setItem("facturette:v1:draft", JSON.stringify({ foreign: true }))
    expect(loadDraft(storage)).toBeNull()
  })
  it("clears and reports quota failure", () => {
    saveDraft({ number: "1" }, storage)
    expect(clearDraft(storage)).toBe(true)
    expect(loadDraft(storage)).toBeNull()
    expect(saveDraft({ number: "1" }, new QuotaStorage())).toBe(false)
  })
})

describe("invoice number suggestion", () => {
  it.each([
    ["2026-009", "2026-010"],
    ["FA-2026-0099", "FA-2026-0100"],
    ["INV9", "INV10"],
    ["2026/12/001", "2026/12/002"],
    ["999", "1000"],
    ["F-007-A", "F-008-A"],
    ["0", "1"],
  ])("%s -> %s", (from, to) => {
    expect(incrementInvoiceNumber(from)).toBe(to)
    expect(rememberInvoiceNumber(from, storage)).toBe(true)
    expect(suggestNextInvoiceNumber(storage)).toBe(to)
  })
  it("returns null when nothing is remembered or there are no digits", () => {
    expect(suggestNextInvoiceNumber(storage)).toBeNull()
    expect(incrementInvoiceNumber("ABC")).toBeNull()
    rememberInvoiceNumber("ABC", storage)
    expect(suggestNextInvoiceNumber(storage)).toBeNull()
    expect(rememberInvoiceNumber("   ", storage)).toBe(false)
  })
  it("ignores corrupt data and quota errors", () => {
    storage.setItem("facturette:v1:lastInvoiceNumber", "{")
    expect(suggestNextInvoiceNumber(storage)).toBeNull()
    storage.setItem(
      "facturette:v1:lastInvoiceNumber",
      JSON.stringify({ v: 1, data: 42, updatedAt: "t" }),
    )
    expect(suggestNextInvoiceNumber(storage)).toBeNull()
    expect(rememberInvoiceNumber("A1", new QuotaStorage())).toBe(false)
  })
})

describe("clearAllData", () => {
  it("removes only facturette keys", () => {
    storage.setItem("other:key", "keep")
    storage.setItem("facturette", "keep (no colon)")
    saveDraft({ number: "1" }, storage)
    saveCustomer(party(), storage)
    storage.setItem("facturette:v0:legacy", "x")
    expect(clearAllData(storage)).toBe(true)
    expect(storage.length).toBe(2)
    expect(storage.getItem("other:key")).toBe("keep")
    expect(storage.getItem("facturette")).toBe("keep (no colon)")
  })
})

describe("unavailable storage", () => {
  it("falls back to memory when accessing localStorage throws", () => {
    vi.stubGlobal("localStorage", undefined)
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError")
      },
    })
    expect(saveDraft({ number: "9" })).toBe(true)
    expect(loadDraft()).toEqual({ number: "9" })
    expect(clearAllData()).toBe(true)
    expect(loadDraft()).toBeNull()
  })
  it("falls back to memory when localStorage is missing", () => {
    vi.stubGlobal("localStorage", undefined)
    expect(rememberInvoiceNumber("A-1")).toBe(true)
    expect(suggestNextInvoiceNumber()).toBe("A-2")
    clearAllData()
  })
  it("never throws when the storage itself throws on read/remove", () => {
    const hostile: Storage = {
      length: 1,
      clear: () => undefined,
      key: () => {
        throw new Error("boom")
      },
      getItem: () => {
        throw new Error("boom")
      },
      setItem: () => {
        throw new Error("boom")
      },
      removeItem: () => {
        throw new Error("boom")
      },
    }
    expect(loadDraft(hostile)).toBeNull()
    expect(listCustomers(hostile)).toEqual([])
    expect(clearDraft(hostile)).toBe(false)
    expect(clearAllData(hostile)).toBe(false)
  })
})
