/** Ground truth of the blind set. Everything here is fictional; identifiers are checksum-valid. */
import type { Address, Invoice, InvoiceLine, Party, Seller } from "../../src/domain/invoice"
import {
  type BlindDef,
  groupSiren,
  makeFrenchIban,
  makeFrenchVat,
  makeSiren,
  makeSiret,
} from "./common"

interface PartyInput {
  name: string
  base8: string
  nic: string
  address: Address
  vat?: boolean
  email?: string
  phone?: string
}

function party(p: PartyInput): Party {
  const siren = makeSiren(p.base8)
  return {
    name: p.name,
    kind: "company",
    siren,
    siret: makeSiret(siren, p.nic),
    ...(p.vat === false ? {} : { vatNumber: makeFrenchVat(siren) }),
    address: p.address,
    ...(p.email ? { email: p.email } : {}),
    ...(p.phone ? { phone: p.phone } : {}),
  }
}

function seller(
  p: PartyInput,
  legalForm: string,
  shareCapital: string | undefined,
  rcsCity: string | undefined,
): Seller {
  const base = party(p)
  return {
    ...base,
    legalForm,
    ...(shareCapital ? { shareCapital } : {}),
    ...(rcsCity ? { registration: `RCS ${rcsCity} ${groupSiren(base.siren ?? "")}` } : {}),
  }
}

const addr = (line1: string, postalCode: string, city: string, line2?: string): Address => ({
  line1,
  ...(line2 ? { line2 } : {}),
  postalCode,
  city,
  countryCode: "FR",
})

const line = (
  name: string,
  quantity: number,
  unitCode: string,
  unitPrice: number,
  vatRate = 20,
  description?: string,
): InvoiceLine => ({
  name,
  ...(description ? { description } : {}),
  quantity,
  unitCode,
  unitPrice,
  vatCategory: "S",
  vatRate,
})

const ibanOf = (bank: string, branch: string, account: string) =>
  makeFrenchIban(bank, branch, account)

const NOTES_STD = {
  latePaymentPenalty:
    "En cas de retard de paiement, une pénalité égale à 3 fois le taux d'intérêt légal sera appliquée.",
  recoveryFee:
    "Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 €.",
  earlyPaymentDiscount: "Pas d'escompte pour paiement anticipé.",
}
const NOTES_SHORT = {
  latePaymentPenalty: "Pénalités de retard : 3 fois le taux d'intérêt légal en vigueur.",
  recoveryFee: "Indemnité forfaitaire de recouvrement en cas de retard : 40 euros.",
  earlyPaymentDiscount: "Escompte pour règlement anticipé : néant.",
}

const FR_SPACE: BlindDef["formats"] = {
  date: "dmy",
  number: { thousands: " ", decimal: ",", currency: "suffix" },
}

// --- B01 Dolibarr -----------------------------------------------------------------------------
const b01: Invoice = {
  number: "FA2610-0042",
  typeCode: "380",
  issueDate: "2026-10-12",
  dueDate: "2026-11-11",
  operationCategory: "mixed",
  currency: "EUR",
  seller: seller(
    {
      name: "Sonorys Audiovisuel SAS",
      base8: "41827364",
      nic: "0002",
      address: addr("12 allée des Sonneurs", "31000", "Toulouse"),
      email: "contact@sonorys.example",
      phone: "05 36 49 20 18",
    },
    "SAS",
    "50 000 €",
    "Toulouse",
  ),
  buyer: party({
    name: "Boulangerie Maison Pellerin SARL",
    base8: "50918273",
    nic: "0001",
    address: addr("3 place du Capitole", "31000", "Toulouse"),
  }),
  orderReference: "CMD-2610-17",
  lines: [
    line("Enceinte amplifiée 8 pouces (modèle EA-8)", 4, "C62", 189.9),
    line("Câble XLR 5 m", 8, "C62", 12.5),
    line("Installation et réglage sur site", 3.5, "HUR", 65),
    line("Guide d'utilisation imprimé", 2, "C62", 24.5, 5.5),
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("30004", "00801", "00012345678"),
    bic: "SONOFRPPXXX",
    termsText: "30 jours date de facture",
  },
  legalNotes: NOTES_STD,
}

