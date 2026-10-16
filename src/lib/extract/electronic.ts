/**
 * BT-34 / BT-49 electronic addresses (where the e-invoicing platforms deliver the invoice).
 *
 * A French company's address is the one its platform registered in the annuaire: the SIREN
 * alone, `SIREN_SIRET` or `SIREN_suffix`. Invoices rarely print it; when one does
 * ("Adresse électronique : 324286319_STANDARD"), it goes to the party whose SIREN it starts
 * with. Otherwise a party with a detected SIREN is offered that SIREN as its address,
 * pre-filled but « à vérifier »: it is only right when the company registered a SIREN-level
 * address.
 */
import { FR_DIRECTORY_SCHEME } from "../../domain/invoice"
import type { Collector } from "./collect"
import { findLabeled, type ValueReader } from "./labels"
import type { Layout } from "./layout"
import { PREFILL_THRESHOLD } from "./types"

/** Pre-filled (>= 0.6) but below the "fiable" level (0.85): the form shows « à vérifier ». */
export const SIREN_DEFAULT_CONFIDENCE = 0.62

const PARTIES = ["seller", "buyer"] as const

const LABEL_RE =
  /^(adresses? (electronique|de facturation electronique|de reception)( de facturation)?|identifiant (de routage|d'adressage|electronique)|electronic address|endpoint( id)?)( (du|de l'|de la) ?(client|acheteur|vendeur|fournisseur|emetteur|destinataire|entreprise|societe))?\b/

/** "324286319_STANDARD", "0225:822698916_82269891600035". An e-mail address is not read. */
const readDirectoryAddress: ValueReader<string> = (s) => {
  const m = /^(?:0225\s*[:-]\s*)?(\d{9}(?:_[A-Za-z0-9._-]+)?)(?=$|[\s,;)])/.exec(s.trim())
  return m?.[1] ? { value: m[1], text: m[0] } : undefined
}

function partySiren(collector: Collector, party: (typeof PARTIES)[number]): string | undefined {
  const best = collector.best(`${party}.siren`)
  return best && best.confidence >= PREFILL_THRESHOLD ? String(best.value) : undefined
}

/** Printed directory addresses, given to the party whose SIREN they start with. */
export function extractElectronicAddresses(layout: Layout, collector: Collector): void {
  for (const m of findLabeled(layout, LABEL_RE, readDirectoryAddress)) {
    const party = PARTIES.find((p) => partySiren(collector, p) === m.value.slice(0, 9))
    if (!party) continue
    const cells = m.labelCell === m.valueCell ? [m.labelCell] : [m.labelCell, m.valueCell]
    collector.add(
      `${party}.electronicAddress.value`,
      m.value,
      0.9,
      cells,
      "electronic-address-label",
    )
  }
}

/** Once conflicts are resolved: the SIREN as the default address of a party without one. */
export function addSirenDefaultAddresses(collector: Collector): void {
  for (const party of PARTIES) {
    if (collector.all(`${party}.electronicAddress.value`).length > 0) continue
    const siren = collector.best(`${party}.siren`)
    if (!siren || siren.confidence < PREFILL_THRESHOLD) continue
    collector.derive(
      `${party}.electronicAddress.value`,
      String(siren.value),
      Math.min(SIREN_DEFAULT_CONFIDENCE, siren.confidence),
      siren,
      "electronic-address-siren-default",
      `SIREN ${siren.value} : adresse par défaut (scheme ${FR_DIRECTORY_SCHEME}), à vérifier dans l'annuaire`,
    )
  }
}
