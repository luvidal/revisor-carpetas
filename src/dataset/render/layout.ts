/**
 * A tiny page-layout model. Each synthetic document is described once as pages
 * of positioned items, then rendered to PDF (pdf-lib) or PNG (SVG + resvg).
 * Coordinates are in points with the origin at the TOP-left; text `y` is the
 * baseline.
 */

export type Rgb = readonly [number, number, number] // 0..1 each

export type TextItem = {
  kind: 'text'
  x: number
  y: number
  text: string
  size: number
  bold?: boolean
  color?: Rgb
  align?: 'left' | 'right' | 'center'
}

export type RectItem = {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  fill?: Rgb
  stroke?: Rgb
  strokeWidth?: number
}

export type LineItem = { kind: 'line'; x1: number; y1: number; x2: number; y2: number; color?: Rgb; width?: number }

/** Large rotated text drawn behind everything else. */
export type WatermarkItem = { kind: 'watermark'; text: string; size: number; color: Rgb; opacity: number; angle: number }

export type Item = TextItem | RectItem | LineItem | WatermarkItem

export type Page = { width: number; height: number; items: Item[] }

export const BLACK: Rgb = [0, 0, 0]
export const GRAY: Rgb = [0.4, 0.4, 0.4]
export const LIGHT_GRAY: Rgb = [0.9, 0.9, 0.9]
export const RED: Rgb = [0.7, 0.12, 0.1]
export const NAVY: Rgb = [0.1, 0.2, 0.4]

/** Small builder so document templates read top to bottom. */
export class PageBuilder {
  readonly items: Item[] = []
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  text(x: number, y: number, text: string, size = 10, opts: Omit<TextItem, 'kind' | 'x' | 'y' | 'text' | 'size'> = {}): this {
    this.items.push({ kind: 'text', x, y, text, size, ...opts })
    return this
  }

  rect(x: number, y: number, width: number, height: number, opts: Omit<RectItem, 'kind' | 'x' | 'y' | 'width' | 'height'> = {}): this {
    this.items.push({ kind: 'rect', x, y, width, height, ...opts })
    return this
  }

  line(x1: number, y1: number, x2: number, y2: number, color: Rgb = GRAY, width = 0.6): this {
    this.items.push({ kind: 'line', x1, y1, x2, y2, color, width })
    return this
  }

  watermark(text: string, size: number, color: Rgb = RED, opacity = 0.12, angle = 35): this {
    this.items.push({ kind: 'watermark', text, size, color, opacity, angle })
    return this
  }

  build(): Page {
    // Shapes, then the watermark, then text: the watermark stays visible over
    // filled backgrounds but never covers the text.
    const order = { rect: 0, line: 0, watermark: 1, text: 2 } as const
    const items = [...this.items].sort((a, b) => order[a.kind] - order[b.kind])
    return { width: this.width, height: this.height, items }
  }
}

/** The label every synthetic document carries, top and bottom. */
export const SYNTHETIC_BANNER = 'MUESTRA SINTÉTICA · DATOS FICTICIOS · NO ES UN DOCUMENTO VÁLIDO'
export const SYNTHETIC_FOOTER =
  'Documento ficticio generado para pruebas de software. Persona, empresa, RUT y montos inventados.'

/** Adds the synthetic banner, footer and diagonal watermark to a page. */
export function markSynthetic(page: PageBuilder): PageBuilder {
  const { width, height } = page
  const k = width / 612 // sizes are tuned for a letter-size page and scale with width
  page.watermark('MUESTRA SINTÉTICA', Math.round(width / 9))
  page.rect(0, 0, width, 22 * k, { fill: [0.98, 0.9, 0.9] })
  page.text(width / 2, 15 * k, SYNTHETIC_BANNER, 9 * k, { bold: true, color: RED, align: 'center' })
  page.text(width / 2, height - 12 * k, SYNTHETIC_FOOTER, 7 * k, { color: RED, align: 'center' })
  return page
}

/** Greedy word wrap by character count (good enough for Helvetica/Arial body text). */
export function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(/\s+/)) {
    if (current && current.length + 1 + word.length > maxChars) {
      lines.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) lines.push(current)
  return lines
}
