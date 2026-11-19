/**
 * Renders layout pages to a PDF with pdf-lib. Output is deterministic (fixed
 * metadata dates), so regenerating the dataset yields byte-identical files.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Item, Page, Rgb } from './layout'

const FIXED_DATE = new Date('2026-11-16T12:00:00Z')

function color(c: Rgb | undefined) {
  const [r, g, b] = c ?? [0, 0, 0]
  return rgb(r, g, b)
}

function drawItem(page: PDFPage, item: Item, fonts: { regular: PDFFont; bold: PDFFont }): void {
  const height = page.getHeight()
  switch (item.kind) {
    case 'text': {
      const font = item.bold ? fonts.bold : fonts.regular
      const width = font.widthOfTextAtSize(item.text, item.size)
      const x = item.align === 'right' ? item.x - width : item.align === 'center' ? item.x - width / 2 : item.x
      page.drawText(item.text, { x, y: height - item.y, size: item.size, font, color: color(item.color) })
      return
    }
    case 'rect':
      page.drawRectangle({
        x: item.x,
        y: height - item.y - item.height,
        width: item.width,
        height: item.height,
        ...(item.fill ? { color: color(item.fill) } : {}),
        ...(item.stroke ? { borderColor: color(item.stroke), borderWidth: item.strokeWidth ?? 1 } : {}),
      })
      return
    case 'line':
      page.drawLine({
        start: { x: item.x1, y: height - item.y1 },
        end: { x: item.x2, y: height - item.y2 },
        thickness: item.width ?? 0.6,
        color: color(item.color),
      })
      return
    case 'watermark': {
      const font = fonts.bold
      const width = font.widthOfTextAtSize(item.text, item.size)
      const rad = (item.angle * Math.PI) / 180
      const cx = page.getWidth() / 2
      const cy = height / 2
      page.drawText(item.text, {
        x: cx - (width / 2) * Math.cos(rad),
        y: cy - (width / 2) * Math.sin(rad),
        size: item.size,
        font,
        color: color(item.color),
        opacity: item.opacity,
        rotate: degrees(item.angle),
      })
      return
    }
  }
}

/** `rotate` sets the page's /Rotate attribute, as a scanner fed sideways or upside down does. */
export async function renderPdf(pages: Page[], title: string, rotate: 0 | 90 | 180 | 270 = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`${title} (MUESTRA SINTÉTICA)`)
  doc.setAuthor('revisor-carpetas: generador de datos sintéticos')
  doc.setProducer('revisor-carpetas')
  doc.setCreator('revisor-carpetas')
  doc.setCreationDate(FIXED_DATE)
  doc.setModificationDate(FIXED_DATE)
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  for (const layout of pages) {
    const page = doc.addPage([layout.width, layout.height])
    for (const item of layout.items) drawItem(page, item, fonts)
    if (rotate) page.setRotation(degrees(rotate))
  }
  return doc.save()
}
