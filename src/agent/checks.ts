/**
 * Validations and cross-checks. Each one is a pure function from documents to
 * findings, tested on its own. None of them decides: the policy does.
 */
import { normalizeAmount, normalizeDate, normalizeInstitution, normalizeMonth, normalizeName } from '../domain/normalize'
import { afpDeduction } from '../domain/payslip'
import { formatRut, isValidRut, normalizeRut } from '../domain/rut'
import { DOCTYPES } from '../domain/truth'
import { monthName, type Policy, type Requirement } from './policy'
import type { Doc, FileRead, Finding } from './types'

const KNOWN = new Set<string>(Object.values(DOCTYPES))

const LABEL: Record<string, string> = {
  [DOCTYPES.idCard]: 'la cédula',
  [DOCTYPES.payslip]: 'la liquidación',
  [DOCTYPES.afpCertificate]: 'el certificado AFP',
  [DOCTYPES.seniority]: 'el certificado de antigüedad',
}
const label = (d: Doc) => `${LABEL[d.doctype] ?? 'el documento'} (${d.file})`
const fmt = (n: number) => `$ ${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
const blank = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

/** The holder's name as each doctype prints it. */
export function holderName(d: Doc): string | null {
  const f = d.fields
  const raw = d.doctype === DOCTYPES.idCard ? [f.nombres, f.apellidos].filter(Boolean).join(' ') : (f.nombre ?? f.empleado)
  return typeof raw === 'string' && raw.trim() ? raw : null
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]!
}

/** Same person's name: same words in any order, tolerating two misread letters. */
export function sameName(a: unknown, b: unknown): boolean {
  const x = normalizeName(a)
  const y = normalizeName(b)
  if (!x || !y) return false
  return x === y || levenshtein(x, y) <= 2
}

// ---------------------------------------------------------------- readings

export function checkReads(reads: FileRead[]): Finding[] {
  return reads
    .filter(r => r.status === 'no_leido')
    .map(r => ({
      code: 'lectura_fallida' as const,
      message: `No se pudo leer ${r.file} después de ${r.attempts.length} intento(s): ${r.cause ?? 'sin detalle'}.`,
      evidence: [{ file: r.file, value: r.cause ?? null }],
    }))
}

const CRITICAL: Record<string, string[]> = {
  [DOCTYPES.idCard]: ['rut', 'fecha_vencimiento'],
  [DOCTYPES.payslip]: ['rut', 'periodo'],
  [DOCTYPES.afpCertificate]: ['rut', 'cotizaciones'],
  [DOCTYPES.seniority]: ['rut'],
}

/** Per document: known type, the fields the review needs, enough confidence. */
export function checkDocuments(docs: Doc[], policy: Policy): Finding[] {
  const out: Finding[] = []
  for (const d of docs) {
    if (!KNOWN.has(d.doctype)) {
      out.push({ code: 'documento_no_reconocido', message: `${d.file} es de un tipo que la revisión no usa (${d.doctype}).`, evidence: [{ file: d.file, doctype: d.doctype }] })
      continue
    }
    for (const field of CRITICAL[d.doctype] ?? []) {
      if (blank(d.fields[field])) {
        out.push({ code: 'campo_ilegible', message: `No se pudo leer el campo «${field}» de ${label(d)}.`, evidence: [{ file: d.file, doctype: d.doctype, field }] })
      }
    }
    if (d.confidence !== null && d.confidence < policy.thresholds.minConfidence) {
      out.push({
        code: 'baja_confianza',
        message: `La lectura de ${label(d)} vino con confianza ${String(d.confidence).replace('.', ',')}, bajo el mínimo de ${String(policy.thresholds.minConfidence).replace('.', ',')}: el dato no es confiable.`,
        evidence: [{ file: d.file, doctype: d.doctype, field: 'confidence', value: d.confidence, reference: policy.thresholds.minConfidence }],
      })
    }
  }
  return out
}

// ---------------------------------------------------------------- identity

export type Owner = 'solicitante' | 'otra_persona' | 'dudoso'

/**
 * Whose document is it? The check digit separates a misreading from another
 * person: an invalid digit cannot be a real RUT, a valid different one can.
 */
export function checkIdentity(docs: Doc[], applicant: { name: string; rut: string }): { findings: Finding[]; owner: Map<Doc, Owner> } {
  const findings: Finding[] = []
  const owner = new Map<Doc, Owner>()
  const declared = normalizeRut(applicant.rut)
  for (const d of docs.filter(x => KNOWN.has(x.doctype))) {
    const rut = normalizeRut(d.fields.rut)
    const name = holderName(d)
    const nameMatches = name === null ? null : sameName(name, applicant.name)
    const ev = { file: d.file, doctype: d.doctype, field: 'rut', value: d.fields.rut ?? null, reference: applicant.rut }
    if (!rut) {
      owner.set(d, nameMatches === false ? 'dudoso' : 'solicitante') // the missing RUT is reported by checkDocuments
      continue
    }
    if (rut === declared) {
      owner.set(d, 'solicitante')
      if (nameMatches === false) {
        findings.push({
          code: 'nombre_distinto',
          message: `${label(d)} tiene el RUT del solicitante pero el nombre «${name}» en vez de «${applicant.name}».`,
          evidence: [{ file: d.file, doctype: d.doctype, field: 'nombre', value: name, reference: applicant.name }],
        })
      }
      continue
    }
    if (!isValidRut(rut)) {
      if (nameMatches !== false) {
        owner.set(d, 'solicitante')
        findings.push({
          code: 'rut_ilegible',
          message: `${label(d)} trae el RUT ${String(d.fields.rut)}, con dígito verificador inválido: es un error de lectura. El nombre y el resto de la carpeta confirman al solicitante.`,
          evidence: [ev],
        })
      } else {
        owner.set(d, 'dudoso')
        findings.push({
          code: 'rut_ilegible_otro_nombre',
          message: `${label(d)} trae un RUT ilegible (${String(d.fields.rut)}) y el nombre «${name}», que no es el del solicitante.`,
          evidence: [ev],
        })
      }
      continue
    }
    if (nameMatches === false) {
      owner.set(d, 'otra_persona')
      findings.push({
        code: 'documento_de_otra_persona',
        message: `${label(d)} es de otra persona: ${name}, RUT ${formatRut(Number(rut.split('-')[0]), rut.split('-')[1])}. Se pide el documento del solicitante.`,
        evidence: [ev, { file: d.file, doctype: d.doctype, field: 'nombre', value: name, reference: applicant.name }],
      })
    } else {
      owner.set(d, 'solicitante')
      findings.push({
        code: 'rut_distinto',
        message: `${label(d)} tiene el nombre del solicitante pero el RUT ${String(d.fields.rut)}, distinto de ${applicant.rut} y con dígito verificador válido: posible error del emisor o alteración.`,
        evidence: [ev],
      })
    }
  }
  return { findings, owner }
}

// ------------------------------------------------------------- the folder

export function payslipPeriod(d: Doc): string | null {
  return normalizeMonth(d.fields.periodo) ?? (d.docdate ? normalizeMonth(d.docdate) : null)
}

/**
 * Required documents present among the applicant's own. Skipped when files
 * could not be read (their type is unknown) and for a doctype already reported
 * as someone else's document.
 */
export function checkCompleteness(own: Doc[], requirements: Requirement[], ctx: { unreadFiles: number; othersDoctypes: Set<string> }): Finding[] {
  if (ctx.unreadFiles > 0) return []
  const out: Finding[] = []
  for (const req of requirements) {
    if (ctx.othersDoctypes.has(req.doctype)) continue
    const present = own.some(d => d.doctype === req.doctype && (!req.period || payslipPeriod(d) === req.period))
    if (!present) out.push({ code: 'documento_faltante', message: `Falta ${req.label}.`, evidence: [{ file: '(carpeta)', doctype: req.doctype, ...(req.period ? { field: 'periodo', reference: req.period } : {}) }] })
  }
  const periods = new Set(requirements.filter(r => r.period).map(r => r.period))
  for (const d of own.filter(x => x.doctype === DOCTYPES.payslip)) {
    const p = payslipPeriod(d)
    if (p && !periods.has(p)) {
      out.push({ code: 'liquidacion_fuera_de_periodo', message: `${label(d)} es de ${monthName(p)}, fuera de los meses que se revisan.`, evidence: [{ file: d.file, doctype: d.doctype, field: 'periodo', value: p }] })
    }
  }
  return out
}

export function checkIdCardValidity(own: Doc[], referenceDate: string): Finding[] {
  const out: Finding[] = []
  for (const d of own.filter(x => x.doctype === DOCTYPES.idCard)) {
    const expires = normalizeDate(d.fields.fecha_vencimiento)
    if (expires && expires < referenceDate) {
      out.push({
        code: 'cedula_vencida',
        message: `La cédula venció el ${expires}, antes de la fecha de revisión (${referenceDate}).`,
        evidence: [{ file: d.file, doctype: d.doctype, field: 'fecha_vencimiento', value: expires, reference: referenceDate }],
      })
    }
  }
  return out
}

/** Contributions per month on the certificate (normal and independent rows add up). */
function contributions(cert: Doc): Map<string, number> {
  const out = new Map<string, number>()
  for (const row of Array.isArray(cert.fields.cotizaciones) ? (cert.fields.cotizaciones as Array<Record<string, unknown>>) : []) {
    const month = normalizeMonth(row.periodo)
    const amount = normalizeAmount(row.monto)
    if (month && amount !== null) out.set(month, (out.get(month) ?? 0) + amount)
  }
  return out
}

/**
 * Salary vs contributions: the AFP deduction printed on each payslip must match
 * what the certificate says was paid that month, within the policy tolerance.
 */
export function checkSalary(own: Doc[], policy: Policy): Finding[] {
  const cert = own.find(d => d.doctype === DOCTYPES.afpCertificate)
  if (!cert) return []
  const paid = contributions(cert)
  const { relative, absolute } = policy.thresholds.salaryTolerance
  const out: Finding[] = []
  for (const d of own.filter(x => x.doctype === DOCTYPES.payslip)) {
    const month = payslipPeriod(d)
    const deducted = normalizeAmount(afpDeduction(d.fields.descuentos))
    const onCertificate = month ? paid.get(month) : undefined
    if (!month || deducted === null || onCertificate === undefined) {
      out.push({
        code: 'sueldo_sin_verificar',
        message: `No se pudo comparar ${label(d)} con el certificado AFP: ${deducted === null ? 'no se leyó la cotización AFP descontada' : `el certificado no trae ${month ? monthName(month) : 'ese mes'}`}.`,
        evidence: [{ file: d.file, doctype: d.doctype, field: 'descuento_afp', value: deducted }, { file: cert.file, doctype: cert.doctype, field: 'cotizaciones', reference: month }],
      })
      continue
    }
    const tolerance = Math.max(absolute, relative * onCertificate)
    if (Math.abs(deducted - onCertificate) > tolerance) {
      out.push({
        code: 'sueldo_no_cuadra',
        message: `${label(d)} descuenta ${fmt(deducted)} de cotización AFP en ${monthName(month)}, pero el certificado registra ${fmt(onCertificate)} pagados ese mes (tolerancia ${fmt(Math.round(tolerance))}).`,
        evidence: [
          { file: d.file, doctype: d.doctype, field: 'descuento_afp', value: deducted },
          { file: cert.file, doctype: cert.doctype, field: `cotizaciones[${month}]`, value: onCertificate },
        ],
      })
    }
  }
  return out
}

export function checkPensionFund(own: Doc[]): Finding[] {
  const cert = own.find(d => d.doctype === DOCTYPES.afpCertificate)
  const fund = normalizeInstitution(cert?.fields.afp)
  if (!cert || !fund) return []
  return own
    .filter(d => d.doctype === DOCTYPES.payslip)
    .filter(d => {
      const onPayslip = normalizeInstitution(d.fields.institucion_previsional)
      return onPayslip !== null && onPayslip !== fund
    })
    .map(d => ({
      code: 'afp_no_coincide' as const,
      message: `${label(d)} dice ${String(d.fields.institucion_previsional)}, pero el certificado es de ${String(cert.fields.afp)}. Puede ser un error de lectura o un cambio de AFP.`,
      evidence: [
        { file: d.file, doctype: d.doctype, field: 'institucion_previsional', value: d.fields.institucion_previsional },
        { file: cert.file, doctype: cert.doctype, field: 'afp', value: cert.fields.afp },
      ],
    }))
}
