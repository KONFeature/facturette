import type { SellerProfile } from "../../lib/storage"
import { Checkbox, Section } from "../ui"
import { formatSavedDate } from "./profile"

export interface SaveOptionsProps {
  profile: SellerProfile | null
  /** Result of the last "Oublier" (aria-live). */
  message: string
  canMemorizeSeller: boolean
  canMemorizeBuyer: boolean
  rememberSeller: boolean
  rememberBuyer: boolean
  onRememberSeller(value: boolean): void
  onRememberBuyer(value: boolean): void
  onForgetProfile(): void
}

/**
 * Explicit opt-in to remember data in this browser. Nothing is written until the user continues
 * to the next step with a box ticked; the saved profile is shown here and can be forgotten.
 */
export function SaveOptions({
  profile,
  message,
  canMemorizeSeller,
  canMemorizeBuyer,
  rememberSeller,
  rememberBuyer,
  onRememberSeller,
  onRememberBuyer,
  onForgetProfile,
}: SaveOptionsProps) {
  const savedOn = profile ? formatSavedDate(profile.updatedAt) : null
  return (
    <Section
      id="memoriser"
      title="Gagner du temps la prochaine fois"
      description="Rien n’est enregistré sans votre accord. Ces informations restent dans ce navigateur, sur cet appareil."
      className="scroll-mt-4"
    >
      <div className="space-y-4">
        {profile && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
            <span className="font-medium text-ok">
              Profil enregistré{savedOn ? ` le ${savedOn}` : ""} : {profile.seller.name}
            </span>
            <button
              type="button"
              onClick={onForgetProfile}
              className="rounded-control text-danger underline underline-offset-2"
            >
              Oublier
              <span className="sr-only"> le profil enregistré</span>
            </button>
          </p>
        )}
        <Checkbox
          id="remember-seller"
          label="Mémoriser mon entreprise pour les prochaines factures"
          hint={
            canMemorizeSeller
              ? "Vendeur, coordonnées bancaires, mentions légales et TVA par défaut."
              : "Disponible quand les informations du vendeur sont complètes et valides."
          }
          checked={rememberSeller && canMemorizeSeller}
          disabled={!canMemorizeSeller}
          onChange={(e) => onRememberSeller(e.target.checked)}
        />
        <Checkbox
          id="remember-buyer"
          label="Mémoriser ce client"
          hint={
            canMemorizeBuyer
              ? "Il sera proposé dans la liste « Client enregistré »."
              : "Disponible quand les informations du client sont complètes et valides."
          }
          checked={rememberBuyer && canMemorizeBuyer}
          disabled={!canMemorizeBuyer}
          onChange={(e) => onRememberBuyer(e.target.checked)}
        />
        <p role="status" className="min-h-5 text-sm text-ink-soft">
          {message}
        </p>
      </div>
    </Section>
  )
}
