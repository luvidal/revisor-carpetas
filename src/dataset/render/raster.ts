/**
 * Pixel-level degradations for the "difícil" subset: a page is rendered with
 * resvg and then photographed (perspective, shadow), scanned (low resolution,
 * noise, grey, skew), turned 90/180 degrees and/or saved as a heavily
 * compressed JPEG. All randomness comes from a seeded generator, so the output
 * only depends on the code and the machine's fonts.
 */
import { crc32, deflateSync } from 'node:zlib'
import { Resvg } from '@resvg/resvg-js'
import jpeg from 'jpeg-js'
import { PDFDocument } from 'pdf-lib'
import type { Page } from './layout'
import { pageToSvg } from './png'

export type Raster = { width: number; height: number; data: Uint8Array } // RGBA

export type Rotation = 0 | 90 | 180 | 270

/** How a page is degraded before it is saved. */
export type Degradation = {
  /** Render resolution in dots per inch (72 = one pixel per point). */
  dpi: number
  /** Small rotation of the page on the scanner bed or the desk, in degrees. */
  skew?: number
  /** 0..1: how far the corners move when photographed at an angle. */
  perspective?: number
  /** Soft shadow across the page (a hand or a phone over it). */
  shadow?: boolean
  /** 0..1: sensor/scanner noise; also turns the image grey. */
  noise?: number
  /** Whole-image rotation in 90° steps, as when a page is fed sideways. */
  rotate?: Rotation
  /** Surrounding colour: a desk for photos, a scanner lid for scans. */
  background: 'desk' | 'scanner'
  seed: number
}

const DESK: [number, number, number] = [111, 106, 98]

/** Deterministic PRNG (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rasterize(page: Page, d: Pick<Degradation, 'dpi' | 'skew' | 'background'>): Raster {
  const bg = d.background === 'desk' ? '#6f6a62' : '#ecece8'
  const svg = d.skew
    ? pageToSvg(page, { rotate: d.skew, blur: 0, margin: 28, background: bg, lighting: false })
    : pageToSvg(page)
  const rendered = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: d.dpi / 72 },
    font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
  }).render()
  return { width: rendered.width, height: rendered.height, data: new Uint8Array(rendered.pixels) }
}

/** Lossless rotation in 90° steps (clockwise). */
export function rotate(r: Raster, angle: Rotation): Raster {
  if (angle === 0) return r
  const { width: w, height: h, data } = r
  const outW = angle === 180 ? w : h
  const outH = angle === 180 ? h : w
  const out = new Uint8Array(data.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [nx, ny] = angle === 90 ? [h - 1 - y, x] : angle === 180 ? [w - 1 - x, h - 1 - y] : [y, w - 1 - x]
      out.set(data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (ny * outW + nx) * 4)
    }
  }
  return { width: outW, height: outH, data: out }
}

type Pt = [number, number]

/** 3x3 projective transform (row-major, h33 = 1) mapping each `from` corner to its `to` corner. */
export function homography(from: Pt[], to: Pt[]): number[] {
  const a: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i]!
    const [u, v] = to[i]!
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < 8; c++) {
    let pivot = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[pivot]![c]!)) pivot = r
    ;[a[c], a[pivot]] = [a[pivot]!, a[c]!]
    ;[b[c], b[pivot]] = [b[pivot]!, b[c]!]
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = a[r]![c]! / a[c]![c]!
      for (let k = c; k < 8; k++) a[r]![k]! -= f * a[c]![k]!
      b[r]! -= f * b[c]!
    }
  }
  return [...b.map((v, i) => v / a[i]![i]!), 1]
}

export function applyHomography(m: number[], [x, y]: Pt): Pt {
  const w = m[6]! * x + m[7]! * y + m[8]!
  return [(m[0]! * x + m[1]! * y + m[2]!) / w, (m[3]! * x + m[4]! * y + m[5]!) / w]
}

/** Photographs the page at an angle: corners pulled inward, page on a desk. */
export function perspective(r: Raster, strength: number, rand: () => number): Raster {
  const margin = Math.round(Math.max(r.width, r.height) * 0.06)
  const W = r.width + margin * 2
  const H = r.height + margin * 2
  const k = strength * 0.12
  const jitter = () => (0.6 + 0.4 * rand()) * k
  // Destination quad: the far edge (top) is narrower, like a phone held at an angle.
  const dst: Pt[] = [
    [margin + r.width * jitter(), margin + r.height * jitter() * 0.4],
    [margin + r.width * (1 - jitter()), margin + r.height * jitter() * 0.2],
    [margin + r.width * (1 - jitter() * 0.2), margin + r.height],
    [margin + r.width * jitter() * 0.3, margin + r.height * (1 - jitter() * 0.15)],
  ]
  const src: Pt[] = [
    [0, 0],
    [r.width, 0],
    [r.width, r.height],
    [0, r.height],
  ]
  const back = homography(dst, src)
  const out = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [sx, sy] = applyHomography(back, [x + 0.5, y + 0.5])
      const o = (y * W + x) * 4
      if (sx < 0 || sy < 0 || sx >= r.width - 1 || sy >= r.height - 1) {
        out[o] = DESK[0]
        out[o + 1] = DESK[1]
        out[o + 2] = DESK[2]
        out[o + 3] = 255
        continue
      }
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const fx = sx - x0
      const fy = sy - y0
      for (let c = 0; c < 4; c++) {
        const p = (yy: number, xx: number) => r.data[(yy * r.width + xx) * 4 + c]!
        out[o + c] = Math.round(
          p(y0, x0) * (1 - fx) * (1 - fy) + p(y0, x0 + 1) * fx * (1 - fy) + p(y0 + 1, x0) * (1 - fx) * fy + p(y0 + 1, x0 + 1) * fx * fy,
        )
      }
    }
  }
  return { width: W, height: H, data: out }
}

