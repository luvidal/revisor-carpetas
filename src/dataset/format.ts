/** Chilean formatting for the synthetic documents: money, dates, months. */

export const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

const MONTHS_ID_CARD = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'] as const

/** 1071667 -> "$ 1.071.667" */
export function clp(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  return `${sign}$ ${String(Math.abs(Math.round(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number?]
  return { y, m, d: d ?? 1 }
}

/** "2026-06-01" -> "01-06-2026" */
export function dmy(iso: string): string {
  const { y, m, d } = parts(iso)
  return `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`
}

/** "1990-03-02" -> "02 MAR 1990", as printed on a cédula. */
export function idCardDate(iso: string): string {
  const { y, m, d } = parts(iso)
  return `${String(d).padStart(2, '0')} ${MONTHS_ID_CARD[m - 1]} ${y}`
}

/** "2026-11-12" -> "12 de noviembre de 2026" */
export function longDate(iso: string): string {
  const { y, m, d } = parts(iso)
  return `${d} de ${MONTHS_ES[m - 1]} de ${y}`
}

/** "2026-10" -> "Octubre 2026" */
export function monthTitle(month: string): string {
  const { y, m } = parts(month)
  const name = MONTHS_ES[m - 1]!
  return `${name[0]!.toUpperCase()}${name.slice(1)} ${y}`
}

/** "2026-10" -> "10-2026", the format AFP certificates print. */
export function mmYyyy(month: string): string {
  const { y, m } = parts(month)
  return `${String(m).padStart(2, '0')}-${y}`
}

/** Months between two "YYYY-MM" values, inclusive, in order. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  let { y, m } = parts(from)
  const end = parts(to)
  while (y < end.y || (y === end.y && m <= end.m)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m === 13) {
      m = 1
      y += 1
    }
  }
  return out
}

/** Whole months from `from` to `to` ("YYYY-MM"), e.g. 2026-02 -> 2026-10 = 8. */
export function monthsBetween(from: string, to: string): number {
  const a = parts(from)
  const b = parts(to)
  return (b.y - a.y) * 12 + (b.m - a.m)
}
