import { describe, expect, it } from "vitest"
import { DEFAULT_LEGAL_NOTES, type InvoiceDraft } from "../../domain/invoice"
import { requiredPaths, type ValidationIssue, validateInvoice } from "./index"

const TODAY = "2026-10-16"

/** A fully valid draft (SIREN 732829320, VAT key 44, sample IBAN). */
function validDraft(): InvoiceDraft {
  return {
    number: "2026-001",
    typeCode: "380",
    issueDate: "2026-10-01",
    dueDate: "2026-10-31",
    operationCategory: "services",
    currency: "EUR",
    seller: {
      name: "ACME SAS",
      kind: "company",
      siret: "73282932000074",
      vatNumber: "FR44732829320",
      legalForm: "SAS",
      shareCapital: "10 000 €",
      registration: "RCS Paris 732 829 320",
      address: { line1: "1 rue de la Paix", postalCode: "75002", city: "Paris", countryCode: "FR" },
    },
    buyer: {
      name: "Client SARL",
      kind: "company",
      siren: "552032534",
      address: { line1: "2 avenue Foch", postalCode: "69006", city: "Lyon", countryCode: "FR" },
    },
    lines: [
      {
        name: "Développement",
        quantity: 2,
        unitCode: "DAY",
        unitPrice: 500,
        vatCategory: "S",
        vatRate: 20,
      },
    ],
    payment: { meansCode: "58", iban: "FR7630006000011234567890189" },
    legalNotes: { ...DEFAULT_LEGAL_NOTES },
  }
}

type Mutator = (d: InvoiceDraft) => void

function run(mutate?: Mutator): { issues: ValidationIssue[]; ready: boolean; draft: InvoiceDraft } {
  const draft = validDraft()
  mutate?.(draft)
  return { ...validateInvoice(draft, { today: TODAY }), draft }
}

function find(issues: ValidationIssue[], path: string, code: string) {
  return issues.find((i) => i.path === path && i.code === code)
}

const firstLine = (d: InvoiceDraft) => {
  const l = d.lines?.[0]
  if (!l) throw new Error("no line")
  return l
}

describe("validateInvoice: valid sample", () => {
  it("is ready with no issue at all", () => {
    const r = run()
    expect(r.issues).toEqual([])
    expect(r.ready).toBe(true)
  })

  it("does not throw on an empty object and reports errors", () => {
    const r = validateInvoice({}, { today: TODAY })
    expect(r.ready).toBe(false)
    expect(r.issues.some((i) => i.path === "lines")).toBe(true)
  })

  it("works without options (default today)", () => {
    expect(validateInvoice(validDraft()).ready).toBe(true)
  })
})

interface Case {
  name: string
  mutate: Mutator
  path: string
  code: string
  severity: "error" | "warning"
  /** Fragment expected in the French message. */
  message?: string
}

