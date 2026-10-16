# Deuxième jeu d'évaluation en aveugle (fictif)

Factures PDF « réalistes » écrites **indépendamment** de l'extracteur et **différentes** des jeux
`fixtures/invoices` et `fixtures/blind` (mises en page, vocabulaire, montants, identifiants). Ce jeu
n'a jamais servi à régler l'extraction : c'est le test hors échantillon, à ne lancer qu'après le
réglage sur les deux autres jeux.
**Toutes les données sont fictives** (sociétés, personnes, adresses, e-mails en `.example`,
téléphones en plages réservées). Les identifiants sont valides : SIREN/SIRET (Luhn), clé de TVA
française, IBAN (mod 97).

Fichiers (générés par `bun scripts/make-blind2-fixtures.ts`, ne pas éditer à la main) :

- `Cnn-slug.pdf`, `Cnn-slug.expected.json` (type `Invoice`), `manifest.json` (même schéma que
  `fixtures/blind/manifest.json` : `{ file, expected, printed, tags, formats, pages }`).
- **Nouveauté de `formats.date`** : en plus de `dmy`, `iso`, `long`, ce jeu utilise `dot`
  (15.10.2026), `dash` (15-10-2026), `slash-iso` (2026/10/15), `abbr` (15 oct. 2026),
  `weekday-long` (lundi 5 octobre 2026) et `dmy-short` (15/10/26). `long` écrit « 1er » pour le 1.
- `formats.number.thousands` peut valoir une espace insécable (U+00A0) ou fine insécable (U+202F).
- C05 imprime les montants entiers sans décimales (« 2 835 € ») : ce n'est pas décrit dans
  `formats`, seulement ici.
- Convention des avoirs : montants positifs et `typeCode: "381"` dans `expected.json`, montants
  imprimés en négatif dans le PDF.
- Lignes négatives (remise, code promo) : `unitPrice` négatif dans `expected.json`.
- Facture de situation (C04) : `unitPrice` = montant de la situation, quantité 1 non imprimée
  (listée dans les champs non imprimés).
- Prélèvement (C08) : aucun IBAN imprimé (celui du client), donc aucun `payment.iban` attendu.

### C01-odoo-titre-numero.pdf

**Facture N° dans le titre, vendeur aligné à droite, en-tête à trois colonnes**

- Imite : Rapport de facture Odoo / modèle LibreOffice (logo à gauche, bloc vendeur à droite)
- Titre « Facture N° 2026-0457 », trois colonnes Date / Échéance / Livraison, communication de paiement, dates 15.10.2026, espace fine insécable pour les milliers.
- Tags : odoo, title-number, right-aligned-seller, three-column-header, logo-placeholder, payment-reference, delivery-date, mixed-vat
- Pages : 1
- Formats : dates `dot` (ex. 05.10.2026), nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 47 / 48 (non imprimés : buyer.siret)

### C02-memoire-honoraires.pdf

**Mémoire d'honoraires d'avocat, quantités avec unité (3 h, 0,5 j), provision reçue**

- Imite : Mémoire d'honoraires de cabinet d'avocats (Word, papier à en-tête)
- Titre « MÉMOIRE D'HONORAIRES N° … », dates « lundi 5 octobre 2026 », provision déduite, mention d'affaire en note.
- Tags : memoire-honoraires, qty-with-unit, deposit, weekday-date, law-firm, notes
- Pages : 1
- Formats : dates `weekday-long` (ex. lundi 5 octobre 2026), nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 46 / 47 (non imprimés : buyer.siret)

### C03-note-honoraires-standard.pdf

**Note d'honoraires de consultant, polices standard non incorporées**

- Imite : Note d'honoraires générée par une bibliothèque PDF (Helvetica 14 polices standard)
- Numéro F2026-00457, dates 2026/10/15, montants 1200.00 sans séparateur de milliers, jours « 2.5 j ».
- Tags : note-honoraires, non-embedded-font, qty-with-unit, slash-iso-date, dot-decimal, delivery-date
- Pages : 1
- Police standard **non incorporée** (aucun FontFile)
- Formats : dates `slash-iso` (ex. 2026/10/05), nombres séparateur de milliers «  », décimale « . », devise `code`
- Champs imprimés : 42 / 42 (non imprimés : aucun)

### C04-situation-btp-autoliquidation.pdf

**Facture de situation BTP avec autoliquidation de la TVA**

- Imite : Facture de situation d'un logiciel de gestion BTP (Batigest / EBP Bâtiment)
- Colonnes marché, % d'avancement, cumul, précédent, situation ; TVA en autoliquidation (art. 283-2 nonies), format 1.200,00 EUR, dates 13-10-2026.
- Tags : situation, autoliquidation, btp, dot-thousands, currency-code, dash-date, quantity-not-printed
- Pages : 1
- Formats : dates `dash` (ex. 05-10-2026), nombres séparateur de milliers « . », décimale « , », devise `code`
- Champs imprimés : 36 / 43 (non imprimés : buyer.siret, lines.0.quantity, lines.1.quantity, lines.2.quantity)

### C05-facture-acompte-particulier.pdf

**Facture d'acompte à un particulier, montants entiers « 2 835 € »**

- Imite : Facture d'acompte d'un cuisiniste (Sellsy / Axonaut), paiement par chèque
- Titre « FACTURE D'ACOMPTE », client particulier sans SIREN, montants entiers sans décimales, TVA 10 %.
- Tags : acompte, individual-buyer, trim-zeros, cheque, long-date
- Pages : 1
- Formats : dates `long` (ex. 5 octobre 2026), nombres séparateur de milliers «   », décimale « , », devise `suffix`, montants entiers sans décimales
- Champs imprimés : 29 / 29 (non imprimés : aucun)

### C06-avoir-times-standard.pdf

