import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { PDFDocument, PDFName, PDFRawStream } from "@cantoo/pdf-lib"
import { describe, expect, it } from "vitest"
import { SRGB_ICC_BASE64 } from "./assets/srgb-icc"
import {
  embedFacturX,
  FACTURX_FILENAME,
  LARGE_PDF_BYTES,
  parsePdfDate,
  preflightPdf,
} from "./embed"
import {
  array,
  decoratePdf,
  dict,
  embeddedFiles,
  makeHelveticaPdf,
  N,
  pageContents,
  resolve,
  streamData,
  TEST_INVOICE,
  text,
} from "./embed.testkit"

const assets = resolvePath(import.meta.dirname, "assets")
const input = (name: string) =>
  new Uint8Array(readFileSync(resolvePath(assets, "test-inputs", name)))
const XML = readFileSync(resolvePath(assets, "sample-en16931.xml"), "utf8")
const NOW = new Date(Date.UTC(2026, 9, 16, 8, 30, 0))
const OPTIONS = { invoice: TEST_INVOICE, now: NOW }

const load = (bytes: Uint8Array) => PDFDocument.load(bytes, { updateMetadata: false })

function xmpOf(doc: PDFDocument): { raw: PDFRawStream; text: string } {
  const raw = resolve(doc, doc.catalog.get(N("Metadata")))
  if (!(raw instanceof PDFRawStream)) throw new Error("no XMP stream")
  return { raw, text: new TextDecoder().decode(streamData(doc, raw)) }
}

function facturXSpecs(doc: PDFDocument) {
  return embeddedFiles(doc).filter((e) => e.name === FACTURX_FILENAME)
}

function afNames(doc: PDFDocument): string[] {
  return array(doc, doc.catalog.get(N("AF"))).map(
    (o) => text(doc, dict(doc, o)?.get(N("UF"))) ?? "",
  )
}

function outputIntents(doc: PDFDocument) {
  return array(doc, doc.catalog.get(N("OutputIntents"))).map((o) => {
    const d = dict(doc, o)
    return { s: d?.get(N("S"))?.toString(), profile: d?.get(N("DestOutputProfile"))?.toString() }
  })
}

describe("assets", () => {
  it("keeps the inlined sRGB profile identical to the vendored .icc file", () => {
    const icc = readFileSync(resolvePath(assets, "sRGB-v2-micro.icc"))
    expect(SRGB_ICC_BASE64).toBe(icc.toString("base64"))
  })
})

describe("parsePdfDate", () => {
  it("parses full dates with offsets", () => {
    expect(parsePdfDate("D:20261015120000+02'00'")?.toISOString()).toBe("2026-10-15T10:00:00.000Z")
    expect(parsePdfDate("D:20261015120000Z")?.toISOString()).toBe("2026-10-15T12:00:00.000Z")
    expect(parsePdfDate("D:2026")?.toISOString()).toBe("2026-01-01T00:00:00.000Z")
  })
  it("rejects garbage", () => {
    expect(parsePdfDate("hier")).toBeUndefined()
  })
})

