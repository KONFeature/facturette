import { useId, useState } from "react"
import { useFormContext } from "react-hook-form"
import { deleteCustomer, listCustomers, type SavedCustomer } from "../../lib/storage"
import { Select } from "../ui"
import { draftToForm, type FormValues, type PartyValues } from "./formModel"

interface Applied {
  customer: SavedCustomer
  /** Buyer block before the pick, to undo. */
  previous: PartyValues
}

/**
 * Pick a customer remembered in this browser: the whole buyer block is replaced, and the previous
 * block can be restored. Lists nothing (renders nothing) when no customer was ever saved.
 */
export function CustomerPicker() {
  const id = useId()
  const { getValues, setValue } = useFormContext<FormValues>()
  const [customers, setCustomers] = useState<SavedCustomer[]>(() => listCustomers())
  const [applied, setApplied] = useState<Applied | null>(null)
  const [message, setMessage] = useState("")

  if (customers.length === 0 && !message) return null

  const writeBuyer = (buyer: PartyValues) =>
    setValue("buyer", buyer, { shouldDirty: true, shouldTouch: false })

  const pick = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId)
    if (!customer) return
    setApplied({ customer, previous: structuredClone(getValues("buyer")) })
    writeBuyer(draftToForm({ buyer: customer.party }).buyer)
    setMessage(`Client « ${customer.party.name} » appliqué.`)
  }

  const undo = () => {
    if (!applied) return
    writeBuyer(applied.previous)
    setMessage("Client précédent rétabli.")
    setApplied(null)
  }

  const forget = () => {
    if (!applied) return
    const ok = deleteCustomer(applied.customer.id)
    if (ok) {
      setCustomers(listCustomers())
      setMessage(`« ${applied.customer.party.name} » n’est plus mémorisé sur cet appareil.`)
      setApplied(null)
    } else {
      setMessage("Impossible d’oublier ce client : le navigateur a refusé la modification.")
    }
  }

  return (
    <div className="rounded-control border border-rule bg-sunken/50 p-4">
      {customers.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-sm font-medium text-ink">
            Client enregistré
          </label>
          <Select id={id} value="" onChange={(e) => pick(e.target.value)}>
            <option value="">Choisir un client mémorisé…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.party.name}
                {c.party.address.city ? ` (${c.party.address.city})` : ""}
              </option>
            ))}
          </Select>
          <p className="text-sm text-ink-muted">Remplit tout le bloc client ci-dessous.</p>
        </div>
      )}
      <div role="status" className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {message && <span className="text-ink-soft">{message}</span>}
        {applied && (
          <>
            <button
              type="button"
              onClick={undo}
              className="rounded-control text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={forget}
              className="rounded-control text-danger underline underline-offset-2"
            >
              Oublier ce client
            </button>
          </>
        )}
      </div>
    </div>
  )
}
