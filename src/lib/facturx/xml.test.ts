import { XMLParser } from "fast-xml-parser"
import { describe, expect, it } from "vitest"
import { scenarios } from "./fixtures/scenarios"
import { buildFacturXXml, escapeXml } from "./xml"

// biome-ignore lint/suspicious/noExplicitAny: parsed XML is untyped by nature, tests only navigate it
type Tree = any

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: false,
})

const parse = (xml: string): Tree => parser.parse(xml)
const scenario = (name: string) => {
  const found = scenarios.find((s) => s.name === name)
  if (!found) throw new Error(`unknown scenario ${name}`)
  return found.invoice
}
const build = (name: string, profile: "EN16931" | "BASIC" = "EN16931"): Tree =>
  parse(buildFacturXXml(scenario(name), { profile }))

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const txn = (t: Tree): Tree => t["rsm:CrossIndustryInvoice"]["rsm:SupplyChainTradeTransaction"]
const settlement = (t: Tree): Tree => txn(t)["ram:ApplicableHeaderTradeSettlement"]
const agreement = (t: Tree): Tree => txn(t)["ram:ApplicableHeaderTradeAgreement"]
const doc = (t: Tree): Tree => t["rsm:CrossIndustryInvoice"]["rsm:ExchangedDocument"]
const notes = (t: Tree): Tree[] => arr(doc(t)["ram:IncludedNote"])

describe("buildFacturXXml envelope", () => {
  it("starts with an XML declaration and ends with a newline", () => {
    const xml = buildFacturXXml(scenario("standard-20"))
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true)
    expect(xml.endsWith("\n")).toBe(true)
  })

  it("uses the guideline ids of docs/DESIGN.md", () => {
    const en = build("standard-20")
    const basic = build("standard-20", "BASIC")
    const id = (t: Tree) =>
      t["rsm:CrossIndustryInvoice"]["rsm:ExchangedDocumentContext"][
        "ram:GuidelineSpecifiedDocumentContextParameter"
      ]["ram:ID"]
    expect(id(en)).toBe("urn:cen.eu:en16931:2017")
    expect(id(basic)).toBe("urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic")
  })

  it("defaults to the EN 16931 profile", () => {
    const invoice = scenario("standard-20")
    expect(buildFacturXXml(invoice)).toBe(buildFacturXXml(invoice, { profile: "EN16931" }))
  })

  it("is deterministic for every scenario and profile", () => {
    for (const s of scenarios) {
      for (const profile of s.profiles) {
        expect(buildFacturXXml(s.invoice, { profile })).toBe(
          buildFacturXXml(s.invoice, { profile }),
        )
      }
    }
  })
})

describe("document header", () => {
  it("writes number, type code and format-102 issue date", () => {
    const d = doc(build("credit-note"))
    expect(d["ram:ID"]).toBe("AV-2026-0001")
    expect(d["ram:TypeCode"]).toBe("381")
    expect(d["ram:IssueDateTime"]["udt:DateTimeString"]["#text"]).toBe("20261001")
    expect(d["ram:IssueDateTime"]["udt:DateTimeString"]["@_format"]).toBe("102")
  })

  it("references the corrected invoice on a credit note (BT-25 / BT-26)", () => {
    const ref =
      build("credit-note")["rsm:CrossIndustryInvoice"]["rsm:SupplyChainTradeTransaction"][
        "ram:ApplicableHeaderTradeSettlement"
      ]["ram:InvoiceReferencedDocument"]
    expect(ref["ram:IssuerAssignedID"]).toBe("FA-2026-0001")
    expect(ref["ram:FormattedIssueDateTime"]["qdt:DateTimeString"]["#text"]).toBe("20260915")
    expect(ref["ram:FormattedIssueDateTime"]["qdt:DateTimeString"]["@_format"]).toBe("102")
  })

  it("emits no invoice reference on a regular invoice", () => {
    const settlement =
      build("standard-20")["rsm:CrossIndustryInvoice"]["rsm:SupplyChainTradeTransaction"][
        "ram:ApplicableHeaderTradeSettlement"
      ]
    expect(settlement["ram:InvoiceReferencedDocument"]).toBeUndefined()
  })

  it("maps the operation category to BT-23", () => {
    const ctx = (name: string) =>
      build(name)["rsm:CrossIndustryInvoice"]["rsm:ExchangedDocumentContext"][
        "ram:BusinessProcessSpecifiedDocumentContextParameter"
      ]["ram:ID"]
    expect(ctx("standard-20")).toBe("S1")
    expect(ctx("delivery-address")).toBe("B1")
    expect(ctx("multi-rate")).toBe("M1")
  })

  it("emits legal mentions with unique Factur-X subject codes", () => {
    const n = notes(build("standard-20"))
    const codes = n.map((x) => x["ram:SubjectCode"])
    expect(codes).toEqual(["ABL", "PMD", "PMT", "AAB"])
    expect(n[0]["ram:Content"]).toContain("Capital social : 10 000 €")
    expect(n[2]["ram:Content"]).toContain("40 €")
  })

  it("emits TXD for VAT on debits and AAI for the free note", () => {
    const codes = notes(build("vat-on-debits")).map((x) => x["ram:SubjectCode"])
    expect(codes).toContain("TXD")
    expect(notes(build("credit-note")).map((x) => x["ram:SubjectCode"])).toContain("AAI")
  })
})

