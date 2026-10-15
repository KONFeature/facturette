import type { ComponentPropsWithRef } from "react"
import { cx } from "./cx"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
export type ButtonSize = "md" | "lg"

export const buttonClasses = (variant: ButtonVariant = "primary", size: ButtonSize = "md") =>
  cx(
    "inline-flex select-none items-center justify-center gap-2 rounded-control border font-medium transition-colors duration-150",
    "disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55",
    size === "lg" ? "min-h-12 px-6 text-base" : "min-h-10 px-4 text-sm",
    variant === "primary" &&
      "border-accent bg-accent text-on-accent hover:bg-accent-hover hover:border-accent-hover",
    variant === "secondary" && "border-rule-strong bg-surface text-ink hover:bg-sunken",
    variant === "ghost" && "border-transparent bg-transparent text-ink-soft hover:bg-sunken",
    variant === "danger" && "border-danger bg-surface text-danger hover:bg-danger-soft",
  )

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  /** Visual weight. `primary` is for the one main action of a screen. */
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner, sets aria-busy and ignores clicks while keeping focus on the button. */
  loading?: boolean
}

/** Button. While `loading` it stays focusable (aria-disabled) so focus is not lost. */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  type = "button",
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      className={cx(buttonClasses(variant, size), className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cx("size-4 animate-spin", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  )
}
