# Reporte de evals de extracción · 20261119-1706

> **Dataset sintético.** Estas cifras miden la API de docs2json sobre 6 carpetas inventadas (24 archivos, 25 documentos) generadas por este repositorio. No son precisión en producción: los documentos reales son más variados, llegan escaneados o fotografiados de mil formas y no siguen nuestras plantillas. Sirven para comparar versiones entre sí y detectar regresiones.

Subconjuntos leídos: **Difícil** (6 carpetas, 24 archivos). El limpio trae documentos generados en PDF con texto; el difícil, fotos, escaneos, páginas giradas, JPEG comprimidos y otro formato de liquidación. Sus cifras se informan por separado: promediarlas mezclaría dos preguntas distintas.

## La corrida

- Fecha: 2026-11-19T20:06:12.752Z
- Pasadas completas sobre el dataset: 1
- Modelos que informó la API (`meta.models`): gemini-3.8-flash
- Versión del catálogo de docs2json: b8d602b58811
- Huella del dataset (SHA-256 de `manifest.json`): `9570ce061972e570`
- Llamadas HTTP a la API de lectura: **29** (planificadas 24; reintentos por 429: 0; errores 5xx: 6; errores de red: 1)

## Resultados principales

Se separan dos preguntas distintas. **Disponibilidad**: ¿la API devolvió datos? **Calidad**: cuando devolvió datos, ¿eran correctos? Mezclarlas haría pasar una caída del servicio por un error del modelo, o al revés.

| Métrica | Corrida 1 |
|---|---|
| **Disponibilidad**: documentos que volvieron con tipo y datos | 92,0% (23/25) |
| Fallas explícitas: lecturas que terminaron en error HTTP (tras reintentar) | 2 de 24 |
| Fallas silenciosas: HTTP 200 sin tipo o sin campos | 0 |
| Intentos fallidos, incluidos los que un reintento recuperó | 7 (3 recuperadas) |
| **Calidad**: exactitud de clasificación | 100,0% (23/23) |
| Archivos separados en el número correcto de documentos | 100,0% (22/22) |
| Exactitud de campos | 96,8% (269/278) |
| Precisión de campos (de lo que devolvió con valor, cuánto estaba bien) | 96,7% |
| Cobertura de campos (de lo esperado, cuánto volvió bien) | 96,7% |
| **De punta a punta**: documentos bien clasificados, contando fallas | 92,0% (23/25) |
| De punta a punta: campos que llegaron correctos | 87,3% (269/308) |
| Latencia p50 por archivo | 15,7 s |
| Latencia p95 por archivo | 89,5 s |

Cómo leer las métricas de campos: **exactitud** es aciertos sobre campos evaluados; un campo cuenta como acierto si, después de normalizar formato, es igual al esperado. **Precisión** mira solo lo que la API devolvió con valor. **Cobertura** mira solo lo que debía venir con valor. Las métricas de calidad se calculan sobre documentos que volvieron con datos y, en el caso de los campos, bien clasificados; las fallas cuentan en disponibilidad y en las métricas de punta a punta.

## Por forma de llegada

Sumando las pasadas. «Con datos» es disponibilidad; «Campos (calidad)» mide solo documentos que volvieron con datos y bien clasificados; «De punta a punta» cuenta las fallas. La descripción exacta de cada archivo está en su `expected.json`.

| Forma | Archivos | Documentos | Con datos | Bien clasificados | Campos (calidad) | Campos de punta a punta |
|---|---|---|---|---|---|---|
| PDF escaneado, girado 180° | 1 | 1 | 100,0% | 100,0% | 91,7% | 91,7% |
| PDF escaneado, girado 90° | 1 | 1 | 100,0% | 100,0% | 93,3% | 93,3% |
| PDF escaneado, plantilla B | 1 | 1 | 0,0% | 0,0% | 0,0% | 0,0% |
| PDF escaneado | 5 | 6 | 100,0% | 100,0% | 90,8% | 90,8% |
| PDF vectorial, girado 180° | 1 | 1 | 100,0% | 100,0% | 100,0% | 100,0% |
| PDF vectorial, girado 90°, plantilla B | 1 | 1 | 100,0% | 100,0% | 100,0% | 100,0% |
| PDF vectorial, plantilla B | 1 | 1 | 0,0% | 0,0% | 0,0% | 0,0% |
| foto JPEG, plantilla B | 1 | 1 | 100,0% | 100,0% | 100,0% | 100,0% |
| foto JPEG | 6 | 6 | 100,0% | 100,0% | 100,0% | 100,0% |
| foto PNG | 1 | 1 | 100,0% | 100,0% | 100,0% | 100,0% |
| imagen JPEG, muy comprimido, plantilla B | 2 | 2 | 100,0% | 100,0% | 100,0% | 100,0% |
| imagen JPEG, muy comprimido | 1 | 1 | 100,0% | 100,0% | 100,0% | 100,0% |
| imagen PNG, girado 180° | 1 | 1 | 100,0% | 100,0% | 100,0% | 100,0% |
| imagen PNG, girado 90° | 1 | 1 | 100,0% | 100,0% | 100,0% | 100,0% |

