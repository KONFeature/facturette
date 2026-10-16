/**
 * Content-Security-Policy that makes the product promise ("your data never leaves your browser")
 * enforced by the browser itself instead of by our own discipline: the page can only talk to its own
 * origin, so a compromised dependency or a future mistake cannot send invoice data anywhere.
 *
 * Used by vite.config.ts (injected as a <meta> in the PRODUCTION build only: the dev server's hot
 * reload needs inline scripts and a websocket) and mirrored in public/_headers for hosts that can
 * send real headers. scripts/csp.test.ts keeps both in sync.
 */
export const CSP_DIRECTIVES: Readonly<Record<string, string>> = {
  "default-src": "'self'",
  "script-src": "'self'",
  "style-src": "'self'",
  "img-src": "'self' data: blob:",
  "font-src": "'self' data: blob:",
  // No fetch / XHR / WebSocket / EventSource to anywhere but this origin.
  "connect-src": "'self'",
  // pdf.js runs in a same-origin worker (a blob: fallback is allowed by some builds).
  "worker-src": "'self' blob:",
  "object-src": "'none'",
  "base-uri": "'none'",
  "form-action": "'none'",
  "manifest-src": "'self'",
}

const join = (d: Readonly<Record<string, string>>): string =>
  Object.entries(d)
    .map(([name, value]) => `${name} ${value}`)
    .join("; ")

/** The policy as a <meta http-equiv> value (frame-ancestors is ignored in meta, so it is omitted). */
export const CSP_META = join(CSP_DIRECTIVES)

/** The policy as an HTTP header value (adds the directives that only work in a header). */
export const CSP_HEADER = `${CSP_META}; frame-ancestors 'none'`
