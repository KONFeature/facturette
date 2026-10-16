/**
 * Layout and wording variants on synthetic text layers (no PDF needed). Each label family is
 * tested with several French wordings, and party blocks with several layouts.
 */
import { describe, expect, it } from "vitest"
import { extractInvoice, PREFILL_THRESHOLD } from "."
import { type SynthRow, stackedRows, syntheticDoc } from "./synthetic-doc"

const SELLER = [
  "Atelier Lumière SARL",
  "SARL au capital de 10 000 €",
  "12 rue des Lilas",
  "69001 Lyon",
  "SIRET : 523 456 788 00026",
  "TVA : FR31523456788",
  "contact@atelier.example",
  "Tél. 04 72 00 00 00",
]
const BUYER = [
  "Horizon Immobilier SA",
  "40 boulevard Haussmann",
  "75009 Paris",
  "SIREN : 750 123 457",
]

const TABLE: SynthRow[] = [
  [
    300,
    [
      [46, "Désignation"],
      [300, "Qté"],
      [350, "PU HT"],
      [420, "TVA"],
      [480, "Total HT"],
    ],
  ],
  [
    320,
    [
      [46, "Développement site vitrine"],
      [300, "3 j"],
      [350, "450,00 €"],
      [420, "20 %"],
      [480, "1 350,00 €"],
    ],
  ],
  [
    340,
    [
      [46, "Hébergement annuel"],
      [300, "1"],
      [350, "120,00 €"],
      [420, "20 %"],
      [480, "120,00 €"],
    ],
  ],
]
const TOTALS: SynthRow[] = [
  [
    380,
    [
      [380, "Total HT"],
      [480, "1 470,00 €"],
    ],
  ],
  [
    395,
    [
      [380, "TVA 20 %"],
      [480, "294,00 €"],
    ],
  ],
  [
    410,
    [
      [380, "Total TTC"],
      [480, "1 764,00 €"],
    ],
  ],
]
const PAYMENT: SynthRow[] = stackedRows(40, 450, [
  "Mode de paiement : Virement SEPA",
  "Paiement à 30 jours fin de mois",
  "IBAN : FR76 3000 4008 2200 0123 4567 834",
  "BIC : FICTFRPPXXX",
])
const LEGAL: SynthRow[] = stackedRows(40, 530, [
  "En cas de retard de paiement, une pénalité égale à 3 fois le taux d'intérêt légal sera appliquée.",
  "Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 €.",
  "Pas d'escompte pour paiement anticipé.",
])

/** Standard header block: label column at x=360, values at x=490. */
function meta(rows: Array<[string, string]>, y = 40): SynthRow[] {
  return rows.map(([label, value], i) => [
    y + i * 14,
    [
      [360, label],
      [490, value],
    ],
  ])
}

function baseInvoice(
  overrides: { header?: SynthRow[]; parties?: SynthRow[]; extra?: SynthRow[] } = {},
) {
  const header =
    overrides.header ??
    meta([
      ["Facture n°", "F-2026-0412"],
      ["Date", "12/09/2026"],
      ["Échéance", "12/10/2026"],
    ])
  const parties = overrides.parties ?? [
    ...stackedRows(40, 40, SELLER),
    [170, [[320, "Facturé à"]]],
    ...stackedRows(320, 184, BUYER),
  ]
  return syntheticDoc([
    [...header, ...parties, ...TABLE, ...TOTALS, ...PAYMENT, ...LEGAL, ...(overrides.extra ?? [])],
  ])
}

const draftOf = (rows: SynthRow[][], hints?: Parameters<typeof extractInvoice>[1]) =>
  extractInvoice(syntheticDoc(rows), hints).draft

describe("invoice number wordings", () => {
  it.each([
    [[["Facture n°", "F-2026-0412"]]],
    [[["N° de facture :", "F-2026-0412"]]],
    [[["Numéro de facture", "F-2026-0412"]]],
    [[["FACTURE N°: F-2026-0412", ""]]],
    [[["Invoice no.", "F-2026-0412"]]],
    [[["Réf. facture :", "F-2026-0412"]]],
  ] as Array<[Array<[string, string]>]>)("reads %j", (rows) => {
    const doc = baseInvoice({ header: meta(rows.map(([l, v]) => [l, v])) })
    expect(extractInvoice(doc).draft.number).toBe("F-2026-0412")
  })

  it("reads a value printed under its label (header table)", () => {
    const header: SynthRow[] = [
      [
        40,
        [
          [300, "N° facture"],
          [380, "Date"],
          [460, "Échéance"],
        ],
      ],
      [
        54,
        [
          [300, "2026-014"],
          [380, "01/10/2026"],
          [460, "31/10/2026"],
        ],
      ],
    ]
    const draft = extractInvoice(baseInvoice({ header })).draft
    expect(draft.number).toBe("2026-014")
    expect(draft.issueDate).toBe("2026-10-01")
    expect(draft.dueDate).toBe("2026-10-31")
  })

  it("does not take a date for an invoice number", () => {
    const doc = baseInvoice({ header: meta([["Facture du", "12/09/2026"]]) })
    expect(extractInvoice(doc).draft.number).toBeUndefined()
  })
})

