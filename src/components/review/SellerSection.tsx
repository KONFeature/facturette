import { formatSiren, formatSiret } from "../../lib/validation/identifiers"
import { Section } from "../ui"
import { AddressFields } from "./AddressFields"
import { ElectronicAddressFields } from "./ElectronicAddressFields"
import { TextField } from "./ReviewField"

const vatUpper = (v: string) => v.replace(/\s+/g, "").toUpperCase()

export function SellerSection() {
  return (
    <Section
      id="vendeur"
      title="Vendeur"
      description="Votre entreprise, telle qu’elle doit figurer sur la facture."
      className="scroll-mt-4"
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            path="seller.name"
            label="Nom ou raison sociale"
            className="sm:col-span-2"
            autoComplete="organization"
          />
          <TextField
            path="seller.legalForm"
            label="Forme juridique"
            hint="SAS, SARL, EI, micro-entrepreneur…"
          />
          <TextField
            path="seller.shareCapital"
            label="Capital social"
            hint="Ex. 10 000 € (sociétés)."
          />
          <TextField
            path="seller.siren"
            label="SIREN"
            inputMode="numeric"
            blurFormat={formatSiren}
            hint="9 chiffres."
          />
          <TextField
            path="seller.siret"
            label="SIRET"
            inputMode="numeric"
            blurFormat={formatSiret}
            hint="14 chiffres. Le SIREN en découle."
          />
          <TextField
            path="seller.vatNumber"
            label="N° de TVA intracommunautaire"
            blurFormat={vatUpper}
            hint="Ex. FR12345678901."
          />
          <TextField
            path="seller.registration"
            label="Immatriculation"
            hint="Ex. RCS Paris 123 456 789."
          />
        </div>
        <AddressFields prefix="seller.address" who="du vendeur" />
        <ElectronicAddressFields party="seller" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField path="seller.email" label="E-mail" type="email" inputMode="email" />
          <TextField path="seller.phone" label="Téléphone" type="tel" inputMode="tel" />
        </div>
      </div>
    </Section>
  )
}