## Campos por tipo de documento

| Tipo | Campos por corrida | Exactitud corrida 1 | Precisión | Cobertura |
|---|---|---|---|---|
| Cédula de identidad | 54 | 100,0% | 100,0% | 100,0% |
| Certificado de antigüedad | 14 | 100,0% | 100,0% | 100,0% |
| Certificado de cotizaciones AFP | 60 | 91,7% | 90,9% | 90,9% |
| Liquidación de sueldo | 150 | 97,3% | 97,3% | 97,3% |

## Detalle por campo

Errores sumados en todas las corridas: incorrecto (valor distinto), omitido (vino vacío) e inventado (vino un valor donde no debía haber).

### Cédula de identidad

| Campo | Exactitud corrida 1 | Incorrectos | Omitidos | Inventados |
|---|---|---|---|---|
| `rut` | 100,0% (6/6) | 0 | 0 | 0 |
| `nombres` | 100,0% (6/6) | 0 | 0 | 0 |
| `apellidos` | 100,0% (6/6) | 0 | 0 | 0 |
| `nacionalidad` | 100,0% (6/6) | 0 | 0 | 0 |
| `sexo` | 100,0% (6/6) | 0 | 0 | 0 |
| `fecha_nacimiento` | 100,0% (6/6) | 0 | 0 | 0 |
| `fecha_emision` | 100,0% (6/6) | 0 | 0 | 0 |
| `fecha_vencimiento` | 100,0% (6/6) | 0 | 0 | 0 |
| `docdate` | 100,0% (6/6) | 0 | 0 | 0 |

### Certificado de antigüedad

| Campo | Exactitud corrida 1 | Incorrectos | Omitidos | Inventados |
|---|---|---|---|---|
| `rut` | 100,0% (2/2) | 0 | 0 | 0 |
| `empleado` | 100,0% (2/2) | 0 | 0 | 0 |
| `empleador` | 100,0% (2/2) | 0 | 0 | 0 |
| `rut_empleador` | 100,0% (2/2) | 0 | 0 | 0 |
| `cargo` | 100,0% (2/2) | 0 | 0 | 0 |
| `fecha_ingreso` | 100,0% (2/2) | 0 | 0 | 0 |
| `renta` | 100,0% (2/2) | 0 | 0 | 0 |

### Certificado de cotizaciones AFP

| Campo | Exactitud corrida 1 | Incorrectos | Omitidos | Inventados |
|---|---|---|---|---|
| `rut` | 80,0% (4/5) | 1 | 0 | 0 |
| `nombre` | 100,0% (5/5) | 0 | 0 | 0 |
| `afp` | 100,0% (5/5) | 0 | 0 | 0 |
| `periodo_desde` | 100,0% (5/5) | 0 | 0 | 0 |
| `periodo_hasta` | 100,0% (5/5) | 0 | 0 | 0 |
| `folio_certificacion` | 80,0% (4/5) | 1 | 0 | 0 |
| `codigo_validador` | 60,0% (3/5) | 2 | 0 | 0 |
| `meses_laguna` | 100,0% (5/5) | 0 | 0 | 0 |
| `lagunas_largas` | 100,0% (5/5) | 0 | 0 | 0 |
| `empleador_anterior` | 100,0% (5/5) | 0 | 0 | 0 |
| `cotizaciones` | 80,0% (4/5) | 1 | 0 | 0 |
| `docdate` | 100,0% (5/5) | 0 | 0 | 0 |

### Liquidación de sueldo

