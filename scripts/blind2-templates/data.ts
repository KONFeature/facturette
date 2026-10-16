/** Ground truth of the second blind set. Everything here is fictional; identifiers are checksum-valid. */

import type { Invoice, InvoiceLine } from "../../src/domain/invoice"
import { VAT_FRANCHISE_REASON } from "../../src/domain/invoice"
import {
  addr,
  type Blind2Def,
  type Blind2Formats,
  ibanOf,
  individual,
  line,
  party,
  rcs,
  seller,
} from "./common"

const LN_A = {
  latePaymentPenalty:
    "Tout retard de paiement entraîne l'application d'intérêts au taux de 12 % l'an.",
  recoveryFee: "Frais de recouvrement forfaitaires : 40,00 € (art. D.441-5 du Code de commerce).",
  earlyPaymentDiscount: "Aucun escompte consenti pour paiement comptant.",
}
const LN_B = {
  latePaymentPenalty: "Pénalité de retard au taux de 10,5 % par an, exigible sans rappel.",
  recoveryFee: "Indemnité forfaitaire pour frais de recouvrement : 40 € (art. L.441-10 C. com.).",
  earlyPaymentDiscount: "Escompte de 2 % pour règlement sous 8 jours.",
}
const LN_C = {
  latePaymentPenalty:
    "Pénalités exigibles en cas de non-paiement à l'échéance : trois fois le taux légal.",
  recoveryFee: "En sus, indemnité de recouvrement de 40 euros due de plein droit.",
  earlyPaymentDiscount: "Pas d'escompte en cas de paiement anticipé.",
}

const fmt = (
  date: Blind2Formats["date"],
  thousands: string,
  decimal: "," | ".",
  currency: "suffix" | "prefix" | "code",
): Blind2Formats => ({ date, number: { thousands, decimal, currency } })

const NBSP = "\u00a0"
const NNBSP = "\u202f"

// --- C01 Odoo-like, right-aligned seller, three-column header ----------------------------------
const c01: Invoice = {
  number: "2026-0457",
  typeCode: "380",
  issueDate: "2026-10-14",
  dueDate: "2026-11-13",
  deliveryDate: "2026-10-09",
  operationCategory: "mixed",
  currency: "EUR",
  seller: seller(
    {
      name: "Atelier Duhamel Menuiserie SARL",
      base8: "53182647",
      nic: "0013",
      address: addr("27 rue de la Sainte-Chapelle", "21000", "Dijon"),
      email: "devis@duhamel-menuiserie.example",
      phone: "03 53 01 62 40",
    },
    "SARL",
    "20 000 €",
    rcs("Dijon", "53182647"),
  ),
  buyer: party({
    name: "SCI Les Hauts de Montchapet",
    base8: "49270615",
    nic: "0008",
    address: addr("4 impasse des Vignerons", "21000", "Dijon"),
  }),
  orderReference: "BC-MONT-26/18",
  lines: [
    line(
      "Fenêtre bois chêne 2 vantaux 120×135",
      3,
      "C62",
      685,
      10,
      "Double vitrage 4/16/4, finition lasure",
    ),
    line("Pose et finitions", 7.5, "HUR", 58, 10),
    line("Quincaillerie et joints", 1, "LS", 142.35),
    line("Évacuation des anciens ouvrants", 1, "LS", 90),
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("30002", "00550", "00000157841"),
    bic: "CRLYFRPPXXX",
    reference: "2026-0457",
    termsText: "Paiement à 30 jours, par virement",
  },
  legalNotes: LN_A,
}

// --- C02 Mémoire d'honoraires ------------------------------------------------------------------
const c02: Invoice = {
  number: "MH-2026-064",
  typeCode: "380",
  issueDate: "2026-10-05",
  dueDate: "2026-11-04",
  operationCategory: "services",
  currency: "EUR",
  seller: seller(
    {
      name: "SELARL Ruault & Mercadier Avocats",
      base8: "62015938",
      nic: "0021",
      address: addr("8 rue de la Loge", "34000", "Montpellier"),
      email: "secretariat@ruault-mercadier.example",
      phone: "04 65 71 33 08",
    },
    "SELARL",
    "8 000 €",
    rcs("Montpellier", "62015938"),
  ),
  buyer: party({
    name: "Établissements Lacombe-Sarrazin SAS",
    base8: "38471920",
    nic: "0006",
    address: addr("15 quai de Bosc", "34200", "Sète"),
  }),
  orderReference: "Dossier 2026/0173",
  lines: [
    line("Étude du dossier et consultation", 3, "HUR", 220),
    line("Rédaction des conclusions en défense", 6.5, "HUR", 220),
    line("Audience devant le tribunal de commerce", 0.5, "DAY", 1600),
    line("Frais de déplacement et de dossier", 1, "LS", 85),
  ],
  prepaidAmount: 1000,
  payment: {
    meansCode: "58",
    iban: ibanOf("11315", "00001", "08012346589"),
    bic: "CEPAFRPP131",
    termsText: "Dès réception du mémoire, au plus tard sous 30 jours",
  },
  legalNotes: LN_C,
  notes: "Affaire Lacombe-Sarrazin contre Brasserie du Port, RG 26/01234",
}

