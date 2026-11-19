/**
 * The agent as an explicit, deterministic state machine:
 *
 *   recibida → leyendo → validando → cruzando → aplicando_politica → decidida
 *                  └──────── (nothing could be read) ──────┘
 *
 * Each state does one job and names the next. The only call to the outside
 * world is the reading tool, in `leyendo`; everything after it is pure, so the
 * same documents always produce the same decision and the same reasons.
 */
import { DOCTYPES } from '../domain/truth'
import {
  checkCompleteness,
  checkDocuments,
  checkIdCardValidity,
  checkIdentity,
  checkPensionFund,
  checkReads,
  checkSalary,
  type Owner,
} from './checks'
import { decide, type Policy } from './policy'
import { readFolder, type ReadDeps, type RetryPolicy } from './retry'
import type { DocumentSource } from './source'
import type { AgentState, Doc, FileRead, Finding, FolderInput, FolderReview, TraceStep } from './types'

export const TRANSITIONS: Record<AgentState, AgentState[]> = {
  recibida: ['leyendo'],
  leyendo: ['validando', 'aplicando_politica'],
  validando: ['cruzando'],
  cruzando: ['aplicando_politica'],
  aplicando_politica: ['decidida'],
  decidida: [],
}

export type AgentDeps = {
  source: DocumentSource
  policy: Policy
  retry: RetryPolicy
  sleep: (ms: number) => Promise<void>
  random: () => number
}

type Context = {
  input: FolderInput
  reads: FileRead[]
  docs: Doc[]
  owner: Map<Doc, Owner>
  findings: Finding[]
  calls: number
  retries: number
  trace: TraceStep[]
  review?: FolderReview
}

type Step = (ctx: Context, deps: AgentDeps) => Promise<AgentState | null>

const STEPS: Record<AgentState, Step> = {
  async recibida(ctx) {
    ctx.trace.push({ state: 'recibida', note: `${ctx.input.files.length} archivo(s); revisión al ${ctx.input.referenceDate}.` })
    return 'leyendo'
  },

  async leyendo(ctx, deps) {
    const readDeps: ReadDeps = { source: deps.source, policy: deps.retry, sleep: deps.sleep, random: deps.random }
    const { reads, calls, retries } = await readFolder(ctx.input.folderId, ctx.input.files, readDeps)
    ctx.reads = reads
    ctx.calls = calls
    ctx.retries = retries
    ctx.docs = reads.flatMap(r =>
      r.documents.map((d, index) => ({
        file: r.file,
        index,
        doctype: d.doctype ?? '(sin tipo)',
        fields: d.fields ?? {},
        docdate: d.docdate ?? null,
        confidence: typeof d.confidence === 'number' ? d.confidence : null,
      })),
    )
    ctx.findings.push(...checkReads(reads))
    const unread = reads.filter(r => r.status === 'no_leido').length
    ctx.trace.push({
      state: 'leyendo',
      note: `${reads.length - unread} de ${reads.length} archivo(s) leídos, ${ctx.docs.length} documento(s); ${calls} llamada(s), ${retries} reintento(s).`,
    })
    return ctx.docs.length ? 'validando' : 'aplicando_politica'
  },

  async validando(ctx, deps) {
    const perDoc = checkDocuments(ctx.docs, deps.policy)
    const identity = checkIdentity(ctx.docs, ctx.input.applicant)
    ctx.owner = identity.owner
    ctx.findings.push(...perDoc, ...identity.findings)
    ctx.trace.push({ state: 'validando', note: `${perDoc.length + identity.findings.length} hallazgo(s) por documento e identidad.` })
    return 'cruzando'
  },

  async cruzando(ctx, deps) {
    const own = ctx.docs.filter(d => ctx.owner.get(d) === 'solicitante')
    const others = new Set(ctx.docs.filter(d => ctx.owner.get(d) === 'otra_persona').map(d => d.doctype))
    const unreadFiles = ctx.reads.filter(r => r.status === 'no_leido').length
    const found = [
      ...checkCompleteness(own, deps.policy.requiredDocuments(ctx.input.referenceDate), { unreadFiles, othersDoctypes: others }),
      ...checkIdCardValidity(own, ctx.input.referenceDate),
      ...checkSalary(own, deps.policy),
      ...checkPensionFund(own),
    ]
    ctx.findings.push(...found)
    const payslips = own.filter(d => d.doctype === DOCTYPES.payslip).length
    ctx.trace.push({
      state: 'cruzando',
      note: `${own.length} documento(s) del solicitante (${payslips} liquidación(es)); ${found.length} hallazgo(s) al cruzar.${unreadFiles ? ' Completitud sin verificar: hay archivos sin leer.' : ''}`,
    })
    return 'aplicando_politica'
  },

  async aplicando_politica(ctx, deps) {
    const { decision, reasons, observations } = decide(ctx.findings, deps.policy)
    ctx.review = {
      folderId: ctx.input.folderId,
      decision,
      reasons,
      observations,
      reads: ctx.reads,
      documents: ctx.docs,
      calls: ctx.calls,
      trace: ctx.trace,
      policy: { id: deps.policy.id, version: deps.policy.version },
    }
    ctx.trace.push({ state: 'aplicando_politica', note: `${reasons.length} motivo(s) y ${observations.length} observación(es) según ${deps.policy.id}.` })
    return 'decidida'
  },

  async decidida(ctx) {
    ctx.trace.push({ state: 'decidida', note: ctx.review!.decision })
    return null
  },
}

export async function reviewFolder(input: FolderInput, deps: AgentDeps): Promise<FolderReview> {
  const ctx: Context = { input, reads: [], docs: [], owner: new Map(), findings: [], calls: 0, retries: 0, trace: [] }
  let state: AgentState | null = 'recibida'
  while (state) {
    const next: AgentState | null = await STEPS[state](ctx, deps)
    if (next && !TRANSITIONS[state].includes(next)) throw new Error(`Transición no permitida: ${state} → ${next}`)
    state = next
  }
  return ctx.review!
}
