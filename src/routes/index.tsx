import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  return (
    <section className="space-y-3">
      <h1 className="text-3xl font-semibold tracking-tight">Facturette</h1>
      <p className="max-w-prose text-slate-600">
        Générez des factures au format Factur-X, conformes à la réglementation française. Tout se
        passe dans votre navigateur.
      </p>
    </section>
  )
}
