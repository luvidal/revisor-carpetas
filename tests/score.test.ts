import { describe, expect, it } from 'vitest'
import type { ReadDocument } from '../src/docs2json/client'
import type { FolderTruth } from '../src/domain/truth'
import { compareRuns } from '../src/evals/consistency'
import { afpDeduction } from '../src/evals/fields'
import { classifyOutcome, errorLabel, matchDocuments, scoreRun, summarize, type RawRun } from '../src/evals/score'
import { percentile } from '../src/evals/stats'

const payslipFields = {
  empleador: 'Comercial Los Aromos SpA',
  nombre: 'Camila Andrea Soto Muñoz',
  rut: '117.843.226-1',
  periodo: '2026-10',
  dias_trabajados: 30,
  fecha_ingreso: '2019-08-01',
  cargo: 'Ejecutiva de Ventas',
  institucion_previsional: 'AFP Quillay',
  institucion_salud: 'Fonasa',
  base_imponible: 1263354,
  base_tributable: 1037216,
  haberes: [
    { label: 'Sueldo base', value: 1050000 },
    { label: 'Gratificación legal', value: 213354 },
  ],
  descuentos: [
    { label: 'Cotización AFP Quillay 11,22%', value: 141748, legalType: 'afp' },
    { label: 'Salud Fonasa 7%', value: 88435, legalType: 'salud' },
  ],
}

const truth: FolderTruth = {
  id: 'f99',
  subset: 'limpio',
  title: 'prueba',
  referenceDate: '2026-11-16',
  applicant: { name: 'Camila Andrea Soto Muñoz', rut: '117.843.226-1' },
  files: [
    {
      file: 'liquidaciones.pdf',
      mimeType: 'application/pdf',
      rendering: 'PDF vectorial',
      documents: [
        { doctype: 'liquidaciones-sueldo', pages: { start: 1, end: 1 }, docdate: '2026-09-01', fields: { ...payslipFields, periodo: '2026-09' } },
        { doctype: 'liquidaciones-sueldo', pages: { start: 2, end: 2 }, docdate: '2026-10-01', fields: payslipFields },
      ],
    },
  ],
  defects: [],
  expectedDecision: 'lista_para_analista',
  decisionReason: '',
}

const meta = { catalogVersion: 'abc', models: { classify: 'm1', extract: 'm1' } }

function rawRun(documents: ReadDocument[], tag = 'r1'): RawRun {
  return {
    runTag: tag,
    startedAt: '',
    finishedAt: '',
    results: [
      { folder: 'f99', file: 'liquidaciones.pdf', mimeType: 'application/pdf', ok: true, status: 200, latencyMs: 1000, attempts: 1, response: { documents, meta } },
    ],
  }
}

describe('matchDocuments', () => {
  it('pairs by page overlap, not by order', () => {
    const returned: ReadDocument[] = [
      { doctype: 'liquidaciones-sueldo', pages: { start: 2, end: 2 }, fields: {} },
      { doctype: 'liquidaciones-sueldo', pages: { start: 1, end: 1 }, fields: {} },
    ]
    const m = matchDocuments(truth.files[0]!.documents, returned)
    expect(m[0]).toBe(returned[1])
    expect(m[1]).toBe(returned[0])
  })

  it('leaves an expected document unmatched when the API returned fewer', () => {
    const returned: ReadDocument[] = [{ doctype: 'liquidaciones-sueldo', pages: { start: 1, end: 2 }, fields: {} }]
    const m = matchDocuments(truth.files[0]!.documents, returned)
    expect(m[0]).toBe(returned[0])
    expect(m[1]).toBeNull()
  })
})

describe('classifyOutcome', () => {
  it('separates wrong, missing and invented values', () => {
    expect(classifyOutcome('A', 'A')).toBe('correct')
    expect(classifyOutcome(null, null)).toBe('correct')
    expect(classifyOutcome('A', 'B')).toBe('wrong')
    expect(classifyOutcome('A', null)).toBe('missing')
    expect(classifyOutcome(null, 'B')).toBe('spurious')
  })
})

describe('afpDeduction', () => {
  it('prefers the legalType tag and falls back to the label', () => {
    expect(afpDeduction(payslipFields.descuentos)).toBe(141748)
    expect(afpDeduction([{ label: 'AFP Quillay', value: 5 }])).toBe(5)
    expect(afpDeduction([{ label: 'Salud', value: 5 }])).toBeNull()
  })
})

