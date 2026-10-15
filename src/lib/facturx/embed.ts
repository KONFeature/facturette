import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHeader,
  PDFHexString,
  PDFName,
  type PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
} from "@cantoo/pdf-lib"
import { SRGB_ICC_BASE64 } from "./assets/srgb-icc"
import { DEFAULT_PROFILE, type FacturXProfile } from "./types"

export interface EmbedOptions {
  profile?: FacturXProfile
  /** Used for the PDF Info dictionary and XMP metadata. */
  invoice: { number: string; issueDate: string; sellerName: string; typeCode?: "380" | "381" }
  /** Timestamp written as modification/metadata date. Defaults to the current time. */
  now?: Date
}

export interface PreflightIssue {
  code: string
  /** `blocker`: cannot produce a conformant file. `warning`: may not pass strict PDF/A-3 checks. */
  severity: "blocker" | "warning"
  /** French, user-facing. */
  message: string
}

export interface PreflightReport {
  issues: PreflightIssue[]
  /** False if there is a blocker (e.g. encrypted PDF). */
  canEmbed: boolean
}

/** Name of the embedded invoice file, fixed by the Factur-X specification. */
export const FACTURX_FILENAME = "factur-x.xml"
const PRODUCER = "Facturette"
/** Above this size the file is flagged as heavy (exchange platforms often cap attachments). */
export const LARGE_PDF_BYTES = 15 * 1024 * 1024

const FX_NAMESPACE = "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"

const N = (name: string) => PDFName.of(name)

/** Factur-X XMP `fx:ConformanceLevel` for each supported profile. */
const CONFORMANCE_LEVEL: Record<FacturXProfile, string> = {
  BASIC: "BASIC",
  EN16931: "EN 16931",
}

/**
 * /AFRelationship of the invoice XML. Factur-X 1.0: `Alternative` for profiles that are a full
 * invoice (BASIC, EN 16931, EXTENDED), `Data` only for MINIMUM / BASIC WL (not offered here).
 * Mustang's exporter makes the same choice.
 */
const AF_RELATIONSHIP: Record<FacturXProfile, string> = {
  BASIC: "Alternative",
  EN16931: "Alternative",
}

/**
 * Turn an ordinary PDF into a Factur-X PDF: attach `factur-x.xml` (AFRelationship, /AF, names
 * tree), write the XMP metadata (PDF/A-3 identification + Factur-X extension schema), add an
 * sRGB output intent when needed. The visual content of the original PDF is untouched.
 * Runs in the browser; pure bytes in, bytes out.
 *
 * Re-running it on its own output replaces the previous `factur-x.xml` (never duplicates it).
 * Throws (French message) on encrypted or unreadable PDFs.
 *
 * OWNER: lane `facturx-pdf`. Keep these signatures.
 */
export async function embedFacturX(
  pdf: Uint8Array,
  xml: string,
  options: EmbedOptions,
): Promise<Uint8Array> {
  const doc = await loadPdf(pdf)
  if (doc.isEncrypted) {
    throw new Error("Ce PDF est chiffré : impossible d'y intégrer les données Factur-X.")
  }
  const profile = options.profile ?? DEFAULT_PROFILE
  const now = options.now ?? new Date()
  const context = doc.context

  // PDF/A-3 is based on PDF 1.7; object streams and xref streams need >= 1.5 anyway.
  context.header = PDFHeader.forVersion(1, 7)
  doc.catalog.delete(N("Version"))

  removeLinearizationDicts(doc)
  removeJavaScript(doc)

  const creationDate = readInfoDate(doc, "CreationDate") ?? now
  attachInvoiceXml(doc, xml, profile, now)
  ensureOutputIntent(doc)
  writeInfo(doc, options, creationDate, now)
  writeXmp(doc, options, profile, creationDate, now)
  writeTrailerId(doc)

  return doc.save({ addDefaultPage: false, updateFieldAppearances: false, useObjectStreams: true })
}

async function loadPdf(pdf: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false })
  } catch {
    throw new Error("Ce fichier n'est pas un PDF lisible.")
  }
}