describe("date wordings", () => {
  it.each([
    ["Date :", "15/10/2026"],
    ["Date de facture", "15-10-26"],
    ["Date d'émission", "2026-10-15"],
    ["Émise le", "15 octobre 2026"],
    ["Date de facturation :", "15 oct. 2026"],
  ])("issue date %s %s", (label, value) => {
    const draft = extractInvoice(
      baseInvoice({
        header: meta([
          ["Facture n°", "A-1"],
          [label, value],
        ]),
      }),
    ).draft
    expect(draft.issueDate).toBe("2026-10-15")
  })

  it("reads a letter-style date", () => {
    const header: SynthRow[] = [
      ...meta([["Facture n°", "A-1"]]),
      [60, [[380, "Lyon, le 1er octobre 2026"]]],
    ]
    expect(extractInvoice(baseInvoice({ header })).draft.issueDate).toBe("2026-10-01")
  })

  it.each([
    ["Échéance :", "30/11/2026"],
    ["Date d'échéance", "30/11/2026"],
    ["À régler avant le", "30/11/2026"],
    ["Date limite de paiement :", "30 novembre 2026"],
    ["Payable le", "2026-11-30"],
  ])("due date %s %s", (label, value) => {
    const draft = extractInvoice(
      baseInvoice({
        header: meta([
          ["Facture n°", "A-1"],
          ["Date", "15/10/2026"],
          [label, value],
        ]),
      }),
    ).draft
    expect(draft.dueDate).toBe("2026-11-30")
    expect(draft.issueDate).toBe("2026-10-15")
  })

  it.each([
    ["Date de livraison", "10/10/2026"],
    ["Date d'exécution :", "10/10/2026"],
    ["Date de la prestation", "10/10/2026"],
    ["Livré le", "10 octobre 2026"],
    ["Date d'intervention", "2026-10-10"],
  ])("delivery date %s %s", (label, value) => {
    const draft = extractInvoice(
      baseInvoice({
        header: meta([
          ["Facture n°", "A-1"],
          ["Date", "15/10/2026"],
          [label, value],
        ]),
      }),
    ).draft
    expect(draft.deliveryDate).toBe("2026-10-10")
  })

  it("only offers the end of a billing period as delivery date", () => {
    const res = extractInvoice(
      baseInvoice({
        header: [
          ...meta([["Facture n°", "A-1"]]),
          [60, [[380, "Période du 01/09/2026 au 30/09/2026"]]],
        ],
      }),
    )
    expect(res.draft.deliveryDate).toBeUndefined()
    const s = res.suggestions.find((x) => x.path === "deliveryDate")
    expect(s?.value).toBe("2026-09-30")
    expect(s?.confidence).toBeLessThan(PREFILL_THRESHOLD)
  })
})

