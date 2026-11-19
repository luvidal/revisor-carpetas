/**
 * Ranking chunks for a query with three methods:
 * - bm25: lexical (shared words), see bm25.ts.
 * - embeddings: semantic (similar meaning, different words), cosine similarity
 *   between precomputed vectors of a local multilingual model.
 * - hibrido: both rankings fused with Reciprocal Rank Fusion, which adds
 *   1 / (k + rank) from each list. It needs no score calibration between
 *   methods, only ranks, and rewards chunks that both agree on.
 */
import { bm25Scores, buildBm25, type Bm25Index } from './bm25'
import type { Chunk } from './policy-doc'

export type Method = 'bm25' | 'embeddings' | 'hibrido'
export const METHODS: Method[] = ['bm25', 'embeddings', 'hibrido']

export type Hit = { chunk: Chunk; score: number; rank: number }

/** Standard constant from the RRF paper (Cormack et al., 2009). */
export const RRF_K = 60

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

/** Sorted by score; ties broken by `tieBreak` (lower first), then by document order. */
function ranked(chunks: Chunk[], scores: number[], tieBreak?: (c: Chunk) => number): Hit[] {
  return chunks
    .map((chunk, i) => ({ chunk, score: scores[i]!, i }))
    .sort((a, b) => b.score - a.score || (tieBreak ? tieBreak(a.chunk) - tieBreak(b.chunk) : 0) || a.i - b.i)
    .map(({ chunk, score }, rank) => ({ chunk, score, rank: rank + 1 }))
}

export class PolicySearch {
  private readonly bm25: Bm25Index

  constructor(
    readonly chunks: Chunk[],
    /** One vector per chunk, same order (from the index). */
    private readonly vectors: number[][],
  ) {
    if (vectors.length !== chunks.length) throw new Error('El índice no tiene un vector por fragmento')
    this.bm25 = buildBm25(chunks.map(c => c.text))
  }

  search(query: { text: string; vector: number[] }, method: Method): Hit[] {
    const lexical = ranked(this.chunks, bm25Scores(this.bm25, query.text))
    if (method === 'bm25') return lexical
    const semantic = ranked(this.chunks, this.vectors.map(v => cosine(query.vector, v)))
    if (method === 'embeddings') return semantic
    const fused = new Map<string, number>()
    for (const list of [lexical, semantic]) {
      for (const hit of list) fused.set(hit.chunk.id, (fused.get(hit.chunk.id) ?? 0) + 1 / (RRF_K + hit.rank))
    }
    // Ranks 1+2 and 2+1 fuse to the same score: the semantic ranking breaks the tie.
    const semanticRank = new Map(semantic.map(h => [h.chunk.id, h.rank]))
    return ranked(this.chunks, this.chunks.map(c => fused.get(c.id) ?? 0), c => semanticRank.get(c.id) ?? Infinity)
  }
}
