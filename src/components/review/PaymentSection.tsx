import { PAYMENT_MEANS } from "../../domain/invoice"
import { formatIban } from "../../lib/validation/identifiers"
import { Section } from "../ui"
import { SelectField, TextareaField, TextField } from "./ReviewField"

const meansOptions = PAYMENT_MEANS.map((m) => ({ value: m.code, label: m.label }))
const upperNoSpaces = (v: string) => v.replace(/\s+/g, "").toUpperCase()

export function PaymentSection() {
  return (
    <Section id="paiement" title="Paiement" className="scroll-mt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          path="payment.meansCode"
          label="Moyen de paiement"
          options={meansOptions}
          placeholder="Choisir…"
          className="sm:col-span-2"
        />
        <TextField
          path="payment.iban"
          label="IBAN"
          liveFormat={formatIban}
          autoComplete="off"
          className="sm:col-span-2"
          hint="Requis pour un virement ou un prélèvement."
        />
        <TextField path="payment.bic" label="BIC" blurFormat={upperNoSpaces} />
        <TextField
          path="payment.reference"
          label="Référence de paiement"
          hint="À rappeler par le client lors du règlement."
        />
        <TextareaField
          path="payment.termsText"
          label="Conditions de paiement"
          rows={2}
          hint="Ex. Paiement à 30 jours fin de mois."
          className="sm:col-span-2"
        />
        <TextField
          path="prepaidAmount"
          label="Acompte déjà versé (€)"
          inputMode="decimal"
          hint="Déduit du reste à payer."
        />
      </div>
    </Section>
  )
}
