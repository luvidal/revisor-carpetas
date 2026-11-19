/**
 * Scoring: compares saved API responses with the ground truth. Pure functions
 * (no network), so a run can be re-scored for free after changing a
 * normaliser, and the logic is unit-tested.
 */
import { errorLabel, type ReadDocument, type ReadResponse } from '../docs2json/client'
import type { Doctype, ExpectedDocument, FolderTruth } from '../domain/truth'
import { FIELD_SPECS, normalizeField, readRaw, rowOverlap } from './fields'
import { mean, percentile } from './stats'

/** One API call's result as saved on disk. */
export type RawFileResult = {
  folder: string
  file: string
  mimeType: string
  ok: boolean
  status: number
  latencyMs: number
  attempts: number
  /** Why earlier attempts were repeated, if any. */
  retries?: string[]
  error?: string
  response?: ReadResponse
}

export type RawRun = {
  runTag: string
  startedAt: string
  finishedAt: string
  results: RawFileResult[]
  /** The call budget ran out mid-pass; unread files are recorded as failures. */
  budgetExceeded?: boolean
}

export type Outcome = 'correct' | 'wrong' | 'missing' | 'spurious'

export type DocResult = {
  folder: string
  file: string
  index: number
  expectedDoctype: Doctype
  predictedDoctype: string | null
  correct: boolean
  confidence: number | null
  /**
   * What came back: `usable` (a type and at least one field), `empty` (HTTP 200
   * but no type or no fields: a silent failure), `not_returned` (the response
   * had no document for these pages) or `request_failed` (HTTP error).
   */
  status: DocStatus
  /** Number of fields scored for this doctype, used for end-to-end rates. */
  fieldCount: number
}

export type DocStatus = 'usable' | 'empty' | 'not_returned' | 'request_failed'

export type FieldResult = {
  folder: string
  file: string
  index: number
  doctype: Doctype
  field: string
  expected: unknown
  predicted: unknown
  expectedNorm: string | number | null
  predictedNorm: string | number | null
  outcome: Outcome
  /** False when the document came back empty: the field is then an availability failure, not an extraction error. */
  docUsable: boolean
}

export type FileResult = {
  folder: string
  file: string
  mimeType: string
  ok: boolean
  status: number
  latencyMs: number
  attempts: number
  /** Why earlier attempts were repeated (recorded since session 20261119-1246). */
  retries?: string[]
  error?: string
  expectedDocs: number
  returnedDocs: number
}

export type RunScore = {
  runTag: string
  files: FileResult[]
  docs: DocResult[]
  fields: FieldResult[]
  models: string[]
  catalogVersions: string[]
}

function overlap(a: { start: number; end: number }, b?: { start: number; end: number }): number {
  if (!b) return 0
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start) + 1)
}

/**
 * Pairs each expected document with at most one returned document: the one
 * whose pages overlap most (same doctype breaks ties), else the one at the
 * same position.
 */
export function matchDocuments(expected: ExpectedDocument[], returned: ReadDocument[]): Array<ReadDocument | null> {
  const used = new Set<number>()
  return expected.map((e, i) => {
    let best = -1
    let bestScore = 0
    returned.forEach((r, j) => {
      if (used.has(j)) return
      const score = overlap(e.pages, r.pages) * 2 + (r.doctype === e.doctype ? 1 : 0)
      if (overlap(e.pages, r.pages) > 0 && score > bestScore) {
        best = j
        bestScore = score
      }
    })
    if (best < 0 && i < returned.length && !used.has(i)) best = i
    if (best < 0) return null
    used.add(best)
    return returned[best]!
  })
}

export function classifyOutcome(expectedNorm: unknown, predictedNorm: unknown): Outcome {
  if (expectedNorm === null) return predictedNorm === null ? 'correct' : 'spurious'
  if (predictedNorm === null) return 'missing'
  return expectedNorm === predictedNorm ? 'correct' : 'wrong'
}