**Avoir sur facture FA/2026/457, polices Times non incorporées**

- Imite : Avoir de logiciel de caisse / ERP maison (FPDF, Times)
- Numéro AV/2026/012, facture d'origine FA/2026/457 du 02/10/2026, montants imprimés en négatif.
- Tags : credit-note, non-embedded-font, right-aligned-seller, slash-number
- Pages : 1
- Police standard **non incorporée** (aucun FontFile)
- Formats : dates `dmy` (ex. 05/10/2026), nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 35 / 38 (non imprimés : buyer.siret, payment.iban, payment.bic)

### C07-saas-abonnement-eur.pdf

**Abonnement SaaS, anglais-style 1,200.00 EUR, remise négative, QR de paiement**

- Imite : Facture d'abonnement type Stripe / PayPal, mise en page aérée sans cadre
- Numéro 2026-10-0457, dates « 15 oct. 2026 », ligne de remise négative, bloc QR en pied.
- Tags : saas, abbr-date, negative-line, qr-placeholder, comma-thousands, payment-reference
- Pages : 1
- Formats : dates `abbr` (ex. 5 oct. 2026), nombres séparateur de milliers « , », décimale « . », devise `code`
- Champs imprimés : 44 / 45 (non imprimés : buyer.siret)

### C08-energie-prelevement.pdf

**Facture d'énergie : abonnement à 5,5%, kWh, prélèvement automatique sans IBAN**

- Imite : Facture d'électricité professionnelle (fournisseur d'énergie), bandeau « Montant à payer »
- Quantités en kWh (1 842 kWh), prix unitaires à 4 décimales, TVA « 5,5% » collée, prélèvement : aucune coordonnée bancaire imprimée.
- Tags : utility, kwh, direct-debit, no-iban, vat-55, tight-percent, mixed-vat
- Pages : 1
- Formats : dates `dmy` (ex. 05/10/2026), nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 43 / 46 (non imprimés : buyer.siret, payment.iban, payment.bic)

### C09-garage-acquittee.pdf

**Facture de garage acquittée (filigrane ACQUITTÉE), client particulier**

- Imite : Facture d'atelier automobile imprimée depuis un logiciel DMS (Helvetica standard)
- Filigrane « ACQUITTÉE » en diagonale, véhicule en note, réglée par carte, pas d'échéance, litres « 4,5 L ».
- Tags : garage, watermark, non-embedded-font, individual-buyer, no-due-date, qty-with-unit, notes
- Pages : 1
- Police standard **non incorporée** (aucun FontFile)
- Formats : dates `dash` (ex. 05-10-2026), nombres séparateur de milliers «  », décimale « , », devise `suffix`
- Champs imprimés : 37 / 37 (non imprimés : aucun)

### C10-deux-pages-entete-repete.pdf

**Deux pages, tableau avec en-tête répété sur la page 2**

- Imite : Facture de négoce issue de Sage / Cegid (références, remises de gestion, reports)
- 46 lignes, l'en-tête du tableau est répété en page 2, totaux uniquement en page 2, dates 2026-10-09.
- Tags : multi-page, repeated-header, iso-date, public-buyer, buyer-reference, many-lines
- Pages : 2
- Formats : dates `iso` (ex. 2026-10-05), nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 318 / 318 (non imprimés : aucun)

### C11-deux-pages-sans-entete.pdf

**Deux pages, tableau SANS en-tête répété sur la page 2**

- Imite : Feuille Excel / LibreOffice Calc « modèle de facture » imprimée sur deux pages
- 44 lignes de sessions de formation, aucun en-tête de colonnes en page 2, dates à deux chiffres d'année 09/10/26.
- Tags : multi-page, no-repeated-header, excel, short-year-date, many-lines
- Pages : 2
- Formats : dates `dmy-short` (ex. 05/10/26), nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 205 / 205 (non imprimés : aucun)

### C12-boutique-trois-adresses.pdf

**Facture e-commerce avec vendeur, facturation et livraison en trois colonnes**

- Imite : Facture de boutique en ligne (WooCommerce / Shopify), code promo négatif
- Trois blocs d'adresses côte à côte dont une livraison distincte, code promo en ligne négative, TVA 5,5 % et 20 %.
- Tags : shop, multi-column-address, delivery-address, negative-line, mixed-vat, abbr-date, ampersand
- Pages : 1
- Formats : dates `abbr` (ex. 5 oct. 2026), nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 53 / 54 (non imprimés : buyer.siret)

### C13-micro-rib-logo-qr.pdf

**Micro-entrepreneur en franchise de TVA, bloc RIB détaillé, logo et QR factices**

- Imite : Modèle Henrri / Facture.net d'un indépendant, pied de page en trois colonnes
- Mention art. 293 B, vendeur sans numéro de TVA, 4 200 mots à 0,09 €, bloc RIB avec code banque, code guichet, clé.
- Tags : franchise-tva, rib-block, logo-placeholder, qr-placeholder, footer-three-columns, no-vat-number, dot-date
- Pages : 1
- Formats : dates `dot` (ex. 05.10.2026), nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 36 / 39 (non imprimés : aucun)

### C14-noms-longs-duplicata.pdf

**Noms très longs avec accents, apostrophes, esperluette, guillemets, tampon DUPLICATA**

- Imite : Facture d'artisan chauffagiste à un syndic de copropriété, TVA sur les débits
- Raison sociale et client sur plusieurs lignes, « 1er octobre 2026 », tampon incliné, mention TVA sur les débits.
- Tags : long-names, accents, apostrophes, ampersand, stamp, vat-on-debits, long-date, buyer-reference, address-line2
- Pages : 1
- Formats : dates `long` (ex. 5 octobre 2026), nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 49 / 49 (non imprimés : aucun)
