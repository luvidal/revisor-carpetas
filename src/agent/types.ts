/**
 * Types of the folder-review agent (phase 2). The agent reads every file with
 * docs2json, validates each document, cross-checks them, applies a policy and
 * decides. Every decision carries readable reasons and the evidence behind them.
 */
import type { ReadDocument } from '../docs2json/client'
import type { Decision, MimeType } from '../domain/truth'

export type { Decision }

/** What the agent receives: the files and the applicant's declared identity. */
export type FolderInput = {
  folderId: string
  /** Date of the review; expiry and the required months are judged against it. */
  referenceDate: string
  /** Identity declared in the application (the cédula must confirm it). */
  applicant: { name: string; rut: string }
  files: Array<{ file: string; mimeType: MimeType; bytes?: Uint8Array }>
}

/** One call to the reading tool, as the retry policy sees it. */
export type ToolOutcome =
  | { kind: 'ok'; documents: ReadDocument[]; latencyMs: number }
  /** Worth retrying: 429, 503 ai_timeout / ai_unavailable, 504 from the proxy, network, an empty HTTP 200. */
  | { kind: 'transient'; cause: string; latencyMs: number }
  /** Not worth retrying: 4xx, call budget exhausted, no recording in replay. `called: false` when no call was made. */
  | { kind: 'permanent'; cause: string; latencyMs: number; called?: false }

export type ReadAttempt = { attempt: number; kind: ToolOutcome['kind']; cause?: string; latencyMs: number; waitedMs: number }

export type FileRead = {
  file: string
  status: 'leido' | 'no_leido'
  attempts: ReadAttempt[]
  documents: ReadDocument[]
  /** Why it could not be read, when `no_leido`. */
  cause?: string
}

/** A document as the agent works with it: where it came from plus its fields. */
export type Doc = {
  file: string
  /** Position inside the file (a PDF can hold several documents). */
  index: number
  doctype: string
  fields: Record<string, unknown>
  docdate: string | null
  confidence: number | null
}

/** Where a finding comes from: which document and which field. */
export type Evidence = { file: string; doctype?: string; field?: string; value?: unknown; reference?: unknown }

export type FindingCode =
  /** A file could not be read after the retry budget. */
  | 'lectura_fallida'
  /** A field the review needs is missing from a document that was read. */
  | 'campo_ilegible'
  /** docs2json reported low confidence for a document. */
  | 'baja_confianza'
  /** A RUT with an invalid check digit on a document whose name matches: a misreading. */
  | 'rut_ilegible'
  /** A RUT with an invalid check digit and a name that does not match. */
  | 'rut_ilegible_otro_nombre'
  /** A valid RUT that differs from the applicant's, with the applicant's name. */
  | 'rut_distinto'
  /** A valid RUT and a name that are both someone else's. */
  | 'documento_de_otra_persona'
  | 'documento_faltante'
  | 'cedula_vencida'
  | 'liquidacion_fuera_de_periodo'
  /** The AFP contribution on a payslip does not match the certificate for that month. */
  | 'sueldo_no_cuadra'
  /** The salary check could not be done (no certificate row, no deduction read). */
  | 'sueldo_sin_verificar'
  /** The pension fund on the payslip and on the certificate differ. */
  | 'afp_no_coincide'
  /** Same RUT, different name. */
  | 'nombre_distinto'
  | 'documento_no_reconocido'

export type Finding = { code: FindingCode; message: string; evidence: Evidence[] }

export type Severity = 'escalar' | 'pedir' | 'observar'

/** A finding once the policy has ruled on it. */
export type Reason = Finding & {
  severity: Severity
  rule: { id: string; title: string; citation?: { source: string; excerpt: string; rank: number } }
}

export type AgentState = 'recibida' | 'leyendo' | 'validando' | 'cruzando' | 'aplicando_politica' | 'decidida'

export type TraceStep = { state: AgentState; note: string }

export type FolderReview = {
  folderId: string
  decision: Decision
  /** Findings that drive the decision (escalate or ask), most severe first. */
  reasons: Reason[]
  /** Notes for the analyst that do not change the decision. */
  observations: Reason[]
  reads: FileRead[]
  documents: Doc[]
  /** Calls made to the reading tool, retries included. */
  calls: number
  trace: TraceStep[]
  policy: { id: string; version: string }
}
