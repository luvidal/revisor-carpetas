/**
 * Builds politica/indice.json with the local embedding model.
 *   npm run rag:index
 * The model (Xenova/multilingual-e5-small, 8-bit, ~135 MB) is downloaded once
 * to .cache/modelos (git-ignored). E5 models expect "query: " before questions
 * and "passage: " before the texts being searched.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FindingCode } from '../agent/types'
import { INDEX_FILE, MODEL, readSources, sha256, type PolicyIndex } from './index-file'
import { FINDING_QUERIES } from './queries'

const CACHE_DIR = path.resolve(import.meta.dirname, '../../.cache/modelos')
const round = (v: number[]) => v.map(x => Math.round(x * 1e5) / 1e5)

export async function localEmbedder(): Promise<(texts: string[]) => Promise<number[][]>> {
  const { env, pipeline } = await import('@huggingface/transformers')
  env.cacheDir = CACHE_DIR
  const extractor = await pipeline('feature-extraction', MODEL.name, { dtype: MODEL.dtype })
  return async texts => {
    const out = await extractor(texts, { pooling: 'mean', normalize: true })
    return (out.tolist() as number[][]).map(round)
  }
}

async function main(): Promise<void> {
  const src = await readSources()
  console.log(`Política «${src.doc.title}» v${src.doc.version}: ${src.doc.chunks.length} fragmentos (${src.doc.chunks.filter(c => c.kind === 'regla').length} reglas).`)
  const embed = await localEmbedder()
  const passages = await embed(src.doc.chunks.map(c => `passage: ${c.text}`))
  const codes = Object.keys(FINDING_QUERIES) as FindingCode[]
  const findings = await embed(codes.map(c => `query: ${FINDING_QUERIES[c]}`))
  const questions = await embed(src.questions.map(q => `query: ${q.texto}`))
  const index: PolicyIndex = {
    modelo: MODEL.name,
    dtype: MODEL.dtype,
    politica: { titulo: src.doc.title, version: src.doc.version, sha256: sha256(src.policyText) },
    consultasSha256: sha256(src.questionsText),
    hallazgosSha256: sha256(src.findingsText),
    fragmentos: src.doc.chunks.map((c, i) => ({ ...c, vector: passages[i]! })),
    hallazgos: codes.map((code, i) => ({ code, texto: FINDING_QUERIES[code], vector: findings[i]! })),
    consultas: src.questions.map((q, i) => ({ ...q, vector: questions[i]! })),
  }
  await writeFile(INDEX_FILE, JSON.stringify(index) + '\n')
  console.log(`Índice escrito en ${path.relative(process.cwd(), INDEX_FILE)}.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