describe("parties", () => {
  it("writes SIRET as GlobalID 0009, SIREN as legal org 0002, VAT with scheme VA", () => {
    const seller = agreement(build("standard-20"))["ram:SellerTradeParty"]
    expect(seller["ram:GlobalID"]).toEqual({ "#text": "73282932000074", "@_schemeID": "0009" })
    expect(seller["ram:SpecifiedLegalOrganization"]["ram:ID"]).toEqual({
      "#text": "732829320",
      "@_schemeID": "0002",
    })
    expect(seller["ram:SpecifiedTaxRegistration"]["ram:ID"]).toEqual({
      "#text": "FR44732829320",
      "@_schemeID": "VA",
    })
    expect(seller["ram:URIUniversalCommunication"]["ram:URIID"]["@_schemeID"]).toBe("0225")
  })

  it("franchise en base: category E, VATEX-FR-FRANCHISE, SIREN as FC tax registration", () => {
    const t = build("franchise-en-base")
    const seller = agreement(t)["ram:SellerTradeParty"]
    expect(seller["ram:SpecifiedTaxRegistration"]["ram:ID"]).toEqual({
      "#text": "813569042",
      "@_schemeID": "FC",
    })
    const tax = arr(settlement(t)["ram:ApplicableTradeTax"])
    expect(tax).toHaveLength(1)
    expect(tax[0]["ram:CategoryCode"]).toBe("E")
    expect(tax[0]["ram:ExemptionReason"]).toBe("TVA non applicable, art. 293 B du CGI")
    expect(tax[0]["ram:ExemptionReasonCode"]).toBe("VATEX-FR-FRANCHISE")
    expect(tax[0]["ram:RateApplicablePercent"]).toBe("0.00")
    expect(tax[0]["ram:CalculatedAmount"]).toBe("0.00")
  })

  it("private customer: no SIREN, no legal organization, no endpoint", () => {
    const buyer = agreement(build("private-customer"))["ram:BuyerTradeParty"]
    expect(buyer["ram:SpecifiedLegalOrganization"]).toBeUndefined()
    expect(buyer["ram:URIUniversalCommunication"]).toBeUndefined()
    expect(buyer["ram:Name"]).toBe("Camille Durand")
  })

  it("not subject (O): no VAT identifiers and no rate (BR-O-02)", () => {
    const t = build("not-subject")
    const ag = agreement(t)
    expect(ag["ram:SellerTradeParty"]["ram:SpecifiedTaxRegistration"]).toBeUndefined()
    // Seller has a VAT number in the fixture, but it must be dropped for category O.
    expect(JSON.stringify(ag)).not.toContain('"VA"')
    expect(
      arr(settlement(t)["ram:ApplicableTradeTax"])[0]["ram:RateApplicablePercent"],
    ).toBeUndefined()
  })

  it("BASIC drops the contact block", () => {
    const seller = agreement(build("standard-20", "BASIC"))["ram:SellerTradeParty"]
    expect(seller["ram:DefinedTradeContact"]).toBeUndefined()
    const en = agreement(build("standard-20"))["ram:SellerTradeParty"]
    expect(en["ram:DefinedTradeContact"]["ram:EmailURIUniversalCommunication"]["ram:URIID"]).toBe(
      "contact@atelier-lumiere.fr",
    )
  })
})

describe("exemption categories", () => {
  const taxOf = (name: string) => arr(settlement(build(name))["ram:ApplicableTradeTax"])[0]
  it.each([
    ["autoliquidation", "AE", "VATEX-EU-AE"],
    ["intra-community-supply", "K", "VATEX-EU-IC"],
    ["export", "G", "VATEX-EU-G"],
    ["not-subject", "O", "VATEX-EU-O"],
  ])("%s → %s / %s", (name, category, code) => {
    const tax = taxOf(name)
    expect(tax["ram:CategoryCode"]).toBe(category)
    expect(tax["ram:ExemptionReasonCode"]).toBe(code)
    expect(tax["ram:ExemptionReason"]).toBeTruthy()
  })

  it("intra-community supply carries a deliver-to country and a delivery date", () => {
    const t = build("intra-community-supply")
    const delivery = txn(t)["ram:ApplicableHeaderTradeDelivery"]
    expect(delivery["ram:ShipToTradeParty"]["ram:PostalTradeAddress"]["ram:CountryID"]).toBe("DE")
    expect(
      delivery["ram:ActualDeliverySupplyChainEvent"]["ram:OccurrenceDateTime"][
        "udt:DateTimeString"
      ]["#text"],
    ).toBe("20260928")
  })
})

