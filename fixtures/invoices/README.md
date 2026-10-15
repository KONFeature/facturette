# Factures de test (fictives)

Corpus de factures PDF « classiques » avec vérité terrain exacte, pour évaluer l'extraction et
tester le flux complet. **Toutes les données sont fictives** (sociétés, personnes, coordonnées
inventées ; numéros de téléphone en plages réservées à la fiction, e-mails en `.example`).
Les identifiants sont néanmoins valides : SIREN/SIRET (Luhn), clé de TVA française, IBAN (mod 97).

Fichiers (générés par `bun scripts/make-fixtures.ts`, ne pas éditer à la main) :

- `NN-slug.pdf` : la facture ;
- `NN-slug.expected.json` : vérité terrain au format `Invoice` (`src/domain/invoice.ts`) ;
- `manifest.json` : pour chaque fixture `{ file, expected, printed, tags, formats, pages }`.
  `printed` liste les chemins de l'`Invoice` réellement **visibles comme texte** dans le PDF ;
  les autres champs existent dans `expected.json` mais l'utilisateur devrait les saisir.
  Les codes (type, devise, catégorie de TVA, code unité, moyen de paiement, pays) ne sont jamais
  listés : ils ne sont pas imprimés tels quels.

Convention des avoirs : `expected.json` contient des montants positifs et `typeCode: "381"` ;
le PDF imprime les montants en négatif (tag `signed-amounts-printed`). EN 16931 BR-27 interdit un
prix unitaire négatif : l'extraction doit normaliser le signe (valeurs absolues + type 381) quand
elle détecte un avoir. Aucun `expected.json` ne contient de quantité ou de prix négatif.

### 01-freelance-franchise-tva.pdf

**Freelance en franchise en base de TVA**. Micro-entrepreneur, pas de numéro de TVA, une seule ligne, mention art. 293 B du CGI, TVA à 0 (catégorie E). Mise en page minimaliste. Le SIREN du client est imprimé, ses coordonnées bancaires aussi.

- Tags : freelance, franchise-tva, single-line, category-E, no-vat-number
- Pages : 1
- Champs imprimés : 30 / 33 (non imprimés : buyer.email, deliveryDate)

### 02-sarl-trois-lignes.pdf

**SARL, 3 lignes à 20 %, RIB en pied de page**. SARL classique : capital, RCS, TVA intracommunautaire, trois lignes à 20 %, coordonnées bancaires en pied de page, mentions légales de pénalités. Montants au format 1 234,56 € (espace fine insécable).

- Tags : sarl, vat-20, three-lines, bank-footer, legal-notes, format-fr-nnbsp
- Pages : 2
- Champs imprimés : 43 / 43 (non imprimés : aucun)

### 03-multi-taux-tva.pdf

**TVA multi-taux 20 / 10 / 5,5 % avec récapitulatif**. Traiteur : trois taux de TVA et un tableau récapitulatif de TVA (taux, base HT, montant). Typographie à empattements.

- Tags : multi-rate, vat-summary-table, goods, vat-20, vat-10, vat-5.5
- Pages : 1
- Champs imprimés : 47 / 47 (non imprimés : aucun)

### 04-deux-pages.pdf

**Facture de deux pages, totaux en page 2**. 46 lignes d'articles : le tableau déborde sur la page 2 où figurent les totaux, les coordonnées bancaires et les mentions légales. L'en-tête du tableau se répète.

- Tags : multi-page, long-table, totals-on-page-2, vat-20, goods
- Pages : 2
- Champs imprimés : 200 / 200 (non imprimés : aucun)

### 05-avoir.pdf

**Avoir avec renvoi à la facture d'origine**. Avoir (type 381) : montants imprimés en négatif, mention « Avoir sur facture F-2026-0412 du 12/09/2026 ». Convention retenue pour la vérité terrain : quantités et prix positifs dans expected.json, le type 381 porte le signe (convention EN 16931).