const failing: Case[] = [
  // Required fields
  {
    name: "number missing",
    mutate: (d) => {
      d.number = ""
    },
    path: "number",
    code: "required",
    severity: "error",
    message: "numéro",
  },
  {
    name: "issueDate missing",
    mutate: (d) => {
      d.issueDate = undefined
    },
    path: "issueDate",
    code: "required",
    severity: "error",
  },
  {
    name: "operationCategory missing",
    mutate: (d) => {
      d.operationCategory = undefined
    },
    path: "operationCategory",
    code: "required",
    severity: "error",
  },
  {
    name: "typeCode missing",
    mutate: (d) => {
      d.typeCode = undefined
    },
    path: "typeCode",
    code: "required",
    severity: "error",
  },
  {
    name: "seller name missing",
    mutate: (d) => {
      if (d.seller) d.seller.name = " "
    },
    path: "seller.name",
    code: "required",
    severity: "error",
  },
  {
    name: "seller address line missing",
    mutate: (d) => {
      if (d.seller?.address) d.seller.address.line1 = undefined
    },
    path: "seller.address.line1",
    code: "required",
    severity: "error",
  },
  {
    name: "seller postal code missing",
    mutate: (d) => {
      if (d.seller?.address) d.seller.address.postalCode = ""
    },
    path: "seller.address.postalCode",
    code: "required",
    severity: "error",
  },
  {
    name: "seller city missing",
    mutate: (d) => {
      if (d.seller?.address) d.seller.address.city = ""
    },
    path: "seller.address.city",
    code: "required",
    severity: "error",
  },
  {
    name: "buyer name missing",
    mutate: (d) => {
      if (d.buyer) d.buyer.name = ""
    },
    path: "buyer.name",
    code: "required",
    severity: "error",
  },
  {
    name: "buyer address missing",
    mutate: (d) => {
      if (d.buyer?.address) d.buyer.address.line1 = ""
    },
    path: "buyer.address.line1",
    code: "required",
    severity: "error",
  },
  {
    name: "no line",
    mutate: (d) => {
      d.lines = []
    },
    path: "lines",
    code: "required",
    severity: "error",
  },
  {
    name: "line name missing",
    mutate: (d) => {
      firstLine(d).name = ""
    },
    path: "lines.0.name",
    code: "required",
    severity: "error",
  },
  {
    name: "line quantity missing",
    mutate: (d) => {
      firstLine(d).quantity = undefined
    },
    path: "lines.0.quantity",
    code: "required",
    severity: "error",
  },
  {
    name: "line unit missing",
    mutate: (d) => {
      firstLine(d).unitCode = ""
    },
    path: "lines.0.unitCode",
    code: "required",
    severity: "error",
  },
  {
    name: "line price missing",
    mutate: (d) => {
      firstLine(d).unitPrice = undefined
    },
    path: "lines.0.unitPrice",
    code: "required",
    severity: "error",
  },
  {
    name: "line VAT category missing",
    mutate: (d) => {
      firstLine(d).vatCategory = undefined
    },
    path: "lines.0.vatCategory",
    code: "required",
    severity: "error",
  },
  {
    name: "line VAT rate missing (category S)",
    mutate: (d) => {
      firstLine(d).vatRate = undefined
    },
    path: "lines.0.vatRate",
    code: "required",
    severity: "error",
  },

  // Seller identity
  {
    name: "seller SIREN and SIRET missing",
    mutate: (d) => {
      if (d.seller) d.seller.siret = undefined
    },
    path: "seller.siret",
    code: "required",
    severity: "error",
    message: "SIRET",
  },
  {
    name: "seller SIRET checksum",
    mutate: (d) => {
      if (d.seller) d.seller.siret = "73282932000075"
    },
    path: "seller.siret",
    code: "siret.checksum",
    severity: "error",
  },
  {
    name: "seller SIREN checksum",
    mutate: (d) => {
      if (d.seller) {
        d.seller.siret = undefined
        d.seller.siren = "732829321"
      }
    },
    path: "seller.siren",
    code: "siren.checksum",
    severity: "error",
  },
  {
    name: "seller SIRET not under SIREN",
    mutate: (d) => {
      if (d.seller) d.seller.siren = "552032534"
    },
    path: "seller.siret",
    code: "siret.sirenMismatch",
    severity: "error",
  },
  {
    name: "seller VAT missing with category S",
    mutate: (d) => {
      if (d.seller) d.seller.vatNumber = undefined
    },
    path: "seller.vatNumber",
    code: "required",
    severity: "error",
  },
  {
    name: "seller VAT malformed",
    mutate: (d) => {
      if (d.seller) d.seller.vatNumber = "44732829320"
    },
    path: "seller.vatNumber",
    code: "vat.format",
    severity: "error",
  },
  {
    name: "seller VAT wrong key",
    mutate: (d) => {
      if (d.seller) d.seller.vatNumber = "FR45732829320"
    },
    path: "seller.vatNumber",
    code: "vat.key",
    severity: "warning",
  },
  {
    name: "seller VAT bad SIREN part",
    mutate: (d) => {
      if (d.seller) d.seller.vatNumber = "FR44732829321"
    },
    path: "seller.vatNumber",
    code: "vat.siren",
    severity: "warning",
  },
  {
    name: "seller VAT of another SIREN",
    mutate: (d) => {
      if (d.seller) d.seller.vatNumber = "FR44552032534"
    },
    path: "seller.vatNumber",
    code: "vat.sirenMismatch",
    severity: "warning",
  },
  {
    name: "seller legal form missing",
    mutate: (d) => {
      if (d.seller) d.seller.legalForm = ""
    },
    path: "seller.legalForm",
    code: "required",
    severity: "error",
  },
  {
    name: "SARL without share capital",
    mutate: (d) => {
      if (d.seller) {
        d.seller.legalForm = "S.A.R.L."
        d.seller.shareCapital = ""
      }
    },
    path: "seller.shareCapital",
    code: "required",
    severity: "error",
  },
  {
    name: "SELARL without share capital",
    mutate: (d) => {
      if (d.seller) {
        d.seller.legalForm = "SELARL"
        d.seller.shareCapital = undefined
      }
    },
    path: "seller.shareCapital",
    code: "required",
    severity: "error",
  },
  {
    name: "SA spelled out without share capital",
    mutate: (d) => {
      if (d.seller) {
        d.seller.legalForm = "Société anonyme"
        d.seller.shareCapital = undefined
      }
    },
    path: "seller.shareCapital",
    code: "required",
    severity: "error",
  },
  {
    name: "invalid country",
    mutate: (d) => {
      if (d.seller?.address) d.seller.address.countryCode = "FRA"
    },
    path: "seller.address.countryCode",
    code: "country.invalid",
    severity: "error",
  },

  {
    name: "sole trader without registration",
    mutate: (d) => {
      if (d.seller) {
        d.seller.legalForm = "Micro-entreprise"
        d.seller.registration = undefined
      }
    },
    path: "seller.registration",
    code: "registration.missing",
    severity: "warning",
  },

  // Buyer identity
  {
    name: "company buyer without SIREN",
    mutate: (d) => {
      if (d.buyer) d.buyer.siren = undefined
    },
    path: "buyer.siret",
    code: "required",
    severity: "error",
    message: "client",
  },
  {
    name: "buyer SIREN checksum",
    mutate: (d) => {
      if (d.buyer) d.buyer.siren = "552032535"
    },
    path: "buyer.siren",
    code: "siren.checksum",
    severity: "error",
  },
  {
    name: "buyer SIRET checksum",
    mutate: (d) => {
      if (d.buyer) {
        d.buyer.siren = undefined
        d.buyer.siret = "55203253400011"
      }
    },
    path: "buyer.siret",
    code: "siret.checksum",
    severity: "error",
  },
  {
    name: "buyer VAT malformed",
    mutate: (d) => {
      if (d.buyer) d.buyer.vatNumber = "!!"
    },
    path: "buyer.vatNumber",
    code: "vat.format",
    severity: "error",
  },

  // Dates
  {
    name: "dueDate before issueDate",
    mutate: (d) => {
      d.dueDate = "2026-09-30"
    },
    path: "dueDate",
    code: "dueDate.beforeIssue",
    severity: "warning",
  },
  {
    name: "issueDate in the future",
    mutate: (d) => {
      d.issueDate = "2026-12-01"
      d.dueDate = "2026-12-31"
    },
    path: "issueDate",
    code: "issueDate.future",
    severity: "warning",
  },
  {
    name: "impossible date",
    mutate: (d) => {
      d.issueDate = "2026-02-30"
    },
    path: "issueDate",
    code: "date.invalid",
    severity: "error",
  },
  {
    name: "malformed due date",
    mutate: (d) => {
      d.dueDate = "31/10/2026"
    },
    path: "dueDate",
    code: "date.invalid",
    severity: "error",
  },
  {
    name: "no due date nor terms (BR-CO-25)",
    mutate: (d) => {
      d.dueDate = undefined
    },
    path: "dueDate",
    code: "required",
    severity: "error",
    message: "échéance",
  },

  // Number, currency
  {
    name: "number with a space",
    mutate: (d) => {
      d.number = "FA 2026 001"
    },
    path: "number",
    code: "number.chars",
    severity: "warning",
  },
  {
    name: "number longer than 20",
    mutate: (d) => {
      d.number = "FACTURE-2026-10-000000001"
    },
    path: "number",
    code: "number.long",
    severity: "warning",
  },
  {
    name: "foreign currency",
    mutate: (d) => {
      d.currency = "USD"
    },
    path: "currency",
    code: "currency.unsupported",
    severity: "error",
  },

  // French legal mentions
  {
    name: "late penalty missing",
    mutate: (d) => {
      if (d.legalNotes) d.legalNotes.latePaymentPenalty = ""
    },
    path: "legalNotes.latePaymentPenalty",
    code: "required",
    severity: "error",
  },
  {
    name: "recovery fee missing",
    mutate: (d) => {
      if (d.legalNotes) d.legalNotes.recoveryFee = undefined
    },
    path: "legalNotes.recoveryFee",
    code: "required",
    severity: "error",
  },
  {
    name: "early discount missing",
    mutate: (d) => {
      d.legalNotes = { ...d.legalNotes, earlyPaymentDiscount: " " }
    },
    path: "legalNotes.earlyPaymentDiscount",
    code: "required",
    severity: "error",
  },
  {
    name: "legal notes absent",
    mutate: (d) => {
      d.legalNotes = undefined
    },
    path: "legalNotes.recoveryFee",
    code: "required",
    severity: "error",
  },

  // VAT categories
  {
    name: "category E without reason",
    mutate: (d) => {
      firstLine(d).vatCategory = "E"
      firstLine(d).vatRate = 0
    },
    path: "vatExemptionReason",
    code: "required",
    severity: "error",
    message: "293 B",
  },
  {
    name: "category K without buyer VAT",
    mutate: (d) => {
      firstLine(d).vatCategory = "K"
      d.vatExemptionReason = "Livraison intracommunautaire"
    },
    path: "buyer.vatNumber",
    code: "required",
    severity: "error",
  },
  {
    name: "category AE without buyer VAT",
    mutate: (d) => {
      firstLine(d).vatCategory = "AE"
      d.vatExemptionReason = "Autoliquidation"
    },
    path: "buyer.vatNumber",
    code: "required",
    severity: "error",
  },
  {
    name: "category O with seller VAT",
    mutate: (d) => {
      firstLine(d).vatCategory = "O"
      d.vatExemptionReason = "Hors champ"
    },
    path: "seller.vatNumber",
    code: "vat.outOfScopeVatId",
    severity: "error",
  },
  {
    name: "category O mixed with S",
    mutate: (d) => {
      d.lines?.push({
        name: "x",
        quantity: 1,
        unitCode: "C62",
        unitPrice: 1,
        vatCategory: "O",
        vatRate: 0,
      })
      d.vatExemptionReason = "Hors champ"
    },
    path: "lines",
    code: "vat.outOfScopeMixed",
    severity: "error",
  },

  // Lines
  {
    name: "credit note without the original invoice reference",
    mutate: (d) => {
      d.typeCode = "381"
    },
    path: "precedingInvoice.number",
    code: "required",
    severity: "error",
  },
  {
    name: "zero quantity",
    mutate: (d) => {
      firstLine(d).quantity = 0
    },
    path: "lines.0.quantity",
    code: "quantity.zero",
    severity: "warning",
  },
  {
    name: "unusual VAT rate",
    mutate: (d) => {
      firstLine(d).vatRate = 19
    },
    path: "lines.0.vatRate",
    code: "vatRate.unusual",
    severity: "warning",
  },
  {
    name: "S with 0 % (BR-S-05)",
    mutate: (d) => {
      firstLine(d).vatRate = 0
    },
    path: "lines.0.vatRate",
    code: "vatRate.zeroStandard",
    severity: "error",
  },
  {
    name: "second line incomplete",
    mutate: (d) => {
      d.lines?.push({ name: "", quantity: 1, unitCode: "C62", vatCategory: "S", vatRate: 20 })
    },
    path: "lines.1.name",
    code: "required",
    severity: "error",
  },

  // Payment
  {
    name: "transfer without IBAN (58)",
    mutate: (d) => {
      if (d.payment) d.payment.iban = ""
    },
    path: "payment.iban",
    code: "required",
    severity: "error",
  },
  {
    name: "transfer without IBAN (30)",
    mutate: (d) => {
      d.payment = { meansCode: "30" }
    },
    path: "payment.iban",
    code: "required",
    severity: "error",
  },
  {
    name: "SEPA debit without IBAN (59)",
    mutate: (d) => {
      d.payment = { meansCode: "59" }
    },
    path: "payment.iban",
    code: "required",
    severity: "error",
  },
  {
    name: "invalid IBAN",
    mutate: (d) => {
      if (d.payment) d.payment.iban = "FR7630006000011234567890188"
    },
    path: "payment.iban",
    code: "iban.checksum",
    severity: "error",
  },
  {
    name: "means missing",
    mutate: (d) => {
      d.payment = {}
    },
    path: "payment.meansCode",
    code: "required",
    severity: "error",
  },
]

