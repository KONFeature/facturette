import { VAT_CATEGORIES } from "../../domain/invoice"
import { computeTotals } from "../../domain/totals"
import { formatAmount, formatNumberDisplay } from "./numbers"
import { useReview } from "./ReviewContext"

/** Live totals. Every figure comes from `computeTotals` (decimal.js), never from UI arithmetic. */
export function TotalsBox() {
  const { draft } = useReview()
  const totals = computeTotals(draft)

  return (
    <section
      aria-labelledby="totals-title"
      className="rounded-panel border border-rule-strong bg-sunken/50 p-4"
    >
      <h3 id="totals-title" className="text-base">
        Totaux
      </h3>
      <dl className="mt-3 space-y-1.5 text-sm tabular">
        <Row label="Total HT" value={formatAmount(totals.taxBasisTotal)} />
        {totals.vatBreakdown.map((v) => (
          <Row
            key={`${v.category}-${v.rate}`}
            muted
            label={
              v.category === "S"
                ? `TVA ${formatNumberDisplay(v.rate)} % sur ${formatAmount(v.taxableAmount)}`
                : `${VAT_CATEGORIES.find((c) => c.code === v.category)?.label.split(" (")[0] ?? v.category} sur ${formatAmount(v.taxableAmount)}`
            }
            value={formatAmount(v.taxAmount)}
          />
        ))}
        <Row label="Total TVA" value={formatAmount(totals.taxTotal)} />
        <Row strong label="Total TTC" value={formatAmount(totals.grandTotal)} />
        {totals.prepaid !== 0 && (
          <Row muted label="Déjà payé" value={`− ${formatAmount(totals.prepaid)}`} />
        )}
        <Row strong label="Reste à payer" value={formatAmount(totals.dueAmount)} />
      </dl>
    </section>
  )
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${strong ? "border-t border-rule pt-1.5 font-semibold text-ink" : muted ? "text-ink-muted" : "text-ink-soft"}`}
    >
      <dt>{label}</dt>
      <dd className="whitespace-nowrap">{value}</dd>
    </div>
  )
}
