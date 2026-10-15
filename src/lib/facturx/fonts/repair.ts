/**
 * Repair of non-embedded simple fonts by substitution (PDF/A-3 rule 6.2.11.4.1).
 *
 * Each non-embedded Type1/TrueType font is turned, in place, into an embedded TrueType font that
 * uses a metric-compatible substitute (Arimo for Helvetica/Arial, Tinos for Times, Cousine for
 * Courier). The font keeps its widths (its /Widths, or the Adobe core-14 widths when it had
 * none) and its encoding semantics, so the text does not move; only the glyph shapes change.
 * The substitute program is patched so that its advance widths equal the dictionary widths
 * (rule 6.2.11.5).
 *
 * Loaded on demand by embed.ts; the font programs are in per-family chunks.
 */
import {
  PDFArray,
  PDFDict,
  type PDFDocument,
  PDFName,
  PDFNumber,
  type PDFObject,
  PDFRef,
  PDFStream,
} from "@cantoo/pdf-lib"
import {
  aglCanonical,
  aglNames,
  macRomanEncoding,
  standardEncoding,
  winAnsiEncoding,
} from "./glyph-names"
import { TrueTypeFont } from "./truetype"
import type {
  FontRepairReport,
  FontStyle,
  ReplacedFont,
  SubstituteFamily,
  SubstituteStyle,
  UnrepairableFont,
} from "./types"

/** A non-embedded font dictionary and the 1-based pages whose content can use it. */
export interface FontUse {
  font: PDFDict
  pages: number[]
}

type FamilyKey = "arimo" | "tinos" | "cousine"

const FAMILY_LOADERS: Record<FamilyKey, () => Promise<SubstituteFamily>> = {
  arimo: async () => (await import("./arimo")).family,
  tinos: async () => (await import("./tinos")).family,
  cousine: async () => (await import("./cousine")).family,
}

const N = (name: string) => PDFName.of(name)

/** Raised when a font cannot be substituted; the message is French and user-facing. */
class Unrepairable extends Error {}

// ---------------------------------------------------------------------------------------------
// Glyph names and encodings

const parseTable = (s: string): (string | undefined)[] =>
  s.split(" ").map((n) => (n === "." ? undefined : n))

const ENCODINGS = {
  StandardEncoding: parseTable(standardEncoding),
  WinAnsiEncoding: parseTable(winAnsiEncoding),
  MacRomanEncoding: parseTable(macRomanEncoding),
}
type EncodingName = keyof typeof ENCODINGS

const AGL = new Map<string, number>()
{
  const parts = aglNames.split(" ")
  for (let i = 0; i + 1 < parts.length; i += 2) {
    AGL.set(parts[i] ?? "", Number.parseInt(parts[i + 1] ?? "", 16))
  }
}
const CANONICAL = new Map<number, string>()
{
  const parts = aglCanonical.split(" ")
  for (let i = 0; i + 1 < parts.length; i += 2) {
    CANONICAL.set(Number.parseInt(parts[i] ?? "", 16), parts[i + 1] ?? "")
  }
}

/** Unicode code point of a glyph name: AGL, then `uniXXXX` / `uXXXX[XX]` conventions. */
export function glyphNameToUnicode(name: string): number | undefined {
  const known = AGL.get(name)
  if (known !== undefined) return known
  const m = name.match(/^uni([0-9A-F]{4})$/) ?? name.match(/^u([0-9A-F]{4,6})$/)
  return m?.[1] ? Number.parseInt(m[1], 16) : undefined
}

// ---------------------------------------------------------------------------------------------
// Font identification

export function stripSubsetPrefix(name: string): string {
  return name.replace(/^[A-Z]{6}\+/, "")
}

const SYMBOLIC_NAMES = /^(symbol|zapfdingbats|dingbats|wingdings|webdings|marlett)/

