/**
 * Phase 2 CLI.
 *   npm run agent -- review <carpeta> [--replay all|<sesiones>] [--live]
 *   npm run agent -- eval [--replay all|<sesiones>] [--subset limpio|dificil]
 *   npm run agent -- eval --live [--max-calls 100] [--concurrency 4]
 * Policy: --politica rag (default: the written policy, searched) | provisional
 * (the phase 2 rules in code); --busqueda hibrido (default) | bm25 | embeddings.
 * Replay (the default) answers from responses recorded in evals/runs (and in
 * evals/agente for live agent runs): no API calls, no cost, repeatable.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_BASE_URL, Docs2JsonClient } from '../docs2json/client'
import { prng } from '../dataset/render/raster'
import type { FolderTruth, Subset } from '../domain/truth'
import { loadDataset, type Dataset } from '../evals/dataset'
import type { RawFileResult, RawRun } from '../evals/score'
import { evaluateFolder, renderAgentReport, summarizeResults, type FolderResult } from './evaluate'
import { reviewFolder, type AgentDeps } from './machine'
import { loadIndex } from '../rag/index-file'
import { RagPolicy } from '../rag/rag-policy'
import type { Method } from '../rag/search'
import { PROVISIONAL_POLICY, type Policy } from './policy'
import { DEFAULT_RETRY } from './retry'
import { LiveSource, ReplaySource, type DocumentSource } from './source'
import type { FolderInput, FolderReview } from './types'

const ROOT = path.resolve(import.meta.dirname, '../..')
const EVAL_RUNS = path.join(ROOT, 'evals/runs')
const AGENT_RUNS = path.join(ROOT, 'evals/agente')
const log = (line: string) => console.log(line)

function runId(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
}

/** Recorded reads, oldest first: eval sessions (raw-c*.json) and live agent runs (lecturas.json). */
export async function loadRecordings(spec: string): Promise<{ recordings: RawFileResult[]; sources: string[] }> {
  const sessions = spec === 'all' ? (await readdir(EVAL_RUNS)).sort() : spec.split(',').map(s => s.trim())
  const recordings: RawFileResult[] = []
  for (const s of sessions) {
    const evalDir = path.join(EVAL_RUNS, s)
    const agentFile = path.join(AGENT_RUNS, s, 'lecturas.json')
    if (existsSync(evalDir)) {
      for (const f of (await readdir(evalDir)).filter(x => /^raw-c\d+\.json$/.test(x)).sort()) {
        recordings.push(...(JSON.parse(await readFile(path.join(evalDir, f), 'utf8')) as RawRun).results.filter(r => r.attempts > 0))
      }
    } else if (existsSync(agentFile)) {
      const attempts = JSON.parse(await readFile(agentFile, 'utf8')) as Array<RawFileResult & { attempt: number }>
      recordings.push(...attempts.sort((a, b) => a.attempt - b.attempt))
    } else {
      throw new Error(`No hay respuestas grabadas en ${s}`)
    }
  }
  return { recordings, sources: sessions }
}

function inputFor(truth: FolderTruth, dataset: Dataset): FolderInput {
  return {
    folderId: truth.id,
    referenceDate: truth.referenceDate,
    applicant: truth.applicant,
    files: dataset.files.filter(f => f.folder === truth.id).map(f => ({ file: f.file, mimeType: f.mimeType, bytes: f.bytes })),
  }
}

type Setup = { deps: (folderId: string) => AgentDeps; mode: string; policy: Policy; live?: { client: Docs2JsonClient; source: LiveSource } }

async function choosePolicy(name: string | undefined, method: string | undefined): Promise<Policy> {
  if ((name ?? 'rag') === 'provisional') return PROVISIONAL_POLICY
  if (name && name !== 'rag') throw new Error('--politica debe ser rag o provisional')
  const m = (method ?? 'hibrido') as Method
  if (!['hibrido', 'bm25', 'embeddings'].includes(m)) throw new Error('--busqueda debe ser hibrido, bm25 o embeddings')
  return new RagPolicy(await loadIndex(), m)
}

