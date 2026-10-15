import { cx } from "./cx"

export const STEPS = ["Importer", "Vérifier", "Télécharger"] as const

export interface StepperProps {
  /** 1-based index of the current step (1..3). */
  current: 1 | 2 | 3
  className?: string
}

/** Three-step progress list. The current step has aria-current="step"; done steps say so. */
export function Stepper({ current, className }: StepperProps) {
  return (
    <nav aria-label="Progression" className={className}>
      <ol className="flex items-center gap-2 sm:gap-3">
        {STEPS.map((label, i) => {
          const n = i + 1
          const state = n < current ? "done" : n === current ? "current" : "todo"
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className="flex items-center gap-2 sm:gap-3"
            >
              <span
                className={cx(
                  "grid size-6 place-items-center rounded-full border text-xs font-semibold tabular",
                  state === "current" && "border-accent bg-accent text-on-accent",
                  state === "done" && "border-ok bg-ok text-on-accent",
                  state === "todo" && "border-rule-strong bg-surface text-ink-muted",
                )}
                aria-hidden="true"
              >
                {state === "done" ? "✓" : n}
              </span>
              <span
                className={cx(
                  "text-sm",
                  state === "current" ? "font-semibold text-ink" : "text-ink-muted",
                  state !== "current" && "max-sm:sr-only",
                )}
              >
                {label}
                {state === "done" && <span className="sr-only"> (terminé)</span>}
                {state === "current" && <span className="sr-only"> (étape en cours)</span>}
              </span>
              {n < STEPS.length && (
                <span aria-hidden="true" className="h-px w-4 bg-rule-strong sm:w-8" />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
