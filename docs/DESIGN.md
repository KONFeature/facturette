# Facturette: design brief

Read this fully before touching code. It is the contract between parallel workers.

## Product

A 100 % client-side SPA for French users who already have an ordinary PDF invoice and need it as a
compliant **Factur-X** invoice (PDF/A-3 with an embedded CII XML), as required by the French
e-invoicing reform (reception obligatory since 1 Sept 2026 for everyone; issuing obligation phased
in: large/mid companies 2026, small/micro 2027).

User flow (single linear wizard; state is kept in memory only. Nothing is written to localStorage
unless the user ticks a box in the review step: saved company profile, saved customers, and with
the profile the last invoice number. No draft is ever persisted):

1. **Import**: drop/select a classic PDF invoice.
2. **Extract**: read the PDF text layer (pdf.js) and heuristically detect fields.
3. **Review & fill**: a form (PDF preview beside it) pre-filled with detected values. Each detected
   value shows its confidence and its source snippet in the PDF; low-confidence values are offered
   as one-click suggestions rather than pre-filled. The user types what is missing. Seller profile,
   payment details, legal texts and customers can be saved to localStorage and reused.
   Required fields are marked; the "build" action is enabled only when validation has no error.
4. **Build & download**: generate `factur-x.xml` (EN 16931), embed it into the *original* PDF
   (visual untouched), offer the download, and show a short recap (totals, profile, checks).

**Privacy is a feature**: no network request at runtime (no CDN fonts, no analytics, no remote
workers/wasm). Invoices contain personal and financial data. The imported PDF is never persisted.

Out of scope for v1: OCR of scanned PDFs (detect and tell the user), sending/transmitting the
invoice to a PDP / Chorus Pro, multi-currency, user accounts, i18n (UI copy is **French only**).

## Stack and conventions

Bun, Vite, React 19, TypeScript strict, TanStack Router (file-based, `src/routes`), Tailwind v4,
zod 4, decimal.js, react-hook-form, zustand, pdfjs-dist, @cantoo/pdf-lib, vitest, Playwright, Biome.

- Code, identifiers, comments, commit messages: **English**. UI copy and validation messages: **French**.
- Biome is the formatter/linter: `bun run check:fix`. No `any`, no non-null assertions to silence
  the compiler, no `// @ts-ignore`.
- `bun run verify` (typecheck + biome + unit tests) must pass before you hand off.
- Unit tests sit next to the code: `src/**/foo.test.ts`. Pure functions get tests; prefer real
  fixtures over mocks. Node-only helpers go in `scripts/` or test files (the app tsconfig has no
  Node types).
- Money/quantities: only through `src/domain/totals.ts` (decimal.js). Never `+` on amounts.
- Accessibility: labels bound to inputs, visible focus, keyboard-operable, `aria-live` for
  async status/errors, colour is never the only signal. Respect `prefers-reduced-motion`.
- Do **not** add dependencies without need. All deps below are already installed. If you truly need
  one, `bun add` it and list it in your handoff (the parent reconciles `package.json`/`bun.lock`).

## Module map and ownership

Each lane owns **only** its paths. Never edit `src/domain/*`, `docs/*`, `package.json`,
`bun.lock`, configs, or another lane's files. If a contract blocks you, work around it inside your
own files and describe the needed change in your handoff.

