/**
 * DOM side of "go to the offending field". Every input carries `name="<draft path>"` (react-hook-form)
 * or `data-field="<draft path>"` (the custom VAT rate select), so a validation path finds its input.
 */
import { sectionForPath } from "./issues"

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
const behavior = (): ScrollBehavior => (prefersReducedMotion() ? "auto" : "smooth")

/** Scroll so that `el` sits in the upper half of the window, clear of the sticky bottom bar. */
function scrollToUpperThird(el: HTMLElement): void {
  const top = window.scrollY + el.getBoundingClientRect().top - window.innerHeight * 0.3
  window.scrollTo({ top: Math.max(0, top), behavior: behavior() })
}

export function findFieldElement(path: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[name="${path}"], [data-field="${path}"]`)
}

/** Focus the input of `path`, or the first control of its section when it has no input. */
export function focusField(path: string): boolean {
  const el = findFieldElement(path)
  if (el) {
    scrollToUpperThird(el)
    el.focus({ preventScroll: true })
    return true
  }
  const section = document.getElementById(sectionForPath(path))
  if (!section) return false
  section.scrollIntoView({ block: "start", behavior: behavior() })
  section
    .querySelector<HTMLElement>("input, select, textarea, button")
    ?.focus({ preventScroll: true })
  return true
}

/** Of several issue paths, the one whose input comes first in the page. */
export function firstInDocument(paths: readonly string[]): string | null {
  let best: { path: string; el: HTMLElement } | null = null
  for (const path of paths) {
    const el = findFieldElement(path) ?? document.getElementById(sectionForPath(path))
    if (!el) continue
    if (!best || best.el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) {
      best = { path, el }
    }
  }
  return best?.path ?? null
}
