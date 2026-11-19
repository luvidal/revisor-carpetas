# Guion del video de 2 minutos

Para grabar la pantalla con voz. Todo lo que se muestra existe en el repositorio y corre sin costo. El texto es una guía para decirlo con tus palabras, no para leerlo.

**Antes de grabar:** terminal en `revisor-carpetas` con letra grande; en el navegador, el README en GitHub y el reporte del agente en vivo (`evals/agente/20261119-171147-vivo-rag-hibrido/report.md`); abiertos `dataset/folders/d04/liquidacion-2026-10-escaneo-girado.pdf` y `dataset/folders/f10/liquidacion-2026-09.pdf`. Corre `npm run demo` una vez antes, para que no haya demoras.

| Tiempo | Qué se ve | Qué se dice |
|---|---|---|
| 0:00–0:15 | Una liquidación sintética (f10) y el escaneo girado de d04 | «Un analista de crédito revisa carpetas como esta: cédula, liquidaciones, certificado de la AFP. Construí un agente que hace esa primera revisión. Todo es sintético: personas, empresas y documentos inventados». |
| 0:15–0:35 | El diagrama del README | «El agente lee cada documento con mi API de extracción, docs2json, valida, cruza la carpeta y busca en una política escrita la regla que aplica. El flujo es una máquina de estados determinista: la IA está en la lectura, la decisión está en código y en la política. Así la misma carpeta siempre da la misma decisión, con sus motivos». |
| 0:35–1:05 | `npm run demo -- f10 d04` | «En esta carpeta, las liquidaciones descuentan casi 300 mil pesos de AFP, pero el certificado registra 141 mil pagados: los ingresos no están respaldados, y el agente la escala citando la regla 5.1. En esta otra, un escaneo de lado trae el nombre correcto con otro RUT válido: posible alteración, regla 4.3. Fíjate en la observación: el modelo leyó "AFP Cuprum" donde decía "Quillay"». |
| 1:05–1:30 | Tabla de resultados del README | «Lo medí con evals. Separé disponibilidad de calidad. Eso destapó que mi API devolvía lecturas vacías con HTTP 200: se arregló y la eval repetida dio cero fallas silenciosas. En vivo, el agente acertó 16 de 18 carpetas, encontró los 12 defectos plantados y no cometió errores de lógica. Las dos que erró las escaló porque la lectura vino con confianza cero: prefirió no decidir a ciegas». |
| 1:30–1:50 | `politica/reporte-busqueda.md` | «La política se busca en local, sin LLM: BM25 más embeddings. Encontré reglas gemelas que solo se distinguen por una negación. Con BM25 sola, un error de búsqueda cambiaba una decisión. Con la búsqueda híbrida, las 15 consultas del agente encuentran su regla, y un test lo vigila en cada cambio». |
| 1:50–2:00 | Vuelta al README | «Lo construí dirigiendo agentes de programación. Es un proyecto sintético, así que las cifras miden el sistema y no producción. Lo que muestra es cómo pongo IA en un flujo real: herramientas, evals y decisiones que se pueden auditar». |

**Si se pasa de tiempo:** acorta la escena de la búsqueda (1:30–1:50) a una frase.

**Versión en inglés:** la misma estructura. Las cifras son las mismas: 16 de 18 decisiones, 0 errores de lógica, 12 de 12 defectos, 0 fallas silenciosas después del arreglo y 15 de 15 reglas correctas.