| Campo | Exactitud corrida 1 | Incorrectos | Omitidos | Inventados |
|---|---|---|---|---|
| `rut` | 80,0% (8/10) | 2 | 0 | 0 |
| `nombre` | 100,0% (10/10) | 0 | 0 | 0 |
| `empleador` | 100,0% (10/10) | 0 | 0 | 0 |
| `periodo` | 100,0% (10/10) | 0 | 0 | 0 |
| `dias_trabajados` | 100,0% (10/10) | 0 | 0 | 0 |
| `fecha_ingreso` | 100,0% (10/10) | 0 | 0 | 0 |
| `cargo` | 100,0% (10/10) | 0 | 0 | 0 |
| `institucion_previsional` | 80,0% (8/10) | 2 | 0 | 0 |
| `institucion_salud` | 100,0% (10/10) | 0 | 0 | 0 |
| `base_imponible` | 100,0% (10/10) | 0 | 0 | 0 |
| `base_tributable` | 100,0% (10/10) | 0 | 0 | 0 |
| `descuento_afp` | 100,0% (10/10) | 0 | 0 | 0 |
| `haberes` | 100,0% (10/10) | 0 | 0 | 0 |
| `descuentos` | 100,0% (10/10) | 0 | 0 | 0 |
| `docdate` | 100,0% (10/10) | 0 | 0 | 0 |

## Tablas: fila por fila

Las listas (haberes, descuentos y la tabla de cotizaciones) se comparan también por fila, sumando las corridas. Una lista cuenta como campo correcto solo si todas sus filas coinciden.

| Lista | Filas esperadas | Filas devueltas | Coinciden | Precisión | Cobertura |
|---|---|---|---|---|---|
| `cotizaciones-afp.cotizaciones` | 60 | 60 | 48 | 80,0% | 80,0% |
| `liquidaciones-sueldo.descuentos` | 40 | 40 | 40 | 100,0% | 100,0% |
| `liquidaciones-sueldo.haberes` | 46 | 46 | 46 | 100,0% | 100,0% |

## Clasificación

Tipo esperado contra tipo devuelto, sumando las corridas. Las fallas aparecen como su propia categoría.

| Esperado | Devuelto | Documentos |
|---|---|---|
| Cédula de identidad | igual | 6 |
| Certificado de antigüedad | igual | 2 |
| Certificado de cotizaciones AFP | igual | 5 |
| Liquidación de sueldo | (error HTTP) | 2 |
| Liquidación de sueldo | igual | 10 |

## Errores de extracción observados

Valores normalizados. Para las listas se muestra la clave de cada fila.

| Carpeta/archivo | Campo | Esperado | Obtenido | Corridas |
|---|---|---|---|---|
| d01/liquidacion-2026-10-escaneo.pdf | `rut` | 117215834-6 | 117215534-6 (incorrecto) | 1 |
| d01/liquidacion-2026-10-escaneo.pdf | `institucion_previsional` | QUILLAY | CUPRUM (incorrecto) | 1 |
| d03/certificado-afp-escaneo.pdf | `rut` | 116872451-5 | 18872491-5 (incorrecto) | 1 |
| d03/certificado-afp-escaneo.pdf | `folio_certificacion` | PEH-2026-1677024 | PEH-2026-3572524 (incorrecto) | 1 |
| d03/certificado-afp-escaneo.pdf | `codigo_validador` | T4H9-LW03 | 74N9-UWT3 (incorrecto) | 1 |
| d03/certificado-afp-escaneo.pdf | `cotizaciones` | 2025-11/156433/176255903-6 ; 2025-12/156433/176255903-6 ; 2026-01/1... | 2025-11/158433/176255903-K ; 2025-12/158433/176255903-K ; 2026-01/1... (incorrecto) | 1 |
| d04/liquidacion-2026-10-escaneo-girado.pdf | `institucion_previsional` | QUILLAY | CUILAY (incorrecto) | 1 |
| d05/liquidaciones-2026-09-y-2026-10-escaneo.pdf | `rut` | 112674590-3 | 112874590-3 (incorrecto) | 1 |
| d05/certificado-afp-escaneo-invertido.pdf | `codigo_validador` | C2Z8-RA47 | C22B-RA47 (incorrecto) | 1 |

## Fallas por causa

Intentos que fallaron, agrupados por causa. Un código entre corchetes (`503 ai_timeout`, `503 ai_unavailable`) es una falla explícita y tipada de docs2json; `504 del proxy` es CloudFront cortando la espera. Las sesiones anteriores a `20261119-1246` no guardaban el motivo de los reintentos, solo el de la falla final.

| Causa | Corrida 1 |
|---|---|
| 503 ai_timeout | 6 |
| error de red | 1 |

## Respuestas HTTP 200 incompletas

Respuestas exitosas que no traen un documento completo. Las dos primeras filas son las fallas silenciosas que cuentan en la disponibilidad. Un documento sin tipo puede ser un no clasificado genuino (el clasificador corrió y no reconoció nada) o una falla del modelo; en este dataset todos los documentos son clasificables, así que cualquier «sin tipo» es un error. La última fila sí trae datos y cuenta como lectura, pero con confianza 0.

