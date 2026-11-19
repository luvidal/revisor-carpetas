/**
 * The evaluation policy, as an interface. Today: the provisional rules of the
 * dataset, written here with an id and a text each. Phase 3 replaces this
 * module with one that retrieves the rules from a written policy (RAG) and
 * cites them; the agent only depends on the `Policy` interface.
 */
import { DOCTYPES, type Decision, type Doctype } from '../domain/truth'
import type { Finding, FindingCode, Reason, Severity } from './types'

export type PolicyRule = {
  id: string
  title: string
  text: string
  severity: Severity
  codes: FindingCode[]
  /** Where the rule was found, when it comes from a written policy. */
  citation?: { source: string; excerpt: string; rank: number }
}

/** A document the folder must contain. */
export type Requirement = { doctype: Doctype; period?: string; label: string }

export interface Policy {
  readonly id: string
  readonly version: string
  /** The rule that governs a kind of finding (and therefore its severity). */
  ruleFor(code: FindingCode): PolicyRule
  readonly thresholds: {
    /** Below this docs2json confidence, a document is not trusted. */
    minConfidence: number
    /** AFP contribution on the payslip vs the certificate: allowed difference. */
    salaryTolerance: { relative: number; absolute: number }
  }
  requiredDocuments(referenceDate: string): Requirement[]
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** The `n`-th month before the month of `date` ("2026-11-16", 1 -> "2026-10"). */
export function monthsBefore(date: string, n: number): string {
  const [y, m] = date.split('-').map(Number) as [number, number]
  const index = y * 12 + (m - 1) - n
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return `${MONTHS[m - 1]} de ${y}`
}

/** Cédula, the last `months` payslips before the review month, and the AFP certificate. */
export function requiredFor(referenceDate: string, months: number, afpMonths: number): Requirement[] {
  const payslips = Array.from({ length: months }, (_, i) => monthsBefore(referenceDate, months - i))
  return [
    { doctype: DOCTYPES.idCard, label: 'cédula de identidad' },
    ...payslips.map(p => ({ doctype: DOCTYPES.payslip, period: p, label: `liquidación de ${monthName(p)}` })),
    { doctype: DOCTYPES.afpCertificate, label: `certificado de cotizaciones AFP de los últimos ${afpMonths} meses` },
  ]
}

export const PROVISIONAL_POLICY: Policy & { rules: PolicyRule[] } = {
  id: 'politica-provisional-dataset',
  version: '2026-11-19',
  thresholds: { minConfidence: 0.8, salaryTolerance: { relative: 0.02, absolute: 1_000 } },
  requiredDocuments(referenceDate) {
    return requiredFor(referenceDate, 2, 12)
  },
  ruleFor(code) {
    const rule = this.rules.find(r => r.codes.includes(code))
    if (!rule) throw new Error(`La política ${this.id} no cubre el hallazgo ${code}`)
    return rule
  },
  rules: [
    {
      id: 'P-01',
      title: 'Documentos mínimos',
      text: 'La carpeta debe traer la cédula de identidad, las liquidaciones de los dos meses anteriores al mes de revisión y el certificado de cotizaciones AFP de los últimos 12 meses. Si falta alguno, se pide al solicitante.',
      severity: 'pedir',
      codes: ['documento_faltante'],
    },
    {
      id: 'P-02',
      title: 'Cédula vigente',
      text: 'La cédula debe estar vigente en la fecha de revisión. Si está vencida, se pide la cédula vigente.',
      severity: 'pedir',
      codes: ['cedula_vencida'],
    },
    {
      id: 'P-03',
      title: 'Documentos del solicitante',
      text: 'Todos los documentos deben ser del solicitante. Un documento con otro nombre y otro RUT es de otra persona: se pide el correcto.',
      severity: 'pedir',
      codes: ['documento_de_otra_persona'],
    },
    {
      id: 'P-04',
      title: 'Identidad consistente',
      text: 'Un documento con el nombre del solicitante y otro RUT válido puede ser un error del emisor o una alteración. Lo revisa una persona.',
      severity: 'escalar',
      codes: ['rut_distinto'],
    },
    {
      id: 'P-05',
      title: 'Ingresos respaldados por las cotizaciones',
      text: 'La cotización AFP descontada en cada liquidación debe coincidir con la pagada ese mes según el certificado, con una tolerancia de 2% o $ 1.000. Si no coincide, los ingresos declarados no están respaldados y lo revisa una persona.',
      severity: 'escalar',
      codes: ['sueldo_no_cuadra'],
    },
    {
      id: 'P-06',
      title: 'Lectura confiable',
      text: 'No se decide a ciegas. Si un documento no se pudo leer, le falta un dato necesario, se leyó con baja confianza o trae un RUT ilegible con otro nombre, lo revisa una persona.',
      severity: 'escalar',
      codes: ['lectura_fallida', 'campo_ilegible', 'baja_confianza', 'rut_ilegible_otro_nombre'],
    },
    {
      id: 'P-07',
      title: 'Observaciones para el analista',
      text: 'Diferencias que no cambian la decisión pero el analista debe ver: un RUT ilegible que el resto de la carpeta confirma, la AFP distinta entre liquidación y certificado, diferencias de nombre con el mismo RUT, ingresos que no se pudieron verificar, liquidaciones de otros meses y documentos que no son de los tipos esperados.',
      severity: 'observar',
      codes: ['rut_ilegible', 'afp_no_coincide', 'nombre_distinto', 'sueldo_sin_verificar', 'liquidacion_fuera_de_periodo', 'documento_no_reconocido'],
    },
  ],
}

/** Findings that come from not being able to read, not from the documents' content. */
export const READING_CODES: FindingCode[] = ['lectura_fallida', 'campo_ilegible', 'baja_confianza', 'rut_ilegible_otro_nombre']

const RANK: Record<Severity, number> = { escalar: 0, pedir: 1, observar: 2 }

/** Escalate beats ask, ask beats ready. Every finding is kept, with the rule that ruled on it. */
export function decide(findings: Finding[], policy: Policy): { decision: Decision; reasons: Reason[]; observations: Reason[] } {
  const ruled: Reason[] = findings
    .map(f => {
      const rule = policy.ruleFor(f.code)
      const message = f.message.charAt(0).toUpperCase() + f.message.slice(1)
      return {
        ...f,
        message,
        severity: rule.severity,
        rule: { id: rule.id, title: rule.title, ...(rule.citation ? { citation: rule.citation } : {}) },
      }
    })
    .sort((a, b) => RANK[a.severity] - RANK[b.severity])
  const reasons = ruled.filter(r => r.severity !== 'observar')
  const observations = ruled.filter(r => r.severity === 'observar')
  const decision: Decision = reasons.some(r => r.severity === 'escalar')
    ? 'escalar_a_persona'
    : reasons.length
      ? 'pedir_documento'
      : 'lista_para_analista'
  return { decision, reasons, observations }
}
