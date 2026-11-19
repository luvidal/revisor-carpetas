/**
 * End-to-end eval of the agent: its decision per folder against
 * `expected.json`, whether it found the planted defects, and its false
 * positives. Escalations caused only by reading failures are reported apart
 * from decision errors: they say something about the tool, not the logic.
 */
import type { Decision, DefectType, FolderTruth, Subset } from '../domain/truth'
import { READING_CODES, decide, type Policy } from './policy'
import type { FindingCode, FolderReview, Reason } from './types'

/** Which finding codes count as having found each planted defect type. */
export const DEFECT_OF: Partial<Record<FindingCode, DefectType>> = {
  rut_distinto: 'rut_distinto',
  documento_de_otra_persona: 'rut_distinto',
  sueldo_no_cuadra: 'sueldo_no_cuadra',
  cedula_vencida: 'documento_vencido',
  documento_faltante: 'documento_faltante',
}

export type FolderResult = {
  folderId: string
  subset: Subset
  title: string
  expected: Decision
  actual: Decision
  correct: boolean
  /** Escalated only because something could not be read (and that was not the expected decision). */
  readingEscalation: boolean
  /** What the policy would have decided ignoring the reading findings. */
  withoutReadingIssues: Decision
  planted: string[]
  detected: string[]
  missed: string[]
  spurious: string[]
  calls: number
  retries: number
  mainReason: string
}

const key = (type: string, doctype: string | undefined) => `${type}:${doctype ?? '?'}`

function defectsIn(reasons: Reason[]): string[] {
  const out = new Set<string>()
  for (const r of reasons) {
    const type = DEFECT_OF[r.code]
    if (type) out.add(key(type, r.evidence[0]?.doctype))
  }
  return [...out].sort()
}

export function evaluateFolder(truth: FolderTruth, review: FolderReview, policy: Policy): FolderResult {
  const planted = [...new Set(truth.defects.map(d => key(d.type, d.doctype)))].sort()
  const detected = defectsIn(review.reasons)
  const escalating = review.reasons.filter(r => r.severity === 'escalar')
  const readingOnly = escalating.length > 0 && escalating.every(r => READING_CODES.includes(r.code))
  const withoutReading = decide(
    [...review.reasons, ...review.observations].filter(r => !READING_CODES.includes(r.code)),
    policy,
  ).decision
  const correct = review.decision === truth.expectedDecision
  return {
    folderId: truth.id,
    subset: truth.subset,
    title: truth.title,
    expected: truth.expectedDecision,
    actual: review.decision,
    correct,
    readingEscalation: !correct && review.decision === 'escalar_a_persona' && readingOnly,
    withoutReadingIssues: withoutReading,
    planted,
    detected,
    missed: planted.filter(p => !detected.includes(p)),
    spurious: detected.filter(d => !planted.includes(d)),
    calls: review.calls,
    retries: review.reads.reduce((n, r) => n + r.attempts.length - 1, 0),
    mainReason: review.reasons[0]?.message ?? 'Sin motivos: carpeta completa y coherente.',
  }
}

export type SubsetMetrics = {
  folders: number
  correct: number
  readingEscalations: number
  logicErrors: number
  /** Correct among folders not escalated for reading failures. */
  accuracyExcludingReading: number
  /** Correct if every file had been read (decision ignoring reading findings). */
  correctWithoutReadingIssues: number
  defects: { planted: number; detected: number; missed: number; spurious: number }
  /** Clean folders (expected ready) that were not marked ready. */
  falsePositives: { total: number; byReading: number; byLogic: number; cleanFolders: number }
  calls: number
  retries: number
  confusion: Record<string, Record<string, number>>
}

export function summarizeResults(results: FolderResult[]): SubsetMetrics {
  const clean = results.filter(r => r.expected === 'lista_para_analista')
  const fp = clean.filter(r => r.actual !== 'lista_para_analista')
  const reading = results.filter(r => r.readingEscalation)
  const notReading = results.filter(r => !r.readingEscalation)
  const confusion: Record<string, Record<string, number>> = {}
  for (const r of results) {
    const row = (confusion[r.expected] ??= {})
    row[r.actual] = (row[r.actual] ?? 0) + 1
  }
  return {
    folders: results.length,
    correct: results.filter(r => r.correct).length,
    readingEscalations: reading.length,
    logicErrors: results.filter(r => !r.correct && !r.readingEscalation).length,
    accuracyExcludingReading: notReading.length ? notReading.filter(r => r.correct).length / notReading.length : 0,
    correctWithoutReadingIssues: results.filter(r => r.withoutReadingIssues === r.expected).length,
    defects: {
      planted: results.reduce((n, r) => n + r.planted.length, 0),
      detected: results.reduce((n, r) => n + r.planted.filter(p => r.detected.includes(p)).length, 0),
      missed: results.reduce((n, r) => n + r.missed.length, 0),
      spurious: results.reduce((n, r) => n + r.spurious.length, 0),
    },
    falsePositives: { total: fp.length, byReading: fp.filter(r => r.readingEscalation).length, byLogic: fp.filter(r => !r.readingEscalation).length, cleanFolders: clean.length },
    calls: results.reduce((n, r) => n + r.calls, 0),
    retries: results.reduce((n, r) => n + r.retries, 0),
    confusion,
  }
}

