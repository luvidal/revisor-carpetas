/**
 * Synthetic AFP contributions certificate ("certificado de cotizaciones"):
 * a 12-month table of contributions, each tied to the employer that paid it.
 */
import { formatRut } from '../../domain/rut'
import { DOCTYPES, type ExpectedDocument } from '../../domain/truth'
import { clp, dmy, mmYyyy, monthRange, monthsBetween } from '../format'
import { baseSalaryFor, employerRut, fullName, jobActiveIn, type Job, type Pension, type Person } from '../model'
import { computePayslip } from '../payroll'
import { GRAY, LIGHT_GRAY, NAVY, PageBuilder, markSynthetic, type Page } from '../render/layout'

export type AfpArgs = {
  person: Person
  pension: Pension
  /** Jobs that paid contributions; the one active in a month pays it. */
  jobs: Job[]
  from: string
  to: string
  /** Months with no contribution at all. */
  gapMonths?: string[]
  issued: string
  folio: string
  validationCode: string
}

type Row = { month: string; taxable: number; amount: number; payer: string }

export function contributionRows(args: Pick<AfpArgs, 'jobs' | 'pension' | 'from' | 'to' | 'gapMonths'>): Row[] {
  const rows: Row[] = []
  for (const month of monthRange(args.from, args.to)) {
    if (args.gapMonths?.includes(month)) continue
    const job = args.jobs.find(j => jobActiveIn(j, month))
    if (!job) continue
    const slip = computePayslip({
      baseSalary: baseSalaryFor(job, month),
      extras: job.extras,
      meal: job.meal,
      transport: job.transport,
      afp: args.pension.afp,
      health: args.pension.health,
    })
    rows.push({ month, taxable: slip.taxableBase, amount: slip.afpAmount, payer: employerRut(job.employer) })
  }
  return rows
}

/** Gap statistics as the docs2json catalog defines them. */
export function gapStats(rows: Row[], from: string, to: string): { gapMonths: number; longGaps: number } {
  const paid = new Set(rows.map(r => r.month))
  let gapMonths = 0
  let longGaps = 0
  let run = 0
  for (const month of monthRange(from, to)) {
    if (paid.has(month)) {
      if (run > 2) longGaps += 1
      run = 0
    } else {
      gapMonths += 1
      run += 1
    }
  }
  if (run > 2) longGaps += 1
  return { gapMonths, longGaps }
}

/** Months since the previous employer's last contribution, or null with one payer. */
export function previousEmployerMonths(rows: Row[]): number | null {
  const latest = rows.at(-1)
  if (!latest) return null
  const previous = rows.filter(r => r.payer !== latest.payer).at(-1)
  return previous ? monthsBetween(previous.month, latest.month) : null
}

export function afpDocument(args: AfpArgs): { page: Page; expected: ExpectedDocument; rows: Row[] } {
  const { person, pension } = args
  const rows = contributionRows(args)
  const page = markSynthetic(new PageBuilder(612, 792))
  const rut = formatRut(person.rutBody)

  page.text(50, 58, pension.afp.toUpperCase(), 20, { bold: true, color: NAVY })
  page.text(50, 72, 'Administradora de Fondos de Pensiones (institución ficticia)', 8, { color: GRAY })
  page.text(306, 104, 'CERTIFICADO DE COTIZACIONES PREVISIONALES', 13, { bold: true, align: 'center' })

  const info: Array<[string, string]> = [
    ['Nombre afiliado', fullName(person)],
    ['RUT', rut],
    ['Fecha de emisión', dmy(args.issued)],
    ['Folio', args.folio],
    ['Código validador', args.validationCode],
    ['Período', `desde ${mmYyyy(args.from)} hasta ${mmYyyy(args.to)}`],
  ]
  info.forEach(([k, v], i) => {
    page.text(58, 132 + i * 15, `${k}:`, 9, { bold: true })
    page.text(160, 132 + i * 15, v, 9)
  })

  const top = 232
  const cols = { period: 58, type: 120, taxable: 340, amount: 440, payer: 554 }
  page.rect(50, top, 512, 18, { fill: LIGHT_GRAY })
  page.text(cols.period, top + 13, 'Período', 9, { bold: true })
  page.text(cols.type, top + 13, 'Tipo de movimiento', 9, { bold: true })
  page.text(cols.taxable, top + 13, 'Renta imponible', 9, { bold: true, align: 'right' })
  page.text(cols.amount, top + 13, 'Monto cotización', 9, { bold: true, align: 'right' })
  page.text(cols.payer, top + 13, 'RUT empleador', 9, { bold: true, align: 'right' })
  rows.forEach((r, i) => {
    const y = top + 34 + i * 17
    page.text(cols.period, y, mmYyyy(r.month), 9)
    page.text(cols.type, y, 'COTIZACIÓN NORMAL', 9)
    page.text(cols.taxable, y, clp(r.taxable), 9, { align: 'right' })
    page.text(cols.amount, y, clp(r.amount), 9, { align: 'right' })
    page.text(cols.payer, y, r.payer, 9, { align: 'right' })
    page.line(50, y + 5, 562, y + 5, LIGHT_GRAY, 0.5)
  })
  const noteY = top + 34 + rows.length * 17 + 24
  page.text(50, noteY, 'Los períodos sin fila no registran cotizaciones pagadas ni declaradas.', 8, { color: GRAY })
  page.text(50, noteY + 12, 'Certificado emitido a solicitud del afiliado.', 8, { color: GRAY })

  const { gapMonths, longGaps } = gapStats(rows, args.from, args.to)
  const expected: ExpectedDocument = {
    doctype: DOCTYPES.afpCertificate,
    pages: { start: 1, end: 1 },
    docdate: `${rows.at(-1)!.month}-01`,
    fields: {
      afp: pension.afp,
      nombre: fullName(person),
      rut,
      periodo_desde: mmYyyy(args.from),
      periodo_hasta: mmYyyy(args.to),
      folio_certificacion: args.folio,
      codigo_validador: args.validationCode,
      meses_laguna: gapMonths,
      lagunas_largas: longGaps,
      empleador_anterior: previousEmployerMonths(rows),
      cotizaciones: rows.map(r => ({ periodo: mmYyyy(r.month), tipo: 'normal', monto: r.amount, rut_pagador: r.payer })),
    },
  }
  return { page: page.build(), expected, rows }
}
