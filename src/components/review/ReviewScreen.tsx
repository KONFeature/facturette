import { useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useAppStore } from "../../app/store"
import type { Suggestion } from "../../lib/extract/types"
import {
  clearSellerProfile,
  loadSellerProfile,
  type SellerProfile,
  saveCustomerChecked,
  saveSellerProfile,
} from "../../lib/storage"
import { requiredPaths, validateInvoice } from "../../lib/validation"
import { Alert, Button } from "../ui"
import { BuyerSection } from "./BuyerSection"
import { deriveFieldState, summarizeDetection } from "./fieldState"
import { firstInDocument, focusField } from "./focus"
import { draftToForm, type FormValues, formToDraft, numberIssues } from "./formModel"
import { InvoiceSection } from "./InvoiceSection"
import { countIssues, mergeIssues } from "./issues"
import { LinesSection } from "./LinesSection"
import { PaymentSection } from "./PaymentSection"
import { PdfPane } from "./PdfPane"
import {
  canMemorizeBuyer,
  canMemorizeSeller,
  customerFromDraft,
  profileAsDraft,
  sellerProfileFromDraft,
} from "./profile"
import { type Highlight, type ReviewContextValue, ReviewProvider } from "./ReviewContext"
import { asPath } from "./ReviewField"
import { SaveOptions } from "./SaveOptions"
import { SellerSection } from "./SellerSection"
import { SummaryBar } from "./SummaryBar"
import {
  formValueForSuggestion,
  pruneStaleLineSuggestions,
  reindexLineSuggestions,
} from "./suggestions"
import { VatSection } from "./VatSection"

const EMPTY_SET: ReadonlySet<string> = new Set()