describe("lines and amounts", () => {
  it("multi-rate: one breakdown per rate with totals from computeTotals", () => {
    const t = build("multi-rate")
    const tax = arr(settlement(t)["ram:ApplicableTradeTax"])
    expect(tax.map((x) => x["ram:RateApplicablePercent"])).toEqual(["20.00", "10.00", "5.50"])
    expect(tax.map((x) => x["ram:BasisAmount"])).toEqual(["243.33", "50.00", "39.82"])
    expect(tax.map((x) => x["ram:CalculatedAmount"])).toEqual(["48.67", "5.00", "2.19"])
    const sum = settlement(t)["ram:SpecifiedTradeSettlementHeaderMonetarySummation"]
    expect(sum["ram:LineTotalAmount"]).toBe("333.15")
    expect(sum["ram:TaxTotalAmount"]["#text"]).toBe("55.86")
    expect(sum["ram:TaxTotalAmount"]["@_currencyID"]).toBe("EUR")
    expect(sum["ram:GrandTotalAmount"]).toBe("389.01")
    expect(sum["ram:DuePayableAmount"]).toBe("389.01")
    expect(sum["ram:TotalPrepaidAmount"]).toBeUndefined()
  })

  it("keeps up to 4 decimals on unit prices and 2 minimum", () => {
    const lines = arr(txn(build("unit-price-decimals"))["ram:IncludedSupplyChainTradeLineItem"])
    const price = (l: Tree) =>
      l["ram:SpecifiedLineTradeAgreement"]["ram:NetPriceProductTradePrice"]["ram:ChargeAmount"]
    expect(lines.map(price)).toEqual(["0.125", "0.0875", "17.3333"])
    const std = arr(txn(build("standard-20"))["ram:IncludedSupplyChainTradeLineItem"])
    expect(price(std[0])).toBe("500.00")
  })

  it("credit note keeps positive quantities and prices, zero quantity allowed", () => {
    const lines = arr(
      txn(build("credit-note-zero-quantity-line"))["ram:IncludedSupplyChainTradeLineItem"],
    )
    const qty = (l: Tree) => l["ram:SpecifiedLineTradeDelivery"]["ram:BilledQuantity"]["#text"]
    expect(lines.map(qty)).toEqual(["5.00", "0.00"])
  })

  it("negative unit price: absolute price, negated quantity, signed line net", () => {
    const t = build("discount-negative-unit-price")
    const lines = arr(txn(t)["ram:IncludedSupplyChainTradeLineItem"])
    const price = (l: Tree) =>
      l["ram:SpecifiedLineTradeAgreement"]["ram:NetPriceProductTradePrice"]["ram:ChargeAmount"]
    const qty = (l: Tree) => l["ram:SpecifiedLineTradeDelivery"]["ram:BilledQuantity"]["#text"]
    const net = (l: Tree) =>
      l["ram:SpecifiedLineTradeSettlement"]["ram:SpecifiedTradeSettlementLineMonetarySummation"][
        "ram:LineTotalAmount"
      ]
    expect(lines.map(price)).toEqual(["90.00", "36.00", "1.125"])
    expect(lines.map(qty)).toEqual(["4.00", "-1.00", "-3.00"])
    expect(lines.map(net)).toEqual(["360.00", "-36.00", "-3.38"])
    expect(JSON.stringify(t)).not.toMatch(/ChargeAmount":"-/)
  })

  it("writes the prepaid amount and the amount due", () => {
    const sum = settlement(build("deposit-prepaid"))[
      "ram:SpecifiedTradeSettlementHeaderMonetarySummation"
    ]
    expect(sum["ram:GrandTotalAmount"]).toBe("2880.00")
    expect(sum["ram:TotalPrepaidAmount"]).toBe("300.00")
    expect(sum["ram:DuePayableAmount"]).toBe("2580.00")
  })

  it("BASIC omits the line description, EN16931 keeps it", () => {
    const product = (profile: "EN16931" | "BASIC") =>
      arr(txn(build("special-characters", profile))["ram:IncludedSupplyChainTradeLineItem"])[0][
        "ram:SpecifiedTradeProduct"
      ]
    expect(product("EN16931")["ram:Description"]).toContain("Ligne 2")
    expect(product("BASIC")["ram:Description"]).toBeUndefined()
  })
})