describe('scoreRun', () => {
  it('scores a perfect answer, tolerating format differences', () => {
    const returned: ReadDocument[] = [
      { doctype: 'liquidaciones-sueldo', pages: { start: 1, end: 1 }, docdate: '2026-09-01', fields: { ...payslipFields, periodo: 'Septiembre 2026', rut: '117843226-1' } },
      {
        doctype: 'liquidaciones-sueldo',
        pages: { start: 2, end: 2 },
        docdate: '2026-10-01',
        fields: { ...payslipFields, nombre: 'SOTO MUÑOZ CAMILA ANDREA', base_imponible: '$ 1.263.354', institucion_previsional: 'Quillay' },
      },
    ]
    const score = scoreRun([truth], rawRun(returned))
    const metrics = summarize(score)
    expect(metrics.classification.rate).toBe(1)
    expect(metrics.split.rate).toBe(1)
    expect(score.fields.filter(f => f.outcome !== 'correct')).toEqual([])
    expect(metrics.fields.overall.accuracy).toBe(1)
    expect(metrics.rows['liquidaciones-sueldo.haberes']).toMatchObject({ expected: 4, predicted: 4, matched: 4 })
  })

  it('counts wrong and missing fields, and list rows', () => {
    const returned: ReadDocument[] = [
      {
        doctype: 'liquidaciones-sueldo',
        pages: { start: 1, end: 1 },
        docdate: '2026-09-01',
        fields: { ...payslipFields, periodo: '2026-09', base_imponible: 1, cargo: null, haberes: [{ label: 'Sueldo base', value: 1050000 }] },
      },
      { doctype: 'cotizaciones-afp', pages: { start: 2, end: 2 }, fields: { afp: 'AFP Quillay' } },
    ]
    const score = scoreRun([truth], rawRun(returned))
    const metrics = summarize(score)
    expect(metrics.classification).toMatchObject({ correct: 1, total: 2 })
    expect(metrics.classification.confusion['liquidaciones-sueldo']).toEqual({ 'liquidaciones-sueldo': 1, 'cotizaciones-afp': 1 })
    const byField = Object.fromEntries(score.fields.map(f => [f.field, f.outcome]))
    expect(byField.base_imponible).toBe('wrong')
    expect(byField.cargo).toBe('missing')
    expect(byField.haberes).toBe('wrong')
    expect(metrics.rows['liquidaciones-sueldo.haberes']).toMatchObject({ expected: 2, predicted: 1, matched: 1, precision: 1, recall: 0.5 })
    // Fields of the misclassified document are not scored.
    expect(score.fields.every(f => f.index === 0)).toBe(true)
  })

  it('separates silent failures (availability) from extraction quality', () => {
    const returned: ReadDocument[] = [
      { doctype: 'liquidaciones-sueldo', pages: { start: 1, end: 1 }, confidence: 0, fields: {} },
      { doctype: null, pages: { start: 2, end: 2 }, fields: {} },
    ]
    const ok = summarize(scoreRun([truth], rawRun([returned[0]!, { doctype: 'liquidaciones-sueldo', pages: { start: 2, end: 2 }, docdate: '2026-10-01', fields: payslipFields }])))
    expect(ok.availability).toMatchObject({ correct: 1, total: 2, empty: 1 })
    expect(ok.silentFailures).toEqual([{ folder: 'f99', file: 'liquidaciones.pdf', index: 0, doctype: 'liquidaciones-sueldo', confidence: 0 }])
    // Quality is measured on the usable document only...
    expect(ok.classification).toMatchObject({ correct: 1, total: 1 })
    expect(ok.fields.overall.accuracy).toBe(1)
    // ...while end-to-end counts the empty one as a miss.
    expect(ok.endToEnd.classification).toMatchObject({ correct: 1, total: 2 })
    expect(ok.endToEnd.fields.rate).toBeCloseTo(0.5, 5)

    const bothEmpty = summarize(scoreRun([truth], rawRun(returned)))
    expect(bothEmpty.availability).toMatchObject({ correct: 0, empty: 2 })
    expect(bothEmpty.classification.total).toBe(0)
    expect(bothEmpty.classification.confusion['liquidaciones-sueldo']).toEqual({ '(vacío: falla silenciosa)': 2 })
  })

  it('treats an API failure as unclassified documents', () => {
    const run: RawRun = {
      runTag: 'r',
      startedAt: '',
      finishedAt: '',
      results: [{ folder: 'f99', file: 'liquidaciones.pdf', mimeType: 'application/pdf', ok: false, status: 500, latencyMs: 10, attempts: 2, error: 'HTTP 500' }],
    }
    const metrics = summarize(scoreRun([truth], run))
    expect(metrics.availability).toMatchObject({ correct: 0, total: 2, requestFailed: 2 })
    expect(metrics.endToEnd.classification).toMatchObject({ correct: 0, total: 2 })
    expect(metrics.calls).toMatchObject({ failed: 1, httpCalls: 2 })
    expect(metrics.latency.n).toBe(0)
  })
})