/** Well-known names of the metric-compatible families (Helvetica/Arial, Times, Courier). */
function wellKnownFamily(key: string): FamilyKey | undefined {
  if (/^(helvetica|arial|arimo|liberationsans)/.test(key) && !/narrow|black|unicode/.test(key)) {
    return "arimo"
  }
  if (/^(times|tinos|liberationserif)/.test(key)) return "tinos"
  if (/^(courier|cousine|liberationmono)/.test(key)) return "cousine"
  return undefined
}

function styleOf(key: string, descriptor: PDFDict | undefined, doc: PDFDocument): FontStyle {
  const flags = numberOf(doc, descriptor?.get(N("Flags"))) ?? 0
  const weight = numberOf(doc, descriptor?.get(N("FontWeight"))) ?? 0
  const angle = numberOf(doc, descriptor?.get(N("ItalicAngle"))) ?? 0
  const bold = /bold|black|heavy|semibold|demi/.test(key) || weight >= 600 || (flags & 0x40000) > 0
  const italic = /italic|oblique|slanted/.test(key) || angle !== 0 || (flags & 64) > 0
  if (bold && italic) return "boldItalic"
  if (bold) return "bold"
  return italic ? "italic" : "regular"
}

// ---------------------------------------------------------------------------------------------
// PDF helpers

function deref(doc: PDFDocument, obj: PDFObject | undefined): PDFObject | undefined {
  return obj instanceof PDFRef ? doc.context.lookup(obj) : obj
}

function dictOf(doc: PDFDocument, obj: PDFObject | undefined): PDFDict | undefined {
  const value = deref(doc, obj)
  if (value instanceof PDFDict) return value
  if (value instanceof PDFStream) return value.dict
  return undefined
}

function numberOf(doc: PDFDocument, obj: PDFObject | undefined): number | undefined {
  const value = deref(doc, obj)
  return value instanceof PDFNumber ? value.asNumber() : undefined
}

