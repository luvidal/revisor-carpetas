import { describe, expect, it } from 'vitest'
import { checkDigit, formatRut, isValidRut, normalizeRut } from '../src/domain/rut'

describe('RUT', () => {
  it('computes modulo-11 check digits, including K and 0', () => {
    // 12.345.678-5 is the textbook example used in RUT documentation; the rest are 9-digit bodies, which no real RUT has.
    expect(checkDigit(12_345_678)).toBe('5')
    expect(checkDigit(117_843_226)).toBe('1')
    expect(checkDigit(100_000_004)).toBe('K')
    expect(checkDigit(100_000_009)).toBe('0')
  })

  it('formats with dots and dash', () => {
    expect(formatRut(118_456_789)).toBe('118.456.789-6')
    expect(formatRut(107_654_321, 'k')).toBe('107.654.321-K')
  })

  it('normalises any common spelling to body-DV', () => {
    expect(normalizeRut('118.456.789-K')).toBe('118456789-K')
    expect(normalizeRut('118456789k')).toBe('118456789-K')
    expect(normalizeRut('RUN 118 456 789-k')).toBe('118456789-K')
    expect(normalizeRut('0118.456.789-K')).toBe('118456789-K')
    expect(normalizeRut('')).toBeNull()
    expect(normalizeRut(null)).toBeNull()
    expect(normalizeRut('sin rut')).toBeNull()
  })

  it('validates the check digit', () => {
    expect(isValidRut(formatRut(115_938_704))).toBe(true)
    expect(isValidRut('12.345.678-9')).toBe(false)
    expect(isValidRut('12.345.678-5')).toBe(true)
  })
})
