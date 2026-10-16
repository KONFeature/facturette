import { useFormContext, useWatch } from "react-hook-form"
import { deriveSiren, FR_DIRECTORY_SCHEME } from "../../domain/invoice"
import type { FormValues } from "./formModel"
import { SelectField, TextField } from "./ReviewField"

/** EAS codes (CEF code list) an invoicing address may use. 0225 is the French annuaire. */
const SCHEMES = [
  { value: FR_DIRECTORY_SCHEME, label: "0225 – Annuaire" },
  { value: "0009", label: "0009 – SIRET" },
  { value: "0088", label: "0088 – GLN" },
  { value: "0208", label: "0208 – Belgique" },
  { value: "EM", label: "EM – E-mail" },
]

const noSpaces = (v: string) => v.replace(/\s+/g, "")

/**
 * BT-34 / BT-49: where the e-invoicing platforms deliver the invoice. When left blank, the file
 * uses the party's SIREN (shown as the placeholder) and validation says so.
 */
export function ElectronicAddressFields({ party }: { party: "seller" | "buyer" }) {
  const { control } = useFormContext<FormValues>()
  const [siren, siret, vatNumber, scheme] = useWatch({
    control,
    name: [
      `${party}.siren`,
      `${party}.siret`,
      `${party}.vatNumber`,
      `${party}.electronicAddress.scheme`,
    ],
  })
  const fallback = deriveSiren({ siren, siret, vatNumber })
  // A scheme saved earlier but not listed stays selectable instead of silently changing.
  const options =
    scheme && !SCHEMES.some((s) => s.value === scheme)
      ? [...SCHEMES, { value: scheme, label: scheme }]
      : SCHEMES
  const whose = party === "seller" ? "votre entreprise" : "votre client"
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <TextField
        path={`${party}.electronicAddress.value`}
        label="Adresse de facturation électronique"
        hint={`Celle que ${whose} a inscrite à l’annuaire via sa plateforme, par exemple SIREN_SIRET ou SIREN_STANDARD. Vide : le SIREN seul est utilisé.`}
        placeholder={fallback}
        blurFormat={noSpaces}
        autoComplete="off"
        className="sm:col-span-2"
      />
      <SelectField path={`${party}.electronicAddress.scheme`} label="Schéma" options={options} />
    </div>
  )
}