function nameOf(doc: PDFDocument, obj: PDFObject | undefined): string | undefined {
  const value = deref(doc, obj)
  return value instanceof PDFName ? value.decodeText() : undefined
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Deterministic six-letter subset tag (FNV-1a of the program variant). */
function subsetTag(seed: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0
  let tag = ""
  for (let i = 0; i < 6; i++) {
    tag += String.fromCharCode(65 + (h % 26))
    h = Math.floor(h / 26) + i * 7919
  }
  return tag
}

// ---------------------------------------------------------------------------------------------
// Planning: everything is computed before the font dictionary is touched

interface LoadedStyle {
  style: SubstituteStyle
  program: TrueTypeFont
  coreWidths: Map<string, number>
}

interface FontPlan {
  original: string
  family: SubstituteFamily
  loaded: LoadedStyle
  /** Final encoding: base name + differences, every glyph resolvable in the substitute. */
  baseEncoding: "WinAnsiEncoding" | "MacRomanEncoding"
  differences: [code: number, name: string][]
  /** New /FirstChar, /LastChar, /Widths when the font had none. */
  newWidths?: { first: number; last: number; widths: number[] }
  /** Advance widths of the substitute program, font units. */
  advances: number[]
  patched: boolean
  missingWidth?: PDFObject
}

class FamilyCache {
  private readonly families = new Map<FamilyKey, Promise<SubstituteFamily>>()
  private readonly styles = new Map<string, LoadedStyle>()

  family(key: FamilyKey): Promise<SubstituteFamily> {
    let p = this.families.get(key)
    if (!p) {
      p = FAMILY_LOADERS[key]()
      this.families.set(key, p)
    }
    return p
  }

  style(family: SubstituteFamily, style: FontStyle): LoadedStyle {
    const id = `${family.name}/${style}`
    let loaded = this.styles.get(id)
    if (!loaded) {
      const s = family.styles[style]
      const coreWidths = new Map<string, number>()
      const parts = s.coreWidths.split(" ")
      for (let i = 0; i + 1 < parts.length; i += 2) {
        coreWidths.set(parts[i] ?? "", Number(parts[i + 1]))
      }
      loaded = { style: s, program: new TrueTypeFont(base64ToBytes(s.program)), coreWidths }
      this.styles.set(id, loaded)
    }
    return loaded
  }
}

function readEncoding(
  doc: PDFDocument,
  font: PDFDict,
  defaultBase: EncodingName,
): { names: (string | undefined)[]; base: EncodingName; fromDifferences: Set<number> } {
  const enc = deref(doc, font.get(N("Encoding")))
  const fromDifferences = new Set<number>()
  const baseOf = (name: string | undefined): EncodingName => {
    if (name === undefined) return defaultBase
    if (name in ENCODINGS) return name as EncodingName
    throw new Unrepairable(`encodage ${name} non pris en charge`)
  }
  if (enc === undefined)
    return { names: [...ENCODINGS[defaultBase]], base: defaultBase, fromDifferences }
  if (enc instanceof PDFName) {
    const base = baseOf(enc.decodeText())
    return { names: [...ENCODINGS[base]], base, fromDifferences }
  }
  const dict = dictOf(doc, enc)
  if (!dict) throw new Unrepairable("encodage illisible")
  const base = baseOf(nameOf(doc, dict.get(N("BaseEncoding"))))
  const names = [...ENCODINGS[base]]
  const diffs = deref(doc, dict.get(N("Differences")))
  if (diffs !== undefined) {
    if (!(diffs instanceof PDFArray)) throw new Unrepairable("encodage illisible")
    let code = -1
    for (const item of diffs.asArray()) {
      const value = deref(doc, item)
      if (value instanceof PDFNumber) code = value.asNumber()
      else if (value instanceof PDFName && code >= 0 && code < 256) {
        names[code] = value.decodeText()
        fromDifferences.add(code)
        code++
      } else throw new Unrepairable("encodage illisible")
    }
  }
  return { names, base, fromDifferences }
}

async function planFont(doc: PDFDocument, font: PDFDict, cache: FamilyCache): Promise<FontPlan> {
  const subtype = nameOf(doc, font.get(N("Subtype")))
  const baseFont = nameOf(doc, font.get(N("BaseFont"))) ?? ""
  const original = stripSubsetPrefix(baseFont)
  if (subtype === "Type0") {
    throw new Unrepairable(
      "police composite (Type0) non intégrée : remplacement non pris en charge",
    )
  }
  if (subtype !== "Type1" && subtype !== "MMType1" && subtype !== "TrueType") {
    throw new Unrepairable(`type de police ${subtype ?? "inconnu"} non pris en charge`)
  }
  const key = original.toLowerCase().replace(/[^a-z]/g, "")
  if (SYMBOLIC_NAMES.test(key)) {
    throw new Unrepairable("police de symboles : aucune police équivalente ne peut la remplacer")
  }
  const descriptor = dictOf(doc, font.get(N("FontDescriptor")))
  const widthsArray = deref(doc, font.get(N("Widths")))
  const hasWidths = widthsArray instanceof PDFArray
  const known = wellKnownFamily(key)
  if (!known && !hasWidths) {
    throw new Unrepairable(
      "police inconnue sans largeurs de caractères : la mise en page ne pourrait pas être conservée",
    )
  }
  const flags = numberOf(doc, descriptor?.get(N("Flags"))) ?? 0
  if (!known && (flags & 4) > 0 && (flags & 32) === 0) {
    throw new Unrepairable(
      "police symbolique inconnue : aucune police équivalente ne peut la remplacer",
    )
  }

  const family = await cache.family(known ?? "arimo")
  const loaded = cache.style(family, styleOf(key, descriptor, doc))
  const program = loaded.program

  // Built-in encoding of the text fonts is StandardEncoding; non-symbolic TrueType without
  // /Encoding is read as WinAnsi by viewers (pdf.js, Acrobat).
  const encoding = readEncoding(
    doc,
    font,
    subtype === "TrueType" ? "WinAnsiEncoding" : "StandardEncoding",
  )

  // code -> glyph of the substitute, Unicode and glyph name.
  const glyphs: ({ gid: number; unicode: number; name: string } | undefined)[] = []
  for (let code = 0; code < 256; code++) {
    const name = encoding.names[code]
    const unicode = name === undefined ? undefined : glyphNameToUnicode(name)
    const gid = unicode === undefined ? undefined : program.glyphForUnicode(unicode)
    const canonical = unicode === undefined ? undefined : CANONICAL.get(unicode)
    if (gid !== undefined && unicode !== undefined && canonical !== undefined) {
      glyphs.push({ gid, unicode, name: canonical })
      continue
    }
    // A glyph named by the producer that the substitute cannot draw: the text would change.
    if (name !== undefined && name !== ".notdef" && encoding.fromDifferences.has(code)) {
      throw new Unrepairable(`caractère « ${name} » absent de la police de remplacement`)
    }
    glyphs.push(undefined)
  }

  // Width of each code in glyph space (1/1000 em), as viewers use it today.
  const programWidth = (gid: number) => (program.advances[gid] ?? 0) * (1000 / program.unitsPerEm)
  const codeWidths = new Map<number, number>()
  let newWidths: FontPlan["newWidths"]
  if (hasWidths) {
    const first = numberOf(doc, font.get(N("FirstChar"))) ?? 0
    const values = widthsArray.asArray()
    values.forEach((item, i) => {
      const w = numberOf(doc, item)
      const code = first + i
      if (w === undefined || w < 0) throw new Unrepairable("largeurs de caractères illisibles")
      if (code >= 0 && code < 256) codeWidths.set(code, w)
    })
  } else {
    let first = -1
    let last = -1
    for (let code = 0; code < 256; code++) {
      const g = glyphs[code]
      if (!g) continue
      const name = encoding.names[code] ?? ""
      const w = loaded.coreWidths.get(name) ?? Math.round(programWidth(g.gid))
      codeWidths.set(code, w)
      if (first < 0) first = code
      last = code
    }
    if (first < 0) throw new Unrepairable("aucun caractère affichable")
    const widths: number[] = []
    for (let code = first; code <= last; code++) widths.push(codeWidths.get(code) ?? 0)
    newWidths = { first, last, widths }
  }

  // Program advances equal to the dictionary widths for every glyph a code can reach.
  const advances = [...program.advances]
  const wanted = new Map<number, number>()
  for (const [code, w] of codeWidths) {
    const g = glyphs[code]
    if (!g) continue
    const advance = Math.round((w * program.unitsPerEm) / 1000)
    const previous = wanted.get(g.gid)
    if (previous !== undefined && Math.abs(previous - advance) * (1000 / program.unitsPerEm) > 1) {
      throw new Unrepairable("largeurs incohérentes pour un même caractère")
    }
    if (previous === undefined) wanted.set(g.gid, advance)
  }
  let patched = false
  for (const [gid, advance] of wanted) {
    if (advances[gid] !== advance) {
      advances[gid] = advance
      patched = true
    }
  }

  // Encoding of the substitute: PDF/A requires WinAnsi or MacRoman as base for non-symbolic
  // TrueType, and AGL names in /Differences.
  const baseEncoding = encoding.base === "MacRomanEncoding" ? "MacRomanEncoding" : "WinAnsiEncoding"
  const baseTable = ENCODINGS[baseEncoding]
  const differences: [number, string][] = []
  for (let code = 0; code < 256; code++) {
    const g = glyphs[code]
    if (!g) continue
    const baseName = baseTable[code]
    const baseUnicode = baseName === undefined ? undefined : glyphNameToUnicode(baseName)
    if (baseUnicode !== g.unicode) differences.push([code, g.name])
  }

  return {
    original: original || "police sans nom",
    family,
    loaded,
    baseEncoding,
    differences,
    newWidths,
    advances,
    patched,
    missingWidth: descriptor?.get(N("MissingWidth")),
  }
}

// ---------------------------------------------------------------------------------------------
// Writing

function encodingObject(doc: PDFDocument, plan: FontPlan): PDFObject {
  if (plan.differences.length === 0) return N(plan.baseEncoding)
  const diffs = doc.context.obj([])
  let next = -1
  for (const [code, name] of plan.differences) {
    if (code !== next) diffs.push(PDFNumber.of(code))
    diffs.push(N(name))
    next = code + 1
  }
  return doc.context.obj({ Type: "Encoding", BaseEncoding: plan.baseEncoding, Differences: diffs })
}

function applyPlan(doc: PDFDocument, font: PDFDict, plan: FontPlan, programs: Map<string, PDFRef>) {
  const ctx = doc.context
  const { style, program } = plan.loaded
  const variant = plan.patched ? plan.advances.join(",") : "original"
  const id = `${style.postScriptName}|${variant}`
  const baseFont = `${subsetTag(id)}+${style.postScriptName}`
  let fileRef = programs.get(id)
  if (!fileRef) {
    const bytes = plan.patched ? program.withAdvances(plan.advances) : program.bytes
    fileRef = ctx.register(ctx.flateStream(bytes, { Length1: bytes.length }))
    programs.set(id, fileRef)
  }
  const flags =
    32 +
    (plan.family.fixedPitch ? 1 : 0) +
    (plan.family.serif ? 2 : 0) +
    (style.italicAngle !== 0 ? 64 : 0)
  const descriptor = ctx.obj({
    Type: "FontDescriptor",
    FontName: baseFont,
    Flags: flags,
    FontBBox: style.bbox,
    ItalicAngle: style.italicAngle,
    Ascent: style.ascent,
    Descent: style.descent,
    CapHeight: style.capHeight,
    StemV: style.stemV,
    FontFile2: fileRef,
  })
  if (plan.missingWidth !== undefined) descriptor.set(N("MissingWidth"), plan.missingWidth)
  const descriptorRef = ctx.register(descriptor)
  const encoding = encodingObject(doc, plan)

  font.set(N("Subtype"), N("TrueType"))
  font.set(N("BaseFont"), N(baseFont))
  font.set(N("Encoding"), encoding)
  font.set(N("FontDescriptor"), descriptorRef)
  if (plan.newWidths) {
    font.set(N("FirstChar"), PDFNumber.of(plan.newWidths.first))
    font.set(N("LastChar"), PDFNumber.of(plan.newWidths.last))
    font.set(N("Widths"), ctx.obj(plan.newWidths.widths))
  }
}

/**
 * Substitute every repairable font of `uses` in place. Never throws: a font that cannot be
 * handled is left untouched and reported in `fontsUnrepairable`.
 */
export async function repairNonEmbeddedFonts(
  doc: PDFDocument,
  uses: FontUse[],
): Promise<FontRepairReport> {
  const cache = new FamilyCache()
  const programs = new Map<string, PDFRef>()
  const replaced = new Map<string, ReplacedFont>()
  const unrepairable = new Map<string, UnrepairableFont>()
  for (const use of uses) {
    const name =
      stripSubsetPrefix(nameOf(doc, use.font.get(N("BaseFont"))) ?? "") || "police sans nom"
    try {
      const plan = await planFont(doc, use.font, cache)
      applyPlan(doc, use.font, plan, programs)
      const substitute = plan.loaded.style.postScriptName
      const key = `${plan.original}>${substitute}`
      const entry = replaced.get(key) ?? { original: plan.original, substitute, pages: [] }
      entry.pages = [...new Set([...entry.pages, ...use.pages])].sort((a, b) => a - b)
      replaced.set(key, entry)
    } catch (error) {
      const reason =
        error instanceof Unrepairable
          ? error.message
          : "erreur inattendue pendant le remplacement : la police est laissée telle quelle"
      if (!unrepairable.has(name)) unrepairable.set(name, { name, reason })
    }
  }
  return { fontsReplaced: [...replaced.values()], fontsUnrepairable: [...unrepairable.values()] }
}
