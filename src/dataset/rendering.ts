/** How a synthetic file is produced from its layout pages, and a Spanish label for reports. */
import type { MimeType } from '../domain/truth'
import type { Page } from './render/layout'
import { renderPdf } from './render/pdf'
import { degrade, encodeJpeg, encodePng, rasterPdf, type Degradation, type Rotation } from './render/raster'

export type Rendering =
  /** Text PDF, optionally with a /Rotate attribute. */
  | { kind: 'pdf'; file?: string; rotate?: Rotation }
  /** Image-only PDF, as a scanner produces. */
  | { kind: 'scan'; file?: string; degradation: Degradation }
  /** A single image file: a phone photo, a compressed picture, a rotated capture. */
  | { kind: 'image'; file?: string; format: 'png' | 'jpeg'; quality?: number; degradation: Degradation }

export type RenderedFile = { bytes: Uint8Array; mimeType: MimeType; extension: string; label: string; vector: boolean }

export function describe(r: Rendering): string {
  if (r.kind === 'pdf') return r.rotate ? `PDF vectorial girado ${r.rotate}°` : 'PDF vectorial'
  const d = r.degradation
  const parts: string[] = []
  if (r.kind === 'scan') parts.push(`PDF escaneado a ${d.dpi} ppp`)
  else parts.push(`${d.background === 'desk' ? 'foto' : 'imagen'} ${r.format.toUpperCase()} a ${d.dpi} ppp`)
  if (d.perspective) parts.push('con perspectiva')
  if (d.shadow) parts.push('con sombra')
  if (d.noise) parts.push('con ruido')
  if (d.skew) parts.push(`inclinado ${Math.abs(d.skew)}°`)
  if (d.rotate) parts.push(`girado ${d.rotate}°`)
  if (r.kind === 'image' && r.format === 'jpeg' && (r.quality ?? 80) <= 20) parts.push(`muy comprimido (calidad ${r.quality})`)
  else if (r.kind === 'image' && r.format === 'jpeg') parts.push(`calidad ${r.quality ?? 80}`)
  return parts.join(', ')
}

export async function renderWith(r: Rendering, pages: Page[], title: string): Promise<RenderedFile> {
  const label = describe(r)
  switch (r.kind) {
    case 'pdf':
      return { bytes: await renderPdf(pages, title, r.rotate ?? 0), mimeType: 'application/pdf', extension: 'pdf', label, vector: true }
    case 'scan': {
      const rasters = pages.map((p, i) => ({ raster: degrade(p, { ...r.degradation, seed: r.degradation.seed + i }), dpi: r.degradation.dpi }))
      return { bytes: await rasterPdf(rasters, title), mimeType: 'application/pdf', extension: 'pdf', label, vector: false }
    }
    case 'image': {
      if (pages.length !== 1) throw new Error('Una imagen tiene una sola página')
      const raster = degrade(pages[0]!, r.degradation)
      return r.format === 'jpeg'
        ? { bytes: encodeJpeg(raster, r.quality ?? 80), mimeType: 'image/jpeg', extension: 'jpg', label, vector: false }
        : { bytes: encodePng(raster), mimeType: 'image/png', extension: 'png', label, vector: false }
    }
  }
}