describe("party labels", () => {
  it.each([
    "Facturé à",
    "Client",
    "Client :",
    "Adressé à",
    "À l'attention de",
    "Destinataire",
    "Bill to",
  ])("buyer label %s", (label) => {
    const draft = extractInvoice(
      baseInvoice({
        parties: [
          ...stackedRows(40, 40, SELLER),
          [170, [[320, label]]],
          ...stackedRows(320, 184, BUYER),
        ],
      }),
    ).draft
    expect(draft.buyer?.name).toBe("Horizon Immobilier SA")
    expect(draft.buyer?.address).toMatchObject({
      line1: "40 boulevard Haussmann",
      postalCode: "75009",
      city: "Paris",
    })
    expect(draft.buyer?.siren).toBe("750123457")
    expect(draft.seller?.name).toBe("Atelier Lumière SARL")
    expect(draft.seller?.siret).toBe("52345678800026")
  })

  it("reads an inline buyer label", () => {
    const parties: SynthRow[] = [
      ...stackedRows(40, 40, SELLER),
      [170, [[320, "Client : Horizon Immobilier SA"]]],
      ...stackedRows(320, 184, BUYER.slice(1)),
    ]
    const draft = extractInvoice(baseInvoice({ parties })).draft
    expect(draft.buyer?.name).toBe("Horizon Immobilier SA")
    expect(draft.buyer?.address?.city).toBe("Paris")
  })

  it.each(["Émetteur", "Vendeur", "Prestataire", "Fournisseur", "De :"])(
    "seller label %s",
    (label) => {
      const parties: SynthRow[] = [
        [
          150,
          [
            [40, label],
            [320, "Client"],
          ],
        ],
        ...stackedRows(40, 164, SELLER),
        ...stackedRows(320, 164, BUYER),
      ]
      const draft = extractInvoice(baseInvoice({ parties })).draft
      expect(draft.seller?.name).toBe("Atelier Lumière SARL")
      expect(draft.seller?.vatNumber).toBe("FR31523456788")
      expect(draft.buyer?.name).toBe("Horizon Immobilier SA")
    },
  )
})

describe("party layouts", () => {
  const expectParties = (draft: ReturnType<typeof draftOf>) => {
    expect(draft.seller?.name).toBe("Atelier Lumière SARL")
    expect(draft.seller?.siren).toBe("523456788")
    expect(draft.seller?.vatNumber).toBe("FR31523456788")
    expect(draft.seller?.address).toMatchObject({ postalCode: "69001", city: "Lyon" })
    expect(draft.buyer?.name).toBe("Horizon Immobilier SA")
    expect(draft.buyer?.siren).toBe("750123457")
    expect(draft.buyer?.address?.postalCode).toBe("75009")
  }

  it("stacked: seller letterhead, client block below it", () => {
    const parties: SynthRow[] = [
      ...stackedRows(40, 40, SELLER),
      [175, [[40, "CLIENT"]]],
      ...stackedRows(40, 189, BUYER),
    ]
    const draft = extractInvoice(
      baseInvoice({ parties, header: meta([["Facture n°", "A-1"]], 175) }),
    ).draft
    expectParties(draft)
  })

  it("side by side: seller left, buyer right on the same rows", () => {
    const parties: SynthRow[] = [
      ...stackedRows(40, 100, SELLER),
      [86, [[320, "Facturé à :"]]],
      ...stackedRows(320, 100, BUYER),
    ]
    const header = meta([["Facture n°", "A-1"]], 40)
    expectParties(extractInvoice(baseInvoice({ parties, header })).draft)
  })

  it("seller only in the footer", () => {
    const parties: SynthRow[] = [[170, [[320, "Facturé à"]]], ...stackedRows(320, 184, BUYER)]
    const extra: SynthRow[] = [
      [
        790,
        [
          [
            40,
            "Atelier Lumière SARL – SARL au capital de 10 000 € – 12 rue des Lilas 69001 Lyon – SIRET 523 456 788 00026 – TVA FR31523456788",
          ],
        ],
      ],
    ]
    const draft = extractInvoice(baseInvoice({ parties, extra })).draft
    expectParties(draft)
    expect(draft.seller?.shareCapital).toBe("10 000 €")
    expect(draft.seller?.address?.line1).toBe("12 rue des Lilas")
  })

  it("letter layout: unlabelled recipient window on the right", () => {
    const parties: SynthRow[] = [...stackedRows(40, 40, SELLER), ...stackedRows(330, 170, BUYER)]
    const header = meta([["Facture n°", "A-1"]], 260)
    expectParties(extractInvoice(baseInvoice({ parties, header })).draft)
  })

  it("uses the known seller hint when the seller block is not top-left", () => {
    const sellerRight = SELLER
    const buyerLeft = [
      "Horizon Immobilier SA",
      "40 boulevard Haussmann",
      "75009 Paris",
      "SIREN : 750 123 457",
      "TVA : FR65750123457",
    ]
    const parties: SynthRow[] = [
      ...stackedRows(330, 40, sellerRight),
      ...stackedRows(40, 60, buyerLeft),
    ]
    const doc = baseInvoice({ parties, header: meta([["Facture n°", "A-1"]], 200) })
    const draft = extractInvoice(doc, { hints: { sellerSiren: "523456788" } }).draft
    expect(draft.seller?.name).toBe("Atelier Lumière SARL")
    expect(draft.seller?.siren).toBe("523456788")
  })

  it("recognises a private customer", () => {
    const parties: SynthRow[] = [
      ...stackedRows(40, 40, SELLER),
      [170, [[320, "Client"]]],
      ...stackedRows(320, 184, ["Madame Élodie Martinet", "9 rue des Lilas", "35000 Rennes"]),
    ]
    const draft = extractInvoice(baseInvoice({ parties })).draft
    expect(draft.buyer?.kind).toBe("individual")
    expect(draft.buyer?.siren).toBeUndefined()
  })

  it("puts the delivery address aside when both bill-to and recipient blocks exist", () => {
    const parties: SynthRow[] = [
      ...stackedRows(40, 40, SELLER),
      [
        170,
        [
          [320, "Facturé à"],
          [460, "Destinataire"],
        ],
      ],
      ...stackedRows(320, 184, BUYER),
      ...stackedRows(460, 184, ["Entrepôt Nord", "5 rue du Port", "59000 Lille"]),
    ]
    const res = extractInvoice(baseInvoice({ parties }))
    expect(res.draft.buyer?.address?.city).toBe("Paris")
    const delivery = res.suggestions.find((s) => s.path === "deliveryAddress.city")
    expect(delivery?.value).toBe("Lille")
    // A "Destinataire" block beside a bill-to label is the delivery address: pre-filled into
    // deliveryAddress (never into buyer.*), as the fixture corpus expects.
    expect(delivery?.confidence).toBeGreaterThanOrEqual(PREFILL_THRESHOLD)
    expect(res.draft.deliveryAddress?.line1).toBe("5 rue du Port")
  })
})

