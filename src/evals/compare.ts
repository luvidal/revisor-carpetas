/**
 * Before/after table for one subset across two sessions: what changed in
 * silent failures, explicit failures, availability, quality and latency.
 */
import type { Subset } from '../domain/truth'
import type { RunMetrics } from './score'
import type { SessionSummary, SliceSummary } from './summary'

export type ComparisonPair = { subset: Subset; before: SessionSummary; after: SessionSummary }

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`
const secs = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

function perPass(runs: RunMetrics[], pick: (r: RunMetrics) => number): string {
  return runs.map(pick).join(' y ')
}

function causes(runs: RunMetrics[], pick: (r: RunMetrics) => Record<string, number>): string {
  const total: Record<string, number> = {}
  for (const r of runs) for (const [k, n] of Object.entries(pick(r))) total[k] = (total[k] ?? 0) + n
  const parts = Object.entries(total).sort().map(([k, n]) => `${k}: ${n}`)
  return parts.length ? parts.join(', ') : '—'
}

function column(slice: SliceSummary): string[] {
  const runs = slice.runs
  const docs = runs[0]?.availability.total ?? 0
  const silentRate = mean(runs.map(r => (r.availability.total ? r.failures.silentDocuments / r.availability.total : 0)))
  const h = slice.headline
  return [
    `${runs.length} × ${runs[0]?.calls.files ?? 0} archivos (${docs} documentos)`,
    `${perPass(runs, r => r.failures.silentDocuments)} (${pct(silentRate)} de los documentos)`,
    `${perPass(runs, r => r.failures.explicitFiles)} · ${causes(runs, r => r.failures.explicitByCause)}`,
    `${perPass(runs, r => r.failures.failedAttempts)} · recuperadas al reintentar: ${perPass(runs, r => r.failures.recoveredByRetry)}`,
    pct(h.availability),
    pct(h.classificationAccuracy),
    pct(h.fieldAccuracy),
    pct(h.endToEndFieldAccuracy),
    `${secs(h.latencyP50Ms)} / ${secs(h.latencyP95Ms)}`,
    perPass(runs, r => r.calls.httpCalls),
  ]
}

const ROWS = [
  'Lecturas por pasada',
  'Fallas silenciosas (HTTP 200 vacío), por pasada',
  'Fallas explícitas finales (error HTTP tras reintentar), por pasada · causa',
  'Intentos fallidos, por pasada',
  'Disponibilidad: documentos con datos',
  'Calidad: clasificación',
  'Calidad: exactitud de campos',
  'De punta a punta: campos correctos',
  'Latencia p50 / p95',
  'Llamadas HTTP, por pasada',
]

const SUBSET_TITLE: Record<Subset, string> = { limpio: 'Subconjunto limpio', dificil: 'Subconjunto difícil' }

export function renderComparison(pairs: ComparisonPair[]): string {
  const lines: string[] = []
  for (const { subset, before, after } of pairs) {
    const b = before.bySubset[subset]
    const a = after.bySubset[subset]
    if (!b || !a) throw new Error(`Falta el subconjunto ${subset} en ${b ? after.sessionId : before.sessionId}`)
    const cb = column(b)
    const ca = column(a)
    lines.push(
      `### ${SUBSET_TITLE[subset]}`,
      '',
      `| Métrica | Antes · \`${before.sessionId}\` | Después · \`${after.sessionId}\` |`,
      '|---|---|---|',
      ...ROWS.map((r, i) => `| ${r} | ${cb[i]} | ${ca[i]} |`),
      '',
    )
    if (b.datasetFingerprint !== a.datasetFingerprint) {
      lines.push(`> Aviso: las huellas del dataset difieren (${b.datasetFingerprint} y ${a.datasetFingerprint}); no es una comparación de igual a igual.`, '')
    }
  }
  return lines.join('\n')
}
