/**
 * The 12 synthetic applicant folders. Each one is a hand-written test case:
 * who the applicant is, which documents the folder holds, which defect (if
 * any) is planted, and the decision a reviewer should reach. Every name,
 * company, pension fund and health insurer is invented.
 */
import { formatRut } from '../domain/rut'
import type { Decision, Defect, Subset } from '../domain/truth'
import type { Employer, Job, Pension, Person } from './model'
import type { Rendering } from './rendering'

export const REFERENCE_DATE = '2026-11-16'
export const PAYSLIP_MONTHS = ['2026-09', '2026-10']
export const AFP_FROM = '2025-11'
export const AFP_TO = '2026-10'
export const AFP_ISSUED = '2026-11-14'
export const SENIORITY_ISSUED = '2026-11-12'

/** Minimum folder under the provisional policy (phase 3 will formalise it). */
export const REQUIRED_DOCUMENTS =
  'Cédula vigente, las dos últimas liquidaciones (septiembre y octubre de 2026) y el certificado de cotizaciones AFP de los últimos 12 meses.'

/** One file of a folder: the cédula, a payslip month, both payslips together, the AFP certificate or the seniority letter. */
export type FileKey = 'cedula' | `payslip:${string}` | 'payslips' | 'afp' | 'seniority'

export type FolderSpec = {
  id: string
  /** Defaults to `limpio`. */
  subset?: Subset
  title: string
  person: Person
  pension: Pension
  /** The job that really pays (and therefore the AFP contributions). */
  job: Job
  previousJobs?: Job[]
  /** What the payslips and the seniority letter claim; defaults to `job`. */
  declaredJob?: Job
  idCard: boolean
  payslipMonths: string[]
  /** Both payslips in one 2-page PDF instead of one file each. */
  combinePayslips?: boolean
  /** Month whose payslip is a phone photo (PNG) instead of a PDF. */
  photoPayslipMonth?: string
  /** Payslip months drawn with template B (another payroll system). */
  altPayslipMonths?: string[]
  /** How each file is produced; files without an entry are clean PDFs (cédula: PNG). */
  renderings?: Partial<Record<FileKey, Rendering>>
  tamperedPayslipRut?: { month: string; rutBody: number }
  afp:
    | false
    | {
        folio: string
        code: string
        gapMonths?: string[]
        /** Certificate of someone else (planted defect). */
        holder?: { person: Person; pension: Pension; jobs: Job[] }
      }
  seniority?: { name: string; role: string }
  defects: Defect[]
  expectedDecision: Decision
  decisionReason: string
}

export const employer = (name: string, rutBody: number, address: string): Employer => ({ name, rutBody, address })

export const salary = (base: number, raisedFrom?: string, raisedBase?: number) =>
  raisedFrom && raisedBase ? [{ from: '2020-01', base }, { from: raisedFrom, base: raisedBase }] : [{ from: '2020-01', base }]