// --- B02 second non-embedded generator (Times) ------------------------------------------------
const b02: Invoice = {
  number: "2026-118",
  typeCode: "380",
  issueDate: "2026-10-05",
  dueDate: "2026-11-15",
  operationCategory: "mixed",
  currency: "EUR",
  seller: seller(
    {
      name: "Garage Rivière & Fils SARL",
      base8: "38472915",
      nic: "0018",
      address: addr("41 route de Vannes", "35700", "Rennes"),
      email: "atelier@riviere-fils.example",
      phone: "02 61 91 55 02",
    },
    "SARL",
    "8 000 €",
    "Rennes",
  ),
  buyer: party({
    name: "Transports Kervella SAS",
    base8: "62917354",
    nic: "0034",
    address: addr("ZA de Kerpont", "56100", "Lorient"),
  }),
  lines: [
    line("Vidange moteur 5W30 (filtre à huile inclus)", 1, "LS", 189),
    line("Plaquettes de frein avant (jeu)", 2, "C62", 74.9),
    line("Main d'oeuvre mécanique", 11.5, "HUR", 62),
    line("Remplacement de la courroie d'accessoires", 1, "LS", 245.5),
  ],
  prepaidAmount: 100,
  payment: {
    meansCode: "58",
    iban: ibanOf("20041", "01005", "00987654321"),
    bic: "GARIFR2RXXX",
    termsText: "À régler avant le 15/11/2026",
  },
  legalNotes: NOTES_SHORT,
}

// --- B03 Excel grid, individual customer -----------------------------------------------------
const b03: Invoice = {
  number: "2026-0301",
  typeCode: "380",
  issueDate: "2026-10-02",
  dueDate: "2026-10-17",
  deliveryDate: "2026-09-29",
  operationCategory: "mixed",
  currency: "EUR",
  seller: seller(
    {
      name: "Cuisines Delmas SARL",
      base8: "45128730",
      nic: "0027",
      address: addr("19 avenue Jean Jaurès", "33000", "Bordeaux"),
      email: "devis@cuisines-delmas.example",
      phone: "05 36 49 77 31",
    },
    "SARL",
    "15 000 €",
    "Bordeaux",
  ),
  buyer: {
    name: "Mme Sophie Lambert",
    kind: "individual",
    address: addr("22 rue Nationale", "33200", "Bordeaux"),
  },
  lines: [
    line("Caisson haut 60 cm", 6, "C62", 142),
    line("Plan de travail stratifié", 3.2, "MTR", 118),
    line("Hotte aspirante inox", 1, "C62", 389),
    line("Dépose de l'ancienne cuisine", 1, "LS", 450, 10),
    line("Pose et raccordements", 14, "HUR", 48, 10),
  ],
  payment: {
    meansCode: "20",
    termsText: "Règlement à 15 jours par chèque ou virement",
    iban: ibanOf("30002", "00550", "00076543210"),
    bic: "CRLYFRPPXXX",
  },
  legalNotes: NOTES_SHORT,
}

// --- B04 Word letter ---------------------------------------------------------------------------
const b04: Invoice = {
  number: "2026-0087",
  typeCode: "380",
  issueDate: "2026-10-15",
  dueDate: "2026-11-30",
  deliveryDate: "2026-09-30",
  operationCategory: "services",
  currency: "EUR",
  seller: seller(
    {
      name: "Vasseur Conseil EURL",
      base8: "52084713",
      nic: "0010",
      address: addr("5 quai de la Fosse", "44000", "Nantes"),
      email: "m.vasseur@vasseur-conseil.example",
      phone: "02 61 91 08 44",
    },
    "EURL",
    "5 000 €",
    "Nantes",
  ),
  buyer: party({
    name: "Établissements Joubert & Frères SA",
    base8: "70412968",
    nic: "0045",
    address: addr("27 boulevard des Belges", "44300", "Nantes"),
  }),
  lines: [
    line("Audit de l'organisation logistique (phase 1)", 4, "DAY", 850),
    line("Rédaction du rapport de recommandations", 2, "DAY", 850),
    line("Atelier de restitution à la direction", 1, "LS", 600),
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("10278", "36000", "00061234578"),
    bic: "CMCIFR2AXXX",
    termsText: "Règlement à 45 jours fin de mois",
  },
  legalNotes: NOTES_STD,
}

