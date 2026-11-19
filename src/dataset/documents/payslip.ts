/** Synthetic payslip ("liquidación de sueldo"): one letter-size page per month. */
import { formatRut } from '../../domain/rut'
import { DOCTYPES, type ExpectedDocument } from '../../domain/truth'
import { clp, dmy, monthTitle } from '../format'
import { baseSalaryFor, employerRut, fullName, type Job, type Pension, type Person } from '../model'
import { computePayslip, healthLabel, type PayRow, type Payslip } from '../payroll'
import { GRAY, LIGHT_GRAY, NAVY, PageBuilder, markSynthetic, type Page } from '../render/layout'

export type PayslipArgs = {
  person: Person
  job: Job
  pension: Pension
  month: string
  /** Tampering: print this RUT body instead of the person's real one. */
  printedRutBody?: number
}

export type PayslipModel = { payslip: Payslip; rut: string; name: string; expected: ExpectedDocument }

/** The numbers and the ground truth of a payslip, shared by every template. */
export function payslipModel(args: PayslipArgs): PayslipModel {
  const { person, job, pension, month } = args
  const payslip = computePayslip({
    baseSalary: baseSalaryFor(job, month),
    extras: job.extras,
    meal: job.meal,
    transport: job.transport,
    afp: pension.afp,
    health: pension.health,
  })
  const rut = formatRut(args.printedRutBody ?? person.rutBody)
  const name = fullName(person)
  const expected: ExpectedDocument = {
    doctype: DOCTYPES.payslip,
    pages: { start: 1, end: 1 },
    docdate: `${month}-01`,
    fields: {
      empleador: job.employer.name,
      nombre: name,
      rut,
      periodo: month,
      dias_trabajados: 30,
      fecha_ingreso: job.startDate,
      cargo: job.position,
      institucion_previsional: pension.afp,
      institucion_salud: healthLabel(pension.health),
      base_imponible: payslip.taxableBase,
      base_tributable: payslip.incomeTaxBase,
      haberes: payslip.earnings.map(r => ({ label: r.label, value: r.value })),
      descuentos: payslip.deductions.map(r => ({
        label: r.label,
        value: r.value,
        ...(r.legalType ? { legalType: r.legalType } : {}),
      })),
    },
  }
  return { payslip, rut, name, expected }
}

/** Template A: two columns, HABERES and DESCUENTOS side by side. */
export function payslipDocument(args: PayslipArgs): { page: Page; expected: ExpectedDocument; payslip: Payslip } {
  const { job, pension, month } = args
  const { payslip, rut, name, expected } = payslipModel(args)
  const page = markSynthetic(new PageBuilder(612, 792))

  page.text(50, 52, job.employer.name, 13, { bold: true, color: NAVY })
  page.text(50, 66, `RUT empleador: ${employerRut(job.employer)}`, 9, { color: GRAY })
  page.text(50, 78, job.employer.address, 9, { color: GRAY })
  page.text(306, 110, 'LIQUIDACIÓN DE REMUNERACIONES', 14, { bold: true, align: 'center' })
  page.text(306, 127, `Período: ${monthTitle(month)}`, 11, { align: 'center' })

  page.rect(50, 138, 512, 74, { stroke: GRAY, strokeWidth: 0.6 })
  const left: Array<[string, string]> = [
    ['Nombre', name],
    ['RUT', rut],
    ['Cargo', job.position],
    ['Fecha de ingreso', dmy(job.startDate)],
  ]
  const right: Array<[string, string]> = [
    ['Días trabajados', '30'],
    ['AFP', pension.afp],
    ['Salud', healthLabel(pension.health)],
    ['Contrato', 'Indefinido'],
  ]
  left.forEach(([k, v], i) => {
    page.text(58, 154 + i * 16, `${k}:`, 9, { bold: true })
    page.text(140, 154 + i * 16, v, 9)
  })
  right.forEach(([k, v], i) => {
    page.text(340, 154 + i * 16, `${k}:`, 9, { bold: true })
    page.text(430, 154 + i * 16, v, 9)
  })

  const top = 232
  const rowH = 16
  page.rect(50, top, 250, 18, { fill: LIGHT_GRAY })
  page.rect(312, top, 250, 18, { fill: LIGHT_GRAY })
  page.text(58, top + 13, 'HABERES', 10, { bold: true })
  page.text(320, top + 13, 'DESCUENTOS', 10, { bold: true })
  const rows = (list: PayRow[], x: number, amountX: number) =>
    list.forEach((r, i) => {
      page.text(x, top + 34 + i * rowH, r.label, 9)
      page.text(amountX, top + 34 + i * rowH, clp(r.value), 9, { align: 'right' })
    })
  rows(payslip.earnings, 58, 292)
  rows(payslip.deductions, 320, 554)

  const totalsY = top + 34 + Math.max(payslip.earnings.length, payslip.deductions.length) * rowH + 8
  page.line(50, totalsY - 10, 300, totalsY - 10)
  page.line(312, totalsY - 10, 562, totalsY - 10)
  const totals: Array<[string, number]> = [
    ['Total imponible', payslip.taxableBase],
    ['Total no imponible', payslip.nonTaxable],
    ['Total haberes', payslip.totalEarnings],
  ]
  totals.forEach(([k, v], i) => {
    page.text(58, totalsY + 4 + i * rowH, k, 9, { bold: true })
    page.text(292, totalsY + 4 + i * rowH, clp(v), 9, { bold: true, align: 'right' })
  })
  page.text(320, totalsY + 4, 'Total descuentos', 9, { bold: true })
  page.text(554, totalsY + 4, clp(payslip.totalDeductions), 9, { bold: true, align: 'right' })
  page.text(320, totalsY + 4 + rowH, 'Base tributable', 9, { bold: true })
  page.text(554, totalsY + 4 + rowH, clp(payslip.incomeTaxBase), 9, { bold: true, align: 'right' })

  const netY = totalsY + 4 + 3 * rowH + 18
  page.rect(312, netY - 14, 250, 22, { fill: LIGHT_GRAY })
  page.text(320, netY + 1, 'LÍQUIDO A PERCIBIR', 11, { bold: true })
  page.text(554, netY + 1, clp(payslip.net), 11, { bold: true, align: 'right' })

  page.line(80, 690, 260, 690)
  page.line(352, 690, 532, 690)
  page.text(170, 703, 'Firma empleador', 8, { align: 'center', color: GRAY })
  page.text(442, 703, 'Recibí conforme, trabajador', 8, { align: 'center', color: GRAY })

  return { page: page.build(), expected, payslip }
}
