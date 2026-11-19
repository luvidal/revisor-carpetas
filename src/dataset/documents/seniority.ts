/** Synthetic employment seniority letter ("certificado de antigüedad laboral"). */
import { formatRut } from '../../domain/rut'
import { DOCTYPES, type ExpectedDocument } from '../../domain/truth'
import { clp, longDate } from '../format'
import { employerRut, fullName, type Job, type Person } from '../model'
import { BLACK, GRAY, NAVY, PageBuilder, markSynthetic, wrap, type Page } from '../render/layout'

export type SeniorityArgs = {
  person: Person
  job: Job
  /** Gross monthly pay stated in the letter. */
  monthlyPay: number
  issued: string
  signer: { name: string; role: string }
}

/** "4 años y 8 meses" between two ISO dates (whole months). */
export function seniorityText(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number) as [number, number, number]
  const [ey, em, ed] = end.split('-').map(Number) as [number, number, number]
  let months = (ey - sy) * 12 + (em - sm) - (ed < sd ? 1 : 0)
  const years = Math.floor(months / 12)
  months -= years * 12
  const y = years === 1 ? '1 año' : `${years} años`
  const m = months === 1 ? '1 mes' : `${months} meses`
  if (years === 0) return m
  if (months === 0) return y
  return `${y} y ${m}`
}

export function seniorityDocument(args: SeniorityArgs): { page: Page; expected: ExpectedDocument } {
  const { person, job } = args
  const rut = formatRut(person.rutBody)
  const name = fullName(person)
  const seniority = seniorityText(job.startDate, args.issued)
  const page = markSynthetic(new PageBuilder(612, 792))

  page.text(60, 60, job.employer.name, 14, { bold: true, color: NAVY })
  page.text(60, 75, `RUT ${employerRut(job.employer)}`, 9, { color: GRAY })
  page.text(60, 87, job.employer.address, 9, { color: GRAY })
  page.text(306, 150, 'CERTIFICADO DE ANTIGÜEDAD LABORAL', 14, { bold: true, align: 'center' })

  const treatment = person.sex === 'F' ? 'doña' : 'don'
  const body =
    `${job.employer.name}, RUT ${employerRut(job.employer)}, certifica que ${treatment} ${name}, ` +
    `RUT ${rut}, se desempeña en esta empresa desde el ${longDate(job.startDate)}, ` +
    `con contrato de trabajo indefinido, en el cargo de ${job.position}, ` +
    `con una antigüedad de ${seniority} a la fecha. ` +
    `Su remuneración bruta mensual es de ${clp(args.monthlyPay)}.`
  const closing =
    'Se extiende el presente certificado a petición del interesado, para los fines que estime conveniente.'
  let y = 200
  for (const line of wrap(body, 92)) {
    page.text(60, y, line, 11, { color: BLACK })
    y += 18
  }
  y += 12
  for (const line of wrap(closing, 92)) {
    page.text(60, y, line, 11)
    y += 18
  }
  page.text(60, y + 24, `Santiago, ${longDate(args.issued)}.`, 11)

  page.line(206, 560, 406, 560)
  page.text(306, 575, args.signer.name, 10, { bold: true, align: 'center' })
  page.text(306, 589, args.signer.role, 9, { align: 'center', color: GRAY })
  page.text(306, 602, job.employer.name, 9, { align: 'center', color: GRAY })

  const expected: ExpectedDocument = {
    doctype: DOCTYPES.seniority,
    pages: { start: 1, end: 1 },
    // The catalog has no date rule for this doctype, so docdate is not scored.
    docdate: null,
    fields: {
      empleador: job.employer.name,
      rut_empleador: employerRut(job.employer),
      empleado: name,
      rut,
      cargo: job.position,
      fecha_ingreso: job.startDate,
      antiguedad: seniority,
      renta: args.monthlyPay,
    },
  }
  return { page: page.build(), expected }
}
