import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // tanstackRouter must come before @vitejs/plugin-react.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  build: {
    // Static SPA output: serve `dist/` from any static host with an index.html fallback.
    outDir: "dist",
    sourcemap: true,
  },
})
