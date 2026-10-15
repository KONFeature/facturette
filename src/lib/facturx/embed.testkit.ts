/**
 * Test-only builders for the embed tests (unit + conformance). Pure pdf-lib, no Node APIs.
 * Not imported by application code.
 */
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  type PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  rgb,
  StandardFonts,
} from "@cantoo/pdf-lib"
import { SRGB_ICC_BASE64 } from "./assets/srgb-icc"

export const N = (name: string) => PDFName.of(name)

export const TEST_INVOICE = {
  number: "FA-2026-0042",
  issueDate: "2026-10-15",
  sellerName: "Atelier Dupont SAS",
} as const

function iccBytes(): Uint8Array {
  return Uint8Array.from(atob(SRGB_ICC_BASE64), (c) => c.charCodeAt(0))
}

/** Class (3): text drawn with the non-embedded standard Helvetica font. */
export async function makeHelveticaPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595.28, 841.89])
  page.drawText("Facture FA-2026-0042", {
    x: 50,
    y: 780,
    size: 20,
    font,
    color: rgb(0.1, 0.3, 0.5),
  })
  page.drawText("Total TTC : 1 800,00 EUR", { x: 50, y: 740, size: 12, font })
  return doc.save()
}

const OLD_XMP = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" pdfaid:part="1" pdfaid:conformance="B"/>
    <rdf:Description rdf:about="" xmlns:acme="http://example.com/acme/1.0/">
      <acme:Department>Comptabilite</acme:Department>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Ancien titre</rdf:li></rdf:Alt></dc:title>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`

export interface DecorateOptions {
  /** Existing XMP packet claiming PDF/A-1b, with a property of an undeclared schema. */
  xmp?: boolean
  /** Existing output intent: `pdfa` (GTS_PDFA1, sRGB) or `pdfx` (GTS_PDFX, same profile). */
  outputIntent?: "pdfa" | "pdfx"
  /** Existing attachment (default `notes.txt`) with no /AFRelationship, /UF or MIME subtype. */
  attachment?: boolean | string
  /** Document-level JavaScript (OpenAction + names tree). */
  javascript?: boolean
  /** A signed signature field. */
  signature?: boolean
  /** A transparency group on the first page. */
  transparency?: boolean
  /** An AcroForm with an XFA entry and one text field. */
  form?: boolean
  /** Old Info entries (Keywords, custom key) that have no XMP counterpart. */
  info?: boolean
  /** Extra uncompressed stream of this many bytes (size checks). */
  paddingBytes?: number
}

/** Add pre-existing structures to a PDF, the way other producers leave them. */
export async function decoratePdf(pdf: Uint8Array, opts: DecorateOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false })
  const ctx = doc.context
  const catalog = doc.catalog
  if (opts.xmp) {
    const stream = ctx.stream(new TextEncoder().encode(OLD_XMP), {
      Type: "Metadata",
      Subtype: "XML",
    })
    catalog.set(N("Metadata"), ctx.register(stream))
  }
  if (opts.outputIntent) {
    const profile = ctx.register(ctx.flateStream(iccBytes(), { N: 3 }))
    const intent = ctx.obj({
      Type: "OutputIntent",
      S: opts.outputIntent === "pdfa" ? "GTS_PDFA1" : "GTS_PDFX",
      OutputConditionIdentifier: PDFString.of("sRGB"),
      DestOutputProfile: profile,
    })
    catalog.set(N("OutputIntents"), ctx.obj([ctx.register(intent)]))
  }
  if (opts.attachment) {
    const fileName = typeof opts.attachment === "string" ? opts.attachment : "notes.txt"
    const file = ctx.register(
      ctx.flateStream(new TextEncoder().encode("Notes internes"), { Type: "EmbeddedFile" }),
    )
    const spec = ctx.register(
      ctx.obj({ Type: "Filespec", F: PDFString.of(fileName), EF: { F: file } }),
    )
    const names = ctx.obj({ EmbeddedFiles: { Names: [PDFString.of(fileName), spec] } })
    catalog.set(N("Names"), ctx.register(names))
  }
  if (opts.javascript) {
    const action = ctx.obj({ S: "JavaScript", JS: PDFString.of("app.alert('x')") })
    catalog.set(N("OpenAction"), ctx.register(action))
    const names = catalog.lookupMaybe(N("Names"), PDFDict) ?? ctx.obj({})
    names.set(
      N("JavaScript"),
      ctx.obj({
        Names: [
          PDFString.of("init"),
          ctx.register(ctx.obj({ S: "JavaScript", JS: PDFString.of("1") })),
        ],
      }),
    )
    if (!catalog.has(N("Names"))) catalog.set(N("Names"), ctx.register(names))
  }
  if (opts.signature || opts.form) {
    const fields: PDFObject[] = []
    if (opts.signature) {
      const sig = ctx.register(
        ctx.obj({
          Type: "Sig",
          Filter: "Adobe.PPKLite",
          SubFilter: "adbe.pkcs7.detached",
          Contents: PDFHexString.of("00"),
        }),
      )
      fields.push(ctx.register(ctx.obj({ FT: "Sig", T: PDFString.of("Signature1"), V: sig })))
    }
    if (opts.form) fields.push(ctx.register(ctx.obj({ FT: "Tx", T: PDFString.of("Nom") })))
    const acroForm = ctx.obj({ Fields: fields })
    if (opts.form) acroForm.set(N("XFA"), ctx.register(ctx.stream("<xdp:xdp/>")))
    catalog.set(N("AcroForm"), ctx.register(acroForm))
  }
  if (opts.transparency) {
    doc
      .getPage(0)
      .node.set(N("Group"), ctx.obj({ Type: "Group", S: "Transparency", CS: "DeviceRGB" }))
  }
  if (opts.info) {
    doc.setKeywords(["ancien", "mot-clé"])
    dict(doc, ctx.trailerInfo.Info)?.set(N("Custom"), PDFString.of("x"))
  }
  if (opts.paddingBytes) {
    catalog.set(N("Padding"), ctx.register(ctx.stream(new Uint8Array(opts.paddingBytes))))
  }
  return doc.save({ addDefaultPage: false, updateFieldAppearances: false })
}

// --- Inspection helpers --------------------------------------------------------------------

export function resolve(doc: PDFDocument, obj: PDFObject | undefined): PDFObject | undefined {
  return obj instanceof PDFRef ? doc.context.lookup(obj) : obj
}

export function dict(doc: PDFDocument, obj: PDFObject | undefined): PDFDict | undefined {
  const v = resolve(doc, obj)
  if (v instanceof PDFDict) return v
  if (v instanceof PDFStream) return v.dict
  return undefined
}

export function array(doc: PDFDocument, obj: PDFObject | undefined): PDFObject[] {
  const v = resolve(doc, obj)
  return v instanceof PDFArray ? v.asArray() : []
}

export function text(doc: PDFDocument, obj: PDFObject | undefined): string | undefined {
  const v = resolve(doc, obj)
  return v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : undefined
}

export function streamData(doc: PDFDocument, obj: PDFObject | undefined): Uint8Array {
  const v = resolve(doc, obj)
  if (v instanceof PDFRawStream) return decodePDFRawStream(v).decode()
  if (v instanceof PDFStream) return v.getContents()
  throw new Error("not a stream")
}

/** Flat list of (name, file spec) of the EmbeddedFiles names tree. */
export function embeddedFiles(doc: PDFDocument): { name: string; spec: PDFDict }[] {
  const out: { name: string; spec: PDFDict }[] = []
  const walk = (node: PDFDict | undefined) => {
    if (!node) return
    const names = array(doc, node.get(N("Names")))
    for (let i = 0; i + 1 < names.length; i += 2) {
      const spec = dict(doc, names[i + 1])
      const name = text(doc, names[i])
      if (spec && name !== undefined) out.push({ name, spec })
    }
    for (const kid of array(doc, node.get(N("Kids")))) walk(dict(doc, kid))
  }
  walk(dict(doc, dict(doc, doc.catalog.get(N("Names")))?.get(N("EmbeddedFiles"))))
  return out
}

/** Decoded content streams of every page, concatenated per page. */
export function pageContents(doc: PDFDocument): string[] {
  return doc.getPages().map((page) => {
    const c = page.node.get(N("Contents"))
    const parts = resolve(doc, c) instanceof PDFArray ? array(doc, c) : [c]
    return parts.map((p) => new TextDecoder("latin1").decode(streamData(doc, p))).join("\n")
  })
}