describe("harder layouts", () => {
  /** Right-aligned rows ending at x = 556 (text width is estimated as 4.5 pt per character). */
  const flushRight = (y: number, texts: string[]): SynthRow[] =>
    texts.map((text, i) => [y + i * 13, [[556 - text.length * 4.5, text]]])

  it("reads a seller letterhead printed flush right", () => {
    const parties: SynthRow[] = [
      ...flushRight(40, SELLER),
      [180, [[40, "Factur\u00e9 \u00e0"]]],
      ...stackedRows(40, 194, BUYER),
    ]
    const draft = extractInvoice(
      baseInvoice({ parties, header: meta([["Facture n\u00b0", "A-1"]], 250) }),
    ).draft
    expect(draft.seller?.name).toBe("Atelier Lumi\u00e8re SARL")
    expect(draft.seller?.address).toMatchObject({ line1: "12 rue des Lilas", postalCode: "69001" })
    expect(draft.seller?.email).toBe("contact@atelier.example")
    expect(draft.buyer?.name).toBe("Horizon Immobilier SA")
  })

  it("reads labels wrapped over two rows in a narrow label column", () => {
    const header: SynthRow[] = [
      [
        40,
        [
          [400, "Facture n\u00b0"],
          [470, "A-1"],
        ],
      ],
      [56, [[400, "Date"]]],
      [61, [[470, "09/10/2026"]]],
      [68, [[400, "d'\u00e9mission"]]],
      [84, [[400, "\u00c0 r\u00e9gler"]]],
      [89, [[470, "08/11/2026"]]],
      [96, [[400, "avant le"]]],
      [
        112,
        [
          [400, "R\u00e9f\u00e9rence"],
          [470, "Service"],
        ],
      ],
      [
        124,
        [
          [400, "client"],
          [470, "achats"],
        ],
      ],
    ]
    const draft = extractInvoice(baseInvoice({ header })).draft
    expect(draft.issueDate).toBe("2026-10-09")
    expect(draft.dueDate).toBe("2026-11-08")
    expect(draft.buyerReference).toBe("Service achats")
    expect(draft.buyer?.name).toBe("Horizon Immobilier SA")
  })

  it("does not take an IBAN printed in the buyer block, nor a direct-debit account, as the payee's", () => {
    const buyer = [...BUYER, "IBAN : FR76 3000 6000 0112 3456 7890 189"]
    const parties: SynthRow[] = [
      ...stackedRows(40, 40, SELLER),
      [170, [[320, "Client"]]],
      ...stackedRows(320, 184, buyer),
    ]
    const res = extractInvoice(
      syntheticDoc([[...meta([["Facture n\u00b0", "A-1"]]), ...parties, ...TABLE, ...TOTALS]]),
    )
    expect(res.draft.payment?.iban).toBeUndefined()

    const debit = extractInvoice(
      syntheticDoc([
        [
          ...meta([["Facture n\u00b0", "A-1"]]),
          ...TABLE,
          ...stackedRows(40, 450, [
            "Pr\u00e9l\u00e8vement SEPA le 15/11/2026 sur le compte",
            "IBAN : FR76 3000 6000 0112 3456 7890 189",
          ]),
        ],
      ]),
    )
    expect(debit.draft.payment?.iban).toBeUndefined()
    expect(debit.suggestions.find((s) => s.path === "payment.iban")?.value).toBe(
      "FR7630006000011234567890189",
    )
  })

  it("never pre-fills unit prices from a column labelled TTC", () => {
    const table: SynthRow[] = [
      [
        300,
        [
          [46, "D\u00e9signation"],
          [300, "Qt\u00e9"],
          [350, "PU TTC"],
          [480, "Total TTC"],
        ],
      ],
      [
        320,
        [
          [46, "Coupe et brushing"],
          [300, "1"],
          [350, "36,00 \u20ac"],
          [480, "36,00 \u20ac"],
        ],
      ],
    ]
    const res = extractInvoice(syntheticDoc([[...meta([["Facture n\u00b0", "A-1"]]), ...table]]))
    expect(res.draft.lines?.[0]?.unitPrice).toBeUndefined()
    expect(res.warnings.join(" ")).toMatch(/TTC/)
  })
})

