import type { ChangeEvent, FocusEvent, ReactNode } from "react"
import { type Path, type UseFormRegisterReturn, useFormContext } from "react-hook-form"
import { Badge, Checkbox, Field, type FieldControlProps, Input, Select, Textarea } from "../ui"
import { confidenceLevel, type FieldState } from "./fieldState"
import type { FormValues } from "./formModel"
import { useReview } from "./ReviewContext"
import { suggestionLabel } from "./suggestions"

export const asPath = (path: string): Path<FormValues> => path as Path<FormValues>

const MAX_CHIPS = 3

/** Re-format an input in place and keep the caret after the same number of non-space characters. */
export function reformatInPlace(el: HTMLInputElement, format: (value: string) => string): void {
  const before = el.value
  const next = format(before)
  if (next === before) return
  const caret = el.selectionStart ?? before.length
  const significant = before.slice(0, caret).replace(/\s/g, "").length
  el.value = next
  let pos = 0
  let seen = 0
  while (pos < next.length && seen < significant) {
    if (!/\s/.test(next.charAt(pos))) seen++
    pos++
  }
  if (document.activeElement === el) el.setSelectionRange(pos, pos)
}

function DetectedBadge({ state }: { state: FieldState }) {
  if (state.detected) {
    const reliable = state.detected.level === "reliable"
    return (
      <Badge tone={reliable ? "ok" : "warn"} className="shrink-0 whitespace-nowrap">
        <span aria-hidden="true" className="mr-1">
          {reliable ? "✓" : "!"}
        </span>
        Détecté<span className="sr-only"> dans le PDF</span>
        <span className="ml-1 font-normal">· {reliable ? "fiable" : "à vérifier"}</span>
      </Badge>
    )
  }
  if (state.source === "profile") {
    return (
      <Badge tone="info" className="shrink-0 whitespace-nowrap">
        Profil enregistré
      </Badge>
    )
  }
  return null
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

const linkButton =
  "inline-flex items-center gap-1 rounded-control text-accent underline underline-offset-2 hover:text-accent-hover"

function FieldExtras({
  path,
  label,
  state,
  hint,
}: {
  path: string
  label: string
  state: FieldState
  hint?: ReactNode
}) {
  const review = useReview()
  const evidence = state.detected?.suggestion
  const chips = state.alternatives.slice(0, MAX_CHIPS)
  const marker = state.detected !== null || state.source === "profile"
  if (!hint && !marker && chips.length === 0 && !state.warning) return null
  return (
    <span className="flex flex-col gap-1.5">
      {hint && <span>{hint}</span>}
      {marker && (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <DetectedBadge state={state} />
          {evidence?.evidence.bbox && (
            <button
              type="button"
              className={linkButton}
              onClick={() => review.showEvidence(evidence)}
            >
              <EyeIcon />
              Voir dans le PDF
              <span className="sr-only"> : {label}</span>
            </button>
          )}
        </span>
      )}
      {chips.map((s) => {
        const text = suggestionLabel(path, s.value)
        return (
          <span
            key={`${String(s.value)}-${s.rule}`}
            className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-control border border-dashed border-rule-strong bg-sunken/60 px-2 py-1 text-ink-soft"
          >
            <span className="min-w-0 break-words">
              Suggestion : <strong className="font-medium text-ink">{text}</strong>
              <span className="text-ink-muted">
                {" "}
                ({confidenceLevel(s.confidence) === "reliable" ? "fiable" : "à vérifier"})
              </span>
            </span>
            <button
              type="button"
              className={`${linkButton} font-medium`}
              onClick={() => review.applySuggestion(s)}
            >
              Utiliser
              <span className="sr-only">
                {" "}
                la suggestion « {text} » pour {label}
              </span>
            </button>
            {s.evidence.bbox && (
              <button
                type="button"
                className={linkButton}
                onClick={() => review.showEvidence(s)}
                title={`Dans le PDF : ${s.evidence.text}`}
              >
                <EyeIcon />
                <span className="sr-only">Voir cette suggestion dans le PDF</span>
              </button>
            )}
          </span>
        )
      })}
      {state.warning && (
        <span className="font-medium text-warn">
          <span aria-hidden="true">Attention : </span>
          <span className="sr-only">Avertissement : </span>
          {state.warning.message}
        </span>
      )}
    </span>
  )
}

export interface ReviewFieldProps {
  /** Draft path = form field name = validation issue path. */
  path: string
  /** Plain-text label (also used in screen-reader texts of the suggestion buttons). */
  label: string
  hint?: ReactNode
  className?: string
  /** Hide the extraction markers (e.g. for fields extraction never fills). */
  children: (props: { control: FieldControlProps; register: UseFormRegisterReturn }) => ReactNode
}

/**
 * Label, control, extraction state (badge, evidence button, suggestion chips), warning and
 * error of one form field. `register` already marks the field touched on blur.
 */
export function ReviewField({ path, label, hint, className, children }: ReviewFieldProps) {
  const review = useReview()
  const { register } = useFormContext<FormValues>()
  const state = review.stateOf(path)
  const registered = register(asPath(path))
  const bound: UseFormRegisterReturn = {
    ...registered,
    onBlur: (event: Parameters<typeof registered.onBlur>[0]) => {
      review.touch(path)
      return registered.onBlur(event)
    },
  }
  return (
    <Field
      label={label}
      required={state.required}
      error={state.error?.message}
      hint={<FieldExtras path={path} label={label} state={state} hint={hint} />}
      className={className}
    >
      {(control) => children({ control, register: bound })}
    </Field>
  )
}

export interface TextFieldProps {
  path: string
  label: string
  hint?: ReactNode
  className?: string
  type?: "text" | "email" | "tel" | "date"
  inputMode?: "text" | "decimal" | "numeric" | "email" | "tel"
  autoComplete?: string
  placeholder?: string
  maxLength?: number
  /** Applied on every keystroke (e.g. IBAN grouping). */
  liveFormat?: (value: string) => string
  /** Applied when leaving the field (e.g. SIRET grouping, upper-casing). */
  blurFormat?: (value: string) => string
  inputClassName?: string
}

export function TextField({
  path,
  label,
  hint,
  className,
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
  maxLength,
  liveFormat,
  blurFormat,
  inputClassName,
}: TextFieldProps) {
  return (
    <ReviewField path={path} label={label} hint={hint} className={className}>
      {({ control, register }) => (
        <Input
          {...register}
          {...control}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete ?? "off"}
          placeholder={placeholder}
          maxLength={maxLength}
          spellCheck={false}
          className={inputClassName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            if (liveFormat) reformatInPlace(e.target, liveFormat)
            return register.onChange(e)
          }}
          onBlur={(e: FocusEvent<HTMLInputElement>) => {
            if (blurFormat) reformatInPlace(e.target, blurFormat)
            return register.onBlur(e)
          }}
        />
      )}
    </ReviewField>
  )
}

