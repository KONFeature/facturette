import type { Invoice } from "../../../domain/invoice"
import { DEFAULT_LEGAL_NOTES, VAT_FRANCHISE_REASON } from "../../../domain/invoice"
import type { FacturXProfile } from "../types"

/**
 * Typed invoice scenarios used by the structural tests and the Mustang conformance test.
 * SIREN/SIRET/VAT/IBAN values are syntactically valid but fictitious.
 */
export interface Scenario {
  name: string
  invoice: Invoice
  /** Profiles that must validate. EN16931 always; BASIC only where listed. */
  profiles: FacturXProfile[]
}

const seller: Invoice["seller"] = {
  name: "Atelier Lumière SARL",
  kind: "company",
  siren: "732829320",
  siret: "73282932000074",
  vatNumber: "FR44732829320",
  address: { line1: "12 rue de la Paix", postalCode: "75002", city: "Paris", countryCode: "FR" },
  email: "contact@atelier-lumiere.fr",
  phone: "+33 1 23 45 67 89",
  legalForm: "SARL",
  shareCapital: "10 000 €",
  registration: "RCS Paris 732 829 320",
}

const buyer: Invoice["buyer"] = {
  name: "Maison Dupont SAS",
  kind: "company",
  siren: "552081317",
  siret: "55208131766522",
  vatNumber: "FR40552081317",
  address: { line1: "8 avenue des Champs", postalCode: "69001", city: "Lyon", countryCode: "FR" },
}

const sepa: Invoice["payment"] = {
  meansCode: "58",
  iban: "FR7630006000011234567890189",
  bic: "AGRIFRPP",
}

const base: Invoice = {
  number: "FA-2026-0001",
  typeCode: "380",
  issueDate: "2026-10-01",
  dueDate: "2026-10-31",
  operationCategory: "services",
  currency: "EUR",
  seller,
  buyer,
  lines: [
    {
      name: "Prestation de conseil",
      quantity: 2,
      unitCode: "DAY",
      unitPrice: 500,
      vatCategory: "S",
      vatRate: 20,
    },
  ],
  payment: { ...sepa, termsText: "Paiement à 30 jours" },
  legalNotes: { ...DEFAULT_LEGAL_NOTES },
}

const make = (overrides: Partial<Invoice>): Invoice => ({ ...base, ...overrides })

const microSeller: Invoice["seller"] = {
  name: "Julie Martin EI",
  kind: "company",
  siren: "813569042",
  siret: "81356904200012",
  address: {
    line1: "3 impasse des Lilas",
    postalCode: "33000",
    city: "Bordeaux",
    countryCode: "FR",
  },
  legalForm: "Micro-entrepreneur",
  registration: "RM 813 569 042 Bordeaux",
}

