/**
 * Ground truth + rendering recipe for every fixture. ALL DATA IS FICTIONAL: company and person
 * names are invented, phone numbers are in the ranges reserved for fiction (01 99 00 xx xx,
 * 06 39 98 xx xx), e-mail domains use `.example`. Identifiers are checksum-valid on purpose.
 */
import {
  DEFAULT_LEGAL_NOTES,
  type Invoice,
  type InvoiceLine,
  type Party,
  type Seller,
} from "../../src/domain/invoice"
import type { Formats } from "./format"
import { makeFrenchIban, makeFrenchVat, makeSiren, makeSiret } from "./identifiers"

export type HeaderLayout = "left" | "right" | "band" | "plain"
export type BankPlacement = "footer" | "box" | "inline"

export interface Labels {
  title: string
  number: string
  issueDate: string
  dueDate: string
  deliveryDate: string
  orderReference: string
  buyerReference: string
  buyer: string
  delivery: string
  seller: string
  totalNet: string
  totalVat: string
  totalGross: string
  prepaid: string
  due: string
}

export interface HtmlOptions {
  font: string
  accent: string
  header: HeaderLayout
  bank: BankPlacement
  vatSummary: boolean
  groupIds: boolean
  zebra: boolean
  labels: Partial<Labels>
  /** Extra CSS appended to the base stylesheet. */
  css?: string
  /** Initials shown in a logo-like badge. */
  logo?: string
}

export type RenderRecipe =
  | { kind: "html"; options: HtmlOptions }
  /** Same HTML, rasterised into an image-only PDF (no text layer). */
  | { kind: "image"; options: HtmlOptions }
  /** Plain pdf-lib with the non-embedded Helvetica standard font. */
  | { kind: "pdflib" }

export interface FixtureDef {
  slug: string
  title: string
  description: string
  tags: string[]
  invoice: Invoice
  /** Defined in expected.json but NOT visible in the PDF (the user would type them). */
  hidden: string[]
  formats: Formats
  recipe: RenderRecipe
}

const FR_SPACE: Formats["number"] = { thousands: " ", decimal: ",", currency: "suffix" }
const FR_NNBSP: Formats["number"] = { thousands: "\u202f", decimal: ",", currency: "suffix" }
const FR_DOTS: Formats["number"] = { thousands: ".", decimal: ",", currency: "suffix" }
const EN_PLAIN: Formats["number"] = { thousands: "", decimal: ".", currency: "code" }
const FR_PREFIX: Formats["number"] = { thousands: " ", decimal: ",", currency: "prefix" }

// ---------------------------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------------------------

const groupSiren = (s: string) => s.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")

function company(
  name: string,
  sirenBase: string,
  nic: string,
  address: Seller["address"],
  extra: Partial<Seller> = {},
  withVat = true,
): Seller {
  const siren = makeSiren(sirenBase)
  return {
    name,
    kind: "company",
    siren,
    siret: makeSiret(siren, nic),
    ...(withVat ? { vatNumber: makeFrenchVat(siren) } : {}),
    address,
    ...extra,
    ...(extra.registration
      ? { registration: extra.registration.replace("{siren}", groupSiren(siren)) }
      : {}),
  }
}

const addr = (line1: string, postalCode: string, city: string, line2?: string) => ({
  line1,
  ...(line2 ? { line2 } : {}),
  postalCode,
  city,
  countryCode: "FR",
})

