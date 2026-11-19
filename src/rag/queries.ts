/**
 * The questions the agent asks the policy: one per kind of finding, describing
 * the situation in plain words (not copied from the rule). Because the set is
 * closed, their vectors are computed once at indexing time and the agent never
 * needs the embedding model at run time.
 *
 * `FINDING_RULE` is the rule a person would cite for each finding: the ground
 * truth for measuring whether the search finds it.
 *
 * Two queries were rewritten after the first search eval (19-11-2026): the
 * plain versions landed on "twin" rules that differ by a negation (4.4 vs 6.4)
 * or by scope (3.2 vs 3.1). A CI test requires every query to find its rule.
 */
import type { FindingCode } from '../agent/types'

export const FINDING_QUERIES: Record<FindingCode, string> = {
  lectura_fallida: 'Un archivo de la carpeta no se pudo leer después de reintentar porque el servicio de lectura no respondió.',
  campo_ilegible: 'No se pudo obtener un dato necesario de un documento recibido, por ejemplo el RUT o el período.',
  baja_confianza: 'El servicio de lectura informó baja confianza en los datos extraídos de un documento.',
  rut_ilegible_otro_nombre: 'Un documento trae un RUT con dígito verificador inválido y un nombre que no es el del solicitante.',
  rut_ilegible: 'El RUT leído en un documento tiene un dígito verificador inválido, por lo que es un error de lectura; el nombre del documento coincide con el del solicitante y la carpeta confirma su identidad.',
  rut_distinto: 'Un documento tiene el nombre del solicitante pero un RUT válido distinto al de su cédula.',
  documento_de_otra_persona: 'Un documento pertenece a otra persona: tiene otro nombre y otro RUT.',
  documento_faltante: 'Falta un documento obligatorio en la carpeta del solicitante.',
  cedula_vencida: 'La cédula de identidad del solicitante está vencida a la fecha de revisión.',
  liquidacion_fuera_de_periodo: 'Además de las liquidaciones exigidas, la carpeta trae una liquidación de sueldo de otro mes, más antiguo.',
  sueldo_no_cuadra: 'La cotización AFP descontada en la liquidación no coincide con la cotización pagada que registra el certificado.',
  sueldo_sin_verificar: 'No se pudo comparar la liquidación con el certificado de cotizaciones porque falta el mes o la cotización.',
  afp_no_coincide: 'La AFP de la liquidación es distinta de la AFP que emite el certificado de cotizaciones.',
  nombre_distinto: 'Un documento tiene el RUT del solicitante, pero su nombre presenta diferencias.',
  documento_no_reconocido: 'La carpeta incluye un documento de un tipo que la revisión no usa.',
}

export const FINDING_RULE: Record<FindingCode, string> = {
  lectura_fallida: '6.1',
  campo_ilegible: '6.2',
  baja_confianza: '6.3',
  rut_ilegible_otro_nombre: '6.4',
  rut_ilegible: '4.4',
  rut_distinto: '4.3',
  documento_de_otra_persona: '4.2',
  documento_faltante: '3.1',
  cedula_vencida: '4.1',
  liquidacion_fuera_de_periodo: '3.2',
  sueldo_no_cuadra: '5.1',
  sueldo_sin_verificar: '5.2',
  afp_no_coincide: '5.3',
  nombre_distinto: '4.5',
  documento_no_reconocido: '3.3',
}
