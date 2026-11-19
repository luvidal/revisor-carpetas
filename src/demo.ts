/**
 * Demo for the video: the agent reviews a few folders from recorded docs2json
 * responses (the live run of phase 2), so it costs nothing and always prints
 * the same thing.
 *   npm run demo              -> f01, f09, f10, d04
 *   npm run demo -- f08 d03   -> those folders
 */
import { loadRecordings } from './agent/cli'
import { reviewFolder } from './agent/machine'
import { DEFAULT_RETRY } from './agent/retry'
import { ReplaySource } from './agent/source'
import type { FolderReview } from './agent/types'
import { prng } from './dataset/render/raster'
import { loadDataset } from './evals/dataset'
import { loadIndex } from './rag/index-file'
import { RagPolicy } from './rag/rag-policy'

const DEFAULT_FOLDERS = ['f01', 'f09', 'f10', 'd04']
const RECORDINGS = '20261119-171147-vivo-rag-hibrido' // live agent run, 19-11-2026 (9-digit RUTs)

const DECISION: Record<FolderReview['decision'], string> = {
  lista_para_analista: 'LISTA PARA EL ANALISTA',
  pedir_documento: 'PEDIR UN DOCUMENTO',
  escalar_a_persona: 'ESCALAR A UNA PERSONA',
}

export function wrap(text: string, width: number, indent: string): string {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) {
      out.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) out.push(line)
  return out.join(`\n${indent}`)
}

export type DemoOutput = { header: string[]; blocks: string[][] }

/** The demo's text, one block per folder, wrapped to `width` columns. */
export async function demoBlocks(folders: string[] = DEFAULT_FOLDERS, width = 110): Promise<DemoOutput> {
  const dataset = await loadDataset(undefined, { folders })
  const { recordings } = await loadRecordings(RECORDINGS)
  const source = new ReplaySource(recordings)
  const policy = new RagPolicy(await loadIndex())
  const header = [
    `revisor-carpetas · demo sobre respuestas grabadas de docs2json · política escrita con búsqueda ${policy.method}`,
    'MUESTRA SINTÉTICA: personas, empresas y documentos inventados.',
  ]
  const blocks: string[][] = []
  for (const id of folders) {
    const truth = dataset.truths.find(t => t.id === id)!
    const review = await reviewFolder(
      {
        folderId: truth.id,
        referenceDate: truth.referenceDate,
        applicant: truth.applicant,
        files: truth.files.map(f => ({ file: f.file, mimeType: f.mimeType })),
      },
      { source, policy, retry: DEFAULT_RETRY, sleep: async () => {}, random: prng(1) },
    )
    const lines: string[] = []
    const add = (first: string, text: string, rest = first.replace(/\S/g, ' ')) =>
      lines.push(...(first + wrap(text, width - first.length, rest)).split('\n'))
    lines.push(`» ${truth.id} · ${truth.title}`)
    add('   Solicitante: ', `${truth.applicant.name} · ${truth.files.length} archivos: ${truth.files.map(f => f.file).join(', ')}`)
    lines.push(`   Decisión: ${DECISION[review.decision]}`)
    const cited = new Set<string>()
    for (const r of review.reasons) {
      add(`   • [${r.rule.id} · ${r.severity}] `, r.message, '     ')
      const ev = r.evidence.map(e => `${e.file}${e.field ? ` · ${e.field}` : ''}${e.value !== undefined && e.value !== null ? ` = ${JSON.stringify(e.value)}` : ''}`).join('; ')
      add('     Evidencia: ', ev)
      if (r.rule.citation && !cited.has(r.rule.id)) {
        cited.add(r.rule.id)
        lines.push(`     Política, ${r.rule.id} «${r.rule.title}»:`)
        add('       ', r.rule.citation.excerpt)
      }
    }
    for (const o of review.observations) add(`   ◦ Observación [${o.rule.id}]: `, o.message, '     ')
    if (!review.reasons.length && !review.observations.length) lines.push('   Sin hallazgos: carpeta completa y coherente.')
    lines.push(`   Recorrido: ${review.trace.map(t => t.state).join(' → ')} · ${review.calls} lectura(s)`)
    lines.push(`   Esperada: ${truth.expectedDecision} ${review.decision === truth.expectedDecision ? '✓' : '✗'}`)
    blocks.push(lines)
  }
  return { header, blocks }
}

async function main(): Promise<void> {
  const folders = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FOLDERS
  const { header, blocks } = await demoBlocks(folders)
  console.log(header.join('\n') + '\n')
  for (const b of blocks) console.log(b.join('\n') + '\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
