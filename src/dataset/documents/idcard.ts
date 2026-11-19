/**
 * Schematic identity card ("cédula de identidad"), front only. Deliberately
 * NOT a replica of the real card: no photo, no MRZ, no QR, no security
 * features, and a synthetic banner plus watermark. It carries just enough
 * labelled text for a classifier to recognise the document type.
 */
import { formatRut } from '../../domain/rut'
import { DOCTYPES, type ExpectedDocument } from '../../domain/truth'
import { idCardDate } from '../format'
import type { Person } from '../model'
import { GRAY, NAVY, PageBuilder, markSynthetic, type Page } from '../render/layout'

export function idCardDocument(person: Person): { page: Page; expected: ExpectedDocument } {
  const page = markSynthetic(new PageBuilder(1000, 640))
  const foreign = person.nationality !== 'CHILENA'
  const rut = formatRut(person.rutBody)

  page.rect(20, 50, 960, 540, { fill: [0.93, 0.95, 0.97], stroke: [0.55, 0.62, 0.7], strokeWidth: 3 })
  page.text(330, 100, 'REPÚBLICA DE CHILE', 30, { bold: true, color: NAVY })
  page.text(330, 140, foreign ? 'CÉDULA DE IDENTIDAD · EXTRANJERO' : 'CÉDULA DE IDENTIDAD', 26, { bold: true, color: NAVY })

  page.rect(55, 120, 230, 290, { fill: [0.85, 0.87, 0.9], stroke: GRAY })
  page.text(170, 255, 'SIN FOTOGRAFÍA', 20, { bold: true, color: GRAY, align: 'center' })
  page.text(170, 285, 'DOCUMENTO FICTICIO', 16, { color: GRAY, align: 'center' })

  const field = (x: number, y: number, label: string, value: string) => {
    page.text(x, y, label, 14, { color: GRAY })
    page.text(x, y + 28, value, 24, { bold: true })
  }
  field(330, 190, 'APELLIDOS', person.surnames.toUpperCase())
  field(330, 250, 'NOMBRES', person.names.toUpperCase())
  field(330, 310, 'NACIONALIDAD', person.nationality)
  field(620, 310, 'SEXO', person.sex)
  field(760, 310, 'FECHA DE NACIMIENTO', idCardDate(person.birthDate))
  field(330, 370, 'FECHA DE EMISIÓN', idCardDate(person.idIssued))
  field(620, 370, 'FECHA DE VENCIMIENTO', idCardDate(person.idExpires))
  if (person.idDocumentNumber) field(620, 430, 'NÚMERO DOCUMENTO', person.idDocumentNumber)

  page.text(55, 470, `RUN ${rut}`, 32, { bold: true })
  page.text(55, 560, 'Persona ficticia. No corresponde a una identidad real.', 16, { color: GRAY })

  const expected: ExpectedDocument = {
    doctype: DOCTYPES.idCard,
    pages: { start: 1, end: 1 },
    docdate: person.idIssued,
    fields: {
      rut,
      nombres: person.names.toUpperCase(),
      apellidos: person.surnames.toUpperCase(),
      nacionalidad: person.nationality,
      sexo: person.sex,
      fecha_nacimiento: person.birthDate,
      fecha_emision: person.idIssued,
      fecha_vencimiento: person.idExpires,
    },
  }
  return { page: page.build(), expected }
}
