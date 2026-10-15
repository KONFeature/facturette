import { type ReactNode, useId } from "react"
import { cx } from "./cx"

/** Props to spread on the control rendered inside a `Field`. */
export interface FieldControlProps {
  id: string
  "aria-describedby"?: string
  "aria-invalid"?: true
  "aria-required"?: true
}

export interface FieldProps {
  label: ReactNode
  /** Short help under the control. */
  hint?: ReactNode
  /** Error message (French). Announced politely, wired through aria-describedby. */
  error?: string
  /** Adds the required marker and aria-required to the control. */
  required?: boolean
  /** Extra text shown right of the label, e.g. a confidence badge. */
  aside?: ReactNode
  className?: string
  /** Render prop so the control gets id / aria-* : `{(p) => <Input {...register("x")} {...p} />}` */
  children: (control: FieldControlProps) => ReactNode
}

/**
 * Label + control + hint + error. The control is rendered through a function so `id`,
 * `aria-describedby`, `aria-invalid` and `aria-required` are wired without cloning elements,
 * which composes with react-hook-form's `register()` spread.
 */
export function Field({ label, hint, error, required, aside, className, children }: FieldProps) {
  const uid = useId()
  const id = `f${uid.replace(/:/g, "")}`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ")

  const control: FieldControlProps = {
    id,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-required": required ? true : undefined,
  }

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {required && (
            <span className="ml-0.5 text-danger" title="Obligatoire">
              <span aria-hidden="true">*</span>
              <span className="sr-only"> (obligatoire)</span>
            </span>
          )}
        </label>
        {aside}
      </div>
      {children(control)}
      {hint && (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          <span aria-hidden="true">Erreur : </span>
          {error}
        </p>
      )}
    </div>
  )
}