// --- C03 Note d'honoraires, pdf-lib Helvetica --------------------------------------------------
const c03: Invoice = {
  number: "F2026-00457",
  typeCode: "380",
  issueDate: "2026-10-15",
  dueDate: "2026-11-14",
  deliveryDate: "2026-10-09",
  operationCategory: "services",
  currency: "EUR",
  seller: seller(
    {
      name: "EURL Marchetti Stratégie",
      base8: "71604829",
      nic: "0017",
      address: addr("58 boulevard Gambetta", "06000", "Nice"),
      email: "hmarchetti@marchetti-strategie.example",
      phone: "04 65 71 90 17",
    },
    "EURL",
    "5 000 €",
    rcs("Nice", "71604829"),
  ),
  buyer: party({
    name: "Groupe Hôtelier Bellevue-Méditerranée SAS",
    base8: "44819372",
    nic: "0004",
    address: addr("17 rue d'Antibes", "06400", "Cannes"),
  }),
  orderReference: "PO-BM-8841",
  lines: [
    line("Atelier de cadrage stratégique", 2.5, "DAY", 950),
    line("Analyse concurrentielle et benchmark", 4, "DAY", 950),
    line("Coaching du comité de direction", 3, "HUR", 140),
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("17515", "90000", "08423759413"),
    bic: "CEPAFRPP751",
    termsText: "Virement à 30 jours date de facture",
  },
  legalNotes: LN_B,
}

// --- C04 Facture de situation BTP, autoliquidation ---------------------------------------------
const aeLine = (name: string, amount: number): InvoiceLine => ({
  name,
  quantity: 1,
  unitCode: "LS",
  unitPrice: amount,
  vatCategory: "AE",
  vatRate: 0,
})
const c04: Invoice = {
  number: "2026-S03-118",
  typeCode: "380",
  issueDate: "2026-10-13",
  dueDate: "2026-11-12",
  deliveryDate: "2026-09-30",
  operationCategory: "services",
  currency: "EUR",
  seller: seller(
    {
      name: "Maçonnerie Générale Roussel SARL",
      base8: "58307142",
      nic: "0010",
      address: addr("9 route de Chauvigny", "86000", "Poitiers"),
      email: "compta@roussel-maconnerie.example",
      phone: "02 61 91 44 03",
    },
    "SARL",
    "45 000 €",
    rcs("Poitiers", "58307142"),
  ),
  buyer: party({
    name: "Bâtisseurs de l'Ouest Promotion SAS",
    base8: "81739406",
    nic: "0003",
    address: addr("21 avenue de Nantes", "86000", "Poitiers"),
  }),
  orderReference: "Marché M-2026-0113, chantier Les Terrasses du Clain",
  lines: [
    aeLine("Lot 02 Gros œuvre", 12675),
    aeLine("Lot 03 Enduits de façade", 6240),
    aeLine("Avenant n° 1 Terrassement", 6800),
  ],
  vatExemptionReason: "Autoliquidation : TVA due par le preneur (art. 283-2 nonies du CGI)",
  payment: {
    meansCode: "58",
    iban: ibanOf("16806", "00500", "08317254961"),
    bic: "AGRIFRPP868",
    termsText: "Paiement à 30 jours à compter de la réception de la situation",
  },
  legalNotes: LN_A,
}

// --- C05 Facture d'acompte ---------------------------------------------------------------------
const c05: Invoice = {
  number: "ACPT-0031",
  typeCode: "380",
  issueDate: "2026-10-08",
  dueDate: "2026-10-18",
  operationCategory: "mixed",
  currency: "EUR",
  seller: seller(
    {
      name: "Cuisines & Bains Fabregat SARL",
      base8: "46092813",
      nic: "0025",
      address: addr("33 avenue du Maréchal Joffre", "66000", "Perpignan"),
      email: "contact@fabregat-cuisines.example",
      phone: "04 65 71 28 55",
    },
    "SARL",
    "12 500 €",
    rcs("Perpignan", "46092813"),
  ),
  buyer: individual("Monsieur Étienne Vallès", addr("6 rue des Mimosas", "66000", "Perpignan")),
  orderReference: "Devis D-2026-0388",
  lines: [
    line(
      "Acompte de 30 % à la commande : cuisine équipée sur mesure",
      1,
      "LS",
      2835,
      10,
      "Montant du devis : 9 450,00 € HT, soit 10 395,00 € TTC",
    ),
  ],
  payment: {
    meansCode: "20",
    termsText: "Règlement par chèque à la signature du devis",
  },
  legalNotes: LN_B,
}

