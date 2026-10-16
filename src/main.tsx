import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { routeTree } from "./routeTree.gen"
import "./styles.css"

// Vite exposes the build's base ("/" or "/facturette/"); the router must be mounted at the same path.
const basepath = import.meta.env.BASE_URL.replace(/\/+$/, "") || "/"
const router = createRouter({ routeTree, defaultPreload: "intent", basepath })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Missing #root element")

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
