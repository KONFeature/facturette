import { openDocument, toPdfReadError } from "./pdfjs"
import type { PdfPage, PdfTextDocument, PdfTextItem, PdfTextLine } from "./types"

/**
 * Read the text layer of a PDF with pdf.js, in the browser AND in Node (unit tests).
 * Never touches the network. Throws a typed error for unreadable or password-protected files.
 *
 * OWNER: lane `pdf-text`. Keep this signature.
 */
export async function extractPdfText(data: ArrayBuffer | Uint8Array): Promise<PdfTextDocument> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const { pdf, destroy } = await openDocument(bytes)
  try {
    const pages: PdfPage[] = []
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number)
      try {
        const viewport = page.getViewport({ scale: 1 })
        const content = await page.getTextContent()
        const items: PdfTextItem[] = []
        for (const raw of content.items) {
          if (!("str" in raw)) continue
          const item = toTextItem(raw, number, viewport)
          if (item) items.push(item)
        }
        const lines = groupLines(dedupeItems(items), number)
        pages.push({
          number,
          width: viewport.width,
          height: viewport.height,
          items,
          lines,
          text: lines.map((line) => line.text).join("\n"),
        })
      } finally {
        page.cleanup()
      }
    }
    const metadata = await pdf.getMetadata().catch(() => undefined)
    const info = readInfo(metadata?.info, looksEncrypted(bytes))
    const text = pages.map((page) => page.text).join("\n\n")
    return {
      pageCount: pdf.numPages,
      pages,
      text,
      hasTextLayer: text.replace(/\s/g, "").length >= MIN_TEXT_CHARS,
      info,
    }
  } catch (error) {
    throw toPdfReadError(error)
  } finally {
    await destroy().catch(() => undefined)
  }
}

export class PdfReadError extends Error {
  constructor(
    public readonly reason: "invalid" | "encrypted" | "unsupported",
    message: string,
  ) {
    super(message)
    this.name = "PdfReadError"
  }
}

const MIN_TEXT_CHARS = 20
/** Gap (in font sizes) from which two items on a line are separated by a space. */
const SPACE_GAP_RATIO = 0.17
/** Two items share a line when their baselines differ by less than this many font sizes. */
const BASELINE_TOLERANCE_RATIO = 0.4

interface RawTextItem {
  str: string
  transform: number[]
  width: number
  height: number
  fontName: string
}

interface Viewport {
  convertToViewportPoint(x: number, y: number): number[]
}

/**
 * Convert a pdf.js text run to a top-left box. The box is built from the run's own axes
 * (origin, advance direction, "up" direction) mapped through the viewport, so /Rotate and
 * rotated text both end up with the right bounding box.
 */
function toTextItem(raw: RawTextItem, page: number, viewport: Viewport): PdfTextItem | null {
  if (raw.str.trim() === "") return null
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = raw.transform
  const fontSize = Math.hypot(c, d) || Math.hypot(a, b)
  const advance = Math.hypot(a, b) || 1
  const ux = a / advance
  const uy = b / advance
  const upLength = Math.hypot(c, d) || 1
  const vx = c / upLength
  const vy = d / upLength
  const w = raw.width
  const corners: Array<[number, number]> = [
    [e, f],
    [e + ux * w, f + uy * w],
    [e + vx * fontSize, f + vy * fontSize],
    [e + ux * w + vx * fontSize, f + uy * w + vy * fontSize],
  ]
  const points = corners.map(([x, y]) => viewport.convertToViewportPoint(x, y))
  const xs = points.map((p) => p[0] ?? 0)
  const ys = points.map((p) => p[1] ?? 0)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    text: raw.str,
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
    fontSize,
    fontName: raw.fontName || undefined,
    page,
  }
}

/** Some generators draw text twice to fake bold: keep one copy. */
function dedupeItems(items: PdfTextItem[]): PdfTextItem[] {
  const kept: PdfTextItem[] = []
  for (const item of items) {
    const tolerance = item.fontSize * 0.1
    const twin = kept.some(
      (other) =>
        other.text === item.text &&
        Math.abs(other.x - item.x) <= tolerance &&
        Math.abs(other.y - item.y) <= tolerance,
    )
    if (!twin) kept.push(item)
  }
  return kept
}

function median(values: number[]): number {
  const sorted = [...values].sort((p, q) => p - q)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid] ?? 0
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? upper) + upper) / 2
}

interface LineBuilder {
  baseline: number
  fontSize: number
  items: PdfTextItem[]
}

/**
 * Group items into visual rows. Items belong to the same row when their baselines (box bottom)
 * are within a fraction of the font size, no matter how far apart they are horizontally, so table
 * rows and "label ..... value" pairs stay on one line.
 */
function groupLines(items: PdfTextItem[], page: number): PdfTextLine[] {
  const sorted = [...items].sort((p, q) => p.y + p.height - (q.y + q.height) || p.x - q.x)
  const builders: LineBuilder[] = []
  for (const item of sorted) {
    const baseline = item.y + item.height
    const current = builders[builders.length - 1]
    const tolerance =
      BASELINE_TOLERANCE_RATIO * Math.min(item.fontSize, current?.fontSize ?? item.fontSize)
    if (current && Math.abs(baseline - current.baseline) <= tolerance) {
      current.items.push(item)
      current.baseline = median(current.items.map((i) => i.y + i.height))
      current.fontSize = Math.max(current.fontSize, item.fontSize)
    } else {
      builders.push({ baseline, fontSize: item.fontSize, items: [item] })
    }
  }
  return builders.map((builder) => toLine(builder, page))
}

function toLine(builder: LineBuilder, page: number): PdfTextLine {
  const items = [...builder.items].sort((p, q) => p.x - q.x)
  let text = ""
  let previous: PdfTextItem | undefined
  for (const item of items) {
    if (previous) {
      const gap = item.x - (previous.x + previous.width)
      const reference = Math.min(previous.fontSize, item.fontSize)
      const alreadySpaced = /\s$/.test(text) || /^\s/.test(item.text)
      if (gap > SPACE_GAP_RATIO * reference && !alreadySpaced) text += " "
    }
    text += item.text
    previous = item
  }
  return {
    page,
    y: median(items.map((i) => i.y)),
    x0: Math.min(...items.map((i) => i.x)),
    x1: Math.max(...items.map((i) => i.x + i.width)),
    height: Math.max(...items.map((i) => i.height)),
    text: text.trim(),
    items,
  }
}

function readInfo(info: unknown, isEncrypted: boolean): PdfTextDocument["info"] {
  const record = typeof info === "object" && info !== null ? (info as Record<string, unknown>) : {}
  const pick = (key: string): string | undefined => {
    const value = record[key]
    return typeof value === "string" && value.trim() !== "" ? value : undefined
  }
  return {
    title: pick("Title"),
    author: pick("Author"),
    creator: pick("Creator"),
    producer: pick("Producer"),
    isEncrypted,
  }
}

/**
 * pdf.js opens files protected only by an owner password (empty user password) without asking;
 * they still carry an /Encrypt entry in the trailer. Detect it from the raw bytes.
 */
function looksEncrypted(bytes: Uint8Array): boolean {
  const tail = bytes.subarray(Math.max(0, bytes.length - 4096))
  let latin1 = ""
  for (const byte of tail) latin1 += String.fromCharCode(byte)
  return /\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(latin1)
}
