# Reporte de evals de extracción · 20261119-1651

> **Dataset sintético.** Estas cifras miden la API de docs2json sobre 12 carpetas inventadas (47 archivos, 48 documentos) generadas por este repositorio. No son precisión en producción: los documentos reales son más variados, llegan escaneados o fotografiados de mil formas y no siguen nuestras plantillas. Sirven para comparar versiones entre sí y detectar regresiones.

Subconjuntos leídos: **Limpio** (12 carpetas, 47 archivos). El limpio trae documentos generados en PDF con texto; el difícil, fotos, escaneos, páginas giradas, JPEG comprimidos y otro formato de liquidación. Sus cifras se informan por separado: promediarlas mezclaría dos preguntas distintas.

## La corrida

- Fecha: 2026-11-19T19:51:52.902Z
- Pasadas completas sobre el dataset: 2
- Modelos que informó la API (`meta.models`): gemini-3.8-flash
- Versión del catálogo de docs2json: b8d602b58811
- Huella del dataset (SHA-256 de `manifest.json`): `f5f7e2a4ef95531d`
- Llamadas HTTP a la API de lectura: **100** (planificadas 94; reintentos por 429: 0; errores 5xx: 13; errores de red: 1)

## Resultados principales

Se separan dos preguntas distintas. **Disponibilidad**: ¿la API devolvió datos? **Calidad**: cuando devolvió datos, ¿eran correctos? Mezclarlas haría pasar una caída del servicio por un error del modelo, o al revés.

| Métrica | Corrida 1 | Corrida 2 | Promedio |
|---|---|---|---|
| **Disponibilidad**: documentos que volvieron con tipo y datos | 100,0% (48/48) | 83,3% (40/48) | 91,7% |
| Fallas explícitas: lecturas que terminaron en error HTTP (tras reintentar) | 0 de 47 | 8 de 47 |  |
| Fallas silenciosas: HTTP 200 sin tipo o sin campos | 0 | 0 |  |
| Intentos fallidos, incluidos los que un reintento recuperó | 8 (8 recuperadas) | 5 (3 recuperadas) |  |
| **Calidad**: exactitud de clasificación | 100,0% (48/48) | 100,0% (40/40) | 100,0% |
| Archivos separados en el número correcto de documentos | 100,0% (47/47) | 100,0% (39/39) | 100,0% |
| Exactitud de campos | 100,0% (597/597) | 100,0% (489/489) | 100,0% |
| Precisión de campos (de lo que devolvió con valor, cuánto estaba bien) | 100,0% | 100,0% | 100,0% |
| Cobertura de campos (de lo esperado, cuánto volvió bien) | 100,0% | 100,0% | 100,0% |
| **De punta a punta**: documentos bien clasificados, contando fallas | 100,0% (48/48) | 83,3% (40/48) | 91,7% |
| De punta a punta: campos que llegaron correctos | 100,0% (597/597) | 81,9% (489/597) | 91,0% |
| Latencia p50 por archivo | 19,9 s | 11,4 s | 15,6 s |
| Latencia p95 por archivo | 69,5 s | 64,4 s | 67,0 s |

**Consistencia entre corridas:** entre los documentos que volvieron con datos en ambas pasadas, 100,0% de los valores salieron idénticos (489 de 489) y la clasificación coincidió en 100,0%. 8 documentos volvieron con datos en una pasada y fallaron en la otra.

Cómo leer las métricas de campos: **exactitud** es aciertos sobre campos evaluados; un campo cuenta como acierto si, después de normalizar formato, es igual al esperado. **Precisión** mira solo lo que la API devolvió con valor. **Cobertura** mira solo lo que debía venir con valor. Las métricas de calidad se calculan sobre documentos que volvieron con datos y, en el caso de los campos, bien clasificados; las fallas cuentan en disponibilidad y en las métricas de punta a punta.

## Por forma de llegada

