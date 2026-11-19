# revisor-carpetas

Agente en TypeScript que revisa la carpeta de documentos de un solicitante chileno: clasifica y extrae con la API de docs2json, cruza los documentos entre sí, consulta una política de evaluación con RAG y decide con una máquina de estados explícita (lista para el analista, pedir un documento o escalar a una persona). Es el portafolio de Luis para agentes, RAG y evals, y su demo para pilotos de consultoría. Luis debe poder explicar cada decisión: el porqué importa tanto como el código.

## Fases

| Fase | Estado | Entregable |
|---|---|---|
| 0. Datos | Hecha | Generador de 18 carpetas sintéticas (12 limpias, 6 difíciles) con verdad esperada y defectos plantados |
| 1. Evals de extracción | Hecha | CLI que mide la API de docs2json, baseline y umbral de regresión |
| 2. Agente | Hecha | Máquina de estados determinista, reintentos, validaciones cruzadas, política como interfaz, replay y eval de punta a punta |
| 3. Política con búsqueda | Hecha | Política escrita, búsqueda local BM25 + embeddings + híbrida, recall@k, reglas citadas |
| 4. Mostrar | Hecha, salvo grabar el video | README de presentación, diagrama, demo grabable y guion del video |

No avances a una fase siguiente sin el visto bueno de Luis.

## Reglas duras

- **Solo datos sintéticos.** Jamás documentos reales, de clientes ni de terceros. Los RUT del dataset tienen cuerpo de 9 dígitos, que ningún RUT real tiene, con dígito verificador válido; no uses RUT de 7 u 8 dígitos ni siquiera en tests (salvo el ejemplo de manual 12.345.678-5, que verifica el algoritmo). Todo documento lleva visible «MUESTRA SINTÉTICA». Personas, empresas, AFP e isapres son inventadas; no se imitan instituciones reales.
- **Código nuevo.** No se copia código de otros proyectos ni de docs2json. No se modifica el repositorio de docs2json ni otros proyectos; docs2json se consulta en solo lectura y se usa solo por HTTP.
- **Publicación.** El repositorio público `luvidal/revisor-carpetas` tiene historial propio y limpio. Este repositorio de trabajo, `luvidal/revisor-carpetas-trabajo`, es privado porque su historial conserva datos retirados. Nunca empujar este historial al público: se publica exportando el árbol actual, con aprobación de Luis. El material personal (CV, entrevistas) no va en ninguno de los dos.
- **Clave de la API.** `DOCS2JSON_API_KEY` vive solo en `.env` (ignorado por Git). Nunca se comitea, imprime ni registra en logs.
- **Costo.** Cada lectura cuesta Vertex. Una corrida completa queda bajo unas 100 llamadas (`--max-calls`, por defecto 100). Informa siempre cuántas llamadas hiciste y anótalas en `evals/registro-llamadas.md`. Usa `--dry-run`, `--subset`, `--folders` y `npm run evals:score` (gratis) antes de volver a llamar a la API. Dos pasadas sobre todo el dataset (142 llamadas) superan el tope a propósito: corre los subconjuntos por separado.
- **Subconjuntos.** `limpio` (f01-f12) vigila regresiones y tiene el baseline; `dificil` (d01-d06) mide cuánto falta. Sus cifras se informan por separado, nunca promediadas.
- **Cifras honestas.** Ninguna cifra se presenta como precisión en producción: es precisión sobre un dataset sintético, y todo reporte lo dice.
- **CI sin llamadas pagadas.** GitHub Actions corre solo typecheck y tests unitarios.
- **Sin LLM generativo en el flujo.** El agente decide con código determinista; el único modelo generativo es el de docs2json. La búsqueda en la política es local (BM25 y embeddings con `Xenova/multilingual-e5-small`, que solo corre al indexar). Integrar un LLM o una credencial nueva requiere aprobación de Luis.
- **La política manda.** Decisiones y umbrales salen de `politica/politica-evaluacion.md` («Decisión:» y «Parámetros:» de cada regla). Si la cambias, o cambias `politica/consultas.json` o `src/rag/queries.ts`, corre `npm run rag:index` y luego `npm run rag:eval`: un test exige que el índice esté al día y que las 15 consultas del agente encuentren su regla.

## Validación

```bash
npm run typecheck && npm test
```

Ambos deben pasar antes de cada commit. Los tests no llaman a la API.

## Comandos