// --- C06 Avoir, pdf-lib Times ------------------------------------------------------------------
const c06: Invoice = {
  number: "AV/2026/012",
  typeCode: "381",
  issueDate: "2026-10-15",
  operationCategory: "goods",
  currency: "EUR",
  seller: seller(
    {
      name: "Bonnet Équipement Pro SAS",
      base8: "27640915",
      nic: "0014",
      address: addr("112 route de Thionville", "57000", "Metz"),
      email: "sav@bonnet-equipement.example",
      phone: "03 53 01 77 12",
    },
    "SAS",
    "100 000 €",
    rcs("Metz", "27640915"),
  ),
  buyer: party({
    name: "Hôtel-Restaurant Le Grand Cerf SARL",
    base8: "35982710",
    nic: "0002",
    address: addr("5 place Saint-Louis", "57000", "Metz"),
  }),
  precedingInvoice: { number: "FA/2026/457", issueDate: "2026-10-02" },
  orderReference: "Retour RMA-26-0884",
  lines: [
    line("Perceuse-visseuse 18 V, lot de 12 (retour pour défaut)", 12, "C62", 129),
    line("Batterie 5 Ah (reprise)", 12, "C62", 64.5),
  ],
  payment: {
    meansCode: "30",
    iban: ibanOf("30003", "01234", "00050812394"),
    bic: "SOGEFRPPXXX",
    termsText: "Avoir à imputer sur votre prochain règlement",
  },
  legalNotes: LN_B,
}

// --- C07 SaaS (PayPal / Stripe style) ----------------------------------------------------------
const c07: Invoice = {
  number: "2026-10-0457",
  typeCode: "380",
  issueDate: "2026-10-15",
  dueDate: "2026-10-30",
  operationCategory: "services",
  currency: "EUR",
  seller: seller(
    {
      name: "Ouvroir Numérique SAS",
      base8: "90231574",
      nic: "0036",
      address: addr("14 rue Eau de Robec", "76000", "Rouen"),
      email: "facturation@ouvroir-numerique.example",
    },
    "SAS",
    "15 000 €",
    rcs("Rouen", "90231574"),
  ),
  buyer: party({
    name: "Cabinet Aubertin-Lévêque & Associés",
    base8: "34056821",
    nic: "0012",
    address: addr("33 cours de la République", "76600", "Le Havre"),
  }),
  lines: [
    line("Plan Professionnel, 15 sièges", 15, "C62", 12, 20, "Du 1 oct. 2026 au 31 oct. 2026"),
    line("Signature électronique, pack 50", 1, "C62", 39.9),
    line("Stockage supplémentaire (200 Go)", 4, "C62", 6.5),
    line("Remise fidélité (-10 % sur le plan)", 1, "C62", -18),
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("30004", "00311", "00010562789"),
    bic: "BNPAFRPPXXX",
    reference: "2026-10-0457",
    termsText: "Paiement par virement avant le 30 oct. 2026",
  },
  legalNotes: LN_C,
}

// --- C08 Utility bill --------------------------------------------------------------------------
const c08: Invoice = {
  number: "E26-10-884102",
  typeCode: "380",
  issueDate: "2026-10-12",
  dueDate: "2026-10-27",
  operationCategory: "goods",
  currency: "EUR",
  seller: seller(
    {
      name: "Énergies du Limousin SA",
      base8: "78513204",
      nic: "0041",
      address: addr("1 place de la République", "87000", "Limoges"),
      email: "pro@limousin-energies.example",
      phone: "05 36 49 71 20",
    },
    "SA",
    "2 450 000 €",
    rcs("Limoges", "78513204"),
  ),
  buyer: party({
    name: "Boucherie-Charcuterie Maillard SARL",
    base8: "52690147",
    nic: "0005",
    address: addr("23 rue du Clocher", "87000", "Limoges"),
  }),
  lines: [
    line(
      "Abonnement (puissance 12 kVA)",
      1,
      "MON",
      17.85,
      5.5,
      "Période du 12/09/2026 au 11/10/2026",
    ),
    line("Consommation heures pleines", 1842, "KWH", 0.2516),
    line("Consommation heures creuses", 623, "KWH", 0.1894),
    line("Contribution tarifaire CTA", 1, "LS", 14.86, 5.5),
  ],
  payment: {
    meansCode: "59",
    iban: ibanOf("10278", "36006", "00020541903"),
    bic: "CMCIFRPP",
    reference: "Contrat 7710-0349-51",
    termsText: "Prélèvement automatique le 27/10/2026",
  },
  legalNotes: LN_C,
}

