/** Session summary (one CLI run = N passes over the dataset) and the regression gate. */
import type { Subset } from '../domain/truth'
import { compareRuns, type Consistency } from './consistency'
import { mean } from './stats'
import { summarize, type RunMetrics, type RunScore } from './score'

/**
 * Quality metrics (classification, fields) are measured on documents that came
 * back with data; availability and end-to-end metrics include the failures.
 */
export type Headline = {
  /** Share of expected documents that came back with a type and data. */
  availability: number
  classificationAccuracy: number
  fieldAccuracy: number
  fieldAccuracyByDoctype: Record<string, number>
  /** Failures counted as misses: what the agent would actually receive. */
  endToEndClassification: number
  endToEndFieldAccuracy: number
  splitRate: number
  latencyP50Ms: number
  latencyP95Ms: number
  /** Share of field values identical across the first two runs; null with one run. */
  consistency: number | null
}

export type CallStats = { planned: number; httpCalls: number; rateLimited: number; serverErrors: number; networkErrors: number }

/** Metrics for one slice of the dataset (a subset, or everything the session read). */
export type SliceSummary = {
  /** Fingerprint of exactly the folders in this slice (see `fingerprintOf`). */
  datasetFingerprint: string
  dataset: { folders: number; files: number; documents: number }
  runs: RunMetrics[]
  consistency: Consistency | null
  headline: Headline
}

/** The whole session plus one slice per subset it read: `limpio` and `dificil` are never averaged together. */
export type SessionSummary = SliceSummary & {
  sessionId: string
  createdAt: string
  bySubset: Partial<Record<Subset, SliceSummary>>
  calls: CallStats
}

export type SliceInput = { datasetFingerprint: string; dataset: SliceSummary['dataset']; folders: string[] }

/** Keeps only the files, documents and fields of the given folders. */
export function sliceScore(score: RunScore, folders: Set<string>): RunScore {
  return {
    ...score,
    files: score.files.filter(f => folders.has(f.folder)),
    docs: score.docs.filter(d => folders.has(d.folder)),
    fields: score.fields.filter(f => folders.has(f.folder)),
  }
}

export function summarizeSlice(scores: RunScore[], input: Omit<SliceInput, 'folders'>): SliceSummary {
  const runs = scores.map(summarize)
  const consistency = scores.length >= 2 ? compareRuns(scores[0]!, scores[1]!) : null
  const avg = (pick: (m: RunMetrics) => number) => mean(runs.map(pick))
  const doctypes = [...new Set(runs.flatMap(r => Object.keys(r.fields.byDoctype)))].sort()
  return {
    datasetFingerprint: input.datasetFingerprint,
    dataset: input.dataset,
    runs,
    consistency,
    headline: {
      availability: avg(r => r.availability.rate),
      endToEndClassification: avg(r => r.endToEnd.classification.rate),
      endToEndFieldAccuracy: avg(r => r.endToEnd.fields.rate),
      classificationAccuracy: avg(r => r.classification.rate),
      fieldAccuracy: avg(r => r.fields.overall.accuracy),
      fieldAccuracyByDoctype: Object.fromEntries(
        doctypes.map(d => [d, mean(runs.filter(r => r.fields.byDoctype[d]).map(r => r.fields.byDoctype[d]!.accuracy))]),
      ),
      splitRate: avg(r => r.split.rate),
      latencyP50Ms: Math.round(avg(r => r.latency.p50)),
      latencyP95Ms: Math.round(avg(r => r.latency.p95)),
      consistency: consistency ? consistency.fields.rate : null,
    },
  }
}

export function buildSummary(args: {
  sessionId: string
  createdAt: string
  all: Omit<SliceInput, 'folders'>
  subsets: Partial<Record<Subset, SliceInput>>
  scores: RunScore[]
  calls: CallStats
}): SessionSummary {
  const bySubset: Partial<Record<Subset, SliceSummary>> = {}
  for (const [subset, input] of Object.entries(args.subsets) as Array<[Subset, SliceInput]>) {
    const folders = new Set(input.folders)
    bySubset[subset] = summarizeSlice(args.scores.map(s => sliceScore(s, folders)), input)
  }
  return {
    sessionId: args.sessionId,
    createdAt: args.createdAt,
    ...summarizeSlice(args.scores, args.all),
    bySubset,
    calls: args.calls,
  }
}

// ------------------------------------------------------------- regression gate

export type Thresholds = {
  /** Max absolute drop (0.03 = 3 points) before failing. */
  classificationDrop: number
  fieldDrop: number
  doctypeFieldDrop: number
  /** Warnings only: noisy or server-side metrics. */
  availabilityDrop: number
  consistencyDrop: number
  latencyP95Increase: number
}

export type Baseline = {
  fromSession: string
  createdAt: string
  /** The baseline describes one subset; other subsets are not compared against it. */
  subset: Subset
  datasetFingerprint: string
  models: string[]
  headline: Headline
  thresholds: Thresholds
  /** Why the thresholds are what they are, in Spanish. */
  rationale: string
}

