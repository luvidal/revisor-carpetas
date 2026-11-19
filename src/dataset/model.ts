/** People, employers and jobs that the synthetic scenarios are built from. */
import { formatRut } from '../domain/rut'
import type { AfpName, Health } from './payroll'

export type Person = {
  names: string
  surnames: string
  /** RUT body; the check digit is computed. */
  rutBody: number
  sex: 'F' | 'M'
  birthDate: string
  /** As printed on the cédula: "CHILENA" or an ISO-3 code for foreign residents. */
  nationality: string
  idIssued: string
  idExpires: string
  /** Foreign residents' cards also print a document number (not the RUN). */
  idDocumentNumber?: string
}

export type Employer = { name: string; rutBody: number; address: string }

export type Job = {
  employer: Employer
  position: string
  startDate: string
  /** Last month with pay ("YYYY-MM"), for a previous job. */
  endMonth?: string
  /** Base salary by month: each entry applies from `from` ("YYYY-MM") onwards. */
  salary: Array<{ from: string; base: number }>
  extras: Array<{ label: string; amount: number }>
  meal: number
  transport: number
}

export function fullName(p: Person): string {
  return `${p.names} ${p.surnames}`
}

export function personRut(p: Person): string {
  return formatRut(p.rutBody)
}

export function employerRut(e: Employer): string {
  return formatRut(e.rutBody)
}

export function baseSalaryFor(job: Job, month: string): number {
  const applicable = job.salary.filter(s => s.from <= month).at(-1)
  if (!applicable) throw new Error(`No salary for ${job.employer.name} in ${month}`)
  return applicable.base
}

/** True when the job paid wages in that month. */
export function jobActiveIn(job: Job, month: string): boolean {
  return job.startDate.slice(0, 7) <= month && (!job.endMonth || month <= job.endMonth)
}

export type Pension = { afp: AfpName; health: Health }