Sumando las pasadas. «Con datos» es disponibilidad; «Campos (calidad)» mide solo documentos que volvieron con datos y bien clasificados; «De punta a punta» cuenta las fallas. La descripción exacta de cada archivo está en su `expected.json`.

| Forma | Archivos | Documentos | Con datos | Bien clasificados | Campos (calidad) | Campos de punta a punta |
|---|---|---|---|---|---|---|
| PDF vectorial | 70 | 72 | 91,7% | 100,0% | 100,0% | 91,3% |
| foto PNG levemente girada y borrosa | 2 | 2 | 50,0% | 100,0% | 100,0% | 50,0% |
| imagen PNG | 22 | 22 | 95,5% | 100,0% | 100,0% | 95,5% |

## Campos por tipo de documento

| Tipo | Campos por corrida | Exactitud corrida 1 | Exactitud corrida 2 | Precisión | Cobertura |
|---|---|---|---|---|---|
| Cédula de identidad | 99 | 100,0% | 100,0% | 100,0% | 100,0% |
| Certificado de antigüedad | 21 | 100,0% | 100,0% | 100,0% | 100,0% |
| Certificado de cotizaciones AFP | 132 | 100,0% | 100,0% | 100,0% | 100,0% |
| Liquidación de sueldo | 345 | 100,0% | 100,0% | 100,0% | 100,0% |

## Detalle por campo

Errores sumados en todas las corridas: incorrecto (valor distinto), omitido (vino vacío) e inventado (vino un valor donde no debía haber).

### Cédula de identidad

| Campo | Exactitud corrida 1 | Exactitud corrida 2 | Incorrectos | Omitidos | Inventados |
|---|---|---|---|---|---|
| `rut` | 100,0% (11/11) | 100,0% (10/10) | 0 | 0 | 0 |
| `nombres` | 100,0% (11/11) | 100,0% (10/10) | 0 | 0 | 0 |
| `apellidos` | 100,0% (11/11) | 100,0% (10/10) | 0 | 0 | 0 |
| `nacionalidad` | 100,0% (11/11) | 100,0% (10/10) | 0 | 0 | 0 |
| `sexo` | 100,0% (11/11) | 100,0% (10/10) | 0 | 0 | 0 |
| `fecha_nacimiento` | 100,0% (11/11) | 100,0% (10/10) | 0 | 0 | 0 |
| `fecha_emision` | 100,0% (11/11) | 100,0% (10/10) | 0 | 0 | 0 |
| `fecha_vencimiento` | 100,0% (11/11) | 100,0% (10/10) | 0 | 0 | 0 |
| `docdate` | 100,0% (11/11) | 100,0% (10/10) | 0 | 0 | 0 |

### Certificado de antigüedad

| Campo | Exactitud corrida 1 | Exactitud corrida 2 | Incorrectos | Omitidos | Inventados |
|---|---|---|---|---|---|
| `rut` | 100,0% (3/3) | 100,0% (3/3) | 0 | 0 | 0 |
| `empleado` | 100,0% (3/3) | 100,0% (3/3) | 0 | 0 | 0 |
| `empleador` | 100,0% (3/3) | 100,0% (3/3) | 0 | 0 | 0 |
| `rut_empleador` | 100,0% (3/3) | 100,0% (3/3) | 0 | 0 | 0 |
| `cargo` | 100,0% (3/3) | 100,0% (3/3) | 0 | 0 | 0 |
| `fecha_ingreso` | 100,0% (3/3) | 100,0% (3/3) | 0 | 0 | 0 |
| `renta` | 100,0% (3/3) | 100,0% (3/3) | 0 | 0 | 0 |

### Certificado de cotizaciones AFP