describe('compareRuns', () => {
  it('measures identical values and flags flaky ones', () => {
    const good: ReadDocument[] = truth.files[0]!.documents.map(d => ({ doctype: d.doctype, pages: d.pages, docdate: d.docdate, fields: d.fields }))
    const bad = structuredClone(good)
    bad[1]!.fields.cargo = 'Vendedora'
    const a = scoreRun([truth], rawRun(good, 'a'))
    const b = scoreRun([truth], rawRun(bad, 'b'))
    const c = compareRuns(a, b)
    expect(c.classification.rate).toBe(1)
    expect(c.fields.total).toBe(a.fields.length)
    expect(c.fields.same).toBe(a.fields.length - 1)
    expect(c.correctness.flaky).toBe(1)
    expect(c.unstable[0]).toMatchObject({ field: 'cargo', b: 'VENDEDORA' })
  })
})

describe('percentile', () => {
  it('uses nearest rank', () => {
    const values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6]
    expect(percentile(values, 50)).toBe(5)
    expect(percentile(values, 95)).toBe(10)
    expect(percentile([], 50)).toBe(0)
  })
})

describe('failure accounting', () => {
  it('labels errors by cause', () => {
    expect(errorLabel('HTTP 503 [ai_timeout]: tardó')).toBe('503 ai_timeout')
    expect(errorLabel('HTTP 504: <!DOCTYPE HTML PUBLIC')).toBe('504 del proxy')
    expect(errorLabel('HTTP 504: respuesta HTML del proxy (ERROR)')).toBe('504 del proxy')
    expect(errorLabel('HTTP 500: boom')).toBe('HTTP 500')
    expect(errorLabel('error de red: fetch failed (UND_ERR_SOCKET)')).toBe('error de red')
    expect(errorLabel('no se leyó: se alcanzó el tope de llamadas')).toBe('no leído (tope de llamadas)')
  })

  it('separates explicit failures, silent failures and recovered retries', () => {
    const second: FolderTruth = { ...truth, id: 'f98', files: [{ ...truth.files[0]!, file: 'otro.pdf' }] }
    const third: FolderTruth = { ...truth, id: 'f97', files: [{ ...truth.files[0]!, file: 'tercero.pdf' }] }
    const ok = (folder: string, file: string, attempts: number, retries?: string[]) => ({
      folder, file, mimeType: 'application/pdf', ok: true, status: 200, latencyMs: 1000, attempts,
      ...(retries ? { retries } : {}),
      response: { documents: [
        { doctype: 'liquidaciones-sueldo', pages: { start: 1, end: 1 }, fields: {} },
        { doctype: 'liquidaciones-sueldo', pages: { start: 2, end: 2 }, docdate: '2026-10-01', fields: payslipFields },
      ], meta },
    })
    const run: RawRun = {
      runTag: 'r', startedAt: '', finishedAt: '',
      results: [
        ok('f99', 'liquidaciones.pdf', 1),
        ok('f98', 'otro.pdf', 2, ['HTTP 503 [ai_timeout]: tardó']),
        { folder: 'f97', file: 'tercero.pdf', mimeType: 'application/pdf', ok: false, status: 503, latencyMs: 10, attempts: 2,
          retries: ['HTTP 503 [ai_unavailable]: x'], error: 'HTTP 503 [ai_timeout]: tardó' },
      ],
    }
    const f = summarize(scoreRun([truth, second, third], run)).failures
    expect(f.explicitFiles).toBe(1)
    expect(f.explicitByCause).toEqual({ '503 ai_timeout': 1 })
    expect(f.silentDocuments).toBe(2) // the empty first document of each successful file
    expect(f.failedAttempts).toBe(3)
    expect(f.failedAttemptsByCause).toEqual({ '503 ai_timeout': 2, '503 ai_unavailable': 1 })
    expect(f.recoveredByRetry).toBe(1)
  })
})
