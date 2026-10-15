import type { Invoice } from "../../domain/invoice"
import type { FacturXProfile } from "./types"

/**
 * Serialize an invoice as UN/CEFACT CII D16B XML for the given Factur-X profile.
 * Input must already be a complete `Invoice` (validated). Pure, synchronous, deterministic
 * (same input → same bytes, apart from nothing: no timestamps). Output is UTF-8 text starting
 * with an XML declaration.
 *
 * Acceptance: `bun scripts/validate-facturx.ts out.xml` must report VALID (Mustang: XSD +
 * Schematron + arithmetic) for every fixture.
 *
 * OWNER: lane `facturx-xml`. Keep this signature.
 */
export function buildFacturXXml(
  _invoice: Invoice,
  _options?: { profile?: FacturXProfile },
): string {
  throw new Error("buildFacturXXml: not implemented")
}