| Lane | Owns | Contract (stub exists today, keep signatures) |
|---|---|---|
| (parent) | `src/domain/*`, `docs/*`, configs, `scripts/validate-facturx.ts` | `Invoice`, `InvoiceDraft`, `computeTotals` |
| `pdf-text` | `src/lib/pdf/*` | `extractPdfText(bytes) → PdfTextDocument` |
| `extract` | `src/lib/extract/*`, `scripts/eval-extraction.ts` | `extractInvoice(doc, opts?) → ExtractionResult` |
| `validation` | `src/lib/validation/*` | `validateInvoice(draft)`, `requiredPaths(draft)` |
| `facturx-xml` | `src/lib/facturx/xml*`, `src/lib/facturx/fixtures/*` | `buildFacturXXml(invoice, opts?) → string` |
| `facturx-pdf` | `src/lib/facturx/embed*`, `src/lib/facturx/assets/*` | `embedFacturX(pdf, xml, opts)`, `preflightPdf(pdf)` |
| `storage` | `src/lib/storage/*` | load/save profile, customers, draft, invoice number |
| `fixtures` | `fixtures/invoices/*`, `scripts/make-fixtures.*` | sample PDFs + `*.expected.json` ground truth |
| `ui-shell` | `src/app/*`, `src/components/ui/*`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/done.tsx`, `src/styles.css`, `index.html` | store, theme, import + download steps |
| `ui-review` | `src/routes/review.tsx`, `src/components/review/*` | the review & fill form |

Data flow between modules:

```
PDF bytes ──extractPdfText──▶ PdfTextDocument ──extractInvoice──▶ ExtractionResult(draft, suggestions)
                                                                         │
user edits (InvoiceDraft) ◀──────────────── form + storage prefill ◀─────┘
        │ validateInvoice → ValidationReport (ready?)
        ▼
invoiceSchema.parse → Invoice ──buildFacturXXml──▶ XML ──embedFacturX(originalPdf, xml)──▶ Factur-X PDF
```

## Factur-X facts and decisions

- Target profile: **EN 16931** (default). `BASIC` is allowed. MINIMUM and BASIC WL are not valid
  invoices for the French reform: never offer them.
- Syntax: UN/CEFACT CII D16B. Attachment name: `factur-x.xml`. Guideline id (BT-24) for EN 16931 is
  `urn:cen.eu:en16931:2017`; for BASIC `urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic`.
- The PDF must be PDF/A-3 (level B): XMP with `pdfaid:part=3`, an embedded-file spec with
  `/AFRelationship`, `/AF` in the catalog, the Factur-X XMP extension schema (`fx:DocumentType`,
  `fx:DocumentFileName`, `fx:Version`, `fx:ConformanceLevel`), an sRGB output intent when device
  colours are used. **Verify every detail against the validator, not against memory.**
- French identifiers in CII: SIREN as legal registration id (BT-30/BT-47, scheme `0002`), SIRET as
  seller/buyer identifier (scheme `0009`), VAT number with scheme `VA`.
- Electronic addresses BT-34 / BT-49 (`URIUniversalCommunication/URIID`): `party.electronicAddress`
  (scheme `0225` = French annuaire, value `SIREN`, `SIREN_SIRET` or `SIREN_suffix`). When it is
  blank the builder writes the bare SIREN; extraction pre-fills that SIREN at 0.62 ("à vérifier")
  and validation warns, so the guess is never silent. None for a private customer.
- Free-text French legal mentions travel as `IncludedNote` with Factur-X subject codes (e.g. `PMD`
  late-payment penalties, `PMT` recovery fee, `AAB` early-payment discount, `REG`/`ABL` legal
  identity). Confirm codes against the Factur-X spec / validator.
- Franchise en base (art. 293 B CGI): category `E`, reason text `TVA non applicable, art. 293 B du CGI`,
  exemption reason code `VATEX-FR-FRANCHISE`.

### The acceptance oracle

```
bun scripts/validate-facturx.ts <file.xml|file.pdf> [--json]    # exit 0 = VALID, 1 = INVALID
```

It wraps the Mustang CLI (Java, downloaded once to `.tools/`): XSD + EN 16931/Factur-X Schematron +
arithmetic recalculation for XML, and PDF/A-3 conformance (veraPDF) for PDFs. **"Valid" from this
tool is the definition of done** for anything that emits XML or PDF.

## French mandatory mentions (what `validation` must enforce)

Art. L441-9 Code de commerce, art. 242 nonies A CGI, plus the reform additions (decree 2022-1299):

- Seller: name, address, **SIREN/SIRET**, **VAT number** (unless VAT-exempt), legal form and share
  capital (companies), RCS/RM registration.
- Buyer: name, address, **SIREN** (reform; not for `kind: "individual"`), buyer VAT number only for
  reverse charge.
- Invoice number (unique, sequential), issue date, **delivery / service date** (if different from
  issue date, otherwise issue date is acceptable), **operation category** (goods/services/mixed),
  **VAT on debits** option when chosen, **delivery address** when different from the buyer's.
- Per line: designation, quantity, unit, net unit price, VAT rate. Totals excl. VAT, VAT per rate,
  incl. VAT, amount due.
- Payment: due date and terms, **late-payment penalty rate**, **40 € recovery fee**, early-payment
  discount conditions (or "pas d'escompte"). Bank details when paying by transfer.
- VAT exemption: the legal reason text whenever a line is not category `S`.
- Identifier checksums: SIREN/SIRET Luhn (with the La Poste exception for SIREN 356000000), French
  VAT key (`(12 + 3 × (SIREN mod 97)) mod 97`), IBAN mod 97.

Validation messages are French, short, and say what to do ("Renseignez le SIRET du client").
Errors block the build; warnings never do.

## Lane protocol (workers)

1. You run in an isolated git worktree. First command: `bun install` (fast, cached).
2. Read this file, then the stub files for your contract. Stay inside your paths.
3. Work test-first where the logic is pure. Run `bun run verify` often.
4. Commit on your branch with a conventional message (`feat(scope): …`) when green.
5. Final message = handoff: changed files, what works, how you verified (commands + results,
   including validator output when applicable), deps added, open issues/risks, decisions the
   parent must take. Be factual: say what you did **not** verify.
6. Network is allowed at *dev time* (specs, samples, fonts to vendor). Nothing may call the
   network at *runtime*. Vendored third-party files need a permissive licence and a note in your
   handoff.