| Campo | Exactitud corrida 1 | Exactitud corrida 2 | Incorrectos | Omitidos | Inventados |
|---|---|---|---|---|---|
| `rut` | 100,0% (11/11) | 100,0% (9/9) | 0 | 0 | 0 |
| `nombre` | 100,0% (11/11) | 100,0% (9/9) | 0 | 0 | 0 |
| `afp` | 100,0% (11/11) | 100,0% (9/9) | 0 | 0 | 0 |
| `periodo_desde` | 100,0% (11/11) | 100,0% (9/9) | 0 | 0 | 0 |
| `periodo_hasta` | 100,0% (11/11) | 100,0% (9/9) | 0 | 0 | 0 |
| `folio_certificacion` | 100,0% (11/11) | 100,0% (9/9) | 0 | 0 | 0 |
| `codigo_validador` | 100,0% (11/11) | 100,0% (9/9) | 0 | 0 | 0 |
| `meses_laguna` | 100,0% (11/11) | 100,0% (9/9) | 0 | 0 | 0 |
| `lagunas_largas` | 100,0% (11/11) | 100,0% (9/9) | 0 | 0 | 0 |
| `empleador_anterior` | 100,0% (11/11) | 100,0% (9/9) | 0 | 0 | 0 |
| `cotizaciones` | 100,0% (11/11) | 100,0% (9/9) | 0 | 0 | 0 |
| `docdate` | 100,0% (11/11) | 100,0% (9/9) | 0 | 0 | 0 |

### Liquidación de sueldo

| Campo | Exactitud corrida 1 | Exactitud corrida 2 | Incorrectos | Omitidos | Inventados |
|---|---|---|---|---|---|
| `rut` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `nombre` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `empleador` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `periodo` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `dias_trabajados` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `fecha_ingreso` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `cargo` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `institucion_previsional` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `institucion_salud` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `base_imponible` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `base_tributable` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `descuento_afp` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `haberes` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `descuentos` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |
| `docdate` | 100,0% (23/23) | 100,0% (18/18) | 0 | 0 | 0 |

## Tablas: fila por fila

Las listas (haberes, descuentos y la tabla de cotizaciones) se comparan también por fila, sumando las corridas. Una lista cuenta como campo correcto solo si todas sus filas coinciden.

| Lista | Filas esperadas | Filas devueltas | Coinciden | Precisión | Cobertura |
|---|---|---|---|---|---|
| `cotizaciones-afp.cotizaciones` | 234 | 234 | 234 | 100,0% | 100,0% |
| `liquidaciones-sueldo.descuentos` | 164 | 164 | 164 | 100,0% | 100,0% |
| `liquidaciones-sueldo.haberes` | 179 | 179 | 179 | 100,0% | 100,0% |

## Clasificación

Tipo esperado contra tipo devuelto, sumando las corridas. Las fallas aparecen como su propia categoría.

| Esperado | Devuelto | Documentos |
|---|---|---|
| Cédula de identidad | (error HTTP) | 1 |
| Cédula de identidad | igual | 21 |
| Certificado de antigüedad | igual | 6 |
| Certificado de cotizaciones AFP | (error HTTP) | 2 |
| Certificado de cotizaciones AFP | igual | 20 |
| Liquidación de sueldo | (error HTTP) | 5 |
| Liquidación de sueldo | igual | 41 |

## Consistencia entre corridas

La API no permite elegir el modelo (`meta.models` solo informa cuál corrió), así que no se pueden comparar dos modelos. En su lugar, el mismo dataset se lee dos veces con el mismo modelo y se mide cuánto cambia la respuesta.

- Valores idénticos: 489 de 489 (100,0%).
  - Cédula de identidad: 100,0% (90/90)
  - Liquidación de sueldo: 100,0% (270/270)
  - Certificado de cotizaciones AFP: 100,0% (108/108)
  - Certificado de antigüedad: 100,0% (21/21)
- Correctos en ambas: 489. Incorrectos en ambas (error estable): 0. Correctos en una sola (inestables): 0.

## Errores de extracción observados

Ningún campo con error en los documentos que volvieron con datos.

## Fallas por causa

