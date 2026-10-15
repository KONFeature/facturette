import { createRootRoute, Link, Outlet, useRouterState } from "@tanstack/react-router"
import { useState } from "react"
import { defaultDeps } from "../app/deps"
import { useAppStore } from "../app/store"
import { useDocumentTitle } from "../app/useDocumentTitle"
import { Button, Stepper } from "../components/ui"

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
})

const REPO_URL = "https://github.com/KONFeature/facturette"

function stepFor(pathname: string): 1 | 2 | 3 {
  if (pathname.startsWith("/done")) return 3
  if (pathname.startsWith("/review")) return 2
  return 1
}

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Aller au contenu
      </a>
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-3.5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Facturette, accueil">
            <Logo />
            <span className="font-serif text-xl font-semibold tracking-tight">Facturette</span>
          </Link>
          <Stepper current={stepFor(pathname)} />
        </div>
        <p className="border-t border-rule bg-sunken/60">
          <span className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-1.5 text-sm text-ink-soft sm:px-8">
            <LockIcon />
            Vos données restent dans votre navigateur
          </span>
        </p>
      </header>

      <main
        id="contenu"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 sm:py-12"
      >
        <Outlet />
      </main>

      <footer className="border-t border-rule bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 text-sm text-ink-muted sm:px-8">
          <p>
            Code ouvert.{" "}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Voir le code sur GitHub
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          </p>
          <EraseDataButton />
        </div>
      </footer>
    </div>
  )
}

function EraseDataButton() {
  const reset = useAppStore((s) => s.reset)
  const [done, setDone] = useState(false)
  const onClick = () => {
    const ok = window.confirm(
      "Effacer toutes les données enregistrées dans ce navigateur (profil vendeur, clients, brouillon) ? Cette action est définitive.",
    )
    if (!ok) return
    try {
      defaultDeps.clearAllData()
    } finally {
      reset()
      setDone(true)
    }
  }
  return (
    <div className="flex items-center gap-3">
      <span role="status" className="text-ok">
        {done ? "Données effacées." : ""}
      </span>
      <Button variant="secondary" onClick={onClick}>
        Effacer mes données
      </Button>
    </div>
  )
}

function Logo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7">
      <rect width="32" height="32" rx="7" fill="var(--color-accent)" />
      <path d="M9 6h10l5 5v15H9z" fill="#fff" />
      <path d="M19 6v5h5z" fill="#a9bde8" />
      <path
        d="M12 16h9M12 20h9M12 24h5"
        stroke="var(--color-accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function NotFound() {
  useDocumentTitle("Page introuvable")
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">Page introuvable</h1>
      <p className="text-ink-soft">Cette adresse n’existe pas.</p>
      <Link to="/" className="text-accent underline underline-offset-2">
        Retour à l’import
      </Link>
    </div>
  )
}
