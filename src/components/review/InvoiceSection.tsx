import { INVOICE_TYPES, OPERATION_CATEGORIES } from "../../domain/invoice"
import { Section } from "../ui"
import { CheckboxField, SelectField, TextField } from "./ReviewField"

const typeOptions = INVOICE_TYPES.map((t) => ({ value: t.code, label: t.label }))
const operationOptions = OPERATION_CATEGORIES.map((c) => ({ value: c.code, label: c.label }))

export function InvoiceSection() {
  return (
    <Section id="facture" title="Facture" className="scroll-mt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField path="number" label="Numéro de facture" hint="Unique et chronologique." />
        <SelectField path="typeCode" label="Type de document" options={typeOptions} />
        <TextField path="issueDate" label="Date de facture" type="date" />
        <TextField
          path="dueDate"
          label="Date d’échéance"
          type="date"
          hint="Ou indiquez les conditions de paiement plus bas."
        />
        <TextField
          path="deliveryDate"
          label="Date de livraison ou de fin de prestation"
          type="date"
          hint="Laissez vide si elle est identique à la date de facture."
        />
        <SelectField
          path="operationCategory"
          label="Catégorie d’opération"
          options={operationOptions}
          placeholder="Choisir…"
        />
        <div className="sm:col-span-2">
          <CheckboxField
            path="vatOnDebits"
            label="TVA sur les débits"
            hint="À cocher si vous avez opté pour l’exigibilité de la TVA sur les débits (mention obligatoire)."
          />
        </div>
      </div>
    </Section>
  )
}
