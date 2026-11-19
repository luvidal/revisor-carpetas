/**
 * Normalisers: turn the many ways a value can be written into one canonical
 * form, so the evals count real extraction errors and not formatting
 * differences. Each returns null when the input is empty or unparseable.
 */
import { normalizeRut } from './rut'

export { normalizeRut }

const MONTHS: Record<string, number> = {
  ENE: 1, ENERO: 1, JAN: 1, FEB: 2, FEBRERO: 2, MAR: 3, MARZO: 3, ABR: 4, ABRIL: 4, APR: 4,
  MAY: 5, MAYO: 5, JUN: 6, JUNIO: 6, JUL: 7, JULIO: 7, AGO: 8, AGOSTO: 8, AUG: 8,
  SEP: 9, SEPT: 9, SEPTIEMBRE: 9, SETIEMBRE: 9, OCT: 10, OCTUBRE: 10, NOV: 11, NOVIEMBRE: 11,
  DIC: 12, DICIEMBRE: 12, DEC: 12,
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

/** Uppercase, no accents, no punctuation, single spaces. */
export function normalizeText(v: unknown): string | null {
  if (isBlank(v) || (typeof v !== 'string' && typeof v !== 'number')) return null
  const out = String(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[.,;:'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return out || null
}

/** Person names: same words in any order ("ROJAS TAPIA MARIA" = "Maria Rojas Tapia"). */
export function normalizeName(v: unknown): string | null {
  const text = normalizeText(v)
  return text ? text.split(' ').sort().join(' ') : null
}

/** Pension funds and health insurers: "AFP Quillay" = "QUILLAY", "Isapre Vida Sur" = "Vida Sur". */
export function normalizeInstitution(v: unknown): string | null {
  const text = normalizeText(v)
  if (!text) return null
  const stripped = text.replace(/\b(AFP|ISAPRE|S A|SA)\b/g, ' ').replace(/\s+/g, ' ').trim()
  return stripped || text
}

/** Money in CLP as an integer: 1071667, "1.071.667", "$ 1.071.667", "1071667.0". */
export function normalizeAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null
  if (typeof v !== 'string' || isBlank(v)) return null
  let s = v.replace(/[$\sCLP]/gi, '')
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.') // 1.234.567,89
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '') // 1,234,567.89
  else s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n) : null
}

/** Small counts (days worked, months without contributions). */
export function normalizeInteger(v: unknown): number | null {
  const n = normalizeAmount(v)
  return n === null ? null : n
}

function iso(y: number, m: number, d?: number): string | null {
  if (!Number.isInteger(y) || y < 1900 || y > 2100 || m < 1 || m > 12) return null
  if (d === undefined) return `${y}-${String(m).padStart(2, '0')}`
  if (d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function monthNumber(word: string): number | undefined {
  return MONTHS[word.replace(/\.$/, '')]
}

/** Full dates to "YYYY-MM-DD": ISO, "dd-mm-yyyy", "dd/mm/yyyy", "02 MAR 1990", "1 de junio de 2026". */
export function normalizeDate(v: unknown): string | null {
  const text = normalizeText(typeof v === 'string' ? v.replace(/[.,]/g, ' ') : v)
  if (!text) return null
  let m = /^(\d{4})[-/ ](\d{1,2})[-/ ](\d{1,2})(?:T.*| .*)?$/.exec(text.replace(/\s+T/, 'T'))
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[-/ ](\d{1,2})[-/ ](\d{4})$/.exec(text)
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]))
  m = /^(\d{1,2}) (?:DE )?([A-Z]+) (?:DE |DEL )?(\d{4})$/.exec(text)
  if (m) {
    const month = monthNumber(m[2]!)
    return month ? iso(Number(m[3]), month, Number(m[1])) : null
  }
  return null
}

/** Months to "YYYY-MM": "2026-06", "2026-06-01", "06-2026", "06/2026", "Junio 2026", "JUN 2026". */
export function normalizeMonth(v: unknown): string | null {
  const text = normalizeText(typeof v === 'string' ? v.replace(/[.,]/g, ' ') : v)
  if (!text) return null
  let m = /^(\d{4})[-/ ](\d{1,2})(?:[-/ ]\d{1,2})?(?:T.*)?$/.exec(text)
  if (m) return iso(Number(m[1]), Number(m[2]))
  m = /^(\d{1,2})[-/ ](\d{4})$/.exec(text)
  if (m) return iso(Number(m[2]), Number(m[1]))
  m = /^([A-Z]+) (?:DE |DEL )?(\d{4})$/.exec(text)
  if (m) {
    const month = monthNumber(m[1]!)
    return month ? iso(Number(m[2]), month) : null
  }
  const date = normalizeDate(v)
  return date ? date.slice(0, 7) : null
}

export function normalizeSex(v: unknown): string | null {
  const text = normalizeText(v)
  if (!text) return null
  if (text === 'F' || text.startsWith('FEM') || text === 'MUJER') return 'F'
  if (text === 'M' || text.startsWith('MASC') || text === 'HOMBRE') return 'M'
  return text
}

const NATIONALITIES: Record<string, string> = { CHILENA: 'CHL', CHILENO: 'CHL', CHILE: 'CHL', PERUANA: 'PER', PERUANO: 'PER', PERU: 'PER' }

/** Nationality as an ISO-3 code where known: "CHILENA" = "CHL". */
export function normalizeNationality(v: unknown): string | null {
  const text = normalizeText(v)
  return text ? (NATIONALITIES[text] ?? text) : null
}
