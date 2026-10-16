import { describe, expect, it } from "vitest"
import { buildStartingDraft } from "./merge"
import { sellerProfile } from "./test-fakes"

describe("buildStartingDraft: electronic address", () => {
  const saved = { scheme: "0225", value: "732829320_73282932000074" }
  const profile = {
    ...sellerProfile,
    seller: { ...sellerProfile.seller, electronicAddress: saved },
  }

  it("replaces the SIREN default detected in the PDF with the address saved in the profile", () => {
    const detected = {
      seller: { siren: "732829320", electronicAddress: { value: "732829320" } },
    }
    expect(buildStartingDraft(detected, profile, null).seller?.electronicAddress).toEqual(saved)
  })

  it("never gives the profile's address to another company's invoice", () => {
    const detected = {
      seller: { siren: "552081317", electronicAddress: { value: "552081317" } },
    }
    expect(buildStartingDraft(detected, profile, null).seller?.electronicAddress).toEqual({
      value: "552081317",
    })
  })
})
