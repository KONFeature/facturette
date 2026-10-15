import { createFileRoute } from "@tanstack/react-router"
import { requirePdf } from "../app/store"
import { useDocumentTitle } from "../app/useDocumentTitle"
import { ReviewScreen } from "../components/review/ReviewScreen"

export const Route = createFileRoute("/review")({
  beforeLoad: () => requirePdf(),
  component: ReviewStep,
})

function ReviewStep() {
  useDocumentTitle("Vérifier la facture")
  return <ReviewScreen />
}
