/**
 * Per-run stamp. docs2json caches extracted fields per tenant by content hash,
 * so re-sending a byte-identical file returns the cached answer: no model call,
 * near-zero latency, and a fake 100% consistency. Each run therefore stamps
 * every file with its run tag before uploading:
 * - PDF: a small "ref. ejecución <tag>" line at the foot of every page (visible
 *   text, so it also changes each page if the engine hashes split pages).
 * - PNG: a `tEXt` metadata chunk (pixels unchanged).
 * - JPEG: a COM (comment) segment right after the start marker (pixels unchanged).
 */
import { crc32 } from 'node:zlib'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export async function stampPdf(bytes: Uint8Array, tag: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const page of doc.getPages()) {
    page.drawText(`ref. ejecución ${tag}`, { x: 24, y: 6, size: 5, font, color: rgb(0.55, 0.55, 0.55) })
  }
  return doc.save()
}

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

export function stampPng(bytes: Uint8Array, tag: string): Uint8Array {
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error('No es un PNG')
  const iendAt = bytes.length - 12 // IEND is always the last 12-byte chunk
  const iendType = new TextDecoder().decode(bytes.subarray(iendAt + 4, iendAt + 8))
  if (iendType !== 'IEND') throw new Error('PNG sin IEND al final')
  const data = new TextEncoder().encode(`Comment\0revisor-carpetas ${tag}`)
  const chunk = new Uint8Array(12 + data.length)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(new TextEncoder().encode('tEXt'), 4)
  chunk.set(data, 8)
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)))
  const out = new Uint8Array(bytes.length + chunk.length)
  out.set(bytes.subarray(0, iendAt), 0)
  out.set(chunk, iendAt)
  out.set(bytes.subarray(iendAt), iendAt + chunk.length)
  return out
}

export function stampJpeg(bytes: Uint8Array, tag: string): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('No es un JPEG')
  const text = new TextEncoder().encode(`revisor-carpetas ${tag}`)
  const segment = new Uint8Array(4 + text.length)
  segment.set([0xff, 0xfe, (text.length + 2) >> 8, (text.length + 2) & 0xff])
  segment.set(text, 4)
  const out = new Uint8Array(bytes.length + segment.length)
  out.set(bytes.subarray(0, 2), 0)
  out.set(segment, 2)
  out.set(bytes.subarray(2), 2 + segment.length)
  return out
}

export async function stampFile(bytes: Uint8Array, mimeType: string, tag: string): Promise<Uint8Array> {
  if (mimeType === 'application/pdf') return stampPdf(bytes, tag)
  if (mimeType === 'image/png') return stampPng(bytes, tag)
  if (mimeType === 'image/jpeg') return stampJpeg(bytes, tag)
  throw new Error(`Tipo sin sello: ${mimeType}`)
}
