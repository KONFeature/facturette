import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { emptyInvoiceDraft, type InvoiceDraft } from "../../domain/invoice"
import {
  draftToForm,
  type FormValues,
  formToDraft,
  type LineValues,
  numberIssues,
} from "./formModel"

const FIXTURES = join(import.meta.dirname, "../../../fixtures/invoices")
const expectedFiles = readdirSync(FIXTURES).filter((f) => f.endsWith(".expected.json"))

function patchLine(form: FormValues, index: number, patch: Partial<LineValues>): void {
  const line = form.lines[index]
  if (!line) throw new Error(`no line ${index}`)
  Object.assign(line, patch)
}

/** Drop undefined keys the way a JSON round trip does, for structural comparison. */
const plain = (d: InvoiceDraft): unknown => JSON.parse(JSON.stringify(d))

describe("draftToForm / formToDraft", () => {
  it("has fixtures to test against", () => {
    expect(expectedFiles.length).toBeGreaterThanOrEqual(10)
  })

  it.each(expectedFiles)("round-trips the ground truth of %s", (file) => {
    const expected: InvoiceDraft = JSON.parse(readFileSync(join(FIXTURES, file), "utf8"))
    expect(plain(formToDraft(draftToForm(expected)))).toEqual(plain(expected))
  })

  it("turns an empty draft into a complete, all-text form", () => {
    const form = draftToForm({})
    expect(form.lines).toHaveLength(1)
    expect(form.currency).toBe("EUR")
    expect(form.typeCode).toBe("380")
    expect(form.seller.address.countryCode).toBe("FR")
    expect(form.hasDeliveryAddress).toBe(false)
    expect(form.lines[0]).toMatchObject({ quantity: "", unitPrice: "", unitCode: "C62" })
  })

  it("formats numbers for editing with a decimal comma", () => {
    const form = draftToForm({
      lines: [{ name: "x", quantity: 2.5, unitPrice: 1234.56, vatCategory: "S", vatRate: 5.5 }],
      prepaidAmount: 100,
    })
    expect(form.lines[0]).toMatchObject({ quantity: "2,5", unitPrice: "1234,56", vatRate: "5,5" })
    expect(form.prepaidAmount).toBe("100")
  })

  it("parses French input into real numbers", () => {
    const form = draftToForm(emptyInvoiceDraft())
    patchLine(form, 0, { name: "Ligne", quantity: "1 234,5", unitPrice: "0,10" })
    form.prepaidAmount = "1 000"
    const draft = formToDraft(form)
    expect(draft.lines?.[0]).toMatchObject({ quantity: 1234.5, unitPrice: 0.1, vatRate: 20 })
    expect(draft.prepaidAmount).toBe(1000)
  })

  it("omits blanks instead of writing empty strings", () => {
    const draft = formToDraft(draftToForm({}))
    expect(draft.number).toBeUndefined()
    expect(draft.seller?.name).toBeUndefined()
    expect(draft.seller?.email).toBeUndefined()
    expect(draft.lines?.[0]?.name).toBeUndefined()
    expect(draft.lines?.[0]?.quantity).toBeUndefined()
    expect(draft.payment?.iban).toBeUndefined()
  })

  it("strips spaces from identifiers and IBAN, and formats them back for display", () => {
    const form = draftToForm({
      seller: { siret: "73282932000074", vatNumber: "FR44732829320" },
      payment: { iban: "FR7630006000011234567890189" },
    })
    expect(form.seller.siret).toBe("732 829 320 00074")
    expect(form.payment.iban).toBe("FR76 3000 6000 0112 3456 7890 189")
    form.seller.vatNumber = "fr 44 732 829 320"
    const draft = formToDraft(form)
    expect(draft.seller?.siret).toBe("73282932000074")
    expect(draft.seller?.vatNumber).toBe("FR44732829320")
    expect(draft.payment?.iban).toBe("FR7630006000011234567890189")
  })

  it("forces the VAT rate to 0 for non-S categories and keeps it for S", () => {
    const form = draftToForm({
      lines: [
        { name: "a", vatCategory: "E", vatRate: 20 },
        { name: "b", vatCategory: "S", vatRate: 10 },
      ],
    })
    patchLine(form, 0, { vatRate: "20" })
    const draft = formToDraft(form)
    expect(draft.lines?.[0]?.vatRate).toBe(0)
    expect(draft.lines?.[1]?.vatRate).toBe(10)
  })

  it("drops the SIREN/SIRET of an individual buyer but keeps what was typed in the form", () => {
    const form = draftToForm({
      buyer: { kind: "company", name: "Jean", siren: "732829320", address: { countryCode: "FR" } },
    })
    form.buyer.kind = "individual"
    expect(formToDraft(form).buyer?.siren).toBeUndefined()
    expect(form.buyer.siren).toBe("732 829 320")
    form.buyer.kind = "company"
    expect(formToDraft(form).buyer?.siren).toBe("732829320")
  })

  it("round-trips an electronic address, defaults its scheme to 0225 and drops a blank one", () => {
    const draft: InvoiceDraft = {
      seller: { electronicAddress: { scheme: "0225", value: "822698916_82269891600035" } },
      buyer: { kind: "company", electronicAddress: { value: "324286319_STANDARD" } },
    }
    const form = draftToForm(draft)
    expect(form.buyer.electronicAddress).toEqual({ scheme: "0225", value: "324286319_STANDARD" })
    const back = formToDraft(form)
    expect(back.seller?.electronicAddress).toEqual(draft.seller?.electronicAddress)
    expect(back.buyer?.electronicAddress).toEqual({ scheme: "0225", value: "324286319_STANDARD" })

    form.buyer.electronicAddress.value = "  "
    expect(formToDraft(form).buyer?.electronicAddress).toBeUndefined()
    form.buyer.electronicAddress.value = "324286319 _STANDARD"
    expect(formToDraft(form).buyer?.electronicAddress?.value).toBe("324286319_STANDARD")
    form.buyer.kind = "individual"
    expect(formToDraft(form).buyer?.electronicAddress).toBeUndefined()
  })

  it("only includes the delivery address when it is switched on", () => {
    const form = draftToForm({
      deliveryAddress: { line1: "5 rue X", postalCode: "75001", city: "Paris", countryCode: "FR" },
    })
    expect(form.hasDeliveryAddress).toBe(true)
    expect(formToDraft(form).deliveryAddress?.city).toBe("Paris")
    form.hasDeliveryAddress = false
    expect(formToDraft(form).deliveryAddress).toBeUndefined()
  })

  it("ignores unknown operation categories and uppercases country codes", () => {
    const form: FormValues = draftToForm({})
    form.operationCategory = "nope"
    form.buyer.address.countryCode = "fr"
    const draft = formToDraft(form)
    expect(draft.operationCategory).toBeUndefined()
    expect(draft.buyer?.address?.countryCode).toBe("FR")
  })
})

describe("numberIssues", () => {
  it("flags text that is not a number, per path", () => {
    const form = draftToForm({})
    patchLine(form, 0, { quantity: "abc", unitPrice: "12,x" })
    form.prepaidAmount = "oops"
    const paths = numberIssues(form).map((i) => i.path)
    expect(paths).toEqual(["lines.0.quantity", "lines.0.unitPrice", "prepaidAmount"])
    expect(numberIssues(form).every((i) => i.severity === "error")).toBe(true)
  })

  it("accepts blank and valid French numbers", () => {
    const form = draftToForm({})
    patchLine(form, 0, { quantity: "1 000,5", unitPrice: "" })
    expect(numberIssues(form)).toEqual([])
  })

  it("ignores the VAT rate of non-S lines and rejects a negative prepaid amount", () => {
    const form = draftToForm({})
    patchLine(form, 0, { vatCategory: "E", vatRate: "zzz" })
    form.prepaidAmount = "-5"
    const issues = numberIssues(form)
    expect(issues.map((i) => i.path)).toEqual(["prepaidAmount"])
    expect(issues[0]?.code).toBe("number.negative")
  })
})