describe("references, delivery and payment", () => {
  it("writes buyer reference, order reference and payment reference", () => {
    const t = build("references")
    expect(agreement(t)["ram:BuyerReference"]).toBe("SERVICE-COMPTA-42")
    expect(agreement(t)["ram:BuyerOrderReferencedDocument"]["ram:IssuerAssignedID"]).toBe(
      "BC-2026-777",
    )
    expect(settlement(t)["ram:PaymentReference"]).toBe("FA-2026-0010")
  })

  it("writes a ship-to party only when the delivery address differs", () => {
    const withAddr = txn(build("delivery-address"))["ram:ApplicableHeaderTradeDelivery"]
    expect(withAddr["ram:ShipToTradeParty"]["ram:PostalTradeAddress"]["ram:CityName"]).toBe("Lille")
    expect(withAddr["ram:ShipToTradeParty"]["ram:PostalTradeAddress"]["ram:LineTwo"]).toBe(
      "Entrepôt 4",
    )
    const without = txn(build("standard-20"))["ram:ApplicableHeaderTradeDelivery"]
    expect(without["ram:ShipToTradeParty"]).toBeUndefined()
  })

  it("SEPA transfer carries IBAN and BIC", () => {
    const means = settlement(build("standard-20"))["ram:SpecifiedTradeSettlementPaymentMeans"]
    expect(means["ram:TypeCode"]).toBe("58")
    expect(means["ram:PayeePartyCreditorFinancialAccount"]["ram:IBANID"]).toBe(
      "FR7630006000011234567890189",
    )
    expect(means["ram:PayeeSpecifiedCreditorFinancialInstitution"]["ram:BICID"]).toBe("AGRIFRPP")
  })

  it("card and cheque have no bank details", () => {
    for (const name of ["payment-card", "payment-cheque"]) {
      const means = settlement(build(name))["ram:SpecifiedTradeSettlementPaymentMeans"]
      expect(means["ram:PayeePartyCreditorFinancialAccount"]).toBeUndefined()
      expect(means["ram:PayeeSpecifiedCreditorFinancialInstitution"]).toBeUndefined()
    }
  })

  it("payment terms: description and due date are independent", () => {
    const terms = (name: string) => settlement(build(name))["ram:SpecifiedTradePaymentTerms"]
    const both = terms("terms-and-due-date")
    expect(both["ram:Description"]).toBe("Paiement à 30 jours")
    expect(both["ram:DueDateDateTime"]["udt:DateTimeString"]["#text"]).toBe("20261031")
    const dueOnly = terms("due-date-only")
    expect(dueOnly["ram:Description"]).toBeUndefined()
    expect(dueOnly["ram:DueDateDateTime"]).toBeDefined()
    const termsOnly = terms("terms-only")
    expect(termsOnly["ram:Description"]).toBe("Paiement à réception de facture")
    expect(termsOnly["ram:DueDateDateTime"]).toBeUndefined()
  })
})

describe("escaping", () => {
  it("escapeXml handles the five predefined entities", () => {
    expect(escapeXml(`a & b < c > d " e '`)).toBe("a &amp; b &lt; c &gt; d &quot; e &apos;")
  })

  it("strips characters illegal in XML 1.0 but keeps emoji, accents and newlines", () => {
    expect(escapeXml("a\u0007b\u0000c\ud800d")).toBe("abcd")
    expect(escapeXml("é😀\n")).toBe("é😀\n")
  })

  it("special characters round-trip through a parser", () => {
    const invoice = scenario("special-characters")
    const xml = buildFacturXXml(invoice)
    expect(xml).not.toContain("<bio>")
    expect(xml).toContain("&lt;bio&gt;")
    const t = parser.parse(xml)
    const seller = agreement(t)["ram:SellerTradeParty"]
    expect(seller["ram:Name"]).toBe(invoice.seller.name)
    expect(agreement(t)["ram:BuyerTradeParty"]["ram:Name"]).toBe(invoice.buyer.name)
    const line = arr(txn(t)["ram:IncludedSupplyChainTradeLineItem"])[0]
    expect(line["ram:SpecifiedTradeProduct"]["ram:Name"]).toBe(invoice.lines[0]?.name)
    expect(line["ram:SpecifiedTradeProduct"]["ram:Description"]).toContain("Ligne 1\nLigne 2")
    const free = notes(t).find((x) => x["ram:SubjectCode"] === "AAI")
    expect(free?.["ram:Content"]).toContain("🚀")
    expect(free?.["ram:Content"]).not.toContain("\u0007")
  })
})
