import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { CSP_DIRECTIVES, CSP_HEADER, CSP_META } from "./csp"

describe("Content-Security-Policy", () => {
  it("forbids every kind of outbound connection except to the app's own origin", () => {
    expect(CSP_DIRECTIVES["connect-src"]).toBe("'self'")
    expect(CSP_DIRECTIVES["default-src"]).toBe("'self'")
    // No wildcard and no remote host anywhere in the policy.
    expect(CSP_HEADER).not.toMatch(/\*|https?:|wss?:/)
  })

  it("allows no inline or eval script", () => {
    expect(CSP_DIRECTIVES["script-src"]).toBe("'self'")
    expect(CSP_HEADER).not.toMatch(/unsafe-inline|unsafe-eval/)
  })

  it("keeps public/_headers in sync with the policy used in the build", () => {
    const headers = readFileSync(resolve(import.meta.dirname, "..", "public", "_headers"), "utf8")
    const line = headers.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:"))
    expect(line?.trim()).toBe(`Content-Security-Policy: ${CSP_HEADER}`)
  })

  it("keeps the header-only directive out of the meta policy", () => {
    expect(CSP_META).not.toContain("frame-ancestors")
    expect(CSP_HEADER).toContain("frame-ancestors 'none'")
  })
})
