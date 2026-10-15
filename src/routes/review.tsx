import { createFileRoute } from "@tanstack/react-router"
import { requirePdf } from "../app/store"
import { useDocumentTitle } from "../app/useDocumentTitle"

// PLACEHOLDER: replaced by the ui-review lane in wave 2.
export const Route = createFileRoute("/review")({
  beforeLoad: () => requirePdf(),
  component: ReviewPlaceholder,
})

function ReviewPlaceholder() {
  useDocumentTitle("Vérifier")
  return (
    <section className="space-y-3">
      <h1 className="text-3xl">Vérifier les informations</h1>
      <p className="text-ink-soft">Le formulaire de vérification arrive bientôt.</p>
    </section>
  )
}
