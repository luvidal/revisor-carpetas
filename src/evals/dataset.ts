/** Loads the committed dataset and checks every file against the manifest. */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { FolderTruth, Manifest, MimeType, Subset } from '../domain/truth'

export const DATASET_DIR = path.resolve(import.meta.dirname, '../../dataset')

export type DatasetFile = { folder: string; file: string; mimeType: MimeType; bytes: Uint8Array }

export type Dataset = {
  manifest: Manifest
  /**
   * Identifies the exact files a run used: SHA-256 over the manifest entries
   * (folder id, file names and their SHA-256) of the selected folders only, so
   * adding a new subset does not change the fingerprint of an existing one.
   */
  fingerprint: string
  truths: FolderTruth[]
  files: DatasetFile[]
}

export type Selection = { folders?: string[]; subset?: Subset }

export function fingerprintOf(manifest: Manifest, folderIds: string[]): string {
  const entries = manifest.folders.filter(f => folderIds.includes(f.id)).map(f => ({ id: f.id, files: f.files }))
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16)
}

export async function loadDataset(dir: string = DATASET_DIR, selection: Selection = {}): Promise<Dataset> {
  const onlyFolders = selection.folders
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')) as Manifest
  const truths: FolderTruth[] = []
  const files: DatasetFile[] = []
  for (const entry of manifest.folders) {
    if (onlyFolders && !onlyFolders.includes(entry.id)) continue
    if (selection.subset && entry.subset !== selection.subset) continue
    const folderDir = path.join(dir, 'folders', entry.id)
    const truth = JSON.parse(await readFile(path.join(folderDir, 'expected.json'), 'utf8')) as FolderTruth
    truths.push(truth)
    for (const f of entry.files) {
      const bytes = new Uint8Array(await readFile(path.join(folderDir, f.file)))
      const hash = createHash('sha256').update(bytes).digest('hex')
      if (hash !== f.sha256) throw new Error(`${entry.id}/${f.file} no coincide con el manifiesto`)
      const expected = truth.files.find(t => t.file === f.file)
      if (!expected) throw new Error(`${entry.id}/${f.file} no está en expected.json`)
      files.push({ folder: entry.id, file: f.file, mimeType: expected.mimeType, bytes })
    }
  }
  if (onlyFolders && truths.length !== onlyFolders.length) throw new Error(`Carpetas desconocidas en ${onlyFolders.join(',')}`)
  if (truths.length === 0) throw new Error('La selección no incluye ninguna carpeta')
  return { manifest, fingerprint: fingerprintOf(manifest, truths.map(t => t.id)), truths, files }
}