export const scenarios: Scenario[] = [
  { name: "standard-20", invoice: base, profiles: ["EN16931", "BASIC"] },
  {
    name: "multi-rate",
    invoice: make({
      number: "FA-2026-0002",
      operationCategory: "mixed",
      lines: [
        {
          name: "Main d'œuvre",
          quantity: 3.5,
          unitCode: "HUR",
          unitPrice: 60,
          vatCategory: "S",
          vatRate: 20,
        },
        {
          name: "Repas livré",
          quantity: 4,
          unitCode: "C62",
          unitPrice: 12.5,
          vatCategory: "S",
          vatRate: 10,
        },
        {
          name: "Livre technique",
          quantity: 2,
          unitCode: "C62",
          unitPrice: 19.91,
          vatCategory: "S",
          vatRate: 5.5,
        },
        {
          name: "Second poste à 20 %",
          quantity: 1,
          unitCode: "C62",
          unitPrice: 33.33,
          vatCategory: "S",
          vatRate: 20,
        },
      ],
    }),
    profiles: ["EN16931", "BASIC"],
  },
  {
    name: "franchise-en-base",
    invoice: make({
      number: "FA-2026-0003",
      seller: microSeller,
      vatExemptionReason: VAT_FRANCHISE_REASON,
      lines: [
        {
          name: "Création de logo",
          quantity: 1,
          unitCode: "LS",
          unitPrice: 450,
          vatCategory: "E",
          vatRate: 0,
        },
      ],
    }),
    profiles: ["EN16931", "BASIC"],
  },
  {
    name: "autoliquidation",
    invoice: make({
      number: "FA-2026-0004",
      vatExemptionReason: "Autoliquidation - art. 283-2 nonies du CGI",
      lines: [
        {
          name: "Sous-traitance BTP",
          quantity: 1,
          unitCode: "LS",
          unitPrice: 8000,
          vatCategory: "AE",
          vatRate: 0,
        },
      ],
    }),
    profiles: ["EN16931"],
  },
  {
    // Two exempt regimes on one invoice: the typed reason belongs to ONE of them (the primary,
    // E), the other must not inherit it.
    name: "mixed-exemptions",
    invoice: make({
      number: "FA-2026-0004B",
      vatExemptionReason: "Exon\u00e9ration de TVA, art. 261 D du CGI",
      lines: [
        {
          name: "Location de locaux nus",
          quantity: 1,
          unitCode: "MON",
          unitPrice: 900,
          vatCategory: "E",
          vatRate: 0,
        },
        {
          name: "Sous-traitance BTP",
          quantity: 1,
          unitCode: "LS",
          unitPrice: 8000,
          vatCategory: "AE",
          vatRate: 0,
        },
      ],
    }),
    profiles: ["EN16931"],
  },
  {
    name: "intra-community-supply",
    invoice: make({
      number: "FA-2026-0005",
      operationCategory: "goods",
      deliveryDate: "2026-09-28",
      buyer: {
        name: "Müller GmbH",
        kind: "company",
        vatNumber: "DE123456789",
        address: { line1: "Hauptstraße 5", postalCode: "10115", city: "Berlin", countryCode: "DE" },
      },
      vatExemptionReason: "Exonération de TVA, art. 262 ter I du CGI",
      lines: [
        {
          name: "Palette de composants",
          quantity: 10,
          unitCode: "C62",
          unitPrice: 123.45,
          vatCategory: "K",
          vatRate: 0,
        },
      ],
    }),
    profiles: ["EN16931"],
  },
  {
    name: "export",
    invoice: make({
      number: "FA-2026-0006",
      operationCategory: "goods",
      buyer: {
        name: "Acme Inc.",
        kind: "company",
        address: {
          line1: "1 Market Street",
          postalCode: "94105",
          city: "San Francisco",
          countryCode: "US",
        },
      },
      vatExemptionReason: "Exportation hors UE, art. 262 I du CGI",
      lines: [
        {
          name: "Machine",
          quantity: 1,
          unitCode: "C62",
          unitPrice: 5000,
          vatCategory: "G",
          vatRate: 0,
        },
      ],
    }),
    profiles: ["EN16931"],
  },
  {
    name: "not-subject",
    invoice: make({
      number: "FA-2026-0007",
      vatExemptionReason: "Hors champ de la TVA - art. 259 du CGI",
      lines: [
        {
          name: "Prestation hors champ",
          quantity: 1,
          unitCode: "LS",
          unitPrice: 300,
          vatCategory: "O",
          vatRate: 0,
        },
      ],
    }),
    profiles: ["EN16931"],
  },
  {
    name: "credit-note",
    invoice: make({
      number: "AV-2026-0001",
      typeCode: "381",
      notes: "Avoir sur la facture FA-2026-0001",
      precedingInvoice: { number: "FA-2026-0001", issueDate: "2026-09-15" },
      lines: [
        {
          name: "Prestation de conseil (remboursement)",
          quantity: 1,
          unitCode: "DAY",
          unitPrice: 500,
          vatCategory: "S",
          vatRate: 20,
        },
      ],
    }),
    profiles: ["EN16931", "BASIC"],
  },
  {
    name: "deposit-prepaid",
    invoice: make({
      number: "FA-2026-0008",
      prepaidAmount: 300,
      lines: [
        {
          name: "Développement site",
          quantity: 1,
          unitCode: "LS",
          unitPrice: 2400,
          vatCategory: "S",
          vatRate: 20,
        },
      ],
    }),
    profiles: ["EN16931", "BASIC"],
  },
  {
    // Already paid: BT-113 = BT-112, BT-115 = 0 and BT-9 = payment date -> BT-23 S2 (BR-FR-CO-09).
    name: "fully-paid",
    invoice: make({
      number: "FA-2026-0008B",
      dueDate: "2026-10-05",
      prepaidAmount: 2880,
      payment: { meansCode: "48", termsText: "Pay\u00e9 par carte bancaire le 05/10/2026" },
      lines: [
        {
          name: "D\u00e9veloppement site",
          quantity: 1,
          unitCode: "LS",
          unitPrice: 2400,
          vatCategory: "S",
          vatRate: 20,
        },
      ],
    }),
    profiles: ["EN16931"],
  },
  {
    // Final invoice after a deposit invoice: BT-3 stays 380, BT-25 references the deposit -> S4.
    name: "final-after-deposit",
    invoice: make({
      number: "FA-2026-0008C",
      prepaidAmount: 800,
      precedingInvoice: { number: "AC-2026-0003", issueDate: "2026-08-20" },
      lines: [
        {
          name: "D\u00e9veloppement site (solde)",
          quantity: 1,
          unitCode: "LS",
          unitPrice: 2400,
          vatCategory: "S",
          vatRate: 20,
        },
      ],
    }),
    profiles: ["EN16931"],
  },
  {
    name: "delivery-address",
    invoice: make({
      number: "FA-2026-0009",
      operationCategory: "goods",
      deliveryDate: "2026-09-30",
      deliveryAddress: {
        line1: "Zone industrielle Nord",
        line2: "Entrepôt 4",
        postalCode: "59000",
        city: "Lille",
        countryCode: "FR",
      },
      lines: [
        {
          name: "Fournitures",
          quantity: 25,
          unitCode: "C62",
          unitPrice: 8.4,
          vatCategory: "S",
          vatRate: 20,
        },
      ],
    }),
    profiles: ["EN16931"],
  },
  {
    name: "references",
    invoice: make({
      number: "FA-2026-0010",
      buyerReference: "SERVICE-COMPTA-42",
      orderReference: "BC-2026-777",
      payment: { ...sepa, reference: "FA-2026-0010" },
    }),
    profiles: ["EN16931", "BASIC"],
  },
  {
    name: "payment-card",
    invoice: make({
      number: "FA-2026-0011",
      payment: { meansCode: "48", termsText: "Payé par carte bancaire" },
    }),
    profiles: ["EN16931"],
  },
  {
    name: "payment-cheque",
    invoice: make({
      number: "FA-2026-0012",
      dueDate: undefined,
      payment: { meansCode: "20", termsText: "Chèque à l'ordre d'Atelier Lumière" },
    }),
    profiles: ["EN16931"],
  },
  {
    name: "due-date-only",
    invoice: make({ number: "FA-2026-0013", payment: { ...sepa } }),
    profiles: ["EN16931", "BASIC"],
  },
  {
    name: "terms-only",
    invoice: make({
      number: "FA-2026-0014",
      dueDate: undefined,
      payment: { ...sepa, termsText: "Paiement à réception de facture" },
    }),
    profiles: ["EN16931"],
  },
  {
    name: "terms-and-due-date",
    invoice: make({ number: "FA-2026-0015" }),
    profiles: ["EN16931"],
  },
  {
    name: "private-customer",
    invoice: make({
      number: "FA-2026-0016",
      buyer: {
        name: "Camille Durand",
        kind: "individual",
        address: {
          line1: "5 rue des Roses",
          postalCode: "44000",
          city: "Nantes",
          countryCode: "FR",
        },
        email: "camille.durand@example.org",
      },
      payment: { meansCode: "48", termsText: "Payé par carte bancaire" },
    }),
    profiles: ["EN16931", "BASIC"],
  },
  {
    name: "special-characters",
    invoice: make({
      number: "FA/2026-0017",
      seller: { ...seller, name: 'Dupont & Fils "Éditions" <SARL>' },
      buyer: { ...buyer, name: "L'Été d'Zoë — café ☕ 😀" },
      notes:
        "Note avec <balises> & \"guillemets\" et 'apostrophes' ; émoji 🚀 ; caractère de contrôle \u0007 retiré.",
      lines: [
        {
          name: "Café & thé <bio> « spécial » 🍵",
          description: 'Ligne 1\nLigne 2 avec & et <b>gras</b>\r\nLigne 3 "citée"',
          quantity: 3,
          unitCode: "C62",
          unitPrice: 4.2,
          vatCategory: "S",
          vatRate: 5.5,
        },
      ],
    }),
    profiles: ["EN16931", "BASIC"],
  },
  {
    name: "long-multiline-description",
    invoice: make({
      number: "FA-2026-0018",
      notes: `${"Remarque très longue. ".repeat(60)}\nSeconde ligne.`,
      lines: [
        {
          name: "Prestation d'accompagnement de longue durée",
          description: Array.from(
            { length: 40 },
            (_, i) => `Étape ${i + 1} : livrable détaillé et validé avec le client.`,
          ).join("\n"),
          quantity: 1,
          unitCode: "LS",
          unitPrice: 1234.56,
          vatCategory: "S",
          vatRate: 20,
        },
      ],
    }),
    profiles: ["EN16931"],
  },
  {
    name: "unit-price-decimals",
    invoice: make({
      number: "FA-2026-0019",
      lines: [
        {
          name: "Vis M4 (3 décimales)",
          quantity: 1000,
          unitCode: "C62",
          unitPrice: 0.125,
          vatCategory: "S",
          vatRate: 20,
        },
        {
          name: "Câble (4 décimales)",
          quantity: 333,
          unitCode: "MTR",
          unitPrice: 0.0875,
          vatCategory: "S",
          vatRate: 20,
        },
        {
          name: "Résine",
          quantity: 2.5,
          unitCode: "KGM",
          unitPrice: 17.3333,
          vatCategory: "S",
          vatRate: 10,
        },
      ],
    }),
    profiles: ["EN16931", "BASIC"],
  },
  {
    name: "credit-note-zero-quantity-line",
    invoice: make({
      number: "AV-2026-0002",
      typeCode: "381",
      lines: [
        {
          name: "Prestation annulée",
          quantity: 5,
          unitCode: "HUR",
          unitPrice: 80,
          vatCategory: "S",
          vatRate: 20,
        },
        {
          name: "Ligne informative à quantité nulle",
          quantity: 0,
          unitCode: "C62",
          unitPrice: 10,
          vatCategory: "S",
          vatRate: 20,
        },
      ],
    }),
    profiles: ["EN16931", "BASIC"],
  },
  {
    name: "discount-negative-unit-price",
    invoice: make({
      number: "FA-2026-0021",
      lines: [
        {
          name: "Prestation de conseil",
          quantity: 4,
          unitCode: "HUR",
          unitPrice: 90,
          vatCategory: "S",
          vatRate: 20,
        },
        {
          name: "Remise commerciale",
          quantity: 1,
          unitCode: "C62",
          unitPrice: -36,
          vatCategory: "S",
          vatRate: 20,
        },
        {
          name: "Remise à 3 décimales",
          quantity: 3,
          unitCode: "C62",
          unitPrice: -1.125,
          vatCategory: "S",
          vatRate: 20,
        },
      ],
    }),
    profiles: ["EN16931", "BASIC"],
  },
  {
    name: "vat-on-debits",
    invoice: make({ number: "FA-2026-0020", vatOnDebits: true }),
    profiles: ["EN16931"],
  },
]
