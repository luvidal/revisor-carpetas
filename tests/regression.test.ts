import { describe, expect, it } from 'vitest'
import type { RunMetrics } from '../src/evals/score'
import { renderComparison } from '../src/evals/compare'
import { checkRegression, deriveThresholds, type Baseline, type SessionSummary, type SliceSummary } from '../src/evals/summary'

function run(classification: number, fields: number, payslip: number, availability = 1): RunMetrics {
  const agg = (accuracy: number) => ({ total: 100, correct: accuracy * 100, wrong: 0, missing: 0, spurious: 0, accuracy, precision: 1, recall: 1 })
  return {
    runTag: 'r',
    classification: { correct: classification * 48, total: 48, rate: classification, byDoctype: {}, confusion: {} },
    availability: { correct: availability * 48, total: 48, rate: availability, requestFailed: 0, notReturned: 0, empty: 0 },
    silentFailures: [],
    failures: { explicitFiles: 0, explicitByCause: {}, silentDocuments: 0, failedAttempts: 0, failedAttemptsByCause: {}, recoveredByRetry: 0 },
    split: { correct: 47, total: 47, rate: 1 },
    endToEnd: { classification: { correct: 48, total: 48, rate: classification }, fields: { correct: 100, total: 100, rate: fields } },
    fields: { overall: agg(fields), byDoctype: { 'liquidaciones-sueldo': agg(payslip) }, byField: {} },
    rows: {},
    latency: { n: 47, p50: 10_000, p95: 20_000, mean: 11_000, max: 25_000, byMimeType: {} },
    calls: { files: 47, ok: 47, failed: 0, httpCalls: 47 },
    models: ['gemini-x'],
    catalogVersions: ['c'],
  }
}

function summary(runs: RunMetrics[], overrides: Partial<SessionSummary['headline']> = {}): SessionSummary {
  const slice = sliceOf(runs, overrides)
  return { sessionId: 's', createdAt: '', ...slice, bySubset: { limpio: slice }, calls: { planned: 94, httpCalls: 94, rateLimited: 0, serverErrors: 0, networkErrors: 0 } }
}

function sliceOf(runs: RunMetrics[], overrides: Partial<SessionSummary['headline']> = {}): SliceSummary {
  const mean = (f: (r: RunMetrics) => number) => runs.reduce((s, r) => s + f(r), 0) / runs.length
  return {
    datasetFingerprint: 'abc',
    dataset: { folders: 12, files: 47, documents: 48 },
    runs,
    consistency: null,
    headline: {
      availability: mean(r => r.availability.rate),
      endToEndClassification: mean(r => r.endToEnd.classification.rate),
      endToEndFieldAccuracy: mean(r => r.endToEnd.fields.rate),
      classificationAccuracy: mean(r => r.classification.rate),
      fieldAccuracy: mean(r => r.fields.overall.accuracy),
      fieldAccuracyByDoctype: { 'liquidaciones-sueldo': mean(r => r.fields.byDoctype['liquidaciones-sueldo']!.accuracy) },
      splitRate: 1,
      latencyP50Ms: 10_000,
      latencyP95Ms: 20_000,
      consistency: 0.98,
      ...overrides,
    },
  }
}

describe('deriveThresholds', () => {
  it('never goes below one document or 2 / 5 points', () => {
    const { thresholds } = deriveThresholds(summary([run(1, 0.97, 0.95), run(1, 0.97, 0.95)]))
    expect(thresholds.classificationDrop).toBeCloseTo(1 / 48, 3)
    expect(thresholds.fieldDrop).toBe(0.02)
    expect(thresholds.doctypeFieldDrop).toBe(0.05)
  })

  it('widens to twice the measured run-to-run spread', () => {
    const { thresholds } = deriveThresholds(summary([run(1, 0.95, 0.9, 0.98), run(1, 0.97, 0.98, 0.86)]))
    expect(thresholds.fieldDrop).toBeCloseTo(0.04, 3)
    expect(thresholds.doctypeFieldDrop).toBeCloseTo(0.16, 3)
    expect(thresholds.availabilityDrop).toBeCloseTo(0.24, 3)
  })
})

describe('checkRegression', () => {
  const base = summary([run(1, 0.97, 0.95)])
  const baseline: Baseline = {
    fromSession: 'b',
    createdAt: '',
    subset: 'limpio',
    datasetFingerprint: 'abc',
    models: ['gemini-x'],
    headline: base.headline,
    thresholds: { classificationDrop: 0.021, fieldDrop: 0.02, doctypeFieldDrop: 0.05, availabilityDrop: 0.05, consistencyDrop: 0.05, latencyP95Increase: 0.5 },
    rationale: '',
  }

  it('passes within tolerance', () => {
    expect(checkRegression(summary([run(1, 0.955, 0.91)]), baseline)).toMatchObject({ ok: true, failures: [] })
  })

  it('fails on a field accuracy drop beyond the threshold', () => {
    const result = checkRegression(summary([run(1, 0.94, 0.95)]), baseline)
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('Exactitud de campos')
  })

  it('fails when one doctype drops even if the total holds', () => {
    const result = checkRegression(summary([run(1, 0.97, 0.85)]), baseline)
    expect(result.failures.some(f => f.includes('liquidaciones-sueldo'))).toBe(true)
  })

  it('only warns on availability, latency, consistency, model or dataset changes', () => {
    const current = summary([{ ...run(1, 0.97, 0.95, 0.8), models: ['gemini-y'] }], { latencyP95Ms: 40_000, consistency: 0.8 })
    const result = checkRegression({ ...current, bySubset: { limpio: { ...current.bySubset.limpio!, datasetFingerprint: 'other' } } }, baseline)
    expect(result.ok).toBe(true)
    expect(result.warnings).toHaveLength(5)
    expect(result.warnings.some(w => w.startsWith('Disponibilidad'))).toBe(true)
  })

  it('compares only the baseline subset, and refuses when the run lacks it', () => {
    const hardOnly = summary([run(0.5, 0.4, 0.3)])
    const dificil = hardOnly.bySubset.limpio!
    const onlyHard: SessionSummary = { ...hardOnly, bySubset: { dificil } }
    expect(checkRegression(onlyHard, baseline)).toMatchObject({ ok: false })
    // A poor hard subset does not fail the clean baseline when the clean subset holds.
    const both: SessionSummary = { ...hardOnly, bySubset: { limpio: sliceOf([run(1, 0.97, 0.95)]), dificil } }
    expect(checkRegression(both, baseline)).toMatchObject({ ok: true, failures: [] })
  })
})

describe('renderComparison', () => {
  it('puts before and after side by side per subset', () => {
    const before = summary([{ ...run(1, 1, 1, 0.9), failures: { explicitFiles: 1, explicitByCause: { '504 del proxy': 1 }, silentDocuments: 5, failedAttempts: 3, failedAttemptsByCause: {}, recoveredByRetry: 2 } }])
    const after = { ...summary([run(1, 1, 1, 1)]), sessionId: 'despues' }
    const md = renderComparison([{ subset: 'limpio', before, after }])
    expect(md).toContain('| Métrica | Antes · `s` | Después · `despues` |')
    expect(md).toContain('| Fallas silenciosas (HTTP 200 vacío), por pasada | 5 (10,4% de los documentos) | 0 (0,0% de los documentos) |')
    expect(md).toContain('504 del proxy: 1')
    expect(() => renderComparison([{ subset: 'dificil', before, after }])).toThrow('Falta el subconjunto dificil')
  })
})
