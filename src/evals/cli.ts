/**
 * Phase 1 CLI.
 *   npm run evals -- [--subset limpio|dificil] [--runs 2] [--concurrency 4] [--folders f01,f02] [--max-calls 100] [--dry-run]
 *   npm run evals:score -- evals/runs/<session>      re-score saved responses (free)
 *   npm run evals:check -- evals/runs/<session>      compare with evals/baseline.json (exit 1 on regression)
 *   npm run evals:baseline -- evals/runs/<session> [limpio|dificil]   promote one subset of a session to baseline
 *   npm run evals:compare -- evals/runs/<after> limpio=<before-session> dificil=<before-session>
 *                                                    before/after table per subset, written to <after>/comparacion.md
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_BASE_URL, Docs2JsonClient } from '../docs2json/client'
import type { Subset } from '../domain/truth'
import { fingerprintOf, loadDataset } from './dataset'
import { renderComparison, type ComparisonPair } from './compare'
import { renderReport } from './report'
import { runPass } from './runner'
import { scoreRun, type RawRun } from './score'
import { buildSummary, checkRegression, deriveThresholds, type Baseline, type CallStats, type SessionSummary } from './summary'

const ROOT = path.resolve(import.meta.dirname, '../..')
const RUNS_DIR = path.join(ROOT, 'evals/runs')
const BASELINE = path.join(ROOT, 'evals/baseline.json')

type SessionMeta = {
  sessionId: string
  createdAt: string
  datasetFingerprint: string
  folders: string[] | null
  subset?: Subset | null
  runs: number
  concurrency: number
  baseUrl: string
  calls: CallStats
}

const log = (line: string) => console.log(line)
const pct = (x: number) => `${(x * 100).toFixed(1)}%`

function sessionId(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await writeFile(file, JSON.stringify(data, null, 2) + '\n')
}

/**
 * Re-scores a session directory from its saved raw responses. No API calls.
 * The folders scored are the ones the session actually read (taken from the
 * raw files), so adding folders to the dataset later does not change the result.
 */
async function scoreSession(dir: string): Promise<SessionSummary> {
  const meta = JSON.parse(await readFile(path.join(dir, 'session.json'), 'utf8')) as SessionMeta
  const rawFiles = (await readdir(dir)).filter(f => /^raw-c\d+\.json$/.test(f)).sort()
  const raws = await Promise.all(rawFiles.map(async f => JSON.parse(await readFile(path.join(dir, f), 'utf8')) as RawRun))
  const folderIds = [...new Set(raws.flatMap(r => r.results.map(x => x.folder)))]
  const dataset = await loadDataset(undefined, { folders: folderIds })
  if (dataset.fingerprint !== meta.datasetFingerprint) {
    log(`Aviso: los archivos cambiaron desde esta corrida (${meta.datasetFingerprint} → ${dataset.fingerprint}).`)
  }
  const scores = raws.map(r => scoreRun(dataset.truths, r))
  const sliceOf = (ids: string[]) => {
    const truths = dataset.truths.filter(t => ids.includes(t.id))
    return {
      folders: ids,
      datasetFingerprint: fingerprintOf(dataset.manifest, ids),
      dataset: {
        folders: truths.length,
        files: truths.reduce((n, t) => n + t.files.length, 0),
        documents: truths.reduce((s, t) => s + t.files.reduce((n, f) => n + f.documents.length, 0), 0),
      },
    }
  }
  const subsets: Partial<Record<Subset, ReturnType<typeof sliceOf>>> = {}
  for (const subset of ['limpio', 'dificil'] as const) {
    const ids = dataset.truths.filter(t => t.subset === subset).map(t => t.id)
    if (ids.length) subsets[subset] = sliceOf(ids)
  }
  const { folders: _all, ...all } = sliceOf(folderIds)
  const summary = buildSummary({ sessionId: meta.sessionId, createdAt: meta.createdAt, all, subsets, scores, calls: meta.calls })
  await writeJson(path.join(dir, 'summary.json'), summary)
  await writeFile(path.join(dir, 'report.md'), renderReport(summary, scores, dataset.truths))
  return summary
}

