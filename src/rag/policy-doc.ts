/**
 * Reads the written policy (politica/politica-evaluacion.md) into chunks: one
 * per rule ("### Regla 4.1 · …") and one per section with free text and no
 * rules (objective, definitions, how decisions combine, deadlines). Each rule
 * declares its decision in a readable line ("**Decisión:** pedir el
 * documento.") and, when it has thresholds, a "**Parámetros:**" line; both are
 * parsed here, so decisions and thresholds come from the text, not the code.
 */
import type { Severity } from '../agent/types'

export type Chunk = {
  /** "4.1" for a rule, "s2" for a section without rules. */
  id: string
  kind: 'regla' | 'seccion'
  section: string
  title: string
  /** Searchable text: title and body, without the decision and parameter lines. */
  text: string
  /** null for sections, which explain but do not decide. */
  decision: Severity | null
  params: Record<string, number>
}

export type PolicyDocument = { title: string; version: string; chunks: Chunk[] }

const DECISIONS: Array<[RegExp, Severity]> = [
  [/^escalar a una persona/i, 'escalar'],
  [/^pedir el documento/i, 'pedir'],
  [/^observaci[oó]n para el analista/i, 'observar'],
]

function parseDecision(line: string): Severity {
  const value = line.replace(/^\*\*Decisión:\*\*\s*/, '').trim()
  const found = DECISIONS.find(([re]) => re.test(value))
  if (!found) throw new Error(`Decisión no reconocida en la política: «${value}»`)
  return found[1]
}

/** "tolerancia_relativa = 0,02; tolerancia_absoluta = 1000" -> numbers (Chilean decimal comma). */
function parseParams(line: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const part of line.replace(/^\*\*Parámetros:\*\*\s*/, '').split(';')) {
    const m = /^\s*([\w]+)\s*=\s*([\d.,]+)\s*$/.exec(part)
    if (!m) throw new Error(`Parámetro mal escrito en la política: «${part}»`)
    out[m[1]!] = Number(m[2]!.replace(/\./g, '').replace(',', '.'))
  }
  return out
}

export function parsePolicy(markdown: string): PolicyDocument {
  const lines = markdown.split('\n')
  const title = (lines.find(l => l.startsWith('# ')) ?? '# Política').slice(2).trim()
  const version = /Versión:\s*([\d-]+)/.exec(markdown)?.[1] ?? 'sin versión'
  const chunks: Chunk[] = []
  let section = { number: '', title: '' }
  let current: { id: string; kind: Chunk['kind']; title: string; body: string[]; decision: Severity | null; params: Record<string, number> } | null = null
  let sectionHasRules = false
  const flush = () => {
    if (!current) return
    const body = current.body.join('\n').trim()
    if (current.kind === 'seccion' && (!body || sectionHasRules)) {
      current = null
      return
    }
    if (current.kind === 'regla' && !current.decision) throw new Error(`La regla ${current.id} no declara su decisión`)
    chunks.push({
      id: current.id,
      kind: current.kind,
      section: section.title,
      title: current.title,
      text: `${current.title}. ${body.replace(/\*\*/g, '').replace(/\s+/g, ' ')}`.trim(),
      decision: current.decision,
      params: current.params,
    })
    current = null
  }
  for (const line of lines) {
    const sec = /^## (\d+)\.\s+(.+)$/.exec(line)
    const rule = /^### Regla (\d+\.\d+)\s*·\s*(.+)$/.exec(line)
    if (sec) {
      flush()
      section = { number: sec[1]!, title: sec[2]!.trim() }
      sectionHasRules = false
      current = { id: `s${sec[1]}`, kind: 'seccion', title: section.title, body: [], decision: null, params: {} }
    } else if (rule) {
      // A section whose text is only an introduction to its rules is not a chunk of its own.
      if (current?.kind === 'seccion') current = null
      flush()
      sectionHasRules = true
      current = { id: rule[1]!, kind: 'regla', title: rule[2]!.trim(), body: [], decision: null, params: {} }
    } else if (current) {
      if (line.startsWith('**Decisión:**')) current.decision = parseDecision(line)
      else if (line.startsWith('**Parámetros:**')) current.params = parseParams(line)
      else current.body.push(line)
    }
  }
  flush()
  return { title, version, chunks }
}