const camille = company(
  "Camille Fabre – Design graphique",
  "81234567",
  "00019",
  addr("14 rue des Tisserands", "69001", "Lyon"),
  {
    legalForm: "Micro-entrepreneur",
    registration: "Dispensée d'immatriculation au RCS",
    email: "camille@fabre-design.example",
    phone: "06 39 98 12 04",
  },
  false,
)
const atelierLumiere = company(
  "Atelier Lumière SARL",
  "52345678",
  "00027",
  addr("27 quai des Subsistances", "69001", "Lyon"),
  {
    legalForm: "SARL",
    shareCapital: "10 000 €",
    registration: "RCS Lyon {siren}",
    email: "compta@atelier-lumiere.example",
    phone: "01 99 00 41 17",
  },
)
const traiteur = company(
  "Les Saveurs de Marguerite SAS",
  "83456789",
  "00035",
  addr("5 chemin des Vignes", "33000", "Bordeaux", "Zone artisanale Les Chartrons"),
  {
    legalForm: "SAS",
    shareCapital: "25 000 €",
    registration: "RCS Bordeaux {siren}",
    email: "contact@saveurs-marguerite.example",
    phone: "01 99 00 52 31",
  },
)
const informatique = company(
  "Bureautech Distribution SAS",
  "74567890",
  "00043",
  addr("112 avenue de la République", "59800", "Lille"),
  {
    legalForm: "SAS",
    shareCapital: "120 000 €",
    registration: "RCS Lille Métropole {siren}",
    email: "facturation@bureautech.example",
    phone: "01 99 00 63 08",
  },
)
const plomberie = company(
  "Plomberie Delacroix SARL",
  "65678901",
  "00051",
  addr("8 impasse du Moulin", "44000", "Nantes"),
  {
    legalForm: "SARL",
    shareCapital: "7 500 €",
    registration: "RM {siren} Nantes",
    email: "devis@plomberie-delacroix.example",
    phone: "01 99 00 74 22",
  },
)
const conseil = company(
  "Orion Conseil SAS",
  "91789012",
  "00069",
  addr("3 place de la Bourse", "75002", "Paris"),
  {
    legalForm: "SAS",
    shareCapital: "50 000 €",
    registration: "RCS Paris {siren}",
    email: "admin@orion-conseil.example",
    phone: "01 99 00 85 46",
  },
)
const studio = company(
  "Studio Mistral SARL",
  "70890123",
  "00077",
  addr("19 rue Sainte-Catherine", "13001", "Marseille"),
  {
    legalForm: "SARL",
    shareCapital: "5 000 €",
    registration: "RCS Marseille {siren}",
    email: "hello@studio-mistral.example",
    phone: "01 99 00 96 53",
  },
)

const brasserie = company(
  "Brasserie du Port SAS",
  "84901234",
  "00085",
  addr("2 quai de la Fosse", "44000", "Nantes"),
  { email: "compta@brasserie-du-port.example" },
)
const horizon = company(
  "Horizon Immobilier SA",
  "75012345",
  "00093",
  addr("40 boulevard Haussmann", "75009", "Paris"),
)
const cabinet = company(
  "Cabinet Dubreuil & Associés",
  "96123456",
  "00101",
  addr("6 rue de la Paix", "67000", "Strasbourg"),
)
const collectivite = company(
  "Cuisines Mutualisées du Vexin",
  "87234567",
  "00119",
  addr("21 route de Gisors", "27150", "Étrépagny"),
)
const nordTech = company(
  "NordTech Solutions SAS",
  "68345678",
  "00127",
  addr("77 rue Nationale", "59000", "Lille", "Bâtiment B, 3e étage"),
)
const particulier: Party = {
  name: "Madame Élodie Martinet",
  kind: "individual",
  address: addr("9 rue des Lilas", "35000", "Rennes"),
  email: "elodie.martinet@exemple-mail.example",
  phone: "06 39 98 77 31",
}

const bank = (bank5: string, branch5: string, account11: string, bic: string) => ({
  iban: makeFrenchIban(bank5, branch5, account11),
  bic,
})

const LEGAL = { ...DEFAULT_LEGAL_NOTES }

const line = (
  name: string,
  quantity: number,
  unitCode: string,
  unitPrice: number,
  vatRate: number,
  extra: Partial<InvoiceLine> = {},
): InvoiceLine => ({
  name,
  ...extra,
  quantity,
  unitCode,
  unitPrice,
  vatCategory: "S",
  vatRate,
})

const r2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------------------------
// Long catalogue for the two-page invoice (deterministic, no randomness)
// ---------------------------------------------------------------------------------------------

