/**
 * Layout and wording variants for the rules added to generalise beyond the tuned fixtures
 * (blind-set triage): each class is exercised with several wordings on synthetic documents.
 */
import { describe, expect, it } from "vitest"
import { extractInvoice, PREFILL_THRESHOLD, type Suggestion } from "."
import { type SynthRow, stackedRows, syntheticDoc } from "./synthetic-doc"

const SELLER = [
  "Atelier Lumière SARL",
  "12 rue des Lilas",
  "69001 Lyon",
  "SIRET : 523 456 788 00026",
  "TVA : FR31523456788",
]
const BUYER = ["Horizon Immobilier SA", "40 boulevard Haussmann", "75009 Paris"]
const HEADER: SynthRow[] = [
  [
    40,
    [
      [360, "Facture n°"],
      [490, "F-2026-0412"],
    ],
  ],
  [
    54,
    [
      [360, "Date"],
      [490, "12/09/2026"],
    ],
  ],
]
const PARTIES: SynthRow[] = [
  ...stackedRows(40, 40, SELLER),
  [130, [[320, "Facturé à"]]],
  ...stackedRows(320, 144, BUYER),
]
const ITEM_HEADER: SynthRow = [
  300,
  [
    [46, "Désignation"],
    [300, "Qté"],
    [350, "PU HT"],
    [420, "TVA"],
    [480, "Total HT"],
  ],
]
const item = (y: number, name: string, qty: string, pu: string, total: string): SynthRow => [
  y,
  [
    [46, name],
    [300, qty],
    [350, pu],
    [420, "20 %"],
    [480, total],
  ],
]
const TOTALS = (y: number, ht: string, tva: string, ttc: string): SynthRow[] => [
  [
    y,
    [
      [380, "Total HT"],
      [480, ht],
    ],
  ],
  [
    y + 15,
    [
      [380, "TVA 20 %"],
      [480, tva],
    ],
  ],
  [
    y + 30,
    [
      [380, "Total TTC"],
      [480, ttc],
    ],
  ],
]
const STANDARD_TABLE: SynthRow[] = [
  ITEM_HEADER,
  item(320, "Développement site vitrine", "3", "450,00", "1 350,00"),
  item(340, "Hébergement annuel", "1", "120,00", "120,00"),
  ...TOTALS(380, "1 470,00 €", "294,00 €", "1 764,00 €"),
]

function doc(extra: SynthRow[], options: { table?: SynthRow[]; header?: SynthRow[] } = {}) {
  return syntheticDoc([
    [...(options.header ?? HEADER), ...PARTIES, ...(options.table ?? STANDARD_TABLE), ...extra],
  ])
}

const best = (suggestions: Suggestion[], path: string) => suggestions.find((s) => s.path === path)

describe("payment terms keep no label prefix", () => {
  it.each([
    ["Paiement : Paiement à 30 jours", "Paiement à 30 jours"],
    ["Règlement : Paiement à 30 jours date de facture", "Paiement à 30 jours date de facture"],
    ["Conditions : Paiement à 45 jours fin de mois.", "Paiement à 45 jours fin de mois"],
    ["Règlement : À régler avant le 15/11/2026", "À régler avant le 15/11/2026"],
    ["Délai de règlement : 30 jours net", "30 jours net"],
  ])("%s", (text, expected) => {
    const res = extractInvoice(doc([[460, [[40, text]]]]))
    expect(res.draft.payment?.termsText).toBe(expected)
  })

  it("completes a terms sentence wrapped onto the next row, without the restated due date", () => {
    const res = extractInvoice(
      doc(
        stackedRows(40, 460, [
          "Facture établie le 12 septembre 2026. Conditions : Règlement à 45 jours fin de",
          "mois, soit une échéance au 31 octobre 2026.",
        ]),
      ),
    )
    expect(res.draft.payment?.termsText).toBe("Règlement à 45 jours fin de mois")
  })

  it("reads an IBAN cut by a line wrap", () => {
    const res = extractInvoice(
      doc(
        stackedRows(40, 460, [
          "Prestation réalisée le 30 septembre. Coordonnées bancaires : IBAN FR76 1027 8360",
          "0000 0612 3457 871, BIC CMCIFR2AXXX.",
        ]),
      ),
    )
    expect(res.draft.payment?.iban).toBe("FR7610278360000006123457871")
  })
})