describe("embedFacturX", () => {
  it("attaches factur-x.xml with the Factur-X file specification", async () => {
    const doc = await load(await embedFacturX(input("chromium-invoice.pdf"), XML, OPTIONS))
    const specs = facturXSpecs(doc)
    expect(specs).toHaveLength(1)
    const spec = specs[0]?.spec
    expect(text(doc, spec?.get(N("F")))).toBe(FACTURX_FILENAME)
    expect(text(doc, spec?.get(N("UF")))).toBe(FACTURX_FILENAME)
    expect(spec?.get(N("AFRelationship"))).toBe(PDFName.of("Alternative"))
    const ef = dict(doc, spec?.get(N("EF")))
    const file = ef?.get(N("F"))
    expect(dict(doc, file)?.get(N("Subtype"))).toBe(PDFName.of("text/xml"))
    expect(dict(doc, file)?.get(N("Type"))).toBe(PDFName.of("EmbeddedFile"))
    expect(new TextDecoder().decode(streamData(doc, file))).toBe(XML)
    expect(afNames(doc)).toEqual([FACTURX_FILENAME])
  })

  it("writes an uncompressed XMP packet with PDF/A-3B and the Factur-X extension schema", async () => {
    const doc = await load(await embedFacturX(input("chromium-invoice.pdf"), XML, OPTIONS))
    const xmp = xmpOf(doc)
    expect(xmp.raw.dict.has(N("Filter"))).toBe(false)
    expect(xmp.raw.dict.get(N("Type"))).toBe(PDFName.of("Metadata"))
    expect(xmp.raw.dict.get(N("Subtype"))).toBe(PDFName.of("XML"))
    for (const fragment of [
      "<pdfaid:part>3</pdfaid:part>",
      "<pdfaid:conformance>B</pdfaid:conformance>",
      "<fx:DocumentType>INVOICE</fx:DocumentType>",
      "<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>",
      "<fx:Version>1.0</fx:Version>",
      "<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>",
      "<pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>",
      "<pdfaSchema:prefix>fx</pdfaSchema:prefix>",
      "<pdf:Producer>Facturette</pdf:Producer>",
      "<xmp:CreatorTool>Facturette</xmp:CreatorTool>",
      "<xmp:ModifyDate>2026-10-16T08:30:00+00:00</xmp:ModifyDate>",
      "<xmp:MetadataDate>2026-10-16T08:30:00+00:00</xmp:MetadataDate>",
      '<rdf:li xml:lang="x-default">Facture FA-2026-0042</rdf:li>',
      "<rdf:li>Atelier Dupont SAS</rdf:li>",
    ]) {
      expect(xmp.text).toContain(fragment)
    }
    expect(xmp.text.startsWith('<?xpacket begin="\uFEFF"')).toBe(true)
    expect(xmp.text.trimEnd().endsWith('<?xpacket end="w"?>')).toBe(true)
  })

  it("keeps the Info dictionary coherent with the XMP", async () => {
    const doc = await load(
      await embedFacturX(
        await decoratePdf(input("chromium-invoice.pdf"), { info: true }),
        XML,
        OPTIONS,
      ),
    )
    expect(doc.getTitle()).toBe("Facture FA-2026-0042")
    expect(doc.getAuthor()).toBe("Atelier Dupont SAS")
    expect(doc.getProducer()).toBe("Facturette")
    expect(doc.getCreator()).toBe("Facturette")
    expect(doc.getKeywords()).toBeUndefined()
    expect(doc.getModificationDate()?.toISOString()).toBe(NOW.toISOString())
    const xmp = xmpOf(doc).text
    const created = doc.getCreationDate()
    expect(created).toBeDefined()
    // CreateDate in XMP is the same instant as /CreationDate.
    const createXmp = xmp.match(/<xmp:CreateDate>(.*?)<\/xmp:CreateDate>/)?.[1]
    expect(createXmp && new Date(createXmp).getTime()).toBe(created?.getTime())
    expect(doc.getSubject()).toBe(
      xmp.match(/<dc:description><rdf:Alt><rdf:li xml:lang="x-default">(.*?)</)?.[1],
    )
  })

  it("titles credit notes as avoirs and writes the BASIC conformance level", async () => {
    const doc = await load(
      await embedFacturX(input("chromium-invoice.pdf"), XML, {
        ...OPTIONS,
        profile: "BASIC",
        invoice: { ...TEST_INVOICE, typeCode: "381" },
      }),
    )
    expect(doc.getTitle()).toBe("Avoir FA-2026-0042")
    expect(xmpOf(doc).text).toContain("<fx:ConformanceLevel>BASIC</fx:ConformanceLevel>")
    expect(facturXSpecs(doc)[0]?.spec.get(N("AFRelationship"))).toBe(PDFName.of("Alternative"))
  })

  it("escapes XML special characters in XMP values", async () => {
    const doc = await load(
      await embedFacturX(input("chromium-invoice.pdf"), XML, {
        ...OPTIONS,
        invoice: { ...TEST_INVOICE, sellerName: "Dupont & Fils <SARL>" },
      }),
    )
    expect(xmpOf(doc).text).toContain("<rdf:li>Dupont &amp; Fils &lt;SARL&gt;</rdf:li>")
    expect(doc.getAuthor()).toBe("Dupont & Fils <SARL>")
  })

  it("adds an sRGB GTS_PDFA1 output intent with the vendored ICC profile", async () => {
    const doc = await load(await embedFacturX(input("chromium-invoice.pdf"), XML, OPTIONS))
    const intents = array(doc, doc.catalog.get(N("OutputIntents")))
    expect(intents).toHaveLength(1)
    const intent = dict(doc, intents[0])
    expect(intent?.get(N("S"))).toBe(PDFName.of("GTS_PDFA1"))
    const profile = intent?.get(N("DestOutputProfile"))
    expect(dict(doc, profile)?.get(N("N"))?.toString()).toBe("3")
    expect(Buffer.from(streamData(doc, profile)).toString("base64")).toBe(SRGB_ICC_BASE64)
  })

  it("writes a trailer /ID, keeping the permanent identifier of the source", async () => {
    const source = await load(input("chromium-invoice.pdf"))
    const sourceId = array(source, source.context.trailerInfo.ID)[0]?.toString()
    const doc = await load(await embedFacturX(input("chromium-invoice.pdf"), XML, OPTIONS))
    const id = array(doc, doc.context.trailerInfo.ID)
    expect(id).toHaveLength(2)
    if (sourceId) expect(id[0]?.toString()).toBe(sourceId)
    const fresh = await load(await embedFacturX(await makeHelveticaPdf(), XML, OPTIONS))
    expect(array(fresh, fresh.context.trailerInfo.ID)).toHaveLength(2)
  })

  it("leaves the page content streams untouched", async () => {
    for (const name of ["chromium-invoice.pdf", "chromium-multipage.pdf"]) {
      const before = await load(input(name))
      const after = await load(await embedFacturX(input(name), XML, OPTIONS))
      expect(after.getPageCount()).toBe(before.getPageCount())
      expect(pageContents(after)).toEqual(pageContents(before))
    }
  })

  it("starts with a PDF 1.7 header followed by a binary comment", async () => {
    const out = await embedFacturX(input("chromium-invoice.pdf"), XML, OPTIONS)
    expect(new TextDecoder("latin1").decode(out.slice(0, 9))).toBe("%PDF-1.7\n")
    expect(out[9]).toBe(0x25)
    expect([out[10], out[11], out[12], out[13]].every((b) => (b ?? 0) > 127)).toBe(true)
  })

  it("is idempotent: re-embedding replaces factur-x.xml instead of duplicating it", async () => {
    const once = await embedFacturX(input("chromium-invoice.pdf"), XML, OPTIONS)
    const xml2 = XML.replace("FA-2026-0042", "FA-2026-0043")
    const twice = await embedFacturX(once, xml2, OPTIONS)
    const doc = await load(twice)
    const specs = facturXSpecs(doc)
    expect(specs).toHaveLength(1)
    const file = dict(doc, specs[0]?.spec.get(N("EF")))?.get(N("F"))
    expect(new TextDecoder().decode(streamData(doc, file))).toBe(xml2)
    expect(afNames(doc)).toEqual([FACTURX_FILENAME])
    expect(outputIntents(doc)).toHaveLength(1)
    expect(xmpOf(doc).text.match(/<pdfaid:part>/g)).toHaveLength(1)
    // The previous attachment streams are not left behind as orphans.
    const xmlStreams = doc.context
      .enumerateIndirectObjects()
      .filter(
        ([, o]) => o instanceof PDFRawStream && o.dict.get(N("Subtype")) === PDFName.of("text/xml"),
      )
    expect(xmlStreams).toHaveLength(1)
    expect(twice.length).toBeLessThan(once.length + 2048)
  })

  it("replaces an existing XMP packet and keeps an existing PDF/A output intent", async () => {
    const source = await decoratePdf(input("chromium-invoice.pdf"), {
      xmp: true,
      outputIntent: "pdfa",
    })
    const before = outputIntents(await load(source))
    const doc = await load(await embedFacturX(source, XML, OPTIONS))
    const xmp = xmpOf(doc).text
    expect(xmp).not.toContain('pdfaid:part="1"')
    expect(xmp).not.toContain("acme:Department")
    expect(xmp).toContain("<pdfaid:part>3</pdfaid:part>")
    expect(outputIntents(doc)).toEqual(before)
  })

  it("reuses the profile of a non-PDF/A output intent for the GTS_PDFA1 intent", async () => {
    const source = await decoratePdf(input("chromium-invoice.pdf"), { outputIntent: "pdfx" })
    const intents = outputIntents(await load(await embedFacturX(source, XML, OPTIONS)))
    expect(intents.map((i) => i.s)).toEqual(["/GTS_PDFX", "/GTS_PDFA1"])
    expect(intents[1]?.profile).toBe(intents[0]?.profile)
  })

  it("keeps other attachments and makes them PDF/A-3 compliant", async () => {
    const source = await decoratePdf(input("chromium-invoice.pdf"), { attachment: true })
    const doc = await load(await embedFacturX(source, XML, OPTIONS))
    const files = embeddedFiles(doc)
    expect(files.map((f) => f.name)).toEqual([FACTURX_FILENAME, "notes.txt"])
    const notes = files[1]?.spec
    expect(text(doc, notes?.get(N("UF")))).toBe("notes.txt")
    expect(notes?.get(N("AFRelationship"))).toBe(PDFName.of("Unspecified"))
    const notesFile = dict(doc, dict(doc, notes?.get(N("EF")))?.get(N("F")))
    expect(notesFile?.get(N("Subtype"))).toBe(PDFName.of("application/octet-stream"))
    expect(afNames(doc)).toEqual([FACTURX_FILENAME, "notes.txt"])
  })

  it("replaces a ZUGFeRD invoice XML left by another producer", async () => {
    const source = await decoratePdf(input("chromium-invoice.pdf"), {
      attachment: "ZUGFeRD-invoice.xml",
    })
    const doc = await load(await embedFacturX(source, XML, OPTIONS))
    expect(embeddedFiles(doc).map((f) => f.name)).toEqual([FACTURX_FILENAME])
    expect(afNames(doc)).toEqual([FACTURX_FILENAME])
  })

  it("removes document-level JavaScript and XFA", async () => {
    const source = await decoratePdf(input("chromium-invoice.pdf"), {
      javascript: true,
      form: true,
    })
    const doc = await load(await embedFacturX(source, XML, OPTIONS))
    expect(doc.catalog.has(N("OpenAction"))).toBe(false)
    expect(dict(doc, doc.catalog.get(N("Names")))?.has(N("JavaScript"))).toBe(false)
    expect(dict(doc, doc.catalog.get(N("AcroForm")))?.has(N("XFA"))).toBe(false)
  })

  it("handles linearized and object-stream sources", async () => {
    for (const name of ["chromium-linearized.pdf", "chromium-objstreams.pdf"]) {
      const doc = await load(await embedFacturX(input(name), XML, OPTIONS))
      expect(facturXSpecs(doc)).toHaveLength(1)
      const linearized = doc.context
        .enumerateIndirectObjects()
        .filter(([, o]) => dict(doc, o)?.has(N("Linearized")))
      expect(linearized).toHaveLength(0)
    }
  })

  it("rejects encrypted and unreadable PDFs with a French message", async () => {
    await expect(embedFacturX(input("encrypted.pdf"), XML, OPTIONS)).rejects.toThrow(/chiffré/)
    await expect(
      embedFacturX(new TextEncoder().encode("pas un pdf"), XML, OPTIONS),
    ).rejects.toThrow(/PDF lisible/)
  })
})

