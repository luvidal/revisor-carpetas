/**
 * Payslip arithmetic for the synthetic dataset. It follows the shape of a
 * Chilean payslip (gratificación legal, AFP + commission, 7% health, 0.6%
 * unemployment insurance, monthly income tax by UTM brackets) with FICTIONAL
 * 2026 parameters. It is not a payroll engine: it only has to be internally
 * consistent so cross-document checks are meaningful.
 */

export const PARAMS = {
  /** Fictional UTM for the synthetic months. */
  utm: 69_900,
  /** Fictional monthly minimum wage, used for the gratificación cap. */
  minimumWage: 539_000,
  afpBaseRate: 0.1,
  healthRate: 0.07,
  unemploymentRate: 0.006,
} as const

/** Invented pension funds (not real AFPs) and their commission rates. */
export const AFPS = {
  'AFP Quillay': 0.0122,
  'AFP Pehuén': 0.0069,
  'AFP Litoral': 0.0141,
} as const

export type AfpName = keyof typeof AFPS

/** "Fonasa" (public system) or an invented isapre name. */
export type Health = { kind: 'fonasa' } | { kind: 'isapre'; name: string }

export function healthLabel(health: Health): string {
  return health.kind === 'fonasa' ? 'Fonasa' : health.name
}

export type PayRow = {
  label: string
  value: number
  taxable: boolean
  legalType?: 'afp' | 'salud' | 'cesantia' | 'impuesto'
}

export type PayInput = {
  baseSalary: number
  /** Taxable extras: bonuses, overtime, commissions. */
  extras: Array<{ label: string; amount: number }>
  meal: number
  transport: number
  afp: AfpName
  health: Health
  /** Non-legal deductions (advances, loans). */
  otherDeductions?: Array<{ label: string; amount: number }>
}

export type Payslip = {
  earnings: PayRow[]
  deductions: PayRow[]
  taxableBase: number
  nonTaxable: number
  totalEarnings: number
  incomeTaxBase: number
  totalDeductions: number
  net: number
  afpAmount: number
}

/** Monthly brackets in UTM: [upper limit, rate, deduction]. */
const TAX_BRACKETS: Array<[number, number, number]> = [
  [13.5, 0, 0],
  [30, 0.04, 0.54],
  [50, 0.08, 1.74],
  [70, 0.135, 4.49],
  [90, 0.23, 11.14],
  [120, 0.304, 17.8],
  [310, 0.35, 23.32],
  [Infinity, 0.4, 38.82],
]

export function incomeTax(base: number, utm: number = PARAMS.utm): number {
  const inUtm = base / utm
  const bracket = TAX_BRACKETS.find(([limit]) => inUtm <= limit)!
  const [, rate, deduction] = bracket
  return Math.max(0, Math.round(base * rate - deduction * utm))
}

export function gratification(baseSalary: number): number {
  const cap = Math.round((4.75 * PARAMS.minimumWage) / 12)
  return Math.min(Math.round(baseSalary * 0.25), cap)
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}%`
}

export function afpRate(afp: AfpName): number {
  return PARAMS.afpBaseRate + AFPS[afp]
}

export function computePayslip(input: PayInput): Payslip {
  const earnings: PayRow[] = [
    { label: 'Sueldo base', value: input.baseSalary, taxable: true },
    { label: 'Gratificación legal', value: gratification(input.baseSalary), taxable: true },
    ...input.extras.map(e => ({ label: e.label, value: e.amount, taxable: true })),
  ]
  if (input.meal > 0) earnings.push({ label: 'Colación', value: input.meal, taxable: false })
  if (input.transport > 0) earnings.push({ label: 'Movilización', value: input.transport, taxable: false })

  const taxableBase = earnings.filter(r => r.taxable).reduce((s, r) => s + r.value, 0)
  const nonTaxable = earnings.filter(r => !r.taxable).reduce((s, r) => s + r.value, 0)

  const rate = afpRate(input.afp)
  const afpAmount = Math.round(taxableBase * rate)
  const healthAmount = Math.round(taxableBase * PARAMS.healthRate)
  const unemployment = Math.round(taxableBase * PARAMS.unemploymentRate)
  const incomeTaxBase = taxableBase - afpAmount - healthAmount - unemployment
  const tax = incomeTax(incomeTaxBase)

  const deductions: PayRow[] = [
    { label: `Cotización ${input.afp} ${pct(rate)}`, value: afpAmount, taxable: false, legalType: 'afp' },
    { label: `Salud ${healthLabel(input.health)} 7%`, value: healthAmount, taxable: false, legalType: 'salud' },
    { label: 'Seguro de cesantía 0,6%', value: unemployment, taxable: false, legalType: 'cesantia' },
    { label: 'Impuesto único 2a categoría', value: tax, taxable: false, legalType: 'impuesto' },
    ...(input.otherDeductions ?? []).map(d => ({ label: d.label, value: d.amount, taxable: false })),
  ]
  const totalEarnings = taxableBase + nonTaxable
  const totalDeductions = deductions.reduce((s, r) => s + r.value, 0)
  return {
    earnings,
    deductions,
    taxableBase,
    nonTaxable,
    totalEarnings,
    incomeTaxBase,
    totalDeductions,
    net: totalEarnings - totalDeductions,
    afpAmount,
  }
}
