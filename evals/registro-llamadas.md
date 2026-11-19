# Registro de llamadas a la API de docs2json

Cada lectura (`POST /v1/documents/read` con archivo) puede costar Vertex. Este registro suma todas las llamadas hechas desde este repositorio, incluidas las fallidas y las de prueba. Las corridas en replay (`npm run agent -- eval`, `npm run evals:score`) no llaman a la API y no se anotan. Las sondas sin archivo no llegan al modelo y no cuestan; se anotan aparte.

| Fecha | Sesión | Qué | Llamadas con archivo | Llegaron al modelo | Notas |
|---|---|---|---|---|---|
| 2026-11-19 | (sin carpeta) | Primera prueba de humo, carpeta f03 | 3 | 0 | CloudFront respondió 403: faltaba `x-amz-content-sha256`. Se borró la carpeta de esa sesión: no tenía respuestas útiles |
| 2026-11-19 | (sin carpeta) | Sondas sin archivo para diagnosticar el 403 | 0 | 0 | 4 sondas: sin clave (401), clave falsa (401), clave real con cuerpo sin firmar (403), clave real con cuerpo firmado sin archivo (400) |
| 2026-11-19 | `20261119-1209` | Prueba de humo, carpeta f03 | 3 | 3 | 100% de campos; latencias de 10 a 18 s |
| 2026-11-19 | `20261119-1210` | Corrida completa, 2 pasadas sobre 47 archivos | 99 | hasta 99 | 94 planificadas + 5 reintentos (4 por error de red, 1 por un 504). Baseline actual |
| 2026-11-19 | `20261119-1246` | Subconjunto difícil, 1 pasada sobre 24 archivos, tope 30 | 28 | hasta 28 | 24 planificadas + 4 reintentos, todos por 504 |
| 2026-11-19 | `20261119-1328` | Antes y después del arreglo de docs2json: 1 pasada sobre los dos subconjuntos (71 archivos) | 100 | hasta 100 | Llegó al tope: 71 planificadas + 29 reintentos (31 intentos con `503 ai_timeout`, 17 con `504`, 1 error de red); 5 archivos sin leer |
| 2026-11-19 | `evals/agente/20261119-1511` | Agente en vivo sobre las 18 carpetas (fase 2), tope 100 | 79 | hasta 79 | 71 lecturas útiles + 8 reintentos (7 `503 ai_timeout`, 1 `504`), todos recuperados |
| 2026-11-19 | `20261119-1613` | Repetición de la eval con el mismo método que `20261119-1210` (limpio, 2 pasadas), para verificar el arreglo de docs2json | 94 | 94 | Sin errores ni reintentos |
| 2026-11-19 | `20261119-1651` | Nueva medición con RUT de 9 dígitos: limpio, 2 pasadas | 100 | hasta 100 | Llegó al tope: 94 planificadas + 6 reintentos; 13 intentos fallidos (11 `503 ai_timeout`, 1 `504`, 1 error de red) |
| 2026-11-19 | `20261119-1706` | Nueva medición: difícil, 1 pasada | 29 | hasta 29 | 24 planificadas + 5 reintentos; 7 intentos fallidos (6 `503 ai_timeout`, 1 error de red) |
| 2026-11-19 | `evals/agente/20261119-171147-vivo-rag-hibrido` | Nueva medición: agente en vivo sobre las 18 carpetas | 73 | hasta 73 | 71 lecturas útiles + 2 reintentos |
| | | **Total** | **608** | **hasta 605** | |

Las sesiones anteriores al 19-11 a las 19:50 UTC usaban RUT de 8 dígitos posibles en la realidad. Sus datos crudos se retiraron del repositorio; sus filas quedan aquí para que el conteo de llamadas siga completo.
