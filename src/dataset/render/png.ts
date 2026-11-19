/**
 * Renders a layout page to PNG: layout -> SVG -> resvg. Optional "photo"
 * effects (rotation, blur, background, uneven lighting) imitate a document
 * photographed with a phone. Text uses the machine's system fonts, so the
 * committed PNGs (with their SHA-256 in the manifest) are the dataset of record.
 */
import { Resvg } from '@resvg/resvg-js'
import type { Item, Page, Rgb } from './layout'

export type PhotoEffect = {
  /** Degrees, clockwise. */
  rotate: number
  /** Gaussian blur standard deviation, in page points. */
  blur: number
  /** Margin of "desk" around the page, in page points. */
  margin: number
  /** Colour around the page (default: a desk). */
  background?: string
  /** Uneven warm lighting over the page (default: on). */
  lighting?: boolean
}

const FONT = 'Arial, Helvetica, sans-serif'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function hex(c: Rgb | undefined): string {
  const [r, g, b] = c ?? [0, 0, 0]
  return '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
}

function itemSvg(item: Item, page: Page): string {
  switch (item.kind) {
    case 'text': {
      const anchor = item.align === 'right' ? 'end' : item.align === 'center' ? 'middle' : 'start'
      const weight = item.bold ? 'bold' : 'normal'
      return `<text x="${item.x}" y="${item.y}" font-size="${item.size}" font-weight="${weight}" text-anchor="${anchor}" fill="${hex(item.color)}">${escapeXml(item.text)}</text>`
    }
    case 'rect': {
      const fill = item.fill ? hex(item.fill) : 'none'
      const stroke = item.stroke ? ` stroke="${hex(item.stroke)}" stroke-width="${item.strokeWidth ?? 1}"` : ''
      return `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" fill="${fill}"${stroke}/>`
    }
    case 'line':
      return `<line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}" stroke="${hex(item.color)}" stroke-width="${item.width ?? 0.6}"/>`
    case 'watermark': {
      const cx = page.width / 2
      const cy = page.height / 2
      return `<text x="${cx}" y="${cy}" font-size="${item.size}" font-weight="bold" text-anchor="middle" fill="${hex(item.color)}" fill-opacity="${item.opacity}" transform="rotate(${-item.angle} ${cx} ${cy})">${escapeXml(item.text)}</text>`
    }
  }
}

export function pageToSvg(page: Page, photo?: PhotoEffect): string {
  const body = page.items.map(item => itemSvg(item, page)).join('\n')
  if (!photo) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${page.height}" font-family="${FONT}">
<rect width="${page.width}" height="${page.height}" fill="#ffffff"/>
${body}
</svg>`
  }
  const w = page.width + photo.margin * 2
  const h = page.height + photo.margin * 2
  const cx = w / 2
  const cy = h / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" font-family="${FONT}">
<defs>
  <filter id="blur"><feGaussianBlur stdDeviation="${photo.blur}"/></filter>
  <linearGradient id="light" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
    <stop offset="1" stop-color="#5a4a30" stop-opacity="0.18"/>
  </linearGradient>
</defs>
<rect width="${w}" height="${h}" fill="${photo.background ?? '#6f6a62'}"/>
<g${photo.blur ? ' filter="url(#blur)"' : ''} transform="rotate(${photo.rotate} ${cx} ${cy}) translate(${photo.margin} ${photo.margin})">
  <rect width="${page.width}" height="${page.height}" fill="#fbfaf6"/>
  ${body}
  ${photo.lighting === false ? '' : `<rect width="${page.width}" height="${page.height}" fill="url(#light)"/>`}
</g>
</svg>`
}

/** PNG bytes for a page; `scale` converts points to pixels (2 ≈ 144 dpi). */
export function renderPng(page: Page, scale: number, photo?: PhotoEffect): Uint8Array {
  const resvg = new Resvg(pageToSvg(page, photo), {
    fitTo: { mode: 'zoom', value: scale },
    font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
  })
  return new Uint8Array(resvg.render().asPng())
}