// --- B05 SaaS ----------------------------------------------------------------------------------
const b05: Invoice = {
  number: "BRU-2026-10-0412",
  typeCode: "380",
  issueDate: "2026-10-01",
  dueDate: "2026-10-31",
  operationCategory: "services",
  currency: "EUR",
  seller: seller(
    {
      name: "Brumeo Software SAS",
      base8: "84129057",
      nic: "0036",
      address: addr("8 rue du Faubourg Saint-Honoré", "75008", "Paris"),
      email: "facturation@brumeo.example",
      phone: "01 99 00 63 20",
    },
    "SAS",
    "120 000 €",
    "Paris",
  ),
  buyer: party({
    name: "Kestrel Mobilité SAS",
    base8: "91827340",
    nic: "0019",
    address: addr("14 rue Racine", "69002", "Lyon"),
  }),
  lines: [
    line("Abonnement Équipe, 12 utilisateurs (octobre 2026)", 12, "MON", 79),
    line("Support prioritaire", 1, "MON", 120),
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("17806", "00200", "00123456791"),
    bic: "BRUMFRPPXXX",
    reference: "BRU-2026-10-0412",
    termsText: "Paiement à 30 jours par virement",
  },
  legalNotes: NOTES_SHORT,
}

// --- B06 footer-only identity -----------------------------------------------------------------
const b06: Invoice = {
  number: "2026/0415",
  typeCode: "380",
  issueDate: "2026-10-09",
  dueDate: "2026-11-08",
  operationCategory: "goods",
  currency: "EUR",
  seller: seller(
    {
      name: "Menuiserie Vincent-Roche SARL",
      base8: "33781245",
      nic: "0058",
      address: addr("8 rue des Tanneurs", "69007", "Lyon"),
      email: "contact@vincent-roche.example",
      phone: "04 65 71 20 31",
    },
    "SARL",
    "10 000 €",
    "Lyon",
  ),
  buyer: party({
    name: "Hôtel Les Glycines SAS",
    base8: "78523146",
    nic: "0022",
    address: addr("2 chemin de la Combe", "69160", "Tassin-la-Demi-Lune"),
  }),
  lines: [
    line("Porte intérieure chêne, 83 cm", 12, "C62", 214),
    line("Poignée inox satinée", 12, "C62", 18.5),
    line("Pose des blocs-portes", 16, "HUR", 52, 10),
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("42559", "00001", "00041234567"),
    bic: "CCOPFRPPXXX",
    termsText: "Paiement à 30 jours",
  },
  legalNotes: NOTES_SHORT,
}

// --- B07 discounts + sections -------------------------------------------------------------------
const b07: Invoice = {
  number: "FAC-26-0198",
  typeCode: "380",
  issueDate: "2026-10-14",
  dueDate: "2026-11-30",
  operationCategory: "mixed",
  currency: "EUR",
  seller: seller(
    {
      name: "Bâtiments Lemaire & Cie SAS",
      base8: "49381726",
      nic: "0043",
      address: addr("63 avenue de la République", "59800", "Lille"),
      email: "compta@lemaire-batiment.example",
      phone: "03 53 01 44 90",
    },
    "SAS",
    "250 000 €",
    "Lille Métropole",
  ),
  buyer: party({
    name: "Syndicat des copropriétaires Résidence Les Tilleuls",
    base8: "81937452",
    nic: "0017",
    address: addr("4 rue des Tilleuls", "59000", "Lille"),
  }),
  orderReference: "Marché 2026-044",
  lines: [
    line("Démolition de cloison", 18, "MTK", 108, 10),
    line("Chape ciment ravoir", 42, "MTK", 200, 10),
    line("Évacuation des gravats (benne)", 3, "C62", 245, 20),
    line("Fenêtre PVC double vitrage 120x135", 6, "C62", 380, 10),
    line("Volet roulant électrique", 6, "C62", 288, 10),
    line("Joint de finition silicone", 12, "MTR", 6.5, 20),
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("30003", "00890", "00011223344"),
    bic: "SOGEFRPPXXX",
    termsText: "Règlement à 30 jours fin de mois",
  },
  legalNotes: NOTES_STD,
}

// --- B08 bilingual -----------------------------------------------------------------------------
const b08: Invoice = {
  number: "2026-FR-0031",
  typeCode: "380",
  issueDate: "2026-10-07",
  dueDate: "2026-11-06",
  operationCategory: "services",
  currency: "EUR",
  seller: seller(
    {
      name: "Alpine Logistics France SAS",
      base8: "56293817",
      nic: "0029",
      address: addr("Zone Cargo Sud, bât. 4", "73000", "Chambéry"),
      email: "billing@alpine-logistics.example",
      phone: "04 65 71 88 12",
    },
    "SAS",
    "75 000 €",
    "Chambéry",
  ),
  buyer: party({
    name: "Savoie Équipements Industriels SA",
    base8: "63718294",
    nic: "0011",
    address: addr("120 rue du Mont Blanc", "74000", "Annecy"),
  }),
  orderReference: "PO-88412",
  lines: [
    line("Transport de palettes Lyon - Milan", 6, "C62", 410),
    line("Dédouanement / Customs clearance", 1, "LS", 180),
    line("Assurance marchandises / Cargo insurance", 1, "LS", 95.5),
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("18206", "00201", "00765432196"),
    bic: "AGRIFRPPXXX",
    termsText: "30 jours / 30 days net",
  },
  legalNotes: NOTES_SHORT,
}