export function scoreRun(truths: FolderTruth[], run: RawRun): RunScore {
  const byKey = new Map(run.results.map(r => [`${r.folder}/${r.file}`, r]))
  const files: FileResult[] = []
  const docs: DocResult[] = []
  const fields: FieldResult[] = []
  const models = new Set<string>()
  const catalogs = new Set<string>()

  for (const truth of truths) {
    for (const expectedFile of truth.files) {
      const raw = byKey.get(`${truth.id}/${expectedFile.file}`)
      if (!raw) continue // not part of this run (e.g. --folders filter)
      const returned = raw.response?.documents ?? []
      if (raw.response) {
        Object.values(raw.response.meta?.models ?? {}).forEach(m => models.add(m))
        if (raw.response.meta?.catalogVersion) catalogs.add(raw.response.meta.catalogVersion)
      }
      files.push({
        folder: truth.id,
        file: expectedFile.file,
        mimeType: expectedFile.mimeType,
        ok: raw.ok,
        status: raw.status,
        latencyMs: raw.latencyMs,
        attempts: raw.attempts,
        ...(raw.retries?.length ? { retries: raw.retries } : {}),
        ...(raw.error ? { error: raw.error } : {}),
        expectedDocs: expectedFile.documents.length,
        returnedDocs: returned.length,
      })
      const matches = matchDocuments(expectedFile.documents, returned)
      expectedFile.documents.forEach((expected, index) => {
        const got = matches[index] ?? null
        const correct = got?.doctype === expected.doctype
        const hasValues = !!got && Object.values(got.fields ?? {}).some(v => v !== null && v !== undefined && v !== '')
        const status: DocStatus = !raw.ok
          ? 'request_failed'
          : !got
            ? 'not_returned'
            : got.doctype && hasValues
              ? 'usable'
              : 'empty'
        const specs = FIELD_SPECS[expected.doctype].filter(spec => !(spec.key === 'docdate' && expected.docdate === null))
        docs.push({
          folder: truth.id,
          file: expectedFile.file,
          index,
          expectedDoctype: expected.doctype,
          predictedDoctype: got?.doctype ?? null,
          correct,
          confidence: typeof got?.confidence === 'number' ? got.confidence : null,
          status,
          fieldCount: specs.length,
        })
        if (!got || !correct) return // field scores are conditional on correct classification
        for (const spec of specs) {
          const expectedRaw = readRaw(spec, { fields: expected.fields, docdate: expected.docdate })
          const predictedRaw = readRaw(spec, { fields: got.fields ?? {}, docdate: got.docdate ?? null })
          const expectedNorm = normalizeField(spec, expectedRaw)
          if (expectedNorm === null && expectedRaw !== null && expectedRaw !== undefined) {
            throw new Error(`Verdad esperada no normalizable: ${truth.id}/${expectedFile.file} ${spec.key}`)
          }
          const predictedNorm = normalizeField(spec, predictedRaw)
          fields.push({
            folder: truth.id,
            file: expectedFile.file,
            index,
            doctype: expected.doctype,
            field: spec.key,
            expected: expectedRaw ?? null,
            predicted: predictedRaw ?? null,
            expectedNorm,
            predictedNorm,
            outcome: classifyOutcome(expectedNorm, predictedNorm),
            docUsable: status === 'usable',
          })
        }
      })
    }
  }
  return { runTag: run.runTag, files, docs, fields, models: [...models], catalogVersions: [...catalogs] }
}

// ---------------------------------------------------------------- aggregation

export type FieldAgg = {
  total: number
  correct: number
  wrong: number
  missing: number
  spurious: number
  /** correct / total */
  accuracy: number
  /** Of the values the API returned, how many were right. */
  precision: number
  /** Of the values that should be there, how many came back right. */
  recall: number
}

export type Ratio = { correct: number; total: number; rate: number }