Intentos que fallaron, agrupados por causa. Un código entre corchetes (`503 ai_timeout`, `503 ai_unavailable`) es una falla explícita y tipada de docs2json; `504 del proxy` es CloudFront cortando la espera. Las sesiones anteriores a `20261119-1246` no guardaban el motivo de los reintentos, solo el de la falla final.

| Causa | Corrida 1 | Corrida 2 |
|---|---|---|
| 503 ai_timeout | 7 | 4 |
| 504 del proxy | 1 | 0 |
| error de red | 0 | 1 |

## Respuestas HTTP 200 incompletas

Respuestas exitosas que no traen un documento completo. Las dos primeras filas son las fallas silenciosas que cuentan en la disponibilidad. Un documento sin tipo puede ser un no clasificado genuino (el clasificador corrió y no reconoció nada) o una falla del modelo; en este dataset todos los documentos son clasificables, así que cualquier «sin tipo» es un error. La última fila sí trae datos y cuenta como lectura, pero con confianza 0.

| Tipo de respuesta | Corrida 1 | Corrida 2 |
|---|---|---|
| Sin tipo (doctype null): no clasificado | 0 | 0 |
| Con tipo pero sin ningún campo | 0 | 0 |
| Con tipo y campos, pero confianza 0 | 2 | 2 |

- Corrida 1: f03/liquidaciones-2026-09-y-2026-10.pdf (documento 1): con tipo y campos, pero confianza 0, confianza 0.
- Corrida 1: f03/liquidaciones-2026-09-y-2026-10.pdf (documento 2): con tipo y campos, pero confianza 0, confianza 0.
- Corrida 2: f03/liquidaciones-2026-09-y-2026-10.pdf (documento 1): con tipo y campos, pero confianza 0, confianza 0.
- Corrida 2: f03/liquidaciones-2026-09-y-2026-10.pdf (documento 2): con tipo y campos, pero confianza 0, confianza 0.

## Errores de clasificación y fallas HTTP

- Corrida 2: f04/liquidacion-2026-10.pdf falló tras 2 intentos: HTTP 503 [ai_timeout]: The AI provider did not respond in time — retry the read..
- Corrida 2: f10/liquidacion-2026-10.pdf falló tras 0 intentos: no se leyó: se alcanzó el tope de llamadas.
- Corrida 2: f11/liquidacion-2026-10.pdf falló tras 0 intentos: no se leyó: se alcanzó el tope de llamadas.
- Corrida 2: f11/certificado-afp.pdf falló tras 0 intentos: no se leyó: se alcanzó el tope de llamadas.
- Corrida 2: f12/cedula.png falló tras 0 intentos: no se leyó: se alcanzó el tope de llamadas.
- Corrida 2: f12/liquidacion-2026-09-foto.png falló tras 0 intentos: no se leyó: se alcanzó el tope de llamadas.
- Corrida 2: f12/liquidacion-2026-10.pdf falló tras 0 intentos: no se leyó: se alcanzó el tope de llamadas.
- Corrida 2: f12/certificado-afp.pdf falló tras 0 intentos: no se leyó: se alcanzó el tope de llamadas.

## Latencia

Tiempo de pared medido desde este cliente para cada archivo: incluye red, cola del servidor y todas las llamadas al modelo que haga docs2json.

| Tipo de archivo | p50 / p95 corrida 1 | p50 / p95 corrida 2 | Archivos |
|---|---|---|---|
| application/pdf | 16,4 s / 69,5 s | 10,7 s / 64,4 s | 35 |
| image/png | 21,3 s / 79,9 s | 15,2 s / 62,7 s | 12 |

**Por tipo de documento** (lecturas exitosas; el PDF con dos liquidaciones cuenta como liquidación):

