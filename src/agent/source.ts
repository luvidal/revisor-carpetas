/**
 * The agent's reading tool: one call to docs2json, classified as ok,
 * transient or permanent. Two implementations behind one interface:
 * - LiveSource calls the API (built-in client retries off: the agent's retry
 *   policy decides).
 * - ReplaySource answers from responses recorded by earlier runs, at no cost.
 *   Attempt n uses the n-th recording of that file, so a retry in replay sees
 *   what a real second read returned.
 */
import { CallBudgetExceeded, errorLabel, type Docs2JsonClient, type ReadDocument, type ReadOutcome } from '../docs2json/client'
import type { RawFileResult } from '../evals/score'
import { stampFile } from '../evals/stamp'
import type { FolderInput, ToolOutcome } from './types'

export type FolderFile = FolderInput['files'][number]

export interface DocumentSource {
  read(folderId: string, file: FolderFile, attempt: number): Promise<ToolOutcome>
}

/** A document that came back without a type or without any field value. */
export function isEmptyDocument(d: ReadDocument): boolean {
  return !d.doctype || !Object.values(d.fields ?? {}).some(v => v !== null && v !== undefined && v !== '')
}

/** Statuses worth retrying: rate limit, docs2json's typed 503s, proxy and gateway errors. */
const TRANSIENT_STATUS = new Set([0, 429, 500, 502, 503, 504])

export function classify(outcome: Pick<ReadOutcome, 'ok' | 'status' | 'latencyMs'> & { error?: string; body?: { documents: ReadDocument[] } }): ToolOutcome {
  const latencyMs = outcome.latencyMs
  if (outcome.ok) {
    const documents = outcome.body?.documents ?? []
    if (documents.length === 0 || documents.some(isEmptyDocument)) {
      return { kind: 'transient', cause: 'respuesta vacía (HTTP 200 sin tipo o sin campos)', latencyMs }
    }
    return { kind: 'ok', documents, latencyMs }
  }
  const cause = errorLabel(outcome.error ?? `HTTP ${outcome.status}`)
  if (cause === 'no leído (tope de llamadas)') return { kind: 'permanent', cause, latencyMs }
  return TRANSIENT_STATUS.has(outcome.status) ? { kind: 'transient', cause, latencyMs } : { kind: 'permanent', cause, latencyMs }
}

export class LiveSource implements DocumentSource {
  /** Every attempt, as recorded, so a live run can be replayed later. */
  readonly recorded: Array<RawFileResult & { attempt: number }> = []

  constructor(
    private readonly client: Docs2JsonClient,
    /** Stamp each upload (see evals/stamp) so the API cache does not answer; for measurement runs. */
    private readonly stampTag?: string,
  ) {}

  async read(folderId: string, file: FolderFile, attempt: number): Promise<ToolOutcome> {
    if (!file.bytes) return { kind: 'permanent', cause: 'archivo sin contenido', latencyMs: 0, called: false }
    const bytes = this.stampTag ? await stampFile(file.bytes, file.mimeType, `${this.stampTag}-a${attempt}`) : file.bytes
    let outcome: ReadOutcome
    try {
      outcome = await this.client.read({ bytes, filename: file.file, mimeType: file.mimeType })
    } catch (err) {
      if (err instanceof CallBudgetExceeded) return { kind: 'permanent', cause: 'no leído (tope de llamadas)', latencyMs: 0, called: false }
      throw err
    }
    this.recorded.push({
      folder: folderId,
      file: file.file,
      mimeType: file.mimeType,
      ok: outcome.ok,
      status: outcome.status,
      latencyMs: outcome.latencyMs,
      attempts: 1,
      attempt,
      ...(outcome.ok ? { response: outcome.body } : { error: outcome.error }),
    })
    return classify(outcome)
  }
}

export class ReplaySource implements DocumentSource {
  private readonly byFile = new Map<string, RawFileResult[]>()

  /** `recordings` in chronological order; each one is one read of one file. */
  constructor(recordings: RawFileResult[]) {
    for (const r of recordings) {
      const key = `${r.folder}/${r.file}`
      const list = this.byFile.get(key) ?? []
      list.push(r)
      this.byFile.set(key, list)
    }
  }

  recordingsFor(folderId: string, file: string): number {
    return this.byFile.get(`${folderId}/${file}`)?.length ?? 0
  }

  async read(folderId: string, file: FolderFile, attempt: number): Promise<ToolOutcome> {
    const list = this.byFile.get(`${folderId}/${file.file}`)
    if (!list?.length) return { kind: 'permanent', cause: 'sin respuesta grabada', latencyMs: 0, called: false }
    const r = list[Math.min(attempt, list.length) - 1]!
    return classify({ ok: r.ok, status: r.status, latencyMs: r.latencyMs, ...(r.error ? { error: r.error } : {}), ...(r.response ? { body: r.response } : {}) })
  }
}
