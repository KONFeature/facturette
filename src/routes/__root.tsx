import { createRootRoute, Link, Outlet } from "@tanstack/react-router"

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Facturette
          </Link>
          <span className="text-sm text-slate-500">Factur-X</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}

function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <Link to="/" className="text-blue-700 underline">
        Retour à l’accueil
      </Link>
    </div>
  )
}
