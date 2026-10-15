import { describe, expect, it } from "vitest"
import { PdfReadError } from "../lib/pdf/extract-text"
import { createAppStore, selectIsScanned } from "./store"
import { extraction, fakeDeps, pdfFile, textDoc } from "./test-fakes"

describe("app store", () => {
  it("loadPdf success fills pdf, textDoc, extraction and draft", async () => {
    const store = createAppStore(fakeDeps({ extractInvoice: () => extraction({ number: "A-1" }) }))
    expect(store.getState().status).toBe("idle")
    const ok = await store.getState().loadPdf(pdfFile({ name: "a.pdf" }))
    const s = store.getState()
    expect(ok).toBe(true)
    expect(s.status).toBe("ready")
    expect(s.pdf?.name).toBe("a.pdf")
    expect(s.draft.number).toBe("A-1")
    expect(s.textDoc).not.toBeNull()
  })

  it("scanned PDF is ready but flagged by the selector", async () => {
    const store = createAppStore(fakeDeps({ extractPdfText: async () => textDoc(false) }))
    expect(await store.getState().loadPdf(pdfFile())).toBe(true)
    expect(selectIsScanned(store.getState())).toBe(true)
  })

  it("encrypted PDF leaves an error and no PDF", async () => {
    const store = createAppStore(
      fakeDeps({
        extractPdfText: async () => {
          throw new PdfReadError("encrypted", "x")
        },
      }),
    )
    expect(await store.getState().loadPdf(pdfFile())).toBe(false)
    const s = store.getState()
    expect(s.status).toBe("error")
    expect(s.error?.kind).toBe("encrypted")
    expect(s.pdf).toBeNull()
  })

  it("unexpected failures get a generic French message", async () => {
    const store = createAppStore(
      fakeDeps({
        extractPdfText: async () => {
          throw new Error("kaboom")
        },
      }),
    )
    await store.getState().loadPdf(pdfFile())
    // generic read failures are mapped to 'unreadable' by the pipeline
    expect(store.getState().error?.kind).toBe("unreadable")
  })

  it("patchDraft deep-merges (blank strings included), setDraft replaces, reset clears", async () => {
    const store = createAppStore(fakeDeps({ extractInvoice: () => extraction({ number: "A-1" }) }))
    await store.getState().loadPdf(pdfFile())
    store.getState().patchDraft({ buyer: { name: "Zed" } })
    expect(store.getState().draft.buyer?.name).toBe("Zed")
    expect(store.getState().draft.buyer?.address?.countryCode).toBe("FR")
    store.getState().patchDraft({ number: "" })
    expect(store.getState().draft.number).toBe("")
    store.getState().setDraft({ number: "B" })
    expect(store.getState().draft).toEqual({ number: "B" })
    store.getState().reset()
    expect(store.getState().pdf).toBeNull()
    expect(store.getState().status).toBe("idle")
  })

  it("ignores a stale load when a newer one started", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => {
      release = r
    })
    let calls = 0
    const store = createAppStore(
      fakeDeps({
        extractPdfText: async () => {
          calls++
          if (calls === 1) await gate
          return textDoc()
        },
      }),
    )
    const first = store.getState().loadPdf(pdfFile({ name: "old.pdf" }))
    const second = store.getState().loadPdf(pdfFile({ name: "new.pdf" }))
    await second
    release()
    expect(await first).toBe(false)
    expect(store.getState().pdf?.name).toBe("new.pdf")
  })
})