/** The whole step: PDF pane + form + validation bar. Reads and writes the app store. */
export function ReviewScreen() {
  const navigate = useNavigate()
  const pdf = useAppStore((s) => s.pdf)
  const extraction = useAppStore((s) => s.extraction)
  const setDraft = useAppStore((s) => s.setDraft)
  const reset = useAppStore((s) => s.reset)

  const [initialDraft] = useState(() => useAppStore.getState().draft)
  const methods = useForm<FormValues>({ defaultValues: draftToForm(initialDraft) })
  const { getValues, setValue, watch } = methods
  const values = watch()

  const [suggestions, setSuggestions] = useState<Suggestion[]>(() =>
    pruneStaleLineSuggestions(extraction?.suggestions ?? [], initialDraft),
  )
  const [touched, setTouched] = useState<ReadonlySet<string>>(EMPTY_SET)
  const [submitted, setSubmitted] = useState(false)
  const [announcement, setAnnouncement] = useState("")
  const [highlight, setHighlight] = useState<Highlight | null>(null)
  const [paneOpen, setPaneOpen] = useState(false)
  const nonce = useRef(0)

  const [profile, setProfile] = useState<SellerProfile | null>(() => loadSellerProfile())
  const [rememberSeller, setRememberSeller] = useState(false)
  const [rememberBuyer, setRememberBuyer] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [saveFailures, setSaveFailures] = useState<string[]>([])

  // ---- live validation (draft built from the form on every change) ----------------------------
  const draft = formToDraft(values)
  const base = validateInvoice(draft)
  const formIssues = numberIssues(values)
  const issues = mergeIssues(base.issues, formIssues)
  const ready = base.ready && formIssues.length === 0
  const required: ReadonlySet<string> = new Set(requiredPaths(draft))
  const profileDraft = profileAsDraft(profile)
  const detection = summarizeDetection(suggestions, draft)

  const touch = useCallback((path: string) => {
    setTouched((prev) => (prev.has(path) ? prev : new Set(prev).add(path)))
  }, [])

  const showEvidence = useCallback((s: Suggestion) => {
    const bbox = s.evidence.bbox
    if (!bbox) return
    nonce.current += 1
    setHighlight({ path: s.path, bbox, text: s.evidence.text, nonce: nonce.current })
    setPaneOpen(true)
  }, [])

  const applySuggestion = useCallback(
    (s: Suggestion) => {
      setValue(asPath(s.path), formValueForSuggestion(s.path, s.value), {
        shouldDirty: true,
        shouldTouch: true,
      })
      touch(s.path)
      showEvidence(s)
    },
    [setValue, touch, showEvidence],
  )

  const onLinesChanged = useCallback((newToOld: readonly (number | null)[]) => {
    setSuggestions((prev) => reindexLineSuggestions(prev, newToOld))
    // Highlights on line fields would now point at another line's text.
    setHighlight((h) => (h?.path.startsWith("lines.") ? null : h))
  }, [])

  const context: ReviewContextValue = {
    draft,
    report: { issues, ready },
    requiredPaths: required,
    submitted,
    highlight,
    stateOf: (path) =>
      deriveFieldState(path, {
        draft,
        suggestions,
        requiredPaths: required,
        issues,
        touched,
        submitted,
        profile: profileDraft,
      }),
    touch,
    applySuggestion,
    showEvidence,
    onLinesChanged,
  }

  // ---- keep the edits when leaving the step (Retour, browser back, next step) -----------------
  useEffect(
    () => () => {
      if (useAppStore.getState().pdf) setDraft(formToDraft(getValues()))
    },
    [getValues, setDraft],
  )

  // ---- actions ---------------------------------------------------------------------------------
  const goToIssue = useCallback((path: string) => {
    focusField(path)
  }, [])

  const submit = () => {
    if (!ready) {
      setSubmitted(true)
      const errors = issues.filter((i) => i.severity === "error")
      setAnnouncement(
        `Impossible de continuer : ${countIssues(issues).errors} erreur${errors.length > 1 ? "s" : ""} à corriger. ${errors[0]?.message ?? ""}`,
      )
      // Wait for the errors to render, then focus the first invalid field in page order.
      requestAnimationFrame(() => {
        const first = firstInDocument(errors.map((e) => e.path))
        if (first) focusField(first)
      })
      return
    }

    setDraft(draft)
    const failures: string[] = []
    if (rememberSeller && canMemorizeSeller(draft, issues)) {
      const input = sellerProfileFromDraft(draft)
      if (!input || !saveSellerProfile(input)) {
        failures.push("Le profil de votre entreprise n’a pas pu être enregistré.")
      } else {
        setProfile(loadSellerProfile())
      }
    }
    if (rememberBuyer && canMemorizeBuyer(draft, issues)) {
      const party = customerFromDraft(draft)
      if (!party || !saveCustomerChecked(party).persisted) {
        failures.push("Ce client n’a pas pu être enregistré.")
      }
    }
    if (failures.length > 0) {
      setSaveFailures(failures)
      return
    }
    void navigate({ to: "/done" })
  }

  const back = () => {
    setDraft(formToDraft(getValues()))
    void navigate({ to: "/" })
  }

  const startOver = () => {
    const ok = window.confirm(
      "Abandonner cette facture et choisir un autre PDF ? Les informations saisies seront perdues.",
    )
    if (!ok) return
    reset()
    void navigate({ to: "/" })
  }

  const forgetProfile = () => {
    if (clearSellerProfile()) {
      setProfile(null)
      setSaveMessage("Profil effacé de ce navigateur.")
    } else {
      setSaveMessage("Impossible d’effacer le profil : le navigateur a refusé la modification.")
    }
  }

  if (!pdf) return null

  return (
    <ReviewProvider value={context}>
      <FormProvider {...methods}>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="max-w-2xl">
            <h1 className="text-3xl sm:text-4xl">Vérifiez et complétez la facture</h1>
            <p className="mt-2 text-ink-soft">
              {detection.withCandidates > 0
                ? `${detection.detected} information${detection.detected > 1 ? "s" : ""} reprise${detection.detected > 1 ? "s" : ""} du PDF. Contrôlez-les, puis complétez les champs obligatoires (*).`
                : "Renseignez les champs obligatoires (*). Votre PDF reste à côté pour vous aider."}
            </p>
          </div>
          <Button variant="ghost" onClick={startOver}>
            Recommencer avec un autre PDF
          </Button>
        </header>

        {extraction && extraction.warnings.length > 0 && (
          <div className="mb-6 space-y-3">
            {extraction.warnings.map((w) => (
              <Alert key={w} tone="warning">
                {w}
              </Alert>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)] lg:items-start">
          <PdfPane
            bytes={pdf.bytes}
            name={pdf.name}
            size={pdf.size}
            highlight={highlight}
            open={paneOpen}
            onOpenChange={setPaneOpen}
            onClearHighlight={() => setHighlight(null)}
          />

          <form
            noValidate
            className="min-w-0 space-y-6"
            aria-label="Informations de la facture"
            onSubmit={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              // Enter inside a field must never trigger the main action.
              if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault()
            }}
          >
            <InvoiceSection />
            <SellerSection />
            <BuyerSection />
            <LinesSection />
            <VatSection />
            <PaymentSection />
            <SaveOptions
              profile={profile}
              message={saveMessage}
              canMemorizeSeller={canMemorizeSeller(draft, issues)}
              canMemorizeBuyer={canMemorizeBuyer(draft, issues)}
              rememberSeller={rememberSeller}
              rememberBuyer={rememberBuyer}
              onRememberSeller={setRememberSeller}
              onRememberBuyer={setRememberBuyer}
              onForgetProfile={forgetProfile}
            />
            <SummaryBar
              issues={issues}
              ready={ready}
              submitted={submitted}
              announcement={announcement}
              saveFailures={saveFailures}
              onGoTo={goToIssue}
              onSubmit={submit}
              onContinueAnyway={() => void navigate({ to: "/done" })}
              onBack={back}
            />
          </form>
        </div>
      </FormProvider>
    </ReviewProvider>
  )
}
