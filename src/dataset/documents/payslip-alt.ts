/**
 * Template B: a payslip from "another payroll system". Same numbers and ground
 * truth as template A, different layout and wording: a single table with
 * code / concept / earnings / deductions columns, abbreviated labels, the month
 * as "10/2026" and the net pay called "Alcance líquido".
 */
import type { ExpectedDocument } from '../../domain/truth'
import { clp, dmy, mmYyyy } from '../format'
import { employerRut } from '../model'
import { healthLabel, type Payslip } from '../payroll'
import { GRAY, LIGHT_GRAY, NAVY, PageBuilder, markSynthetic, type Page } from '../render/layout'
import { payslipModel, type PayslipArgs } from './payslip'

/** Labels as a different payroll system would print them. */
function altLabel(label: string): string {
  return label
    .replace(/^Sueldo base$/, 'Sueldo base mensual')
    .replace(/^Gratificación legal$/, 'Gratificación Art. 50')
    .replace(/^Colación$/, 'Asig. colación')
    .replace(/^Movilización$/, 'Asig. movilización')
    .replace(/^Cotización (AFP .+?) [\d,]+%$/, 'Cotiz. obligatoria $1')
    .replace(/^Salud (.+) 7%$/, 'Cotiz. salud $1')
    .replace(/^Seguro de cesantía 0,6%$/, 'Seguro cesantía (AFC) trab.')
    .replace(/^Impuesto único 2a categoría$/, 'Impuesto único')
}

export function payslipAltDocument(args: PayslipArgs): { page: Page; expected: ExpectedDocument; payslip: Payslip } {
  const { job, pension, month } = args
  const { payslip, rut, name, expected } = payslipModel(args)
  const page = markSynthetic(new PageBuilder(612, 792))
  const initials = job.employer.name
    .split(/\s+/)
    .filter(w => /^[A-ZÁÉÍÓÚÑ]/.test(w))
    .slice(0, 2)
    .map(w => w[0])
    .join('')

  page.rect(40, 40, 54, 54, { fill: NAVY })
  page.text(67, 74, initials, 20, { bold: true, color: [1, 1, 1], align: 'center' })
  page.text(104, 56, job.employer.name.toUpperCase(), 11, { bold: true })
  page.text(104, 70, `R.U.T. ${employerRut(job.employer)}`, 8, { color: GRAY })
  page.text(104, 82, job.employer.address, 8, { color: GRAY })
  page.text(572, 56, 'COMPROBANTE DE PAGO', 12, { bold: true, align: 'right' })
  page.text(572, 70, 'DE REMUNERACIONES', 12, { bold: true, align: 'right' })
  page.text(572, 86, `Mes de remuneración: ${mmYyyy(month).replace('-', '/')}`, 9, { align: 'right' })

  // Employee grid: three columns, label above value.
  const grid: Array<[string, string]> = [
    ['Trabajador', name],
    ['R.U.T.', rut],
    ['Cargo', job.position],
    ['Fecha ingreso', dmy(job.startDate)],
    ['Previsión', pension.afp],
    ['Salud', healthLabel(pension.health)],
    ['Días trabajados', '30'],
    ['Tipo de contrato', 'Plazo indefinido'],
    ['Centro de costo', 'Administración'],
  ]
  grid.forEach(([k, v], i) => {
    const x = 40 + (i % 3) * 178
    const y = 116 + Math.floor(i / 3) * 34
    page.rect(x, y, 172, 30, { stroke: LIGHT_GRAY, strokeWidth: 0.8 })
    page.text(x + 6, y + 11, k.toUpperCase(), 6.5, { color: GRAY })
    page.text(x + 6, y + 24, v, 9)
  })

  const top = 230
  const cols = { code: 46, concept: 90, earn: 470, deduct: 566 }
  page.rect(40, top, 532, 18, { fill: NAVY })
  page.text(cols.code, top + 13, 'Cód.', 8, { bold: true, color: [1, 1, 1] })
  page.text(cols.concept, top + 13, 'Concepto', 8, { bold: true, color: [1, 1, 1] })
  page.text(cols.earn, top + 13, 'Haberes', 8, { bold: true, color: [1, 1, 1], align: 'right' })
  page.text(cols.deduct, top + 13, 'Descuentos', 8, { bold: true, color: [1, 1, 1], align: 'right' })
  const lines = [
    ...payslip.earnings.map((r, i) => ({ code: `H${String(i + 1).padStart(2, '0')}`, label: altLabel(r.label), earn: r.value, deduct: null as number | null })),
    ...payslip.deductions.map((r, i) => ({ code: `D${String(i + 1).padStart(2, '0')}`, label: altLabel(r.label), earn: null as number | null, deduct: r.value })),
  ]
  lines.forEach((l, i) => {
    const y = top + 32 + i * 15
    if (i % 2 === 1) page.rect(40, y - 11, 532, 15, { fill: [0.96, 0.97, 0.98] })
    page.text(cols.code, y, l.code, 8, { color: GRAY })
    page.text(cols.concept, y, l.label, 9)
    if (l.earn !== null) page.text(cols.earn, y, clp(l.earn).replace('$ ', ''), 9, { align: 'right' })
    if (l.deduct !== null) page.text(cols.deduct, y, clp(l.deduct).replace('$ ', ''), 9, { align: 'right' })
  })

  const sumY = top + 32 + lines.length * 15 + 14
  page.line(40, sumY - 10, 572, sumY - 10, GRAY, 0.8)
  const totals: Array<[string, number]> = [
    ['Total imponible', payslip.taxableBase],
    ['Total tributable', payslip.incomeTaxBase],
    ['Total haberes', payslip.totalEarnings],
    ['Total descuentos', payslip.totalDeductions],
  ]
  totals.forEach(([k, v], i) => {
    const x = 40 + (i % 2) * 270
    const y = sumY + 6 + Math.floor(i / 2) * 16
    page.text(x + 6, y, k, 9, { bold: true })
    page.text(x + 256, y, clp(v), 9, { align: 'right' })
  })
  const netY = sumY + 52
  page.rect(310, netY - 14, 262, 22, { stroke: NAVY, strokeWidth: 1.2 })
  page.text(318, netY + 1, 'ALCANCE LÍQUIDO', 10, { bold: true, color: NAVY })
  page.text(566, netY + 1, clp(payslip.net), 11, { bold: true, align: 'right' })
  page.text(40, netY + 34, 'Declaro haber recibido conforme el monto indicado y no tener cargo ni cobro alguno que formular.', 7.5, { color: GRAY })
  page.line(360, 700, 560, 700)
  page.text(460, 712, 'Firma del trabajador', 8, { align: 'center', color: GRAY })

  return { page: page.build(), expected, payslip }
}
