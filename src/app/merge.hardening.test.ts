import { describe, expect, it } from "vitest"
import { mergeDeep, patchDraftValue } from "./merge"

describe("mergeDeep resists prototype pollution", () => {
  it("ignores an own __proto__ key coming from JSON.parse", () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":"yes"},"number":"F-1"}')
    const merged = mergeDeep(
      { seller: { name: "ACME" } } as Record<string, unknown>,
      hostile,
      false,
    )
    expect(merged.number).toBe("F-1")
    // The merged object was not re-parented and Object.prototype is untouched.
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
    expect((merged as { polluted?: string }).polluted).toBeUndefined()
    expect(({} as { polluted?: string }).polluted).toBeUndefined()
  })

  it("ignores nested constructor / prototype keys", () => {
    const hostile = JSON.parse('{"seller":{"constructor":{"prototype":{"x":1}},"name":"B"}}')
    const merged = mergeDeep({ seller: { name: "A" } } as Record<string, unknown>, hostile, false)
    expect((merged.seller as { name: string }).name).toBe("B")
    expect(Object.hasOwn(merged.seller as object, "constructor")).toBe(false)
    expect(({} as { x?: number }).x).toBeUndefined()
  })

  it("still merges normally", () => {
    const draft = patchDraftValue(
      { seller: { name: "A", legalForm: "SARL" } },
      { seller: { name: "B" } },
    )
    expect(draft).toEqual({ seller: { name: "B", legalForm: "SARL" } })
  })
})