describe("totals wordings and arithmetic cross-check", () => {
  it.each([
    ["Total HT", "Total TTC"],
    ["Montant HT", "Montant TTC"],
    ["Sous-total HT", "Net à payer"],
    ["Total hors taxes", "Total à payer"],
    ["Total H.T.", "Total T.T.C."],
  ])("%s / %s agree with the lines: no warning, confident lines", (ht, ttc) => {
    const totals: SynthRow[] = [
      [
        380,
        [
          [380, ht],
          [480, "1 470,00 €"],
        ],
      ],
      [
        395,
        [
          [380, "TVA 20 %"],
          [480, "294,00 €"],
        ],
      ],
      [
        410,
        [
          [380, ttc],
          [480, "1 764,00 €"],
        ],
      ],
    ]
    const doc = syntheticDoc([[...meta([["Facture n°", "A-1"]]), ...TABLE, ...totals]])
    const res = extractInvoice(doc)
    expect(res.warnings.join(" ")).not.toMatch(/diffère/)
    expect(res.draft.lines).toHaveLength(2)
    expect(res.draft.lines?.[0]).toMatchObject({
      name: "Développement site vitrine",
      quantity: 3,
      unitCode: "DAY",
      unitPrice: 450,
      vatRate: 20,
      vatCategory: "S",
    })
    expect(
      res.suggestions.find((s) => s.path === "lines.0.unitPrice")?.confidence,
    ).toBeGreaterThanOrEqual(0.9)
  })

  it("warns in French when the lines do not reproduce the printed total", () => {
    const totals: SynthRow[] = [
      [
        380,
        [
          [380, "Total HT"],
          [480, "1 500,00 €"],
        ],
      ],
    ]
    const res = extractInvoice(
      syntheticDoc([[...meta([["Facture n°", "A-1"]]), ...TABLE, ...totals]]),
    )
    expect(res.warnings).toContain(
      "Le total calculé (1 470,00 €) diffère du total du PDF (1 500,00 €) : vérifiez les lignes.",
    )
  })

  it("reads a prepaid deposit and confirms it with the amount due", () => {
    const totals: SynthRow[] = [
      ...TOTALS,
      [
        425,
        [
          [380, "Acompte versé"],
          [480, "-500,00 €"],
        ],
      ],
      [
        440,
        [
          [380, "Reste à payer"],
          [480, "1 264,00 €"],
        ],
      ],
    ]
    const res = extractInvoice(
      syntheticDoc([[...meta([["Facture n°", "A-1"]]), ...TABLE, ...totals]]),
    )
    expect(res.draft.prepaidAmount).toBe(500)
    expect(
      res.suggestions.find((s) => s.path === "prepaidAmount")?.confidence,
    ).toBeGreaterThanOrEqual(0.9)
  })

  it("normalises a credit note to positive amounts with type 381", () => {
    const table: SynthRow[] = [
      TABLE[0] as SynthRow,
      [
        320,
        [
          [46, "Remise commerciale"],
          [300, "1 forfait"],
          [350, "-200,00 €"],
          [420, "20 %"],
          [480, "-200,00 €"],
        ],
      ],
    ]
    const doc = syntheticDoc([
      [
        [30, [{ x: 40, text: "AVOIR", size: 18 }]],
        ...meta(
          [
            ["Avoir n°", "AV-12"],
            ["Date", "01/10/2026"],
          ],
          60,
        ),
        ...table,
        [
          380,
          [
            [380, "Total HT"],
            [480, "-200,00 €"],
          ],
        ],
      ],
    ])
    const draft = extractInvoice(doc).draft
    expect(draft.typeCode).toBe("381")
    expect(draft.number).toBe("AV-12")
    expect(draft.lines?.[0]).toMatchObject({ quantity: 1, unitCode: "LS", unitPrice: 200 })
  })

  it("offers an amount-only table as one unit per line, below the pre-fill threshold", () => {
    const table: SynthRow[] = [
      [
        300,
        [
          [46, "Prestation"],
          [480, "Montant HT"],
        ],
      ],
      [
        320,
        [
          [46, "Refonte du site"],
          [480, "2 400,00 \u20ac"],
        ],
      ],
      [
        340,
        [
          [46, "Maintenance (3 mois)"],
          [480, "300,00 \u20ac"],
        ],
      ],
    ]
    const totals: SynthRow[] = [
      [
        380,
        [
          [380, "Total HT"],
          [480, "2 700,00 \u20ac"],
        ],
      ],
    ]
    const res = extractInvoice(
      syntheticDoc([[...meta([["Facture n\u00b0", "A-1"]]), ...table, ...totals]]),
    )
    expect(res.draft.lines).toHaveLength(2)
    expect(res.draft.lines?.[0]).toMatchObject({ name: "Refonte du site" })
    // No quantity column: "1 \u00d7 total" is a guess, offered but never pre-filled.
    expect(res.draft.lines?.[0]?.quantity).toBeUndefined()
    const qty = res.suggestions.find((s) => s.path === "lines.0.quantity")
    const price = res.suggestions.find((s) => s.path === "lines.0.unitPrice")
    expect(qty?.value).toBe(1)
    expect(price?.value).toBe(2400)
    expect(qty?.confidence).toBeLessThanOrEqual(0.5)
    expect(price?.confidence).toBeLessThanOrEqual(0.5)
  })

  it("parses wrapped descriptions and a table continued on the next page", () => {
    const page1: SynthRow[] = [
      ...meta([["Facture n°", "A-1"]]),
      TABLE[0] as SynthRow,
      [
        320,
        [
          [46, "Audit technique"],
          [300, "2 j"],
          [350, "600,00 €"],
          [420, "20 %"],
          [480, "1 200,00 €"],
        ],
      ],
      [330, [{ x: 46, text: "Revue du code et de l'infrastructure", size: 7 }]],
      [800, [[270, "Page 1/2"]]],
    ]
    const page2: SynthRow[] = [
      [
        40,
        [
          [46, "Formation équipe"],
          [300, "7,5 h"],
          [350, "80,00 €"],
          [420, "20 %"],
          [480, "600,00 €"],
        ],
      ],
      [
        80,
        [
          [380, "Total HT"],
          [480, "1 800,00 €"],
        ],
      ],
    ]
    const res = extractInvoice(syntheticDoc([page1, page2]))
    expect(res.draft.lines).toHaveLength(2)
    expect(res.draft.lines?.[0]?.description).toBe("Revue du code et de l'infrastructure")
    expect(res.draft.lines?.[1]).toMatchObject({
      name: "Formation équipe",
      quantity: 7.5,
      unitCode: "HUR",
    })
  })
})