describe("payment means", () => {
  const IBAN = "IBAN : FR76 3000 4008 2200 0123 4567 834"
  it.each([
    [["Mode de règlement : Virement SEPA", IBAN], "58", true],
    [["Mode de règlement : Virement bancaire", IBAN], "58", false],
    [["Règlement par virement : IBAN FR76 3000 4008 2200 0123 4567 834"], "58", false],
    [["Mode de règlement : Virement"], "30", true],
    [["Mode de règlement : Chèque"], "20", true],
  ] as Array<[string[], string, boolean]>)("%j → %s (pre-filled: %s)", (rows, code, prefilled) => {
    const res = extractInvoice(doc(stackedRows(40, 460, rows)))
    const means = best(res.suggestions, "payment.meansCode")
    expect(means?.value).toBe(code)
    expect((means?.confidence ?? 0) >= PREFILL_THRESHOLD).toBe(prefilled)
  })
})

describe("bilingual labels", () => {
  it.each([
    ["Facture / Invoice No.", "2026-FR-0031"],
    ["Invoice No. / Facture n°", "2026-FR-0031"],
    ["Facture / Invoice :", "2026-FR-0031"],
    ["N° de facture / Invoice number", "2026-FR-0031"],
  ])("number from %s", (label, value) => {
    const header: SynthRow[] = [[40, [[300, `${label} ${value}`]]]]
    expect(extractInvoice(doc([], { header })).draft.number).toBe(value)
  })

  it.each([
    ["Date / Date of issue : 07/10/2026", "issueDate", "2026-10-07"],
    ["Due date / Échéance : 06/11/2026", "dueDate", "2026-11-06"],
    ["Échéance / Due date : 06/11/2026", "dueDate", "2026-11-06"],
    ["Date de facture / Invoice date 07/10/2026", "issueDate", "2026-10-07"],
  ])("%s", (text, path, value) => {
    const header: SynthRow[] = [[40, [[300, text]]]]
    const res = extractInvoice(doc([], { header }))
    expect(best(res.suggestions, path)?.value).toBe(value)
  })

  it.each(["Client / Customer", "Facturé à / Bill to", "Customer / Client", "Client / Customer :"])(
    "buyer block under %s",
    (label) => {
      const parties: SynthRow[] = [
        ...stackedRows(40, 40, SELLER),
        [130, [[320, label]]],
        ...stackedRows(320, 144, BUYER),
      ]
      const res = extractInvoice(syntheticDoc([[...HEADER, ...parties, ...STANDARD_TABLE]]))
      expect(res.draft.buyer?.name).toBe("Horizon Immobilier SA")
      expect(res.suggestions.some((s) => String(s.value).includes("/ "))).toBe(false)
    },
  )
})

describe("table: summaries, subtotals and sections are not lines", () => {
  it.each([
    [
      ["Taux", "Base HT", "TVA"],
      ["20 %", "1 470,00 €", "294,00 €"],
    ],
    [
      ["Code TVA", "Base HT", "Montant TVA"],
      ["S 20 %", "1 470,00", "294,00"],
    ],
    [
      ["TVA", "Base imposable", "Montant"],
      ["20 %", "1 470,00", "294,00"],
    ],
    [
      ["Taux", "Base hors taxes", "TVA"],
      ["20,00 %", "1 470,00", "294,00"],
    ],
  ])("VAT summary %j below the items", (head, values) => {
    const table: SynthRow[] = [
      ITEM_HEADER,
      item(320, "Développement site vitrine", "3", "450,00", "1 350,00"),
      item(340, "Hébergement annuel", "1", "120,00", "120,00"),
      [
        370,
        [
          [60, head[0] ?? ""],
          [140, head[1] ?? ""],
          [230, head[2] ?? ""],
          [380, "Total HT"],
          [480, "1 470,00 €"],
        ],
      ],
      [
        385,
        [
          [60, values[0] ?? ""],
          [140, values[1] ?? ""],
          [230, values[2] ?? ""],
        ],
      ],
    ]
    const res = extractInvoice(doc([], { table }))
    expect(res.draft.lines).toHaveLength(2)
  })

  it.each(["Sous-total LOT 1", "Sous total lot 1", "Total lot 1", "Subtotal"])(
    "table goes on after %s and a section heading",
    (subtotal) => {
      const table: SynthRow[] = [
        ITEM_HEADER,
        [312, [[46, "LOT 1 - Gros oeuvre"]]],
        item(326, "Démolition de cloison", "3", "450,00", "1 350,00"),
        [
          342,
          [
            [300, subtotal],
            [480, "1 350,00 €"],
          ],
        ],
        [370, [[46, "LOT 2 - Menuiseries"]]],
        item(386, "Hébergement annuel", "1", "120,00", "120,00"),
        ...TOTALS(420, "1 470,00 €", "294,00 €", "1 764,00 €"),
      ]
      const res = extractInvoice(doc([], { table }))
      expect(res.draft.lines?.map((l) => l.name)).toEqual([
        "Démolition de cloison",
        "Hébergement annuel",
      ])
    },
  )
})