describe("preflightPdf", () => {
  const codes = async (bytes: Uint8Array) => {
    const report = await preflightPdf(bytes)
    return {
      canEmbed: report.canEmbed,
      issues: report.issues.map((i) => `${i.severity}:${i.code}`),
    }
  }

  it("accepts good candidates without any issue", async () => {
    for (const name of [
      "chromium-invoice.pdf",
      "chromium-multipage.pdf",
      "chromium-linearized.pdf",
      "chromium-objstreams.pdf",
      "truetype-embedded.pdf",
    ]) {
      expect(await codes(input(name))).toEqual({ canEmbed: true, issues: [] })
    }
  })

  it("accepts its own output (re-embedding)", async () => {
    const out = await embedFacturX(input("chromium-invoice.pdf"), XML, OPTIONS)
    expect(await codes(out)).toEqual({ canEmbed: true, issues: [] })
  })

  it("blocks encrypted and unreadable files", async () => {
    expect(await codes(input("encrypted.pdf"))).toEqual({
      canEmbed: false,
      issues: ["blocker:encrypted"],
    })
    expect(await codes(new Uint8Array([1, 2, 3]))).toEqual({
      canEmbed: false,
      issues: ["blocker:unreadable"],
    })
  })

  it("blocks signed files", async () => {
    const signed = await decoratePdf(input("chromium-invoice.pdf"), { signature: true })
    expect(await codes(signed)).toEqual({ canEmbed: false, issues: ["blocker:signed"] })
  })

  it("warns about non-embedded fonts", async () => {
    const report = await preflightPdf(await makeHelveticaPdf())
    expect(report.canEmbed).toBe(true)
    expect(report.issues.map((i) => i.code)).toEqual(["fonts-not-embedded"])
    expect(report.issues[0]?.message).toContain("Helvetica")
  })

  it("warns about JavaScript, XFA and form fields", async () => {
    const source = await decoratePdf(input("chromium-invoice.pdf"), {
      javascript: true,
      form: true,
    })
    expect(await codes(source)).toEqual({
      canEmbed: true,
      issues: ["warning:javascript", "warning:xfa", "warning:form-fields"],
    })
  })

  it("warns about a different PDF/A claim and transparency in a PDF/A-1 source", async () => {
    const claimed = await decoratePdf(input("chromium-invoice.pdf"), { xmp: true })
    expect(await codes(claimed)).toEqual({ canEmbed: true, issues: ["warning:pdfa-claim"] })
    const transparent = await decoratePdf(input("chromium-invoice.pdf"), {
      xmp: true,
      transparency: true,
    })
    expect(await codes(transparent)).toEqual({
      canEmbed: true,
      issues: ["warning:pdfa-claim", "warning:pdfa1-transparency"],
    })
  })

  it("warns about DeviceCMYK colour", async () => {
    const doc = await load(input("chromium-invoice.pdf"))
    const { cmyk } = await import("@cantoo/pdf-lib")
    doc.getPage(0).drawRectangle({ x: 10, y: 10, width: 20, height: 20, color: cmyk(0, 1, 1, 0) })
    expect(await codes(await doc.save())).toEqual({ canEmbed: true, issues: ["warning:cmyk"] })
  })

  it("warns about very large files", async () => {
    const big = await decoratePdf(input("chromium-invoice.pdf"), { paddingBytes: LARGE_PDF_BYTES })
    expect(await codes(big)).toEqual({ canEmbed: true, issues: ["warning:large-file"] })
  })
})
