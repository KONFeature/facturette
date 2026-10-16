# Facturette

Turn an ordinary PDF invoice into a **Factur-X** invoice (PDF/A-3 with an embedded EN 16931 XML),
entirely in the browser. Built for French businesses preparing for the e-invoicing reform.

1. **Import** your usual PDF invoice.
2. **Check**: the text layer is read and the fields it finds are pre-filled, each with where it was
   found in the PDF and how sure the reader is. You type what is missing. Required fields are
   marked and the French mandatory mentions are checked.
3. **Download** the same PDF, visually unchanged, with `factur-x.xml` attached.

Your invoice never leaves your browser: no server, no analytics, no remote font. A
Content-Security-Policy shipped with the build makes the browser itself refuse any request to
another origin, and an end-to-end test proves it. Nothing is stored unless you tick a box (your
company, a customer) in the review step, and "Effacer mes données" wipes it.

## What it does not do

**This tool produces the file; it does not send it.** It is not a *plateforme agréée* (PA). Once the
issuing obligation applies to your company (1 September 2026 for large companies and ETI,
1 September 2027 for SMEs and micro-businesses), domestic B2B invoices must be issued and
transmitted through a PA; the DGFiP's guide states that sending a PDF by email does not satisfy
that obligation. The file produced here is in a format those platforms accept, ready to be deposited
on yours.

Also out of scope: OCR of scanned PDFs (you are told, and can fill the form by hand), deposit
invoices (type 386), multi-currency, and e-reporting of B2C sales.

## How well it works

Everything below is measured, not hoped for.

- **The output is validated, not eyeballed.** Every generated XML and PDF is checked with
  [Mustang](https://www.mustangproject.org/) (XSD + EN 16931 and French BR-FR Schematron + veraPDF
  PDF/A-3) in CI on every push: dozens of XML scenarios and PDF input classes, and a Playwright suite
  that runs the whole app against the production build and validates the file it downloads.
- **PDFs with non-embedded fonts are repaired.** FPDF, TCPDF/Dolibarr, ReportLab and pdf-lib use
  Helvetica/Times/Courier without embedding them, which makes PDF/A impossible. They are replaced by
  embedded fonts of identical widths (Arimo, Tinos, Cousine), so nothing moves.
- **Field detection is a convenience, not an oracle.** On the layouts it was developed against it
  finds ~99% of printed fields. On invoices it had never seen it started at 66% recall; after fixing a
  column-detection bug it reads about 85% of fields with ~98% precision, but that number is partly
  fitted to that set, so expect to correct some fields on unusual layouts. A pre-filled value that
  is not certain is labelled « à vérifier », and you review every field before generating.
- **Known to be weak:** fee statements (« mémoire d'honoraires »), utility bills and other layouts
  that are not an invoice table.

## Compliance decisions worth knowing

Decisions were taken against primary sources (FNFE-MPE French schematron v1.4.0.04, FNFE flash notes,
service-public.fr) and are encoded in tests.

- **BT-23** (cadre de facturation): `S1/B1/M1` normally, `x2` when the invoice is already fully paid,
  `x4` for a final invoice that references its deposit invoice.
- **Franchise en base**: category `E`, `VATEX-FR-FRANCHISE`, SIREN as legal identifier (BT-30) and as
  fiscal identifier (`FC`, BT-32). The BT-32 choice rests on a third-party quote of the paywalled
  XP Z12-012 standard: **confirm it with your platform**. Both the « art. 293 B du CGI » and the newer
  « CIBS » wording are accepted.
- **Private customers** are e-reported, not e-invoiced. The file carries `BAR = B2C`, and the 40 €
  recovery indemnity is always « non applicable » (it is owed by professionals only). The French
  schematron's BR-FR-12 warning (buyer electronic address) cannot be satisfied without a SIREN; it is
  a warning, not an error.
- **Credit notes** carry positive amounts and reference the original invoice with its number **and**
  date. A negative line (discount) is expressed as a negative quantity with a positive unit price.
- **Exemption reasons**: when several exemption regimes share an invoice, the text you type goes to
  the first one and the others get their standard wording (you are warned).

## Develop

Requires [Bun](https://bun.sh) ≥ 1.3; Java 21+ only for the conformance suite.

```sh
bun install
bun run dev            # Vite dev server
bun run verify         # typecheck + Biome + unit tests
bun run test:e2e       # Playwright against the production build (validates downloads with Mustang)
MUSTANG=1 bunx vitest run src/lib/facturx   # XML/PDF conformance with Mustang
bun scripts/validate-facturx.ts file.pdf    # validate any Factur-X file
bun scripts/eval-extraction.ts --set all    # field-detection scorecard on the fixtures
bun run build          # static site in dist/
```

Stack: Vite, React 19, TypeScript (strict), TanStack Router, Tailwind v4, zod, react-hook-form,
zustand, pdf.js, `@cantoo/pdf-lib`, Vitest, Playwright, Biome. `docs/DESIGN.md` explains the module
map and the contracts between modules; `fixtures/` holds the sample invoices and their ground truth
(three sets, two of them written blind to the extractor).

## Deploy

It is a **static site**: no server, no backend, no API. `bun run build` writes plain files to
`dist/` and everything (PDF reading, XML, PDF assembly) runs in the visitor's browser.

**GitHub Pages** is the default. Every push to `main` that passes unit tests, Mustang conformance and
the browser suite is deployed by the `deploy` job of `.github/workflows/ci.yml`, at
<https://konfeature.github.io/facturette/>. Two details come from serving a project site under
`/facturette/`:

- the build takes its base path from `BASE_PATH` (the job passes the one GitHub reports; locally it
  defaults to `/`), and the router is mounted at the same path;
- GitHub Pages answers unknown paths with `404.html`, so the job copies the app shell there and
  deep links still load.

Any other static host works too: serve `dist/` with an `index.html` fallback. `public/_headers`
holds the same Content-Security-Policy plus extra response headers (`frame-ancestors`, `nosniff`,
HSTS, ...) for hosts that read that file (Cloudflare Pages, Netlify). GitHub Pages ignores it, which
is fine: the policy that enforces "nothing leaves your browser" also ships as a `<meta>` tag inside
the page. What GitHub Pages cannot do is send `frame-ancestors`, so the page can be embedded in a
frame on another site.

## Licence

[MIT](LICENSE). Vendored assets keep their own licences, next to the files: Arimo / Tinos / Cousine
fonts (Apache-2.0), the Adobe Glyph List (BSD-3-Clause) and an sRGB ICC profile (CC0), under
`src/lib/facturx/fonts/` and `src/lib/facturx/assets/`.
