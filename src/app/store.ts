import { redirect } from "@tanstack/react-router"
import { create } from "zustand"
import type { InvoiceDraft } from "../domain/invoice"
import type { ExtractionResult } from "../lib/extract/types"
import type { PdfTextDocument } from "../lib/pdf/types"
import { type AppDeps, defaultDeps } from "./deps"
import { patchDraftValue } from "./merge"
import { type LoadedPdf, loadPdfPipeline, type PdfFileLike, PdfLoadError } from "./pipeline"

export type ImportStatus = "idle" | "reading" | "ready" | "error"

export interface StoredPdf {
  name: string
  size: number
  /** Original bytes, embedded untouched into the Factur-X file. Never persisted. */
  bytes: Uint8Array
}

export interface AppState {
  pdf: StoredPdf | null
  textDoc: PdfTextDocument | null
  extraction: ExtractionResult | null
  draft: InvoiceDraft
  /** Import step status. */
  status: ImportStatus
  /** French message of the last import failure (status === "error"). */
  error: { kind: PdfLoadError["kind"] | "unexpected"; message: string } | null

  /** Read + extract + merge defaults. Resolves true on success; failures land in `error`. */
  loadPdf(file: PdfFileLike): Promise<boolean>
  /** Deep-merge a partial draft (the patch wins, blanks included). */
  patchDraft(patch: InvoiceDraft): void
  /** Replace the whole draft (e.g. react-hook-form `getValues()`). */
  setDraft(draft: InvoiceDraft): void
  /** Forget the PDF, the extraction and the draft. Saved profile and customers are untouched. */
  reset(): void
}

const initial = (): Pick<
  AppState,
  "pdf" | "textDoc" | "extraction" | "draft" | "status" | "error"
> => ({
  pdf: null,
  textDoc: null,
  extraction: null,
  draft: {},
  status: "idle",
  error: null,
})

/** Store factory; tests build one with fake `deps`. */
export function createAppStore(deps: AppDeps) {
  let token = 0
  return create<AppState>()((set) => ({
    ...initial(),

    async loadPdf(file) {
      const mine = ++token
      set({ ...initial(), status: "reading" })
      try {
        const loaded: LoadedPdf = await loadPdfPipeline(file, deps)
        if (mine !== token) return false
        set({
          pdf: loaded.pdf,
          textDoc: loaded.textDoc,
          extraction: loaded.extraction,
          draft: loaded.draft,
          status: "ready",
          error: null,
        })
        return true
      } catch (error) {
        if (mine !== token) return false
        const known = error instanceof PdfLoadError
        set({
          ...initial(),
          status: "error",
          error: {
            kind: known ? error.kind : "unexpected",
            message: known
              ? error.message
              : "Une erreur inattendue est survenue pendant la lecture du PDF. Réessayez avec un autre fichier.",
          },
        })
        return false
      }
    },

    patchDraft: (patch) => set((s) => ({ draft: patchDraftValue(s.draft, patch) })),
    setDraft: (draft) => set({ draft }),
    reset: () => {
      token++
      set(initial())
    },
  }))
}

export const useAppStore = createAppStore(defaultDeps)

// Selectors
export const selectHasPdf = (s: AppState) => s.pdf !== null
/** PDF without a text layer: extraction found nothing and the user fills everything. */
export const selectIsScanned = (s: AppState) => s.textDoc !== null && !s.textDoc.hasTextLayer

/** Route guard for `beforeLoad`: a PDF must have been imported, else back to the import step. */
export function requirePdf(store: Pick<typeof useAppStore, "getState"> = useAppStore): void {
  if (!store.getState().pdf) throw redirect({ to: "/" })
}

/** Route guard for the download step: a PDF and a draft that passes validation. */
export function requireReadyDraft(
  deps: Pick<AppDeps, "validateInvoice"> = defaultDeps,
  store: Pick<typeof useAppStore, "getState"> = useAppStore,
): void {
  const { pdf, draft } = store.getState()
  if (!pdf) throw redirect({ to: "/" })
  if (!deps.validateInvoice(draft).ready) throw redirect({ to: "/review" })
}
