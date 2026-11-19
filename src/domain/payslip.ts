/** Payslip helpers shared by the evals and the agent. */
import { normalizeText } from './normalize'

type Row = Record<string, unknown>

const asRows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === 'object') : [])

/**
 * The AFP contribution deducted in a payslip: the row docs2json tags as
 * `legalType: 'afp'`, or else the one whose label mentions AFP.
 */
export function afpDeduction(descuentos: unknown): unknown {
  const rows = asRows(descuentos)
  const tagged = rows.find(r => r.legalType === 'afp')
  const byLabel = rows.find(r => /\bAFP\b/.test(normalizeText(r.label) ?? ''))
  return (tagged ?? byLabel)?.value ?? null
}
