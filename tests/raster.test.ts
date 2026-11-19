import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { PageBuilder } from '../src/dataset/render/layout'
import { applyHomography, degrade, encodePng, homography, prng, rotate, type Raster } from '../src/dataset/render/raster'

const raster = (w: number, h: number, fill: (x: number, y: number) => number): Raster => {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([fill(x, y), fill(x, y), fill(x, y), 255], (y * w + x) * 4)
  return { width: w, height: h, data }
}
const at = (r: Raster, x: number, y: number) => r.data[(y * r.width + x) * 4]

describe('raster degradations', () => {
  it('homography maps each corner onto its target', () => {
    const from: Array<[number, number]> = [[0, 0], [100, 0], [100, 50], [0, 50]]
    const to: Array<[number, number]> = [[10, 5], [90, 0], [100, 60], [0, 55]]
    const m = homography(from, to)
    from.forEach((p, i) => {
      const [x, y] = applyHomography(m, p)
      expect(x).toBeCloseTo(to[i]![0], 6)
      expect(y).toBeCloseTo(to[i]![1], 6)
    })
  })

  it('rotates in exact 90° steps', () => {
    const r = raster(3, 2, (x, y) => x * 10 + y) // 3 wide, 2 tall
    const r90 = rotate(r, 90)
    expect([r90.width, r90.height]).toEqual([2, 3])
    expect(at(r90, 1, 0)).toBe(at(r, 0, 0)) // top-left goes to top-right
    const r180 = rotate(r, 180)
    expect(at(r180, 2, 1)).toBe(at(r, 0, 0))
    expect(rotate(rotate(r, 90), 270).data).toEqual(r.data)
  })

  it('is deterministic for a given seed', () => {
    const page = new PageBuilder(120, 80).text(10, 40, 'MUESTRA', 12).build()
    const d = { dpi: 72, perspective: 0.8, shadow: true, noise: 0.3, rotate: 90 as const, background: 'desk' as const, seed: 7 }
    expect(degrade(page, d).data).toEqual(degrade(page, d).data)
    expect(prng(1)()).toBe(prng(1)())
    expect(prng(1)()).not.toBe(prng(2)())
  })

  it('encodes a grey PNG whose pixels decode back', () => {
    const r = raster(4, 3, (x, y) => (x + y) * 20)
    const png = encodePng(r)
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const view = new DataView(png.buffer, png.byteOffset)
    expect([view.getUint32(16), view.getUint32(20), png[25]]).toEqual([4, 3, 0]) // width, height, colour type grey
    const idatLen = view.getUint32(33)
    const rows = inflateSync(png.subarray(41, 41 + idatLen))
    expect(rows[1 * 5 + 1 + 2]).toBe(at(r, 2, 1)) // row 1 (filter byte + 4 px), pixel x = 2
  })
})
