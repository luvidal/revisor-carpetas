/**
 * Renders the demo as a short terminal video: docs/demo.mp4 and docs/demo.gif.
 *   npm run demo:video
 * Each frame is an SVG terminal drawn with the system's Menlo font and
 * rendered with resvg; ffmpeg (installed locally, not a project dependency)
 * stitches the frames with their durations. The text comes from the real demo
 * run in replay over recorded docs2json responses: nothing is staged.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { demoBlocks } from './demo'

const ROOT = path.resolve(import.meta.dirname, '..')
const FRAMES = path.join(ROOT, '.cache/video-frames')
const FOLDERS = ['f01', 'f08', 'f10'] // ready · RUT mismatch · salary mismatch
const COMMAND = `npm run demo -- ${FOLDERS.join(' ')}`

const W = 1280
const H = 720
const BAR = 34
const PAD = 18
const FONT = 15
const LINE = 19.5
const ROWS = Math.floor((H - BAR - PAD * 2) / LINE)

const C = {
  bg: '#1d1f24',
  bar: '#2b2e35',
  text: '#d7dae0',
  dim: '#8b93a1',
  prompt: '#7fd1a6',
  title: '#ffffff',
  green: '#7fd1a6',
  amber: '#f0c27b',
  red: '#f28b82',
  rule: '#8ab4f8',
  quote: '#b9c3d6',
}

function colorOf(line: string): { fill: string; bold?: boolean } {
  if (line.startsWith('$ ')) return { fill: C.prompt, bold: true }
  if (line.startsWith('» ')) return { fill: C.title, bold: true }
  if (line.includes('Decisión: LISTA')) return { fill: C.green, bold: true }
  if (line.includes('Decisión: PEDIR')) return { fill: C.amber, bold: true }
  if (line.includes('Decisión: ESCALAR')) return { fill: C.red, bold: true }
  if (line.trimStart().startsWith('• [')) return { fill: C.amber }
  if (line.trimStart().startsWith('Política')) return { fill: C.rule, bold: true }
  if (line.startsWith('       ')) return { fill: C.quote }
  if (line.trimStart().startsWith('Esperada')) return { fill: line.includes('✓') ? C.green : C.red }
  if (/^\s+(Evidencia|Recorrido|Solicitante)|^ {16}/.test(line) || line.startsWith('MUESTRA') || line.startsWith('revisor-carpetas')) return { fill: C.dim }
  return { fill: C.text }
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function frameSvg(lines: string[], cursor: boolean): string {
  const visible = lines.slice(-ROWS)
  const text = visible
    .map((line, i) => {
      const { fill, bold } = colorOf(line)
      const y = BAR + PAD + LINE * (i + 0.8)
      const caret = cursor && i === visible.length - 1 ? `<tspan fill="${C.prompt}">▍</tspan>` : ''
      return `<text x="${PAD}" y="${y}" fill="${fill}"${bold ? ' font-weight="bold"' : ''} xml:space="preserve">${esc(line)}${caret}</text>`
    })
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Menlo, Monaco, 'DejaVu Sans Mono', monospace" font-size="${FONT}">
<rect width="${W}" height="${H}" fill="${C.bg}"/>
<rect width="${W}" height="${BAR}" fill="${C.bar}"/>
<circle cx="20" cy="17" r="6" fill="#ff5f57"/><circle cx="40" cy="17" r="6" fill="#febc2e"/><circle cx="60" cy="17" r="6" fill="#28c840"/>
<text x="${W / 2}" y="22" fill="${C.dim}" font-size="13" text-anchor="middle">revisor-carpetas · el agente sobre respuestas grabadas de docs2json (replay, sin costo) · MUESTRA SINTÉTICA</text>
${text}
</svg>`
}

async function main(): Promise<void> {
  const { header, blocks } = await demoBlocks(FOLDERS)
  type Frame = { lines: string[]; seconds: number; cursor?: boolean }
  const frames: Frame[] = []
  const screen: string[] = []
  frames.push({ lines: ['$ '], seconds: 0.8, cursor: true })
  for (let i = 4; i <= COMMAND.length; i += 4) frames.push({ lines: [`$ ${COMMAND.slice(0, i)}`], seconds: 0.07, cursor: true })
  screen.push(`$ ${COMMAND}`)
  frames.push({ lines: [...screen], seconds: 0.6, cursor: true })
  screen.push('', ...header, '')
  frames.push({ lines: [...screen], seconds: 2.5 })
  const pauses = [6, 11, 15] // seconds to read each folder
  blocks.forEach((block, b) => {
    for (const line of block) {
      screen.push(line)
      frames.push({ lines: [...screen], seconds: 0.07 })
    }
    frames.at(-1)!.seconds = pauses[b] ?? 8
    screen.push('')
  })
  screen.push(`$ `)
  frames.push({ lines: [...screen], seconds: 3, cursor: true })

  await rm(FRAMES, { recursive: true, force: true })
  await mkdir(FRAMES, { recursive: true })
  const list: string[] = []
  for (const [i, f] of frames.entries()) {
    const file = path.join(FRAMES, `f${String(i).padStart(4, '0')}.png`)
    const png = new Resvg(frameSvg(f.lines, !!f.cursor), { font: { loadSystemFonts: true, defaultFontFamily: 'Menlo' } }).render().asPng()
    await writeFile(file, png)
    list.push(`file '${file}'`, `duration ${f.seconds}`)
  }
  list.push(`file '${path.join(FRAMES, `f${String(frames.length - 1).padStart(4, '0')}.png`)}'`) // concat needs the last frame twice
  const listFile = path.join(FRAMES, 'frames.txt')
  await writeFile(listFile, list.join('\n') + '\n')
  const total = frames.reduce((s, f) => s + f.seconds, 0)
  const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, ...args], { stdio: 'inherit' })
  ff(['-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '22', '-movflags', '+faststart', path.join(ROOT, 'docs/demo.mp4')])
  ff(['-vf', 'fps=8,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle', path.join(ROOT, 'docs/demo.gif')])
  console.log(`${frames.length} cuadros, ${total.toFixed(1)} s · docs/demo.mp4 y docs/demo.gif`)
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
