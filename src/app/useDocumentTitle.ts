import { useEffect } from "react"

/** Sets `document.title` to "<page> · Facturette" (screen readers announce it on navigation). */
export function useDocumentTitle(page: string): void {
  useEffect(() => {
    document.title = `${page} · Facturette`
  }, [page])
}
