/**
 * Chilean RUT/RUN helpers. A RUT is a numeric body plus a check digit (0-9 or K)
 * computed with the modulo-11 algorithm. Used by the dataset generator (to
 * build valid fictional RUTs) and by the evals (to compare RUTs written in any
 * format: "118.456.789-6", "118456789-6", "RUN 118 456 789-6"). The dataset uses
 * 9-digit bodies, which no real RUT has.
 */

/** Modulo-11 check digit for a RUT body. */
export function checkDigit(body: number): string {
  if (!Number.isInteger(body) || body <= 0) throw new Error(`Invalid RUT body: ${body}`)
  let sum = 0
  let factor = 2
  for (let n = body; n > 0; n = Math.floor(n / 10)) {
    sum += (n % 10) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const dv = 11 - (sum % 11)
  if (dv === 11) return '0'
  if (dv === 10) return 'K'
  return String(dv)
}

/** "118.456.789-6" for a body, with its computed check digit. */
export function formatRut(body: number, dv: string = checkDigit(body)): string {
  const withDots = String(body).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${withDots}-${dv.toUpperCase()}`
}

/**
 * Canonical form "118456789-6", or null when the input does not look like a RUT.
 * Format only: it does not validate the check digit (see `isValidRut`).
 */
export function normalizeRut(input: unknown): string | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null
  const compact = String(input).toUpperCase().replace(/[^0-9K]/g, '')
  const match = /^0*(\d{1,9})([0-9K])$/.exec(compact)
  if (!match) return null
  return `${match[1]}-${match[2]}`
}

/** True when the RUT parses and its check digit matches its body. */
export function isValidRut(input: unknown): boolean {
  const normalized = normalizeRut(input)
  if (!normalized) return false
  const [body, dv] = normalized.split('-') as [string, string]
  return checkDigit(Number(body)) === dv
}
