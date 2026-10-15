import type { ComponentPropsWithRef, ReactNode } from "react"
import { cx } from "./cx"

/** Paper-like panel with a hairline border. */
export function Card({ className, ...rest }: ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cx("rounded-panel border border-rule bg-surface shadow-panel", className)}
      {...rest}
    />
  )
}

export interface SectionProps extends Omit<ComponentPropsWithRef<"section">, "title"> {
  /** Section heading (h2). Gives the section an accessible name. */
  title: ReactNode
  description?: ReactNode
  /** Right-aligned header content (actions, badges). */
  actions?: ReactNode
}

/** Titled card section for forms: `<section aria-labelledby>` + h2 + body. */
export function Section({
  title,
  description,
  actions,
  className,
  children,
  id,
  ...rest
}: SectionProps) {
  const headingId = `${id ?? "section"}-title`
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cx("rounded-panel border border-rule bg-surface shadow-panel", className)}
      {...rest}
    >
      <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
        <div>
          <h2 id={headingId} className="text-lg">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  )
}