export type RunMetrics = {
  runTag: string
  /** Service reliability: expected documents that came back with a type and data. */
  availability: Ratio & { requestFailed: number; notReturned: number; empty: number }
  /** Documents that came back with HTTP 200 but no type or no fields. */
  silentFailures: Array<{ folder: string; file: string; index: number; doctype: string | null; confidence: number | null }>
  /** Extraction quality, over usable documents only. */
  classification: Ratio & {
    byDoctype: Record<string, Ratio>
    /** Over every expected document; failures appear as their own column. */
    confusion: Record<string, Record<string, number>>
  }
  /** Successful responses whose number of documents equals the expected number. */
  split: Ratio
  /** Extraction quality, over correctly classified usable documents. */
  fields: { overall: FieldAgg; byDoctype: Record<string, FieldAgg>; byField: Record<string, FieldAgg> }
  /** What the agent would actually get: failures count as misses. */
  endToEnd: { classification: Ratio; fields: Ratio }
  /**
   * Failures by kind. Explicit: the read ended in an HTTP error (after retrying).
   * Silent: HTTP 200 with an empty document. Failed attempts include those a
   * retry recovered; `byCause` is only complete for sessions that record retries.
   */
  failures: {
    explicitFiles: number
    explicitByCause: Record<string, number>
    silentDocuments: number
    failedAttempts: number
    failedAttemptsByCause: Record<string, number>
    recoveredByRetry: number
  }
  rows: Record<string, { expected: number; predicted: number; matched: number; precision: number; recall: number }>
  latency: { n: number; p50: number; p95: number; mean: number; max: number; byMimeType: Record<string, { n: number; p50: number; p95: number }> }
  calls: { files: number; ok: number; failed: number; httpCalls: number }
  models: string[]
  catalogVersions: string[]
}

const ratio = (correct: number, total: number): Ratio => ({ correct, total, rate: total ? correct / total : 0 })

export function aggregate(results: FieldResult[]): FieldAgg {
  const count = (o: Outcome) => results.filter(r => r.outcome === o).length
  const correct = count('correct')
  const correctWithValue = results.filter(r => r.outcome === 'correct' && r.expectedNorm !== null).length
  const wrong = count('wrong')
  const missing = count('missing')
  const spurious = count('spurious')
  const returned = correctWithValue + wrong + spurious
  const expectedWithValue = correctWithValue + wrong + missing
  return {
    total: results.length,
    correct,
    wrong,
    missing,
    spurious,
    accuracy: results.length ? correct / results.length : 0,
    precision: returned ? correctWithValue / returned : 0,
    recall: expectedWithValue ? correctWithValue / expectedWithValue : 0,
  }
}

function groupBy<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const item of items) (out[key(item)] ??= []).push(item)
  return out
}

function mapValues<T, U>(obj: Record<string, T>, fn: (t: T) => U): Record<string, U> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]))
}

export { errorLabel }

export const STATUS_LABELS: Record<DocStatus, string> = {
  usable: 'con datos',
  empty: '(vacío: falla silenciosa)',
  not_returned: '(no devuelto)',
  request_failed: '(error HTTP)',
}

