import { describe, expect, it } from 'vitest'
import {
  normalizeAmount,
  normalizeDate,
  normalizeInstitution,
  normalizeMonth,
  normalizeName,
  normalizeNationality,
  normalizeSex,
  normalizeText,
} from '../src/domain/normalize'

describe('normalizeAmount', () => {
  it.each([
    [1071667, 1071667],
    ['1.071.667', 1071667],
    ['$ 1.071.667', 1071667],
    ['$1.071.667 CLP', 1071667],
    ['1,071,667', 1071667],
    ['1071667.0', 1071667],
    ['1.234,56', 1235],
    ['0', 0],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeAmount(input)).toBe(expected)
  })

  it('rejects empty and non-numeric values', () => {
    expect(normalizeAmount('')).toBeNull()
    expect(normalizeAmount(null)).toBeNull()
    expect(normalizeAmount('n/a')).toBeNull()
  })
})

describe('normalizeDate', () => {
  it.each([
    ['2026-06-01', '2026-06-01'],
    ['2026-06-01T00:00:00Z', '2026-06-01'],
    ['01-06-2026', '2026-06-01'],
    ['1/6/2026', '2026-06-01'],
    ['02 MAR 1990', '1990-03-02'],
    ['2 de marzo de 1990', '1990-03-02'],
    ['14 ago. 2021', '2021-08-14'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeDate(input)).toBe(expected)
  })

  it('does not invent a day for month-only values', () => {
    expect(normalizeDate('2026-06')).toBeNull()
    expect(normalizeDate('2026-13-01')).toBeNull()
  })
})

describe('normalizeMonth', () => {
  it.each([
    ['2026-06', '2026-06'],
    ['2026-06-01', '2026-06'],
    ['06-2026', '2026-06'],
    ['6/2026', '2026-06'],
    ['Junio 2026', '2026-06'],
    ['junio de 2026', '2026-06'],
    ['SEPT 2026', '2026-09'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeMonth(input)).toBe(expected)
  })
})

describe('text-like normalisers', () => {
  it('ignores accents, case and punctuation', () => {
    expect(normalizeText('Servicios Logísticos Pudahuel Ltda.')).toBe('SERVICIOS LOGISTICOS PUDAHUEL LTDA')
    expect(normalizeText('  ')).toBeNull()
  })

  it('compares person names by their words, in any order', () => {
    expect(normalizeName('ROJAS TAPIA MARÍA FERNANDA')).toBe(normalizeName('María Fernanda Rojas Tapia'))
    expect(normalizeName('Maria Rojas')).not.toBe(normalizeName('Maria Fernanda Rojas'))
  })

  it('drops the AFP / Isapre prefix of institutions', () => {
    expect(normalizeInstitution('AFP Pehuén')).toBe(normalizeInstitution('PEHUEN'))
    expect(normalizeInstitution('Isapre Vida Sur')).toBe('VIDA SUR')
    expect(normalizeInstitution('Fonasa')).toBe('FONASA')
  })

  it('maps sex and nationality spellings', () => {
    expect(normalizeSex('Femenino')).toBe('F')
    expect(normalizeSex('m')).toBe('M')
    expect(normalizeNationality('CHILENA')).toBe('CHL')
    expect(normalizeNationality('chl')).toBe('CHL')
    expect(normalizeNationality('PER')).toBe('PER')
  })
})
