import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { BuildError, type BuiltFacturX, buildFacturX } from "../app/build"
import { defaultDeps } from "../app/deps"
import { formatEuro } from "../app/format"
import { requireReadyDraft, useAppStore } from "../app/store"
import { useDocumentTitle } from "../app/useDocumentTitle"
import { Alert, Button, buttonClasses, Card, Spinner } from "../components/ui"

export const Route = createFileRoute("/done")({
  beforeLoad: () => requireReadyDraft(),
  component: DoneStep,
})

type BuildState =
  | { phase: "building" }
  | { phase: "error"; message: string }
  | { phase: "ready"; result: BuiltFacturX }

function DoneStep() {
  useDocumentTitle("Télécharger la facture Factur-X")
  const navigate = useNavigate()
  const pdf = useAppStore((s) => s.pdf)
  const draft = useAppStore((s) => s.draft)
  const reset = useAppStore((s) => s.reset)
  const [state, setState] = useState<BuildState>({ phase: "building" })
  const [url, setUrl] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    setState({ phase: "building" })
    buildFacturX(draft, pdf.bytes, defaultDeps)
      .then((result) => {
        if (cancelled) return
        try {
          defaultDeps.rememberInvoiceNumber(result.invoice.number)
        } catch {
          // Remembering the number is a convenience; never block the download on it.
        }
        setState({ phase: "ready", result })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          phase: "error",
          message:
            error instanceof BuildError
              ? error.message
              : "La génération du fichier a échoué de façon inattendue. Revenez à l’étape « Vérifier » et réessayez.",
        })
      })
    return () => {
      cancelled = true
    }
  }, [pdf, draft])

  useEffect(() => {
    if (state.phase !== "ready") return
    const objectUrl = URL.createObjectURL(
      new Blob([state.result.bytes.slice()], { type: "application/pdf" }),
    )
    setUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [state])

  useEffect(() => {
    if (state.phase !== "building") headingRef.current?.focus()
  }, [state.phase])

  const startOver = () => {
    reset()
    void navigate({ to: "/" })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 ref={headingRef} tabIndex={-1} className="text-3xl focus:outline-none sm:text-4xl">
        {state.phase === "ready"
          ? "Votre facture Factur-X est prête"
          : state.phase === "error"
            ? "La facture n’a pas pu être générée"
            : "Génération de la facture"}
      </h1>

      <div aria-live="polite" className="mt-4">
        {state.phase === "building" && (
          <p className="flex items-center gap-2 text-ink-soft">
            <Spinner />
            Génération du fichier Factur-X…
          </p>
        )}
      </div>

      {state.phase === "error" && (
        <div className="mt-4 space-y-5">
          <Alert tone="error" title="Génération impossible">
            {state.message}
          </Alert>
          <Link to="/review" className={buttonClasses("primary", "lg")}>
            Retour à la vérification
          </Link>
        </div>
      )}

      {state.phase === "ready" && (
        <div className="mt-6 space-y-6">
          {state.result.warnings.length > 0 && (
            <Alert tone="warning" title="Points d’attention sur votre PDF">
              <ul className="list-disc space-y-1 pl-5">
                {state.result.warnings.map((w) => (
                  <li key={w.code + w.message}>{w.message}</li>
                ))}
              </ul>
            </Alert>
          )}

          <Recap result={state.result} />

          <div className="flex flex-wrap items-center gap-4">
            {url ? (
              <a
                href={url}
                download={state.result.filename}
                className={buttonClasses("primary", "lg")}
              >
                Télécharger la facture Factur-X
              </a>
            ) : (
              <Button size="lg" loading>
                Préparation du fichier…
              </Button>
            )}
            <Link to="/review" className={buttonClasses("secondary", "lg")}>
              Modifier la facture
            </Link>
            <Button variant="ghost" size="lg" onClick={startOver}>
              Nouvelle facture
            </Button>
          </div>

          <p className="max-w-prose text-sm text-ink-muted">
            Le fichier <span className="font-medium text-ink-soft">{state.result.filename}</span>{" "}
            est votre PDF d’origine, inchangé à l’écran, auquel est joint le fichier{" "}
            <code className="rounded bg-sunken px-1 py-0.5">factur-x.xml</code> (profil{" "}
            {profileLabel(state.result.profile)}). Il n’a pas été envoyé sur Internet. Pensez à
            conserver l’original.
          </p>
        </div>
      )}
    </div>
  )
}

function Recap({ result }: { result: BuiltFacturX }) {
  const { invoice, totals, profile } = result
  const rows: Array<[string, string, boolean?]> = [
    ["Total HT", formatEuro(totals.taxBasisTotal)],
    ["TVA", formatEuro(totals.taxTotal)],
    ["Total TTC", formatEuro(totals.grandTotal)],
  ]
  if (totals.prepaid > 0) rows.push(["Déjà réglé", formatEuro(totals.prepaid)])
  rows.push(["Net à payer", formatEuro(totals.dueAmount), true])

  return (
    <Card>
      <dl className="grid gap-x-8 gap-y-3 border-b border-rule px-5 py-5 text-sm sm:grid-cols-2">
        <Item label="Facture n°" value={invoice.number} />
        <Item label="Client" value={invoice.buyer.name} />
        <Item label="Vendeur" value={invoice.seller.name} />
        <Item label="Profil Factur-X" value={profileLabel(profile)} />
      </dl>
      <dl className="px-5 py-4 text-sm">
        {rows.map(([label, value, strong]) => (
          <div
            key={label}
            className={
              strong
                ? "mt-2 flex justify-between gap-4 border-t border-rule-strong pt-3 text-base font-semibold"
                : "flex justify-between gap-4 py-1"
            }
          >
            <dt className={strong ? "" : "text-ink-soft"}>{label}</dt>
            <dd className="tabular font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="break-words font-medium text-ink">{value}</dd>
    </div>
  )
}

const profileLabel = (profile: string) => (profile === "EN16931" ? "EN 16931" : profile)
