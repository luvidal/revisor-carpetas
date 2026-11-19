# Eval de búsqueda en la política

> **Política sintética.** «Política de evaluación de carpetas de crédito de consumo», versión 2026-11-19: 23 fragmentos (19 reglas y 4 secciones). Embeddings locales con `Xenova/multilingual-e5-small` (q8), sin llamadas externas.

Dos conjuntos de consultas: las **15 consultas del agente**, una por tipo de hallazgo, que son las que el agente realmente hace; y **34 preguntas de analista**, escritas con palabras distintas a las de la política. «Regla aplicada correcta» mira lo que el agente usa: la primera regla con decisión en el ranking.

## Consultas del agente (15)

| Método | recall@1 | recall@3 | recall@5 | MRR | Regla aplicada correcta |
|---|---|---|---|---|---|
| BM25 (léxica) | 93,3% | 100,0% | 100,0% | 0,956 | 93,3% |
| Embeddings (semántica) | 100,0% | 100,0% | 100,0% | 1,000 | 100,0% |
| Híbrida (RRF) | 100,0% | 100,0% | 100,0% | 1,000 | 100,0% |

## Preguntas de analista (34)

| Método | recall@1 | recall@3 | recall@5 | MRR | Regla aplicada correcta |
|---|---|---|---|---|---|
| BM25 (léxica) | 67,6% | 88,2% | 94,1% | 0,790 | 61,8% |
| Embeddings (semántica) | 67,6% | 91,2% | 97,1% | 0,790 | 58,8% |
| Híbrida (RRF) | 70,6% | 94,1% | 97,1% | 0,824 | 61,8% |

## Consultas que no quedaron primeras

Rango del primer fragmento correcto para cada método (1 = primero).

| Consulta | Correcto | BM25 | Embeddings | Híbrida | Primero en la híbrida |
|---|---|---|---|---|---|
| Un documento pertenece a otra persona: tiene otro nombre y otro RUT. | 4.2 | 3 | 1 | 1 | 4.2 |
| ¿Qué hago si el carnet del cliente está vencido? | 4.1 | 8 | 2 | 3 | s1 |
| ¿Cuántas liquidaciones de sueldo tiene que traer el cliente? | 3.1 | 2 | 2 | 1 | 3.1 |
| El postulante no adjuntó su carnet | 3.1 | 3 | 5 | 2 | 3.3 |
| El certificado de cotizaciones es de la hermana del cliente | 4.2 | 15 | 9 | 11 | 5.2 |
| Una liquidación trae el nombre correcto pero el RUT no calza con el carnet | 4.3 | 4 | 3 | 3 | 4.4 |
| Sospecho que cambiaron el número de RUT en la liquidación | 4.3 | 3 | 3 | 4 | 4.4 |
| El sistema leyó un RUT que no pasa la validación del dígito, pero el nombre es el mismo | 4.4 | 4 | 1 | 2 | 4.3 |
| Creo que la liquidación está inflada | 5.1 | 2 | 2 | 2 | 3.2 |
| ¿Cuál es el sueldo mínimo para pedir un crédito de consumo? | 5.5 | 2 | 1 | 1 | 5.5 |
| Además del carnet y las liquidaciones mandó una cartola del banco | 3.3 | 2 | 5 | 2 | 3.2 |
| Trae una liquidación de junio además de las de septiembre y octubre | 3.2 | 2 | 1 | 1 | 3.2 |
| Falta el certificado de la AFP | 3.1 | 1 | 2 | 2 | 5.3 |
| ¿Cuánta diferencia se acepta entre el descuento previsional y lo que muestra el certificado? | 5.1 | 1 | 3 | 1 | 5.1 |
| ¿Desde qué día se calcula si un documento está vigente? | s2, s9 | 1 | 3 | 2 | 4.1 |

## Límites

- Política corta y sintética (23 fragmentos) escrita para este proyecto; con un documento largo y real las cifras cambian.
- Las 34 preguntas las redactó el mismo autor de la política, aunque con otras palabras: miden robustez al cambio de vocabulario, no a preguntas de usuarios reales.
- Las consultas del agente son un conjunto cerrado; sus vectores se calculan al indexar y el agente no necesita el modelo al decidir.
