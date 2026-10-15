import type { ComponentPropsWithRef } from "react"
import { cx } from "./cx"

export type BadgeTone = "neutral" | "ok" | "warn" | "danger" | "info"

const tones: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-ink-soft border-rule",
  ok: "bg-ok-soft text-ok border-ok/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-info-soft text-info border-info/30",
}

/** Small status label. Always carries text, so colour is never the only signal. */
export function Badge({
  tone = "neutral",
  className,
  ...rest
}: ComponentPropsWithRef<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...rest}
    />
  )
}
