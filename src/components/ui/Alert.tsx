import type { ReactNode } from "react"
import { cx } from "./cx"

export type AlertTone = "info" | "warning" | "error"

const styles: Record<AlertTone, { box: string; label: string }> = {
  info: { box: "border-info/30 bg-info-soft text-ink", label: "Information" },
  warning: { box: "border-warn/40 bg-warn-soft text-ink", label: "Attention" },
  error: { box: "border-danger/40 bg-danger-soft text-ink", label: "Erreur" },
}

const iconPath: Record<AlertTone, string> = {
  info: "M12 8h.01M11 12h1v4h1",
  warning: "M12 8v5m0 3h.01",
  error: "M9 9l6 6m0-6l-6 6",
}

export interface AlertProps {
  tone?: AlertTone
  title?: ReactNode
  children?: ReactNode
  className?: string
}

/**
 * Inline message. `error` uses role="alert" (assertive), `warning`/`info` use role="status".
 * The tone is also written in a visually hidden prefix so colour is not the only signal.
 */
export function Alert({ tone = "info", title, children, className }: AlertProps) {
  const s = styles[tone]
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("flex gap-3 rounded-panel border px-4 py-3", s.box, className)}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={cx(
          "mt-0.5 size-5 shrink-0",
          tone === "info" && "text-info",
          tone === "warning" && "text-warn",
          tone === "error" && "text-danger",
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d={iconPath[tone]} />
      </svg>
      <div className="min-w-0 text-sm">
        <span className="sr-only">{s.label} : </span>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title ? "mt-1" : "", "text-ink-soft")}>{children}</div>}
      </div>
    </div>
  )
}