// --- B09 credit note ---------------------------------------------------------------------------
const b09: Invoice = {
  number: "AV-2026-0007",
  typeCode: "381",
  issueDate: "2026-10-13",
  operationCategory: "goods",
  currency: "EUR",
  seller: seller(
    {
      name: "Studio Parallèle SAS",
      base8: "72918345",
      nic: "0052",
      address: addr("31 rue des Frères Lumière", "67000", "Strasbourg"),
      email: "gestion@studio-parallele.example",
      phone: "03 53 01 27 66",
    },
    "SAS",
    "30 000 €",
    "Strasbourg",
  ),
  buyer: party({
    name: "Imprimerie Haag & Wolff SARL",
    base8: "40927136",
    nic: "0014",
    address: addr("9 rue du Maire Kuss", "67200", "Strasbourg"),
  }),
  precedingInvoice: { number: "F-2026-0231", issueDate: "2026-09-02" },
  lines: [
    line("Retour marchandise : support d'écran articulé", 25, "C62", 45),
    line("Frais de transport refacturés", 1, "LS", 38.9),
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("30087", "33080", "00198765432"),
    bic: "CMCIFRPPXXX",
    termsText: "Avoir à déduire de votre prochain règlement",
  },
  legalNotes: { recoveryFee: NOTES_SHORT.recoveryFee },
  notes: "Avoir sur facture F-2026-0231 du 02/09/2026",
}

// --- B10 deposit (negative Acompte line) --------------------------------------------------------
const b10: Invoice = {
  number: "2026-0412",
  typeCode: "380",
  issueDate: "2026-10-10",
  dueDate: "2026-11-09",
  operationCategory: "services",
  currency: "EUR",
  seller: seller(
    {
      name: "Pixelforge Studio SARL",
      base8: "58173924",
      nic: "0035",
      address: addr("17 rue de la Tannerie", "29200", "Brest"),
      email: "hello@pixelforge.example",
      phone: "02 61 91 73 05",
    },
    "SARL",
    "7 500 €",
    "Brest",
  ),
  buyer: party({
    name: "Ar Mor Vins & Spiritueux SARL",
    base8: "47381926",
    nic: "0026",
    address: addr("5 quai Tourville", "29200", "Brest"),
  }),
  lines: [
    line("Création du site e-commerce (forfait)", 1, "LS", 4800),
    line("Hébergement et maintenance, 1re année", 12, "MON", 15),
    {
      name: "Acompte versé à la commande (30 %)",
      quantity: 1,
      unitCode: "LS",
      unitPrice: -1440,
      vatCategory: "S",
      vatRate: 20,
    },
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("15589", "29000", "00076543217"),
    bic: "CMBRFR2BXXX",
    termsText: "Paiement à 30 jours",
  },
  legalNotes: NOTES_STD,
}

// --- B11 freelancer, franchise en base -----------------------------------------------------------
const b11Seller = (() => {
  const siren = makeSiren("83017452")
  return {
    name: "Camille Fournier",
    kind: "company" as const,
    siren,
    siret: makeSiret(siren, "0019"),
    address: addr("6 rue Sainte-Catherine", "33000", "Bordeaux"),
    legalForm: "Micro-entrepreneur",
    email: "camille@fournier-dev.example",
    phone: "06 39 98 12 40",
  }
})()
const b11: Invoice = {
  number: "FA-2026-023",
  typeCode: "380",
  issueDate: "2026-10-15",
  dueDate: "2026-10-30",
  deliveryDate: "2026-10-09",
  operationCategory: "services",
  currency: "EUR",
  seller: b11Seller,
  buyer: party({
    name: "Association Les Jardins d'Elsa",
    base8: "79120468",
    nic: "0013",
    address: addr("33 cours de l'Yser", "33800", "Bordeaux"),
    vat: false,
  }),
  lines: [
    {
      name: "Développement application web, sprint 1",
      quantity: 12,
      unitCode: "DAY",
      unitPrice: 450,
      vatCategory: "E",
      vatRate: 0,
    },
    {
      name: "Support et maintenance",
      quantity: 6.5,
      unitCode: "HUR",
      unitPrice: 60,
      vatCategory: "E",
      vatRate: 0,
    },
    {
      name: "Hébergement et nom de domaine (annuel)",
      quantity: 1,
      unitCode: "LS",
      unitPrice: 120,
      vatCategory: "E",
      vatRate: 0,
    },
  ],
  vatExemptionReason: "TVA non applicable, art. 293 B du CGI",
  payment: {
    meansCode: "58",
    iban: ibanOf("30066", "10041", "00011111111"),
    bic: "CMCIFRPPXXX",
    termsText: "Paiement à réception de facture, par virement",
  },
  legalNotes: NOTES_SHORT,
}