// ---------------------------------------------------------------------------------------------
// Low-level helpers

function deref(doc: PDFDocument, obj: PDFObject | undefined): PDFObject | undefined {
  return obj instanceof PDFRef ? doc.context.lookup(obj) : obj
}

function dictOf(doc: PDFDocument, obj: PDFObject | undefined): PDFDict | undefined {
  const value = deref(doc, obj)
  if (value instanceof PDFDict) return value
  if (value instanceof PDFStream) return value.dict
  return undefined
}

function arrayOf(doc: PDFDocument, obj: PDFObject | undefined): PDFArray | undefined {
  const value = deref(doc, obj)
  return value instanceof PDFArray ? value : undefined
}

function textOf(doc: PDFDocument, obj: PDFObject | undefined): string | undefined {
  const value = deref(doc, obj)
  if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText()
  return undefined
}

function nameOf(doc: PDFDocument, obj: PDFObject | undefined): string | undefined {
  const value = deref(doc, obj)
  return value instanceof PDFName ? value.decodeText() : undefined
}

function streamBytes(doc: PDFDocument, obj: PDFObject | undefined): Uint8Array | undefined {
  const value = deref(doc, obj)
  if (value instanceof PDFRawStream) {
    try {
      return decodePDFRawStream(value).decode()
    } catch {
      return undefined
    }
  }
  if (value instanceof PDFStream) return value.getContents()
  return undefined
}

function deleteIfRef(doc: PDFDocument, obj: PDFObject | undefined) {
  if (obj instanceof PDFRef) doc.context.delete(obj)
}

const utf8 = new TextEncoder()

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0")
}

/** PDF date in UTC: `D:YYYYMMDDHHmmSS+00'00'`. */
function pdfDate(d: Date): string {
  return `D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(
    d.getUTCHours(),
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}+00'00'`
}