| Tipo de respuesta | Corrida 1 |
|---|---|
| Sin tipo (doctype null): no clasificado | 0 |
| Con tipo pero sin ningún campo | 0 |
| Con tipo y campos, pero confianza 0 | 2 |

- Corrida 1: d05/liquidaciones-2026-09-y-2026-10-escaneo.pdf (documento 1): con tipo y campos, pero confianza 0, confianza 0.
- Corrida 1: d05/liquidaciones-2026-09-y-2026-10-escaneo.pdf (documento 2): con tipo y campos, pero confianza 0, confianza 0.

## Errores de clasificación y fallas HTTP

- Corrida 1: d02/liquidacion-2026-09.pdf falló tras 2 intentos: HTTP 503 [ai_timeout]: The AI provider did not respond in time — retry the read..
- Corrida 1: d04/liquidacion-2026-09-escaneo.pdf falló tras 2 intentos: HTTP 503 [ai_timeout]: The AI provider did not respond in time — retry the read..

## Latencia

Tiempo de pared medido desde este cliente para cada archivo: incluye red, cola del servidor y todas las llamadas al modelo que haga docs2json.

| Tipo de archivo | p50 / p95 corrida 1 | Archivos |
|---|---|---|
| application/pdf | 18,2 s / 89,5 s | 9 |
| image/jpeg | 15,7 s / 78,0 s | 10 |
| image/png | 15,3 s / 93,4 s | 3 |

**Por tipo de documento** (lecturas exitosas; el PDF con dos liquidaciones cuenta como liquidación):

| Tipo de documento | p50 / p95 / máx. corrida 1 |
|---|---|
| Cédula de identidad | 14,0 s / 93,4 s / 93,4 s |
| Certificado de antigüedad | 11,1 s / 13,8 s / 13,8 s |
| Certificado de cotizaciones AFP | 23,7 s / 79,0 s / 79,0 s |
| Liquidación de sueldo | 24,8 s / 89,5 s / 89,5 s |

**Cada cédula** (latencia del último intento, intentos y resultado):

| Archivo | Corrida 1 |
|---|---|
| d01/cedula-foto.jpg | 15,7 s · 1 intento(s) · ok |
| d02/cedula-invertida.png | 93,4 s · 1 intento(s) · ok |
| d03/cedula-comprimida.jpg | 7,7 s · 1 intento(s) · ok |
| d04/cedula-foto.png | 15,3 s · 1 intento(s) · ok |
| d05/cedula-foto.jpg | 7,9 s · 1 intento(s) · ok |
| d06/cedula-girada.png | 14,0 s · 2 intento(s) · ok (antes: 503 ai_timeout) |

Ninguna respuesta bajó de 3,0 s: no hay señales de lecturas servidas desde caché.

## Límites de esta medición

- **Sintético.** 25 documentos hechos con plantillas propias. Incluso el subconjunto difícil degrada documentos generados; no predice el desempeño con documentos reales.
- **Techo.** Si la calidad sale cerca de 100%, el dataset es demasiado fácil para distinguir una mejora: solo sirve para detectar regresiones. Para medir mejoras hacen falta documentos más difíciles (escaneos malos, fotos oscuras, formatos de otros empleadores).
- **Disponibilidad de un momento.** Las fallas dependen de la carga del servidor y de Vertex en la ventana de la corrida; otra hora puede dar otra cifra.
- **Muestra chica.** Con 25 documentos por pasada, un documento son 4,0% de exactitud de clasificación. Las diferencias pequeñas entre corridas no son significativas.
- **Sin comparación de modelos.** La API no expone selección de modelo. Se mide consistencia entre dos lecturas del mismo modelo; comparar modelos requeriría que docs2json lo permitiera.
- **Caché.** docs2json guarda resultados por contenido. Cada pasada sella los archivos con su etiqueta (texto al pie en PDF, metadato en PNG) para obligar una lectura nueva; las respuestas de menos de 3 s se marcan como sospechosas.
- **Costo.** La API no informa tokens ni costo. Se informa el número de llamadas; el costo real está en la facturación de Vertex de docs2json.
- **Latencia.** Medida desde el cliente; depende de la red y de la carga del servidor en ese momento.
- **Normalización.** RUT, montos, fechas, meses, nombres (mismas palabras en cualquier orden), instituciones (sin «AFP» ni «Isapre») y textos (sin tildes, mayúsculas ni puntuación) se comparan normalizados. Un error de tildes no cuenta como error.
