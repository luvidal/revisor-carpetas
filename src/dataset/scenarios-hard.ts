/**
 * The "difícil" subset: six more applicant folders whose documents arrive the
 * way real ones do. Phone photos at an angle with shadows, noisy low-resolution
 * scans, pages fed sideways or upside down, heavily compressed JPEGs, skewed
 * pages and a payslip from another payroll system (template B). Defects are
 * planted as in the clean subset, so phase 3 can also measure decisions on
 * hard folders. Everything is invented and marked "MUESTRA SINTÉTICA".
 */
import { formatRut } from '../domain/rut'
import type { Degradation } from './render/raster'
import { PAYSLIP_MONTHS, employer, salary, type FolderSpec } from './scenarios'

const photo = (seed: number, o: Partial<Degradation> = {}): Degradation => ({ dpi: 110, perspective: 0.6, shadow: true, background: 'desk', seed, ...o })
const scan = (seed: number, o: Partial<Degradation> = {}): Degradation => ({ dpi: 90, noise: 0.35, background: 'scanner', seed, ...o })
const flat = (seed: number, o: Partial<Degradation> = {}): Degradation => ({ dpi: 100, background: 'scanner', seed, ...o })

export const HARD_FOLDERS: FolderSpec[] = [
  {
    id: 'd01',
    subset: 'dificil',
    title: 'Carpeta completa, todo fotografiado o escaneado',
    person: {
      names: 'Andrea Carolina', surnames: 'Pino Sepúlveda', rutBody: 117_215_834, sex: 'F', birthDate: '1990-02-14',
      nationality: 'CHILENA', idIssued: '2023-08-22', idExpires: '2033-08-22',
    },
    pension: { afp: 'AFP Quillay', health: { kind: 'fonasa' } },
    job: {
      employer: employer('Ferretería Industrial Los Andes SpA', 176_884_215, 'Av. Las Industrias 1280, Los Andes'),
      position: 'Encargada de Compras', startDate: '2018-11-05', salary: salary(1_180_000),
      extras: [], meal: 50_000, transport: 40_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    afp: { folio: 'QLL-2026-0811450', code: 'M3P7-XK21' },
    renderings: {
      cedula: { kind: 'image', file: 'cedula-foto.jpg', format: 'jpeg', quality: 70, degradation: photo(101, { dpi: 80, perspective: 0.7 }) },
      'payslip:2026-09': { kind: 'image', file: 'liquidacion-2026-09-foto.jpg', format: 'jpeg', quality: 60, degradation: photo(102) },
      'payslip:2026-10': { kind: 'scan', file: 'liquidacion-2026-10-escaneo.pdf', degradation: scan(103, { dpi: 80, noise: 0.4 }) },
      afp: { kind: 'scan', file: 'certificado-afp-escaneo.pdf', degradation: scan(104, { dpi: 100, noise: 0.25, skew: 4 }) },
    },
    defects: [],
    expectedDecision: 'lista_para_analista',
    decisionReason: 'Carpeta completa y coherente; solo cambia cómo llegaron los documentos.',
  },
  {
    id: 'd02',
    subset: 'dificil',
    title: 'Carpeta completa, liquidaciones de otro formato y páginas giradas',
    person: {
      names: 'Gonzalo Andrés', surnames: 'Reyes Cifuentes', rutBody: 116_540_927, sex: 'M', birthDate: '1986-06-30',
      nationality: 'CHILENA', idIssued: '2021-04-15', idExpires: '2031-04-15',
    },
    pension: { afp: 'AFP Litoral', health: { kind: 'isapre', name: 'Isapre Vida Sur' } },
    job: {
      employer: employer('Agroindustrial Valle Verde Ltda.', 177_106_348, 'Camino a Rauquén km 3, Curicó'),
      position: 'Jefe de Planta', startDate: '2014-01-13', salary: salary(1_950_000),
      extras: [{ label: 'Bono de turno', amount: 85_000 }], meal: 60_000, transport: 50_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    altPayslipMonths: PAYSLIP_MONTHS,
    afp: { folio: 'LIT-2026-0201933', code: 'F8R2-QN56' },
    renderings: {
      cedula: { kind: 'image', file: 'cedula-invertida.png', format: 'png', degradation: flat(201, { dpi: 72, rotate: 180 }) },
      'payslip:2026-10': { kind: 'pdf', file: 'liquidacion-2026-10-girada.pdf', rotate: 90 },
      afp: { kind: 'pdf', file: 'certificado-afp-invertido.pdf', rotate: 180 },
    },
    defects: [],
    expectedDecision: 'lista_para_analista',
    decisionReason: 'Carpeta completa y coherente. Prueba otro formato de liquidación y páginas giradas 90° y 180°.',
  },
  {
    id: 'd03',
    subset: 'dificil',
    title: 'Sueldo no cuadra, con imágenes muy comprimidas',
    person: {
      names: 'Marcela Ignacia', surnames: 'Toro Valenzuela', rutBody: 116_872_451, sex: 'F', birthDate: '1988-12-09',
      nationality: 'CHILENA', idIssued: '2022-03-03', idExpires: '2032-03-03',
    },
    pension: { afp: 'AFP Pehuén', health: { kind: 'isapre', name: 'Isapre Araucaria' } },
    job: {
      employer: employer('Servicios Contables Cordillera SpA', 176_255_903, 'Calle Huérfanos 1055, Santiago'),
      position: 'Contadora Senior', startDate: '2017-05-02', salary: salary(1_250_000),
      extras: [], meal: 50_000, transport: 40_000,
    },
    declaredJob: {
      employer: employer('Servicios Contables Cordillera SpA', 176_255_903, 'Calle Huérfanos 1055, Santiago'),
      position: 'Contadora Senior', startDate: '2017-05-02', salary: salary(2_050_000),
      extras: [{ label: 'Bono de desempeño', amount: 120_000 }], meal: 50_000, transport: 40_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    altPayslipMonths: PAYSLIP_MONTHS,
    afp: { folio: 'PEH-2026-1677024', code: 'T4H9-LW03' },
    renderings: {
      cedula: { kind: 'image', file: 'cedula-comprimida.jpg', format: 'jpeg', quality: 12, degradation: flat(301, { dpi: 72 }) },
      'payslip:2026-09': { kind: 'image', file: 'liquidacion-2026-09-comprimida.jpg', format: 'jpeg', quality: 12, degradation: flat(302) },
      'payslip:2026-10': { kind: 'image', file: 'liquidacion-2026-10-comprimida.jpg', format: 'jpeg', quality: 15, degradation: flat(303, { skew: 3 }) },
      afp: { kind: 'scan', file: 'certificado-afp-escaneo.pdf', degradation: scan(304, { dpi: 75, noise: 0.55 }) },
    },
    defects: [
      {
        type: 'sueldo_no_cuadra',
        doctype: 'liquidaciones-sueldo',
        detail: 'Las liquidaciones declaran un sueldo base de $ 2.050.000 más bono; las cotizaciones AFP de los mismos meses corresponden a $ 1.250.000.',
      },
    ],
    expectedDecision: 'escalar_a_persona',
    decisionReason: 'Ingresos declarados no respaldados por las cotizaciones: posible liquidación adulterada. Lo revisa una persona.',
  },
  {
    id: 'd04',
    subset: 'dificil',
    title: 'RUT distinto en una liquidación escaneada de lado',
    person: {
      names: 'Cristóbal Ignacio', surnames: 'Navarro Fuentealba', rutBody: 114_987_326, sex: 'M', birthDate: '1983-10-21',
      nationality: 'CHILENA', idIssued: '2020-09-08', idExpires: '2030-09-08',
    },
    pension: { afp: 'AFP Quillay', health: { kind: 'fonasa' } },
    job: {
      employer: employer('Constructora Pacífico Norte SpA', 176_590_417, 'Av. Argentina 2450, Antofagasta'),
      position: 'Capataz', startDate: '2016-08-16', salary: salary(980_000),
      extras: [{ label: 'Horas extras', amount: 110_000 }], meal: 45_000, transport: 35_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    altPayslipMonths: ['2026-09'],
    tamperedPayslipRut: { month: '2026-10', rutBody: 114_978_326 },
    afp: { folio: 'QLL-2026-0904417', code: 'J6V1-BS84' },
    renderings: {
      cedula: { kind: 'image', file: 'cedula-foto.png', format: 'png', degradation: photo(401, { dpi: 80, perspective: 0.9 }) },
      'payslip:2026-09': { kind: 'scan', file: 'liquidacion-2026-09-escaneo.pdf', degradation: scan(402, { noise: 0.3, skew: -3 }) },
      'payslip:2026-10': { kind: 'scan', file: 'liquidacion-2026-10-escaneo-girado.pdf', degradation: scan(403, { dpi: 100, noise: 0.25, rotate: 90 }) },
      afp: { kind: 'image', file: 'certificado-afp-foto.jpg', format: 'jpeg', quality: 50, degradation: photo(404, { perspective: 0.5 }) },
    },
    defects: [
      {
        type: 'rut_distinto',
        doctype: 'liquidaciones-sueldo',
        file: 'liquidacion-2026-10-escaneo-girado.pdf',
        detail: `La liquidación de octubre muestra el RUT ${formatRut(114_978_326)} con el mismo nombre; la cédula y los demás documentos dicen ${formatRut(114_987_326)}.`,
      },
    ],
    expectedDecision: 'escalar_a_persona',
    decisionReason: 'Mismo nombre con otro RUT en un documento de ingresos: puede ser un error o una alteración. Lo revisa una persona.',
  },
  {
    id: 'd05',
    subset: 'dificil',
    title: 'Cédula vencida fotografiada, liquidaciones en un solo escaneo',
    person: {
      names: 'Ana María', surnames: 'Contreras Lillo', rutBody: 112_674_590, sex: 'F', birthDate: '1979-04-03',
      nationality: 'CHILENA', idIssued: '2016-05-19', idExpires: '2026-05-19',
    },
    pension: { afp: 'AFP Pehuén', health: { kind: 'fonasa' } },
    job: {
      employer: employer('Colegio Particular San Esteban Ltda.', 177_540_862, 'Av. Pedro de Valdivia 3120, Ñuñoa, Santiago'),
      position: 'Profesora de Matemáticas', startDate: '2012-03-01', salary: salary(1_420_000),
      extras: [{ label: 'Asignación de perfeccionamiento', amount: 95_000 }], meal: 0, transport: 30_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    combinePayslips: true,
    afp: { folio: 'PEH-2026-1730589', code: 'C2Z8-RA47' },
    seniority: { name: 'Jorge Valdés Arancibia', role: 'Director Administrativo' },
    renderings: {
      cedula: { kind: 'image', file: 'cedula-foto.jpg', format: 'jpeg', quality: 55, degradation: photo(501, { dpi: 80 }) },
      payslips: { kind: 'scan', file: 'liquidaciones-2026-09-y-2026-10-escaneo.pdf', degradation: scan(502) },
      afp: { kind: 'scan', file: 'certificado-afp-escaneo-invertido.pdf', degradation: scan(503, { dpi: 100, noise: 0.2, rotate: 180 }) },
      seniority: { kind: 'scan', file: 'certificado-antiguedad-escaneo.pdf', degradation: scan(504, { dpi: 100, noise: 0.3, skew: 5 }) },
    },
    defects: [
      {
        type: 'documento_vencido',
        doctype: 'cedula-identidad',
        file: 'cedula-foto.jpg',
        detail: 'La cédula venció el 19-05-2026, antes de la fecha de revisión (16-11-2026).',
      },
    ],
    expectedDecision: 'pedir_documento',
    decisionReason: 'La identidad no se puede acreditar con una cédula vencida; se pide la cédula vigente.',
  },
  {
    id: 'd06',
    subset: 'dificil',
    title: 'Falta el certificado AFP, liquidaciones fotografiadas',
    person: {
      names: 'Felipe Andrés', surnames: 'Sandoval Rivas', rutBody: 120_134_586, sex: 'M', birthDate: '1997-07-17',
      nationality: 'CHILENA', idIssued: '2024-07-30', idExpires: '2034-07-30',
    },
    pension: { afp: 'AFP Litoral', health: { kind: 'fonasa' } },
    job: {
      employer: employer('Cafetería Grano de Oro SpA', 176_973_104, 'Calle Esmeralda 760, Valparaíso'),
      position: 'Barista', startDate: '2023-02-01', salary: salary(640_000),
      extras: [{ label: 'Bono de asistencia', amount: 30_000 }], meal: 30_000, transport: 25_000,
    },
    idCard: true,
    payslipMonths: PAYSLIP_MONTHS,
    altPayslipMonths: ['2026-10'],
    afp: false,
    seniority: { name: 'Daniela Ortúzar Vidal', role: 'Administradora' },
    renderings: {
      cedula: { kind: 'image', file: 'cedula-girada.png', format: 'png', degradation: flat(601, { dpi: 72, rotate: 90 }) },
      'payslip:2026-09': { kind: 'image', file: 'liquidacion-2026-09-foto.jpg', format: 'jpeg', quality: 40, degradation: photo(602, { dpi: 100, perspective: 1 }) },
      'payslip:2026-10': { kind: 'image', file: 'liquidacion-2026-10-foto.jpg', format: 'jpeg', quality: 35, degradation: photo(603, { dpi: 100, perspective: 0.8, shadow: false }) },
      seniority: { kind: 'image', file: 'certificado-antiguedad-foto.jpg', format: 'jpeg', quality: 45, degradation: photo(604, { dpi: 100, perspective: 0.7 }) },
    },
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
]