/** XMP date in UTC, same instant and precision as `pdfDate`. */
function xmpDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`
}

/** Parse a PDF date string (`D:YYYYMMDDHHmmSSOHH'mm'`, every part after the year optional). */
export function parsePdfDate(raw: string): Date | undefined {
  const m = raw
    .trim()
    .match(
      /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz+-])(?:(\d{2})'?(\d{2})?'?)?)?/,
    )
  if (!m) return undefined
  const num = (s: string | undefined, fallback: number) => (s === undefined ? fallback : Number(s))
  const utc = Date.UTC(
    num(m[1], 1970),
    num(m[2], 1) - 1,
    num(m[3], 1),
    num(m[4], 0),
    num(m[5], 0),
    num(m[6], 0),
  )
  const sign = m[7] === "+" ? 1 : m[7] === "-" ? -1 : 0
  const offsetMinutes = sign * (num(m[8], 0) * 60 + num(m[9], 0))
  const date = new Date(utc - offsetMinutes * 60_000)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function readInfoDate(doc: PDFDocument, key: string): Date | undefined {
  const info = dictOf(doc, doc.context.trailerInfo.Info)
  const raw = info ? textOf(doc, info.get(N(key))) : undefined
  if (!raw) return undefined
  const date = parsePdfDate(raw)
  // Whole-second precision so the Info and XMP values stay strictly equal.
  return date ? new Date(Math.floor(date.getTime() / 1000) * 1000) : undefined
}

// ---------------------------------------------------------------------------------------------
// Clean-up of constructs forbidden by PDF/A that carry no visual content

function removeLinearizationDicts(doc: PDFDocument) {
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.has(N("Linearized"))) doc.context.delete(ref)
  }
}

function isJavaScriptAction(doc: PDFDocument, obj: PDFObject | undefined): boolean {
  const action = dictOf(doc, obj)
  return action !== undefined && nameOf(doc, action.get(N("S"))) === "JavaScript"
}

/** PDF/A forbids JavaScript: drop document-level scripts and additional actions. */
function removeJavaScript(doc: PDFDocument) {
  const catalog = doc.catalog
  const names = dictOf(doc, catalog.get(N("Names")))
  names?.delete(N("JavaScript"))
  catalog.delete(N("AA"))
  if (isJavaScriptAction(doc, catalog.get(N("OpenAction")))) catalog.delete(N("OpenAction"))
  const acroForm = dictOf(doc, catalog.get(N("AcroForm")))
  acroForm?.delete(N("XFA"))
  for (const page of doc.getPages()) {
    page.node.delete(N("AA"))
    const annots = arrayOf(doc, page.node.get(N("Annots")))
    for (const annotObj of annots?.asArray() ?? []) {
      const annot = dictOf(doc, annotObj)
      if (!annot) continue
      annot.delete(N("AA"))
      if (isJavaScriptAction(doc, annot.get(N("A")))) annot.delete(N("A"))
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Attachment

interface NameTreeEntry {
  key: string
  value: PDFObject
}

function collectNameTree(
  doc: PDFDocument,
  node: PDFDict | undefined,
  out: NameTreeEntry[],
  seen: Set<PDFDict>,
) {
  if (!node || seen.has(node)) return
  seen.add(node)
  const names = arrayOf(doc, node.get(N("Names")))
  if (names) {
    for (let i = 0; i + 1 < names.size(); i += 2) {
      const key = textOf(doc, names.get(i))
      const value = names.get(i + 1)
      if (key !== undefined && value !== undefined) out.push({ key, value })
    }
  }
  for (const kid of arrayOf(doc, node.get(N("Kids")))?.asArray() ?? []) {
    collectNameTree(doc, dictOf(doc, kid), out, seen)
  }
}

/**
 * Hybrid-invoice XML names (Factur-X, ZUGFeRD 1/2.0, XRechnung): a previous invoice XML is
 * replaced, never kept next to the new one, so readers cannot pick a stale payload.
 */
const INVOICE_XML_NAMES = new Set([FACTURX_FILENAME, "zugferd-invoice.xml", "xrechnung.xml"])

function isInvoiceXmlFileSpec(doc: PDFDocument, key: string, spec: PDFDict | undefined): boolean {
  const names = [key, textOf(doc, spec?.get(N("UF"))), textOf(doc, spec?.get(N("F")))]
  return names.some((n) => n !== undefined && INVOICE_XML_NAMES.has(n.toLowerCase()))
}

/** Delete a file specification and its embedded file streams. */
function deleteFileSpec(doc: PDFDocument, specObj: PDFObject) {
  const spec = dictOf(doc, specObj)
  const ef = spec ? dictOf(doc, spec.get(N("EF"))) : undefined
  for (const value of ef?.values() ?? []) deleteIfRef(doc, value)
  if (spec) deleteIfRef(doc, spec.get(N("EF")))
  deleteIfRef(doc, specObj)
}

/**
 * PDF/A-3 requires every embedded file spec to carry /F, /UF and /AFRelationship, every embedded
 * file stream to carry a MIME /Subtype, and every attachment to be associated through /AF.
 */
function normalizeFileSpec(doc: PDFDocument, key: string, spec: PDFDict) {
  if (!spec.has(N("F"))) spec.set(N("F"), PDFString.of(asciiFileName(key)))
  if (!spec.has(N("UF")))
    spec.set(N("UF"), PDFHexString.fromText(textOf(doc, spec.get(N("F"))) ?? key))
  if (!spec.has(N("AFRelationship"))) spec.set(N("AFRelationship"), N("Unspecified"))
  if (!spec.has(N("Type"))) spec.set(N("Type"), N("Filespec"))
  const ef = dictOf(doc, spec.get(N("EF")))
  for (const value of ef?.values() ?? []) {
    const stream = dictOf(doc, value)
    if (stream && !stream.has(N("Subtype"))) {
      stream.set(N("Subtype"), N("application/octet-stream"))
    }
  }
}

function asciiFileName(name: string): string {
  return name.replace(/[^\x20-\x7e]/g, "_")
}

function sameObject(a: PDFObject, b: PDFObject): boolean {
  if (a === b) return true
  return a instanceof PDFRef && b instanceof PDFRef && a.toString() === b.toString()
}

function attachInvoiceXml(doc: PDFDocument, xml: string, profile: FacturXProfile, now: Date) {
  const context = doc.context
  const catalog = doc.catalog
  const xmlBytes = utf8.encode(xml)

  const fileStream = context.flateStream(xmlBytes, {
    Type: "EmbeddedFile",
    Subtype: "text/xml",
    Params: { Size: xmlBytes.length, ModDate: PDFString.of(pdfDate(now)) },
  })
  const fileRef = context.register(fileStream)
  const spec = context.obj({
    Type: "Filespec",
    F: PDFString.of(FACTURX_FILENAME),
    UF: PDFHexString.fromText(FACTURX_FILENAME),
    Desc: PDFString.of("Factur-X invoice"),
    AFRelationship: AF_RELATIONSHIP[profile],
    EF: { F: fileRef, UF: fileRef },
  })
  const specRef = context.register(spec)

  // Existing attachments: drop any previous factur-x.xml, keep and normalise the others.
  let names = dictOf(doc, catalog.get(N("Names")))
  const entries: NameTreeEntry[] = []
  const oldTreeObj = names?.get(N("EmbeddedFiles"))
  collectNameTree(doc, dictOf(doc, oldTreeObj), entries, new Set())
  deleteNameTreeNodes(doc, oldTreeObj)
  const removed: PDFObject[] = []
  const kept: NameTreeEntry[] = []
  for (const entry of entries) {
    const entrySpec = dictOf(doc, entry.value)
    if (isInvoiceXmlFileSpec(doc, entry.key, entrySpec)) {
      removed.push(entry.value)
    } else {
      if (entrySpec) normalizeFileSpec(doc, entry.key, entrySpec)
      kept.push(entry)
    }
  }
  kept.push({ key: FACTURX_FILENAME, value: specRef })
  kept.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  const flat = context.obj([])
  for (const entry of kept) {
    flat.push(PDFHexString.fromText(entry.key))
    flat.push(entry.value)
  }
  if (!names) {
    names = context.obj({})
    catalog.set(N("Names"), context.register(names))
  }
  names.set(N("EmbeddedFiles"), context.obj({ Names: flat }))

  // /AF: every attachment, with the invoice XML first; previous factur-x.xml specs dropped.
  const oldAf = arrayOf(doc, catalog.get(N("AF")))?.asArray() ?? []
  const af = context.obj([specRef])
  const afHas = (obj: PDFObject) => af.asArray().some((o) => sameObject(o, obj))
  for (const obj of oldAf) {
    const objSpec = dictOf(doc, obj)
    const isOldInvoice =
      removed.some((r) => sameObject(r, obj)) || isInvoiceXmlFileSpec(doc, "", objSpec)
    if (!isOldInvoice && !afHas(obj)) af.push(obj)
  }
  for (const entry of kept) if (!afHas(entry.value)) af.push(entry.value)
  if (catalog.get(N("AF")) instanceof PDFRef) deleteIfRef(doc, catalog.get(N("AF")))
  catalog.set(N("AF"), af)

  const stale = [...removed, ...oldAf.filter((o) => isInvoiceXmlFileSpec(doc, "", dictOf(doc, o)))]
  for (const obj of stale) deleteFileSpec(doc, obj)
}

/** Delete the indirect nodes of a name tree (not the values it points to). */
function deleteNameTreeNodes(doc: PDFDocument, nodeObj: PDFObject | undefined, depth = 0) {
  const node = dictOf(doc, nodeObj)
  if (!node || depth > 32) return
  for (const kid of arrayOf(doc, node.get(N("Kids")))?.asArray() ?? []) {
    deleteNameTreeNodes(doc, kid, depth + 1)
  }
  deleteIfRef(doc, node.get(N("Names")))
  deleteIfRef(doc, node.get(N("Kids")))
  deleteIfRef(doc, nodeObj)
}

// ---------------------------------------------------------------------------------------------
// Output intent

function iccBytes(): Uint8Array {
  const bin = atob(SRGB_ICC_BASE64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * PDF/A needs a GTS_PDFA1 output intent as soon as device colour spaces are used, which is the
 * case of virtually every invoice PDF. If the file already has one, it is kept. If it has
 * another output intent with a profile (e.g. PDF/X), the same profile is reused: PDF/A-2/3
 * require all output intents to share one destination profile.
 */
function ensureOutputIntent(doc: PDFDocument) {
  const context = doc.context
  const catalog = doc.catalog
  const intents = arrayOf(doc, catalog.get(N("OutputIntents")))
  let reusableProfile: PDFObject | undefined
  for (const obj of intents?.asArray() ?? []) {
    const intent = dictOf(doc, obj)
    if (!intent) continue
    if (nameOf(doc, intent.get(N("S"))) === "GTS_PDFA1" && intent.has(N("DestOutputProfile"))) {
      return
    }
    reusableProfile ??= intent.get(N("DestOutputProfile"))
  }
  const profileRef =
    reusableProfile ??
    context.register(context.flateStream(iccBytes(), { N: 3, Alternate: "DeviceRGB" }))
  const intent = context.obj({
    Type: "OutputIntent",
    S: "GTS_PDFA1",
    OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
    RegistryName: PDFString.of("http://www.color.org"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    DestOutputProfile: profileRef,
  })
  const intentRef = context.register(intent)
  if (intents) intents.push(intentRef)
  else catalog.set(N("OutputIntents"), context.obj([intentRef]))
}

// ---------------------------------------------------------------------------------------------
// Document information and XMP

function documentTitle(options: EmbedOptions): string {
  const kind = options.invoice.typeCode === "381" ? "Avoir" : "Facture"
  return `${kind} ${options.invoice.number}`
}

function documentSubject(options: EmbedOptions): string {
  return `${documentTitle(options)} du ${options.invoice.issueDate} – ${options.invoice.sellerName}`
}

/**
 * Rebuild the Info dictionary so that every entry has an XMP equivalent with the same value
 * (PDF/A-3 6.6.2.3.1). Old entries (Keywords, custom keys, …) are dropped on purpose.
 */
function writeInfo(doc: PDFDocument, options: EmbedOptions, created: Date, now: Date) {
  const context = doc.context
  deleteIfRef(doc, context.trailerInfo.Info)
  const info = context.obj({
    Title: PDFHexString.fromText(documentTitle(options)),
    Author: PDFHexString.fromText(options.invoice.sellerName),
    Subject: PDFHexString.fromText(documentSubject(options)),
    Creator: PDFString.of(PRODUCER),
    Producer: PDFString.of(PRODUCER),
    CreationDate: PDFString.of(pdfDate(created)),
    ModDate: PDFString.of(pdfDate(now)),
  })
  context.trailerInfo.Info = context.register(info)
}

const FX_PROPERTIES: [name: string, description: string][] = [
  ["DocumentFileName", "The name of the embedded XML document"],
  ["DocumentType", "The type of the hybrid document in capital letters, e.g. INVOICE or ORDER"],
  ["Version", "The actual version of the standard applying to the embedded XML document"],
  ["ConformanceLevel", "The conformance level of the embedded XML document"],
]

export function buildXmp(
  options: EmbedOptions,
  profile: FacturXProfile,
  created: Date,
  now: Date,
): string {
  const title = xmlEscape(documentTitle(options))
  const author = xmlEscape(options.invoice.sellerName)
  const subject = xmlEscape(documentSubject(options))
  const fxProps = FX_PROPERTIES.map(
    ([name, description]) => `
              <rdf:li rdf:parseType="Resource">
                <pdfaProperty:name>${name}</pdfaProperty:name>
                <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                <pdfaProperty:category>external</pdfaProperty:category>
                <pdfaProperty:description>${description}</pdfaProperty:description>
              </rdf:li>`,
  ).join("")
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:format>application/pdf</dc:format>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${author}</rdf:li></rdf:Seq></dc:creator>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${subject}</rdf:li></rdf:Alt></dc:description>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>${PRODUCER}</pdf:Producer>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreatorTool>${PRODUCER}</xmp:CreatorTool>
      <xmp:CreateDate>${xmpDate(created)}</xmp:CreateDate>
      <xmp:ModifyDate>${xmpDate(now)}</xmp:ModifyDate>
      <xmp:MetadataDate>${xmpDate(now)}</xmp:MetadataDate>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>${FX_NAMESPACE}</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>${fxProps}
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:fx="${FX_NAMESPACE}">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>${FACTURX_FILENAME}</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>${CONFORMANCE_LEVEL[profile]}</fx:ConformanceLevel>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

/**
 * Replace the document XMP. It is regenerated rather than merged: properties of an unknown
 * schema without a PDF/A extension description, or a previous pdfaid claim, would make the file
 * non-conformant, and every value written here is kept coherent with the Info dictionary.
 */
function writeXmp(
  doc: PDFDocument,
  options: EmbedOptions,
  profile: FacturXProfile,
  created: Date,
  now: Date,
) {
  const context = doc.context
  const bytes = utf8.encode(buildXmp(options, profile, created, now))
  // Uncompressed on purpose: PDF/A recommends it and some readers only scan raw bytes.
  const stream = context.stream(bytes, { Type: "Metadata", Subtype: "XML" })
  deleteIfRef(doc, doc.catalog.get(N("Metadata")))
  doc.catalog.set(N("Metadata"), context.register(stream))
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Keep the permanent identifier (first /ID) of the source, new changing identifier. */
function writeTrailerId(doc: PDFDocument) {
  const context = doc.context
  const old = arrayOf(doc, context.trailerInfo.ID)
  const first = old?.get(0)
  const permanent =
    first instanceof PDFHexString || first instanceof PDFString
      ? first
      : PDFHexString.of(randomHex(16))
  context.trailerInfo.ID = context.obj([permanent, PDFHexString.of(randomHex(16))])
}

// ---------------------------------------------------------------------------------------------
// Preflight

/** Cheap, offline checks telling the user up-front if the PDF is a poor PDF/A-3 candidate. */
export async function preflightPdf(pdf: Uint8Array): Promise<PreflightReport> {
  const issues: PreflightIssue[] = []
  const report = () => ({ issues, canEmbed: !issues.some((i) => i.severity === "blocker") })

  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false })
  } catch {
    issues.push({
      code: "unreadable",
      severity: "blocker",
      message: "Ce fichier n'est pas un PDF lisible. Exportez à nouveau la facture en PDF.",
    })
    return report()
  }

  if (doc.isEncrypted) {
    issues.push({
      code: "encrypted",
      severity: "blocker",
      message:
        "Ce PDF est chiffré ou protégé par mot de passe. Enregistrez-en une copie non protégée, puis importez-la.",
    })
    return report()
  }

  if (hasSignature(doc)) {
    issues.push({
      code: "signed",
      severity: "blocker",
      message:
        "Ce PDF est signé électroniquement : y intégrer les données Factur-X invaliderait la signature. Importez la version non signée de la facture.",
    })
  }

  const missingFonts = nonEmbeddedFonts(doc)
  if (missingFonts.length > 0) {
    issues.push({
      code: "fonts-not-embedded",
      severity: "warning",
      message: `Polices non intégrées au PDF (${missingFonts.slice(0, 5).join(", ")}${
        missingFonts.length > 5 ? "…" : ""
      }). Le PDF/A exige des polices intégrées : le fichier produit ne sera pas conforme. Réexportez la facture en intégrant les polices (option « Incorporer les polices » ou « PDF/A » de votre logiciel).`,
    })
  }

  if (hasJavaScript(doc)) {
    issues.push({
      code: "javascript",
      severity: "warning",
      message:
        "Ce PDF contient du JavaScript, interdit en PDF/A. Il sera retiré quand c'est possible ; sinon le fichier produit pourrait ne pas être conforme.",
    })
  }

  const acroForm = dictOf(doc, doc.catalog.get(N("AcroForm")))
  if (acroForm?.has(N("XFA"))) {
    issues.push({
      code: "xfa",
      severity: "warning",
      message:
        "Ce PDF contient un formulaire XFA, interdit en PDF/A. Il sera retiré ; l'affichage de certains lecteurs peut changer.",
    })
  }
  const fields = arrayOf(doc, acroForm?.get(N("Fields")))?.asArray() ?? []
  if (fields.some((f) => nameOf(doc, dictOf(doc, f)?.get(N("FT"))) !== "Sig")) {
    issues.push({
      code: "form-fields",
      severity: "warning",
      message:
        "Ce PDF contient des champs de formulaire. Aplatissez le formulaire (impression en PDF) pour garantir la conformité PDF/A.",
    })
  }

  const claim = readPdfaClaim(doc)
  if (claim && claim.part !== "3") {
    issues.push({
      code: "pdfa-claim",
      severity: "warning",
      message: `Ce PDF se déclare PDF/A-${claim.part}${claim.conformance.toLowerCase()} ; il sera redéclaré PDF/A-3b (requis par Factur-X).`,
    })
  }
  if (claim?.part === "1" && hasTransparencyGroup(doc)) {
    issues.push({
      code: "pdfa1-transparency",
      severity: "warning",
      message:
        "Ce PDF se déclare PDF/A-1 mais contient de la transparence, interdite en PDF/A-1 : sa déclaration était inexacte et d'autres défauts sont possibles.",
    })
  }

  if (usesDeviceCmyk(doc)) {
    issues.push({
      code: "cmyk",
      severity: "warning",
      message:
        "Ce PDF utilise des couleurs CMJN sans profil colorimétrique : le fichier produit ne sera pas conforme PDF/A. Réexportez la facture en RVB.",
    })
  }

  if (pdf.length > LARGE_PDF_BYTES) {
    issues.push({
      code: "large-file",
      severity: "warning",
      message: `Ce PDF est volumineux (${Math.round(pdf.length / (1024 * 1024))} Mo). Les plateformes de facturation limitent souvent la taille des pièces : compressez-le si possible.`,
    })
  }

  return report()
}

function hasSignature(doc: PDFDocument): boolean {
  if (dictOf(doc, doc.catalog.get(N("Perms")))) return true
  const acroForm = dictOf(doc, doc.catalog.get(N("AcroForm")))
  const stack = [...(arrayOf(doc, acroForm?.get(N("Fields")))?.asArray() ?? [])]
  const seen = new Set<PDFDict>()
  while (stack.length > 0) {
    const field = dictOf(doc, stack.pop())
    if (!field || seen.has(field)) continue
    seen.add(field)
    if (nameOf(doc, field.get(N("FT"))) === "Sig" && dictOf(doc, field.get(N("V")))) return true
    stack.push(...(arrayOf(doc, field.get(N("Kids")))?.asArray() ?? []))
  }
  return false
}

function hasJavaScript(doc: PDFDocument): boolean {
  const catalog = doc.catalog
  const names = dictOf(doc, catalog.get(N("Names")))
  if (names?.has(N("JavaScript"))) return true
  if (catalog.has(N("AA"))) return true
  if (isJavaScriptAction(doc, catalog.get(N("OpenAction")))) return true
  for (const page of doc.getPages()) {
    if (page.node.has(N("AA"))) return true
    for (const annotObj of arrayOf(doc, page.node.get(N("Annots")))?.asArray() ?? []) {
      const annot = dictOf(doc, annotObj)
      if (annot?.has(N("AA")) || isJavaScriptAction(doc, annot?.get(N("A")))) return true
    }
  }
  return false
}

/** Walk the resource dictionaries of every page, including nested form XObjects and patterns. */
function forEachResources(doc: PDFDocument, visit: (resources: PDFDict) => void) {
  const seen = new Set<PDFDict>()
  const walk = (resources: PDFDict | undefined) => {
    if (!resources || seen.has(resources)) return
    seen.add(resources)
    visit(resources)
    for (const key of ["XObject", "Pattern"]) {
      const group = dictOf(doc, resources.get(N(key)))
      for (const value of group?.values() ?? []) {
        const obj = dictOf(doc, value)
        walk(dictOf(doc, obj?.get(N("Resources"))))
      }
    }
    for (const value of dictOf(doc, resources.get(N("Font")))?.values() ?? []) {
      // Type3 glyph procedures have their own resources.
      walk(dictOf(doc, dictOf(doc, value)?.get(N("Resources"))))
    }
  }
  for (const page of doc.getPages()) walk(dictOf(doc, page.node.get(N("Resources"))))
}

function nonEmbeddedFonts(doc: PDFDocument): string[] {
  const missing = new Set<string>()
  forEachResources(doc, (resources) => {
    for (const value of dictOf(doc, resources.get(N("Font")))?.values() ?? []) {
      const font = dictOf(doc, value)
      if (!font) continue
      const subtype = nameOf(doc, font.get(N("Subtype")))
      if (subtype === "Type3") continue
      const target =
        subtype === "Type0"
          ? dictOf(doc, arrayOf(doc, font.get(N("DescendantFonts")))?.get(0))
          : font
      const descriptor = dictOf(doc, target?.get(N("FontDescriptor")))
      const embedded = ["FontFile", "FontFile2", "FontFile3"].some((k) => descriptor?.has(N(k)))
      if (!embedded) missing.add(nameOf(doc, font.get(N("BaseFont"))) ?? "police sans nom")
    }
  })
  return [...missing]
}

function hasTransparencyGroup(doc: PDFDocument): boolean {
  const isTransparency = (obj: PDFObject | undefined) =>
    nameOf(doc, dictOf(doc, obj)?.get(N("S"))) === "Transparency"
  if (doc.getPages().some((p) => isTransparency(p.node.get(N("Group"))))) return true
  let found = false
  forEachResources(doc, (resources) => {
    for (const value of dictOf(doc, resources.get(N("XObject")))?.values() ?? []) {
      if (isTransparency(dictOf(doc, value)?.get(N("Group")))) found = true
    }
  })
  return found
}

function readPdfaClaim(doc: PDFDocument): { part: string; conformance: string } | undefined {
  const bytes = streamBytes(doc, doc.catalog.get(N("Metadata")))
  if (!bytes) return undefined
  const xmp = new TextDecoder().decode(bytes)
  const part =
    xmp.match(/pdfaid:part\s*=\s*["'](\d)["']/)?.[1] ?? xmp.match(/<pdfaid:part>\s*(\d)\s*</)?.[1]
  if (!part) return undefined
  const conformance =
    xmp.match(/pdfaid:conformance\s*=\s*["']([ABU])["']/i)?.[1] ??
    xmp.match(/<pdfaid:conformance>\s*([ABU])\s*</i)?.[1] ??
    ""
  return { part, conformance }
}

/** DeviceCMYK without a CMYK output intent fails PDF/A once we add the sRGB intent. */
function usesDeviceCmyk(doc: PDFDocument): boolean {
  const intents = arrayOf(doc, doc.catalog.get(N("OutputIntents")))
  for (const obj of intents?.asArray() ?? []) {
    const profile = dictOf(doc, dictOf(doc, obj)?.get(N("DestOutputProfile")))
    const n = profile?.get(N("N"))
    if (n?.toString() === "4") return false
  }
  const contents: PDFObject[] = []
  let found = false
  forEachResources(doc, (resources) => {
    for (const value of dictOf(doc, resources.get(N("XObject")))?.values() ?? []) {
      const xobject = dictOf(doc, value)
      if (nameOf(doc, xobject?.get(N("ColorSpace"))) === "DeviceCMYK") found = true
      if (nameOf(doc, xobject?.get(N("Subtype"))) === "Form") contents.push(value)
    }
  })
  if (found) return true
  for (const page of doc.getPages()) {
    const c = page.node.get(N("Contents"))
    const arr = arrayOf(doc, c)
    if (arr) contents.push(...arr.asArray())
    else if (c) contents.push(c)
  }
  const cmykOperator =
    /(?:^|[\s\]])-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s+[kK](?=[\s/[]|$)|\/DeviceCMYK\b/
  return contents.some((c) => {
    const bytes = streamBytes(doc, c)
    return bytes ? cmykOperator.test(new TextDecoder("latin1").decode(bytes)) : false
  })
}