describe("discount column: the net unit price", () => {
  const discountTable = (rem: string, pu: string, total: string): SynthRow[] => [
    [
      300,
      [
        [46, "Désignation"],
        [260, "Qté"],
        [310, "P.U."],
        [370, "Rem."],
        [420, "TVA"],
        [480, "Montant HT"],
      ],
    ],
    [
      320,
      [
        [46, "Volet roulant"],
        [260, "6"],
        [310, pu],
        [370, rem],
        [420, "20 %"],
        [480, total],
      ],
    ],
  ]
  it.each([
    ["10 %", "120,00", "648,00", 108],
    ["20 %", "250,00", "1 200,00", 200],
    ["5 %", "400,00", "2 280,00", 380],
    ["12,00", "50,00", "288,00", 48],
  ])("Rem. %s on %s → %s", (rem, pu, total, net) => {
    const res = extractInvoice(doc([], { table: discountTable(rem, pu, total) }))
    const price = best(res.suggestions, "lines.0.unitPrice")
    expect(price?.value).toBe(net)
    expect(price?.confidence).toBeGreaterThanOrEqual(PREFILL_THRESHOLD)
  })

  it("only offers the net price when the printed total does not confirm it", () => {
    const res = extractInvoice(doc([], { table: discountTable("10 %", "120,00", "700,00") }))
    expect(best(res.suggestions, "lines.0.unitPrice")?.confidence).toBeLessThan(PREFILL_THRESHOLD)
  })
})

describe("wrapped descriptions and two-page tables", () => {
  const longItem = (y: number, name: string, wrap: string[]): SynthRow[] => [
    item(y, name, "1", "100,00", "100,00"),
    ...stackedRows(46, y + 12, wrap, 10).map(
      ([ry, items]) =>
        [
          ry,
          items.map((i) => (Array.isArray(i) ? { x: i[0], text: i[1], size: 8 } : i)),
        ] as SynthRow,
    ),
  ]

  it("keeps a description sentence that overflows into the number columns", () => {
    const table: SynthRow[] = [
      ITEM_HEADER,
      ...longItem(320, "Cadrage du projet", [
        "Entretiens avec les responsables de service, recensement des flux documentaires",
      ]),
      ...longItem(360, "Cartographie", ["Modélisation de la chaîne, réception et paiement."]),
      ...TOTALS(400, "200,00 €", "40,00 €", "240,00 €"),
    ]
    const res = extractInvoice(doc([], { table }))
    expect(res.draft.lines?.map((l) => l.name)).toEqual(["Cadrage du projet", "Cartographie"])
    expect(res.draft.lines?.[0]?.description).toContain("recensement des flux documentaires")
  })

  const pageOne = (rows: SynthRow[]): SynthRow[] => [...HEADER, ...PARTIES, ITEM_HEADER, ...rows]

  it.each([
    ["repeated header", true, false],
    ["no header", false, false],
    ["repeated header and a page footer", true, true],
    ["no header and a page footer", false, true],
  ])("continues on page 2 (%s)", (_label, repeatHeader, footer) => {
    const p1 = pageOne([
      ...longItem(740, "Ligne un", ["Première ligne de description,"]),
      ...longItem(770, "Ligne deux", ["description en fin de page"]),
      ...(footer ? [[820, [[200, "Page 1 / 2"]]] as SynthRow] : []),
    ])
    const p2: SynthRow[] = [
      ...(repeatHeader ? [[40, ITEM_HEADER[1]] as SynthRow] : []),
      ...longItem(60, "Ligne trois", ["Suite du tableau sur la page deux."]),
      ...TOTALS(110, "300,00 €", "60,00 €", "360,00 €"),
      ...(footer ? [[820, [[200, "Page 2 / 2"]]] as SynthRow] : []),
    ]
    const res = extractInvoice(syntheticDoc([p1, p2]))
    expect(res.draft.lines?.map((l) => l.name)).toEqual(["Ligne un", "Ligne deux", "Ligne trois"])
    expect(res.draft.lines?.[1]?.description).toBe("description en fin de page")
  })
})