describe("payment wordings", () => {
  const withPayment = (rows: string[]) =>
    extractInvoice(
      syntheticDoc([
        [...meta([["Facture n°", "A-1"]]), ...TABLE, ...TOTALS, ...stackedRows(40, 450, rows)],
      ]),
    )

  it.each([
    ["IBAN : FR76 3000 4008 2200 0123 4567 834"],
    ["IBAN FR7630004008220001234567834"],
    ["Coordonnées bancaires : IBAN FR76 3000 4008 2200 0123 4567 834 – BIC FICTFRPPXXX"],
    ["I.B.A.N. : FR76 3000 4008 2200 0123 4567 834"],
    ["Compte : FR76 3000 4008 2200 0123 4567 834"],
  ])("IBAN %s", (row) => {
    expect(withPayment([row]).draft.payment?.iban).toBe("FR7630004008220001234567834")
  })

  it("offers an IBAN with a wrong checksum only as a suggestion, with a warning", () => {
    const res = withPayment(["IBAN : FR76 3000 4008 2200 0123 4567 835"])
    expect(res.draft.payment?.iban).toBeUndefined()
    expect(res.suggestions.find((s) => s.path === "payment.iban")?.confidence).toBeLessThan(
      PREFILL_THRESHOLD,
    )
    expect(res.warnings.join(" ")).toMatch(/IBAN.*invalide/)
  })

  it.each([
    ["BIC : FICTFRPPXXX", "FICTFRPPXXX"],
    ["Code BIC : FICTFRPP", "FICTFRPP"],
    ["SWIFT : FICT FR PP XXX", "FICTFRPPXXX"],
    ["BIC/SWIFT FICTFRPPXXX", "FICTFRPPXXX"],
    ["IBAN FR76 3000 4008 2200 0123 4567 834 BIC FICTFRPPXXX", "FICTFRPPXXX"],
  ])("BIC %s", (row, bic) => {
    expect(withPayment([row]).draft.payment?.bic).toBe(bic)
  })

  it.each([
    ["Mode de paiement : Virement SEPA", "58"],
    ["Mode de règlement : Virement bancaire", "30"],
    ["Moyen de paiement : Chèque", "20"],
    ["Mode de règlement : Carte bancaire", "48"],
    ["Mode de paiement : Prélèvement SEPA", "59"],
    ["Mode de règlement : Espèces", "10"],
  ])("means %s", (row, code) => {
    expect(withPayment([row]).draft.payment?.meansCode).toBe(code)
  })

  it.each([
    ["Paiement à réception de facture", "Paiement à réception de facture"],
    ["Payable à 30 jours fin de mois", "Payable à 30 jours fin de mois"],
    ["Conditions de paiement : 45 jours fin de mois", "45 jours fin de mois"],
    ["Règlement comptant", "Règlement comptant"],
    ["Paiement sous 15 jours", "Paiement sous 15 jours"],
  ])("terms %s", (row, terms) => {
    expect(withPayment([row]).draft.payment?.termsText).toBe(terms)
  })

  it.each([
    ["Référence à rappeler : F-2026-0412", "F-2026-0412"],
    ["Référence de paiement : RF18 5390 0754 7034", "RF18 5390 0754 7034"],
    ["Communication : F2026-77", "F2026-77"],
  ])("payment reference %s", (row, ref) => {
    expect(withPayment([row]).draft.payment?.reference).toBe(ref)
  })
})

