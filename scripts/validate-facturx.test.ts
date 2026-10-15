import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { parseMustangOutput } from "./validate-facturx"

const fixture = (name: string) =>
  readFileSync(resolve(import.meta.dirname, "__fixtures__", name), "utf8")

describe("parseMustangOutput", () => {
  it("accepts a file where every section is valid", () => {
    const r = parseMustangOutput(fixture("mustang-xml-valid.txt"))
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("REGRESSION: rejects a PDF whose PDF/A section failed even though Mustang's overall verdict says valid", () => {
    const raw = fixture("mustang-pdfa-invalid-xml-valid.txt")
    // Precondition that made the old parser lie: the very last <summary> is "valid".
    expect([...raw.matchAll(/<summary status="(\w+)"/g)].pop()?.[1]).toBe("valid")

    const r = parseMustangOutput(raw)
    expect(r.pdf).toBe("invalid")
    expect(r.xml).toBe("valid")
    expect(r.valid).toBe(false)
  })

  it("reports veraPDF failures as readable errors, one line per rule with a count", () => {
    const r = parseMustangOutput(fixture("mustang-pdfa-invalid-xml-valid.txt"))
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain("6.2.11.4.1#1")
    expect(r.errors[0]).toContain("x2")
    expect(r.errors[0]).toContain("font programs for all fonts")
  })

  it("treats unparseable output as invalid", () => {
    expect(parseMustangOutput("").valid).toBe(false)
    expect(parseMustangOutput("not xml at all").valid).toBe(false)
  })
})
