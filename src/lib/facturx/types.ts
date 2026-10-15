/**
 * Factur-X profiles. EN16931 is the target: it carries line items and the VAT breakdown, and is
 * accepted by the French e-invoicing reform. MINIMUM and BASIC WL are NOT acceptable invoices
 * for the reform and are deliberately not offered.
 */
export type FacturXProfile = "BASIC" | "EN16931"

export const DEFAULT_PROFILE: FacturXProfile = "EN16931"