// --- B12 two pages ---------------------------------------------------------------------------
const B12_TOPICS: [string, string, string, number, number][] = [
  [
    "Cadrage du projet de dématérialisation",
    "Entretiens avec les responsables de service, recensement des flux documentaires existants et rédaction d'une note de cadrage validée par le comité de pilotage.",
    "DAY",
    2,
    780,
  ],
  [
    "Cartographie des processus d'achat",
    "Modélisation de la chaîne commande, réception, facture et paiement sur les trois sites, avec identification des points de ressaisie et des délais de validation.",
    "DAY",
    3.5,
    780,
  ],
  [
    "Paramétrage de la plateforme de facturation",
    "Création des circuits de validation, des modèles de documents et des profils utilisateurs, y compris la configuration des accès par établissement.",
    "HUR",
    21,
    95,
  ],
  [
    "Reprise des fournisseurs actifs",
    "Import et nettoyage de 412 fiches fournisseurs : doublons, SIRET manquants, coordonnées bancaires à vérifier auprès des comptables.",
    "FORFAIT",
    1,
    1350,
  ],
  [
    "Interface avec le logiciel comptable",
    "Développement et recette de l'export des écritures vers le logiciel comptable de l'établissement, avec journal de contrôle quotidien.",
    "DAY",
    4,
    820,
  ],
  [
    "Formation des gestionnaires (session 1)",
    "Deux demi-journées en présentiel pour douze gestionnaires : saisie, validation, relances, traitement des rejets et des avoirs.",
    "FORFAIT",
    1,
    1200,
  ],
  [
    "Formation des gestionnaires (session 2)",
    "Même programme que la session 1, pour les services techniques et la pharmacie, avec support de cours remis en version papier.",
    "FORFAIT",
    1,
    1200,
  ],
  [
    "Support de démarrage, semaine 1",
    "Assistance sur site et à distance pendant la première semaine de production, traitement prioritaire des anomalies bloquantes.",
    "HUR",
    16,
    88,
  ],
  [
    "Support de démarrage, semaine 2",
    "Assistance à distance, point quotidien de vingt minutes avec la direction financière et suivi des indicateurs de rejet.",
    "HUR",
    9,
    88,
  ],
  [
    "Documentation utilisateur",
    "Guide pas à pas illustré de captures d'écran, fiches réflexes pour les valideurs et foire aux questions mise à jour après la phase de démarrage.",
    "FORFAIT",
    1,
    640,
  ],
  [
    "Tests de montée en charge",
    "Simulation de 5 000 factures par mois, mesure des temps de traitement et rapport de recette signé par la maîtrise d'ouvrage.",
    "DAY",
    1.5,
    820,
  ],
  [
    "Licence annuelle de la plateforme",
    "Abonnement pour 40 utilisateurs nommés, hébergement en France, sauvegardes quotidiennes et mises à jour réglementaires comprises.",
    "MON",
    12,
    210,
  ],
  [
    "Conduite du changement",
    "Communication interne, lettres d'information aux fournisseurs et accompagnement des référents de chaque pôle jusqu'à la clôture du projet.",
    "DAY",
    2.5,
    780,
  ],
  [
    "Comité de pilotage de clôture",
    "Préparation et animation du comité final, bilan chiffré, recommandations pour la phase 2 et remise du dossier d'exploitation.",
    "LS",
    1,
    450,
  ],
]
const b12: Invoice = {
  number: "FAC-2026-1187",
  typeCode: "380",
  issueDate: "2026-10-12",
  dueDate: "2026-12-11",
  operationCategory: "services",
  currency: "EUR",
  seller: seller(
    {
      name: "Axiome Transformation SAS",
      base8: "60481937",
      nic: "0047",
      address: addr("55 rue de la Vilaine", "35000", "Rennes", "Immeuble Le Colisée, 3e étage"),
      email: "administration@axiome-transformation.example",
      phone: "02 61 91 40 11",
    },
    "SAS",
    "100 000 €",
    "Rennes",
  ),
  buyer: party({
    name: "Groupe Hospitalier Val-de-Loire",
    base8: "29184736",
    nic: "0020",
    address: addr("1 avenue du Docteur Roux", "37000", "Tours", "Direction des affaires financières"),
  }),
  orderReference: "BC-2026-3391",
  buyerReference: "DAF-SERVICE-07",
  lines: B12_TOPICS.map(([name, description, unit, qty, price]) =>
    line(name, qty, unit === "FORFAIT" ? "LS" : unit, price, 20, description),
  ),
  payment: {
    meansCode: "58",
    iban: ibanOf("13335", "00201", "00098765431"),
    bic: "CEPAFRPP333",
    termsText: "Règlement à 60 jours date de facture",
  },
  legalNotes: NOTES_STD,
}

