import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { CSP_META } from "./scripts/csp"

/**
 * Ship the Content-Security-Policy with the production build so the browser itself enforces that
 * the app only talks to its own origin. Build only: the dev server needs inline scripts and a
 * websocket for hot reload.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: "facturette:content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CSP_META },
        injectTo: "head-prepend",
      },
      {
        tag: "meta",
        attrs: { name: "referrer", content: "no-referrer" },
        injectTo: "head-prepend",
      },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig({
  // "/" by default. A GitHub Pages project site lives under /<repo>/, so CI passes BASE_PATH.
  base: process.env.BASE_PATH || "/",
  plugins: [
    // tanstackRouter must come before @vitejs/plugin-react.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    contentSecurityPolicy(),
  ],
  build: {
    // Static SPA output: serve `dist/` from any static host with an index.html fallback.
    outDir: "dist",
    sourcemap: true,
  },
})