export interface SelectFieldProps {
  path: string
  label: string
  hint?: ReactNode
  className?: string
  options: readonly { value: string; label: string }[]
  /** Offer an empty first option. */
  placeholder?: string
  /** Called with the new value after every change (side effects such as defaulting the VAT rate). */
  onValueChange?: (value: string) => void
}

export function SelectField({
  path,
  label,
  hint,
  className,
  options,
  placeholder,
  onValueChange,
}: SelectFieldProps) {
  return (
    <ReviewField path={path} label={label} hint={hint} className={className}>
      {({ control, register }) => (
        <Select
          {...register}
          {...control}
          data-field={path}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            const result = register.onChange(e)
            onValueChange?.(e.target.value)
            return result
          }}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </ReviewField>
  )
}

export interface TextareaFieldProps {
  path: string
  label: string
  hint?: ReactNode
  className?: string
  rows?: number
}

export function TextareaField({ path, label, hint, className, rows = 3 }: TextareaFieldProps) {
  return (
    <ReviewField path={path} label={label} hint={hint} className={className}>
      {({ control, register }) => <Textarea {...register} {...control} rows={rows} />}
    </ReviewField>
  )
}

/** Plain checkbox bound to a boolean form value (no extraction markers). */
export function CheckboxField({
  path,
  label,
  hint,
}: {
  path: string
  label: string
  hint?: ReactNode
}) {
  const { register } = useFormContext<FormValues>()
  return <Checkbox label={label} hint={hint} id={`cb-${path}`} {...register(asPath(path))} />
}
