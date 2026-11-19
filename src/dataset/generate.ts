/**
 * Phase 0 CLI: writes the synthetic dataset.
 *   npm run dataset   -> dataset/folders/<id>/{files, expected.json}, manifest, README
 * Two subsets: `limpio` (f01-f12) and `dificil` (d01-d06). Text PDFs are
 * byte-identical on any machine; raster files depend on the system fonts.
 */
import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FolderTruth, Manifest, Subset } from '../domain/truth'
import { buildFolder } from './build'
import { FOLDERS, REFERENCE_DATE, REQUIRED_DOCUMENTS, type FolderSpec } from './scenarios'
import { HARD_FOLDERS } from './scenarios-hard'

export const DATASET_DIR = path.resolve(import.meta.dirname, '../../dataset')
export const ALL_FOLDERS: FolderSpec[] = [...FOLDERS, ...HARD_FOLDERS]

const DEFECT_LABELS: Record<string, string> = {
  rut_distinto: 'RUT distinto',
  sueldo_no_cuadra: 'Sueldo no cuadra',
  documento_vencido: 'Documento vencido',
  documento_faltante: 'Documento faltante',
}

const SUBSET_INTRO: Record<Subset, string> = {
  limpio: 'Documentos limpios: PDF con texto y una cédula en PNG. Sirve para detectar regresiones.',
  dificil:
    'Los mismos tipos de documento, llegados como llegan los reales: fotos con perspectiva y sombra, escaneos con ruido y baja resolución, ' +
    'páginas giradas 90° y 180°, JPEG muy comprimidos, páginas inclinadas y liquidaciones de otro sistema de remuneraciones (plantilla B). ' +
    'Sirve para que la eval distinga mejoras: sus cifras se reportan aparte de las del subconjunto limpio.',
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function readme(truths: FolderTruth[], manifest: Manifest): string {
  const sections = (['limpio', 'dificil'] as const).map(subset => {
    const t = manifest.totals[subset]
    const byType = Object.entries(t.byDoctype)
      .map(([k, v]) => `\`${k}\`: ${v}`)
      .join(' · ')
    const rows = truths
      .filter(x => x.subset === subset)
      .map(x => {
        const defects = x.defects.length ? x.defects.map(d => DEFECT_LABELS[d.type]).join(' + ') : 'ninguno'
        const files = x.files.map(f => (subset === 'limpio' ? `\`${f.file}\`` : `\`${f.file}\` (${f.rendering})`)).join('<br>')
        return `| ${x.id} | ${x.title} | ${defects} | \`${x.expectedDecision}\` | ${files} |`
      })
    return `## Subconjunto ${subset === 'limpio' ? 'limpio' : 'difícil'}

${SUBSET_INTRO[subset]}

${t.folders} carpetas, ${t.files} archivos y ${t.documents} documentos (${byType}).

| Carpeta | Caso | Defecto plantado | Decisión esperada (provisional) | Archivos |
|---|---|---|---|---|
${rows.join('\n')}
`
  })
  return `# Dataset sintético

> **MUESTRA SINTÉTICA.** Todas las personas, empresas, AFP, isapres, RUT y montos son inventados.
> Ningún archivo proviene de documentos reales. Este archivo lo genera \`npm run dataset\`; no lo edites a mano.

Fecha de revisión de todas las carpetas: **${REFERENCE_DATE}**.

Carpeta mínima según la política provisional: ${REQUIRED_DOCUMENTS}

${sections.join('\n')}
Cada carpeta trae \`expected.json\` con los campos esperados de cada documento, en el formato que devuelve docs2json,
cómo se produjo cada archivo, los defectos plantados y la decisión esperada. \`manifest.json\` guarda el SHA-256 de cada archivo.
La decisión esperada es provisional: la confirma la política de evaluación de la fase 3.
`
}

export async function generate(outDir: string = DATASET_DIR): Promise<Manifest> {
  await rm(path.join(outDir, 'folders'), { recursive: true, force: true })
  const truths: FolderTruth[] = []
  const empty = () => ({ folders: 0, files: 0, documents: 0, byDoctype: {} as Record<string, number> })
  const manifest: Manifest = {
    description: 'Dataset sintético de carpetas de solicitantes. MUESTRA SINTÉTICA: datos inventados.',
    referenceDate: REFERENCE_DATE,
    folders: [],
    totals: { limpio: empty(), dificil: empty() },
  }
  for (const spec of ALL_FOLDERS) {
    const { truth, files } = await buildFolder(spec)
    const dir = path.join(outDir, 'folders', spec.id)
    await mkdir(dir, { recursive: true })
    for (const f of files) await writeFile(path.join(dir, f.file), f.bytes)
    await writeFile(path.join(dir, 'expected.json'), JSON.stringify(truth, null, 2) + '\n')
    truths.push(truth)
    manifest.folders.push({
      id: spec.id,
      subset: truth.subset,
      title: spec.title,
      files: files.map(f => ({ file: f.file, sha256: sha256(f.bytes), bytes: f.bytes.length })),
    })
    const totals = manifest.totals[truth.subset]
    totals.folders += 1
    totals.files += files.length
    for (const doc of files.flatMap(f => f.documents)) {
      totals.documents += 1
      totals.byDoctype[doc.doctype] = (totals.byDoctype[doc.doctype] ?? 0) + 1
    }
  }
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(path.join(outDir, 'README.md'), readme(truths, manifest))
  return manifest
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = await generate()
  for (const [subset, t] of Object.entries(manifest.totals)) {
    console.log(`${subset}: ${t.folders} carpetas, ${t.files} archivos, ${t.documents} documentos`, t.byDoctype)
  }
}
