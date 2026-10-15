import type { PdfTextDocument } from "./types"

/**
 * Read the text layer of a PDF with pdf.js, in the browser AND in Node (unit tests).
 * Never touches the network. Throws a typed error for unreadable or password-protected files.
 *
 * OWNER: lane `pdf-text`. Keep this signature.
 */
export async function extractPdfText(_data: ArrayBuffer | Uint8Array): Promise<PdfTextDocument> {
  throw new Error("extractPdfText: not implemented")
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