// --- C09 Garage, pdf-lib Helvetica, ACQUITTÉE watermark ----------------------------------------
const c09: Invoice = {
  number: "FA-26-10-1203",
  typeCode: "380",
  issueDate: "2026-10-15",
  operationCategory: "mixed",
  currency: "EUR",
  seller: seller(
    {
      name: "Garage Hamelin Automobiles SARL",
      base8: "63408592",
      nic: "0018",
      address: addr("74 rue Caponière", "14000", "Caen"),
      email: "atelier@garage-hamelin.example",
      phone: "02 61 91 18 36",
    },
    "SARL",
    "30 000 €",
    rcs("Caen", "63408592"),
  ),
  buyer: individual("Madame Aurélie Quéméner", addr("12 rue des Cordeliers", "14000", "Caen")),
  orderReference: "OR 3381",
  lines: [
    line("Main d'œuvre atelier", 2.5, "HUR", 68),
    line("Kit de distribution avec pompe à eau", 1, "C62", 289.9),
    line("Liquide de refroidissement", 4.5, "LTR", 11.9),
    line("Recyclage des déchets d'atelier", 1, "LS", 4.5),
  ],
  payment: { meansCode: "48", termsText: "Réglée par carte bancaire le 15-10-2026" },
  notes: "Véhicule : Peugeot 208, immatriculation GH-417-ZK, 84 512 km",
}

// --- C10 / C11 long tables ---------------------------------------------------------------------
const STATIONERY = [
  "Cahier 96 pages grands carreaux",
  "Classeur à levier A4 dos 80",
  "Stylo bille bleu (boîte de 50)",
  "Surligneur jaune (étui de 10)",
  "Pochettes transparentes perforées (100)",
  "Intercalaires 12 positions",
  "Colle en bâton 21 g (lot de 12)",
  "Ciseaux scolaires 17 cm",
  "Règle plate 30 cm",
  "Équerre 60° 21 cm",
  "Compas à bague",
  "Trousse en toile",
  "Agrafeuse 25 feuilles",
  "Agrafes 24/6 (boîte de 1000)",
  "Perforateur 2 trous",
  "Ruban adhésif 19 mm (lot de 8)",
  "Feutres effaçables tableau (lot de 4)",
  "Gomme blanche (boîte de 20)",
  "Taille-crayon métal (lot de 10)",
  "Papier calque A4 (50 feuilles)",
  "Papier dessin 180 g A3 (pochette de 25)",
  "Gouache 12 tubes",
  "Pinceaux assortis (lot de 10)",
]
const c10Lines: InvoiceLine[] = Array.from({ length: 72 }, (_, i) => {
  const item = STATIONERY[i % STATIONERY.length] ?? ""
  const price = Math.round(120 + ((i * 37) % 900) + (i % 7) * 13) / 100
  return line(`${item}, réf. PS-${1000 + i * 7}`, (i % 9) + 2, "C62", price)
})
const c10: Invoice = {
  number: "FC-26-104286",
  typeCode: "380",
  issueDate: "2026-10-09",
  dueDate: "2026-11-08",
  operationCategory: "goods",
  currency: "EUR",
  seller: seller(
    {
      name: "Papeteries Sanchez Distribution SAS",
      base8: "47105236",
      nic: "0027",
      address: addr("6 rue Gutenberg", "45100", "Orléans", "ZI Les Aydes"),
      email: "commandes@sanchez-distribution.example",
      phone: "02 61 91 55 29",
    },
    "SAS",
    "250 000 €",
    rcs("Orléans", "47105236"),
  ),
  buyer: party({
    name: "Lycée des Métiers Armand-Lecomte",
    base8: "19384756",
    nic: "0019",
    vat: false,
    address: addr("10 rue du Collège", "45000", "Orléans"),
  }),
  buyerReference: "SERVICE-GEST-0045",
  orderReference: "BC 2026-1187",
  lines: c10Lines,
  payment: {
    meansCode: "58",
    iban: ibanOf("20041", "01005", "04321876509"),
    bic: "PSSTFRPPPAR",
    termsText: "Mandat administratif à 30 jours",
  },
  legalNotes: LN_A,
}

