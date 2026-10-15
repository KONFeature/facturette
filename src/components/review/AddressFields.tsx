import { TextField } from "./ReviewField"

const upper = (v: string) => v.trim().toUpperCase()

/** Street, complement, postal code, city, country (ISO code) under a draft path prefix. */
export function AddressFields({ prefix, who }: { prefix: string; who: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <TextField
        path={`${prefix}.line1`}
        label={`Adresse ${who}`}
        autoComplete="off"
        className="sm:col-span-6"
      />
      <TextField path={`${prefix}.line2`} label="Complément d’adresse" className="sm:col-span-6" />
      <TextField
        path={`${prefix}.postalCode`}
        label="Code postal"
        inputMode="numeric"
        className="sm:col-span-2"
      />
      <TextField path={`${prefix}.city`} label="Ville" className="sm:col-span-3" />
      <TextField
        path={`${prefix}.countryCode`}
        label="Pays (code)"
        hint="Ex. FR"
        maxLength={2}
        blurFormat={upper}
        className="sm:col-span-1"
        inputClassName="uppercase"
      />
    </div>
  )
}
