import type { ComponentPropsWithRef, ReactNode } from "react"
import { cx } from "./cx"

const controlBase =
  "block w-full rounded-control border bg-surface px-3 text-base text-ink placeholder:text-ink-muted/80 " +
  "transition-colors duration-150 hover:border-ink-muted disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-muted " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft/40 border-rule-strong"

/** Text input. Forwards `ref` and every native prop, so `{...register("name")}` works. */
export function Input({ className, ...rest }: ComponentPropsWithRef<"input">) {
  return <input className={cx(controlBase, "min-h-10 py-2", className)} {...rest} />
}

/** Native select (best mobile behaviour and accessibility). Pass `<option>` children. */
export function Select({ className, children, ...rest }: ComponentPropsWithRef<"select">) {
  return (
    <select className={cx(controlBase, "min-h-10 py-2 pr-8", className)} {...rest}>
      {children}
    </select>
  )
}

/** Multi-line input. Vertical resize only. */
export function Textarea({ className, rows = 3, ...rest }: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cx(controlBase, "min-h-20 resize-y py-2 leading-relaxed", className)}
      {...rest}
    />
  )
}

export interface CheckboxProps extends Omit<ComponentPropsWithRef<"input">, "type"> {
  /** Label text, rendered to the right and clickable. */
  label: ReactNode
  /** Optional help text under the label. */
  hint?: ReactNode
}

/** Checkbox with its own label (not wrapped by `Field`). */
export function Checkbox({ label, hint, className, id, ...rest }: CheckboxProps) {
  const inputId = id ?? `cb-${String(rest.name ?? label)}`
  return (
    <div className={cx("flex items-start gap-3", className)}>
      <input
        id={inputId}
        type="checkbox"
        className="mt-1 size-4 shrink-0 accent-accent"
        aria-describedby={hint ? `${inputId}-hint` : undefined}
        {...rest}
      />
      <div className="text-sm">
        <label htmlFor={inputId} className="font-medium text-ink">
          {label}
        </label>
        {hint && (
          <p id={`${inputId}-hint`} className="text-ink-muted">
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}
