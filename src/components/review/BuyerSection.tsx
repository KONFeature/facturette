import { useFormContext, useWatch } from "react-hook-form"
import { formatSiren, formatSiret } from "../../lib/validation/identifiers"
import { Section } from "../ui"
import { AddressFields } from "./AddressFields"
import { CustomerPicker } from "./CustomerPicker"
import type { FormValues } from "./formModel"
import { CheckboxField, SelectField, TextField } from "./ReviewField"

const kindOptions = [
  { value: "company", label: "Entreprise ou association" },
  { value: "individual", label: "Particulier" },
]

const vatUpper = (v: string) => v.replace(/\s+/g, "").toUpperCase()

export function BuyerSection() {
  const { control } = useFormContext<FormValues>()
  const kind = useWatch({ control, name: "buyer.kind" })
  const hasDelivery = useWatch({ control, name: "hasDeliveryAddress" })
  const individual = kind === "individual"

  return (
    <Section
      id="client"
      title="Client"
      description="Le destinataire de la facture."
      className="scroll-mt-4"
    >
      <div className="space-y-6">
        <CustomerPicker />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField path="buyer.kind" label="Type de client" options={kindOptions} />
          <TextField
            path="buyer.name"
            label={individual ? "Nom et prénom" : "Nom ou raison sociale"}
            autoComplete="off"
          />
          {!individual && (
            <>
              <TextField
                path="buyer.siren"
                label="SIREN"
                inputMode="numeric"
                blurFormat={formatSiren}
                hint="9 chiffres."
              />
              <TextField
                path="buyer.siret"
                label="SIRET"
                inputMode="numeric"
                blurFormat={formatSiret}
                hint="14 chiffres. Le SIREN suffit."
              />
            </>
          )}
          <TextField
            path="buyer.vatNumber"
            label="N° de TVA intracommunautaire"
            blurFormat={vatUpper}
            hint={
              individual
                ? undefined
                : "Facultatif, sauf autoliquidation ou livraison intracommunautaire."
            }
            className="sm:col-span-2"
          />
        </div>
        <AddressFields prefix="buyer.address" who="du client" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField path="buyer.email" label="E-mail" type="email" inputMode="email" />
          <TextField path="buyer.phone" label="Téléphone" type="tel" inputMode="tel" />
          <TextField
            path="buyerReference"
            label="Référence acheteur"
            hint="Code service ou engagement, demandé par certains clients publics."
          />
          <TextField path="orderReference" label="N° de commande" />
        </div>
        <div className="space-y-4">
          <CheckboxField
            path="hasDeliveryAddress"
            label="L’adresse de livraison est différente de l’adresse du client"
            hint="Mention obligatoire dans ce cas."
          />
          {hasDelivery && <AddressFields prefix="deliveryAddress" who="de livraison" />}
        </div>
      </div>
    </Section>
  )
}