async function setup(values: { live?: boolean; replay?: string; 'max-calls'?: string; politica?: string; busqueda?: string }, id: string): Promise<Setup> {
  const policy = await choosePolicy(values.politica, values.busqueda)
  if (values.live) {
    if (existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'))
    const apiKey = process.env.DOCS2JSON_API_KEY ?? ''
    if (!apiKey) throw new Error('Falta DOCS2JSON_API_KEY en .env (ver .env.example).')
    const maxCalls = Number(values['max-calls'] ?? 100)
    const client = new Docs2JsonClient({ apiKey, baseUrl: process.env.DOCS2JSON_BASE_URL ?? DEFAULT_BASE_URL, maxCalls, retry: false })
    const source = new LiveSource(client, id)
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
    return {
      mode: `en vivo contra la API (tope ${maxCalls} llamadas, reintentos del agente: ${DEFAULT_RETRY.maxAttemptsPerFile} intentos por archivo, ${DEFAULT_RETRY.maxRetriesPerFolder} reintentos por carpeta)`,
      deps: () => ({ source, policy, retry: DEFAULT_RETRY, sleep, random: Math.random }),
      policy,
      live: { client, source },
    }
  }
  const { recordings, sources } = await loadRecordings(values.replay ?? 'all')
  const source: DocumentSource = new ReplaySource(recordings)
  return {
    mode: `replay de respuestas grabadas (${sources.join(', ')}), sin llamadas`,
    // A seeded generator per folder keeps replay runs identical.
    deps: folderId => ({ source, policy, retry: DEFAULT_RETRY, sleep: async () => {}, random: prng([...folderId].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) }),
    policy,
  }
}

async function pool<T, U>(items: T[], size: number, fn: (t: T) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i]!)
      }
    }),
  )
  return out
}

function printReview(review: FolderReview): void {
  log(`\n${review.folderId}: ${review.decision}`)
  for (const r of review.reasons) {
    log(`  [${r.rule.id} ${r.severity}] ${r.message}`)
    if (r.rule.citation) log(`      ${r.rule.citation.source}, ${r.rule.id} «${r.rule.title}»: ${r.rule.citation.excerpt}`)
  }
  for (const o of review.observations) log(`  [${o.rule.id} observación] ${o.message}`)
  log(`  traza: ${review.trace.map(t => `${t.state} (${t.note})`).join(' → ')}`)
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      live: { type: 'boolean', default: false },
      replay: { type: 'string' },
      subset: { type: 'string' },
      'max-calls': { type: 'string', default: '100' },
      concurrency: { type: 'string', default: '4' },
      politica: { type: 'string' },
      busqueda: { type: 'string' },
    },
  })
  const tag = `${values.live ? 'vivo' : 'replay'}-${(values.politica ?? 'rag') === 'provisional' ? 'provisional' : `rag-${values.busqueda ?? 'hibrido'}`}`
  const id = `${runId()}-${tag}`
  const s = await setup(values, id)

  if (command === 'review') {
    const folderId = positionals[0]
    if (!folderId) throw new Error('Indica la carpeta, por ejemplo: npm run agent -- review f08')
    const dataset = await loadDataset(undefined, { folders: [folderId] })
    printReview(await reviewFolder(inputFor(dataset.truths[0]!, dataset), s.deps(folderId)))
    if (s.live) log(`\nLlamadas: ${s.live.client.counters.httpCalls}`)
    return
  }
  if (command !== 'eval') throw new Error('Uso: cli.ts review <carpeta> | eval')

  const dataset = await loadDataset(undefined, values.subset ? { subset: values.subset as Subset } : {})
  log(`Agente sobre ${dataset.truths.length} carpetas · ${s.mode} · política ${s.policy.id}`)
  const reviews = await pool(dataset.truths, s.live ? Number(values.concurrency) : 1, async truth => {
    const review = await reviewFolder(inputFor(truth, dataset), s.deps(truth.id))
    log(`  ${truth.id}: ${review.decision} (esperada ${truth.expectedDecision}) · ${review.calls} llamada(s)`)
    return review
  })
  const results: FolderResult[] = reviews.map((r, i) => evaluateFolder(dataset.truths[i]!, r, s.policy))
  const dir = path.join(AGENT_RUNS, id)
  await mkdir(dir, { recursive: true })
  const write = (name: string, data: unknown) => writeFile(path.join(dir, name), JSON.stringify(data, null, 2) + '\n')
  await write('reviews.json', reviews)
  await write('results.json', results)
  await write('session.json', {
    runId: id,
    mode: s.mode,
    subset: values.subset ?? null,
    policy: { id: s.policy.id, version: s.policy.version },
    retry: DEFAULT_RETRY,
    ...(s.live ? { calls: s.live.client.counters } : {}),
  })
  if (s.live) await write('lecturas.json', s.live.source.recorded)
  await writeFile(path.join(dir, 'report.md'), renderAgentReport({ runId: id, mode: s.mode, results, reviews, policy: s.policy }))

  for (const subset of ['limpio', 'dificil'] as const) {
    const part = results.filter(r => r.subset === subset)
    if (!part.length) continue
    const m = summarizeResults(part)
    log(
      `\n${subset}: ${m.correct}/${m.folders} decisiones correctas · escaladas por lectura ${m.readingEscalations} · errores de decisión ${m.logicErrors} · ` +
        `defectos ${m.defects.detected}/${m.defects.planted} (de más: ${m.defects.spurious}) · falsos positivos ${m.falsePositives.total}/${m.falsePositives.cleanFolders}`,
    )
  }
  if (s.live) log(`\nLlamadas HTTP: ${s.live.client.counters.httpCalls}`)
  log(`Reporte: ${path.relative(ROOT, path.join(dir, 'report.md'))}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