function printHeadline(s: SessionSummary): void {
  for (const [subset, slice] of Object.entries(s.bySubset)) {
    log('')
    log(`== Subconjunto ${subset}: ${slice.dataset.folders} carpetas, ${slice.dataset.files} archivos`)
    printSlice(slice.headline)
  }
  log('')
  log(`Llamadas HTTP: ${s.calls.httpCalls} (planificadas ${s.calls.planned})`)
  log('(Cifras sobre un dataset sintético; no son precisión en producción.)')
}

function printSlice(h: SessionSummary['headline']): void {
  log(`Disponibilidad (documentos que volvieron con datos): ${pct(h.availability)}`)
  log(`Calidad, sobre lo que volvió con datos · Clasificación: ${pct(h.classificationAccuracy)} · Campos: ${pct(h.fieldAccuracy)} · Separación: ${pct(h.splitRate)}`)
  for (const [d, v] of Object.entries(h.fieldAccuracyByDoctype)) log(`  ${d}: ${pct(v)}`)
  log(`De punta a punta, contando fallas · Clasificación: ${pct(h.endToEndClassification)} · Campos: ${pct(h.endToEndFieldAccuracy)}`)
  log(`Latencia p50 ${(h.latencyP50Ms / 1000).toFixed(1)} s · p95 ${(h.latencyP95Ms / 1000).toFixed(1)} s`)
  if (h.consistency !== null) log(`Consistencia entre corridas: ${pct(h.consistency)}`)
}