// --- B13 buyer above seller, delivery address ---------------------------------------------------
const b13: Invoice = {
  number: "FV-26-005871",
  typeCode: "380",
  issueDate: "2026-10-08",
  dueDate: "2026-11-07",
  deliveryDate: "2026-10-07",
  operationCategory: "goods",
  currency: "EUR",
  seller: seller(
    {
      name: "Maison Aubrac Distribution SAS",
      base8: "37192846",
      nic: "0061",
      address: addr("ZI Les Ancizes, rue de l'Artisanat", "63000", "Clermont-Ferrand"),
      email: "commandes@maison-aubrac.example",
      phone: "04 65 71 02 93",
    },
    "SAS",
    "200 000 €",
    "Clermont-Ferrand",
  ),
  buyer: party({
    name: "Restaurant Le Cèdre Bleu SARL",
    base8: "81264739",
    nic: "0028",
    address: addr("18 rue de Bonne", "38000", "Grenoble"),
  }),
  deliveryAddress: addr("Cuisine centrale, quai 4", "38330", "Saint-Ismier", "ZI des Iles Cordées"),
  orderReference: "BC-2026-7781",
  lines: [
    line("Entrecôte d'Aubrac maturée", 18.5, "KGM", 34.8, 5.5),
    line("Fromage de Salers AOP (meule)", 4, "C62", 62, 5.5),
    line("Huile de noix vierge", 24, "LTR", 12.9, 5.5),
    line("Vin rouge Côtes d'Auvergne", 60, "C62", 7.4, 20),
    {
      name: "Remise commerciale fidélité",
      quantity: 1,
      unitCode: "LS",
      unitPrice: -85,
      vatCategory: "S",
      vatRate: 5.5,
    },
  ],
  payment: {
    meansCode: "58",
    iban: ibanOf("12579", "63000", "00055667788"),
    bic: "CEPAFRPP125",
    termsText: "Paiement à 30 jours date de facture",
  },
  legalNotes: NOTES_STD,
}

const DOT_CODE: BlindDef["formats"] = {
  date: "dmy",
  number: { thousands: ".", decimal: ",", currency: "code" },
}

