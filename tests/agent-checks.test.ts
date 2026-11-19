import { describe, expect, it } from 'vitest'
import {
  checkCompleteness,
  checkDocuments,
  checkIdCardValidity,
  checkIdentity,
  checkPensionFund,
  checkReads,
  checkSalary,
  sameName,
} from '../src/agent/checks'
import { PROVISIONAL_POLICY, decide, monthsBefore } from '../src/agent/policy'
import type { Doc, Finding } from '../src/agent/types'
import { formatRut } from '../src/domain/rut'

const APPLICANT = { name: 'Camila Andrea Soto Muñoz', rut: formatRut(117_843_226) }
const doc = (doctype: string, fields: Record<string, unknown>, file = `${doctype}.pdf`, confidence: number | null = 0.99): Doc => ({
  file,
  index: 0,
  doctype,
  fields,
  docdate: null,
  confidence,
})
const payslip = (periodo: string, afp: number, extra: Record<string, unknown> = {}) =>
  doc('liquidaciones-sueldo', {
    rut: APPLICANT.rut,
    nombre: APPLICANT.name,
    periodo,
    institucion_previsional: 'AFP Quillay',
    descuentos: [{ label: 'Cotización AFP Quillay', value: afp, legalType: 'afp' }],
    ...extra,
  }, `liquidacion-${periodo}.pdf`)
const certificate = (rows: Array<[string, number]>, extra: Record<string, unknown> = {}) =>
  doc('cotizaciones-afp', {
    rut: APPLICANT.rut,
    nombre: APPLICANT.name,
    afp: 'AFP QUILLAY',
    cotizaciones: rows.map(([periodo, monto]) => ({ periodo, monto, rut_pagador: '176.512.384-0' })),
    ...extra,
  }, 'certificado-afp.pdf')
const idCard = (vence: string, extra: Record<string, unknown> = {}) =>
  doc('cedula-identidad', { rut: APPLICANT.rut, nombres: 'CAMILA ANDREA', apellidos: 'SOTO MUÑOZ', fecha_vencimiento: vence, ...extra }, 'cedula.png')
const codes = (f: Finding[]) => f.map(x => x.code)

describe('names', () => {
  it('tolerates word order and two misread letters, not a different first name', () => {
    expect(sameName('SOTO MUÑOZ CAMILA ANDREA', APPLICANT.name)).toBe(true)
    expect(sameName('Camila Andrea Soto Mufioz', APPLICANT.name)).toBe(true)
    expect(sameName('Javiera Antonia Vargas Espinoza', 'Catalina Belén Vargas Espinoza')).toBe(false)
  })
})

describe('checkReads and checkDocuments', () => {
  it('reports files that could not be read', () => {
    const f = checkReads([
      { file: 'a.pdf', status: 'leido', attempts: [], documents: [] },
      { file: 'b.pdf', status: 'no_leido', attempts: [{ attempt: 1, kind: 'transient', cause: '503 ai_timeout', latencyMs: 1, waitedMs: 0 }], documents: [], cause: '503 ai_timeout' },
    ])
    expect(codes(f)).toEqual(['lectura_fallida'])
    expect(f[0]!.message).toContain('b.pdf')
  })

  it('flags missing critical fields, low confidence and unknown doctypes', () => {
    const f = checkDocuments(
      [payslip('2026-10', 1, { rut: null }), doc('cedula-identidad', { rut: APPLICANT.rut, fecha_vencimiento: '2030-01-01' }, 'c.png', 0.4), doc('cartola-banco', {})],
      PROVISIONAL_POLICY,
    )
    expect(codes(f).sort()).toEqual(['baja_confianza', 'campo_ilegible', 'documento_no_reconocido'])
  })
})

describe('checkIdentity', () => {
  it('tells a misreading (invalid check digit) from another valid RUT', () => {
    const misread = payslip('2026-09', 1, { rut: '117.843.226-9' }) // wrong check digit (valid is 1)
    const other = payslip('2026-10', 1, { rut: formatRut(117_834_226) }) // valid, same name
    const { findings, owner } = checkIdentity([misread, other], APPLICANT)
    expect(codes(findings)).toEqual(['rut_ilegible', 'rut_distinto'])
    expect(owner.get(misread)).toBe('solicitante')
    expect(owner.get(other)).toBe('solicitante')
  })

  it('marks a document with another name and a valid RUT as someone else’s', () => {
    const sister = certificate([], { rut: formatRut(119_871_205), nombre: 'Javiera Antonia Soto Muñoz' })
    const { findings, owner } = checkIdentity([sister], APPLICANT)
    expect(codes(findings)).toEqual(['documento_de_otra_persona'])
    expect(owner.get(sister)).toBe('otra_persona')
  })

  it('distrusts an illegible RUT that comes with another name', () => {
    const { findings, owner } = checkIdentity([certificate([], { rut: '119.871.205-3', nombre: 'Pedro Pérez' })], APPLICANT)
    expect(codes(findings)).toEqual(['rut_ilegible_otro_nombre'])
    expect([...owner.values()]).toEqual(['dudoso'])
  })

  it('notes a different name under the applicant’s RUT', () => {
    expect(codes(checkIdentity([payslip('2026-10', 1, { nombre: 'Pedro Pérez' })], APPLICANT).findings)).toEqual(['nombre_distinto'])
  })
})

