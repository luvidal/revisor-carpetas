/**
 * Run-to-run consistency. docs2json does not let the caller pick the model,
 * so instead of comparing two models we read the same dataset twice with the
 * same model and measure how often the answer changes.
 */
import type { RunScore } from './score'

export type UnstableField = {
  folder: string
  file: string
  doctype: string
  field: string
  expected: string | number | null
  a: string | number | null
  b: string | number | null
}

export type Consistency = {
  /** Documents usable in one run and a failure (HTTP error or empty answer) in the other. */
  availabilityMismatch: number
  /** Same predicted doctype in both runs, among documents usable in both. */
  classification: { same: number; total: number; rate: number }
  /** Same normalised value in both runs (fields of documents usable in both). */
  fields: { same: number; total: number; rate: number; byDoctype: Record<string, { same: number; total: number; rate: number }> }
  /** Correct in both, wrong in both, or correct in only one ("flaky"). */
  correctness: { bothCorrect: number; bothWrong: number; flaky: number }
  unstable: UnstableField[]
}

const rate = (same: number, total: number) => ({ same, total, rate: total ? same / total : 0 })

export function compareRuns(a: RunScore, b: RunScore): Consistency {
  const docKey = (d: { folder: string; file: string; index: number }) => `${d.folder}/${d.file}#${d.index}`
  const docsB = new Map(b.docs.map(d => [docKey(d), d]))
  let sameClass = 0
  let totalClass = 0
  let availabilityMismatch = 0
  for (const d of a.docs) {
    const other = docsB.get(docKey(d))
    if (!other) continue
    const usableA = d.status === 'usable'
    const usableB = other.status === 'usable'
    if (usableA !== usableB) availabilityMismatch += 1
    if (!usableA || !usableB) continue
    totalClass += 1
    if (other.predictedDoctype === d.predictedDoctype) sameClass += 1
  }

  const fieldKey = (f: { folder: string; file: string; index: number; field: string }) => `${docKey(f)}.${f.field}`
  const fieldsB = new Map(b.fields.map(f => [fieldKey(f), f]))
  const byDoctype: Record<string, { same: number; total: number }> = {}
  const correctness = { bothCorrect: 0, bothWrong: 0, flaky: 0 }
  const unstable: UnstableField[] = []
  let same = 0
  let total = 0
  for (const f of a.fields) {
    const other = fieldsB.get(fieldKey(f))
    if (!other || !f.docUsable || !other.docUsable) continue
    total += 1
    const group = (byDoctype[f.doctype] ??= { same: 0, total: 0 })
    group.total += 1
    if (f.predictedNorm === other.predictedNorm) {
      same += 1
      group.same += 1
    } else {
      unstable.push({
        folder: f.folder,
        file: f.file,
        doctype: f.doctype,
        field: f.field,
        expected: f.expectedNorm,
        a: f.predictedNorm,
        b: other.predictedNorm,
      })
    }
    const okA = f.outcome === 'correct'
    const okB = other.outcome === 'correct'
    if (okA && okB) correctness.bothCorrect += 1
    else if (!okA && !okB) correctness.bothWrong += 1
    else correctness.flaky += 1
  }
  return {
    availabilityMismatch,
    classification: rate(sameClass, totalClass),
    fields: {
      ...rate(same, total),
      byDoctype: Object.fromEntries(Object.entries(byDoctype).map(([k, v]) => [k, rate(v.same, v.total)])),
    },
    correctness,
    unstable,
  }
}
