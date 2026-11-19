/**
 * Which fields are scored for each doctype, and how each one is normalised.
 * Only fields that matter downstream (identity, income, dates, the AFP table)
 * are scored; free-text fields such as `antiguedad` are not.
 */
import { afpDeduction } from '../domain/payslip'
import { DOCTYPES, type Doctype } from '../domain/truth'

export { afpDeduction }
import {
  normalizeAmount,
  normalizeDate,
  normalizeInstitution,
  normalizeInteger,
  normalizeMonth,
  normalizeName,
  normalizeNationality,
  normalizeRut,
  normalizeSex,
  normalizeText,
} from '../domain/normalize'

export type Kind =
  | 'rut' | 'text' | 'name' | 'institution' | 'amount' | 'int'
  | 'date' | 'month' | 'sex' | 'nationality' | 'rows'

export type FieldSpec = {
  /** Name in the report: a docs2json field, `docdate`, or a derived value. */
  key: string
  kind: Kind
  /** How to read the raw value from a document; defaults to `fields[key]`. */
  read?: (doc: { fields: Record<string, unknown>; docdate?: string | null }) => unknown
  /** For `rows`: the canonical key of one row (rows are compared as multisets). */
  rowKey?: (row: Record<string, unknown>) => string | null
}

type Row = Record<string, unknown>

const asRows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === 'object') : [])

const amountRow = (r: Row) => {
  const v = normalizeAmount(r.value)
  return v === null ? null : String(v)
}

const docdate: FieldSpec = { key: 'docdate', kind: 'date', read: d => d.docdate }

export const FIELD_SPECS: Record<Doctype, FieldSpec[]> = {
  [DOCTYPES.idCard]: [
    { key: 'rut', kind: 'rut' },
    { key: 'nombres', kind: 'name' },
    { key: 'apellidos', kind: 'name' },
    { key: 'nacionalidad', kind: 'nationality' },
    { key: 'sexo', kind: 'sex' },
    { key: 'fecha_nacimiento', kind: 'date' },
    { key: 'fecha_emision', kind: 'date' },
    { key: 'fecha_vencimiento', kind: 'date' },
    docdate,
  ],
  [DOCTYPES.payslip]: [
    { key: 'rut', kind: 'rut' },
    { key: 'nombre', kind: 'name' },
    { key: 'empleador', kind: 'text' },
    { key: 'periodo', kind: 'month' },
    { key: 'dias_trabajados', kind: 'int' },
    { key: 'fecha_ingreso', kind: 'date' },
    { key: 'cargo', kind: 'text' },
    { key: 'institucion_previsional', kind: 'institution' },
    { key: 'institucion_salud', kind: 'institution' },
    { key: 'base_imponible', kind: 'amount' },
    { key: 'base_tributable', kind: 'amount' },
    { key: 'descuento_afp', kind: 'amount', read: d => afpDeduction(d.fields.descuentos) },
    { key: 'haberes', kind: 'rows', rowKey: amountRow },
    { key: 'descuentos', kind: 'rows', rowKey: amountRow },
    { ...docdate },
  ],
  [DOCTYPES.afpCertificate]: [
    { key: 'rut', kind: 'rut' },
    { key: 'nombre', kind: 'name' },
    { key: 'afp', kind: 'institution' },
    { key: 'periodo_desde', kind: 'month' },
    { key: 'periodo_hasta', kind: 'month' },
    { key: 'folio_certificacion', kind: 'text' },
    { key: 'codigo_validador', kind: 'text' },
    { key: 'meses_laguna', kind: 'int' },
    { key: 'lagunas_largas', kind: 'int' },
    { key: 'empleador_anterior', kind: 'int' },
    {
      key: 'cotizaciones',
      kind: 'rows',
      rowKey: r => {
        const month = normalizeMonth(r.periodo)
        const amount = normalizeAmount(r.monto)
        const payer = normalizeRut(r.rut_pagador)
        return month && amount !== null && payer ? `${month}|${amount}|${payer}` : null
      },
    },
    { ...docdate },
  ],
  [DOCTYPES.seniority]: [
    { key: 'rut', kind: 'rut' },
    { key: 'empleado', kind: 'name' },
    { key: 'empleador', kind: 'text' },
    { key: 'rut_empleador', kind: 'rut' },
    { key: 'cargo', kind: 'text' },
    { key: 'fecha_ingreso', kind: 'date' },
    { key: 'renta', kind: 'amount' },
  ],
}

export function readRaw(spec: FieldSpec, doc: { fields: Record<string, unknown>; docdate?: string | null }): unknown {
  return spec.read ? spec.read(doc) : doc.fields[spec.key]
}

/** Canonical value used for comparison: a string, a number or null. */
export function normalizeField(spec: FieldSpec, raw: unknown): string | number | null {
  switch (spec.kind) {
    case 'rut': return normalizeRut(raw)
    case 'text': return normalizeText(raw)
    case 'name': return normalizeName(raw)
    case 'institution': return normalizeInstitution(raw)
    case 'amount': return normalizeAmount(raw)
    case 'int': return normalizeInteger(raw)
    case 'date': return normalizeDate(raw)
    case 'month': return normalizeMonth(raw)
    case 'sex': return normalizeSex(raw)
    case 'nationality': return normalizeNationality(raw)
    case 'rows': {
      if (raw === null || raw === undefined) return null
      const keys = asRows(raw).map(r => spec.rowKey!(r) ?? '∅')
      return keys.length ? keys.sort().join(' ; ') : null
    }
  }
}

/** Multiset comparison of two normalised row lists. */
export function rowOverlap(expected: string | null, predicted: string | null): { expected: number; predicted: number; matched: number } {
  const split = (v: string | null) => (v ? v.split(' ; ') : [])
  const e = split(expected)
  const p = split(predicted)
  const pool = new Map<string, number>()
  for (const k of p) pool.set(k, (pool.get(k) ?? 0) + 1)
  let matched = 0
  for (const k of e) {
    const left = pool.get(k) ?? 0
    if (left > 0 && k !== '∅') {
      matched += 1
      pool.set(k, left - 1)
    }
  }
  return { expected: e.length, predicted: p.length, matched }
}
