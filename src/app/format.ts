const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })
const mo = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

/** 1234.5 → "1 234,50 €" (display only: arithmetic stays in domain/totals). */
export const formatEuro = (amount: number): string => eur.format(amount)

/** Bytes → "850 Ko" / "1,2 Mo". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`
  return `${mo.format(bytes / (1024 * 1024))} Mo`
}
