/** One pass over the dataset against the live API (the only part that costs money). */
import { CallBudgetExceeded, type Docs2JsonClient, type ReadResponse } from '../docs2json/client'
import type { DatasetFile } from './dataset'
import type { RawFileResult, RawRun } from './score'
import { stampFile } from './stamp'

/** Drops the cédula face photo (base64) so saved responses stay small and image-free. */
export function stripHeavyFields(response: ReadResponse): ReadResponse {
  return {
    ...response,
    documents: response.documents.map(d => {
      if (!d.fields || !('foto_base64' in d.fields)) return d
      const { foto_base64: _photo, ...fields } = d.fields
      return { ...d, fields }
    }),
  }
}

export async function runPass(opts: {
  client: Docs2JsonClient
  files: DatasetFile[]
  runTag: string
  concurrency: number
  log: (line: string) => void
}): Promise<RawRun> {
  const startedAt = new Date().toISOString()
  const results: RawFileResult[] = new Array(opts.files.length)
  let next = 0
  let done = 0
  let budgetExceeded = false
  const notCalled = (f: DatasetFile): RawFileResult => ({
    folder: f.folder,
    file: f.file,
    mimeType: f.mimeType,
    ok: false,
    status: 0,
    latencyMs: 0,
    attempts: 0,
    error: 'no se leyó: se alcanzó el tope de llamadas',
  })
  const worker = async () => {
    while (next < opts.files.length) {
      const i = next++
      const f = opts.files[i]!
      if (budgetExceeded) {
        results[i] = notCalled(f)
        continue
      }
      const bytes = await stampFile(f.bytes, f.mimeType, opts.runTag)
      let outcome
      try {
        outcome = await opts.client.read({ bytes, filename: f.file, mimeType: f.mimeType })
      } catch (err) {
        if (!(err instanceof CallBudgetExceeded)) throw err
        if (!budgetExceeded) opts.log(err.message)
        budgetExceeded = true
        results[i] = notCalled(f)
        continue
      }
      results[i] = {
        folder: f.folder,
        file: f.file,
        mimeType: f.mimeType,
        ok: outcome.ok,
        status: outcome.status,
        latencyMs: outcome.latencyMs,
        attempts: outcome.attempts,
        ...(outcome.retries.length ? { retries: outcome.retries } : {}),
        ...(outcome.ok ? { response: stripHeavyFields(outcome.body) } : { error: outcome.error }),
      }
      done += 1
      const what = outcome.ok ? outcome.body.documents.map(d => d.doctype ?? '?').join('+') : outcome.error
      opts.log(`[${opts.runTag}] ${String(done).padStart(2)}/${opts.files.length} ${f.folder}/${f.file} → ${outcome.status} ${what} · ${(outcome.latencyMs / 1000).toFixed(1)} s`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, opts.files.length) }, worker))
  return { runTag: opts.runTag, startedAt, finishedAt: new Date().toISOString(), results, ...(budgetExceeded ? { budgetExceeded } : {}) }
}