/** Soft diagonal shadow plus a warm cast, as under indoor light. */
export function shadow(r: Raster): Raster {
  const out = new Uint8Array(r.data)
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const t = (x / r.width) * 0.55 + (y / r.height) * 0.45
      const s = Math.min(1, Math.max(0, (t - 0.42) / 0.25))
      const shade = 1 - 0.38 * s * s * (3 - 2 * s)
      const o = (y * r.width + x) * 4
      out[o] = Math.round(out[o]! * shade)
      out[o + 1] = Math.round(out[o + 1]! * shade * 0.97)
      out[o + 2] = Math.round(out[o + 2]! * shade * 0.9)
    }
  }
  return { ...r, data: out }
}

/** Grey scanner look: slight blur, lower contrast, noise and specks. */
export function scanNoise(r: Raster, amount: number, rand: () => number): Raster {
  const { width: w, height: h, data } = r
  const grey = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) grey[i] = 0.3 * data[i * 4]! + 0.59 * data[i * 4 + 1]! + 0.11 * data[i * 4 + 2]!
  const out = new Uint8Array(data.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy
          const xx = x + dx
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) {
            sum += grey[yy * w + xx]!
            n += 1
          }
        }
      }
      let v = 40 + (sum / n) * 0.78 + (rand() - 0.5) * 2 * amount * 90
      const speck = rand()
      if (speck < amount * 0.004) v = 30
      else if (speck > 1 - amount * 0.002) v = 255
      const g = Math.max(0, Math.min(255, Math.round(v)))
      const o = (y * w + x) * 4
      out[o] = g
      out[o + 1] = g
      out[o + 2] = g
      out[o + 3] = 255
    }
  }
  return { width: w, height: h, data: out }
}

export function degrade(page: Page, d: Degradation): Raster {
  const rand = prng(d.seed)
  let r = rasterize(page, d)
  if (d.perspective) r = perspective(r, d.perspective, rand)
  if (d.shadow) r = shadow(r)
  if (d.noise) r = scanNoise(r, d.noise, rand)
  return rotate(r, d.rotate ?? 0)
}

// ------------------------------------------------------------------ encoders

/** Minimal PNG encoder (8-bit RGB, or grey when every pixel is grey). */
export function encodePng(r: Raster): Uint8Array {
  const { width: w, height: h, data } = r
  let isGrey = true
  for (let i = 0; i < w * h && isGrey; i++) isGrey = data[i * 4] === data[i * 4 + 1] && data[i * 4] === data[i * 4 + 2]
  const channels = isGrey ? 1 : 3
  const rows = new Uint8Array(h * (1 + w * channels))
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * channels)
    rows[rowStart] = 0 // filter: none
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < channels; c++) rows[rowStart + 1 + x * channels + c] = data[(y * w + x) * 4 + c]!
    }
  }
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, body.length)
    out.set(new TextEncoder().encode(type), 4)
    out.set(body, 8)
    view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
    return out
  }
  const ihdr = new Uint8Array(13)
  const v = new DataView(ihdr.buffer)
  v.setUint32(0, w)
  v.setUint32(4, h)
  ihdr.set([8, isGrey ? 0 : 2, 0, 0, 0], 8)
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(rows, { level: 9 }))),
    chunk('IEND', new Uint8Array()),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export function encodeJpeg(r: Raster, quality: number): Uint8Array {
  return new Uint8Array(jpeg.encode({ width: r.width, height: r.height, data: r.data }, quality).data)
}

/** Image-only PDF, one raster per page, as a scanner produces (no text layer). */
export async function rasterPdf(pages: Array<{ raster: Raster; dpi: number }>, title: string, quality = 70): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fixed = new Date('2026-11-16T12:00:00Z')
  doc.setTitle(`${title} (MUESTRA SINTÉTICA)`)
  doc.setAuthor('revisor-carpetas: generador de datos sintéticos')
  doc.setProducer('revisor-carpetas')
  doc.setCreator('revisor-carpetas')
  doc.setCreationDate(fixed)
  doc.setModificationDate(fixed)
  for (const { raster, dpi } of pages) {
    const image = await doc.embedJpg(encodeJpeg(raster, quality))
    const page = doc.addPage([(raster.width * 72) / dpi, (raster.height * 72) / dpi])
    page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
  }
  return doc.save()
}