export type CheckResult = { ok: boolean; failures: string[]; warnings: string[] }

const pts = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`

export function checkRegression(session: SessionSummary, baseline: Baseline): CheckResult {
  const current = session.bySubset[baseline.subset]
  if (!current) {
    return { ok: false, failures: [`La corrida no incluye el subconjunto «${baseline.subset}» del baseline: no hay con qué comparar.`], warnings: [] }
  }
  const t = baseline.thresholds
  const b = baseline.headline
  const c = current.headline
  const failures: string[] = []
  const warnings: string[] = []
  const gate = (name: string, now: number, before: number, drop: number) => {
    if (now < before - drop - 1e-9) failures.push(`${name}: ${pts(now)} contra ${pts(before)} del baseline (tolerancia ${pts(drop)})`)
  }
  if (current.datasetFingerprint !== baseline.datasetFingerprint) {
    warnings.push('El dataset cambió desde el baseline: la comparación no es de igual a igual.')
  }
  const models = current.runs.flatMap(r => r.models)
  if (models.some(m => !baseline.models.includes(m))) {
    warnings.push(`Modelo distinto al del baseline: ${[...new Set(models)].join(', ')} (baseline: ${baseline.models.join(', ')}).`)
  }
  gate('Exactitud de clasificación', c.classificationAccuracy, b.classificationAccuracy, t.classificationDrop)
  gate('Exactitud de campos', c.fieldAccuracy, b.fieldAccuracy, t.fieldDrop)
  for (const [doctype, before] of Object.entries(b.fieldAccuracyByDoctype)) {
    const now = c.fieldAccuracyByDoctype[doctype]
    if (now === undefined) warnings.push(`Sin datos de ${doctype} en esta corrida.`)
    else gate(`Exactitud de campos en ${doctype}`, now, before, t.doctypeFieldDrop)
  }
  if (c.availability < b.availability - t.availabilityDrop) {
    warnings.push(`Disponibilidad: ${pts(c.availability)} de documentos con datos contra ${pts(b.availability)} del baseline.`)
  }
  if (c.consistency !== null && b.consistency !== null && c.consistency < b.consistency - t.consistencyDrop) {
    warnings.push(`Consistencia entre corridas: ${pts(c.consistency)} contra ${pts(b.consistency)} del baseline.`)
  }
  if (c.latencyP95Ms > b.latencyP95Ms * (1 + t.latencyP95Increase)) {
    warnings.push(`Latencia p95: ${(c.latencyP95Ms / 1000).toFixed(1)} s contra ${(b.latencyP95Ms / 1000).toFixed(1)} s del baseline.`)
  }
  return { ok: failures.length === 0, failures, warnings }
}

/**
 * Thresholds: never tighter than one document (classification) or 2 points
 * (fields), and never tighter than twice the run-to-run spread actually measured.
 */
export function deriveThresholds(summary: Pick<SliceSummary, 'runs' | 'headline'>): { thresholds: Thresholds; rationale: string } {
  const runs = summary.runs
  const spread = (pick: (r: RunMetrics) => number) =>
    runs.length > 1 ? Math.max(...runs.map(pick)) - Math.min(...runs.map(pick)) : 0
  const documents = runs[0]?.availability.total ?? 0
  const oneDoc = documents ? 1 / documents : 0.025
  const fieldSpread = spread(r => r.fields.overall.accuracy)
  const docSpreads = Object.keys(summary.headline.fieldAccuracyByDoctype).map(d => spread(r => r.fields.byDoctype[d]?.accuracy ?? 0))
  const round = (x: number) => Math.ceil(x * 1000 - 1e-9) / 1000 // epsilon: 0.04000000000000004 must stay 0.04
  const thresholds: Thresholds = {
    classificationDrop: round(Math.max(oneDoc, 2 * spread(r => r.classification.rate))),
    fieldDrop: round(Math.max(0.02, 2 * fieldSpread)),
    doctypeFieldDrop: round(Math.max(0.05, 2 * Math.max(0, ...docSpreads))),
    availabilityDrop: round(Math.max(0.05, 2 * spread(r => r.availability.rate))),
    consistencyDrop: 0.05,
    latencyP95Increase: 0.5,
  }
  const rationale =
    `Clasificación: se tolera perder hasta ${pts(thresholds.classificationDrop)} (un documento de ${documents || '?'}, o el doble de la variación medida entre corridas si es mayor). ` +
    `Campos en total: ${pts(thresholds.fieldDrop)} (mínimo 2 puntos; la variación medida entre corridas fue ${pts(fieldSpread)}). ` +
    `Campos por tipo: ${pts(thresholds.doctypeFieldDrop)} (mínimo 5 puntos, porque hay tipos con pocos documentos). ` +
    `Clasificación y campos se miden sobre los documentos que volvieron con datos. La disponibilidad (documentos con datos) solo avisa si cae más de ${pts(thresholds.availabilityDrop)}; ` +
    'igual que la consistencia y la latencia, depende del servidor y del momento, no de la calidad de la extracción.'
  return { thresholds, rationale }
}
