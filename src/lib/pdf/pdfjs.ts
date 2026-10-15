/**
 * Shared pdf.js bootstrap. Loads the library once, in the browser AND in Node (vitest / bun scripts).
 *
 * - Browser: the worker is a LOCAL asset, bundled by Vite through a `?url` import. Nothing is fetched
 *   from a CDN.
 * - Node: the legacy build is used together with its worker module set on `globalThis.pdfjsWorker`,
 *   so pdf.js runs its "fake worker" in-process without touching the filesystem or the network.
 */
import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api"
import { PdfReadError } from "./extract-text"

export type PdfJs = typeof import("pdfjs-dist")
export type PdfDocumentProxy = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>

interface PdfJsWorkerGlobal {
  pdfjsWorker?: unknown
}

const nodeProcess = (globalThis as { process?: { versions?: { node?: string } } }).process
const isNode = typeof document === "undefined" && !!nodeProcess?.versions?.node

let pdfjsPromise: Promise<PdfJs> | undefined

async function bootstrap(): Promise<PdfJs> {
  if (isNode) {
    // Variable specifiers: the bundler must not follow them (they would bloat the browser build).
    const libSpecifier = "pdfjs-dist/legacy/build/pdf.mjs"
    const workerSpecifier = "pdfjs-dist/legacy/build/pdf.worker.mjs"
    const lib: PdfJs = await import(/* @vite-ignore */ libSpecifier)
    const worker: unknown = await import(/* @vite-ignore */ workerSpecifier)
    ;(globalThis as PdfJsWorkerGlobal).pdfjsWorker = worker
    return lib
  }
  const lib = await import("pdfjs-dist")
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  lib.GlobalWorkerOptions.workerSrc = workerUrl
  return lib
}

/** Loads pdf.js once; the returned promise is shared. A failed load can be retried. */
export function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= bootstrap().catch((error: unknown) => {
    pdfjsPromise = undefined
    throw error
  })
  return pdfjsPromise
}

/**
 * Safe, offline defaults for every document we open. (pdf.js v6 no longer evaluates generated code,
 * so the former `isEvalSupported: false` option does not exist anymore.)
 */
const baseOptions: Partial<DocumentInitParameters> = {
  useWorkerFetch: false,
  disableAutoFetch: true,
  disableStream: true,
  verbosity: 0,
}

/** Map any pdf.js failure to a typed PdfReadError. */
export function toPdfReadError(error: unknown): PdfReadError {
  if (error instanceof PdfReadError) return error
  const name = error instanceof Error ? error.name : ""
  const message = error instanceof Error ? error.message : String(error)
  if (name === "PasswordException") {
    return new PdfReadError("encrypted", "Ce PDF est protégé par un mot de passe.")
  }
  if (name === "InvalidPDFException" || name === "MissingPDFException" || name === "FormatError") {
    return new PdfReadError("invalid", "Ce fichier n'est pas un PDF lisible.")
  }
  return new PdfReadError("unsupported", `Ce PDF ne peut pas être lu (${message}).`)
}

/**
 * Opens a document from bytes. The bytes are copied first because pdf.js transfers (detaches) the
 * buffer it receives. The caller MUST call `destroy()` on the returned handle.
 */
export async function openDocument(
  data: ArrayBuffer | Uint8Array,
): Promise<{ pdf: PdfDocumentProxy; destroy: () => Promise<void> }> {
  const pdfjs = await loadPdfJs()
  const copy = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0))
  const task = pdfjs.getDocument({ ...baseOptions, data: copy })
  try {
    const pdf = await task.promise
    return { pdf, destroy: () => task.destroy() }
  } catch (error) {
    await task.destroy().catch(() => undefined)
    throw toPdfReadError(error)
  }
}