describe("legal mentions and VAT exemption", () => {
  it("reads the three legal notes", () => {
    const draft = extractInvoice(baseInvoice()).draft
    expect(draft.legalNotes?.latePaymentPenalty).toMatch(/^En cas de retard/)
    expect(draft.legalNotes?.recoveryFee).toMatch(/40 €/)
    expect(draft.legalNotes?.earlyPaymentDiscount).toBe("Pas d'escompte pour paiement anticipé.")
  })

  it("splits legal notes printed as one paragraph", () => {
    const doc = baseInvoice({
      extra: stackedRows(40, 600, [
        "Pas d'escompte en cas de paiement anticipé. Pénalités de retard : 3 fois le taux",
        "d'intérêt légal. Indemnité forfaitaire pour frais de recouvrement : 40 euros.",
      ]),
    })
    const res = extractInvoice(doc)
    const recovery = res.suggestions
      .filter((s) => s.path === "legalNotes.recoveryFee")
      .map((s) => s.value)
    expect(recovery).toContain("Indemnité forfaitaire pour frais de recouvrement : 40 euros.")
  })

  it("detects the VAT franchise and forces category E at 0 %", () => {
    const table: SynthRow[] = [
      [
        300,
        [
          [46, "Désignation"],
          [300, "Quantité"],
          [350, "Prix unitaire"],
          [480, "Montant"],
        ],
      ],
      [
        320,
        [
          [46, "Création de logo"],
          [300, "1 forfait"],
          [350, "850,00 €"],
          [480, "850,00 €"],
        ],
      ],
    ]
    const doc = syntheticDoc([
      [
        ...meta([["Facture n°", "2026-014"]]),
        ...table,
        [400, [[40, "TVA non applicable, art. 293 B du CGI"]]],
      ],
    ])
    const draft = extractInvoice(doc).draft
    expect(draft.vatExemptionReason).toBe("TVA non applicable, art. 293 B du CGI")
    expect(draft.lines?.[0]).toMatchObject({
      vatCategory: "E",
      vatRate: 0,
      unitCode: "LS",
      quantity: 1,
      unitPrice: 850,
    })
  })
})

