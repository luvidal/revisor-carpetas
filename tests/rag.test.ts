import { describe, expect, it } from 'vitest'
import { reviewFolder } from '../src/agent/machine'
import { PROVISIONAL_POLICY } from '../src/agent/policy'
import { DEFAULT_RETRY } from '../src/agent/retry'
import type { DocumentSource } from '../src/agent/source'
import type { FindingCode, ToolOutcome } from '../src/agent/types'
import { prng } from '../src/dataset/render/raster'
import { loadDataset } from '../src/evals/dataset'
import { bm25Scores, buildBm25, normalizeToken, tokenize } from '../src/rag/bm25'
import { evaluateSearch, metricsFor } from '../src/rag/eval'
import { loadIndex, readSources, sha256 } from '../src/rag/index-file'
import { parsePolicy } from '../src/rag/policy-doc'
import { FINDING_QUERIES, FINDING_RULE } from '../src/rag/queries'
import { RagPolicy } from '../src/rag/rag-policy'
import { PolicySearch, RRF_K } from '../src/rag/search'

const index = await loadIndex()
const sources = await readSources()

describe('written policy', () => {
  it('parses rules with their decision and parameters, and free-text sections', () => {
    const doc = sources.doc
    expect(doc.version).toBe('2026-11-19')
    expect(doc.chunks.filter(c => c.kind === 'regla')).toHaveLength(19)
    expect(doc.chunks.filter(c => c.kind === 'seccion').map(c => c.id)).toEqual(['s1', 's2', 's7', 's9'])
    const r51 = doc.chunks.find(c => c.id === '5.1')!
    expect(r51).toMatchObject({ decision: 'escalar', params: { tolerancia_relativa: 0.02, tolerancia_absoluta: 1000 } })
    expect(r51.text).not.toContain('Decisión')
    expect(doc.chunks.find(c => c.id === '6.3')!.params).toEqual({ confianza_minima: 0.8 })
  })

  it('refuses a rule without a decision or with an unknown one', () => {
    expect(() => parsePolicy('## 1. A\n\n### Regla 1.1 · X\n\nTexto.\n')).toThrow('no declara su decisión')
    expect(() => parsePolicy('## 1. A\n\n### Regla 1.1 · X\n\n**Decisión:** aprobar.\n')).toThrow('Decisión no reconocida')
  })
})

describe('BM25', () => {
  it('folds accents, case and plurals, and drops stopwords', () => {
    expect(normalizeToken('Liquidaciones')).toBe('liquidacion')
    expect(normalizeToken('cédulas')).toBe('cedula')
    expect(tokenize('La cédula de identidad está vencida')).toEqual(['cedula', 'identidad', 'vencida'])
  })

  it('ranks the chunk that shares the rare words first', () => {
    const idx = buildBm25(['la cédula de identidad vencida', 'las liquidaciones de sueldo', 'el certificado de cotizaciones'])
    const scores = bm25Scores(idx, 'cédula vencida')
    expect(scores.indexOf(Math.max(...scores))).toBe(0)
    expect(scores[1]).toBe(0)
  })
})

describe('hybrid search', () => {
  it('fuses ranks with RRF and breaks exact ties with the semantic ranking', () => {
    const chunks = ['a', 'b'].map(id => ({ id, kind: 'regla' as const, section: '', title: id, text: id === 'a' ? 'cedula vencida' : 'cedula vigente identidad', decision: 'pedir' as const, params: {} }))
    // BM25 prefers "a"; the vectors prefer "b": ranks 1+2 and 2+1 tie.
    const search = new PolicySearch(chunks, [[1, 0], [0, 1]])
    const hits = search.search({ text: 'vencida', vector: [0, 1] }, 'hibrido')
    expect(hits[0]!.score).toBeCloseTo(hits[1]!.score, 12)
    expect(hits[0]!.score).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 2), 12)
    expect(hits.map(h => h.chunk.id)).toEqual(['b', 'a'])
  })

  it('computes recall@k and MRR', () => {
    const r = (rank: number | null) => ({ id: 'x', text: '', relevant: ['1'], ranking: [], firstRelevantRank: rank, appliedRule: rank === 1 ? '1' : '2' })
    const m = metricsFor([r(1), r(2), r(4), r(null)])
    expect([m.recallAt1, m.recallAt3, m.recallAt5]).toEqual([0.25, 0.5, 0.75])
    expect(m.mrr).toBeCloseTo((1 + 0.5 + 0.25) / 4, 10)
    expect(m.ruleAccuracy).toBe(0.25)
  })
})

