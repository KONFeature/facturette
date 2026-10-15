import { createContext, useContext } from "react"
import type { InvoiceDraft } from "../../domain/invoice"
import type { BoundingBox, Suggestion } from "../../lib/extract/types"
import type { ValidationReport } from "../../lib/validation"
import type { FieldState } from "./fieldState"

/** A zone of the PDF to outline in the preview pane. */
export interface Highlight {
  /** Path of the field the zone belongs to (for the caption and for toggling). */
  path: string
  bbox: BoundingBox
  /** The raw PDF text read there. */
  text: string
  /** Changes on every request, so asking for the same zone twice scrolls to it twice. */
  nonce: number
}

export interface ReviewContextValue {
  /** Draft built from the current form values (live). */
  draft: InvoiceDraft
  report: ValidationReport
  requiredPaths: ReadonlySet<string>
  submitted: boolean
  highlight: Highlight | null
  /** Derived state of one field (see `fieldState.ts`). */
  stateOf(path: string): FieldState
  /** The field was visited: its issues may now be shown. */
  touch(path: string): void
  /** Write a candidate into the form and move the highlight to its evidence. */
  applySuggestion(suggestion: Suggestion): void
  /** Outline the evidence of a candidate in the PDF pane (opens the pane on small screens). */
  showEvidence(suggestion: Suggestion): void
  /**
   * Lines were added, removed, duplicated or moved: `newToOld[i]` is the previous index of the line
   * now at `i` (`null` = new line). Keeps line-indexed candidates attached to their line.
   */
  onLinesChanged(newToOld: readonly (number | null)[]): void
}

const ReviewContext = createContext<ReviewContextValue | null>(null)

export const ReviewProvider = ReviewContext.Provider

export function useReview(): ReviewContextValue {
  const value = useContext(ReviewContext)
  if (!value) throw new Error("useReview must be used inside <ReviewProvider>")
  return value
}
