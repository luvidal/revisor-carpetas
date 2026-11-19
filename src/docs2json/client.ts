/**
 * Minimal HTTP client for the docs2json API (POST /v1/documents/read).
 * - Counts every HTTP call, including retries, and refuses to exceed a call budget.
 * - Retries only when it is safe and cheap: 429 `ai_busy` (rejected before any
 *   model call) with backoff, and one retry for a 5xx or network failure.
 * - Never logs or returns the API key; errors carry status and server message only.
 */
import { createHash, randomUUID } from 'node:crypto'

export type ReadDocument = {
  doctype: string | null
  partId?: string | null
  pages?: { start: number; end: number }
  fields: Record<string, unknown>
  docdate?: string | null
  confidence?: number
}

export type ReadResponse = {
  documents: ReadDocument[]
  meta: { catalogVersion: string; models: Record<string, string> }
}

/** `retries` lists why each earlier attempt was repeated (empty when the first one answered). */
export type ReadOutcome =
  | { ok: true; status: number; latencyMs: number; attempts: number; retries: string[]; body: ReadResponse }
  | { ok: false; status: number; latencyMs: number; attempts: number; retries: string[]; error: string }

export type UploadFile = { bytes: Uint8Array; filename: string; mimeType: string }

export type ClientOptions = {
  apiKey: string
  baseUrl?: string
  /** Hard ceiling on HTTP calls to the read endpoint (retries included). */
  maxCalls: number
  timeoutMs?: number
  /**
   * Built-in retries (429 with backoff; one retry for 5xx or network). The
   * evals keep them on; the agent turns them off and applies its own policy.
   */
  retry?: boolean
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

export class CallBudgetExceeded extends Error {
  constructor(limit: number) {
    super(`Se alcanzó el tope de ${limit} llamadas a la API; se detiene la corrida.`)
  }
}

export const DEFAULT_BASE_URL = 'https://api.docs2json.cl'
const RATE_LIMIT_RETRIES = 4
const FAILURE_RETRIES = 1

export class Docs2JsonClient {
  readonly counters = { httpCalls: 0, rateLimited: 0, serverErrors: 0, networkErrors: 0 }
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly timeoutMs: number

  constructor(private readonly options: ClientOptions) {
    if (!options.apiKey) throw new Error('Falta DOCS2JSON_API_KEY')
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
    this.sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
    this.timeoutMs = options.timeoutMs ?? 240_000
  }

  /** Open endpoint, not billed: confirms the API is up and which catalog it serves. */
  async health(): Promise<{ ok: boolean; catalogVersion?: string }> {
    const res = await this.fetchImpl(`${this.baseUrl}/healthz`, { signal: AbortSignal.timeout(20_000) })
    return (await res.json()) as { ok: boolean; catalogVersion?: string }
  }

  async read(file: UploadFile): Promise<ReadOutcome> {
    let rateLimitRetries = 0
    let failureRetries = 0
    const retries: string[] = []
    for (let attempt = 1; ; attempt++) {
      if (this.counters.httpCalls >= this.options.maxCalls) throw new CallBudgetExceeded(this.options.maxCalls)
      this.counters.httpCalls += 1
      const { body, contentType } = multipartBody(file)
      const started = performance.now()
      let status = 0
      let error = ''
      try {
        const res = await this.fetchImpl(`${this.baseUrl}/v1/documents/read`, {
          method: 'POST',
          headers: {
            'x-api-key': this.options.apiKey,
            'content-type': contentType,
            // The API sits behind CloudFront with a signed origin (Lambda function URL):
            // POST bodies must declare their SHA-256 or CloudFront answers 403.
            'x-amz-content-sha256': createHash('sha256').update(body).digest('hex'),
          },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        })
        status = res.status
        const text = await res.text()
        const latencyMs = Math.round(performance.now() - started)
        if (res.ok) return { ok: true, status, latencyMs, attempts: attempt, retries, body: JSON.parse(text) as ReadResponse }
        error = httpError(status, text)
        const retry = this.options.retry !== false
        if (retry && status === 429 && rateLimitRetries < RATE_LIMIT_RETRIES) {
          this.counters.rateLimited += 1
          rateLimitRetries += 1
          retries.push(error)
          await this.sleep(5_000 * 2 ** (rateLimitRetries - 1))
          continue
        }
        if (status >= 500) {
          this.counters.serverErrors += 1
          if (retry && failureRetries < FAILURE_RETRIES) {
            failureRetries += 1
            retries.push(error)
            await this.sleep(5_000)
            continue
          }
        }
        return { ok: false, status, latencyMs, attempts: attempt, retries, error }
      } catch (err) {
        const latencyMs = Math.round(performance.now() - started)
        const timedOut = err instanceof Error && err.name === 'TimeoutError'
        this.counters.networkErrors += 1
        const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause
        error = timedOut
          ? `sin respuesta en ${this.timeoutMs / 1000} s`
          : `error de red: ${(err as Error).message}${cause ? ` (${cause.code ?? cause.message})` : ''}`
        // A timeout may still have run (and billed) the read server-side: do not repeat it.
        if (this.options.retry !== false && !timedOut && failureRetries < FAILURE_RETRIES) {
          failureRetries += 1
          retries.push(error)
          await this.sleep(5_000)
          continue
        }
        return { ok: false, status, latencyMs, attempts: attempt, retries, error }
      }
    }
  }
}

/**
 * multipart/form-data built by hand (instead of FormData) so the exact bytes
 * are known before sending and can be hashed for `x-amz-content-sha256`.
 */
export function multipartBody(file: UploadFile): { body: Uint8Array; contentType: string } {
  const boundary = `revisor-${randomUUID()}`
  const safeName = file.filename.replace(/[^\w.-]/g, '_')
  const encoder = new TextEncoder()
  const head = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\n` +
      `Content-Type: ${file.mimeType}\r\n\r\n`,
  )
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`)
  const body = new Uint8Array(head.length + file.bytes.length + tail.length)
  body.set(head, 0)
  body.set(file.bytes, head.length)
  body.set(tail, head.length + file.bytes.length)
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

/**
 * Groups an error string by cause: docs2json's typed code (`503 ai_timeout`),
 * the CDN's HTML page (`504 del proxy`), a bare status, or a client-side cause.
 */
export function errorLabel(error: string): string {
  const typed = /^HTTP (\d{3}) \[([\w-]+)\]/.exec(error)
  if (typed) return `${typed[1]} ${typed[2]}`
  const http = /^HTTP (\d{3})/.exec(error)
  if (http) return /<!DOCTYPE|<HTML|respuesta HTML/i.test(error) ? `${http[1]} del proxy` : `HTTP ${http[1]}`
  if (error.startsWith('error de red')) return 'error de red'
  if (error.startsWith('sin respuesta')) return 'timeout del cliente'
  if (error.startsWith('no se leyó')) return 'no leído (tope de llamadas)'
  return 'otro'
}

/**
 * "HTTP 503 [ai_timeout]: …" when the body carries a `code` (docs2json's typed
 * errors), "HTTP 504: respuesta HTML del proxy (…)" for a CloudFront page.
 */
export function httpError(status: number, text: string): string {
  let code = ''
  try {
    const body = JSON.parse(text) as { code?: unknown }
    if (typeof body.code === 'string' && body.code) code = body.code
  } catch {
    // not JSON (CloudFront HTML, empty body)
  }
  return `HTTP ${status}${code ? ` [${code}]` : ''}: ${serverMessage(text)}`
}

function serverMessage(text: string): string {
  if (/^\s*</.test(text)) {
    const title = /<TITLE>([^<]*)<\/TITLE>/i.exec(text)?.[1]?.trim()
    return `respuesta HTML del proxy${title ? ` (${title})` : ''}`.slice(0, 200)
  }
  try {
    const body = JSON.parse(text) as { msg?: string; error?: string }
    return (body.msg ?? body.error ?? '').slice(0, 200)
  } catch {
    return text.slice(0, 200)
  }
}
