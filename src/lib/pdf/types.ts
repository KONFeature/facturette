/**
 * Output of the PDF text layer reader. Coordinates are in PDF points (1/72 in) at scale 1,
 * ORIGIN TOP-LEFT, y growing DOWNWARD (already flipped from PDF user space), so reading order
 * is simply "sort by y, then x" and boxes can be drawn over a canvas without conversion.
 */
export interface PdfTextItem {
  text: string
  /** Left edge. */
  x: number
  /** Top edge. */
  y: number
  width: number
  height: number
  fontSize: number
  fontName?: string
  /** 1-based. */
  page: number
}

/** Items that sit on the same visual row, sorted left→right. */
export interface PdfTextLine {
  page: number
  /** Top edge of the row (median of its items). */
  y: number
  x0: number
  x1: number
  height: number
  /** Items joined with a space where there is a visible gap. */
  text: string
  items: PdfTextItem[]
}

export interface PdfPage {
  /** 1-based. */
  number: number
  width: number
  height: number
  items: PdfTextItem[]
  /** Reading order, top→bottom. */
  lines: PdfTextLine[]
  /** `lines` joined with "\n". */
  text: string
}

export interface PdfTextDocument {
  pageCount: number
  pages: PdfPage[]
  /** All pages, joined with "\n\n". */
  text: string
  /** False for scanned/image-only PDFs: nothing can be extracted without OCR. */
  hasTextLayer: boolean
  info: {
    title?: string
    author?: string
    creator?: string
    producer?: string
    isEncrypted: boolean
  }
}