describe('folder checks', () => {
  const required = PROVISIONAL_POLICY.requiredDocuments('2026-11-16')

  it('requires the two months before the review month', () => {
    expect(monthsBefore('2026-11-16', 1)).toBe('2026-10')
    expect(monthsBefore('2026-01-05', 2)).toBe('2025-11')
    expect(required.map(r => r.period ?? r.doctype)).toEqual(['cedula-identidad', '2026-09', '2026-10', 'cotizaciones-afp'])
  })

  it('finds missing documents, unless files are unread or the doctype belongs to someone else', () => {
    const own = [idCard('2030-01-01'), payslip('2026-09', 1), payslip('2026-08', 1)]
    const f = checkCompleteness(own, required, { unreadFiles: 0, othersDoctypes: new Set() })
    expect(codes(f)).toEqual(['documento_faltante', 'documento_faltante', 'liquidacion_fuera_de_periodo'])
    expect(f[0]!.message).toBe('Falta liquidación de octubre de 2026.')
    expect(checkCompleteness(own, required, { unreadFiles: 1, othersDoctypes: new Set() })).toEqual([])
    expect(codes(checkCompleteness(own, required, { unreadFiles: 0, othersDoctypes: new Set(['cotizaciones-afp']) }))).not.toContain('documento_faltante:cotizaciones-afp')
  })

  it('checks the cédula against the review date', () => {
    expect(codes(checkIdCardValidity([idCard('2026-08-14')], '2026-11-16'))).toEqual(['cedula_vencida'])
    expect(checkIdCardValidity([idCard('14 AGO 2030')], '2026-11-16')).toEqual([])
  })

  it('compares the AFP deduction with the certificate within 2% or $1.000', () => {
    const cert = certificate([['09-2026', 141_748], ['10-2026', 141_748]])
    expect(checkSalary([payslip('2026-09', 141_748), payslip('2026-10', 142_500), cert], PROVISIONAL_POLICY)).toEqual([])
    const f = checkSalary([payslip('2026-09', 298_828), cert], PROVISIONAL_POLICY)
    expect(codes(f)).toEqual(['sueldo_no_cuadra'])
    expect(f[0]!.evidence.map(e => e.value)).toEqual([298_828, 141_748])
  })

  it('cannot verify the salary without the month or the deduction', () => {
    const cert = certificate([['08-2026', 100_000]])
    expect(codes(checkSalary([payslip('2026-09', 100_000)], PROVISIONAL_POLICY))).toEqual([]) // no certificate at all
    expect(codes(checkSalary([payslip('2026-09', 100_000), cert], PROVISIONAL_POLICY))).toEqual(['sueldo_sin_verificar'])
    expect(codes(checkSalary([payslip('2026-08', 100_000, { descuentos: [] }), cert], PROVISIONAL_POLICY))).toEqual(['sueldo_sin_verificar'])
  })

  it('notes a different pension fund on the payslip', () => {
    expect(checkPensionFund([payslip('2026-09', 1), certificate([])])).toEqual([])
    expect(codes(checkPensionFund([payslip('2026-09', 1, { institucion_previsional: 'AFP Cuprum' }), certificate([])]))).toEqual(['afp_no_coincide'])
  })
})

describe('decide', () => {
  const f = (code: Finding['code']): Finding => ({ code, message: 'x', evidence: [{ file: 'a' }] })
  it('escalate beats ask, ask beats ready, observations never decide', () => {
    expect(decide([], PROVISIONAL_POLICY).decision).toBe('lista_para_analista')
    expect(decide([f('afp_no_coincide')], PROVISIONAL_POLICY).decision).toBe('lista_para_analista')
    expect(decide([f('documento_faltante'), f('afp_no_coincide')], PROVISIONAL_POLICY).decision).toBe('pedir_documento')
    const both = decide([f('documento_faltante'), f('sueldo_no_cuadra')], PROVISIONAL_POLICY)
    expect(both.decision).toBe('escalar_a_persona')
    expect(both.reasons.map(r => r.rule.id)).toEqual(['P-05', 'P-01'])
  })

  it('covers every finding code with exactly one rule', () => {
    const all = PROVISIONAL_POLICY.rules.flatMap(r => r.codes)
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(15)
  })
})
