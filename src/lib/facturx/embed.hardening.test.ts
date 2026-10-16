import { describe, expect, it } from "vitest"
import { buildXmp } from "./embed"

describe("XMP packet from hostile text", () => {
  const now = new Date("2026-10-16T10:00:00Z")

  it("strips control characters that would make the packet malformed XML", () => {
    const xmp = buildXmp(
      {
        invoice: {
          number: "F-1\u0000\u0007",
          issueDate: "2026-10-01",
          sellerName: "ACME\u0001 SAS",
        },
      },
      "EN16931",
      now,
      now,
    )
    // Only tab, line feed and carriage return are legal below U+0020 in XML 1.0.
    const illegal = [...xmp].filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0
      return cp < 0x20 && cp !== 0x9 && cp !== 0xa && cp !== 0xd
    })
    expect(illegal).toEqual([])
    expect(xmp).toContain("ACME SAS")
  })

  it("escapes markup so a value cannot break out of the packet", () => {
    const xmp = buildXmp(
      {
        invoice: {
          number: "F-1",
          issueDate: "2026-10-01",
          sellerName: '</rdf:li><evil a="1">&',
        },
      },
      "EN16931",
      now,
      now,
    )
    expect(xmp).not.toContain("<evil")
    expect(xmp).toContain("&lt;/rdf:li&gt;&lt;evil a=&quot;1&quot;&gt;&amp;")
  })
})
