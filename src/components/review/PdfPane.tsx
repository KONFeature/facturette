import { memo, type RefObject, useCallback, useEffect, useRef, useState } from "react"
import { formatFileSize } from "../../app/format"
import { openPdfPreview, type PdfPreview } from "../../lib/pdf/preview"
import { cx } from "../ui"
import type { Highlight } from "./ReviewContext"

export interface PdfPaneProps {
  bytes: Uint8Array
  name: string
  size: number
  highlight: Highlight | null
  /** Small screens: is the pane expanded? On large screens it is always shown. */
  open: boolean
  onOpenChange(open: boolean): void
  onClearHighlight(): void
}

type PreviewState =
  | { phase: "loading" }
  | { phase: "ready"; preview: PdfPreview }
  | { phase: "error" }

/** Padding around the highlighted text, in CSS px. */
const HIGHLIGHT_PAD = 3
/** A4 height / width, until the real page size is known. */
const A4_RATIO = Math.SQRT2

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * The imported PDF next to the form: pages stacked vertically, fitted to the pane width,
 * rendered lazily, re-rendered on resize, with an outline over the evidence of a field.
 * Sticky on large screens; below `lg` it is a collapsible bar ("Voir le PDF") kept at the top.
 */
export const PdfPane = memo(function PdfPane({
  bytes,
  name,
  size,
  highlight,
  open,
  onOpenChange,
  onClearHighlight,
}: PdfPaneProps) {
  const [state, setState] = useState<PreviewState>({ phase: "loading" })
  const scrollRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const width = useContainerWidth(innerRef)

  useEffect(() => {
    let cancelled = false
    let opened: PdfPreview | null = null
    setState({ phase: "loading" })
    // pdf.js may detach the buffer it receives: hand it a copy, the store keeps the original.
    openPdfPreview(bytes.slice())
      .then((preview) => {
        if (cancelled) {
          preview.destroy()
          return
        }
        opened = preview
        setState({ phase: "ready", preview })
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "error" })
      })
    return () => {
      cancelled = true
      opened?.destroy()
    }
  }, [bytes])

  const scrollToOverlay = useCallback((el: HTMLElement) => {
    const container = scrollRef.current
    if (!container) return
    const box = el.getBoundingClientRect()
    const frame = container.getBoundingClientRect()
    const top =
      container.scrollTop + (box.top - frame.top) - container.clientHeight / 2 + box.height / 2
    container.scrollTo({
      top: Math.max(0, top),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    })
  }, [])

  const pageCount = state.phase === "ready" ? state.preview.pageCount : null

  return (
    <aside
      aria-label="Aperçu du PDF importé"
      className="max-lg:sticky max-lg:top-0 max-lg:z-30 lg:sticky lg:top-4 lg:self-start"
    >
      <div className="overflow-hidden rounded-panel border border-rule bg-surface shadow-panel">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="text-base">Votre PDF</h2>
            <p className="truncate text-sm text-ink-muted">
              {name} · {formatFileSize(size)}
              {pageCount ? ` · ${pageCount} page${pageCount > 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-10 shrink-0 items-center rounded-control border border-rule-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-sunken lg:hidden"
            aria-expanded={open}
            aria-controls="pdf-pane-body"
            onClick={() => onOpenChange(!open)}
          >
            {open ? "Masquer le PDF" : "Voir le PDF"}
          </button>
        </div>

        <div
          id="pdf-pane-body"
          className={cx("border-t border-rule", open ? "block" : "hidden lg:block")}
        >
          <div aria-live="polite" className="empty:hidden">
            {highlight && (
              <p className="flex items-start justify-between gap-3 border-b border-rule bg-accent-soft px-4 py-2 text-sm text-ink">
                <span className="min-w-0 break-words">Zone repérée : « {highlight.text} »</span>
                <button
                  type="button"
                  onClick={onClearHighlight}
                  className="shrink-0 rounded-control text-accent underline underline-offset-2"
                >
                  Effacer
                </button>
              </p>
            )}
          </div>
          <section
            ref={scrollRef}
            // Scrollable region: focusable so keyboard users can scroll it with the arrow keys.
            // biome-ignore lint/a11y/noNoninteractiveTabindex: scroll container
            tabIndex={0}
            aria-label="Pages du PDF"
            className="max-h-[42dvh] overflow-auto bg-sunken p-3 lg:max-h-[calc(100dvh-9.5rem)]"
          >
            <div ref={innerRef} className="flex flex-col gap-3">
              {state.phase === "loading" && (
                <p className="py-10 text-center text-sm text-ink-muted">Chargement de l’aperçu…</p>
              )}
              {state.phase === "error" && (
                <p className="py-10 text-center text-sm text-ink-soft">
                  L’aperçu n’a pas pu être affiché. Vous pouvez remplir le formulaire sans lui.
                </p>
              )}
              {state.phase === "ready" &&
                width > 0 &&
                Array.from({ length: state.preview.pageCount }, (_, i) => i + 1).map((page) => (
                  <PageView
                    key={page}
                    preview={state.preview}
                    pageNumber={page}
                    width={width}
                    rootRef={scrollRef}
                    highlight={highlight && highlight.bbox.page === page ? highlight : null}
                    onOverlay={scrollToOverlay}
                  />
                ))}
            </div>
          </section>
        </div>
      </div>
    </aside>
  )
})

/** Width of the element in CSS px, debounced while the window is being resized. */
function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const measure = () => setWidth(Math.floor(el.clientWidth))
    measure()
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(measure, 120)
    })
    observer.observe(el)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [ref])
  return width
}

interface PageViewProps {
  preview: PdfPreview
  pageNumber: number
  width: number
  rootRef: RefObject<HTMLElement | null>
  highlight: Highlight | null
  onOverlay(el: HTMLElement): void
}

function PageView({ preview, pageNumber, width, rootRef, highlight, onOverlay }: PageViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [metrics, setMetrics] = useState<{ width: number; height: number; scale: number } | null>(
    null,
  )

  // Render only once the page is near the viewport of the pane (or when a highlight needs it).
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true)
      },
      { root: rootRef.current, rootMargin: "600px 0px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootRef])

  const mustRender = visible || highlight !== null
  useEffect(() => {
    const canvas = canvasRef.current
    if (!mustRender || !canvas) return
    let cancelled = false
    preview
      .renderPage(pageNumber, canvas, { width })
      .then((m) => {
        if (!cancelled) setMetrics(m)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [preview, pageNumber, width, mustRender])

  const overlayRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) onOverlay(el)
    },
    [onOverlay],
  )

  const boxHeight = metrics?.height ?? width * A4_RATIO
  const bbox = highlight?.bbox
  return (
    <div
      ref={wrapperRef}
      className="relative mx-auto bg-white shadow-panel ring-1 ring-rule"
      style={{ width: metrics?.width ?? width, height: boxHeight }}
      data-page={pageNumber}
    >
      <canvas ref={canvasRef} className="block" role="img" aria-label={`Page ${pageNumber}`} />
      {highlight && bbox && metrics && (
        <div
          key={highlight.nonce}
          ref={overlayRef}
          aria-hidden="true"
          data-highlight
          className="pointer-events-none absolute rounded-sm bg-[rgb(255_208_0/0.32)] ring-2 ring-accent"
          style={{
            left: bbox.x * metrics.scale - HIGHLIGHT_PAD,
            top: bbox.y * metrics.scale - HIGHLIGHT_PAD,
            width: bbox.width * metrics.scale + HIGHLIGHT_PAD * 2,
            height: bbox.height * metrics.scale + HIGHLIGHT_PAD * 2,
          }}
        />
      )}
    </div>
  )
}