| Tipo de documento | p50 / p95 / máx. corrida 1 | p50 / p95 / máx. corrida 2 |
|---|---|---|
| Cédula de identidad | 27,0 s / 79,9 s / 79,9 s | 15,2 s / 62,7 s / 62,7 s |
| Certificado de antigüedad | 27,5 s / 34,9 s / 34,9 s | 7,7 s / 10,7 s / 10,7 s |
| Certificado de cotizaciones AFP | 15,1 s / 49,2 s / 49,2 s | 14,0 s / 44,2 s / 44,2 s |
| Liquidación de sueldo | 16,2 s / 69,5 s / 100,1 s | 10,6 s / 98,7 s / 98,7 s |

**Cada cédula** (latencia del último intento, intentos y resultado):

| Archivo | Corrida 1 | Corrida 2 |
|---|---|---|
| f01/cedula.png | 29,4 s · 1 intento(s) · ok | 29,3 s · 1 intento(s) · ok |
| f02/cedula.png | 12,9 s · 1 intento(s) · ok | 7,3 s · 1 intento(s) · ok |
| f03/cedula.png | 21,3 s · 1 intento(s) · ok | 15,2 s · 1 intento(s) · ok |
| f04/cedula.png | 45,6 s · 1 intento(s) · ok | 41,3 s · 2 intento(s) · ok (antes: 503 ai_timeout) |
| f05/cedula.png | 39,9 s · 2 intento(s) · ok (antes: 503 ai_timeout) | 8,0 s · 1 intento(s) · ok |
| f06/cedula.png | 18,3 s · 1 intento(s) · ok | 62,7 s · 1 intento(s) · ok |
| f07/cedula.png | 79,9 s · 1 intento(s) · ok | 8,4 s · 1 intento(s) · ok |
| f08/cedula.png | 27,0 s · 1 intento(s) · ok | 16,1 s · 1 intento(s) · ok |
| f09/cedula.png | 65,9 s · 1 intento(s) · ok | 11,4 s · 1 intento(s) · ok |
| f10/cedula.png | 9,8 s · 1 intento(s) · ok | 25,2 s · 1 intento(s) · ok |
| f12/cedula.png | 6,8 s · 1 intento(s) · ok | 0,0 s · 0 intento(s) · no se leyó: se alcanzó el tope de llamadas |

**Respuestas sospechosamente rápidas (posible caché):** f01/certificado-afp.pdf (corrida 2, 0,4 s, en el intento 2: el servidor pudo reutilizar el trabajo del intento anterior).

## Límites de esta medición

- **Sintético.** 48 documentos hechos con plantillas propias. Incluso el subconjunto difícil degrada documentos generados; no predice el desempeño con documentos reales.
- **Techo.** Si la calidad sale cerca de 100%, el dataset es demasiado fácil para distinguir una mejora: solo sirve para detectar regresiones. Para medir mejoras hacen falta documentos más difíciles (escaneos malos, fotos oscuras, formatos de otros empleadores).
- **Disponibilidad de un momento.** Las fallas dependen de la carga del servidor y de Vertex en la ventana de la corrida; otra hora puede dar otra cifra.
- **Muestra chica.** Con 48 documentos por pasada, un documento son 2,1% de exactitud de clasificación. Las diferencias pequeñas entre corridas no son significativas.
- **Sin comparación de modelos.** La API no expone selección de modelo. Se mide consistencia entre dos lecturas del mismo modelo; comparar modelos requeriría que docs2json lo permitiera.
- **Caché.** docs2json guarda resultados por contenido. Cada pasada sella los archivos con su etiqueta (texto al pie en PDF, metadato en PNG) para obligar una lectura nueva; las respuestas de menos de 3 s se marcan como sospechosas.
- **Costo.** La API no informa tokens ni costo. Se informa el número de llamadas; el costo real está en la facturación de Vertex de docs2json.
- **Latencia.** Medida desde el cliente; depende de la red y de la carga del servidor en ese momento.
- **Normalización.** RUT, montos, fechas, meses, nombres (mismas palabras en cualquier orden), instituciones (sin «AFP» ni «Isapre») y textos (sin tildes, mayúsculas ni puntuación) se comparan normalizados. Un error de tildes no cuenta como error.
