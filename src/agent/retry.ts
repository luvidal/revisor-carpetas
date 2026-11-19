/**
 * Retry policy for the reading tool: exponential backoff with full jitter,
 * capped per file and per folder. Numbers come from session 20261119-1328,
 * where docs2json answered `503 ai_timeout` after ~70 s and a CloudFront 504
 * after 120 s: a retry is expensive (time and money), so the caps are small and
 * a folder that cannot be read is escalated rather than decided blind.
 */
import type { DocumentSource, FolderFile } from './source'
import type { FileRead, ReadAttempt } from './types'

export type RetryPolicy = {
  /** Attempts per file, the first included. */
  maxAttemptsPerFile: number
  /** Retries shared by all the files of one folder. */
  maxRetriesPerFolder: number
  baseDelayMs: number
  maxDelayMs: number
}

export const DEFAULT_RETRY: RetryPolicy = { maxAttemptsPerFile: 3, maxRetriesPerFolder: 4, baseDelayMs: 2_000, maxDelayMs: 20_000 }

/** "Full jitter": a random wait between 0 and the exponential ceiling, so parallel clients do not retry in lockstep. */
export function backoffMs(retry: number, policy: RetryPolicy, random: () => number): number {
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (retry - 1))
  return Math.round(random() * ceiling)
}

export type ReadDeps = {
  source: DocumentSource
  policy: RetryPolicy
  sleep: (ms: number) => Promise<void>
  random: () => number
}

/** Reads every file of a folder in order, sharing one retry budget. */
export async function readFolder(folderId: string, files: FolderFile[], deps: ReadDeps): Promise<{ reads: FileRead[]; calls: number; retries: number }> {
  let retriesLeft = deps.policy.maxRetriesPerFolder
  let calls = 0
  const reads: FileRead[] = []
  for (const file of files) {
    const attempts: ReadAttempt[] = []
    let read: FileRead | null = null
    for (let attempt = 1; attempt <= deps.policy.maxAttemptsPerFile; attempt++) {
      let waitedMs = 0
      if (attempt > 1) {
        waitedMs = backoffMs(attempt - 1, deps.policy, deps.random)
        await deps.sleep(waitedMs)
      }
      const outcome = await deps.source.read(folderId, file, attempt)
      if (!(outcome.kind === 'permanent' && outcome.called === false)) calls += 1
      attempts.push({ attempt, kind: outcome.kind, ...(outcome.kind === 'ok' ? {} : { cause: outcome.cause }), latencyMs: outcome.latencyMs, waitedMs })
      if (outcome.kind === 'ok') {
        read = { file: file.file, status: 'leido', attempts, documents: outcome.documents }
        break
      }
      const canRetry = outcome.kind === 'transient' && attempt < deps.policy.maxAttemptsPerFile && retriesLeft > 0
      if (!canRetry) {
        const why = outcome.kind === 'transient' && retriesLeft === 0 && attempt < deps.policy.maxAttemptsPerFile ? ' (sin reintentos disponibles en la carpeta)' : ''
        read = { file: file.file, status: 'no_leido', attempts, documents: [], cause: `${outcome.cause}${why}` }
        break
      }
      retriesLeft -= 1
    }
    reads.push(read!)
  }
  return { reads, calls, retries: deps.policy.maxRetriesPerFolder - retriesLeft }
}