const SHORT: Record<string, string> = { lista_para_analista: 'lista', pedir_documento: 'pedir', escalar_a_persona: 'escalar' }
const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`

export function renderAgentReport(args: {
  runId: string
  mode: string
  results: FolderResult[]
  reviews: FolderReview[]
  policy: Policy
}): string {
  const { results, reviews } = args
  const lines: string[] = []
  const push = (...l: string[]) => lines.push(...l)
  const subsets = [...new Set(results.map(r => r.subset))]
  push(
    `# Eval de punta a punta del agente · ${args.runId}`,
    '',
    '> **Dataset sintético.** Decisiones del agente sobre carpetas inventadas, comparadas con la decisión esperada de cada `expected.json`. ' +
      'La decisión esperada es provisional y la política también: no es desempeño en producción.',
    '',
    `- Modo: ${args.mode}`,
    `- Política: \`${args.policy.id}\` versión ${args.policy.version}`,
    `- Llamadas a la herramienta de lectura: ${results.reduce((n, r) => n + r.calls, 0)} (reintentos: ${results.reduce((n, r) => n + r.retries, 0)})`,
    '',
    '## Resumen por subconjunto',
    '',
    '| Métrica | ' + subsets.map(s => (s === 'limpio' ? 'Limpio' : 'Difícil')).join(' | ') + ' |',
    '|---|' + subsets.map(() => '---').join('|') + '|',
  )
  const m = Object.fromEntries(subsets.map(s => [s, summarizeResults(results.filter(r => r.subset === s))]))
  const row = (name: string, f: (x: SubsetMetrics) => string) => push(`| ${name} | ${subsets.map(s => f(m[s]!)).join(' | ')} |`)
  row('Decisión correcta', x => `${x.correct} de ${x.folders} (${pct(x.correct / x.folders)})`)
  row('Escaladas solo por falla de lectura', x => String(x.readingEscalations))
  row('Errores de decisión (lógica o política)', x => String(x.logicErrors))
  row('Decisión correcta sin contar las escaladas por lectura', x => pct(x.accuracyExcludingReading))
  row('Decisión correcta si todo se hubiera leído', x => `${x.correctWithoutReadingIssues} de ${x.folders}`)
  row('Defectos plantados encontrados', x => `${x.defects.detected} de ${x.defects.planted}`)
  row('Defectos reportados que no estaban plantados', x => String(x.defects.spurious))
  row('Falsos positivos: carpetas sanas no marcadas como listas', x => `${x.falsePositives.total} de ${x.falsePositives.cleanFolders} (lectura: ${x.falsePositives.byReading}, lógica: ${x.falsePositives.byLogic})`)
  row('Llamadas / reintentos', x => `${x.calls} / ${x.retries}`)
  push(
    '',
    'Cómo leerlo: una carpeta «escalada solo por falla de lectura» terminó en una persona porque un archivo no se pudo leer o se leyó mal, no porque la lógica se equivocara. ' +
      '«Si todo se hubiera leído» aplica la misma política ignorando esos hallazgos de lectura.',
    '',
    '## Carpeta por carpeta',
    '',
    '| Carpeta | Esperada | Decisión | ¿Correcta? | Defectos plantados | Encontrados | Motivo principal | Llamadas |',
    '|---|---|---|---|---|---|---|---|',
  )
  for (const r of results) {
    const ok = r.correct ? 'sí' : r.readingEscalation ? 'no (lectura)' : '**no**'
    push(
      `| ${r.folderId} | ${SHORT[r.expected]} | ${SHORT[r.actual]} | ${ok} | ${r.planted.join(', ') || '—'} | ${r.detected.join(', ') || '—'} | ${r.mainReason.replace(/\|/g, '/')} | ${r.calls} |`,
    )
  }
  push('', '## Detalle de cada decisión', '')
  for (const review of reviews) {
    const r = results.find(x => x.folderId === review.folderId)!
    push(`### ${review.folderId} · ${r.title}`, '', `**${review.decision}** (esperada: ${r.expected})`, '')
    for (const reason of review.reasons) {
      const ev = reason.evidence.map(e => `${e.file}${e.field ? ` · ${e.field}` : ''}${e.value !== undefined && e.value !== null ? ` = ${JSON.stringify(e.value)}` : ''}`).join('; ')
      push(`- [${reason.rule.id} · ${reason.severity}] ${reason.message} _Evidencia: ${ev}_`)
      if (reason.rule.citation) push(`  > ${reason.rule.id}, «${reason.rule.title}»: ${reason.rule.citation.excerpt}`)
    }
    for (const o of review.observations) push(`- [${o.rule.id} · observación] ${o.message}`)
    const retried = review.reads.filter(x => x.attempts.length > 1 || x.status === 'no_leido')
    for (const x of retried) push(`- Lectura de ${x.file}: ${x.attempts.map(a => (a.kind === 'ok' ? 'ok' : a.cause)).join(' → ')}`)
    push(`- Traza: ${review.trace.map(t => t.state).join(' → ')}`, '')
  }
  push(
    '## Límites',
    '',
    `- Política usada: \`${args.policy.id}\` (versión ${args.policy.version}). La política escrita y la decisión esperada de cada carpeta son sintéticas.`,
    '- 18 carpetas: un error de decisión son 5 a 8 puntos de exactitud. Sirve para ver qué casos fallan, no para una cifra fina.',
    '- En modo replay, el reintento n usa la n-ésima respuesta grabada de ese archivo; si no hay más, repite la última.',
    '',
  )
  return lines.join('\n')
}