export const BLIND: BlindDef[] = [
  {
    slug: "B01-dolibarr-police-standard",
    title: "Facture façon Dolibarr / TCPDF, police Helvetica non incorporée",
    imitates: "Modèle PDF « crabe/azur » de Dolibarr (TCPDF, polices cœur non incorporées)",
    description:
      "Bloc émetteur à gauche, cartouche « Facture : … / Date facture / Date échéance / Code client », encadré « Adresse de facturation », tableau Désignation | TVA | P.U. HT | Qté | Unité | Total HT, totaux par taux, mentions légales et identité en pied de page.",
    tags: ["dolibarr", "non-embedded-font", "multi-rate", "footer-identity", "order-reference"],
    invoice: b01,
    formats: FR_SPACE,
    hidden: ["deliveryDate", "buyer.siren", "buyer.siret", "buyer.vatNumber"],
    template: "dolibarr",
    nonEmbeddedFont: true,
    extra: {},
  },
  {
    slug: "B02-times-vendeur-acheteur",
    title: "Facture Times non incorporée, Vendeur / Acheteur, Reste à payer",
    imitates: "Facture générée par une bibliothèque PDF (fpdf/ReportLab) avec police cœur Times",
    description:
      "Titre « FACTURE N° », « Émise le », « À régler avant le », blocs Vendeur / Acheteur, tableau Description | Quantité | Prix unitaire | Montant, Sous-total, TVA 20 %, Total TTC, acompte déjà réglé et Reste à payer, montants « 1.200,00 EUR ».",
    tags: ["non-embedded-font", "deposit-prepaid", "dot-thousands-code", "alt-wording"],
    invoice: b02,
    formats: DOT_CODE,
    hidden: ["deliveryDate"],
    template: "times",
    nonEmbeddedFont: true,
    extra: {},
  },
  {
    slug: "B03-excel-grille-objet",
    title: "Modèle Excel avec grille, colonnes HT et TTC, ligne « Objet : »",
    imitates: "Classeur Excel « modèle de facture société » exporté en PDF",
    description:
      "Quadrillage complet, « Objet : » sous l'en-tête, colonnes Désignation | Unité | Qté | PU HT | TVA | Total HT | Total TTC, particulier en client, TVA 10 % et 20 %.",
    tags: ["excel", "grid", "ttc-column", "individual-customer", "multi-rate", "subject-line"],
    invoice: b03,
    formats: FR_SPACE,
    hidden: ["buyer.siren", "buyer.siret"],
    template: "excel",
    nonEmbeddedFont: false,
    extra: { subject: "Fourniture et pose d'une cuisine équipée, 22 rue Nationale" },
  },
  {
    slug: "B04-lettre-word-objet",
    title: "Facture en lettre Word / LibreOffice avec Objet : et paragraphes",
    imitates: "Modèle de lettre-facture Word/LibreOffice d'un consultant indépendant",
    description:
      "En-tête de lettre de l'émetteur (mentions légales en petit), « Le 15 octobre 2026 », « Objet : », paragraphes libres avant et après le tableau, règlement à 45 jours fin de mois.",
    tags: ["word", "letter", "date-long-fr", "subject-line", "terms-end-of-month"],
    invoice: b04,
    formats: { ...FR_SPACE, date: "long" },
    hidden: [],
    template: "letter",
    nonEmbeddedFont: false,
    extra: {
      subject: "Facture n° 2026-0087, mission d'audit logistique de septembre 2026",
      intro:
        "Madame, Monsieur, veuillez trouver ci-dessous le détail de nos honoraires relatifs à la mission réalisée dans vos locaux au cours du mois de septembre.",
      outro:
        "Je vous remercie de bien vouloir régler cette facture par virement bancaire. Restant à votre disposition pour tout renseignement complémentaire, je vous prie d'agréer, Madame, Monsieur, mes salutations distinguées.",
    },
  },
  {
    slug: "B05-saas-montant-du",
    title: "Facture SaaS moderne : gros « Montant dû » en tête, blocs gris, pied minuscule",
    imitates: "Facture Stripe Billing / outil d'abonnement en français",
    description:
      "Grand montant dû en haut, « Numéro de facture », « Date d'émission », « Date d'échéance », blocs gris clairs, lignes avec Qté | Prix unitaire | Montant, identité légale en pied de page minuscule.",
    tags: ["saas", "stripe-like", "date-long-fr", "total-top", "tiny-footer"],
    invoice: b05,
    formats: { ...FR_SPACE, date: "long" },
    hidden: ["seller.phone"],
    template: "saas",
    nonEmbeddedFont: false,
    extra: {},
  },
  {
    slug: "B06-identite-en-pied",
    title: "Identité du vendeur uniquement dans une ligne de pied de page",
    imitates: "Facture d'artisan où l'en-tête n'a qu'un logo graphique et le titre",
    description:
      "Aucun texte d'identité en tête : nom, adresse, forme juridique, capital, RCS, TVA, SIRET, téléphone et e-mail n'apparaissent que dans le pied (« SARL au capital de … - RCS Lyon … »). Dates ISO, montants « €1,200.00 ».",
    tags: ["footer-identity-only", "date-iso", "euro-before", "number-dot-decimal", "multi-rate"],
    invoice: b06,
    formats: {
      date: "iso",
      number: { thousands: ",", decimal: ".", currency: "prefix" },
    },
    hidden: [],
    template: "footer",
    nonEmbeddedFont: false,
    extra: {},
  },
  {
    slug: "B07-remises-et-lots",
    title: "Remise % par ligne, titres de lots avec sous-totaux",
    imitates: "Devis/facture BTP de logiciel de gestion (Sage, Batigest)",
    description:
      "Colonnes Libellé | U | Qté | P.U. | Rem. | TVA | Montant HT, titres « LOT 1 / LOT 2 » avec « Sous-total », prix unitaire brut imprimé donc le prix net n'est pas visible quand une remise s'applique, échéance en clair « 30 jours fin de mois » (date non imprimée).",
    tags: ["discount-column", "sections", "subtotals", "terms-end-of-month", "multi-rate"],
    invoice: b07,
    formats: FR_SPACE,
    hidden: [
      "dueDate",
      "lines.0.unitPrice",
      "lines.1.unitPrice",
      "lines.4.unitPrice",
      "lines.3.unitPrice",
    ],
    template: "sections",
    nonEmbeddedFont: false,
    extra: {
      discounts: [10, 20, 0, 5, 20, 0],
      sections: [
        { from: 0, title: "LOT 1 - Gros oeuvre" },
        { from: 3, title: "LOT 2 - Menuiseries extérieures" },
      ],
    },
  },
  {
    slug: "B08-bilingue-fr-en",
    title: "En-tête bilingue Facture / Invoice",
    imitates: "Facture d'une PME de transport avec modèle bilingue",
    description:
      "« Facture / Invoice No. », « Date / Date of issue », « Due date / Échéance », colonnes bilingues, totaux bilingues, montants « 1.200,00 EUR ».",
    tags: ["bilingual", "dot-thousands-code", "order-reference"],
    invoice: b08,
    formats: DOT_CODE,
    hidden: ["deliveryDate", "payment.termsText"],
    template: "bilingual",
    nonEmbeddedFont: false,
    extra: {},
  },
  {
    slug: "B09-avoir-facture-origine",
    title: "Avoir avec référence à la facture d'origine et montants signés",
    imitates: "Avoir édité depuis Sellsy / Axonaut",
    description:
      "« AVOIR N° », « Avoir sur facture n° … du … », montants imprimés en négatif, bandeau coloré. La vérité terrain est en montants positifs, typeCode 381.",
    tags: ["credit-note", "signed-amounts-printed", "preceding-invoice", "sellsy-like"],
    invoice: b09,
    formats: FR_SPACE,
    hidden: ["deliveryDate", "dueDate", "notes"],
    template: "credit",
    nonEmbeddedFont: false,
    extra: {},
  },
  {
    slug: "B10-solde-acompte-negatif",
    title: "Facture de solde avec ligne « Acompte » négative",
    imitates: "Facture QuickBooks / Sage avec déduction d'acompte en ligne",
    description:
      "Réf. facture, « Date limite de paiement », ligne « Acompte versé à la commande (30 %) » à -1.440,00 € dans le tableau (prix unitaire négatif dans la vérité terrain), « Solde dû ».",
    tags: ["deposit", "negative-line", "quickbooks-like", "dot-thousands"],
    invoice: b10,
    formats: { date: "dmy", number: { thousands: ".", decimal: ",", currency: "suffix" } },
    hidden: [],
    template: "quickbooks",
    nonEmbeddedFont: false,
    extra: {},
  },
  {
    slug: "B11-freelance-rib",
    title: "Indépendant en franchise en base, bloc « Coordonnées bancaires (RIB) »",
    imitates: "Facture Indy / Henrri / Facture.net d'un micro-entrepreneur",
    description:
      "Mention « TVA non applicable, art. 293 B du CGI », unités j / h / forfait, IBAN par groupes de 4 et BIC dans un bloc RIB, SIRET seul (pas de TVA, SIREN dérivé).",
    tags: ["freelance", "franchise-tva", "category-E", "rib-block", "units-h-j"],
    invoice: b11,
    formats: FR_SPACE,
    hidden: ["seller.siren", "buyer.siren"],
    template: "freelance",
    nonEmbeddedFont: false,
    extra: {},
  },
  {
    slug: "B12-deux-pages-descriptions",
    title: "Deux pages, descriptions longues, totaux en dernière page",
    imitates: "Facture Pennylane / Axonaut d'un prestataire de services",
    description:
      "Quatorze lignes avec désignation et description sur plusieurs lignes, quantités « 1,00 », totaux uniquement en page 2, numérotation « Page 1/2 ».",
    tags: ["multi-page", "long-descriptions", "line-description", "buyer-reference", "order-reference"],
    invoice: b12,
    formats: FR_SPACE,
    hidden: [],
    template: "long",
    nonEmbeddedFont: false,
    extra: {},
  },
  {
    slug: "B13-destinataire-en-premier",
    title: "Destinataire au-dessus de l'émetteur, livraison à une autre adresse",
    imitates: "Facture d'un grossiste alimentaire (ERP), bloc client en tête",
    description:
      "Blocs « Adresse de facturation » et « Adresse de livraison » distincts en haut, émetteur dessous, N° de commande, ligne « Remise commerciale » négative, unités kg / L.",
    tags: ["buyer-first", "delivery-address", "negative-line", "multi-rate", "order-reference"],
    invoice: b13,
    formats: FR_SPACE,
    hidden: [],
    template: "buyerFirst",
    nonEmbeddedFont: false,
    extra: {},
  },
]
