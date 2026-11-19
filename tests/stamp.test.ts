import { createHash } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import jpeg from 'jpeg-js'
import { stampJpeg, stampPdf, stampPng } from '../src/evals/stamp'
import { encodeJpeg } from '../src/dataset/render/raster'
import { renderPdf } from '../src/dataset/render/pdf'
import { renderPng } from '../src/dataset/render/png'
import { PageBuilder } from '../src/dataset/render/layout'

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

function pngChunks(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const types: string[] = []
  for (let at = 8; at < bytes.length; ) {
    const len = view.getUint32(at)
    types.push(new TextDecoder().decode(bytes.subarray(at + 4, at + 8)))
    at += 12 + len
  }
  return types
}

describe('per-run stamp', () => {
  const page = new PageBuilder(200, 100).text(10, 50, 'hola', 12).build()

  it('PDF: changes the bytes per tag and keeps every page', async () => {
    const base = await renderPdf([page, page], 'prueba')
    const a = await stampPdf(base, 'c1')
    const b = await stampPdf(base, 'c2')
    expect(new Set([sha(base), sha(a), sha(b)]).size).toBe(3)
    const doc = await PDFDocument.load(a)
    expect(doc.getPageCount()).toBe(2)
  })

  it('PNG: adds a tEXt chunk before IEND and leaves the image data alone', () => {
    const base = renderPng(page, 1)
    const stamped = stampPng(base, 'c1')
    expect(sha(stamped)).not.toBe(sha(base))
    const chunks = pngChunks(stamped)
    expect(chunks.at(-1)).toBe('IEND')
    expect(chunks.at(-2)).toBe('tEXt')
    expect(chunks.filter(c => c === 'IDAT')).toEqual(pngChunks(base).filter(c => c === 'IDAT'))
    expect(new TextDecoder().decode(stamped)).toContain('revisor-carpetas c1')
  })

  it('PNG: rejects non-PNG input', () => {
    expect(() => stampPng(new Uint8Array([1, 2, 3]), 'x')).toThrow('No es un PNG')
  })

  it('JPEG: adds a comment segment and still decodes to the same pixels', () => {
    const raster = { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4).fill(200) }
    const base = encodeJpeg(raster, 50)
    const stamped = stampJpeg(base, 'c1')
    expect(sha(stamped)).not.toBe(sha(base))
    expect([stamped[2], stamped[3]]).toEqual([0xff, 0xfe])
    expect(jpeg.decode(stamped).data).toEqual(jpeg.decode(base).data)
    expect(() => stampJpeg(new Uint8Array([1, 2]), 'x')).toThrow('No es un JPEG')
  })
})
