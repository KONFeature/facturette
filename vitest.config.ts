import { defineConfig } from "vitest/config"

// Unit tests only. The TanStack Router / React plugins are intentionally not loaded here.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    environment: "node",
  },
})