describe("validateInvoice: failing cases", () => {
  it.each(failing)("$name", ({ mutate, path, code, severity, message }) => {
    const { issues, ready } = run(mutate)
    const issue = find(issues, path, code)
    expect(issue, JSON.stringify(issues)).toBeDefined()
    expect(issue?.severity).toBe(severity)
    if (message) expect(issue?.message).toContain(message)
    if (severity === "error") expect(ready).toBe(false)
  })

  it("warnings alone never block", () => {
    const { issues, ready } = run((d) => {
      firstLine(d).quantity = 0
      firstLine(d).vatRate = 19
      d.number = "FACTURE-2026-10-000000001"
    })
    expect(issues.filter((i) => i.severity === "warning").length).toBe(3)
    expect(issues.filter((i) => i.severity === "error")).toEqual([])
    expect(ready).toBe(true)
  })
})

const passing: { name: string; mutate: Mutator; absent: [string, string?] }[] = [
  {
    name: "buyer SIRET instead of SIREN",
    mutate: (d) => {
      if (d.buyer) {
        d.buyer.siren = undefined
        d.buyer.siret = "55203253400011"
      }
    },
    absent: ["buyer.siret", "required"],
  },
  {
    name: "individual buyer needs no SIREN",
    mutate: (d) => {
      if (d.buyer) {
        d.buyer.kind = "individual"
        d.buyer.siren = undefined
      }
    },
    absent: ["buyer.siret"],
  },
  {
    name: "foreign buyer needs no SIREN",
    mutate: (d) => {
      if (d.buyer) {
        d.buyer.siren = undefined
        if (d.buyer.address) d.buyer.address.countryCode = "DE"
      }
    },
    absent: ["buyer.siret"],
  },
  {
    name: "individual buyer: no legal notes required",
    mutate: (d) => {
      if (d.buyer) d.buyer.kind = "individual"
      d.legalNotes = undefined
    },
    absent: ["legalNotes.recoveryFee"],
  },
  {
    name: "seller SIREN instead of SIRET",
    mutate: (d) => {
      if (d.seller) {
        d.seller.siret = undefined
        d.seller.siren = "732 829 320"
      }
    },
    absent: ["seller.siret"],
  },
  {
    name: "payment terms instead of due date",
    mutate: (d) => {
      d.dueDate = undefined
      if (d.payment) d.payment.termsText = "30 jours fin de mois"
    },
    absent: ["dueDate"],
  },
  {
    name: "nothing due: no due date needed",
    mutate: (d) => {
      d.dueDate = undefined
      d.prepaidAmount = 1200
    },
    absent: ["dueDate"],
  },
  {
    name: "SAS needs capital but EI does not",
    mutate: (d) => {
      if (d.seller) {
        d.seller.legalForm = "EI"
        d.seller.shareCapital = undefined
      }
    },
    absent: ["seller.shareCapital"],
  },
  {
    name: "no seller VAT when only category E",
    mutate: (d) => {
      firstLine(d).vatCategory = "E"
      firstLine(d).vatRate = 0
      d.vatExemptionReason = "TVA non applicable, art. 293 B du CGI"
      if (d.seller) d.seller.vatNumber = undefined
    },
    absent: ["seller.vatNumber"],
  },
  {
    name: "Z needs no exemption reason (BR-Z-10)",
    mutate: (d) => {
      firstLine(d).vatCategory = "Z"
      firstLine(d).vatRate = 0
    },
    absent: ["vatExemptionReason"],
  },
  {
    name: "category O without VAT ids",
    mutate: (d) => {
      firstLine(d).vatCategory = "O"
      d.vatExemptionReason = "Hors champ"
      if (d.seller) d.seller.vatNumber = undefined
    },
    absent: ["seller.vatNumber"],
  },
  {
    name: "category AE with buyer VAT",
    mutate: (d) => {
      firstLine(d).vatCategory = "AE"
      d.vatExemptionReason = "Autoliquidation"
      if (d.buyer) d.buyer.vatNumber = "FR44732829320"
    },
    absent: ["buyer.vatNumber"],
  },
  {
    name: "known rates 5.5 / 10 / 2.1 / 8.5 / 1.05",
    mutate: (d) => {
      d.lines = [5.5, 10, 2.1, 8.5, 1.05].map((vatRate) => ({
        name: "x",
        quantity: 1,
        unitCode: "C62",
        unitPrice: 1,
        vatCategory: "S" as const,
        vatRate,
      }))
    },
    absent: ["lines.0.vatRate", "vatRate.unusual"],
  },
  {
    name: "cash payment needs no IBAN",
    mutate: (d) => {
      d.payment = { meansCode: "10" }
    },
    absent: ["payment.iban"],
  },
  {
    name: "alphanumeric VAT key tolerated",
    mutate: (d) => {
      if (d.seller) d.seller.vatNumber = "FRAB732829320"
    },
    absent: ["seller.vatNumber"],
  },
  {
    name: "unit price 0 and 20-char number",
    mutate: (d) => {
      firstLine(d).unitPrice = 0
      d.number = "12345678901234567890"
    },
    absent: ["number", "number.long"],
  },
  {
    name: "dueDate equal to issueDate",
    mutate: (d) => {
      d.dueDate = d.issueDate
    },
    absent: ["dueDate", "dueDate.beforeIssue"],
  },
  {
    name: "issueDate today",
    mutate: (d) => {
      d.issueDate = TODAY
      d.dueDate = TODAY
    },
    absent: ["issueDate", "issueDate.future"],
  },
  {
    name: "lowercase spaced IBAN",
    mutate: (d) => {
      if (d.payment) d.payment.iban = "fr76 3000 6000 0112 3456 7890 189"
    },
    absent: ["payment.iban"],
  },
]