const COURSES: { name: string; qty: number; unit: string; price: number }[] = [
  { name: "Sauveteur secouriste du travail", qty: 2, unit: "DAY", price: 780 },
  { name: "Recyclage gestes et postures", qty: 1, unit: "DAY", price: 640 },
  { name: "Habilitation électrique B0/H0", qty: 1.5, unit: "DAY", price: 890 },
  { name: "Manipulation des extincteurs", qty: 0.5, unit: "DAY", price: 420 },
]
const c11Lines: InvoiceLine[] = Array.from({ length: 44 }, (_, i) => {
  const c = COURSES[i % COURSES.length] ?? COURSES[0]
  if (!c) throw new Error("no course")
  return line(
    `${c.name}, groupe ${String(Math.floor(i / 4) + 1).padStart(2, "0")}`,
    c.qty,
    c.unit,
    c.price,
  )
})
const c11: Invoice = {
  number: "26-0457-FOR",
  typeCode: "380",
  issueDate: "2026-10-09",
  dueDate: "2026-11-23",
  operationCategory: "services",
  currency: "EUR",
  seller: seller(
    {
      name: "Campus Pratique Formation SAS",
      base8: "86213947",
      nic: "0009",
      address: addr("19 rue des Trois Cailloux", "80000", "Amiens"),
      email: "gestion@campus-pratique.example",
      phone: "09 61 93 20 48",
    },
    "SAS",
    "20 000 €",
    rcs("Amiens", "86213947"),
  ),
  buyer: party({
    name: "Centre Hospitalier Privé Saint-Vaast SA",
    base8: "30947685",
    nic: "0011",
    address: addr("88 avenue Foch", "59300", "Valenciennes"),
  }),
  orderReference: "Convention CF-2026-52",
  lines: c11Lines,
  payment: {
    meansCode: "58",
    iban: ibanOf("18206", "00123", "65201879324"),
    bic: "AGRIFRPP882",
    termsText: "Paiement à 45 jours",
  },
  legalNotes: LN_B,
}

// --- C12 Shop invoice, three address columns ---------------------------------------------------
const c12: Invoice = {
  number: "FAC-26-004571",
  typeCode: "380",
  issueDate: "2026-10-14",
  dueDate: "2026-10-28",
  deliveryDate: "2026-10-13",
  operationCategory: "goods",
  currency: "EUR",
  seller: seller(
    {
      name: "Épicerie Teyssier SARL",
      base8: "25879463",
      nic: "0016",
      address: addr("3 place Pasteur", "25000", "Besançon"),
      email: "boutique@teyssier.example",
      phone: "03 53 01 38 84",
    },
    "SARL",
    "7 500 €",
    rcs("Besançon", "25879463"),
  ),
  buyer: party({
    name: "Hôtel Les Mouettes & Spa SARL",
    base8: "75316842",
    nic: "0007",
    address: addr("18 rue de la Gare", "25300", "Pontarlier"),
  }),
  deliveryAddress: addr("ZA du Pré Vert", "25770", "Franois", "Bâtiment C, quai 2"),
  orderReference: "Commande #10428",
  lines: [
    line("Coffret dégustation foie gras et terrines", 6, "C62", 38.9, 5.5),
    line("Huile d'olive vierge extra, bidon de 5 L", 4, "C62", 52.4, 5.5),
    line("Confiture artisanale 370 g, carton de 12", 10, "C62", 33.6, 5.5),
    line("Frais de port Colissimo Pro", 1, "LS", 24.9),
    line("Code promo AUTOMNE10 (-10 % sur les coffrets)", 1, "C62", -23.34, 5.5),
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("12579", "80000", "04178653329"),
    bic: "CCBPFRPPBES",
    termsText: "Virement à réception de facture",
  },
  legalNotes: LN_B,
}

// --- C13 Micro-entrepreneur, franchise en base, RIB block --------------------------------------
const c13Iban = ibanOf("15589", "29755", "06718234051")
const c13: Invoice = {
  number: "GLB-2026-041",
  typeCode: "380",
  issueDate: "2026-10-15",
  dueDate: "2026-11-14",
  operationCategory: "services",
  currency: "EUR",
  seller: seller(
    {
      name: "Gwenn Le Bihan",
      base8: "52874391",
      nic: "0023",
      vat: false,
      address: addr("4 rue Kéréon", "29000", "Quimper"),
      email: "gwenn@bihan-traductions.example",
      phone: "02 61 91 62 77",
    },
    "Entrepreneur individuel",
    undefined,
    "Immatriculée au RNE, Quimper",
  ),
  buyer: party({
    name: "Agence Embrun Communication SAS",
    base8: "84630195",
    nic: "0010",
    address: addr("25 boulevard de Sébastopol", "75001", "Paris"),
  }),
  lines: [
    {
      ...line("Traduction anglais vers français, 4 200 mots", 4200, "C62", 0.09, 0),
      vatCategory: "E",
    },
    { ...line("Relecture et mise en page", 3, "HUR", 35, 0), vatCategory: "E" },
    { ...line("Glossaire terminologique", 1, "LS", 60, 0), vatCategory: "E" },
  ],
  vatExemptionReason: VAT_FRANCHISE_REASON,
  payment: {
    meansCode: "58",
    iban: c13Iban,
    bic: "CMBRFR2BARK",
    termsText: "Virement à 30 jours",
  },
  legalNotes: LN_C,
}

