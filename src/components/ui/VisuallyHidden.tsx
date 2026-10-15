import type { ComponentPropsWithRef } from "react"

/** Content available to screen readers only (still focusable children stay focusable). */
export function VisuallyHidden({ className, ...rest }: ComponentPropsWithRef<"span">) {
  return <span className={className ? `sr-only ${className}` : "sr-only"} {...rest} />
}
