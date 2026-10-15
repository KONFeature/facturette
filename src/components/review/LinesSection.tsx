import { type KeyboardEvent, type ReactNode, useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { FRENCH_VAT_RATES, UNIT_CODES, VAT_CATEGORIES } from "../../domain/invoice"
import { computeTotals } from "../../domain/totals"
import { Alert, Button, Input, Section, Select } from "../ui"
import type { FormValues, LineValues } from "./formModel"
import { formatAmount, formatNumberInput } from "./numbers"
import { useReview } from "./ReviewContext"
import { asPath, ReviewField, SelectField, TextField } from "./ReviewField"
import { mappingAfterInsert, mappingAfterMove, mappingAfterRemove } from "./suggestions"
import { TotalsBox } from "./TotalsBox"

const unitOptions = UNIT_CODES.map((u) => ({ value: u.code, label: u.label }))
const categoryOptions = VAT_CATEGORIES.map((c) => ({ value: c.code, label: c.label }))
const KNOWN_RATES = FRENCH_VAT_RATES.map((r) => formatNumberInput(r))

function newLine(previous?: LineValues): LineValues {
  return {
    name: "",
    description: "",
    quantity: "1",
    unitCode: previous?.unitCode || "C62",
    unitPrice: "",
    vatCategory: previous?.vatCategory || "S",
    vatRate: previous?.vatRate || "20",
  }
}

export function LinesSection() {
  const review = useReview()
  const { control, getValues } = useFormContext<FormValues>()
  const { fields, append, insert, remove, move } = useFieldArray({ control, name: "lines" })
  const count = fields.length
  const listError = review.stateOf("lines").error

  const addAfter = (index: number) => {
    const previous = getValues(`lines.${index}`)
    insert(index + 1, newLine(previous), { focusName: `lines.${index + 1}.name` })
    review.onLinesChanged(mappingAfterInsert(count, index + 1))
  }
  const addAtEnd = () => {
    append(newLine(getValues(`lines.${count - 1}`)), { focusName: `lines.${count}.name` })
    review.onLinesChanged(mappingAfterInsert(count, count))
  }
  const duplicate = (index: number) => {
    insert(index + 1, structuredClone(getValues(`lines.${index}`)), {
      focusName: `lines.${index + 1}.name`,
    })
    review.onLinesChanged(mappingAfterInsert(count, index + 1))
  }
  const removeAt = (index: number) => {
    remove(index)
    review.onLinesChanged(mappingAfterRemove(count, index))
  }
  const moveTo = (from: number, to: number) => {
    move(from, to)
    review.onLinesChanged(mappingAfterMove(count, from, to))
  }

  return (
    <Section
      id="lignes"
      title="Lignes"
      description="Ce que vous facturez. Ctrl + Entrée dans une ligne en ajoute une juste en dessous."
      className="scroll-mt-4"
    >
      <div className="space-y-5">
        {listError && <Alert tone="error">{listError.message}</Alert>}
        {count === 0 && (
          <p className="rounded-control border border-dashed border-rule-strong px-4 py-6 text-center text-ink-soft">
            Aucune ligne. Ajoutez au moins une ligne pour continuer.
          </p>
        )}
        <ol className="space-y-4">
          {fields.map((field, index) => (
            <LineRow
              key={field.id}
              index={index}
              count={count}
              onAddAfter={() => addAfter(index)}
              onDuplicate={() => duplicate(index)}
              onRemove={() => removeAt(index)}
              onMove={(to) => moveTo(index, to)}
            />
          ))}
        </ol>
        <Button variant="secondary" onClick={addAtEnd}>
          <span aria-hidden="true">+</span> Ajouter une ligne
        </Button>
        <TotalsBox />
      </div>
    </Section>
  )
}

interface LineRowProps {
  index: number
  count: number
  onAddAfter(): void
  onDuplicate(): void
  onRemove(): void
  onMove(to: number): void
}

function LineRow({ index, count, onAddAfter, onDuplicate, onRemove, onMove }: LineRowProps) {
  const { draft } = useReview()
  const { setValue, getValues } = useFormContext<FormValues>()
  const p = (leaf: string) => `lines.${index}.${leaf}`
  const net = computeTotals(draft).lineNets[index] ?? 0
  const category = useWatch({ name: asPath(p("vatCategory")) })

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target instanceof HTMLInputElement) {
      e.preventDefault()
      onAddAfter()
    }
  }

  const onCategoryChange = (value: string) => {
    // Switching back to a taxable category: do not leave the rate at 0 (BR-S-05 forbids it).
    const rate = getValues(asPath(p("vatRate")))
    if (value === "S" && (rate === "" || rate === "0")) {
      setValue(asPath(p("vatRate")), "20", { shouldDirty: true })
    }
  }

  return (
    <li
      onKeyDown={onKeyDown}
      className="rounded-panel border border-rule bg-surface p-4"
      aria-label={`Ligne ${index + 1}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-sans text-sm font-semibold text-ink-soft">Ligne {index + 1}</h3>
        <div className="flex items-center gap-1">
          <IconButton
            label={`Monter la ligne ${index + 1}`}
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </IconButton>
          <IconButton
            label={`Descendre la ligne ${index + 1}`}
            disabled={index === count - 1}
            onClick={() => onMove(index + 1)}
          >
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </IconButton>
          <IconButton label={`Dupliquer la ligne ${index + 1}`} onClick={onDuplicate}>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V6a2 2 0 0 1 2-2h9" />
          </IconButton>
          <IconButton label={`Supprimer la ligne ${index + 1}`} onClick={onRemove} danger>
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-12">
        <TextField path={p("name")} label="Désignation" className="col-span-2 sm:col-span-12" />
        <TextField
          path={p("description")}
          label="Description (facultatif)"
          className="col-span-2 sm:col-span-12"
        />
        <TextField
          path={p("quantity")}
          label="Quantité"
          inputMode="decimal"
          className="sm:col-span-3"
        />
        <SelectField
          path={p("unitCode")}
          label="Unité"
          options={unitOptions}
          className="sm:col-span-3"
        />
        <TextField
          path={p("unitPrice")}
          label="Prix unitaire HT"
          inputMode="decimal"
          className="col-span-2 sm:col-span-3"
        />
        <div className="col-span-2 flex flex-col justify-end gap-1.5 sm:col-span-3">
          <span className="text-sm font-medium text-ink">Montant HT</span>
          <output
            className="flex min-h-10 items-center justify-end rounded-control bg-sunken px-3 text-base font-medium tabular text-ink"
            aria-label={`Montant HT de la ligne ${index + 1}`}
          >
            {formatAmount(net)}
          </output>
        </div>
        <SelectField
          path={p("vatCategory")}
          label="Catégorie de TVA"
          options={categoryOptions}
          onValueChange={onCategoryChange}
          className="col-span-2 sm:col-span-8"
        />
        {category === "S" ? (
          <VatRateControl path={p("vatRate")} className="col-span-2 sm:col-span-4" />
        ) : (
          <div className="col-span-2 flex flex-col justify-end gap-1.5 sm:col-span-4">
            <span className="text-sm font-medium text-ink">Taux de TVA</span>
            <span className="flex min-h-10 items-center text-sm text-ink-muted">
              Sans objet (0 %)
            </span>
          </div>
        )}
      </div>
    </li>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick(): void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid size-9 place-items-center rounded-control border border-transparent hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-40 ${danger ? "text-danger" : "text-ink-soft"}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  )
}

const OTHER = "other"

/** Rate select for category S (20 / 10 / 5,5 / 2,1) with an "Autre taux" free input. */
function VatRateControl({ path, className }: { path: string; className?: string }) {
  const { setValue } = useFormContext<FormValues>()
  const rate = useWatch({ name: asPath(path) })
  const [forceCustom, setForceCustom] = useState(false)
  const rateText = typeof rate === "string" ? rate : ""
  const custom = forceCustom || (rateText !== "" && !KNOWN_RATES.includes(rateText))

  return (
    <ReviewField path={path} label="Taux de TVA" className={className}>
      {({ control, register }) => (
        <div className="flex gap-2">
          <Select
            {...control}
            data-field={path}
            value={custom ? OTHER : rateText}
            onChange={(e) => {
              const value = e.target.value
              if (value === OTHER) {
                setForceCustom(true)
                setValue(asPath(path), "", { shouldDirty: true })
              } else {
                setForceCustom(false)
                setValue(asPath(path), value, { shouldDirty: true, shouldTouch: true })
              }
            }}
            onBlur={register.onBlur}
          >
            <option value="">Choisir…</option>
            {KNOWN_RATES.map((r) => (
              <option key={r} value={r}>
                {r} %
              </option>
            ))}
            <option value={OTHER}>Autre taux…</option>
          </Select>
          {custom && (
            <Input
              {...register}
              inputMode="decimal"
              aria-label="Taux de TVA personnalisé en pourcent"
              className="w-24 shrink-0"
              placeholder="8,5"
            />
          )}
        </div>
      )}
    </ReviewField>
  )
}