async function cmdRun(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      runs: { type: 'string', default: '2' },
      concurrency: { type: 'string', default: '4' },
      folders: { type: 'string' },
      subset: { type: 'string' },
      'max-calls': { type: 'string', default: '100' },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  const runs = Number(values.runs)
  const maxCalls = Number(values['max-calls'])
  const folders = values.folders ? values.folders.split(',').map(s => s.trim()) : null
  if (values.subset && values.subset !== 'limpio' && values.subset !== 'dificil') throw new Error('--subset debe ser limpio o dificil')
  const subset: Subset | null = (values.subset as Subset | undefined) ?? null
  const dataset = await loadDataset(undefined, { ...(folders ? { folders } : {}), ...(subset ? { subset } : {}) })
  const planned = dataset.files.length * runs
  log(`Dataset ${dataset.fingerprint}: ${dataset.truths.length} carpetas, ${dataset.files.length} archivos. ${runs} pasada(s) = ${planned} llamadas planificadas (tope ${maxCalls}).`)
  if (planned > maxCalls) throw new Error(`El plan (${planned} llamadas) supera el tope de ${maxCalls}. Usa menos pasadas, --folders o sube --max-calls.`)
  if (values['dry-run']) {
    log('Simulación: no se llama a la API.')
    return
  }

  if (existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'))
  const apiKey = process.env.DOCS2JSON_API_KEY ?? ''
  if (!apiKey) throw new Error('Falta DOCS2JSON_API_KEY en .env (ver .env.example).')
  const baseUrl = process.env.DOCS2JSON_BASE_URL ?? DEFAULT_BASE_URL
  // Retries can exceed the plan; allow a little headroom but never past the hard cap.
  const client = new Docs2JsonClient({ apiKey, baseUrl, maxCalls })
  const health = await client.health()
  log(`API ${baseUrl}: ok=${health.ok}, catálogo ${health.catalogVersion ?? '?'}`)
  if (!health.ok) throw new Error('La API no está disponible.')

  const id = sessionId()
  const dir = path.join(RUNS_DIR, id)
  await mkdir(dir, { recursive: true })
  const meta: SessionMeta = {
    sessionId: id,
    createdAt: new Date().toISOString(),
    datasetFingerprint: dataset.fingerprint,
    folders,
    subset,
    runs,
    concurrency: Number(values.concurrency),
    baseUrl,
    calls: { planned, httpCalls: 0, rateLimited: 0, serverErrors: 0, networkErrors: 0 },
  }
  const saveMeta = async () => {
    meta.calls = { planned, ...client.counters }
    await writeJson(path.join(dir, 'session.json'), meta)
  }
  try {
    for (let r = 1; r <= runs; r++) {
      const raw = await runPass({ client, files: dataset.files, runTag: `${id}-c${r}`, concurrency: meta.concurrency, log })
      await writeJson(path.join(dir, `raw-c${r}.json`), raw)
      await saveMeta()
      if (raw.budgetExceeded) {
        log('Se alcanzó el tope de llamadas: no se hacen más pasadas. Los archivos sin leer cuentan como fallas.')
        break
      }
    }
  } finally {
    await saveMeta()
  }
  const summary = await scoreSession(dir)
  printHeadline(summary)
  log(`Reporte: ${path.relative(ROOT, path.join(dir, 'report.md'))}`)
  if (existsSync(BASELINE)) {
    const baseline = JSON.parse(await readFile(BASELINE, 'utf8')) as Baseline
    if (summary.bySubset[baseline.subset]) printCheck(summary, baseline)
    else log(`(El baseline es del subconjunto ${baseline.subset}; esta corrida no lo incluye, así que no se compara.)`)
  }
}

function printCheck(summary: SessionSummary, baseline: Baseline): boolean {
  const result = checkRegression(summary, baseline)
  log('')
  log(result.ok ? `Sin regresiones contra el baseline ${baseline.fromSession}.` : `REGRESIÓN contra el baseline ${baseline.fromSession}:`)
  for (const f of result.failures) log(`  ✗ ${f}`)
  for (const w of result.warnings) log(`  ! ${w}`)
  return result.ok
}

function sessionDir(arg: string | undefined): string {
  if (!arg) throw new Error('Indica la carpeta de la corrida, por ejemplo evals/runs/20261119-1530')
  return path.resolve(arg)
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  switch (command) {
    case 'run':
      return cmdRun(rest)
    case 'score': {
      const summary = await scoreSession(sessionDir(rest[0]))
      printHeadline(summary)
      return
    }
    case 'check': {
      const summary = JSON.parse(await readFile(path.join(sessionDir(rest[0]), 'summary.json'), 'utf8')) as SessionSummary
      const baseline = JSON.parse(await readFile(BASELINE, 'utf8')) as Baseline
      if (!printCheck(summary, baseline)) process.exitCode = 1
      return
    }
    case 'baseline': {
      const summary = JSON.parse(await readFile(path.join(sessionDir(rest[0]), 'summary.json'), 'utf8')) as SessionSummary
      const subset = (rest[1] ?? 'limpio') as Subset
      const slice = summary.bySubset[subset]
      if (!slice) throw new Error(`La sesión ${summary.sessionId} no incluye el subconjunto ${subset}.`)
      const { thresholds, rationale } = deriveThresholds(slice)
      const baseline: Baseline = {
        fromSession: summary.sessionId,
        createdAt: summary.createdAt,
        subset,
        datasetFingerprint: slice.datasetFingerprint,
        models: [...new Set(slice.runs.flatMap(r => r.models))],
        headline: slice.headline,
        thresholds,
        rationale,
      }
      await writeJson(BASELINE, baseline)
      log(`Baseline del subconjunto ${subset} guardado desde ${summary.sessionId}.`)
      log(rationale)
      return
    }
    case 'compare': {
      const afterDir = sessionDir(rest[0])
      const after = JSON.parse(await readFile(path.join(afterDir, 'summary.json'), 'utf8')) as SessionSummary
      const pairs: ComparisonPair[] = []
      for (const arg of rest.slice(1)) {
        const [subset, before] = arg.split('=') as [Subset, string]
        const beforeSummary = JSON.parse(await readFile(path.join(RUNS_DIR, before, 'summary.json'), 'utf8')) as SessionSummary
        pairs.push({ subset, before: beforeSummary, after })
      }
      if (!pairs.length) throw new Error('Indica al menos un par subconjunto=sesión, por ejemplo limpio=<sesión anterior>')
      const table = renderComparison(pairs)
      await writeFile(path.join(afterDir, 'comparacion.md'), `# Antes y después · ${after.sessionId}\n\n${table}`)
      log(table)
      return
    }
    default:
      throw new Error('Uso: cli.ts run|score|check|baseline|compare')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
