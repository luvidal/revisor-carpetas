# Cifras finales

Cada cifra con la corrida de la que sale. Todo se midió sobre un **dataset sintético** (18 carpetas inventadas, 73 documentos): son cifras del sistema sobre ese dataset, no precisión en producción. Fecha de las mediciones: 19-11-2026.

Las corridas vigentes usan el dataset con RUT de 9 dígitos y están en este repositorio. Las anteriores usaban RUT de 8 dígitos posibles en la realidad: sus datos crudos se retiraron y solo quedan en el historial privado del repositorio de trabajo (commit `5ece250`). Se citan aquí porque son el «antes» de la comparación.

## El agente (de punta a punta)

| Cifra | Valor | Fuente |
|---|---|---|
| Decisiones correctas en vivo | **16 de 18** (11 de 12 limpias, 5 de 6 difíciles) | `evals/agente/20261119-171147-vivo-rag-hibrido` |
| Errores de decisión (lógica o política) | **0** | ídem |
| Carpetas escaladas por lecturas poco confiables | 2 (f03 y d05: docs2json devolvió confianza 0) | ídem |
| Defectos plantados encontrados | **12 de 12**, 0 inventados | ídem |
| Falsos positivos (carpetas sanas no marcadas como listas) | 1 de 7, por lectura; 0 por lógica | ídem |
| Llamadas de esa corrida | 73 (71 lecturas útiles y 2 reintentos) | ídem, `session.json` |
| Decisiones correctas con lecturas perfectas | 18 de 18 | test `tests/rag.test.ts` (y `tests/agent-machine.test.ts`) |
| Replay del vivo: mismas decisiones | sí, 18 de 18 iguales | `evals/agente/20261119-171932-replay-rag-hibrido` |
| Corrida en vivo anterior (dataset con RUT de 8 dígitos) | 17 de 18, 0 errores de decisión, 12 de 12 defectos, 0 falsos positivos | `20261119-1511` (retirada) |

## Extracción (API de docs2json)

| Cifra | Valor | Fuente |
|---|---|---|
| Calidad en el set limpio: clasificación y campos | **100%** (1.086 de 1.086 campos en 2 pasadas) | `evals/runs/20261119-1651` |
| Calidad en el set difícil: campos | **96,8%** (269 de 278) | `evals/runs/20261119-1706` |
| Disponibilidad actual: documentos que volvieron con datos | 91,7% limpio · 92,0% difícil, en una ventana lenta del servicio | `20261119-1651` · `20261119-1706` |
| Latencia por archivo, p50 / p95 | 15,6 s / 67,0 s limpio · 15,7 s / 89,5 s difícil | ídem |
| Fallas silenciosas (HTTP 200 vacío) **antes** del arreglo en docs2json | **9 de 121** documentos (6 de 96 en el set limpio, 2 pasadas; 3 de 25 en el difícil) | `20261119-1210` y `20261119-1246` (retiradas) |
| Fallas silenciosas **después** del arreglo | **0** en todas las corridas: 290 documentos en evals de extracción y 146 en las 2 corridas del agente en vivo | `20261119-1328`, `20261119-1613`, `20261119-1511` (retiradas); `20261119-1651`, `20261119-1706`, `20261119-171147-vivo-rag-hibrido` |
| Disponibilidad antes y después del arreglo, mismo método | 92,7% → **100%** | `20261119-1210` → `20261119-1613` (retiradas) |
| Ventana lenta del proveedor | disponibilidad 70,8% limpio y 60,0% difícil; mediana de PDF limpios 46,7 s contra 9,3 s | `20261119-1328` (retirada) |

## Búsqueda en la política (RAG local, sin LLM)

| Cifra | Valor | Fuente |
|---|---|---|
| Consultas del agente que encuentran su regla | **15 de 15** híbrida y embeddings · 14 de 15 BM25 | `politica/reporte-busqueda.md` |
| Preguntas de analista (34, no ajustadas), búsqueda híbrida | recall@1 **70,6%** · recall@3 **94,1%** · recall@5 97,1% · MRR 0,824 | ídem |
| Ídem con BM25 / embeddings | recall@3 88,2% / 91,2% · MRR 0,790 / 0,790 | ídem |
| Efecto de una búsqueda peor en la decisión | con BM25, f09 pasa de «pedir» a «escalar» | `evals/agente/20261119-171931-replay-rag-bm25` |

## Proyecto

| Cifra | Valor | Fuente |
|---|---|---|
| Tests | 151, sin llamadas a la API | `npm test` |
| Llamadas pagadas a docs2json en total | 608 | `evals/registro-llamadas.md` |
| Dataset | 18 carpetas (12 limpias, 6 difíciles), 71 archivos, 73 documentos, 4 tipos de defecto | `dataset/manifest.json` |