export const FOLDERS: FolderSpec[] = [
  {
    id: 'f01',
    title: 'Carpeta completa, Fonasa, dos meses sin cotización',
    person: {
      names: 'Camila Andrea', surnames: 'Soto Muñoz', rutBody: 117_843_226, sex: 'F', birthDate: '1991-04-17',
      nationality: 'CHILENA', idIssued: '2023-05-10', idExpires: '2033-05-10',
    },
    pension: { afp: 'AFP Quillay', health: { kind: 'fonasa' } },
    job: {
      employer: employer('Comercial Los Aromos SpA', 176_512_384, 'Av. Los Aromos 1450, Maipú, Santiago'),
      position: 'Ejecutiva de Ventas', startDate: '2019-08-01', salary: salary(1_010_000, '2026-07', 1_050_000),
      extras: [], meal: 45_000, transport: 40_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    afp: { folio: 'QLL-2026-0481327', code: '7F3K-29QD', gapMonths: ['2026-02', '2026-03'] },
    defects: [],
    expectedDecision: 'lista_para_analista',
    decisionReason: 'Todos los documentos están, son de la misma persona y cuadran entre sí. Dos meses sin cotizar es información para el analista, no un defecto.',
  },
  {
    id: 'f02',
    title: 'Carpeta completa, isapre, con certificado de antigüedad',
    person: {
      names: 'Diego Ignacio', surnames: 'Fuentes Riquelme', rutBody: 116_209_551, sex: 'M', birthDate: '1987-11-03',
      nationality: 'CHILENA', idIssued: '2022-01-20', idExpires: '2032-01-20',
    },
    pension: { afp: 'AFP Pehuén', health: { kind: 'isapre', name: 'Isapre Vida Sur' } },
    job: {
      employer: employer('Servicios Logísticos Pudahuel Ltda.', 177_204_118, 'Camino Lo Boza 820, Pudahuel, Santiago'),
      position: 'Jefe de Bodega', startDate: '2016-03-14', salary: salary(1_420_000, '2026-04', 1_480_000),
      extras: [{ label: 'Bono de producción', amount: 120_000 }], meal: 60_000, transport: 50_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    afp: { folio: 'PEH-2026-1102938', code: 'K8L2-MM41' },
    seniority: { name: 'Carolina Méndez Ortiz', role: 'Jefa de Personas' },
    defects: [],
    expectedDecision: 'lista_para_analista',
    decisionReason: 'Carpeta completa y coherente; el certificado de antigüedad confirma empleador, fecha de ingreso y renta.',
  },
  {
    id: 'f03',
    title: 'Carpeta completa, ambas liquidaciones en un solo PDF',
    person: {
      names: 'Valentina Paz', surnames: 'Morales Contreras', rutBody: 119_384_672, sex: 'F', birthDate: '1995-06-22',
      nationality: 'CHILENA', idIssued: '2024-02-08', idExpires: '2034-02-08',
    },
    pension: { afp: 'AFP Litoral', health: { kind: 'fonasa' } },
    job: {
      employer: employer('Clínica Dental Sonrisa Norte SpA', 176_938_207, 'Av. Independencia 2210, Independencia, Santiago'),
      position: 'Asistente Dental', startDate: '2022-01-03', salary: salary(680_000),
      extras: [], meal: 35_000, transport: 30_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    combinePayslips: true,
    afp: { folio: 'LIT-2026-0090714', code: 'Q7W2-ZX90' },
    defects: [],
    expectedDecision: 'lista_para_analista',
    decisionReason: 'Carpeta completa y coherente. El PDF con dos liquidaciones debe separarse en dos documentos.',
  },
  {
    id: 'f04',
    title: 'Cambio de empleador en el año, un mes sin cotizar entre trabajos',
    person: {
      names: 'Matías Alejandro', surnames: 'Rojas Vergara', rutBody: 117_102_935, sex: 'M', birthDate: '1989-09-09',
      nationality: 'CHILENA', idIssued: '2021-10-04', idExpires: '2031-10-04',
    },
    pension: { afp: 'AFP Quillay', health: { kind: 'isapre', name: 'Isapre Araucaria' } },
    job: {
      employer: employer('Constructora Valle Central SpA', 176_401_552, 'Av. Vicuña Mackenna 3980, San Joaquín, Santiago'),
      position: 'Jefe de Obra', startDate: '2026-04-01', salary: salary(2_100_000),
      extras: [], meal: 70_000, transport: 60_000,
    },
    previousJobs: [
      {
        employer: employer('Ingeniería Montemar Ltda.', 177_815_640, 'Av. Libertad 1180, Viña del Mar'),
        position: 'Supervisor de Obra', startDate: '2018-06-01', endMonth: '2026-02', salary: salary(1_750_000),
        extras: [], meal: 50_000, transport: 50_000,
      },
    ],
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    afp: { folio: 'QLL-2026-0517740', code: 'B5N8-TT02', gapMonths: [] },
    seniority: { name: 'Andrés Salinas Pérez', role: 'Gerente de Administración y Finanzas' },
    defects: [],
    expectedDecision: 'lista_para_analista',
    decisionReason: 'Carpeta completa y coherente. El cambio de empleador se explica con el certificado de antigüedad y las cotizaciones.',
  },
  {
    id: 'f05',
    title: 'Falta el certificado de cotizaciones AFP',
    person: {
      names: 'Francisca Javiera', surnames: 'Núñez Pizarro', rutBody: 118_725_390, sex: 'F', birthDate: '1993-02-11',
      nationality: 'CHILENA', idIssued: '2025-03-17', idExpires: '2035-03-17',
    },
    pension: { afp: 'AFP Pehuén', health: { kind: 'fonasa' } },
    job: {
      employer: employer('Panadería y Pastelería El Trigal Ltda.', 177_330_915, 'Calle Gran Avenida 5120, San Miguel, Santiago'),
      position: 'Administradora de Local', startDate: '2020-10-05', salary: salary(950_000),
      extras: [{ label: 'Bono de cumplimiento', amount: 60_000 }], meal: 50_000, transport: 40_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    afp: false,
    defects: [
      {
        type: 'documento_faltante',
        doctype: 'cotizaciones-afp',
        detail: 'La carpeta no trae el certificado de cotizaciones AFP de los últimos 12 meses.',
      },
    ],
    expectedDecision: 'pedir_documento',
    decisionReason: 'Falta un documento obligatorio; lo correcto es pedirlo al solicitante.',
  },
  {
    id: 'f06',
    title: 'Falta la liquidación de octubre',
    person: {
      names: 'Sebastián Andrés', surnames: 'Castillo Bravo', rutBody: 117_556_018, sex: 'M', birthDate: '1990-12-01',
      nationality: 'CHILENA', idIssued: '2022-07-29', idExpires: '2032-07-29',
    },
    pension: { afp: 'AFP Litoral', health: { kind: 'fonasa' } },
    job: {
      employer: employer('Transportes Cordillera Sur SpA', 176_287_441, 'Ruta 5 Sur km 22, San Bernardo'),
      position: 'Conductor', startDate: '2018-05-02', salary: salary(820_000),
      extras: [{ label: 'Horas extras', amount: 95_000 }], meal: 40_000, transport: 0,
    },
    idCard: true,
    payslipMonths: ['2026-09'],
    afp: { folio: 'LIT-2026-0114205', code: 'H2J9-PL55' },
    defects: [
      {
        type: 'documento_faltante',
        doctype: 'liquidaciones-sueldo',
        detail: 'Solo trae la liquidación de septiembre de 2026; falta la de octubre de 2026.',
      },
    ],
    expectedDecision: 'pedir_documento',
    decisionReason: 'Falta una de las dos liquidaciones exigidas; se pide la de octubre.',
  },
  {
    id: 'f07',
    title: 'Cédula vencida, residente extranjera',
    person: {
      names: 'Rosa Elena', surnames: 'Huamán Quispe', rutBody: 125_613_847, sex: 'F', birthDate: '1988-07-30',
      nationality: 'PER', idIssued: '2021-08-14', idExpires: '2026-08-14', idDocumentNumber: '104.552.871',
    },
    pension: { afp: 'AFP Quillay', health: { kind: 'fonasa' } },
    job: {
      employer: employer('Hotel Bahía Serena SpA', 176_744_120, 'Av. del Mar 3300, La Serena'),
      position: 'Recepcionista', startDate: '2021-11-02', salary: salary(760_000),
      extras: [], meal: 40_000, transport: 30_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    afp: { folio: 'QLL-2026-0602118', code: 'R4D6-VC13' },
    defects: [
      {
        type: 'documento_vencido',
        doctype: 'cedula-identidad',
        file: 'cedula.png',
        detail: 'La cédula venció el 14-08-2026, antes de la fecha de revisión (16-11-2026).',
      },
    ],
    expectedDecision: 'pedir_documento',
    decisionReason: 'La identidad no se puede acreditar con una cédula vencida; se pide la cédula vigente.',
  },
  {
    id: 'f08',
    title: 'RUT distinto en la liquidación de octubre',
    person: {
      names: 'Ignacio Tomás', surnames: 'Herrera Saavedra', rutBody: 115_938_704, sex: 'M', birthDate: '1985-03-25',
      nationality: 'CHILENA', idIssued: '2020-12-11', idExpires: '2030-12-11',
    },
    pension: { afp: 'AFP Pehuén', health: { kind: 'isapre', name: 'Isapre Vida Sur' } },
    job: {
      employer: employer('Distribuidora Ferretera Maipo SpA', 176_115_829, 'Av. Concha y Toro 1650, Puente Alto'),
      position: 'Vendedor Técnico', startDate: '2017-07-10', salary: salary(1_200_000),
      extras: [{ label: 'Comisiones por venta', amount: 210_000 }], meal: 50_000, transport: 45_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    tamperedPayslipRut: { month: '2026-10', rutBody: 115_983_704 },
    afp: { folio: 'PEH-2026-1209931', code: 'N1C7-EE80' },
    defects: [
      {
        type: 'rut_distinto',
        doctype: 'liquidaciones-sueldo',
        file: 'liquidacion-2026-10.pdf',
        detail: `La liquidación de octubre muestra el RUT ${formatRut(115_983_704)} con el mismo nombre; la cédula y los demás documentos dicen ${formatRut(115_938_704)}.`,
      },
    ],
    expectedDecision: 'escalar_a_persona',
    decisionReason: 'Mismo nombre con otro RUT en un documento de ingresos: puede ser un error del empleador o una alteración. Lo revisa una persona.',
  },
  {
    id: 'f09',
    title: 'Certificado AFP de otra persona',
    person: {
      names: 'Catalina Belén', surnames: 'Vargas Espinoza', rutBody: 118_290_463, sex: 'F', birthDate: '1992-08-08',
      nationality: 'CHILENA', idIssued: '2023-09-21', idExpires: '2033-09-21',
    },
    pension: { afp: 'AFP Litoral', health: { kind: 'fonasa' } },
    job: {
      employer: employer('Agrícola Valle del Elqui Ltda.', 177_462_031, 'Camino a Vicuña km 8, La Serena'),
      position: 'Contadora', startDate: '2019-03-18', salary: salary(1_350_000),
      extras: [], meal: 50_000, transport: 40_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    afp: {
      folio: 'PEH-2026-1315507',
      code: 'S9F3-AA26',
      holder: {
        person: {
          names: 'Javiera Antonia', surnames: 'Vargas Espinoza', rutBody: 119_871_205, sex: 'F', birthDate: '1998-01-14',
          nationality: 'CHILENA', idIssued: '2024-04-02', idExpires: '2034-04-02',
        },
        pension: { afp: 'AFP Pehuén', health: { kind: 'fonasa' } },
        jobs: [
          {
            employer: employer('Exportadora Frutícola Limarí SpA', 176_329_784, 'Av. Costanera 455, Ovalle'),
            position: 'Analista de Calidad', startDate: '2023-03-01', salary: salary(890_000),
            extras: [], meal: 40_000, transport: 30_000,
          },
        ],
      },
    },
    defects: [
      {
        type: 'rut_distinto',
        doctype: 'cotizaciones-afp',
        file: 'certificado-afp.pdf',
        detail: `El certificado AFP es de Javiera Antonia Vargas Espinoza, RUT ${formatRut(119_871_205)}; la solicitante es Catalina Belén Vargas Espinoza, RUT ${formatRut(118_290_463)}.`,
      },
    ],
    expectedDecision: 'pedir_documento',
    decisionReason: 'El documento es claramente de otra persona (otro nombre y otro RUT); se pide el certificado de la solicitante.',
  },
  {
    id: 'f10',
    title: 'Sueldo de las liquidaciones no cuadra con las cotizaciones',
    person: {
      names: 'Rodrigo Esteban', surnames: 'Paredes Lagos', rutBody: 115_421_876, sex: 'M', birthDate: '1984-01-19',
      nationality: 'CHILENA', idIssued: '2024-06-13', idExpires: '2034-06-13',
    },
    pension: { afp: 'AFP Quillay', health: { kind: 'isapre', name: 'Isapre Araucaria' } },
    job: {
      employer: employer('Inversiones Costa Brava SpA', 176_659_374, 'Av. Apoquindo 4700, Las Condes, Santiago'),
      position: 'Gerente Comercial', startDate: '2015-09-01', salary: salary(1_050_000),
      extras: [], meal: 60_000, transport: 50_000,
    },
    declaredJob: {
      employer: employer('Inversiones Costa Brava SpA', 176_659_374, 'Av. Apoquindo 4700, Las Condes, Santiago'),
      position: 'Gerente Comercial', startDate: '2015-09-01', salary: salary(2_300_000),
      extras: [{ label: 'Bono de gestión', amount: 150_000 }], meal: 60_000, transport: 50_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    afp: { folio: 'QLL-2026-0733096', code: 'D3M5-UY72' },
    seniority: { name: 'Patricia Soler Ibáñez', role: 'Gerenta General' },
    defects: [
      {
        type: 'sueldo_no_cuadra',
        doctype: 'liquidaciones-sueldo',
        detail: 'Las liquidaciones declaran una renta imponible mucho mayor que la que respalda el certificado AFP: la cotización descontada en la liquidación no coincide con la pagada en esos mismos meses.',
      },
    ],
    expectedDecision: 'escalar_a_persona',
    decisionReason: 'Ingresos declarados no respaldados por las cotizaciones: posible liquidación adulterada. Lo revisa una persona.',
  },
  {
    id: 'f11',
    title: 'Sueldo no cuadra y además falta la cédula',
    person: {
      names: 'Paula Fernanda', surnames: 'Gallardo Tapia', rutBody: 119_652_318, sex: 'F', birthDate: '1996-10-05',
      nationality: 'CHILENA', idIssued: '2025-01-30', idExpires: '2035-01-30',
    },
    pension: { afp: 'AFP Litoral', health: { kind: 'fonasa' } },
    job: {
      employer: employer('Retail Andino SpA', 176_830_596, 'Av. Kennedy 9001, Las Condes, Santiago'),
      position: 'Supervisora de Tienda', startDate: '2021-04-12', salary: salary(1_100_000),
      extras: [], meal: 50_000, transport: 40_000,
    },
    declaredJob: {
      employer: employer('Retail Andino SpA', 176_830_596, 'Av. Kennedy 9001, Las Condes, Santiago'),
      position: 'Supervisora de Tienda', startDate: '2021-04-12', salary: salary(1_600_000),
      extras: [], meal: 50_000, transport: 40_000,
    },
    idCard: false,
    payslipMonths: PAYSLIP_MONTHS,
    afp: { folio: 'LIT-2026-0158862', code: 'W6G1-OP38' },
    defects: [
      {
        type: 'sueldo_no_cuadra',
        doctype: 'liquidaciones-sueldo',
        detail: 'Las liquidaciones declaran un sueldo base de $ 1.600.000; las cotizaciones AFP de los mismos meses corresponden a $ 1.100.000.',
      },
      {
        type: 'documento_faltante',
        doctype: 'cedula-identidad',
        detail: 'La carpeta no trae la cédula de identidad.',
      },
    ],
    expectedDecision: 'escalar_a_persona',
    decisionReason: 'La señal de posible adulteración pesa más que el documento faltante: lo revisa una persona antes de pedir nada.',
  },
  {
    id: 'f12',
    title: 'Carpeta completa, liquidación de septiembre fotografiada',
    person: {
      names: 'Joaquín Felipe', surnames: 'Muñoz Araya', rutBody: 118_937_150, sex: 'M', birthDate: '1994-05-28',
      nationality: 'CHILENA', idIssued: '2022-11-03', idExpires: '2032-11-03',
    },
    pension: { afp: 'AFP Pehuén', health: { kind: 'fonasa' } },
    job: {
      employer: employer('Laboratorio Biomédica Austral SpA', 176_508_263, 'Av. Alemania 0671, Temuco'),
      position: 'Técnico de Laboratorio', startDate: '2021-06-01', salary: salary(1_080_000, '2026-06', 1_120_000),
      extras: [], meal: 45_000, transport: 35_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    photoPayslipMonth: '2026-09',
    afp: { folio: 'PEH-2026-1420074', code: 'Y2B8-HN67' },
    defects: [],
    expectedDecision: 'lista_para_analista',
    decisionReason: 'Carpeta completa y coherente. La foto de la liquidación prueba la lectura de imágenes torcidas y algo borrosas.',
  },
]
