import { useFormContext, useWatch } from "react-hook-form"
import { DEFAULT_LEGAL_NOTES, VAT_FRANCHISE_REASON } from "../../domain/invoice"
import { Section } from "../ui"
import type { FormValues } from "./formModel"
import { useReview } from "./ReviewContext"
import { asPath, TextareaField } from "./ReviewField"

const helperButton =
  "rounded-control text-accent underline underline-offset-2 hover:text-accent-hover"

export function VatSection() {
  const { requiredPaths } = useReview()
  const { setValue, control } = useFormContext<FormValues>()
  const reason = useWatch({ control, name: "vatExemptionReason" })
  const lines = useWatch({ control, name: "lines" })
  const exemptionNeeded =
    requiredPaths.has("vatExemptionReason") || lines.some((l) => l.vatCategory === "E")

  const fill = (path: string, value: string) =>
    setValue(asPath(path), value, { shouldDirty: true, shouldTouch: true })

  return (
    <Section
      id="tva"
      title="TVA et mentions légales"
      description="Les mentions que la loi impose sur une facture entre professionnels."
      className="scroll-mt-4"
    >
      <div className="space-y-5">
        <TextareaField
          path="vatExemptionReason"
          label="Motif d’exonération de TVA"
          rows={2}
          hint={
            <>
              {exemptionNeeded
                ? "Obligatoire : au moins une ligne n’est pas soumise à la TVA."
                : "Seulement si une ligne n’est pas soumise à la TVA."}
              {exemptionNeeded && reason.trim() !== VAT_FRANCHISE_REASON && (
                <>
                  {" "}
                  <button
                    type="button"
                    className={helperButton}
                    onClick={() => fill("vatExemptionReason", VAT_FRANCHISE_REASON)}
                  >
                    Utiliser « {VAT_FRANCHISE_REASON} »
                  </button>
                </>
              )}
            </>
          }
        />
        <TextareaField
          path="legalNotes.latePaymentPenalty"
          label="Pénalités de retard"
          hint={
            <DefaultText
              onClick={() =>
                fill("legalNotes.latePaymentPenalty", DEFAULT_LEGAL_NOTES.latePaymentPenalty)
              }
            />
          }
        />
        <TextareaField
          path="legalNotes.recoveryFee"
          label="Indemnité forfaitaire de recouvrement"
          hint={
            <DefaultText
              onClick={() => fill("legalNotes.recoveryFee", DEFAULT_LEGAL_NOTES.recoveryFee)}
            />
          }
        />
        <TextareaField
          path="legalNotes.earlyPaymentDiscount"
          label="Escompte pour paiement anticipé"
          rows={2}
          hint={
            <DefaultText
              onClick={() =>
                fill("legalNotes.earlyPaymentDiscount", DEFAULT_LEGAL_NOTES.earlyPaymentDiscount)
              }
            />
          }
        />
        <TextareaField
          path="notes"
          label="Note libre (facultatif)"
          rows={2}
          hint="Imprimée en note de la facture électronique."
        />
      </div>
    </Section>
  )
}

function DefaultText({ onClick }: { onClick(): void }) {
  return (
    <button type="button" className={helperButton} onClick={onClick}>
      Utiliser le texte standard
    </button>
  )
}
