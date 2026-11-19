import { describe, expect, it } from 'vitest'
import { evaluateFolder, summarizeResults } from '../src/agent/evaluate'
import { TRANSITIONS, reviewFolder, type AgentDeps } from '../src/agent/machine'
import { PROVISIONAL_POLICY } from '../src/agent/policy'
import { DEFAULT_RETRY, backoffMs, readFolder } from '../src/agent/retry'
import { ReplaySource, classify, type DocumentSource } from '../src/agent/source'
import type { FolderInput, ToolOutcome } from '../src/agent/types'
import { prng } from '../src/dataset/render/raster'
import type { FolderTruth } from '../src/domain/truth'
import { loadDataset } from '../src/evals/dataset'

const dataset = await loadDataset()

const inputOf = (t: FolderTruth): FolderInput => ({
  folderId: t.id,
  referenceDate: t.referenceDate,
  applicant: t.applicant,
  files: t.files.map(f => ({ file: f.file, mimeType: f.mimeType })),
})

/** A reader that returns exactly the ground truth: tests the logic, not docs2json. */
const perfectReader: DocumentSource = {
  async read(folderId, file): Promise<ToolOutcome> {
    const t = dataset.truths.find(x => x.id === folderId)!
    const f = t.files.find(x => x.file === file.file)!
    return { kind: 'ok', latencyMs: 1, documents: f.documents.map(d => ({ doctype: d.doctype, pages: d.pages, docdate: d.docdate, fields: d.fields, confidence: 0.99 })) }
  },
}

const deps = (source: DocumentSource, sleeps: number[] = []): AgentDeps => ({
  source,
  policy: PROVISIONAL_POLICY,
  retry: DEFAULT_RETRY,
  sleep: async ms => void sleeps.push(ms),
  random: prng(1),
})

/** Scripted outcomes per call, in order. */
function scripted(outcomes: ToolOutcome[]): DocumentSource & { calls: number } {
  const s = {
    calls: 0,
    async read(): Promise<ToolOutcome> {
      return outcomes[Math.min(s.calls++, outcomes.length - 1)]!
    },
  }
  return s
}
const ok: ToolOutcome = { kind: 'ok', latencyMs: 1, documents: [{ doctype: 'cedula-identidad', fields: { rut: '1-9' } }] }
const timeout: ToolOutcome = { kind: 'transient', cause: '503 ai_timeout', latencyMs: 70_000 }

