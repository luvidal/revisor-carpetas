/**
 * The policy, read from the written document by search (RAG without a
 * generative model). For each kind of finding the agent searches the policy
 * with its query, takes the first rule that declares a decision, and cites it.
 * Severity and thresholds come from the document's "Decisión" and
 * "Parámetros" lines, so changing the written policy changes the agent.
 * The decision itself stays deterministic: same index, same rules.
 */
import { requiredFor, type Policy, type PolicyRule, type Requirement } from '../agent/policy'
import type { FindingCode } from '../agent/types'
import { appliedRule } from './eval'
import { sha256, type PolicyIndex } from './index-file'
import { FINDING_QUERIES } from './queries'
import { PolicySearch, type Method } from './search'

const SOURCE = 'politica/politica-evaluacion.md'
const EXCERPT = 260

/** The rule's body (without its title, which is cited apart), cut at a word boundary. */
function excerpt(text: string, title: string): string {
  const body = text.startsWith(`${title}. `) ? text.slice(title.length + 2) : text
  return body.length <= EXCERPT ? body : `${body.slice(0, body.lastIndexOf(' ', EXCERPT))}…`
}

export class RagPolicy implements Policy {
  readonly id: string
  readonly version: string
  readonly thresholds: Policy['thresholds']
  private readonly search: PolicySearch
  private readonly cache = new Map<FindingCode, PolicyRule>()
  private readonly params: Record<string, number>

  constructor(
    private readonly index: PolicyIndex,
    readonly method: Method = 'hibrido',
  ) {
    if (index.hallazgosSha256 !== sha256(JSON.stringify(FINDING_QUERIES))) {
      throw new Error('El índice de la política está desactualizado respecto de las consultas del agente: corre npm run rag:index.')
    }
    this.id = `politica-evaluacion · búsqueda ${method}`
    this.version = index.politica.version
    this.search = new PolicySearch(index.fragmentos, index.fragmentos.map(f => f.vector))
    this.params = Object.assign({}, ...index.fragmentos.map(f => f.params))
    this.thresholds = {
      minConfidence: this.param('confianza_minima'),
      salaryTolerance: { relative: this.param('tolerancia_relativa'), absolute: this.param('tolerancia_absoluta') },
    }
  }

  private param(name: string): number {
    const value = this.params[name]
    if (value === undefined) throw new Error(`La política escrita no define el parámetro ${name}`)
    return value
  }

  requiredDocuments(referenceDate: string): Requirement[] {
    return requiredFor(referenceDate, this.param('meses_liquidaciones'), this.param('meses_certificado_afp'))
  }

  ruleFor(code: FindingCode): PolicyRule {
    const cached = this.cache.get(code)
    if (cached) return cached
    const query = this.index.hallazgos.find(h => h.code === code)
    if (!query) throw new Error(`El índice no tiene la consulta del hallazgo ${code}`)
    const hit = appliedRule(this.search.search({ text: query.texto, vector: query.vector }, this.method))
    const rule: PolicyRule = hit
      ? {
          id: `Regla ${hit.chunk.id}`,
          title: hit.chunk.title,
          text: hit.chunk.text,
          severity: hit.chunk.decision!,
          codes: [code],
          citation: { source: SOURCE, excerpt: excerpt(hit.chunk.text, hit.chunk.title), rank: hit.rank },
        }
      : // No rule found: do not decide blind.
        { id: 'sin regla', title: 'Regla no encontrada en la política', text: '', severity: 'escalar', codes: [code] }
    this.cache.set(code, rule)
    return rule
  }
}