describe("robustness", () => {
  it("returns an empty result with a warning for a scanned PDF", () => {
    const doc = { ...syntheticDoc([[]]), hasTextLayer: false }
    const res = extractInvoice(doc)
    expect(res.suggestions).toEqual([])
    expect(res.draft).toEqual({})
    expect(res.warnings[0]).toMatch(/Aucun texte/)
  })

  it.each([
    ["one word", [[[100, [[40, "Bonjour tout le monde, ceci est un texte"]]]]] as SynthRow[][]],
    ["empty page", [[]] as SynthRow[][]],
    ["garbage", [[[100, [[40, "%%%% ---- 0000 ,,,, €€€ 31/02/2026 FR00"]]]]] as SynthRow[][]],
  ])("never throws on %s", (_name, pages) => {
    const doc = { ...syntheticDoc(pages), hasTextLayer: true }
    const res = extractInvoice(doc)
    expect(res.warnings.length).toBeGreaterThan(0)
    expect(res.draft.number).toBeUndefined()
  })

  it("every suggestion carries evidence text and a bbox", () => {
    const res = extractInvoice(baseInvoice())
    expect(res.suggestions.length).toBeGreaterThan(20)
    for (const s of res.suggestions) {
      expect(s.evidence.text.length).toBeGreaterThan(0)
      if (s.rule !== "operation-category-vocabulary") expect(s.evidence.bbox?.page).toBe(1)
    }
  })

  it("draft holds only suggestions at or above the threshold, best first", () => {
    const res = extractInvoice(baseInvoice())
    for (let i = 1; i < res.suggestions.length; i++) {
      expect(res.suggestions[i - 1]?.confidence ?? 0).toBeGreaterThanOrEqual(
        res.suggestions[i]?.confidence ?? 0,
      )
    }
    expect(res.draft.operationCategory).toBeUndefined()
  })

  it("reports invalid identifiers as low-confidence suggestions with a warning", () => {
    const seller = SELLER.map((l) => (l.startsWith("SIRET") ? "SIRET : 523 456 788 00027" : l))
    const parties: SynthRow[] = [
      ...stackedRows(40, 40, seller),
      [170, [[320, "Client"]]],
      ...stackedRows(320, 184, BUYER),
    ]
    const res = extractInvoice(baseInvoice({ parties }))
    expect(res.draft.seller?.siret).toBeUndefined()
    const s = res.suggestions.find((x) => x.path === "seller.siret")
    expect(s?.value).toBe("52345678800027")
    expect(s?.confidence).toBeLessThan(PREFILL_THRESHOLD)
    expect(res.warnings.join(" ")).toMatch(/SIRET du vendeur.*invalide/)
  })

  // Typically 2-15 ms; 250 ms still catches a real regression without failing on a loaded machine.
  it("runs a 3-page invoice quickly (best of 5 under 250 ms)", () => {
    const rowsFor = (page: number): SynthRow[] =>
      Array.from({ length: 35 }, (_, i) => [
        60 + i * 20,
        [
          [46, `Article ${page}-${i}`],
          [300, "2 u"],
          [350, "10,00 €"],
          [420, "20 %"],
          [480, "20,00 €"],
        ],
      ])
    const doc = syntheticDoc([
      [
        ...stackedRows(40, 0, SELLER.slice(0, 2)),
        TABLE[0] as SynthRow,
        ...rowsFor(1)
          .map(([y, r]) => [y + 300, r] as SynthRow)
          .slice(0, 25),
      ],
      [TABLE[0] as SynthRow, ...rowsFor(2)],
      [
        TABLE[0] as SynthRow,
        ...rowsFor(3),
        ...TOTALS.map(([y, r]) => [y + 400, r] as SynthRow),
        ...PAYMENT.map(([y, r]) => [y + 300, r] as SynthRow),
      ],
    ])
    extractInvoice(doc) // warm-up
    // Best of 5: a genuinely slow extractor is slow every time, whereas a single run can be
    // hit by scheduler jitter when the whole suite runs in parallel.
    const timings = Array.from({ length: 5 }, () => {
      const start = performance.now()
      extractInvoice(doc)
      return performance.now() - start
    })
    expect(Math.min(...timings)).toBeLessThan(250)
  })
})
