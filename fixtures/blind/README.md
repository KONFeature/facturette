# Jeu d'évaluation en aveugle (fictif)

Factures PDF « réalistes » écrites **indépendamment** de l'extracteur : mises en page et
vocabulaire inspirés d'outils et de modèles français courants, avec vérité terrain exacte.
Elles n'ont jamais servi à régler l'extraction : elles mesurent la précision hors échantillon.
**Toutes les données sont fictives** (sociétés, personnes, adresses, e-mails en `.example`,
téléphones en plages réservées). Les identifiants sont valides : SIREN/SIRET (Luhn), clé de TVA
française, IBAN (mod 97).

Fichiers (générés par `bun scripts/make-blind-fixtures.ts`, ne pas éditer à la main) :

- `Bnn-slug.pdf`, `Bnn-slug.expected.json` (type `Invoice`), `manifest.json` (même schéma que
  `fixtures/invoices/manifest.json` : `{ file, expected, printed, tags, formats, pages }`).
- Convention des avoirs : montants positifs et `typeCode: "381"` dans `expected.json`, montants
  imprimés en négatif dans le PDF.
- Lignes négatives (acompte, remise commerciale) : `unitPrice` négatif dans `expected.json`.
- Quand une remise % par ligne est imprimée (B07), `unitPrice` est le prix **net** et n'est pas listé
  dans `printed` ; le prix brut et le taux de remise sont seuls visibles.
- `formats.number.currency` : `prefix` désigne ici « €1,200.00 » (sans espace) pour B06.

### B01-dolibarr-police-standard.pdf

**Facture façon Dolibarr / TCPDF, police Helvetica non incorporée**

- Imite : Modèle PDF « crabe/azur » de Dolibarr (TCPDF, polices cœur non incorporées)
- Bloc émetteur à gauche, cartouche « Facture : … / Date facture / Date échéance / Code client », encadré « Adresse de facturation », tableau Désignation | TVA | P.U. HT | Qté | Unité | Total HT, totaux par taux, mentions légales et identité en pied de page.
- Tags : dolibarr, non-embedded-font, multi-rate, footer-identity, order-reference
- Pages : 1
- Police standard **non incorporée** (aucun FontFile)
- Formats : dates `dmy`, nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 42 / 45 (non imprimés : deliveryDate, buyer.siren, buyer.siret, buyer.vatNumber)

### B02-times-vendeur-acheteur.pdf

**Facture Times non incorporée, Vendeur / Acheteur, Reste à payer**

- Imite : Facture générée par une bibliothèque PDF (fpdf/ReportLab) avec police cœur Times
- Titre « FACTURE N° », « Émise le », « À régler avant le », blocs Vendeur / Acheteur, tableau Description | Quantité | Prix unitaire | Montant, Sous-total, TVA 20 %, Total TTC, acompte déjà réglé et Reste à payer, montants « 1.200,00 EUR ».
- Tags : non-embedded-font, deposit-prepaid, dot-thousands-code, alt-wording
- Pages : 1
- Police standard **non incorporée** (aucun FontFile)
- Formats : dates `dmy`, nombres séparateur de milliers « . », décimale « , », devise `code`
- Champs imprimés : 44 / 45 (non imprimés : deliveryDate, buyer.siret)

### B03-excel-grille-objet.pdf

**Modèle Excel avec grille, colonnes HT et TTC, ligne « Objet : »**

- Imite : Classeur Excel « modèle de facture société » exporté en PDF
- Quadrillage complet, « Objet : » sous l'en-tête, colonnes Désignation | Unité | Qté | PU HT | TVA | Total HT | Total TTC, particulier en client, TVA 10 % et 20 %.
- Tags : excel, grid, ttc-column, individual-customer, multi-rate, subject-line
- Pages : 1
- Formats : dates `dmy`, nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 46 / 46 (non imprimés : buyer.siren, buyer.siret)

### B04-lettre-word-objet.pdf

**Facture en lettre Word / LibreOffice avec Objet : et paragraphes**

- Imite : Modèle de lettre-facture Word/LibreOffice d'un consultant indépendant
- En-tête de lettre de l'émetteur (mentions légales en petit), « Le 15 octobre 2026 », « Objet : », paragraphes libres avant et après le tableau, règlement à 45 jours fin de mois.
- Tags : word, letter, date-long-fr, subject-line, terms-end-of-month
- Pages : 1
- Formats : dates `long`, nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 40 / 41 (non imprimés : buyer.siret)

### B05-saas-montant-du.pdf

**Facture SaaS moderne : gros « Montant dû » en tête, blocs gris, pied minuscule**

- Imite : Facture Stripe Billing / outil d'abonnement en français
- Grand montant dû en haut, « Numéro de facture », « Date d'émission », « Date d'échéance », blocs gris clairs, lignes avec Qté | Prix unitaire | Montant, identité légale en pied de page minuscule.
- Tags : saas, stripe-like, date-long-fr, total-top, tiny-footer
- Pages : 1
- Formats : dates `long`, nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 33 / 37 (non imprimés : seller.phone, buyer.siren, buyer.siret, buyer.vatNumber)

### B06-identite-en-pied.pdf

**Identité du vendeur uniquement dans une ligne de pied de page**