// --- C14 Long accented names, ampersands, DUPLICATA stamp --------------------------------------
const c14: Invoice = {
  number: "2610/183",
  typeCode: "380",
  issueDate: "2026-10-01",
  dueDate: "2026-10-31",
  deliveryDate: "2026-09-22",
  operationCategory: "mixed",
  vatOnDebits: true,
  currency: "EUR",
  seller: seller(
    {
      name: "Établissements Ménard-L'Hôte & Fils, Chauffage Sanitaire Énergies Renouvelables SARL",
      base8: "39105748",
      nic: "0020",
      address: addr("28 rue de l'Ancien Hôtel-Dieu", "16000", "Angoulême", "ZA de la Croix-Rouge"),
      email: "contact@menard-lhote.example",
      phone: "05 36 49 02 77",
    },
    "SARL",
    "38 112 €",
    rcs("Angoulême", "39105748"),
  ),
  buyer: party({
    name: "Syndicat des copropriétaires de la Résidence « Le Clos des Œillets », représenté par son syndic Immo-Gestion Pasquier & Associés",
    base8: "21573894",
    nic: "0001",
    vat: false,
    address: addr(
      "3 rue de l'Évêché",
      "16000",
      "Angoulême",
      "À l'attention de Mme Delphine Thévenet",
    ),
  }),
  buyerReference: "COPRO-CLOS-0214",
  orderReference: "Ordre de service OS-2026-077",
  lines: [
    line(
      "Remplacement de la chaudière collective gaz à condensation",
      1,
      "C62",
      6480,
      10,
      "Fourniture et pose, puissance 120 kW, évacuation des fumées comprise",
    ),
    line("Désembouage du réseau de chauffage", 1, "LS", 890, 10),
    line("Raccordements hydrauliques, main d'œuvre", 16, "HUR", 62.5, 10),
    line("Mise en service et contrôle de combustion", 1, "LS", 245),
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("13807", "00500", "08912347650"),
    bic: "CCBPFRPPNAN",
    termsText: "Paiement à 30 jours",
  },
  legalNotes: LN_A,
}