describe('policy index', () => {
  it('is up to date with the policy, the test questions and the agent queries (else: npm run rag:index)', () => {
    expect(index.politica.sha256).toBe(sha256(sources.policyText))
    expect(index.consultasSha256).toBe(sha256(sources.questionsText))
    expect(index.hallazgosSha256).toBe(sha256(sources.findingsText))
    expect(index.fragmentos.map(f => f.id)).toEqual(sources.doc.chunks.map(c => c.id))
  })

  it('routes every agent query to its rule with the hybrid search (regression gate)', () => {
    const r = evaluateSearch(index, 'hibrido')
    expect(r.hallazgos.misses.map(m => m.id)).toEqual([])
    expect(r.hallazgos.ruleAccuracy).toBe(1)
  })

  it('keeps the analyst questions at their measured level', () => {
    const r = evaluateSearch(index, 'hibrido').preguntas
    expect(r.recallAt3).toBeGreaterThanOrEqual(0.9)
    expect(r.recallAt1).toBeGreaterThanOrEqual(0.65)
  })
})

describe('RagPolicy', () => {
  const policy = new RagPolicy(index, 'hibrido')

  it('takes thresholds and required documents from the written policy', () => {
    expect(policy.thresholds).toEqual(PROVISIONAL_POLICY.thresholds)
    expect(policy.requiredDocuments('2026-11-16')).toEqual(PROVISIONAL_POLICY.requiredDocuments('2026-11-16'))
  })

  it('finds, for every finding, the rule a person would cite, with the same severity as phase 2', () => {
    for (const code of Object.keys(FINDING_QUERIES) as FindingCode[]) {
      const rule = policy.ruleFor(code)
      expect(rule.id, code).toBe(`Regla ${FINDING_RULE[code]}`)
      expect(rule.severity, code).toBe(PROVISIONAL_POLICY.ruleFor(code).severity)
      expect(rule.citation?.source).toBe('politica/politica-evaluacion.md')
    }
  })

  it('shows how a search error changes a decision: BM25 sends "someone else’s document" to rule 6.4', () => {
    const bm25 = new RagPolicy(index, 'bm25')
    expect(bm25.ruleFor('documento_de_otra_persona')).toMatchObject({ id: 'Regla 6.4', severity: 'escalar' })
  })

  it('refuses an index built for other agent queries', () => {
    expect(() => new RagPolicy({ ...index, hallazgosSha256: 'otro' })).toThrow('desactualizado')
  })

  it('reaches the expected decision on all 18 folders with perfect readings', async () => {
    const dataset = await loadDataset()
    const reader: DocumentSource = {
      async read(folderId, file): Promise<ToolOutcome> {
        const f = dataset.truths.find(t => t.id === folderId)!.files.find(x => x.file === file.file)!
        return { kind: 'ok', latencyMs: 1, documents: f.documents.map(d => ({ doctype: d.doctype, pages: d.pages, docdate: d.docdate, fields: d.fields, confidence: 0.99 })) }
      },
    }
    for (const t of dataset.truths) {
      const review = await reviewFolder(
        { folderId: t.id, referenceDate: t.referenceDate, applicant: t.applicant, files: t.files.map(f => ({ file: f.file, mimeType: f.mimeType })) },
        { source: reader, policy, retry: DEFAULT_RETRY, sleep: async () => {}, random: prng(1) },
      )
      expect(review.decision, t.id).toBe(t.expectedDecision)
      for (const r of review.reasons) expect(r.rule.citation, t.id).toBeDefined()
    }
  })
})