describe("delivery address", () => {
  it.each(["Adresse de livraison", "Livré à", "Lieu de livraison :", "Ship to"])(
    "%s block beside the buyer",
    (label) => {
      const parties: SynthRow[] = [
        ...stackedRows(40, 40, SELLER),
        [
          130,
          [
            [320, "Facturé à"],
            [460, label],
          ],
        ],
        ...stackedRows(320, 144, BUYER),
        ...stackedRows(460, 144, ["Entrepôt Nord", "5 rue du Port", "59000 Lille"]),
      ]
      const res = extractInvoice(syntheticDoc([[...HEADER, ...parties, ...STANDARD_TABLE]]))
      expect(res.draft.buyer?.address?.city).toBe("Paris")
      expect(res.draft.deliveryAddress?.city).toBe("Lille")
      expect(res.draft.deliveryAddress?.line1).toBe("5 rue du Port")
    },
  )
})

describe("credit note reference to the original invoice", () => {
  const creditHeader: SynthRow[] = [[40, [[360, "AVOIR N° AV-2026-0007"]]]]
  it.each([
    ["Avoir sur facture n° F-2026-0231 du 02/09/2026", "F-2026-0231", "2026-09-02"],
    ["Avoir sur facture F-2026-0231 du 02/09/2026", "F-2026-0231", "2026-09-02"],
    ["Annule et remplace la facture n° 2026-118 du 15/08/2026", "2026-118", "2026-08-15"],
    ["Avoir relatif à la facture FA-77 en date du 1er juin 2026", "FA-77", "2026-06-01"],
  ])("%s", (text, number, date) => {
    const res = extractInvoice(doc([[250, [[46, text]]]], { header: creditHeader }))
    expect(res.draft.typeCode).toBe("381")
    expect(res.draft.precedingInvoice?.number).toBe(number)
    expect(res.draft.precedingInvoice?.issueDate).toBe(date)
    expect(res.draft.notes).toBeUndefined()
  })

  it("does not read an invoice's own reference as a preceding invoice", () => {
    const res = extractInvoice(doc([[250, [[46, "Avoir sur facture n° F-2026-0231"]]]]))
    expect(res.draft.precedingInvoice).toBeUndefined()
  })
})

describe("buyer reference vs order reference", () => {
  it.each([
    ["Bon de commande :", "BC-2026-3391", "orderReference"],
    ["N° de commande", "4500012345", "orderReference"],
    ["Réf. client :", "CMD-2610-17", "orderReference"],
    ["Your ref. / Votre réf. :", "PO-88412", "orderReference"],
    ["Réf. client :", "DUPONT-07", "buyerReference"],
    ["Code service :", "DAF-SERVICE-07", "buyerReference"],
    ["Service :", "DAF-SERVICE-07", "buyerReference"],
    ["Référence acheteur :", "ACH-4471", "buyerReference"],
  ])("%s %s → %s", (label, value, path) => {
    const header: SynthRow[] = [
      ...HEADER,
      [
        68,
        [
          [360, label],
          [490, value],
        ],
      ],
    ]
    const draft = extractInvoice(doc([], { header })).draft as Record<string, unknown>
    expect(draft[path]).toBe(value)
    const other = path === "orderReference" ? "buyerReference" : "orderReference"
    expect(draft[other]).toBeUndefined()
  })
})

