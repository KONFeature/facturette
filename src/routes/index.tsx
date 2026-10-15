import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { type DragEvent, useRef, useState } from "react"
import { formatFileSize } from "../app/format"
import { selectIsScanned, useAppStore } from "../app/store"
import { useDocumentTitle } from "../app/useDocumentTitle"
import { Alert, Button, Spinner } from "../components/ui"
import { cx } from "../components/ui/cx"

export const Route = createFileRoute("/")({
  component: ImportStep,
})

function ImportStep() {
  useDocumentTitle("Importer une facture")
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const status = useAppStore((s) => s.status)
  const error = useAppStore((s) => s.error)
  const pdf = useAppStore((s) => s.pdf)
  const scanned = useAppStore(selectIsScanned)
  const loadPdf = useAppStore((s) => s.loadPdf)
  const reading = status === "reading"

  const goToReview = () => navigate({ to: "/review" })

  const handleFile = async (file: File | undefined) => {
    if (!file || reading) return
    const ok = await loadPdf(file)
    // A scanned PDF stays here: the user must read the explanation before continuing.
    if (ok && !selectIsScanned(useAppStore.getState())) await goToReview()
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    void handleFile(e.dataTransfer.files[0])
  }
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    setDragging(true)
  }
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
  }
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-16">
      <section aria-labelledby="titre-import" className="min-w-0">
        <h1 id="titre-import" className="text-3xl sm:text-4xl">
          Importez votre facture PDF
        </h1>
        <p className="mt-3 max-w-prose text-ink-soft">
          Le PDF que vous avez déjà émis devient l’aspect visuel de la facture Factur-X. Il est lu
          sur cet appareil, jamais envoyé.
        </p>

        {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target only; the button inside is the keyboard control */}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          className={cx(
            "mt-8 rounded-panel border-2 border-dashed transition-colors duration-150",
            dragging
              ? "border-accent bg-accent-soft"
              : "border-rule-strong bg-surface hover:border-ink-muted",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            tabIndex={-1}
            aria-hidden="true"
            className="hidden"
            data-testid="file-input"
            onChange={(e) => {
              void handleFile(e.target.files?.[0])
              e.target.value = ""
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-disabled={reading || undefined}
            aria-describedby="aide-import"
            className="flex min-h-56 w-full flex-col items-center justify-center gap-3 rounded-panel px-6 py-10 text-center"
          >
            <PageIcon active={dragging} />
            <span className="font-serif text-xl font-semibold">
              {dragging ? "Relâchez pour importer" : "Déposez votre facture ici"}
            </span>
            <span className="text-ink-soft">
              ou{" "}
              <span className="font-medium text-accent underline underline-offset-2">
                choisissez un fichier
              </span>
            </span>
            <span id="aide-import" className="text-sm text-ink-muted">
              PDF uniquement, 20 Mo maximum
            </span>
          </button>
        </div>

        <div aria-live="polite" className="mt-4 min-h-6 text-sm text-ink-soft">
          {reading && (
            <p className="flex items-center gap-2">
              <Spinner />
              Lecture du PDF…
            </p>
          )}
        </div>

        {error && !reading && (
          <Alert tone="error" title="Ce fichier n’a pas pu être importé" className="mt-2">
            {error.message}
          </Alert>
        )}

        {pdf && !reading && !error && (
          <div className="mt-2 space-y-4">
            {scanned ? (
              <Alert tone="warning" title="Aucun texte détecté dans ce PDF">
                Il s’agit probablement d’une numérisation (image). Facturette ne fait pas de
                reconnaissance de caractères : rien n’a pu être pré-rempli. Vous pouvez continuer et
                saisir les informations à la main ; votre PDF servira toujours de visuel.
              </Alert>
            ) : (
              <Alert tone="info" title="PDF lu">
                Les informations détectées sont prêtes à être vérifiées.
              </Alert>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <Button size="lg" onClick={goToReview}>
                {scanned ? "Continuer et remplir à la main" : "Vérifier les informations"}
              </Button>
              <span className="text-sm text-ink-muted tabular">
                {pdf.name} · {formatFileSize(pdf.size)}
              </span>
            </div>
          </div>
        )}
      </section>

      <aside
        aria-labelledby="titre-deroulement"
        className="min-w-0 lg:border-l lg:border-rule lg:pl-12"
      >
        <h2 id="titre-deroulement" className="text-xl">
          Ce qui va se passer
        </h2>
        <ol className="mt-4 space-y-4 text-ink-soft">
          <li>
            <strong className="font-semibold text-ink">Lecture.</strong> Le texte du PDF est analysé
            pour retrouver le numéro, les dates, le vendeur, le client, les lignes et les totaux.
          </li>
          <li>
            <strong className="font-semibold text-ink">Vérification.</strong> Vous complétez ce qui
            manque. Les mentions obligatoires en France (SIREN, TVA, pénalités de retard, indemnité
            de 40 €) sont contrôlées.
          </li>
          <li>
            <strong className="font-semibold text-ink">Génération.</strong> Un fichier XML
            <code className="mx-1 whitespace-nowrap rounded bg-sunken px-1 py-0.5 text-sm">
              factur-x.xml
            </code>
            est joint à votre PDF d’origine, dont l’aspect ne change pas.
          </li>
        </ol>

        <h2 className="mt-10 text-xl">Qu’est-ce que Factur-X ?</h2>
        <p className="mt-3 text-ink-soft">
          Un PDF lisible par une personne qui contient les mêmes données en XML, lisibles par les
          logiciels. La réforme française de la facturation électronique impose de pouvoir en
          recevoir depuis le 1er septembre 2026 ; l’émission devient obligatoire en 2026 ou 2027
          selon la taille de l’entreprise. Profil produit : EN 16931.
        </p>
      </aside>
    </div>
  )
}

function PageIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className={cx("size-12 transition-transform duration-200", active && "-translate-y-1")}
      fill="none"
      stroke="var(--color-accent)"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M12 5h17l9 9v29H12z" fill="var(--color-surface)" />
      <path d="M29 5v9h9" />
      <path d="M18 24h14M18 30h14M18 36h8" />
    </svg>
  )
}
