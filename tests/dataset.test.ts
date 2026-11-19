/**
 * The dataset checks itself: files match the manifest, every RUT is valid,
 * payslip arithmetic adds up, every page is marked synthetic, the PDFs are
 * reproducible, and each planted defect is really there (and only there).
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isValidRut, normalizeRut } from '../src/domain/rut'
import { DOCTYPES, type ExpectedDocument, type FolderTruth } from '../src/domain/truth'
import { buildFolder } from '../src/dataset/build'
import { SYNTHETIC_BANNER, SYNTHETIC_FOOTER } from '../src/dataset/render/layout'
import { ALL_FOLDERS } from '../src/dataset/generate'
import { PAYSLIP_MONTHS } from '../src/dataset/scenarios'
import { loadDataset } from '../src/evals/dataset'
import { afpDeduction } from '../src/evals/fields'
import { normalizeMonth } from '../src/domain/normalize'

const dataset = await loadDataset()
const docs = (t: FolderTruth, doctype?: string) =>
  t.files.flatMap(f => f.documents.map(d => ({ file: f.file, doc: d }))).filter(x => !doctype || x.doc.doctype === doctype)
const num = (v: unknown) => v as number
type Row = { label: string; value: number; legalType?: string }

describe('dataset', () => {
  it('has a clean subset of 10 to 15 folders, a hard one, and the manifest matches every file', () => {
    const clean = dataset.truths.filter(t => t.subset === 'limpio')
    const hard = dataset.truths.filter(t => t.subset === 'dificil')
    expect(clean.length).toBeGreaterThanOrEqual(10)
    expect(clean.length).toBeLessThanOrEqual(15)
    expect(hard.length).toBeGreaterThanOrEqual(5)
    const { limpio, dificil } = dataset.manifest.totals
    expect(dataset.files.length).toBe(limpio.files + dificil.files)
    // One pass over the hard subset must fit a 30-call budget with room for retries.
    expect(dificil.files).toBeLessThanOrEqual(26)
  })

  it('covers every requested degradation in the hard subset', () => {
    const labels = dataset.truths.filter(t => t.subset === 'dificil').flatMap(t => t.files.map(f => f.rendering))
    const has = (re: RegExp) => labels.some(l => re.test(l))
    expect(has(/^foto .*perspectiva.*sombra/)).toBe(true)
    expect(has(/^PDF escaneado a [5-9]\d ppp.*ruido/)).toBe(true) // low resolution and noise
    expect(has(/girado 90°/)).toBe(true)
    expect(has(/girado 180°/)).toBe(true)
    expect(has(/muy comprimido/)).toBe(true)
    expect(has(/inclinado/)).toBe(true)
    expect(has(/plantilla B/)).toBe(true)
    expect(new Set(dataset.files.filter(f => f.folder.startsWith('d')).map(f => f.mimeType))).toEqual(new Set(['application/pdf', 'image/png', 'image/jpeg']))
  })

  it('keeps the subsets apart: ids, fingerprints and labels', () => {
    for (const t of dataset.truths) expect(t.id.startsWith(t.subset === 'limpio' ? 'f' : 'd')).toBe(true)
    for (const t of dataset.truths.filter(x => x.subset === 'limpio')) {
      expect(t.files.every(f => !/escaneado|plantilla B|comprimido/.test(f.rendering))).toBe(true)
    }
  })

  it('plants each of the four defect types at least once and keeps clean folders', () => {
    const types = new Set(dataset.truths.flatMap(t => t.defects.map(d => d.type)))
    expect([...types].sort()).toEqual(['documento_faltante', 'documento_vencido', 'rut_distinto', 'sueldo_no_cuadra'])
    expect(dataset.truths.filter(t => t.defects.length === 0).length).toBeGreaterThanOrEqual(4)
  })

  it('uses only valid RUTs', () => {
    for (const t of dataset.truths) {
      expect(isValidRut(t.applicant.rut)).toBe(true)
      for (const { doc } of docs(t)) {
        for (const key of ['rut', 'rut_empleador']) if (doc.fields[key]) expect(isValidRut(doc.fields[key]), `${t.id} ${key}`).toBe(true)
        for (const row of (doc.fields.cotizaciones as Array<{ rut_pagador: string }> | undefined) ?? []) expect(isValidRut(row.rut_pagador)).toBe(true)
      }
    }
  })

  it('has payslips whose totals add up', () => {
    for (const t of dataset.truths) {
      for (const { doc } of docs(t, DOCTYPES.payslip)) {
        const earnings = doc.fields.haberes as Row[]
        const deductions = doc.fields.descuentos as Row[]
        const legal = (type: string) => deductions.find(r => r.legalType === type)!.value
        const nonTaxable = earnings.filter(r => /Colación|Movilización/.test(r.label)).reduce((s, r) => s + r.value, 0)
        expect(earnings.reduce((s, r) => s + r.value, 0) - nonTaxable).toBe(num(doc.fields.base_imponible))
        expect(num(doc.fields.base_imponible) - legal('afp') - legal('salud') - legal('cesantia')).toBe(num(doc.fields.base_tributable))
      }
    }
  })

  it('marks every page as synthetic and regenerates byte-identical text PDFs', async () => {
    for (const spec of ALL_FOLDERS) {
      const { files } = await buildFolder(spec)
      const manifest = dataset.manifest.folders.find(f => f.id === spec.id)!
      for (const f of files) {
        for (const page of f.pages) {
          const texts = page.items.flatMap(i => (i.kind === 'text' ? [i.text] : []))
          expect(texts).toContain(SYNTHETIC_BANNER)
          expect(texts).toContain(SYNTHETIC_FOOTER)
          expect(page.items.some(i => i.kind === 'watermark' && i.text === 'MUESTRA SINTÉTICA')).toBe(true)
        }
        // Raster files depend on system fonts; text PDFs must be reproducible anywhere.
        if (f.vector) {
          const sha = createHash('sha256').update(f.bytes).digest('hex')
          expect(sha, `${spec.id}/${f.file}`).toBe(manifest.files.find(m => m.file === f.file)!.sha256)
        }
      }
    }
  }, 60_000) // builds every folder, rasters included
})

describe('planted defects match the data', () => {
  const has = (t: FolderTruth, type: string) => t.defects.some(d => d.type === type)

  it.each(dataset.truths.map(t => [t.id, t] as const))('%s', (_id, t) => {
    const applicant = normalizeRut(t.applicant.rut)

    // rut_distinto: exactly the files named in the defect carry another RUT.
    const wrongRut = docs(t).filter(({ doc }) => doc.fields.rut && normalizeRut(doc.fields.rut) !== applicant).map(x => x.file)
    const declared = t.defects.filter(d => d.type === 'rut_distinto').map(d => d.file)
    expect(wrongRut.sort()).toEqual(declared.sort())

    // documento_vencido: the cédula expired before the review date.
    const idCard = docs(t, DOCTYPES.idCard)[0]?.doc
    const expired = !!idCard && String(idCard.fields.fecha_vencimiento) < t.referenceDate
    expect(expired).toBe(has(t, 'documento_vencido'))

    // documento_faltante: a required document is absent.
    const missing: string[] = []
    if (!idCard) missing.push(DOCTYPES.idCard)
    const months = docs(t, DOCTYPES.payslip).map(x => x.doc.fields.periodo)
    if (PAYSLIP_MONTHS.some(m => !months.includes(m))) missing.push(DOCTYPES.payslip)
    const afp = docs(t, DOCTYPES.afpCertificate)[0]?.doc
    if (!afp) missing.push(DOCTYPES.afpCertificate)
    const declaredMissing = t.defects.filter(d => d.type === 'documento_faltante').map(d => d.doctype)
    expect(missing.sort()).toEqual(declaredMissing.sort())

    // sueldo_no_cuadra: the AFP deduction on the payslip differs from the certificate.
    if (afp && normalizeRut(afp.fields.rut) === applicant) {
      const paid = new Map((afp.fields.cotizaciones as Array<{ periodo: string; monto: number }>).map(r => [normalizeMonth(r.periodo), r.monto]))
      const mismatch = docs(t, DOCTYPES.payslip).some(({ doc }: { doc: ExpectedDocument }) => paid.get(normalizeMonth(doc.fields.periodo)) !== afpDeduction(doc.fields.descuentos))
      expect(mismatch).toBe(has(t, 'sueldo_no_cuadra'))
    } else {
      expect(has(t, 'sueldo_no_cuadra')).toBe(false)
    }

    // Provisional decisions follow the defects.
    if (t.defects.length === 0) expect(t.expectedDecision).toBe('lista_para_analista')
    if (has(t, 'sueldo_no_cuadra')) expect(t.expectedDecision).toBe('escalar_a_persona')
    if (t.defects.length > 0) expect(t.expectedDecision).not.toBe('lista_para_analista')
  })
})
