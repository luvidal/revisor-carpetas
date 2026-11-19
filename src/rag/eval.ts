/**
 * Search eval: does each method find the right chunk of the policy?
 *   npm run rag:eval     (reads politica/indice.json; no model, no network)
 * Two query sets: the agent's 15 finding queries (what the agent really asks)
 * and 34 analyst-style questions written with different words than the policy.
 * recall@k: share of queries with a relevant chunk among the first k results
 * (each query has one or two relevant chunks). MRR: mean of 1 / rank of the
 * first relevant chunk, so finding it second counts half.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { POLICY_DIR, loadIndex, type PolicyIndex } from './index-file'
import { FINDING_RULE } from './queries'
import { METHODS, PolicySearch, type Hit, type Method } from './search'

export type QueryResult = { id: string; text: string; relevant: string[]; ranking: string[]; firstRelevantRank: number | null; appliedRule: string | null }
export type SetMetrics = { n: number; recallAt1: number; recallAt3: number; recallAt5: number; mrr: number; ruleAccuracy: number; misses: QueryResult[] }

/** The rule the agent would apply: the first chunk in the ranking that declares a decision. */
export function appliedRule(hits: Hit[]): Hit | null {
  return hits.find(h => h.chunk.decision !== null) ?? null
}

export function metricsFor(results: QueryResult[]): SetMetrics {
  const at = (k: number) => results.filter(r => r.firstRelevantRank !== null && r.firstRelevantRank <= k).length / results.length
  return {
    n: results.length,
    recallAt1: at(1),
    recallAt3: at(3),
    recallAt5: at(5),
    mrr: results.reduce((s, r) => s + (r.firstRelevantRank ? 1 / r.firstRelevantRank : 0), 0) / results.length,
    ruleAccuracy: results.filter(r => r.appliedRule !== null && r.relevant.includes(r.appliedRule)).length / results.length,
    misses: results.filter(r => r.firstRelevantRank !== 1),
  }
}

export function evaluateSearch(index: PolicyIndex, method: Method): { hallazgos: SetMetrics; preguntas: SetMetrics } {
  const search = new PolicySearch(index.fragmentos, index.fragmentos.map(f => f.vector))
  const run = (id: string, text: string, vector: number[], relevant: string[]): QueryResult => {
    const hits = search.search({ text, vector }, method)
    const ranking = hits.map(h => h.chunk.id)
    const firstRelevantRank = hits.find(h => relevant.includes(h.chunk.id))?.rank ?? null
    return { id, text, relevant, ranking, firstRelevantRank, appliedRule: appliedRule(hits)?.chunk.id ?? null }
  }
  return {
    hallazgos: metricsFor(index.hallazgos.map(h => run(h.code, h.texto, h.vector, [FINDING_RULE[h.code]]))),
    preguntas: metricsFor(index.consultas.map(q => run(q.id, q.texto, q.vector, q.relevantes))),
  }
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`
const num = (x: number) => x.toFixed(3).replace('.', ',')
const LABEL: Record<Method, string> = { bm25: 'BM25 (léxica)', embeddings: 'Embeddings (semántica)', hibrido: 'Híbrida (RRF)' }

export function renderSearchReport(index: PolicyIndex): string {
  const results = Object.fromEntries(METHODS.map(m => [m, evaluateSearch(index, m)])) as Record<Method, ReturnType<typeof evaluateSearch>>
  const lines = [
    '# Eval de búsqueda en la política',
    '',
    `> **Política sintética.** «${index.politica.titulo}», versión ${index.politica.version}: ${index.fragmentos.length} fragmentos (${index.fragmentos.filter(f => f.kind === 'regla').length} reglas y ${index.fragmentos.filter(f => f.kind === 'seccion').length} secciones). ` +
      `Embeddings locales con \`${index.modelo}\` (${index.dtype}), sin llamadas externas.`,
    '',
    'Dos conjuntos de consultas: las **15 consultas del agente**, una por tipo de hallazgo, que son las que el agente realmente hace; y **34 preguntas de analista**, escritas con palabras distintas a las de la política. ' +
      '«Regla aplicada correcta» mira lo que el agente usa: la primera regla con decisión en el ranking.',
    '',
  ]
  for (const set of ['hallazgos', 'preguntas'] as const) {
    lines.push(
      `## ${set === 'hallazgos' ? 'Consultas del agente (15)' : 'Preguntas de analista (34)'}`,
      '',
      '| Método | recall@1 | recall@3 | recall@5 | MRR | Regla aplicada correcta |',
      '|---|---|---|---|---|---|',
      ...METHODS.map(m => {
        const x = results[m][set]
        return `| ${LABEL[m]} | ${pct(x.recallAt1)} | ${pct(x.recallAt3)} | ${pct(x.recallAt5)} | ${num(x.mrr)} | ${pct(x.ruleAccuracy)} |`
      }),
      '',
    )
  }
  lines.push('## Consultas que no quedaron primeras', '', 'Rango del primer fragmento correcto para cada método (1 = primero).', '', '| Consulta | Correcto | BM25 | Embeddings | Híbrida | Primero en la híbrida |', '|---|---|---|---|---|---|')
  const all = (m: Method) => [...results[m].hallazgos.misses, ...results[m].preguntas.misses]
  const ids = [...new Set(METHODS.flatMap(m => all(m).map(r => r.id)))]
  const find = (m: Method, id: string) => {
    const s = evaluateSearch(index, m)
    return [...[s.hallazgos, s.preguntas].flatMap(x => x.misses)].find(r => r.id === id)
  }
  for (const id of ids) {
    const any = METHODS.map(m => find(m, id)).find(Boolean)!
    const rank = (m: Method) => String(find(m, id)?.firstRelevantRank ?? 1)
    const hybridFirst = find('hibrido', id)?.ranking[0] ?? any.relevant[0]
    lines.push(`| ${any.text} | ${any.relevant.join(', ')} | ${rank('bm25')} | ${rank('embeddings')} | ${rank('hibrido')} | ${hybridFirst} |`)
  }
  lines.push(
    '',
    '## Límites',
    '',
    '- Política corta y sintética (23 fragmentos) escrita para este proyecto; con un documento largo y real las cifras cambian.',
    '- Las 34 preguntas las redactó el mismo autor de la política, aunque con otras palabras: miden robustez al cambio de vocabulario, no a preguntas de usuarios reales.',
    '- Las consultas del agente son un conjunto cerrado; sus vectores se calculan al indexar y el agente no necesita el modelo al decidir.',
    '',
  )
  return lines.join('\n')
}

async function main(): Promise<void> {
  const index = await loadIndex()
  const report = renderSearchReport(index)
  const file = path.join(POLICY_DIR, 'reporte-busqueda.md')
  await writeFile(file, report)
  for (const m of METHODS) {
    const r = evaluateSearch(index, m)
    console.log(
      `${m.padEnd(10)} agente: recall@1 ${pct(r.hallazgos.recallAt1)} regla ${pct(r.hallazgos.ruleAccuracy)} · preguntas: recall@1 ${pct(r.preguntas.recallAt1)} recall@3 ${pct(r.preguntas.recallAt3)} MRR ${num(r.preguntas.mrr)}`,
    )
  }
  console.log(`Reporte: ${path.relative(process.cwd(), file)}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