export const BLIND2: Blind2Def[] = [
  {
    slug: "C01-odoo-titre-numero",
    title: "Facture N° dans le titre, vendeur aligné à droite, en-tête à trois colonnes",
    imitates: "Rapport de facture Odoo / modèle LibreOffice (logo à gauche, bloc vendeur à droite)",
    description:
      "Titre « Facture N° 2026-0457 », trois colonnes Date / Échéance / Livraison, communication de paiement, dates 15.10.2026, espace fine insécable pour les milliers.",
    tags: [
      "odoo",
      "title-number",
      "right-aligned-seller",
      "three-column-header",
      "logo-placeholder",
      "payment-reference",
      "delivery-date",
      "mixed-vat",
    ],
    invoice: c01,
    formats: fmt("dot", NNBSP, ",", "suffix"),
    hidden: ["buyer.siret"],
    template: "odoo",
    nonEmbeddedFont: false,
    extra: {},
  },
  {
    slug: "C02-memoire-honoraires",
    title: "Mémoire d'honoraires d'avocat, quantités avec unité (3 h, 0,5 j), provision reçue",
    imitates: "Mémoire d'honoraires de cabinet d'avocats (Word, papier à en-tête)",
    description:
      "Titre « MÉMOIRE D'HONORAIRES N° … », dates « lundi 5 octobre 2026 », provision déduite, mention d'affaire en note.",
    tags: ["memoire-honoraires", "qty-with-unit", "deposit", "weekday-date", "law-firm", "notes"],
    invoice: c02,
    formats: fmt("weekday-long", NBSP, ",", "suffix"),
    hidden: ["buyer.siret"],
    template: "memoire",
    nonEmbeddedFont: false,
    extra: {},
  },
  {
    slug: "C03-note-honoraires-standard",
    title: "Note d'honoraires de consultant, polices standard non incorporées",
    imitates: "Note d'honoraires générée par une bibliothèque PDF (Helvetica 14 polices standard)",
    description:
      "Numéro F2026-00457, dates 2026/10/15, montants 1200.00 sans séparateur de milliers, jours « 2.5 j ».",
    tags: [
      "note-honoraires",
      "non-embedded-font",
      "qty-with-unit",
      "slash-iso-date",
      "dot-decimal",
      "delivery-date",
    ],
    invoice: c03,
    formats: fmt("slash-iso", "", ".", "code"),
    hidden: [],
    template: "noteHonoraires",
    nonEmbeddedFont: true,
    extra: {},
  },
  {
    slug: "C04-situation-btp-autoliquidation",
    title: "Facture de situation BTP avec autoliquidation de la TVA",
    imitates: "Facture de situation d'un logiciel de gestion BTP (Batigest / EBP Bâtiment)",
    description:
      "Colonnes marché, % d'avancement, cumul, précédent, situation ; TVA en autoliquidation (art. 283-2 nonies), format 1.200,00 EUR, dates 13-10-2026.",
    tags: [
      "situation",
      "autoliquidation",
      "btp",
      "dot-thousands",
      "currency-code",
      "dash-date",
      "quantity-not-printed",
    ],
    invoice: c04,
    formats: fmt("dash", ".", ",", "code"),
    hidden: ["buyer.siret", "lines.0.quantity", "lines.1.quantity", "lines.2.quantity"],
    template: "situation",
    nonEmbeddedFont: false,
    extra: {
      situation: [
        { market: 84500, pct: 65, previous: 42250 },
        { market: 31200, pct: 40, previous: 6240 },
        { market: 6800, pct: 100, previous: 0 },
      ],
    },
  },
  {
    slug: "C05-facture-acompte-particulier",
    title: "Facture d'acompte à un particulier, montants entiers « 2 835 € »",
    imitates: "Facture d'acompte d'un cuisiniste (Sellsy / Axonaut), paiement par chèque",
    description:
      "Titre « FACTURE D'ACOMPTE », client particulier sans SIREN, montants entiers sans décimales, TVA 10 %.",
    tags: ["acompte", "individual-buyer", "trim-zeros", "cheque", "long-date"],
    invoice: c05,
    formats: fmt("long", " ", ",", "suffix"),
    hidden: [],
    template: "acompte",
    nonEmbeddedFont: false,
    extra: { trimZeros: true },
  },
  {
    slug: "C06-avoir-times-standard",
    title: "Avoir sur facture FA/2026/457, polices Times non incorporées",
    imitates: "Avoir de logiciel de caisse / ERP maison (FPDF, Times)",
    description:
      "Numéro AV/2026/012, facture d'origine FA/2026/457 du 02/10/2026, montants imprimés en négatif.",
    tags: ["credit-note", "non-embedded-font", "right-aligned-seller", "slash-number"],
    invoice: c06,
    formats: fmt("dmy", " ", ",", "suffix"),
    hidden: ["buyer.siret", "payment.iban", "payment.bic"],
    template: "avoir",
    nonEmbeddedFont: true,
    extra: {},
  },
  {
    slug: "C07-saas-abonnement-eur",
    title: "Abonnement SaaS, anglais-style 1,200.00 EUR, remise négative, QR de paiement",
    imitates: "Facture d'abonnement type Stripe / PayPal, mise en page aérée sans cadre",
    description:
      "Numéro 2026-10-0457, dates « 15 oct. 2026 », ligne de remise négative, bloc QR en pied.",
    tags: [
      "saas",
      "abbr-date",
      "negative-line",
      "qr-placeholder",
      "comma-thousands",
      "payment-reference",
    ],
    invoice: c07,
    formats: fmt("abbr", ",", ".", "code"),
    hidden: ["buyer.siret"],
    template: "saas",
    nonEmbeddedFont: false,
    extra: {},
  },
  {
    slug: "C08-energie-prelevement",
    title: "Facture d'énergie : abonnement à 5,5%, kWh, prélèvement automatique sans IBAN",
    imitates:
      "Facture d'électricité professionnelle (fournisseur d'énergie), bandeau « Montant à payer »",
    description:
      "Quantités en kWh (1 842 kWh), prix unitaires à 4 décimales, TVA « 5,5% » collée, prélèvement : aucune coordonnée bancaire imprimée.",
    tags: ["utility", "kwh", "direct-debit", "no-iban", "vat-55", "tight-percent", "mixed-vat"],
    invoice: c08,
    formats: fmt("dmy", NBSP, ",", "suffix"),
    hidden: ["buyer.siret", "payment.iban", "payment.bic"],
    template: "utility",
    nonEmbeddedFont: false,
    extra: {},
  },
  {
    slug: "C09-garage-acquittee",
    title: "Facture de garage acquittée (filigrane ACQUITTÉE), client particulier",
    imitates: "Facture d'atelier automobile imprimée depuis un logiciel DMS (Helvetica standard)",
    description:
      "Filigrane « ACQUITTÉE » en diagonale, véhicule en note, réglée par carte, pas d'échéance, litres « 4,5 L ».",
    tags: [
      "garage",
      "watermark",
      "non-embedded-font",
      "individual-buyer",
      "no-due-date",
      "qty-with-unit",
      "notes",
    ],
    invoice: c09,
    formats: fmt("dash", "", ",", "suffix"),
    hidden: [],
    template: "garage",
    nonEmbeddedFont: true,
    extra: { watermark: "ACQUITTÉE" },
  },
  {
    slug: "C10-deux-pages-entete-repete",
    title: "Deux pages, tableau avec en-tête répété sur la page 2",
    imitates: "Facture de négoce issue de Sage / Cegid (références, remises de gestion, reports)",
    description:
      "46 lignes, l'en-tête du tableau est répété en page 2, totaux uniquement en page 2, dates 2026-10-09.",
    tags: [
      "multi-page",
      "repeated-header",
      "iso-date",
      "public-buyer",
      "buyer-reference",
      "many-lines",
    ],
    invoice: c10,
    formats: fmt("iso", " ", ",", "suffix"),
    hidden: [],
    template: "repeatedHeader",
    nonEmbeddedFont: false,
    extra: { headerLabel: "Désignation" },
  },
  {
    slug: "C11-deux-pages-sans-entete",
    title: "Deux pages, tableau SANS en-tête répété sur la page 2",
    imitates: "Feuille Excel / LibreOffice Calc « modèle de facture » imprimée sur deux pages",
    description:
      "44 lignes de sessions de formation, aucun en-tête de colonnes en page 2, dates à deux chiffres d'année 09/10/26.",
    tags: ["multi-page", "no-repeated-header", "excel", "short-year-date", "many-lines"],
    invoice: c11,
    formats: fmt("dmy-short", " ", ",", "suffix"),
    hidden: [],
    template: "plainGrid",
    nonEmbeddedFont: false,
    extra: { headerLabel: "Désignation" },
  },
  {
    slug: "C12-boutique-trois-adresses",
    title: "Facture e-commerce avec vendeur, facturation et livraison en trois colonnes",
    imitates: "Facture de boutique en ligne (WooCommerce / Shopify), code promo négatif",
    description:
      "Trois blocs d'adresses côte à côte dont une livraison distincte, code promo en ligne négative, TVA 5,5 % et 20 %.",
    tags: [
      "shop",
      "multi-column-address",
      "delivery-address",
      "negative-line",
      "mixed-vat",
      "abbr-date",
      "ampersand",
    ],
    invoice: c12,
    formats: fmt("abbr", NNBSP, ",", "suffix"),
    hidden: ["buyer.siret"],
    template: "shop",
    nonEmbeddedFont: false,
    extra: {},
  },
  {
    slug: "C13-micro-rib-logo-qr",
    title: "Micro-entrepreneur en franchise de TVA, bloc RIB détaillé, logo et QR factices",
    imitates: "Modèle Henrri / Facture.net d'un indépendant, pied de page en trois colonnes",
    description:
      "Mention art. 293 B, vendeur sans numéro de TVA, 4 200 mots à 0,09 €, bloc RIB avec code banque, code guichet, clé.",
    tags: [
      "franchise-tva",
      "rib-block",
      "logo-placeholder",
      "qr-placeholder",
      "footer-three-columns",
      "no-vat-number",
      "dot-date",
    ],
    invoice: c13,
    formats: fmt("dot", " ", ",", "suffix"),
    hidden: [],
    template: "microRib",
    nonEmbeddedFont: false,
    extra: {},
  },
  {
    slug: "C14-noms-longs-duplicata",
    title: "Noms très longs avec accents, apostrophes, esperluette, guillemets, tampon DUPLICATA",
    imitates: "Facture d'artisan chauffagiste à un syndic de copropriété, TVA sur les débits",
    description:
      "Raison sociale et client sur plusieurs lignes, « 1er octobre 2026 », tampon incliné, mention TVA sur les débits.",
    tags: [
      "long-names",
      "accents",
      "apostrophes",
      "ampersand",
      "stamp",
      "vat-on-debits",
      "long-date",
      "buyer-reference",
      "address-line2",
    ],
    invoice: c14,
    formats: fmt("long", NBSP, ",", "suffix"),
    hidden: [],
    template: "plumber",
    nonEmbeddedFont: false,
    extra: { stamp: "DUPLICATA" },
  },
]