const CATALOGUE = [
  "Ordinateur portable 15 pouces",
  "Écran 24 pouces Full HD",
  "Clavier sans fil AZERTY",
  "Souris ergonomique",
  "Station d'accueil USB-C",
  "Casque audio avec micro",
  "Webcam HD",
  "Disque SSD externe 1 To",
  "Câble HDMI 2 m",
  "Multiprise parafoudre 6 prises",
  "Imprimante laser monochrome",
  "Cartouche de toner noir",
  "Ramette papier A4 (500 feuilles)",
  "Support écran réglable",
  "Onduleur 650 VA",
]
const longLines: InvoiceLine[] = Array.from({ length: 42 }, (_, i) => {
  const name = CATALOGUE[i % CATALOGUE.length] ?? "Article"
  const ref = `REF-${String(1000 + i * 7)}`
  return line(
    `${name} (${ref})`,
    1 + ((i * 3) % 7),
    "C62",
    r2(7.9 + ((i * 37) % 290) + (i % 4) * 0.35),
    20,
  )
})

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

const baseOptions: HtmlOptions = {
  font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  accent: "#1f3a5f",
  header: "left",
  bank: "box",
  vatSummary: false,
  groupIds: true,
  zebra: false,
  labels: {},
}

export const FIXTURES: FixtureDef[] = [
  {
    slug: "01-freelance-franchise-tva",
    title: "Freelance en franchise en base de TVA",
    description:
      "Micro-entrepreneur, pas de numéro de TVA, une seule ligne, mention art. 293 B du CGI, TVA à 0 (catégorie E). Mise en page minimaliste. Le SIREN du client est imprimé, ses coordonnées bancaires aussi.",
    tags: ["freelance", "franchise-tva", "single-line", "category-E", "no-vat-number"],
    invoice: {
      number: "2026-014",
      typeCode: "380",
      issueDate: "2026-10-01",
      dueDate: "2026-10-31",
      deliveryDate: "2026-09-26",
      operationCategory: "services",
      currency: "EUR",
      seller: camille,
      buyer: brasserie,
      lines: [
        {
          name: "Création de logo et charte graphique",
          quantity: 1,
          unitCode: "LS",
          unitPrice: 850,
          vatCategory: "E",
          vatRate: 0,
        },
      ],
      vatExemptionReason: "TVA non applicable, art. 293 B du CGI",
      payment: {
        meansCode: "58",
        ...bank("30006", "00001", "12345678901", "FICTFRPPXXX"),
        termsText: "Paiement à 30 jours par virement",
      },
      legalNotes: { ...LEGAL },
    },
    hidden: ["buyer.email", "deliveryDate"],
    formats: { date: "dmy", number: FR_SPACE },
    recipe: {
      kind: "html",
      options: {
        ...baseOptions,
        header: "plain",
        accent: "#2d2d2d",
        font: "'Avenir Next', 'Helvetica Neue', Arial, sans-serif",
        labels: { dueDate: "Échéance", totalGross: "Total à payer" },
      },
    },
  },
  {
    slug: "02-sarl-trois-lignes",
    title: "SARL, 3 lignes à 20 %, RIB en pied de page",
    description:
      "SARL classique : capital, RCS, TVA intracommunautaire, trois lignes à 20 %, coordonnées bancaires en pied de page, mentions légales de pénalités. Montants au format 1 234,56 € (espace fine insécable).",
    tags: ["sarl", "vat-20", "three-lines", "bank-footer", "legal-notes", "format-fr-nnbsp"],
    invoice: {
      number: "F-2026-0412",
      typeCode: "380",
      issueDate: "2026-09-12",
      dueDate: "2026-10-12",
      deliveryDate: "2026-09-10",
      operationCategory: "services",
      currency: "EUR",
      seller: atelierLumiere,
      buyer: cabinet,
      orderReference: "BC-2026-088",
      lines: [
        line("Reportage photo d'entreprise (demi-journée)", 2, "DAY", 640, 20),
        line("Retouches et étalonnage (50 images)", 1, "LS", 380, 20),
        line("Tirages grand format montés sur Dibond", 4, "C62", 195.5, 20),
      ],
      payment: {
        meansCode: "58",
        ...bank("30004", "00822", "00012345678", "FICTFRPPXXX"),
        reference: "F-2026-0412",
        termsText: "Paiement à 30 jours date de facture",
      },
      legalNotes: { ...LEGAL },
    },
    hidden: [],
    formats: { date: "dmy", number: FR_NNBSP },
    recipe: {
      kind: "html",
      options: { ...baseOptions, bank: "footer", header: "left", accent: "#8a1c3a", zebra: true },
    },
  },
  {
    slug: "03-multi-taux-tva",
    title: "TVA multi-taux 20 / 10 / 5,5 % avec récapitulatif",
    description:
      "Traiteur : trois taux de TVA et un tableau récapitulatif de TVA (taux, base HT, montant). Typographie à empattements.",
    tags: ["multi-rate", "vat-summary-table", "goods", "vat-20", "vat-10", "vat-5.5"],
    invoice: {
      number: "FA-26-1187",
      typeCode: "380",
      issueDate: "2026-09-28",
      dueDate: "2026-10-28",
      deliveryDate: "2026-09-27",
      operationCategory: "mixed",
      currency: "EUR",
      seller: traiteur,
      buyer: horizon,
      buyerReference: "Séminaire direction",
      lines: [
        line("Plateaux repas chauds (menu du chef)", 48, "C62", 14.5, 10),
        line("Eaux et jus de fruits (bouteille 1 L)", 60, "C62", 2.1, 5.5),
        line("Location vaisselle et nappage", 1, "LS", 220, 20),
        line("Service et mise en place sur site", 6, "HUR", 38, 20),
      ],
      payment: {
        meansCode: "58",
        ...bank("30003", "00555", "00098765432", "FICTFRPPXXX"),
        termsText: "Paiement à 30 jours fin de mois",
      },
      legalNotes: { ...LEGAL },
    },
    hidden: [],
    formats: { date: "dmy", number: FR_SPACE },
    recipe: {
      kind: "html",
      options: {
        ...baseOptions,
        header: "band",
        vatSummary: true,
        accent: "#2f6b3a",
        font: "Baskerville, 'Palatino Linotype', serif",
      },
    },
  },
  {
    slug: "04-deux-pages",
    title: "Facture de deux pages, totaux en page 2",
    description:
      "46 lignes d'articles : le tableau déborde sur la page 2 où figurent les totaux, les coordonnées bancaires et les mentions légales. L'en-tête du tableau se répète.",
    tags: ["multi-page", "long-table", "totals-on-page-2", "vat-20", "goods"],
    invoice: {
      number: "BT-2026-3305",
      typeCode: "380",
      issueDate: "2026-10-05",
      dueDate: "2026-11-04",
      deliveryDate: "2026-10-02",
      operationCategory: "goods",
      currency: "EUR",
      seller: informatique,
      buyer: nordTech,
      orderReference: "CMD-77120",
      lines: longLines,
      payment: {
        meansCode: "58",
        ...bank("30002", "00811", "00045678912", "FICTFRPPXXX"),
        reference: "BT-2026-3305",
        termsText: "Paiement à 30 jours date de facture",
      },
      legalNotes: { ...LEGAL },
    },
    hidden: [],
    formats: { date: "dmy", number: FR_SPACE },
    recipe: {
      kind: "html",
      options: {
        ...baseOptions,
        accent: "#0d5c75",
        zebra: true,
        font: "Tahoma, Geneva, sans-serif",
        css: "td, th { font-size: 10.5px; padding: 3px 6px; }",
      },
    },
  },
  {
    slug: "05-avoir",
    title: "Avoir avec renvoi à la facture d'origine",
    description:
      "Avoir (type 381) : montants imprimés en négatif, mention « Avoir sur facture F-2026-0412 du 12/09/2026 ». Convention retenue pour la vérité terrain : quantités et prix positifs dans expected.json, le type 381 porte le signe (convention EN 16931).",
    tags: [
      "credit-note",
      "signed-amounts-printed",
      "negative-amounts",
      "reference-original-invoice",
      "vat-20",
    ],
    invoice: {
      number: "AV-2026-0031",
      typeCode: "381",
      issueDate: "2026-10-08",
      deliveryDate: "2026-09-10",
      operationCategory: "services",
      currency: "EUR",
      seller: atelierLumiere,
      buyer: cabinet,
      lines: [line("Retouches et étalonnage (50 images), remise commerciale", 1, "LS", 380, 20)],
      payment: {
        meansCode: "58",
        ...bank("30004", "00822", "00012345678", "FICTFRPPXXX"),
        termsText: "Montant à déduire de votre prochain règlement",
      },
      legalNotes: { ...LEGAL },
      notes: "Avoir sur facture F-2026-0412 du 12/09/2026",
    },
    hidden: ["deliveryDate"],
    formats: { date: "dmy", number: FR_SPACE },
    recipe: {
      kind: "html",
      options: {
        ...baseOptions,
        accent: "#b4331f",
        header: "left",
        labels: { title: "Avoir", number: "Avoir n°", due: "Montant à votre crédit" },
      },
    },
  },
  {
    slug: "06-client-particulier",
    title: "Client particulier (sans SIREN)",
    description:
      "Plombier facturant un particulier, TVA à 10 % (travaux de rénovation). L'acheteur est de type « individual », sans SIREN ni TVA.",
    tags: ["individual-customer", "no-buyer-siren", "vat-10", "services"],
    invoice: {
      number: "2026-0933",
      typeCode: "380",
      issueDate: "2026-10-03",
      dueDate: "2026-10-18",
      deliveryDate: "2026-10-02",
      operationCategory: "mixed",
      currency: "EUR",
      seller: plomberie,
      buyer: particulier,
      lines: [
        line("Chauffe-eau électrique 200 L (fourniture)", 1, "C62", 489, 10),
        line("Dépose, pose et mise en service", 3.5, "HUR", 58, 10),
      ],
      payment: {
        meansCode: "30",
        ...bank("30006", "00011", "12345678901", "FICTFRPPXXX"),
        termsText: "Paiement sous 15 jours",
      },
      legalNotes: { ...LEGAL },
    },
    hidden: ["deliveryDate"],
    formats: { date: "dmy", number: FR_SPACE },
    recipe: {
      kind: "html",
      options: {
        ...baseOptions,
        accent: "#1d6fa5",
        header: "left",
        font: "Verdana, Geneva, sans-serif",
        css: "body { font-size: 12px; }",
      },
    },
  },
  {
    slug: "07-libelles-alternatifs",
    title: "Libellés alternatifs, vendeur en haut à droite",
    description:
      "Bloc vendeur en haut à droite avec pastille de logo ; libellés « Facturé à », « Destinataire » (adresse de livraison), « N° de facture », « Date d'émission », « À régler avant le », « Net à payer ». Le SIREN de l'acheteur n'est pas imprimé.",
    tags: [
      "alt-wording",
      "seller-top-right",
      "logo-header",
      "delivery-address",
      "buyer-siren-hidden",
    ],
    invoice: {
      number: "2026/10/0058",
      typeCode: "380",
      issueDate: "2026-10-09",
      dueDate: "2026-11-08",
      deliveryDate: "2026-10-07",
      operationCategory: "goods",
      currency: "EUR",
      seller: studio,
      buyer: nordTech,
      deliveryAddress: addr("Zone industrielle Est, quai 4", "59160", "Lomme"),
      orderReference: "PO-4471",
      buyerReference: "Service achats",
      lines: [
        line("Mobilier d'accueil sur mesure", 1, "C62", 1850, 20),
        line("Livraison et installation", 1, "LS", 240, 20),
      ],
      payment: {
        meansCode: "58",
        ...bank("30007", "00123", "00076543219", "FICTFRPPXXX"),
        reference: "2026/10/0058",
        termsText: "Règlement à 30 jours",
      },
      legalNotes: { ...LEGAL },
    },
    hidden: ["buyer.siren"],
    formats: { date: "dmy", number: FR_SPACE },
    recipe: {
      kind: "html",
      options: {
        ...baseOptions,
        header: "right",
        accent: "#c2571a",
        logo: "SM",
        font: "'Trebuchet MS', Verdana, sans-serif",
        labels: {
          title: "FACTURE",
          number: "N° de facture",
          issueDate: "Date d'émission",
          dueDate: "À régler avant le",
          buyer: "Facturé à",
          delivery: "Destinataire",
          totalNet: "Sous-total HT",
          due: "Net à payer",
        },
      },
    },
  },
  {
    slug: "08-formats-iso-point",
    title: "Dates ISO et montants « 1234.56 EUR »",
    description:
      "Dates au format 2026-10-01, montants sans séparateur de milliers avec point décimal et code devise après : 1234.56 EUR. Style « outil de facturation anglo-saxon ».",
    tags: ["date-iso", "number-dot-decimal", "currency-code", "services", "format-variant"],
    invoice: {
      number: "INV-2026-0102",
      typeCode: "380",
      issueDate: "2026-10-01",
      dueDate: "2026-10-31",
      deliveryDate: "2026-09-30",
      operationCategory: "services",
      currency: "EUR",
      seller: conseil,
      buyer: horizon,
      lines: [
        line("Audit des processus de facturation", 1, "LS", 4200, 20),
        line("Atelier de restitution", 1, "LS", 1350.4, 20),
      ],
      payment: {
        meansCode: "58",
        ...bank("30006", "00099", "00023456789", "FICTFRPPXXX"),
        reference: "INV-2026-0102",
        termsText: "Net 30 days",
      },
      legalNotes: { ...LEGAL },
    },
    hidden: [],
    formats: { date: "iso", number: EN_PLAIN },
    recipe: {
      kind: "html",
      options: {
        ...baseOptions,
        header: "band",
        accent: "#222831",
        font: "Menlo, Monaco, 'Courier New', monospace",
        css: "body { font-size: 11px; }",
        labels: { title: "INVOICE", number: "Invoice no.", issueDate: "Date", dueDate: "Due" },
      },
    },
  },
  {
    slug: "09-formats-date-longue",
    title: "Date « 1er octobre 2026 » et montants « 1.234,56 € »",
    description:
      "Dates en toutes lettres (1er octobre 2026), séparateur de milliers en point et virgule décimale : 1.234,56 €.",
    tags: ["date-long-fr", "number-dot-thousands", "euro-after", "format-variant", "services"],
    invoice: {
      number: "2026-1010",
      typeCode: "380",
      issueDate: "2026-10-01",
      dueDate: "2026-10-31",
      deliveryDate: "2026-09-30",
      operationCategory: "services",
      currency: "EUR",
      seller: conseil,
      buyer: collectivite,
      lines: [
        line("Accompagnement à la transition numérique, phase 1", 1, "LS", 5600, 20),
        line("Formation des équipes (2 sessions)", 2, "DAY", 1190, 20),
      ],
      payment: {
        meansCode: "58",
        ...bank("30006", "00099", "00023456789", "FICTFRPPXXX"),
        termsText: "Paiement à 30 jours",
      },
      legalNotes: { ...LEGAL },
    },
    hidden: ["buyer.vatNumber"],
    formats: { date: "long", number: FR_DOTS },
    recipe: {
      kind: "html",
      options: {
        ...baseOptions,
        header: "left",
        accent: "#5b3a8a",
        font: "'Palatino', 'Book Antiqua', Georgia, serif",
        zebra: true,
      },
    },
  },
  {
    slug: "10-heures-jours-decimaux",
    title: "Heures et jours décimaux, description sur seconde ligne",
    description:
      "Quantités décimales (7,5 h ; 3,25 jours ; 0,5 jour), unités heure/jour, chaque ligne a une description sur une seconde ligne de texte. Montants préfixés par le symbole : € 1 234,56.",
    tags: [
      "decimal-quantities",
      "hours",
      "days",
      "line-description",
      "euro-before",
      "format-variant",
    ],
    invoice: {
      number: "FAC-2026-210",
      typeCode: "380",
      issueDate: "2026-10-12",
      dueDate: "2026-11-11",
      deliveryDate: "2026-10-09",
      operationCategory: "services",
      currency: "EUR",
      seller: studio,
      buyer: brasserie,
      lines: [
        line("Développement du site vitrine", 7.5, "HUR", 72.5, 20, {
          description: "Intégration des maquettes, pages Accueil et Carte",
        }),
        line("Direction artistique", 3.25, "DAY", 540, 20, {
          description: "Atelier moodboard et validation de la charte",
        }),
        line("Assistance mise en ligne", 0.5, "DAY", 480, 20, {
          description: "Recette, formation de l'équipe, support J+7",
        }),
      ],
      payment: {
        meansCode: "58",
        ...bank("30007", "00123", "00076543219", "FICTFRPPXXX"),
        termsText: "Paiement à 30 jours",
      },
      legalNotes: { ...LEGAL },
    },
    hidden: [],
    formats: { date: "dmy", number: FR_PREFIX },
    recipe: {
      kind: "html",
      options: {
        ...baseOptions,
        header: "left",
        accent: "#0b7a5e",
        font: "'Gill Sans', 'Helvetica Neue', sans-serif",
      },
    },
  },
  {
    slug: "11-acompte-deja-verse",
    title: "Acompte déjà versé",
    description:
      "Facture de solde : total TTC 4 320,00 €, acompte de 1 500,00 € déjà payé, net à payer 2 820,00 €.",
    tags: ["deposit", "prepaid", "amount-due-differs", "vat-20", "goods"],
    invoice: {
      number: "F2026-0775",
      typeCode: "380",
      issueDate: "2026-10-14",
      dueDate: "2026-10-28",
      deliveryDate: "2026-10-13",
      operationCategory: "goods",
      currency: "EUR",
      seller: atelierLumiere,
      buyer: horizon,
      orderReference: "BC-9021",
      lines: [
        line("Tirage d'art encadré 80×120 cm", 6, "C62", 450, 20),
        line("Encadrement chêne massif, supplément", 6, "C62", 150, 20),
      ],
      prepaidAmount: 1500,
      payment: {
        meansCode: "58",
        ...bank("30004", "00822", "00012345678", "FICTFRPPXXX"),
        reference: "F2026-0775",
        termsText: "Solde à régler sous 14 jours",
      },
      legalNotes: { ...LEGAL },
    },
    hidden: [],
    formats: { date: "dmy", number: FR_SPACE },
    recipe: {
      kind: "html",
      options: {
        ...baseOptions,
        header: "left",
        accent: "#7a5c00",
        bank: "inline",
        labels: { prepaid: "Acompte déjà versé", due: "Reste à payer" },
      },
    },
  },
  {
    slug: "12-image-seule-sans-texte",
    title: "PDF image seule (aucune couche texte)",
    description:
      "Cas négatif : la facture est rendue en image puis intégrée dans un PDF sans texte (équivalent d'un scan). L'extraction doit détecter l'absence de texte. Le manifeste déclare printed = [] car rien n'est extractible sans OCR.",
    tags: ["no-text-layer", "scanned", "negative-case", "vat-20"],
    invoice: {
      number: "S-2026-0640",
      typeCode: "380",
      issueDate: "2026-09-30",
      dueDate: "2026-10-30",
      deliveryDate: "2026-09-29",
      operationCategory: "services",
      currency: "EUR",
      seller: plomberie,
      buyer: cabinet,
      lines: [
        line("Remplacement de la robinetterie du bureau", 1, "LS", 640, 20),
        line("Main d'oeuvre", 4, "HUR", 55, 20),
      ],
      payment: {
        meansCode: "58",
        ...bank("30006", "00011", "12345678901", "FICTFRPPXXX"),
        termsText: "Paiement à 30 jours",
      },
      legalNotes: { ...LEGAL },
    },
    hidden: [],
    formats: { date: "dmy", number: FR_SPACE },
    recipe: {
      kind: "image",
      options: { ...baseOptions, header: "left", accent: "#444444", bank: "footer" },
    },
  },
  {
    slug: "13-pdflib-helvetica",
    title: "PDF pdf-lib, Helvetica standard non incorporée",
    description:
      "Produit avec pdf-lib seul : police Helvetica standard (non incorporée), mise en page sommaire. Mauvais candidat PDF/A (police non incorporée) : sert à tester le contrôle préalable et la conversion.",
    tags: ["pdf-lib", "non-embedded-font", "poor-pdfa-candidate", "vat-20"],
    invoice: {
      number: "PL-2026-007",
      typeCode: "380",
      issueDate: "2026-10-15",
      dueDate: "2026-11-14",
      deliveryDate: "2026-10-14",
      operationCategory: "services",
      currency: "EUR",
      seller: conseil,
      buyer: collectivite,
      lines: [
        line("Revue de code et recommandations", 2, "DAY", 780, 20),
        line("Rapport de synthèse", 1, "LS", 450, 20),
      ],
      payment: {
        meansCode: "58",
        ...bank("30006", "00099", "00023456789", "FICTFRPPXXX"),
        termsText: "Paiement à 30 jours",
      },
      legalNotes: { ...LEGAL },
    },
    hidden: ["buyer.siren", "buyer.siret", "buyer.vatNumber", "seller.email", "seller.phone"],
    formats: { date: "dmy", number: { thousands: " ", decimal: ",", currency: "suffix" } },
    recipe: { kind: "pdflib" },
  },
]