- Tags : credit-note, signed-amounts-printed, negative-amounts, reference-original-invoice, vat-20
- Pages : 1
- Champs imprimés : 34 / 35 (non imprimés : deliveryDate)

### 06-client-particulier.pdf

**Client particulier (sans SIREN)**. Plombier facturant un particulier, TVA à 10 % (travaux de rénovation). L'acheteur est de type « individual », sans SIREN ni TVA.

- Tags : individual-customer, no-buyer-siren, vat-10, services
- Pages : 1
- Champs imprimés : 35 / 36 (non imprimés : deliveryDate)

### 07-libelles-alternatifs.pdf

**Libellés alternatifs, vendeur en haut à droite**. Bloc vendeur en haut à droite avec pastille de logo ; libellés « Facturé à », « Destinataire » (adresse de livraison), « N° de facture », « Date d'émission », « À régler avant le », « Net à payer ». Le SIREN de l'acheteur n'est pas imprimé.

- Tags : alt-wording, seller-top-right, logo-header, delivery-address, buyer-siren-hidden
- Pages : 1
- Champs imprimés : 43 / 44 (non imprimés : buyer.siren)

### 08-formats-iso-point.pdf

**Dates ISO et montants « 1234.56 EUR »**. Dates au format 2026-10-01, montants sans séparateur de milliers avec point décimal et code devise après : 1234.56 EUR. Style « outil de facturation anglo-saxon ».

- Tags : date-iso, number-dot-decimal, currency-code, services, format-variant
- Pages : 1
- Champs imprimés : 38 / 38 (non imprimés : aucun)

### 09-formats-date-longue.pdf

**Date « 1er octobre 2026 » et montants « 1.234,56 € »**. Dates en toutes lettres (1er octobre 2026), séparateur de milliers en point et virgule décimale : 1.234,56 €.

- Tags : date-long-fr, number-dot-thousands, euro-after, format-variant, services
- Pages : 1
- Champs imprimés : 36 / 37 (non imprimés : buyer.vatNumber)

### 10-heures-jours-decimaux.pdf

**Heures et jours décimaux, description sur seconde ligne**. Quantités décimales (7,5 h ; 3,25 jours ; 0,5 jour), unités heure/jour, chaque ligne a une description sur une seconde ligne de texte. Montants préfixés par le symbole : € 1 234,56.

- Tags : decimal-quantities, hours, days, line-description, euro-before, format-variant
- Pages : 1
- Champs imprimés : 45 / 45 (non imprimés : aucun)

### 11-acompte-deja-verse.pdf

**Acompte déjà versé**. Facture de solde : total TTC 4 320,00 €, acompte de 1 500,00 € déjà payé, net à payer 2 820,00 €.

- Tags : deposit, prepaid, amount-due-differs, vat-20, goods
- Pages : 1
- Champs imprimés : 40 / 40 (non imprimés : aucun)

### 12-image-seule-sans-texte.pdf

**PDF image seule (aucune couche texte)**. Cas négatif : la facture est rendue en image puis intégrée dans un PDF sans texte (équivalent d'un scan). L'extraction doit détecter l'absence de texte. Le manifeste déclare printed = [] car rien n'est extractible sans OCR.

- Tags : no-text-layer, scanned, negative-case, vat-20
- Pages : 1
- Champs imprimés : 0 / 37 (non imprimés : aucun)

### 13-pdflib-helvetica.pdf

**PDF pdf-lib, Helvetica standard non incorporée**. Produit avec pdf-lib seul : police Helvetica standard (non incorporée), mise en page sommaire. Mauvais candidat PDF/A (police non incorporée) : sert à tester le contrôle préalable et la conversion.

- Tags : pdf-lib, non-embedded-font, poor-pdfa-candidate, vat-20
- Pages : 1
- Champs imprimés : 32 / 37 (non imprimés : buyer.siren, buyer.siret, buyer.vatNumber, seller.email, seller.phone)
