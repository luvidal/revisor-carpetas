/** Turns a folder spec into files (bytes) plus its ground truth. */
import type { ExpectedDocument, FolderTruth, MimeType } from '../domain/truth'
import { afpDocument } from './documents/afp'
import { idCardDocument } from './documents/idcard'
import { payslipDocument } from './documents/payslip'
import { payslipAltDocument } from './documents/payslip-alt'
import { seniorityDocument } from './documents/seniority'
import { fullName, personRut } from './model'
import type { Payslip } from './payroll'
import type { Page } from './render/layout'
import { renderPdf } from './render/pdf'
import { renderPng } from './render/png'
import { renderWith } from './rendering'
import { AFP_FROM, AFP_ISSUED, AFP_TO, REFERENCE_DATE, SENIORITY_ISSUED, type FileKey, type FolderSpec } from './scenarios'

/** A generated file: bytes, ground truth, the layout pages it was drawn from. */
export type BuiltFile = {
  file: string
  mimeType: MimeType
  rendering: string
  documents: ExpectedDocument[]
  bytes: Uint8Array
  pages: Page[]
  /** Text PDF: byte-identical on any machine (raster output depends on system fonts). */
  vector: boolean
}

/** Photo effect for the photographed payslip of the clean subset (f12). */
const PHOTO = { rotate: 1.6, blur: 0.45, margin: 36 }

type Logical = {
  key: FileKey
  /** Base name without extension. */
  name: string
  title: string
  pages: Page[]
  documents: ExpectedDocument[]
  /** Clean-subset default when the spec gives no rendering. */
  fallback: 'id-card-png' | 'photo-png' | 'pdf'
  /** Appended to the rendering label (e.g. the payslip template). */
  note?: string
}

async function produce(spec: FolderSpec, l: Logical): Promise<BuiltFile> {
  const built = await produceRaw(spec, l)
  return l.note ? { ...built, rendering: `${built.rendering}, ${l.note}` } : built
}

async function produceRaw(spec: FolderSpec, l: Logical): Promise<BuiltFile> {
  const custom = spec.renderings?.[l.key]
  if (custom) {
    const out = await renderWith(custom, l.pages, l.title)
    return {
      file: custom.file ?? `${l.name}.${out.extension}`,
      mimeType: out.mimeType,
      rendering: out.label,
      documents: l.documents,
      bytes: out.bytes,
      pages: l.pages,
      vector: out.vector,
    }
  }
  // Clean subset: the original code paths, so its files stay byte-identical.
  if (l.fallback === 'id-card-png') {
    return { file: `${l.name}.png`, mimeType: 'image/png', rendering: 'imagen PNG', documents: l.documents, bytes: renderPng(l.pages[0]!, 1.2), pages: l.pages, vector: false }
  }
  if (l.fallback === 'photo-png') {
    return {
      file: `${l.name}-foto.png`,
      mimeType: 'image/png',
      rendering: 'foto PNG levemente girada y borrosa',
      documents: l.documents,
      bytes: renderPng(l.pages[0]!, 2, PHOTO),
      pages: l.pages,
      vector: false,
    }
  }
  return { file: `${l.name}.pdf`, mimeType: 'application/pdf', rendering: 'PDF vectorial', documents: l.documents, bytes: await renderPdf(l.pages, l.title), pages: l.pages, vector: true }
}

export async function buildFolder(spec: FolderSpec): Promise<{ truth: FolderTruth; files: BuiltFile[] }> {
  const logical: Logical[] = []

  if (spec.idCard) {
    const { page, expected } = idCardDocument(spec.person)
    logical.push({ key: 'cedula', name: 'cedula', title: 'Cédula de identidad', pages: [page], documents: [expected], fallback: 'id-card-png' })
  }

  const declared = spec.declaredJob ?? spec.job
  const payslips = spec.payslipMonths.map(month => {
    const args = {
      person: spec.person,
      job: declared,
      pension: spec.pension,
      month,
      ...(spec.tamperedPayslipRut?.month === month ? { printedRutBody: spec.tamperedPayslipRut.rutBody } : {}),
    }
    return spec.altPayslipMonths?.includes(month) ? payslipAltDocument(args) : payslipDocument(args)
  })
  if (spec.combinePayslips) {
    logical.push({
      key: 'payslips',
      name: `liquidaciones-${spec.payslipMonths.join('-y-')}`,
      title: 'Liquidaciones de sueldo',
      pages: payslips.map(p => p.page),
      documents: payslips.map((p, i) => ({ ...p.expected, pages: { start: i + 1, end: i + 1 } })),
      fallback: 'pdf',
    })
  } else {
    spec.payslipMonths.forEach((month, i) => {
      const p = payslips[i]!
      logical.push({
        key: `payslip:${month}`,
        name: `liquidacion-${month}`,
        title: `Liquidación de sueldo ${month}`,
        pages: [p.page],
        documents: [p.expected],
        fallback: month === spec.photoPayslipMonth ? 'photo-png' : 'pdf',
        ...(spec.altPayslipMonths?.includes(month) ? { note: 'liquidación de otro formato (plantilla B)' } : {}),
      })
    })
  }

  if (spec.afp) {
    const holder = spec.afp.holder ?? { person: spec.person, pension: spec.pension, jobs: [spec.job, ...(spec.previousJobs ?? [])] }
    const { page, expected } = afpDocument({
      person: holder.person,
      pension: holder.pension,
      jobs: holder.jobs,
      from: AFP_FROM,
      to: AFP_TO,
      ...(spec.afp.gapMonths ? { gapMonths: spec.afp.gapMonths } : {}),
      issued: AFP_ISSUED,
      folio: spec.afp.folio,
      validationCode: spec.afp.code,
    })
    logical.push({ key: 'afp', name: 'certificado-afp', title: 'Certificado de cotizaciones', pages: [page], documents: [expected], fallback: 'pdf' })
  }

  if (spec.seniority) {
    const latest: Payslip = payslips.at(-1)!.payslip
    const { page, expected } = seniorityDocument({
      person: spec.person,
      job: declared,
      monthlyPay: latest.taxableBase,
      issued: SENIORITY_ISSUED,
      signer: spec.seniority,
    })
    logical.push({ key: 'seniority', name: 'certificado-antiguedad', title: 'Certificado de antigüedad laboral', pages: [page], documents: [expected], fallback: 'pdf' })
  }

  const files: BuiltFile[] = []
  for (const l of logical) files.push(await produce(spec, l))

  const truth: FolderTruth = {
    id: spec.id,
    subset: spec.subset ?? 'limpio',
    title: spec.title,
    referenceDate: REFERENCE_DATE,
    applicant: { name: fullName(spec.person), rut: personRut(spec.person) },
    files: files.map(({ file, mimeType, rendering, documents }) => ({ file, mimeType, rendering, documents })),
    defects: spec.defects,
    expectedDecision: spec.expectedDecision,
    decisionReason: spec.decisionReason,
  }
  return { truth, files }
}