describe("validateInvoice: discount lines and credit notes", () => {
  it("accepts a negative unit price: it is a discount line, not an error", () => {
    const r = run((d) => {
      firstLine(d).unitPrice = -5
    })
    expect(r.issues.filter((i) => i.path.endsWith("unitPrice"))).toEqual([])
    expect(r.ready).toBe(true)
  })

  it("accepts a credit note that references its original invoice", () => {
    const r = run((d) => {
      d.typeCode = "381"
      d.precedingInvoice = { number: "FA-2026-0001", issueDate: "2026-09-15" }
    })
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(r.ready).toBe(true)
  })

  it("does not require a preceding invoice on a regular invoice", () => {
    expect(requiredPaths(run().draft)).not.toContain("precedingInvoice.number")
  })
})

describe("validateInvoice: passing cases", () => {
  it.each(passing)("$name", ({ mutate, absent: [path, code] }) => {
    const { issues } = run(mutate)
    const hit = issues.find((i) => i.path === path && (code === undefined || i.code === code))
    expect(hit, JSON.stringify(issues)).toBeUndefined()
  })
})

describe("requiredPaths", () => {
  it("lists the unconditional and conditional paths of a valid draft", () => {
    const paths = requiredPaths(validDraft())
    for (const p of [
      "number",
      "issueDate",
      "operationCategory",
      "seller.name",
      "seller.siret",
      "seller.vatNumber",
      "seller.legalForm",
      "seller.shareCapital",
      "lines.0.name",
      "lines.0.vatRate",
      "dueDate",
      "payment.iban",
      "legalNotes.recoveryFee",
    ]) {
      expect(paths, p).toContain(p)
    }
    expect(paths).not.toContain("vatExemptionReason")
    expect(paths).not.toContain("buyer.vatNumber")
    // satisfied through the buyer SIREN: the empty SIRET is not marked
    expect(paths).not.toContain("buyer.siret")
    expect(requiredPaths({ ...validDraft(), buyer: { kind: "company" } })).toContain("buyer.siret")
  })

  it("is conditional on the draft", () => {
    const e = run((d) => {
      firstLine(d).vatCategory = "E"
      firstLine(d).vatRate = 0
      if (d.buyer) d.buyer.kind = "individual"
      d.payment = { meansCode: "48" }
    }).draft
    const paths = requiredPaths(e)
    expect(paths).toContain("vatExemptionReason")
    expect(paths).not.toContain("seller.vatNumber")
    expect(paths).not.toContain("buyer.siret")
    expect(paths).not.toContain("payment.iban")
    expect(paths).not.toContain("legalNotes.recoveryFee")
    expect(paths).not.toContain("lines.0.vatRate")
  })

  it("never lists an empty path without an error, nor misses a required error", () => {
    const drafts: InvoiceDraft[] = [
      {},
      validDraft(),
      ...failing.map((c) => run(c.mutate).draft),
      ...passing.map((c) => run(c.mutate).draft),
    ]
    for (const draft of drafts) {
      const paths = requiredPaths(draft)
      const issues = validateInvoice(draft, { today: TODAY }).issues
      const requiredErrors = issues.filter((i) => i.code === "required").map((i) => i.path)
      for (const p of requiredErrors) expect(paths, `error ${p} not listed`).toContain(p)
      for (const p of paths) {
        const value = p
          .split(".")
          .reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], draft)
        const empty =
          value === undefined ||
          value === null ||
          (typeof value === "string" && value.trim() === "")
        if (empty) expect(requiredErrors, `${p} is empty but has no error`).toContain(p)
      }
    }
  })
})
