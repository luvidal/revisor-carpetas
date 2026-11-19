import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CallBudgetExceeded, Docs2JsonClient, httpError, multipartBody } from '../src/docs2json/client'

const KEY = 'clave-de-prueba-que-no-debe-filtrarse'
const file = { bytes: new TextEncoder().encode('%PDF-1.7 prueba'), filename: 'liquidación 1.pdf', mimeType: 'application/pdf' }
const okBody = JSON.stringify({ documents: [{ doctype: 'liquidaciones-sueldo', fields: {} }], meta: { catalogVersion: 'x', models: { extract: 'm' } } })

type Call = { url: string; init: RequestInit }

function fakeFetch(responses: Array<() => Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  let i = 0
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = responses[Math.min(i++, responses.length - 1)]!
    return next()
  }) as typeof fetch
  return { fetch: impl, calls }
}

const noSleep = async () => {}

describe('multipartBody', () => {
  it('builds a single file part with a safe filename', () => {
    const { body, contentType } = multipartBody(file)
    const text = new TextDecoder().decode(body)
    const boundary = contentType.split('boundary=')[1]!
    expect(text.startsWith(`--${boundary}\r\n`)).toBe(true)
    expect(text).toContain('name="file"; filename="liquidaci_n_1.pdf"')
    expect(text).toContain('Content-Type: application/pdf\r\n\r\n%PDF-1.7 prueba\r\n')
    expect(text.endsWith(`--${boundary}--\r\n`)).toBe(true)
  })
})

describe('Docs2JsonClient', () => {
  it('sends the key, the multipart body and its SHA-256', async () => {
    const { fetch, calls } = fakeFetch([() => new Response(okBody, { status: 200 })])
    const client = new Docs2JsonClient({ apiKey: KEY, maxCalls: 5, fetchImpl: fetch, sleep: noSleep })
    const out = await client.read(file)
    expect(out.ok).toBe(true)
    expect(calls).toHaveLength(1)
    const { url, init } = calls[0]!
    expect(url).toBe('https://api.docs2json.cl/v1/documents/read')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe(KEY)
    const sent = init.body as Uint8Array
    expect(headers['x-amz-content-sha256']).toBe(createHash('sha256').update(sent).digest('hex'))
    expect(headers['content-type']).toMatch(/^multipart\/form-data; boundary=/)
  })

  it('retries 429 with backoff and counts every call', async () => {
    const { fetch } = fakeFetch([
      () => new Response('{"error":"ai_busy"}', { status: 429 }),
      () => new Response('{"error":"ai_busy"}', { status: 429 }),
      () => new Response(okBody, { status: 200 }),
    ])
    const waits: number[] = []
    const client = new Docs2JsonClient({ apiKey: KEY, maxCalls: 5, fetchImpl: fetch, sleep: async ms => void waits.push(ms) })
    const out = await client.read(file)
    expect(out).toMatchObject({ ok: true, attempts: 3, retries: ['HTTP 429: ai_busy', 'HTTP 429: ai_busy'] })
    expect(waits).toEqual([5000, 10000])
    expect(client.counters).toMatchObject({ httpCalls: 3, rateLimited: 2 })
  })

  it('retries a 5xx once, then reports the error without the key', async () => {
    const { fetch } = fakeFetch([() => new Response('{"msg":"boom"}', { status: 500 })])
    const client = new Docs2JsonClient({ apiKey: KEY, maxCalls: 5, fetchImpl: fetch, sleep: noSleep })
    const out = await client.read(file)
    expect(out).toMatchObject({ ok: false, status: 500, attempts: 2, error: 'HTTP 500: boom' })
    expect(JSON.stringify(out)).not.toContain(KEY)
  })

  it('does not retry client errors such as 401 or 403', async () => {
    const { fetch, calls } = fakeFetch([() => new Response('{"msg":"Unauthorized"}', { status: 401 })])
    const client = new Docs2JsonClient({ apiKey: KEY, maxCalls: 5, fetchImpl: fetch, sleep: noSleep })
    expect(await client.read(file)).toMatchObject({ ok: false, status: 401 })
    expect(calls).toHaveLength(1)
  })

  it('refuses to go over the call budget', async () => {
    const { fetch } = fakeFetch([() => new Response(okBody, { status: 200 })])
    const client = new Docs2JsonClient({ apiKey: KEY, maxCalls: 1, fetchImpl: fetch, sleep: noSleep })
    await client.read(file)
    await expect(client.read(file)).rejects.toBeInstanceOf(CallBudgetExceeded)
    expect(client.counters.httpCalls).toBe(1)
  })

  it('requires a key', () => {
    expect(() => new Docs2JsonClient({ apiKey: '', maxCalls: 1 })).toThrow('DOCS2JSON_API_KEY')
  })

  it('keeps docs2json typed error codes (503 ai_timeout) and retries them once', async () => {
    const body = JSON.stringify({ msg: 'La lectura tardó demasiado', code: 'ai_timeout' })
    const { fetch, calls } = fakeFetch([() => new Response(body, { status: 503 })])
    const client = new Docs2JsonClient({ apiKey: KEY, maxCalls: 5, fetchImpl: fetch, sleep: noSleep })
    const out = await client.read(file)
    expect(out).toMatchObject({ ok: false, status: 503, attempts: 2, error: 'HTTP 503 [ai_timeout]: La lectura tardó demasiado' })
    expect(out.retries).toEqual(['HTTP 503 [ai_timeout]: La lectura tardó demasiado'])
    expect(calls).toHaveLength(2)
  })
})

describe('httpError', () => {
  it('labels JSON codes and CloudFront HTML pages', () => {
    expect(httpError(503, '{"msg":"x","code":"ai_unavailable"}')).toBe('HTTP 503 [ai_unavailable]: x')
    expect(httpError(500, '{"msg":"boom"}')).toBe('HTTP 500: boom')
    expect(httpError(504, '<!DOCTYPE HTML><HTML><TITLE>ERROR: The request could not be satisfied</TITLE></HTML>')).toBe(
      'HTTP 504: respuesta HTML del proxy (ERROR: The request could not be satisfied)',
    )
  })
})