- Imite : Facture d'artisan où l'en-tête n'a qu'un logo graphique et le titre
- Aucun texte d'identité en tête : nom, adresse, forme juridique, capital, RCS, TVA, SIRET, téléphone et e-mail n'apparaissent que dans le pied (« SARL au capital de … - RCS Lyon … »). Dates ISO, montants « €1,200.00 ».
- Tags : footer-identity-only, date-iso, euro-before, number-dot-decimal, multi-rate
- Pages : 1
- Formats : dates `iso`, nombres séparateur de milliers « , », décimale « . », devise `prefix`
- Champs imprimés : 37 / 40 (non imprimés : buyer.siren, buyer.siret, buyer.vatNumber)

### B07-remises-et-lots.pdf

**Remise % par ligne, titres de lots avec sous-totaux**

- Imite : Devis/facture BTP de logiciel de gestion (Sage, Batigest)
- Colonnes Libellé | U | Qté | P.U. | Rem. | TVA | Montant HT, titres « LOT 1 / LOT 2 » avec « Sous-total », prix unitaire brut imprimé donc le prix net n'est pas visible quand une remise s'applique, échéance en clair « 30 jours fin de mois » (date non imprimée).
- Tags : discount-column, sections, subtotals, terms-end-of-month, multi-rate
- Pages : 1
- Formats : dates `dmy`, nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 45 / 53 (non imprimés : dueDate, lines.0.unitPrice, lines.1.unitPrice, lines.3.unitPrice, lines.4.unitPrice, buyer.siren, buyer.siret, buyer.vatNumber)

### B08-bilingue-fr-en.pdf

**En-tête bilingue Facture / Invoice**

- Imite : Facture d'une PME de transport avec modèle bilingue
- « Facture / Invoice No. », « Date / Date of issue », « Due date / Échéance », colonnes bilingues, totaux bilingues, montants « 1.200,00 EUR ».
- Tags : bilingual, dot-thousands-code, order-reference
- Pages : 1
- Formats : dates `dmy`, nombres séparateur de milliers « . », décimale « , », devise `code`
- Champs imprimés : 39 / 41 (non imprimés : deliveryDate, payment.termsText, buyer.siret)

### B09-avoir-facture-origine.pdf

**Avoir avec référence à la facture d'origine et montants signés**

- Imite : Avoir édité depuis Sellsy / Axonaut
- « AVOIR N° », « Avoir sur facture n° … du … », montants imprimés en négatif, bandeau coloré. La vérité terrain est en montants positifs, typeCode 381.
- Tags : credit-note, signed-amounts-printed, preceding-invoice, sellsy-like
- Pages : 1
- Formats : dates `dmy`, nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 35 / 38 (non imprimés : deliveryDate, dueDate, notes, seller.phone, buyer.siret)

### B10-solde-acompte-negatif.pdf

**Facture de solde avec ligne « Acompte » négative**

- Imite : Facture QuickBooks / Sage avec déduction d'acompte en ligne
- Réf. facture, « Date limite de paiement », ligne « Acompte versé à la commande (30 %) » à -1.440,00 € dans le tableau (prix unitaire négatif dans la vérité terrain), « Solde dû ».
- Tags : deposit, negative-line, quickbooks-like, dot-thousands
- Pages : 1
- Formats : dates `dmy`, nombres séparateur de milliers « . », décimale « , », devise `suffix`
- Champs imprimés : 39 / 40 (non imprimés : buyer.siret)

### B11-freelance-rib.pdf

**Indépendant en franchise en base, bloc « Coordonnées bancaires (RIB) »**

- Imite : Facture Indy / Henrri / Facture.net d'un micro-entrepreneur
- Mention « TVA non applicable, art. 293 B du CGI », unités j / h / forfait, IBAN par groupes de 4 et BIC dans un bloc RIB, SIRET seul (pas de TVA, SIREN dérivé).
- Tags : freelance, franchise-tva, category-E, rib-block, units-h-j
- Pages : 1
- Formats : dates `dmy`, nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 33 / 38 (non imprimés : seller.siren, buyer.siren)

### B12-deux-pages-descriptions.pdf

**Deux pages, descriptions longues, totaux en dernière page**

- Imite : Facture Pennylane / Axonaut d'un prestataire de services
- Quatorze lignes avec désignation et description sur plusieurs lignes, quantités « 1,00 », totaux uniquement en page 2, numérotation « Page 1/2 ».
- Tags : multi-page, long-descriptions, line-description, buyer-reference, order-reference
- Pages : 2
- Formats : dates `dmy`, nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 102 / 102 (non imprimés : aucun)

### B13-destinataire-en-premier.pdf

**Destinataire au-dessus de l'émetteur, livraison à une autre adresse**

- Imite : Facture d'un grossiste alimentaire (ERP), bloc client en tête
- Blocs « Adresse de facturation » et « Adresse de livraison » distincts en haut, émetteur dessous, N° de commande, ligne « Remise commerciale » négative, unités kg / L.
- Tags : buyer-first, delivery-address, negative-line, multi-rate, order-reference
- Pages : 1
- Formats : dates `dmy`, nombres séparateur de milliers «   », décimale « , », devise `suffix`
- Champs imprimés : 53 / 54 (non imprimés : buyer.siret)