describe("number printed under the title", () => {
  it.each([
    ["No 2026/0415", "2026/0415"],
    ["N° FAC-26-0198", "FAC-26-0198"],
    ["Nº : 2026-118", "2026-118"],
    ["# INV-0042", "INV-0042"],
  ])("%s", (text, value) => {
    const header: SynthRow[] = [
      [40, [{ x: 440, text: "FACTURE", size: 16 }]],
      [62, [[440, text]]],
      [80, [[440, "Date : 12/09/2026"]]],
    ]
    expect(extractInvoice(doc([], { header })).draft.number).toBe(value)
  })

  it("ignores a bare N° far from the title", () => {
    const header: SynthRow[] = [
      [40, [{ x: 440, text: "FACTURE", size: 16 }]],
      [400, [[40, "N° 12345"]]],
    ]
    expect(extractInvoice(doc([], { header })).draft.number).toBeUndefined()
  })
})

describe("seller identity only in the footer", () => {
  it.each([
    [
      "Menuiserie Roche SARL - 8 rue des Tanneurs, 69007 Lyon - Tél. 04 65 71 20 31",
      "SARL au capital de 10 000 € - RCS Lyon 337 812 457 - TVA FR07337812457",
    ],
    [
      "Menuiserie Roche SARL – 8 rue des Tanneurs, 69007 Lyon",
      "SIRET 337 812 457 00584 – TVA FR07337812457",
    ],
    [
      "Menuiserie Roche SARL | 8 rue des Tanneurs, 69007 Lyon | contact@roche.example",
      "RCS Lyon 337 812 457 | N° TVA FR07337812457",
    ],
    [
      "Menuiserie Roche SARL - 8 rue des Tanneurs, 69007 Lyon",
      "Capital 10 000 € - SIREN 337 812 457",
    ],
  ])("%s / %s", (first, second) => {
    const parties: SynthRow[] = [[130, [[40, "Facturé à"]]], ...stackedRows(40, 144, BUYER)]
    const footer: SynthRow[] = [
      [790, [[60, first]]],
      [801, [[60, second]]],
    ]
    const res = extractInvoice(
      syntheticDoc([[...HEADER, ...parties, ...STANDARD_TABLE, ...footer]]),
    )
    expect(res.draft.seller?.name).toBe("Menuiserie Roche SARL")
    expect(res.draft.seller?.address?.city).toBe("Lyon")
    expect(res.draft.buyer?.name).toBe("Horizon Immobilier SA")
  })
})

describe("calibration", () => {
  it("only suggests the default unit when no unit is printed", () => {
    const res = extractInvoice(doc([]))
    const unit = best(res.suggestions, "lines.1.unitCode")
    expect(unit?.value).toBe("C62")
    expect(unit?.confidence).toBeLessThan(PREFILL_THRESHOLD)
  })

  it("does not read an 'Acompte' item row as the prepaid amount", () => {
    const table: SynthRow[] = [
      ITEM_HEADER,
      item(320, "Création du site", "1", "4 800,00", "4 800,00"),
      item(340, "Acompte versé à la commande (30 %)", "1", "-1 440,00", "-1 440,00"),
      ...TOTALS(380, "3 360,00 €", "672,00 €", "4 032,00 €"),
    ]
    const res = extractInvoice(doc([], { table }))
    expect(best(res.suggestions, "prepaidAmount")).toBeUndefined()
    expect(res.draft.lines?.[1]?.quantity).toBe(-1)
    expect(res.draft.lines?.[1]?.unitPrice).toBe(1440)
  })

  it("still reads a prepaid totals row", () => {
    const rows: SynthRow[] = [
      [
        430,
        [
          [380, "Acompte versé"],
          [480, "500,00 €"],
        ],
      ],
      [
        445,
        [
          [380, "Net à payer"],
          [480, "1 264,00 €"],
        ],
      ],
    ]
    expect(extractInvoice(doc(rows)).draft.prepaidAmount).toBe(500)
  })

  it.each([
    [["Prestation de conseil", "Honoraires de mission"], "services"],
    [["Forfait audit", "Mission jours"], "services"],
    [["Vente de marchandises", "Livraison palettes"], "goods"],
    [["Pièces détachées kg", "Colis livraison"], "goods"],
  ])("operation category from %j is a suggestion only", (names, category) => {
    const table: SynthRow[] = [
      ITEM_HEADER,
      item(320, names[0] ?? "", "3", "450,00", "1 350,00"),
      item(340, names[1] ?? "", "1", "120,00", "120,00"),
      ...TOTALS(380, "1 470,00 €", "294,00 €", "1 764,00 €"),
    ]
    const res = extractInvoice(doc([], { table }))
    const s = res.suggestions.filter((x) => x.path === "operationCategory")
    expect(s[0]?.value).toBe(category)
    for (const x of s) expect(x.confidence).toBeLessThanOrEqual(0.55)
  })
})

