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

  // "du paiement", "de la facture" complete the label; they must not be read as its value.
  describe.each([
    ["Date d'\u00e9mission de la facture", "issueDate"],
    ["\u00c9ch\u00e9ance du paiement :", "dueDate"],
    ["Date d'exigibilit\u00e9 du paiement", "dueDate"],
  ] as const)("label with a complement: %s", (label, path) => {
    const read = (rows: SynthRow[]) =>
      extractInvoice(baseInvoice({ header: [...meta([["Facture n\u00b0", "A-1"]]), ...rows] }))
        .draft[path]
    it("inline", () => {
      expect(read([[60, [[300, `${label} 30/11/2026`]]]])).toBe("2026-11-30")
    })
    it("value in the next cell", () => {
      const rows: SynthRow[] = [
        [
          60,
          [
            [300, label],
            [490, "30/11/2026"],
          ],
        ],
      ]
      expect(read(rows)).toBe("2026-11-30")
    })
    it("value under the label", () => {
      expect(
        read([
          [60, [[400, label]]],
          [72, [[400, "30/11/2026"]]],
        ]),
      ).toBe("2026-11-30")
    })
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

describe("payment conditions and bank details printed as key/value tables", () => {
  // Header dates stacked label-over-value, a two-column conditions table in a small font (labels
  // at x=26, values at x=137) whose longest label ends one font size before the value column, and
  // a bank-details table with labels on one row and values on the next.
  const s = (x: number, text: string, size = 6) => ({ x, text, size })
  const doc = () =>
    syntheticDoc([
      [
        [21, [s(26, "Facture", 24)]],
        [55, [s(26, "N° F-2026-0042", 9)]],
        [93, [s(40, "ÉMETTEUR"), s(248, "DESTINATAIRE"), s(458, "DATE D'ÉMISSION")]],
        [105, [s(40, "Atelier Lumière", 9), s(248, "Horizon Immobilier SA", 9)]],
        [106, [s(458, "12/09/2026", 7.5)]],
        [119, [s(40, "12 rue des Lilas"), s(248, "40 boulevard Haussmann")]],
        [120, [s(458, "DATE D'EXIGIBILITÉ DU PAIEMENT")]],
        [130, [s(40, "69001 Lyon"), s(248, "75009 Paris")]],
        [132, [s(458, "11/11/2026", 7.5)]],
        [141, [s(40, "contact@atelier.example"), s(248, "N° SIRET : 750 123 457 00011")]],
        ...TABLE,
        [380, [s(26, "CONDITIONS DE PAIEMENT", 7.5)]],
        [395, [s(26, "Délai de paiement"), s(137, "60 jours")]],
        [407, [s(26, "Pénalité de retard"), s(137, "3 fois le taux légal")]],
        [419, [s(26, "Indemnité forfaitaire pour frais de"), s(137, "40 €")]],
        [428, [s(26, "recouvrement")]],
        [440, [s(26, "Escompte"), s(137, "Pas d'escompte en cas de paiement anticipé")]],
        [452, [s(26, "Moyens de paiement"), s(137, "Virement")]],
        ...TOTALS,
        [480, [s(26, "RELEVÉ D'IDENTITÉ BANCAIRE", 7.5)]],
        [496, [s(26, "Bénéficiaire"), s(122, "Banque"), s(219, "BIC")]],
        [506, [s(26, "ATELIER LUMIERE"), s(122, "Banque Fictive"), s(219, "FICTDEFFXXX")]],
        [521, [s(26, "IBAN")]],
        [531, [s(26, "DE89370400440532013000")]],
        [818, [s(26, "N° SIRET : 523 456 788 00026")]],
      ],
    ])

  it("reads a due date stacked under a label that ends with « du paiement »", () => {
    const draft = extractInvoice(doc()).draft
    expect(draft.issueDate).toBe("2026-09-12")
    expect(draft.dueDate).toBe("2026-11-11")
  })

  it("reads terms and means from the value column", () => {
    const draft = extractInvoice(doc()).draft
    expect(draft.payment?.termsText).toBe("60 jours")
    expect(draft.payment?.meansCode).toBe("30")
  })

  it("joins a legal mention's label with its value, even when the label wraps", () => {
    const draft = extractInvoice(doc()).draft
    expect(draft.legalNotes).toEqual({
      latePaymentPenalty: "Pénalité de retard : 3 fois le taux légal",
      recoveryFee: "Indemnité forfaitaire pour frais de recouvrement : 40 €",
      earlyPaymentDiscount: "Pas d'escompte en cas de paiement anticipé",
    })
  })

  it("reads a BIC printed under its label", () => {
    const draft = extractInvoice(doc()).draft
    expect(draft.payment?.iban).toBe("DE89370400440532013000")
    expect(draft.payment?.bic).toBe("FICTDEFFXXX")
  })

  it("offers a label-less BIC-shaped word under a BIC label without pre-filling it", () => {
    const res = extractInvoice(
      syntheticDoc([
        [
          ...meta([["Facture n°", "A-1"]]),
          ...TABLE,
          [496, [s(26, "Banque"), s(122, "BIC")]],
          [506, [s(26, "Banque Fictive"), s(122, "ATELIERS")]],
        ],
      ]),
    )
    expect(res.draft.payment?.bic).toBeUndefined()
  })
})

describe("unlabelled parties side by side, loose spacing (invoicing-app layout)", () => {
  // Seller top-left and buyer flush right on the same rows, without any "\u00c9metteur" / "Client"
  // label, one-line addresses ending in ", FR", rows a little more than a font size apart, the
  // buyer's identifiers under a combined label, the seller's identifiers only in the footer.
  const s = (x: number, text: string, size = 10) => ({ x, text, size })
  /** Right-aligned at `x1` (synthetic widths are 0.5 em per character). */
  const r = (x1: number, text: string, size = 10) => s(x1 - text.length * size * 0.5, text, size)
  const doc = () =>
    syntheticDoc([
      [
        [45, [s(44, "Atelier Lumi\u00e8re EI", 11.9), r(551, "HORIZON SA", 11.9)]],
        [
          70,
          [
            s(44, "12 rue des Lilas, 69001 Lyon, FR"),
            r(551, "40 boulevard Haussmann, 75009 Paris, FR"),
          ],
        ],
        [94, [r(551, "SIRET et n\u00b0 de TVA intra.")]],
        [110, [r(551, "75012345700012")]],
        [126, [r(551, "FR65750123457")]],
        [153, [s(44, "Facture 2026-0042", 15.9)]],
        [186, [s(44, "\u00c9mise le 12/09/2026")]],
        [
          222,
          [
            s(52, "Libell\u00e9"),
            s(257, "Quantit\u00e9"),
            s(321, "Prix unitaire HT"),
            s(434, "TVA"),
            s(505, "Total HT"),
          ],
        ],
        [
          246,
          [
            s(52, "D\u00e9veloppement du site vitrine de la"),
            r(298, "1"),
            r(392, "700,00 \u20ac"),
            r(449, "0,00 %"),
            r(544, "700,00 \u20ac"),
          ],
        ],
        [261, [s(52, "boutique en ligne")]],
        // "1 400,00 \u20ac" drawn as two runs: the thousands separator is a 1.5 pt positioning gap.
        [
          286,
          [
            s(52, "Maintenance annuelle"),
            r(298, "2"),
            r(392, "700,00 \u20ac"),
            r(449, "0,00 %"),
            s(495.5, "1"),
            r(544, "400,00 \u20ac"),
          ],
        ],
        [
          327,
          [s(65, "\u00c9ch\u00e9ance de paiement"), s(414, "Total HT"), r(543, "2 100,00 \u20ac")],
        ],
        [351, [s(414, "TVA"), r(543, "0,00 \u20ac")]],
        [357, [s(44.5, "60 jours \u00e0 compter de la date d'\u00e9mission de")]],
        [373, [s(44.5, "la facture.")]],
        [384, [s(414, "Total TTC"), r(543, "2 100,00 \u20ac")]],
        [443, [s(44, "Termes et conditions", 8)]],
        [455, [s(44, "Cette facture concerne uniquement de la prestation de service.", 8)]],
        [467, [s(44, "TVA non applicable, art. 293 B du CGI.", 8)]],
        [
          479,
          [
            s(
              44,
              "En cas de retard de paiement, seront exigibles, conform\u00e9ment au code de commerce, une indemnit\u00e9 calcul\u00e9e sur la base de trois fois le",
              8,
            ),
          ],
        ],
        [
          491,
          [
            s(
              44,
              "taux de l'int\u00e9r\u00eat l\u00e9gal en vigueur ainsi qu'une indemnit\u00e9 forfaitaire pour frais de recouvrement de 40\u20ac.",
              8,
            ),
          ],
        ],
        [503, [s(44, "Pas d'escompte en cas de paiement anticip\u00e9.", 8)]],
        [772, [s(44, "Atelier Lumi\u00e8re EI", 8), s(196, "Mode de paiement", 8)]],
        [
          784,
          [s(44, "SIRET : 523 456 788 00026", 8), s(196, "IBAN : DE89 3704 0044 0532 0130 00", 8)],
        ],
        [
          796,
          [s(44, "N\u00b0 TVA Intracom. : FR31523456788", 8), s(196, "BIC : FICT DE FF XXX", 8)],
        ],
        [815, [r(553, "Facture 2026-0042 \u2022 1/1", 7)]],
      ],
    ])

  it("reads the left block as the seller and the right block as the buyer", () => {
    const res = extractInvoice(doc())
    expect(res.draft.seller).toMatchObject({
      name: "Atelier Lumi\u00e8re EI",
      legalForm: "EI",
      siret: "52345678800026",
      siren: "523456788",
      vatNumber: "FR31523456788",
      address: { line1: "12 rue des Lilas", postalCode: "69001", city: "Lyon", countryCode: "FR" },
    })
    expect(res.draft.buyer).toMatchObject({
      name: "HORIZON SA",
      kind: "company",
      siret: "75012345700012",
      siren: "750123457",
      vatNumber: "FR65750123457",
      address: {
        line1: "40 boulevard Haussmann",
        postalCode: "75009",
        city: "Paris",
        countryCode: "FR",
      },
    })
    expect(res.warnings.join(" ")).not.toMatch(/SIREN/)
  })

  it("joins an item name wrapped over two rows, and reads a total split by its thousands gap", () => {
    const res = extractInvoice(doc())
    expect(res.draft.lines?.[0]?.name).toBe(
      "D\u00e9veloppement du site vitrine de la boutique en ligne",
    )
    expect(res.draft.lines?.[0]?.description).toBeUndefined()
    expect(res.draft.lines?.[1]).toMatchObject({ quantity: 2, unitPrice: 700 })
    // The line total (1 400) confirms quantity x price: full confidence.
    const price = res.suggestions.find((x) => x.path === "lines.1.unitPrice")
    expect(price?.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it("reads the terms under their heading, the means from the bank details, the penalty and the category", () => {
    const draft = extractInvoice(doc()).draft
    expect(draft.payment?.termsText).toBe(
      "60 jours \u00e0 compter de la date d'\u00e9mission de la facture",
    )
    expect(draft.payment?.meansCode).toBe("30")
    expect(draft.legalNotes?.latePaymentPenalty).toMatch(
      /trois fois le taux de l'int\u00e9r\u00eat l\u00e9gal/,
    )
    expect(draft.legalNotes?.recoveryFee).toMatch(/40\u20ac/)
    expect(draft.operationCategory).toBe("services")
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
