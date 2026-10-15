/**
 * Minimal TrueType (sfnt) reader/writer for the substitute fonts: Unicode cmap lookup, advance
 * widths, and rewriting `hmtx` so that the embedded program carries exactly the widths of the PDF
 * font dictionary (PDF/A rule 6.2.11.5: dictionary and program widths must agree).
 */

interface TableRecord {
  tag: string
  offset: number
  length: number
}

export class TrueTypeFont {
  readonly bytes: Uint8Array
  private readonly view: DataView
  private readonly tables = new Map<string, TableRecord>()
  readonly unitsPerEm: number
  readonly numGlyphs: number
  private readonly cmap = new Map<number, number>()
  /** Advance width of every glyph, font units. */
  readonly advances: number[]

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const numTables = this.view.getUint16(4)
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16
      const tag = String.fromCharCode(...bytes.subarray(rec, rec + 4))
      const offset = this.view.getUint32(rec + 8)
      const length = this.view.getUint32(rec + 12)
      if (offset + length > bytes.length) throw new Error(`table ${tag} out of bounds`)
      this.tables.set(tag, { tag, offset, length })
    }
    this.unitsPerEm = this.view.getUint16(this.table("head").offset + 18)
    this.numGlyphs = this.view.getUint16(this.table("maxp").offset + 4)
    this.advances = this.readAdvances()
    this.readCmap()
  }

  private table(tag: string): TableRecord {
    const t = this.tables.get(tag)
    if (!t) throw new Error(`missing table ${tag}`)
    return t
  }

  private readAdvances(): number[] {
    const count = this.view.getUint16(this.table("hhea").offset + 34)
    const hmtx = this.table("hmtx").offset
    if (count < 1 || count > this.numGlyphs) throw new Error("bad numberOfHMetrics")
    const out: number[] = []
    for (let g = 0; g < this.numGlyphs; g++) {
      out.push(this.view.getUint16(hmtx + Math.min(g, count - 1) * 4))
    }
    return out
  }

  private lsb(glyph: number): number {
    const count = this.view.getUint16(this.table("hhea").offset + 34)
    const hmtx = this.table("hmtx").offset
    return glyph < count
      ? this.view.getInt16(hmtx + glyph * 4 + 2)
      : this.view.getInt16(hmtx + count * 4 + (glyph - count) * 2)
  }

  /** Windows Unicode BMP cmap (3,1), format 4. */
  private readCmap() {
    const base = this.table("cmap").offset
    const v = this.view
    const n = v.getUint16(base + 2)
    let sub = -1
    for (let i = 0; i < n; i++) {
      const rec = base + 4 + i * 8
      if (v.getUint16(rec) === 3 && v.getUint16(rec + 2) === 1) sub = base + v.getUint32(rec + 4)
    }
    if (sub < 0 || v.getUint16(sub) !== 4) throw new Error("no (3,1) format 4 cmap")
    const segCount = v.getUint16(sub + 6) / 2
    const ends = sub + 14
    const starts = ends + segCount * 2 + 2
    const deltas = starts + segCount * 2
    const rangeOffsets = deltas + segCount * 2
    for (let s = 0; s < segCount; s++) {
      const end = v.getUint16(ends + s * 2)
      const start = v.getUint16(starts + s * 2)
      const delta = v.getInt16(deltas + s * 2)
      const ro = v.getUint16(rangeOffsets + s * 2)
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let glyph: number
        if (ro === 0) glyph = (c + delta) & 0xffff
        else {
          const at = rangeOffsets + s * 2 + ro + (c - start) * 2
          glyph = v.getUint16(at)
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff
        }
        if (glyph !== 0 && glyph < this.numGlyphs) this.cmap.set(c, glyph)
      }
    }
  }

  glyphForUnicode(codePoint: number): number | undefined {
    return this.cmap.get(codePoint)
  }

  /** Copy of the font where every glyph has the given advance (font units). */
  withAdvances(advances: readonly number[]): Uint8Array {
    if (advances.length !== this.numGlyphs) throw new Error("advance count mismatch")
    const hmtx = new Uint8Array(this.numGlyphs * 4)
    const hv = new DataView(hmtx.buffer)
    let max = 0
    for (let g = 0; g < this.numGlyphs; g++) {
      const adv = advances[g] ?? 0
      if (!Number.isInteger(adv) || adv < 0 || adv > 0xffff) throw new Error("bad advance")
      max = Math.max(max, adv)
      hv.setUint16(g * 4, adv)
      hv.setInt16(g * 4 + 2, this.lsb(g))
    }
    const hheaRec = this.table("hhea")
    const hhea = this.bytes.slice(hheaRec.offset, hheaRec.offset + hheaRec.length)
    const hh = new DataView(hhea.buffer)
    hh.setUint16(10, max)
    hh.setUint16(34, this.numGlyphs)
    const replaced = new Map<string, Uint8Array>([
      ["hmtx", hmtx],
      ["hhea", hhea],
    ])
    const tables = [...this.tables.values()].map((t) => ({
      tag: t.tag,
      data: replaced.get(t.tag) ?? this.bytes.slice(t.offset, t.offset + t.length),
    }))
    return writeSfnt(this.view.getUint32(0), tables)
  }
}

function checksum(data: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    const word =
      ((data[i] ?? 0) << 24) |
      ((data[i + 1] ?? 0) << 16) |
      ((data[i + 2] ?? 0) << 8) |
      (data[i + 3] ?? 0)
    sum = (sum + (word >>> 0)) >>> 0
  }
  return sum
}

function writeSfnt(version: number, tables: { tag: string; data: Uint8Array }[]): Uint8Array {
  tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
  const numTables = tables.length
  const headerSize = 12 + numTables * 16
  let size = headerSize
  for (const t of tables) size += (t.data.length + 3) & ~3
  const out = new Uint8Array(size)
  const v = new DataView(out.buffer)
  let entrySelector = 0
  while (1 << (entrySelector + 1) <= numTables) entrySelector++
  const searchRange = (1 << entrySelector) * 16
  v.setUint32(0, version)
  v.setUint16(4, numTables)
  v.setUint16(6, searchRange)
  v.setUint16(8, entrySelector)
  v.setUint16(10, numTables * 16 - searchRange)
  let offset = headerSize
  let headOffset = -1
  tables.forEach((t, i) => {
    const data = t.data
    if (t.tag === "head") {
      // checkSumAdjustment is computed over the whole file with this field at zero.
      new DataView(data.buffer, data.byteOffset, data.byteLength).setUint32(8, 0)
      headOffset = offset
    }
    const rec = 12 + i * 16
    for (let k = 0; k < 4; k++) out[rec + k] = t.tag.charCodeAt(k)
    v.setUint32(rec + 4, checksum(data))
    v.setUint32(rec + 8, offset)
    v.setUint32(rec + 12, data.length)
    out.set(data, offset)
    offset += (data.length + 3) & ~3
  })
  if (headOffset >= 0) v.setUint32(headOffset + 8, (0xb1b0afba - checksum(out)) >>> 0)
  return out
}