describe("robustness", () => {
  it("handles a 200 KB adversarial text within 500 ms", () => {
    const chunks = [
      "Facture / ".repeat(2000),
      "IBAN FR76 ".repeat(2000),
      `Paiement : ${"à 30 jours ".repeat(2000)}`,
      "1 2 3 4 5 6 7 8 9 0 , . ".repeat(2000),
      `Avoir sur facture ${"n° ".repeat(3000)}`,
      "a".repeat(40_000),
      "Taux Base HT ".repeat(4000),
      "-".repeat(30_000),
    ]
    const rows: SynthRow[] = chunks.map((text, i) => [40 + i * 14, [[40, text]]])
    const adversarial = syntheticDoc([[...rows, ...HEADER, ...STANDARD_TABLE]])
    expect(adversarial.text.length).toBeGreaterThan(200_000)
    const start = performance.now()
    const res = extractInvoice(adversarial)
    expect(performance.now() - start).toBeLessThan(500)
    expect(Array.isArray(res.suggestions)).toBe(true)
  })

  it("extracts a 3-page invoice in under 50 ms", () => {
    const page = (offset: number): SynthRow[] =>
      Array.from({ length: 30 }, (_, i) =>
        item(80 + i * 22, `Article ${offset + i}`, "2", "10,00", "20,00"),
      )
    const pages = [
      [...HEADER, ...PARTIES, ITEM_HEADER, ...page(0).map(([y, r]) => [y + 220, r] as SynthRow)],
      [ITEM_HEADER, ...page(30)],
      [ITEM_HEADER, ...page(60), ...TOTALS(760, "1 800,00 €", "360,00 €", "2 160,00 €")],
    ]
    const d = syntheticDoc(pages)
    extractInvoice(d)
    const start = performance.now()
    extractInvoice(d)
    expect(performance.now() - start).toBeLessThan(50)
  })
})

describe("seller name in a letterhead beside an identifiers-only seller block", () => {
  it.each([
    ["Émetteur", "SARL au capital de 15 000 €"],
    ["Vendeur", "RCS Bordeaux 451 287 304"],
    ["Émetteur :", "SIRET : 451 287 304 00278"],
    ["Fournisseur", "Capital social 15 000 €"],
  ])("%s / %s", (label, firstLine) => {
    const parties: SynthRow[] = [
      ...stackedRows(440, 40, ["Cuisines Delmas SARL", "19 avenue Jean Jaurès", "33000 Bordeaux"]),
      [166, [[307, label]]],
      ...stackedRows(307, 180, [firstLine, "SIRET : 451 287 304 00278", "TVA : FR41451287304"]),
      [172, [[49, "Client"]]],
      ...stackedRows(49, 186, ["Mme Sophie Lambert", "22 rue Nationale", "33200 Bordeaux"]),
    ]
    const header: SynthRow[] = [[110, [[73, "Facture n° 2026-0301"]]]]
    const res = extractInvoice(syntheticDoc([[...header, ...parties, ...STANDARD_TABLE]]))
    expect(res.draft.seller?.name).toBe("Cuisines Delmas SARL")
    expect(res.draft.seller?.address?.line1).toBe("19 avenue Jean Jaurès")
    expect(res.draft.buyer?.name).toBe("Mme Sophie Lambert")
  })
})