describe('agent logic with perfect readings', () => {
  it.each(dataset.truths.map(t => [t.id, t] as const))('%s reaches the expected decision and finds the planted defects', async (_id, truth) => {
    const review = await reviewFolder(inputOf(truth), deps(perfectReader))
    const result = evaluateFolder(truth, review, PROVISIONAL_POLICY)
    expect(review.decision).toBe(truth.expectedDecision)
    expect(result.missed).toEqual([])
    expect(result.spurious).toEqual([])
    expect(review.trace.map(t => t.state)).toEqual(['recibida', 'leyendo', 'validando', 'cruzando', 'aplicando_politica', 'decidida'])
    for (const r of review.reasons) expect(r.evidence.length).toBeGreaterThan(0)
  })

  it('is deterministic', async () => {
    const t = dataset.truths.find(x => x.id === 'f10')!
    const a = await reviewFolder(inputOf(t), deps(perfectReader))
    const b = await reviewFolder(inputOf(t), deps(perfectReader))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('state machine', () => {
  it('only allows the declared transitions', () => {
    expect(TRANSITIONS.leyendo).toEqual(['validando', 'aplicando_politica'])
    expect(TRANSITIONS.decidida).toEqual([])
  })

  it('skips to the policy and escalates when nothing could be read', async () => {
    const t = dataset.truths.find(x => x.id === 'f01')!
    const review = await reviewFolder(inputOf(t), deps(scripted([timeout])))
    expect(review.decision).toBe('escalar_a_persona')
    expect(review.trace.map(x => x.state)).toEqual(['recibida', 'leyendo', 'aplicando_politica', 'decidida'])
    expect(review.reasons.every(r => r.code === 'lectura_fallida')).toBe(true)
    // Completeness is not judged blind: no "documento faltante" when files are unread.
    expect(review.reasons.some(r => r.code === 'documento_faltante')).toBe(false)
  })
})

describe('retry policy', () => {
  const file = { file: 'cedula.png', mimeType: 'image/png' as const }

  it('retries transient failures with jittered exponential backoff', async () => {
    const source = scripted([timeout, timeout, ok])
    const sleeps: number[] = []
    const { reads, calls, retries } = await readFolder('f', [file], { source, policy: DEFAULT_RETRY, sleep: async ms => void sleeps.push(ms), random: () => 1 })
    expect(reads[0]!.status).toBe('leido')
    expect([calls, retries]).toEqual([3, 2])
    expect(sleeps).toEqual([2_000, 4_000]) // random() = 1 hits the ceiling: base × 2^(n-1)
    expect(backoffMs(10, DEFAULT_RETRY, () => 1)).toBe(DEFAULT_RETRY.maxDelayMs)
    expect(backoffMs(1, DEFAULT_RETRY, () => 0)).toBe(0)
  })

  it('stops at the per-file cap and shares a per-folder budget', async () => {
    const one = await readFolder('f', [file], { source: scripted([timeout]), policy: DEFAULT_RETRY, sleep: async () => {}, random: () => 0 })
    expect(one.reads[0]).toMatchObject({ status: 'no_leido', cause: '503 ai_timeout' })
    expect(one.calls).toBe(DEFAULT_RETRY.maxAttemptsPerFile)
    const many = await readFolder('f', [file, file, file, file], { source: scripted([timeout]), policy: DEFAULT_RETRY, sleep: async () => {}, random: () => 0 })
    expect(many.retries).toBe(DEFAULT_RETRY.maxRetriesPerFolder)
    expect(many.calls).toBe(4 + DEFAULT_RETRY.maxRetriesPerFolder)
    expect(many.reads.at(-1)!.cause).toContain('sin reintentos disponibles en la carpeta')
  })

  it('never retries a permanent failure', async () => {
    const source = scripted([{ kind: 'permanent', cause: 'HTTP 415', latencyMs: 1 }, ok])
    const { reads, calls } = await readFolder('f', [file], { source, policy: DEFAULT_RETRY, sleep: async () => {}, random: () => 0 })
    expect(reads[0]!.status).toBe('no_leido')
    expect(calls).toBe(1)
  })

  it('classifies an empty HTTP 200 and typed 503s as transient, 4xx as permanent', () => {
    expect(classify({ ok: true, status: 200, latencyMs: 1, body: { documents: [{ doctype: null, fields: {} }] } }).kind).toBe('transient')
    expect(classify({ ok: true, status: 200, latencyMs: 1, body: { documents: [{ doctype: 'cedula-identidad', fields: {}, confidence: 0 }] } }).kind).toBe('transient')
    expect(classify({ ok: false, status: 503, latencyMs: 1, error: 'HTTP 503 [ai_unavailable]: x' })).toMatchObject({ kind: 'transient', cause: '503 ai_unavailable' })
    expect(classify({ ok: false, status: 504, latencyMs: 1, error: 'HTTP 504: <!DOCTYPE HTML' })).toMatchObject({ kind: 'transient', cause: '504 del proxy' })
    expect(classify({ ok: false, status: 415, latencyMs: 1, error: 'HTTP 415: Unsupported' }).kind).toBe('permanent')
  })

  it('replays the n-th recording on the n-th attempt', async () => {
    const rec = (ok: boolean) => ({ folder: 'f', file: 'cedula.png', mimeType: 'image/png', ok, status: ok ? 200 : 503, latencyMs: 1, attempts: 1, ...(ok ? { response: { documents: [{ doctype: 'cedula-identidad', fields: { rut: '1-9' } }], meta: { catalogVersion: 'x', models: {} } } } : { error: 'HTTP 503 [ai_timeout]: x' }) })
    const replay = new ReplaySource([rec(false), rec(true)])
    expect((await replay.read('f', file, 1)).kind).toBe('transient')
    expect((await replay.read('f', file, 2)).kind).toBe('ok')
    expect((await replay.read('f', file, 3)).kind).toBe('ok')
    expect(await replay.read('f', { file: 'otro.pdf', mimeType: 'application/pdf' }, 1)).toMatchObject({ kind: 'permanent', called: false })
  })
})

describe('end-to-end eval', () => {
  it('separates reading escalations from decision errors', async () => {
    const t = dataset.truths.find(x => x.id === 'f05')! // expected: ask for the AFP certificate
    const review = await reviewFolder(inputOf(t), deps(scripted([timeout])))
    const r = evaluateFolder(t, review, PROVISIONAL_POLICY)
    expect(r).toMatchObject({ correct: false, readingEscalation: true })
    const m = summarizeResults([r])
    expect([m.readingEscalations, m.logicErrors]).toEqual([1, 0])
  })

  it('counts a clean folder that is not marked ready as a false positive', async () => {
    const t = dataset.truths.find(x => x.id === 'f01')!
    const review = await reviewFolder(inputOf(t), deps(perfectReader))
    const wrong = { ...review, decision: 'pedir_documento' as const }
    const m = summarizeResults([evaluateFolder(t, wrong, PROVISIONAL_POLICY)])
    expect(m.falsePositives).toMatchObject({ total: 1, byLogic: 1, cleanFolders: 1 })
  })
})