```bash
npm run dataset                                   # regenera dataset/ (determinista)
npm run evals -- --dry-run                        # plan y llamadas, sin llamar
npm run evals -- --subset limpio --runs 2         # corrida real del set limpio: 94 llamadas
npm run evals -- --subset dificil --runs 1 --max-calls 30   # subconjunto difícil: 24 llamadas
npm run evals -- --folders f03 --runs 1           # prueba de humo barata
npm run evals:score -- evals/runs/<sesión>        # re-puntúa respuestas guardadas, gratis
npm run evals:check -- evals/runs/<sesión>        # compara con evals/baseline.json; exit 1 si hay regresión
npm run evals:baseline -- evals/runs/<sesión> limpio   # promueve el subconjunto limpio de una sesión a baseline
npm run evals:compare -- evals/runs/<después> limpio=<sesión> dificil=<sesión>   # tabla antes/después, gratis
npm run demo                                      # demo: 4 carpetas en replay, gratis
npm run demo:video                                # regenera docs/demo.mp4 y docs/demo.gif (requiere ffmpeg local)
npm run agent -- review f08                       # el agente revisa una carpeta (replay, gratis)
npm run agent -- eval                             # eval de punta a punta en replay, gratis
npm run agent -- eval --live --max-calls 100      # eval de punta a punta en vivo (cuesta llamadas)
npm run agent -- eval --politica provisional      # con las reglas en código de la fase 2 (comparación)
npm run agent -- eval --busqueda bm25             # con otra búsqueda: bm25 | embeddings | hibrido (por defecto)
npm run rag:index                                 # reconstruye politica/indice.json (modelo local en .cache/modelos)
npm run rag:eval                                  # recall@k y MRR de la búsqueda, sin modelo
```

## Estructura

- `src/domain/`: RUT y formato de la verdad esperada (`expected.json`). Compartido por todas las fases.
- `src/dataset/`: fase 0. `scenarios.ts` (limpio) y `scenarios-hard.ts` (difícil) definen las carpetas a mano; `payroll.ts` calcula liquidaciones; `documents/` dibuja cada tipo (`payslip-alt.ts` es la plantilla B); `rendering.ts` decide cómo se produce cada archivo; `render/` convierte el diseño a PDF (pdf-lib) o PNG (resvg), y `render/raster.ts` lo degrada (perspectiva, sombra, ruido, rotación, JPEG).
- `src/docs2json/client.ts`: cliente HTTP con tope de llamadas, reintentos acotados y firma del cuerpo para CloudFront.
- `src/evals/`: fase 1. `normalize.ts` y `fields.ts` definen qué se compara y cómo; `score.ts` puntúa sin red; `consistency.ts` compara corridas; `summary.ts` arma el resumen y la puerta de regresión; `report.ts` escribe el reporte; `compare.ts` la tabla antes/después; `cli.ts` es la entrada.
- `src/agent/`: fase 2. `machine.ts` es la máquina de estados; `source.ts` la herramienta de lectura (vivo y replay); `retry.ts` la política de reintentos; `checks.ts` las validaciones y cruces; `policy.ts` la política provisional detrás de la interfaz `Policy`; `evaluate.ts` la eval de punta a punta; `cli.ts` la entrada.
- `src/rag/`: fase 3. `policy-doc.ts` lee la política en fragmentos; `bm25.ts` y `search.ts` buscan (léxica, semántica e híbrida); `queries.ts` tiene las consultas del agente y su regla correcta; `build-index.ts` arma el índice con el modelo local; `eval.ts` mide la búsqueda; `rag-policy.ts` implementa `Policy` buscando y citando.
- `politica/`: la política escrita, las 34 preguntas de prueba, el índice (`indice.json`, versionado) y el reporte de búsqueda.
- `dataset/`: carpetas generadas (`f*` limpias, `d*` difíciles), `manifest.json` con SHA-256 y subconjunto, y `README.md` generado. Se versiona.
- `evals/runs/<sesión>/`: respuestas crudas (`raw-c*.json`), `summary.json` y `report.md`. Se versionan: son sintéticas y permiten re-puntuar sin pagar.
- `evals/agente/<corrida>/`: revisiones del agente (`reviews.json`), resultados por carpeta, reporte y, en vivo, cada intento de lectura (`lecturas.json`), que sirve para replay.
- `evals/baseline.json`: métricas de referencia y umbrales de regresión del subconjunto limpio.
- `evals/registro-llamadas.md`: todas las llamadas pagadas hechas desde el repositorio.
- `docs/decisiones.md`: cada decisión de diseño con su porqué, en español.
- `docs/cifras-finales.md`: cada cifra final con la corrida de la que sale; es la fuente para README y material derivado.
- `docs/demo.gif` y `docs/demo.mp4`: la demo en video, generada por `src/demo-video.ts`; `docs/arquitectura.svg` y `.png`: diagrama estático para uso fuera de GitHub (el README usa Mermaid); `docs/guion-video.md`: guion para una versión narrada.
- `src/demo.ts`: la demo grabable, sobre las respuestas de la corrida en vivo `evals/agente/20261119-171147-vivo-rag-hibrido`.
- `tests/`: vitest.

## Entorno

- En Linux x64, `npm ci` de `onnxruntime-node` descarga binarios de CUDA si no se define `ONNXRUNTIME_NODE_INSTALL=skip` (el CI lo define). En macOS no hace falta.
- `.cache/` (modelo local) está en `.gitignore`.

## Convenciones

- Código e identificadores en inglés; documentación, reportes y commits en español.
- Commits con mensajes en español. Push a `origin main` solo al cerrar una tarea acordada.
- Si cambias el dataset, regenera con `npm run dataset`, corre los tests y explica en `docs/decisiones.md` por qué cambió: el baseline queda atado a la huella del dataset.
