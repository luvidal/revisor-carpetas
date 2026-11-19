/**
 * Ground-truth ("verdad esperada") format for one synthetic applicant folder.
 * Written by the dataset generator as `dataset/folders/<id>/expected.json` and
 * read by the evals (phase 1) and, later, by the agent's end-to-end evals.
 */

/** Doctype ids from the docs2json catalog used here. */
export const DOCTYPES = {
  idCard: 'cedula-identidad',
  payslip: 'liquidaciones-sueldo',
  afpCertificate: 'cotizaciones-afp',
  seniority: 'certificado-antiguedad',
} as const

export type Doctype = (typeof DOCTYPES)[keyof typeof DOCTYPES]

/** The four defect kinds planted in the dataset. */
export type DefectType = 'rut_distinto' | 'sueldo_no_cuadra' | 'documento_vencido' | 'documento_faltante'

/** Provisional label for phase 2/3; the evaluation policy (phase 3) confirms it. */
export type Decision = 'lista_para_analista' | 'pedir_documento' | 'escalar_a_persona'

export type ExpectedDocument = {
  doctype: Doctype
  /** 1-based page range inside the file, as docs2json reports it. */
  pages: { start: number; end: number }
  /** Expected `docdate` (YYYY-MM-DD), or null when the catalog gives no date rule. */
  docdate: string | null
  /** Expected fields, in the same shape docs2json returns. */
  fields: Record<string, unknown>
}

export type MimeType = 'application/pdf' | 'image/png' | 'image/jpeg'

export type ExpectedFile = {
  file: string
  mimeType: MimeType
  /** How the file was produced, in Spanish ("PDF vectorial", "foto JPEG con perspectiva y sombra"...). */
  rendering: string
  documents: ExpectedDocument[]
}

export type Defect = {
  type: DefectType
  /** Doctype affected (the missing one, for `documento_faltante`). */
  doctype: Doctype
  /** File where the defect shows, when there is one. */
  file?: string
  /** Plain-language explanation, in Spanish. */
  detail: string
}

/** `limpio`: clean documents. `dificil`: photos, scans, rotations and another payslip layout. */
export type Subset = 'limpio' | 'dificil'

export type FolderTruth = {
  id: string
  subset: Subset
  title: string
  /** Date the folder is reviewed; expiry and freshness are judged against it. */
  referenceDate: string
  applicant: { name: string; rut: string }
  files: ExpectedFile[]
  defects: Defect[]
  expectedDecision: Decision
  /** Why that decision, in Spanish. */
  decisionReason: string
}

export type ManifestFile = { file: string; sha256: string; bytes: number }

export type Manifest = {
  description: string
  referenceDate: string
  folders: Array<{ id: string; subset: Subset; title: string; files: ManifestFile[] }>
  totals: Record<Subset, { folders: number; files: number; documents: number; byDoctype: Record<string, number> }>
}
