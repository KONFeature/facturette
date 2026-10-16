/**
 * Page preview renderer (canvas) on top of the shared pdf.js bootstrap.
 *
 * Usage (UI):
 * ```ts
 * const preview = await openPdfPreview(bytes)          // throws PdfReadError
 * const { width, height, scale } = await preview.renderPage(1, canvasEl, { width: 480 })
 * // `width`/`height` are CSS pixels, `scale` = CSS px per PDF point (use it to place highlight boxes
 * // from PdfTextItem coordinates: left = item.x * scale). The canvas backing store is multiplied by
 * // devicePixelRatio for crisp output. Calling renderPage again on the same canvas cancels the
 * // previous render (the superseded call resolves with its size but paints nothing).
 * preview.destroy()                                     // on unmount / new file
 * ```
 */
import { openDocument, type PdfDocumentProxy } from "./pdfjs"

export interface PdfPreview {
  pageCount: number
  renderPage(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    options: { width: number },
  ): Promise<{ width: number; height: number; scale: number }>
  destroy(): void
}

interface RenderHandle {
  cancel(): void
}

/** Upper bound of a canvas backing store (about 64 MB of RGBA): protects against hostile page sizes. */
const MAX_CANVAS_PIXELS = 16_000_000

export async function openPdfPreview(data: Uint8Array): Promise<PdfPreview> {
  const { pdf, destroy } = await openDocument(data)
  return createPreview(pdf, destroy)
}

function createPreview(pdf: PdfDocumentProxy, destroyDocument: () => Promise<void>): PdfPreview {
  const inFlight = new WeakMap<HTMLCanvasElement, RenderHandle>()
  const generations = new WeakMap<HTMLCanvasElement, number>()
  let destroyed = false

  return {
    pageCount: pdf.numPages,

    async renderPage(pageNumber, canvas, options) {
      if (destroyed) throw new Error("Aperçu fermé.")
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) {
        throw new RangeError(`Page ${pageNumber} inexistante (1 à ${pdf.numPages}).`)
      }
      const generation = (generations.get(canvas) ?? 0) + 1
      generations.set(canvas, generation)
      inFlight.get(canvas)?.cancel()

      const page = await pdf.getPage(pageNumber)
      const base = page.getViewport({ scale: 1 })
      const scale = options.width / base.width
      const ratio = Math.max(1, globalThis.devicePixelRatio || 1)
      // A hostile MediaBox (e.g. 1 x 14400 pt) must not allocate a gigantic canvas: cap the backing
      // store, at the cost of resolution (the CSS size, hence the layout, is unchanged).
      const pixelScale = Math.min(
        scale * ratio,
        Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, base.width * base.height)),
      )
      const viewport = page.getViewport({ scale: pixelScale })
      const size = { width: base.width * scale, height: base.height * scale, scale }

      // A newer call on this canvas started while we awaited the page: it wins.
      if (generations.get(canvas) !== generation) {
        page.cleanup()
        return size
      }

      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${size.width}px`
      canvas.style.height = `${size.height}px`
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Canvas 2D indisponible.")

      const task = page.render({ canvas, canvasContext: context, viewport })
      inFlight.set(canvas, task)
      try {
        await task.promise
      } catch (error) {
        if (error instanceof Error && error.name === "RenderingCancelledException") return size
        throw error
      } finally {
        if (inFlight.get(canvas) === task) inFlight.delete(canvas)
        page.cleanup()
      }
      return size
    },

    destroy() {
      if (destroyed) return
      destroyed = true
      void destroyDocument().catch(() => undefined)
    },
  }
}
