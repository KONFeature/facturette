import { useId, useState } from "react"
import type { ValidationIssue } from "../../lib/validation"
import { Alert, Badge, Button } from "../ui"
import {
  blockingReason,
  countIssues,
  groupIssuesBySection,
  issueCountLabel,
  sectionLabel,
} from "./issues"

export interface SummaryBarProps {
  issues: readonly ValidationIssue[]
  ready: boolean
  /** The user already tried to continue with errors left. */
  submitted: boolean
  /** Polite announcement text (set after a failed attempt). */
  announcement: string
  /** French messages of save failures (profile / customer) shown with a "continue anyway" option. */
  saveFailures: readonly string[]
  onGoTo(path: string): void
  onSubmit(): void
  onContinueAnyway(): void
  onBack(): void
}

/**
 * Sticky bottom bar of the form: live issue count (opens the list), "Retour" and the main action.
 * The main action stays clickable while blocked (aria-disabled) so that clicking it reveals every
 * error and moves focus to the first one, instead of failing silently.
 */
export function SummaryBar({
  issues,
  ready,
  submitted,
  announcement,
  saveFailures,
  onGoTo,
  onSubmit,
  onContinueAnyway,
  onBack,
}: SummaryBarProps) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const reasonId = useId()
  const counts = countIssues(issues)
  const reason = blockingReason(counts)
  const groups = groupIssuesBySection(issues)

  return (
    <div className="sticky bottom-0 z-20 rounded-panel border border-rule-strong bg-surface/95 px-4 py-2.5 shadow-[0_-6px_16px_rgb(21_28_43/0.08)] backdrop-blur">
      <p role="status" className="sr-only">
        {announcement}
      </p>

      {saveFailures.length > 0 && (
        <Alert tone="error" title="La mémorisation a échoué" className="mb-3">
          <ul className="list-disc space-y-0.5 pl-5">
            {saveFailures.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="mt-2">
            Le navigateur refuse peut-être l’enregistrement (mode privé, espace plein). Votre
            facture n’est pas concernée.{" "}
            <button
              type="button"
              onClick={onContinueAnyway}
              className="rounded-control font-medium text-accent underline underline-offset-2"
            >
              Continuer sans mémoriser
            </button>
          </p>
        </Alert>
      )}

      {open && (
        <div
          id={listId}
          className="mb-3 max-h-[38dvh] overflow-auto rounded-control border border-rule bg-paper p-3"
        >
          {groups.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Rien à signaler : tous les contrôles sont passés.
            </p>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <section key={g.section} aria-label={sectionLabel(g.section)}>
                  <h3 className="font-sans text-sm font-semibold text-ink">
                    {sectionLabel(g.section)}
                  </h3>
                  <ul className="mt-1 space-y-1">
                    {g.issues.map((issue) => (
                      <li key={`${issue.path}-${issue.code}-${issue.message}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            onGoTo(issue.path)
                          }}
                          className="flex w-full items-start gap-2 rounded-control px-2 py-1.5 text-left text-sm hover:bg-sunken"
                        >
                          <Badge
                            tone={issue.severity === "error" ? "danger" : "warn"}
                            className="mt-0.5 shrink-0"
                          >
                            {issue.severity === "error" ? "Erreur" : "Attention"}
                          </Badge>
                          <span className="min-w-0 text-ink">{issue.message}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-10 items-center gap-2 rounded-control px-2 text-sm font-medium text-ink hover:bg-sunken"
        >
          <Badge tone={counts.errors > 0 ? "danger" : "ok"}>
            {counts.errors > 0 ? `${counts.errors} à corriger` : "Prêt"}
          </Badge>
          <span>{issueCountLabel(counts)}</span>
          <span aria-hidden="true" className="text-ink-muted">
            {open ? "▾" : "▸"}
          </span>
          <span className="sr-only">{open ? "Masquer la liste" : "Afficher la liste"}</span>
        </button>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onBack}>
            Retour
          </Button>
          <Button
            variant="primary"
            aria-disabled={!ready || undefined}
            aria-describedby={reason ? reasonId : undefined}
            onClick={onSubmit}
          >
            Générer la facture Factur-X
          </Button>
        </div>
      </div>
      {reason && (
        <p
          id={reasonId}
          className={`mt-1 text-xs sm:text-sm ${submitted ? "font-medium text-danger" : "text-ink-muted"}`}
        >
          {reason}
        </p>
      )}
    </div>
  )
}