export function summarize(score: RunScore): RunMetrics {
  const confusion: Record<string, Record<string, number>> = {}
  for (const d of score.docs) {
    const row = (confusion[d.expectedDoctype] ??= {})
    const predicted = d.status === 'usable' ? (d.predictedDoctype ?? '?') : STATUS_LABELS[d.status]
    row[predicted] = (row[predicted] ?? 0) + 1
  }
  const usableDocs = score.docs.filter(d => d.status === 'usable')
  const okFiles = score.files.filter(f => f.ok)
  const qualityFields = score.fields.filter(f => f.docUsable)
  const rows: RunMetrics['rows'] = {}
  for (const f of qualityFields) {
    if (!FIELD_SPECS[f.doctype].some(s => s.key === f.field && s.kind === 'rows')) continue
    const k = `${f.doctype}.${f.field}`
    const o = rowOverlap(f.expectedNorm as string | null, f.predictedNorm as string | null)
    const acc = (rows[k] ??= { expected: 0, predicted: 0, matched: 0, precision: 0, recall: 0 })
    acc.expected += o.expected
    acc.predicted += o.predicted
    acc.matched += o.matched
  }
  for (const r of Object.values(rows)) {
    r.precision = r.predicted ? r.matched / r.predicted : 0
    r.recall = r.expected ? r.matched / r.expected : 0
  }
  const latencies = okFiles.map(f => f.latencyMs)
  return {
    runTag: score.runTag,
    availability: {
      ...ratio(usableDocs.length, score.docs.length),
      requestFailed: score.docs.filter(d => d.status === 'request_failed').length,
      notReturned: score.docs.filter(d => d.status === 'not_returned').length,
      empty: score.docs.filter(d => d.status === 'empty').length,
    },
    silentFailures: score.docs
      .filter(d => d.status === 'empty')
      .map(d => ({ folder: d.folder, file: d.file, index: d.index, doctype: d.predictedDoctype, confidence: d.confidence })),
    classification: {
      ...ratio(usableDocs.filter(d => d.correct).length, usableDocs.length),
      byDoctype: mapValues(groupBy(usableDocs, d => d.expectedDoctype), ds => ratio(ds.filter(d => d.correct).length, ds.length)),
      confusion,
    },
    split: ratio(okFiles.filter(f => f.returnedDocs === f.expectedDocs).length, okFiles.length),
    fields: {
      overall: aggregate(qualityFields),
      byDoctype: mapValues(groupBy(qualityFields, f => f.doctype), aggregate),
      byField: mapValues(groupBy(qualityFields, f => `${f.doctype}.${f.field}`), aggregate),
    },
    failures: failureStats(score),
    endToEnd: {
      classification: ratio(usableDocs.filter(d => d.correct).length, score.docs.length),
      fields: ratio(qualityFields.filter(f => f.outcome === 'correct').length, score.docs.reduce((n, d) => n + d.fieldCount, 0)),
    },
    rows,
    latency: {
      n: latencies.length,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      mean: Math.round(mean(latencies)),
      max: latencies.length ? Math.max(...latencies) : 0,
      byMimeType: mapValues(groupBy(okFiles, f => f.mimeType), fs => {
        const l = fs.map(f => f.latencyMs)
        return { n: l.length, p50: percentile(l, 50), p95: percentile(l, 95) }
      }),
    },
    calls: {
      files: score.files.length,
      ok: okFiles.length,
      failed: score.files.length - okFiles.length,
      httpCalls: score.files.reduce((s, f) => s + f.attempts, 0),
    },
    models: score.models,
    catalogVersions: score.catalogVersions,
  }
}

function failureStats(score: RunScore): RunMetrics['failures'] {
  const explicitByCause: Record<string, number> = {}
  const failedAttemptsByCause: Record<string, number> = {}
  const bump = (m: Record<string, number>, k: string) => void (m[k] = (m[k] ?? 0) + 1)
  let failedAttempts = 0
  let recoveredByRetry = 0
  for (const f of score.files) {
    if (!f.ok && f.error) bump(explicitByCause, errorLabel(f.error))
    const failedHere = f.attempts - (f.ok ? 1 : 0)
    failedAttempts += Math.max(0, failedHere)
    for (const r of f.retries ?? []) bump(failedAttemptsByCause, errorLabel(r))
    if (!f.ok && f.error && f.attempts > 0) bump(failedAttemptsByCause, errorLabel(f.error))
    if (f.ok && f.attempts > 1) recoveredByRetry += 1
  }
  return {
    explicitFiles: score.files.filter(f => !f.ok).length,
    explicitByCause,
    silentDocuments: score.docs.filter(d => d.status === 'empty').length,
    failedAttempts,
    failedAttemptsByCause,
    recoveredByRetry,
  }
}
