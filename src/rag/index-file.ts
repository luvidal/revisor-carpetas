/**
 * The policy index (politica/indice.json): chunks with their vectors, plus the
 * vectors of the agent's finding queries and of the test questions. Built once
 * with the local model (`npm run rag:index`); everything else, the agent and
 * CI included, reads it without the model. Hashes tie it to the texts it came
 * from, so a stale index is caught by a test.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { FindingCode } from '../agent/types'
import { parsePolicy, type Chunk, type PolicyDocument } from './policy-doc'
import { FINDING_QUERIES } from './queries'

export const POLICY_DIR = path.resolve(import.meta.dirname, '../../politica')
export const POLICY_FILE = path.join(POLICY_DIR, 'politica-evaluacion.md')
export const QUESTIONS_FILE = path.join(POLICY_DIR, 'consultas.json')
export const INDEX_FILE = path.join(POLICY_DIR, 'indice.json')

export const MODEL = { name: 'Xenova/multilingual-e5-small', dtype: 'q8' } as const

export type Question = { id: string; texto: string; relevantes: string[] }

export type PolicyIndex = {
  modelo: string
  dtype: string
  politica: { titulo: string; version: string; sha256: string }
  consultasSha256: string
  hallazgosSha256: string
  fragmentos: Array<Chunk & { vector: number[] }>
  hallazgos: Array<{ code: FindingCode; texto: string; vector: number[] }>
  consultas: Array<Question & { vector: number[] }>
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

export async function readSources(): Promise<{ policyText: string; doc: PolicyDocument; questionsText: string; questions: Question[]; findingsText: string }> {
  const policyText = await readFile(POLICY_FILE, 'utf8')
  const questionsText = await readFile(QUESTIONS_FILE, 'utf8')
  return {
    policyText,
    doc: parsePolicy(policyText),
    questionsText,
    questions: (JSON.parse(questionsText) as { consultas: Question[] }).consultas,
    findingsText: JSON.stringify(FINDING_QUERIES),
  }
}

export async function loadIndex(file = INDEX_FILE): Promise<PolicyIndex> {
  return JSON.parse(await readFile(file, 'utf8')) as PolicyIndex
}
