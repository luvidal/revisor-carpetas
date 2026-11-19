# Decisiones de diseño

Cada decisión con su porqué, escrita para que otra persona la pueda entender y discutir. Fases 0 a 4, 19 de noviembre de 2026.

## Contexto en una frase

Un agente que revisa la carpeta de documentos de un solicitante de crédito chileno necesita, antes que nada, saber cuánto puede confiar en la lectura de esos documentos. Por eso el proyecto empieza por los datos y por medir la extracción, no por el agente.

## Lenguaje y herramientas

**TypeScript, no Python.** Es mi lenguaje fuerte. En un proyecto de dos semanas, el lenguaje que domino da un resultado más hondo, que puedo defender línea por línea. Buena parte del ecosistema de agentes y evals está en Python; esa brecha queda declarada, no disimulada.

**Pocas dependencias.** `pdf-lib` para escribir PDF, `@resvg/resvg-js` para convertir SVG a PNG y nada más en producción. El HTTP usa `fetch` nativo de Node 24 y el `.env` se lee con `process.loadEnvFile`, sin `dotenv`. Menos dependencias, menos superficie que mantener y que explicar.

**TypeScript 7 y Vitest.** El compilador nativo de TypeScript 7 hace el typecheck en un instante; Vitest corre los tests sin configuración.

**Código en inglés, documentación en español.** El código lo puede leer cualquier equipo; los documentos, reportes y commits están en el idioma de Luis y de sus clientes. Los términos del dominio chileno (RUT, AFP, liquidación) se dejan tal cual porque no tienen traducción útil.

## docs2json como herramienta externa

**Se usa solo por HTTP, como caja negra.** docs2json es mi API de extracción de documentos chilenos con Gemini. El agente la trata como trataría cualquier servicio de terceros: un contrato (`POST /v1/documents/read`) y nada más. No importo su código ni lo modifico. Así el proyecto muestra lo que pasa en un despliegue real: integrar un servicio que no controlas y medirlo desde afuera.

**Hallazgo de integración: CloudFront exige firmar el cuerpo.** La primera prueba devolvió 403 en 0,4 segundos, un código que la API no documenta. Investigando con llamadas sin archivo (gratis, nunca llegan al modelo) vi que la API está detrás de CloudFront con una Lambda Function URL firmada: todo POST con cuerpo debe traer el SHA-256 del cuerpo en `x-amz-content-sha256`. El cliente de la demo de docs2json ya lo hace; el README no lo dice. Por eso el cliente arma el multipart a mano: necesita los bytes exactos antes de enviarlos para poder calcular el hash. Es un buen ejemplo de trabajo de forward deployed: el contrato documentado no siempre es el contrato real.

**Reintentos acotados.** Solo se reintenta un 429 (`ai_busy`, que el servidor rechaza antes de llamar al modelo) con espera creciente, y un 5xx o error de red una sola vez. Un timeout del cliente no se reintenta: el servidor pudo haber leído (y cobrado) igual. Un 401 o 403 no se reintenta nunca: repetir no lo arregla. El reintento por error de red tiene un costo que acepto y declaro: si la conexión se cortó después de que el servidor leyó, el reintento cobra dos veces. Cada reintento cuenta en el registro de llamadas y el cliente guarda el motivo de cada uno.

**Tope de llamadas como guardarraíl.** Cada lectura cuesta Vertex. El CLI calcula el plan antes de llamar (archivos × pasadas) y se niega a partir si supera el tope (100 por defecto). El cliente además cuenta cada llamada HTTP, reintentos incluidos, y se detiene en seco al llegar al tope. `--dry-run` muestra el plan sin gastar nada.

## Fase 0: el dataset

**Doce carpetas escritas a mano, no aleatorias.** Cada carpeta es un caso de prueba con nombre: «falta la liquidación de octubre», «certificado AFP de otra persona». Un generador aleatorio produce volumen, pero no casos que uno pueda explicar uno por uno ni garantizar que cubran cada defecto. Doce casos explícitos cubren las cuatro clases de defecto y cinco carpetas limpias, y caben en una tabla.

**Cuatro tipos de documento del catálogo de docs2json.** Liquidación de sueldo y certificado de cotizaciones AFP (los prioritarios, porque permiten cruzar ingresos), cédula de identidad (identidad y vigencia) y certificado de antigüedad laboral (empleador, fecha de ingreso y renta). Son los que un analista cruza para validar ingresos y los que se pueden generar de forma creíble.

**Los defectos que se plantan y por qué.**
- *RUT distinto*: dos variantes. Una liquidación con dos dígitos transpuestos y el mismo nombre (sutil: solo la detecta quien cruza el RUT) y un certificado AFP que es de otra persona (evidente: otro nombre y otro RUT).
- *Sueldo que no cuadra*: las liquidaciones declaran una renta mayor que la que respaldan las cotizaciones AFP de esos mismos meses. Es el patrón clásico de una liquidación adulterada.
- *Documento vencido*: una cédula vencida antes de la fecha de revisión.
- *Documento faltante*: falta el certificado AFP, falta una liquidación o falta la cédula.
- Una carpeta combina dos defectos (sueldo que no cuadra y cédula faltante) para probar que el agente reporte ambos y priorice.

**Variación de formato a propósito.** Una carpeta trae las dos liquidaciones en un solo PDF (prueba la separación de documentos), otra trae una liquidación fotografiada (PNG torcido y algo borroso), una cédula es de una residente extranjera y dos carpetas tienen meses sin cotización o cambio de empleador. Sin esto, el dataset solo mediría el caso fácil.

**La verdad esperada sale del mismo dato que se dibuja.** Cada plantilla devuelve a la vez la página y el JSON esperado, a partir de los mismos números. No hay forma de que el PDF diga una cosa y el JSON otra.

**Un test verifica los defectos plantados.** `tests/dataset.test.ts` comprueba que cada defecto declarado existe en los datos y que las carpetas limpias no tienen inconsistencias accidentales: mismos RUT, cotización de la liquidación igual a la del certificado, cédula vigente, documentos completos. También verifica dígitos verificadores, que las liquidaciones sumen y que cada página lleve «MUESTRA SINTÉTICA». Un dataset de evaluación con errores propios invalida todo lo que se mida con él.

**Liquidaciones con aritmética chilena, pero ficticia.** Gratificación con tope, AFP con comisión, salud 7%, seguro de cesantía 0,6% e impuesto único por tramos de UTM, con parámetros inventados para 2026. No es un motor de remuneraciones: solo necesita ser coherente para que los cruces signifiquen algo.

**Nada imita instituciones reales.** Las AFP (Quillay, Pehuén, Litoral), las isapres y las empresas son inventadas. La cédula es esquemática: sin foto, sin código QR, sin zona de lectura mecánica, con franja y marca de agua «MUESTRA SINTÉTICA». Basta para que un clasificador reconozca el tipo, pero no puede pasar por un documento real. Los RUT sí tienen dígito verificador válido, porque un RUT inválido lo detectaría cualquier validador y arruinaría el caso; los nombres asociados son inventados.

**Un diseño, dos salidas.** Cada documento se describe una vez como páginas con elementos posicionados y se dibuja como PDF (pdf-lib) o como PNG (SVG convertido con resvg). La foto de la liquidación es el mismo diseño con rotación, desenfoque, fondo e iluminación desigual.

**Determinista y versionado.** `npm run dataset` produce exactamente los mismos PDF (fechas de metadatos fijas) y el manifiesto guarda el SHA-256 de cada archivo. El dataset se comitea: es la referencia contra la que se comparan todas las corridas, y el baseline queda atado a su huella.

**Decisión esperada provisional.** Cada carpeta trae la decisión que debería tomar el agente: lista para el analista, pedir un documento o escalar a una persona. Es provisional porque la regla formal llega con la política de la fase 3; la dejo escrita para que Luis la revise antes de construir el agente. El criterio usado: falta o venció algo que el solicitante puede corregir, se le pide; hay señal de posible adulteración (ingresos no respaldados, mismo nombre con otro RUT), lo revisa una persona, y esa señal manda sobre un documento faltante.

## Fase 1: las evals de extracción

**Medir antes de construir el agente.** El agente decide sobre lo que extrae docs2json. Si no sé cuánto se equivoca la extracción, no sé si una mala decisión del agente es culpa del agente o del dato.

**Separar lo caro de lo barato.** La corrida contra la API guarda cada respuesta cruda en `evals/runs/<sesión>/raw-c*.json`. El puntaje es una función pura sobre esos archivos, sin red. Consecuencias: puedo corregir un normalizador y volver a puntuar gratis (`npm run evals:score`), los tests del puntaje no necesitan la API, y la fase 2 podrá desarrollar el agente contra respuestas grabadas sin pagar cada iteración.

**Un sello por corrida contra el caché.** docs2json guarda resultados por contenido del archivo. Si mando el mismo archivo dos veces, la segunda respuesta sale del caché: latencia cero y una consistencia falsa del 100%. Cada pasada sella los archivos con su etiqueta (una línea mínima al pie de cada página del PDF, un metadato `tEXt` en el PNG, que no cambia los píxeles), así cada lectura es nueva. El reporte además marca cualquier respuesta de menos de 3 segundos como sospechosa de venir del caché.

**Qué campos se evalúan.** No todos: los que el agente va a usar. Identidad (RUT, nombres), ingresos (base imponible, base tributable, cotización AFP descontada), fechas (período, ingreso, emisión, vencimiento, `docdate`) y la tabla de cotizaciones completa. Campos de texto libre como `antiguedad` («11 años y 2 meses») no se evalúan: compararlos exige criterio, no normalización.

**Normalizar formato, no contenido.** «118.456.789-6» y «118456789-6» son el mismo RUT; «$ 1.071.667» y 1071667 el mismo monto; «02 MAR 1990» y «1990-03-02» la misma fecha; «ROJAS TAPIA MARÍA» y «María Rojas Tapia» el mismo nombre; «AFP Quillay» y «QUILLAY» la misma institución. Las diferencias de formato no son errores de extracción. El costo de esta decisión, declarado en el reporte: un error de tildes no cuenta como error.

**Exactitud, precisión y cobertura, por separado.** La exactitud es aciertos sobre campos evaluados. La precisión mira solo lo que la API devolvió con valor: ¿cuándo responde algo, acierta? La cobertura mira solo lo que debía venir: ¿cuánto de lo esperado llegó bien? Separarlas distingue un modelo que inventa de uno que omite, y no es lo mismo para un agente: un valor inventado es peor que uno vacío, porque el vacío se puede pedir.

**Los campos se miden sobre documentos bien clasificados.** Si una liquidación se clasifica como otra cosa, sus campos no se cuentan como errores de extracción: ese error ya está en la exactitud de clasificación. Así cada error se cuenta una vez y en el lugar que corresponde.

**Las tablas se comparan como multiconjuntos.** Haberes, descuentos y cotizaciones se comparan fila a fila sin importar el orden: cada fila tiene una clave (monto; o período, monto y RUT pagador). La lista cuenta como campo correcto solo si todas las filas coinciden, y además se informa precisión y cobertura por fila, para ver si falla una fila o toda la tabla.

**Emparejar documentos por páginas.** Un PDF con dos liquidaciones debe volver como dos documentos. Cada documento esperado se empareja con el devuelto cuyas páginas más se superponen, no por orden de llegada. Además se mide qué porcentaje de archivos se separó en el número correcto de documentos.

**Latencia p50 y p95 por archivo, desde el cliente.** Es el tiempo que vería el agente, con red y cola del servidor incluidas. p50 dice lo normal; p95 dice cuánto esperar en un mal caso, que es lo que importa para diseñar tiempos de espera.

**Consistencia entre corridas en vez de comparar modelos.** El plan original era comparar dos modelos. La API no deja elegir el modelo (`meta.models` solo informa cuál corrió) y no corresponde modificar docs2json para esto. En su lugar, el mismo dataset se lee dos veces y se mide cuánto cambia la respuesta: valores idénticos, errores estables (fallan en ambas) y errores inestables (fallan en una). Un error estable se puede corregir con una regla; uno inestable obliga a diseñar el agente para dudar. El límite queda escrito en el reporte.

**Costo: llamadas, no pesos.** La API no informa tokens ni costo. El reporte informa llamadas HTTP; el costo real está en la facturación de Vertex de docs2json. No invento una cifra que no puedo medir.

**Disponibilidad separada de calidad.** Es la decisión más importante de la fase y salió de mirar la primera corrida real. El reporte inicial decía «clasificación 95,8%, consistencia 94,6%»: parecía un modelo inestable. Al revisar los errores uno por uno, ninguno era un valor equivocado. Eran 7 lecturas de 94 que fallaron: un 504 de CloudFront y 6 respuestas con HTTP 200 pero sin tipo o sin campos (confianza 0), todas tras 70 a 105 segundos. Son dos preguntas distintas: ¿la API devolvió datos? (disponibilidad) y, cuando devolvió, ¿eran correctos? (calidad). Mezclarlas culpa al modelo de una falla del servicio y ensancha el umbral de regresión hasta volverlo inútil (17 puntos). Ahora el reporte muestra disponibilidad, calidad sobre lo que volvió con datos, y una cifra de punta a punta que cuenta las fallas, que es lo que realmente recibiría el agente.

**Las fallas silenciosas son un requisito para el agente.** Una lectura vacía llega con HTTP 200: el agente no puede confiar en el código HTTP. Tiene que tratar «sin tipo, sin campos o confianza 0» como lectura fallida, reintentar una vez y, si persiste, escalar. Esto entra al diseño de la fase 2 como dato medido, no como suposición.

**Baseline con umbral derivado del ruido medido.** El baseline guarda las métricas promedio de la corrida aceptada, el modelo y la huella del dataset. El umbral de regresión no es un número elegido a ojo: nunca es más estricto que un documento de clasificación (1 de 48), 2 puntos de exactitud de campos o 5 puntos por tipo de documento, y se ensancha al doble de la variación medida entre las dos pasadas. Un umbral más estricto que el ruido daría falsas alarmas. La puerta falla solo por calidad. La disponibilidad, la consistencia y la latencia generan avisos: dependen del servidor y del momento. La disponibilidad varió 10 puntos entre las dos pasadas de la misma tarde, así que su aviso salta recién con una caída de 21 puntos.

**CI sin llamadas pagadas.** GitHub Actions corre typecheck y tests unitarios, nada más: no tiene la clave y no puede gastar. La puerta de regresión (`npm run evals:check`) se corre a mano después de una corrida real y sale con código 1 si hay regresión, lista para conectarse a un flujo con aprobación cuando valga la pena pagar por cada cambio.

## Lo que mostró la primera corrida

Sesión `20261119-1210`, dos pasadas sobre las 12 carpetas, modelo `gemini-3.8-flash` según `meta.models`, 99 llamadas. Reporte original (datos crudos retirados; ver «RUT imposibles y nueva medición»).

- **Calidad: 100%.** Clasificación, separación de PDF, campos y filas de tablas, en las dos pasadas. Ningún valor incorrecto ni inventado en 1.115 campos evaluados.
- **Disponibilidad: 92,7%** de los documentos volvió con datos (97,9% en la primera pasada, 87,5% en la segunda). De punta a punta, contando fallas, llegó correcto el 93,4% de los campos.
- **Latencia por archivo:** p50 de 10,5 s y p95 de 65 s. Las fallas se concentran en la cola lenta: todas tardaron 70 s o más.
- **Consistencia:** 100% de valores idénticos entre pasadas cuando ambas devolvieron datos.

## El subconjunto difícil (19-11-2026, tarde)

**Por qué.** Con calidad de 100% en el set limpio, la eval solo podía detectar si algo empeoraba, nunca si mejoraba. Una eval que siempre da 100% no distingue un sistema bueno de uno mejor.

**Qué se agregó.** Seis carpetas nuevas (d01 a d06, 24 archivos, 25 documentos) con los mismos tipos de documento, llegados como llegan los reales: fotos con perspectiva y sombra, escaneos con ruido entre 75 y 100 ppp, páginas giradas 90° y 180° (como PDF con el atributo de rotación y como imagen), JPEG con calidad 12 a 15, páginas inclinadas 3° a 5° y liquidaciones de otro sistema de remuneraciones (plantilla B: una sola tabla con código, concepto, haberes y descuentos; etiquetas abreviadas; el mes como «10/2026»; «alcance líquido»). Los defectos se plantan igual que en el set limpio (dos carpetas limpias, sueldo que no cuadra, RUT distinto, cédula vencida y documento faltante), así la fase 3 también podrá medir decisiones sobre carpetas difíciles.

**Separado del set limpio, no mezclado.** Cada carpeta declara su subconjunto (`limpio` o `dificil`) y las evals informan ambos por separado. Promediarlos daría una cifra que no responde ninguna pregunta: el limpio vigila regresiones, el difícil mide cuánto falta. El baseline queda atado al subconjunto limpio; una corrida que no lo incluye no se compara contra él.

**La degradación es código, no imágenes sueltas.** Un mismo diseño de página se dibuja y después se degrada con pasos explícitos y reproducibles: perspectiva con una homografía (la transformación que lleva el rectángulo de la hoja a un cuadrilátero, como al fotografiarla en ángulo), sombra diagonal suave, ruido de escáner con un generador pseudoaleatorio con semilla, rotaciones exactas en pasos de 90° y compresión JPEG. La verdad esperada no cambia: es el mismo documento, llegado peor. Los 47 archivos limpios quedaron idénticos byte a byte.

**La huella del dataset pasó a ser por carpetas.** Antes era el SHA-256 del manifiesto completo, así que agregar el subconjunto difícil habría «cambiado» el dataset de la sesión limpia sin que cambiara un solo archivo. Ahora la huella cubre solo las carpetas leídas. Las dos sesiones anteriores se recalcularon con el nuevo algoritmo después de verificar que sus archivos tenían el mismo SHA-256; sus cifras no cambiaron.

**Una sola corrida acotada.** Una pasada sobre el subconjunto difícil con tope de 30 llamadas, solo para confirmar que la eval ahora discrimina. La corrida completa de antes y después espera a que termine el arreglo de las fallas silenciosas en docs2json, que va por separado.

### Lo que mostró la corrida acotada (sesión `20261119-1246`)

28 llamadas (24 planificadas y 4 reintentos por 504). Reporte original (datos crudos retirados; ver «RUT imposibles y nueva medición»).

- **La eval ya no da 100%.** Calidad de campos 97,7% (251 de 257) contra 100% del set limpio; de punta a punta, contando fallas, 81,5% de los campos llegó correcto. La clasificación siguió en 100% cuando hubo datos.
- **El modelo reemplaza lo ilegible por lo conocido.** En tres escaneos con ruido leyó «AFP Cuprum» (una AFP real) donde decía «AFP Quillay» (inventada), con confianza 0,99. Es un sesgo hacia nombres conocidos: cuando el texto no se lee bien, completa con lo probable. La confianza que devuelve la API no sirve para detectarlo.
- **Errores de lectura de dígitos.** Un RUT leído con un dígito cambiado, un sueldo base de 900.000 en vez de 980.000 y un código validador con letras confundidas por números. El RUT mal leído tiene dígito verificador inválido: un validador lo detecta como error de lectura y evita acusar un falso «RUT distinto».
- **Disponibilidad 84%.** Un 504 tras reintentar y tres respuestas vacías con HTTP 200 (dos certificados AFP escaneados sin tipo y una foto de liquidación con confianza 0).
- **Más lento.** Latencia p50 de 38 s contra 10,5 s del set limpio; p95 de 95 s.
- **Lo que sí aguantó:** páginas giradas 90° y 180°, JPEG con calidad 12 a 15 y la plantilla B en PDF o imagen comprimida salieron sin errores de campos. Lo que más cuesta son los escaneos con ruido a baja resolución.

**Qué implica para el agente (fase 2).** No basta con la confianza de la API. El agente debe validar el dígito verificador de cada RUT, cruzar la AFP de la liquidación con la del certificado, tratar las respuestas vacías como fallas y, cuando un dato crítico viene de un escaneo de baja calidad, pedir una copia mejor o escalar en vez de decidir.

## Antes y después del arreglo de docs2json (PR #7 de docs2json, repositorio privado)

**Qué cambió en docs2json.** Desde las 16:25 UTC del 19-11, cuando una llamada a Gemini agota su tiempo (también al reintentar), la API responde `503` con `code` `ai_timeout` o `ai_unavailable`, en vez de un HTTP 200 con el documento vacío.

**Qué cambió aquí antes de medir.** El cliente guarda ese `code` en el error («HTTP 503 [ai_timeout]: …») y el reporte separa tres cosas: fallas explícitas (la lectura terminó en un error HTTP tras reintentar), fallas silenciosas (HTTP 200 vacío) e intentos fallidos que un reintento recuperó, con su causa. Un comando nuevo, `npm run evals:compare`, arma la tabla de antes y después por subconjunto. La política de reintentos no cambió (un reintento por 5xx), para que la comparación sea justa.

**La corrida** (sesión `20261119-1328`, una pasada sobre los dos subconjuntos, 16:28 a 16:59 UTC). Llegó al tope de 100 llamadas: 71 planificadas y 29 reintentos. Cinco archivos del subconjunto difícil quedaron sin leer y cuentan como fallas. Tabla original (datos crudos retirados; ver «RUT imposibles y nueva medición»).

| Subconjunto | Métrica | Antes | Después |
|---|---|---|---|
| Limpio | Fallas silenciosas | 6 en 2 pasadas (6,3% de los documentos) | 0 |
| Limpio | Fallas explícitas finales | 1 en 2 pasadas (504 del proxy) | 13 (9 `503 ai_timeout`, 4 `504` del proxy) |
| Limpio | Disponibilidad | 92,7% | 70,8% |
| Limpio | Calidad de campos cuando hubo datos | 100% | 100% |
| Limpio | Latencia p50 / p95 | 10,5 s / 65 s | 46 s / 97 s |
| Difícil | Fallas silenciosas | 3 (12% de los documentos) | 0 |
| Difícil | Fallas explícitas finales | 1 (504 del proxy) | 10 (3 `503 ai_timeout`, 2 `504`, 5 sin leer por el tope) |
| Difícil | Disponibilidad | 84,0% | 60,0% |
| Difícil | Calidad de campos cuando hubo datos | 97,7% | 93,7% |

**Qué significa.**
- **El arreglo cumple lo que promete.** Cero fallas silenciosas, contra 9 en las tres pasadas anteriores. Toda lectura fallida llegó como error explícito con causa: 31 intentos con `503 ai_timeout` y 17 con `504` de CloudFront. Para el agente esto es lo importante: ya no recibe un documento vacío que parece una lectura buena.
- **La disponibilidad cayó, pero no por el arreglo.** El servicio estuvo mucho más lento en esta ventana: los PDF limpios que salieron bien al primer intento tardaron una mediana de 46,7 s, contra 9,3 s en la tarde. El arreglo no cambia cuánto tarda Gemini, solo cómo se informa la falla. Con estos datos no puedo separar «Vertex lento a esa hora» de un efecto del despliegue; los registros de docs2json de 16:28 a 16:59 UTC lo dirían.
- **Los 504 de CloudFront siguen.** 17 intentos pasaron de 120 s. El PR ya lo deja como pendiente: no hay plazo por lectura dentro de docs2json.
- **La calidad no se movió.** Cuando hubo datos, el set limpio siguió en 100%. En el difícil reaparecieron los mismos errores (tres veces «AFP Cuprum» por «AFP Quillay»): es un error estable, no ruido. Se sumaron errores en un certificado AFP escaneado que antes había vuelto vacío. Los dos RUT mal leídos tienen dígito verificador inválido.
- **Lección para el agente.** Con el servicio degradado, un reintento por cada 503 duplica el costo y agotó el presupuesto antes de terminar. El agente necesita un presupuesto de reintentos por carpeta, espera creciente y, cuando se agota, escalar en vez de seguir llamando.

### Repetición con el mismo método (sesión `20261119-1613`, 19:13 UTC)

Para verificar el arreglo de docs2json, y con aprobación de Luis, se repitió la eval con el mismo método que `20261119-1210`: subconjunto limpio, 2 pasadas, 94 llamadas y la misma política de reintentos. Tabla original (datos crudos retirados; ver «RUT imposibles y nueva medición»).

| Métrica | `20261119-1210` (antes del arreglo) | `20261119-1613` (después) |
|---|---|---|
| Fallas silenciosas (200 sin tipo o sin campos) | 6 (3 sin tipo, 3 sin campos) | 0 |
| 503 `ai_timeout` / `ai_unavailable` | no existían | 0 / 0 |
| 504 del proxy | 1 (cédula de f07) | 0 |
| Disponibilidad | 92,7% | 100% |
| Calidad cuando hubo datos | 100% | 100% |
| Latencia p50 / p95 | 10,5 s / 65 s | 8,3 s / 29,7 s |
| Cédula más lenta | 120,6 s (504) | 28,2 s |
| Llamadas | 99 | 94 (sin reintentos) |

Esto confirma la lectura de la corrida `20261119-1328`: la caída de disponibilidad de esa media hora fue lentitud del servicio a esa hora, no el arreglo. Con el servicio sano y el mismo método, no hubo ninguna falla de ningún tipo. Sigue siendo una medición de un momento: una ventana lenta puede volver a producir `503 ai_timeout` o `504`, y ahora el agente los ve y los maneja.

## Fase 2: el agente

### Un flujo determinista, no un LLM que decide

**El flujo es una máquina de estados explícita:** recibida → leyendo → validando → cruzando → aplicando_politica → decidida. Si no se pudo leer nada, salta de leyendo a aplicando_politica. Cada estado hace una sola cosa y dice cuál es el siguiente; una tabla de transiciones permitidas impide saltos no declarados. El único contacto con el exterior es la herramienta de lectura, en `leyendo`; todo lo que viene después son funciones puras.

**Por qué no un LLM para el flujo.** Las decisiones de crédito tienen que ser repetibles, auditables y explicables: la misma carpeta debe dar la misma decisión con los mismos motivos, y un analista o un regulador debe poder ver qué regla se aplicó a qué dato. Un LLM que decide el siguiente paso es más flexible, pero varía entre corridas, es difícil de testear y no deja una traza que se pueda defender. Aquí el modelo de lenguaje vive donde aporta (docs2json leyendo documentos) y la decisión vive en código. La fase 3 agrega búsqueda sobre una política escrita para citar la regla, no para decidir.

**Motivos con evidencia.** Cada hallazgo dice qué pasó en lenguaje simple, qué regla de la política lo gobierna (P-01 a P-07) y la evidencia: archivo, campo, valor leído y valor de referencia. Una decisión sin evidencia no se puede revisar.

**Decidir es ordenar severidades.** Escalar le gana a pedir, pedir le gana a lista. Las observaciones nunca cambian la decisión, pero el analista las ve. Todos los motivos se conservan: si una carpeta se escala por sueldo y además falta la cédula, la persona que la revisa ve las dos cosas.

### La herramienta de lectura y sus fallas

**Política de reintentos, sacada de la corrida `20261119-1328`.** Allí docs2json respondía `503 ai_timeout` después de unos 70 s y CloudFront cortaba con 504 a los 120 s. Un reintento cuesta tiempo y dinero, así que:
- Son transitorios: 429, `503 ai_timeout` / `ai_unavailable`, 504 del proxy, errores de red y un HTTP 200 vacío (por si reaparece). Un 4xx no se reintenta: repetir no lo arregla.
- Hasta 3 intentos por archivo y 4 reintentos compartidos por carpeta. El tope por carpeta acota el costo de una carpeta problemática (archivos + 4 llamadas) y evita que un servicio degradado consuma todo el presupuesto, como pasó en esa corrida.
- Espera exponencial con jitter completo: un número al azar entre 0 y 2 s, 4 s, 8 s… (tope 20 s). El azar evita que varios clientes reintenten todos al mismo tiempo y vuelvan a saturar el servicio.
- Si se agota, el archivo queda «no leído» y la carpeta **se escala con el motivo «no se pudo leer X»**. No se decide a ciegas: tampoco se acusa «documento faltante» si hay archivos sin leer, porque no se sabe qué eran.

**El cliente HTTP no reintenta por su cuenta en el agente.** En las evals de extracción el cliente reintentaba solo; en el agente esa opción se apaga y manda la política del agente, para que haya un único lugar que decide cuánto se reintenta.

### Las validaciones

- **RUT: el dígito verificador separa un error de lectura de otra persona.** Un RUT con dígito inválido no puede existir: es una mala lectura. Si el nombre coincide, queda como observación (la corrida del subconjunto difícil mostró RUT mal leídos en escaneos con ruido). Un RUT válido distinto con el nombre del solicitante puede ser un error del emisor o una alteración: se escala. Otro RUT válido y otro nombre es un documento de otra persona: se pide el correcto.
- **Nombres:** las mismas palabras en cualquier orden, tolerando dos letras mal leídas. Dos hermanas con los mismos apellidos no pasan por la misma persona.
- **Cédula vigente** a la fecha de revisión.
- **Documentos mínimos:** cédula, las liquidaciones de los dos meses anteriores al mes de revisión y el certificado AFP. Solo cuentan los documentos del solicitante.
- **Sueldo coherente con las cotizaciones.** La cotización AFP descontada en la liquidación de un mes debe coincidir con la pagada ese mes según el certificado. **Tolerancia: 2% o $ 1.000, lo que sea mayor.** Absorbe redondeos y pequeños ajustes del empleador; los casos de liquidación inflada del dataset difieren en más de 35%. Se comparan cotizaciones y no sueldos porque el certificado trae el monto pagado, y así no hace falta conocer la comisión de cada AFP. Si no se puede comparar (falta el mes o no se leyó la cotización), queda como observación «ingresos sin verificar».
- **Confianza baja (bajo 0,8):** se escala. Aviso honesto: la corrida difícil mostró que docs2json reporta 0,99 incluso cuando lee mal; por eso pesan más los cruces que la confianza.
- **AFP distinta entre liquidación y certificado:** observación, no escalamiento. En los escaneos difíciles el modelo leyó «AFP Cuprum» donde decía «AFP Quillay»: escalar por eso habría mandado a una persona carpetas sanas. El analista lo ve igual.

### La política como interfaz

Las reglas provisionales viven en `src/agent/policy.ts`: cada una con un identificador, un título, un texto, una severidad y los hallazgos que gobierna, más los umbrales (confianza mínima y tolerancia de sueldo). El agente solo depende de la interfaz `Policy`. En la fase 3, otra implementación puede sacar esos textos y umbrales de una política escrita, buscándolos con RAG, y citar el párrafo exacto, sin tocar la máquina de estados.

### Replay y eval de punta a punta

**Replay.** El agente puede correr sobre las respuestas de docs2json grabadas en las evals anteriores, sin llamar a la API. El intento n de un archivo usa la n-ésima respuesta grabada, así un reintento ve lo que de verdad devolvió una segunda lectura. Es gratis, repetible y es lo que usan los tests.

**La eval separa tres cosas.** (1) Decisión correcta contra `expected.json`. (2) Escalamientos causados solo por fallas de lectura, que dicen algo de la herramienta y no de la lógica. (3) Errores de decisión. Además mide los defectos plantados encontrados, los defectos reportados que no estaban plantados y los falsos positivos (carpetas sanas que no quedaron listas), por subconjunto.

**Con lecturas perfectas, el agente acierta las 18 carpetas.** Un test alimenta al agente con la verdad esperada en vez de docs2json: así se prueba la lógica por separado de la lectura.

### Resultados de la fase 2

| Métrica | Replay sobre evals anteriores · limpio | Replay · difícil | En vivo · limpio | En vivo · difícil |
|---|---|---|---|---|
| Decisión correcta | 12 de 12 | 4 de 6 | 12 de 12 | 5 de 6 |
| Escaladas solo por falla de lectura | 0 | 2 | 0 | 1 |
| Errores de decisión (lógica o política) | 0 | 0 | 0 | 0 |
| Defectos plantados encontrados | 8 de 8 | 3 de 4 | 8 de 8 | 4 de 4 |
| Defectos reportados que no estaban plantados | 0 | 0 | 0 | 0 |
| Falsos positivos (carpetas sanas no listas) | 0 de 5 | 0 de 2 | 0 de 5 | 0 de 2 |

- **En vivo** (corrida `20261119-1511`, 18:11 a 18:21 UTC; datos crudos retirados; ver «RUT imposibles y nueva medición»): 79 llamadas, 71 lecturas útiles y 8 fallas transitorias (7 `503 ai_timeout` y un `504`). Las 8 se recuperaron con un solo reintento; ninguna carpeta se quedó sin leer. Cero respuestas 200 vacías. Mediana de latencia: 11,6 s.
- **Lo que decide mal: d05**, «cédula vencida, liquidaciones en un solo escaneo». Esperada: pedir la cédula. El agente escaló porque docs2json devolvió la liquidación escaneada **con campos pero con confianza 0** (una extracción a medias), y la regla P-06 no decide sobre datos con confianza baja. Igual reportó la cédula vencida y marcó el RUT mal leído como error de lectura. Ignorando la lectura, la decisión habría sido la correcta.
- **En replay sobre las evals anteriores**, d05 cae por lo mismo y d06 se escala porque una foto volvió vacía en la única grabación útil de ese archivo. Ese replay es más duro que la realidad: repite la última respuesta grabada cuando no hay más.
- **Reproducible.** El replay de la corrida en vivo da exactamente las mismas decisiones, defectos y llamadas. Hoy se comprueba con la corrida en vivo de la nueva medición: `npm run agent -- eval --replay 20261119-171147-vivo-rag-hibrido`.
- **Las observaciones hicieron su trabajo.** En d01 el agente vio «AFP Cuprum» contra «AFP Quillay» y lo dejó como observación para el analista en vez de escalar una carpeta sana.

## Fase 3: la política escrita, con búsqueda (RAG sin LLM generativo)

Luis aprobó la fase 3 con búsqueda local y sin LLM. El agente ya no lleva las reglas escritas en código: las busca en una política escrita y cita el párrafo que aplica.

### La política es un documento, no código

**`politica/politica-evaluacion.md`**: una política de evaluación sintética, marcada como tal, con 9 secciones y 19 reglas numeradas (3.1, 4.3, 6.1…). Cada regla tiene una línea legible con su decisión («**Decisión:** pedir el documento.») y, si tiene umbrales, una línea de parámetros («**Parámetros:** tolerancia_relativa = 0,02; tolerancia_absoluta = 1000»). El agente lee esas líneas: **cambiar el documento cambia al agente**, sin tocar código. La política es la única fuente de verdad, como en una institución real, y quien la escribe no necesita programar.

**Incluye reglas que el agente no usa**, como trabajadores independientes, renta mínima, lagunas previsionales o morosidades. Así la búsqueda tiene que elegir entre candidatos parecidos, igual que en una política real, en vez de encontrar siempre lo único que hay.

**Un fragmento por regla.** La regla es la unidad natural de cita («Regla 4.3») y cada una cabe completa en un fragmento. Las secciones de texto libre que no tienen reglas (objetivo, definiciones, cómo se combinan las decisiones, plazos) son fragmentos propios, que se pueden buscar pero no deciden.

### Tres formas de buscar

- **BM25 (léxica):** pondera las palabras compartidas según lo raras que son en la política. Es exacta con los términos técnicos («dígito verificador», «cotización») y se puede explicar sin matemáticas.
- **Embeddings (semántica):** compara significados aunque cambien las palabras («carnet» con «cédula»). Usa el modelo local `Xenova/multilingual-e5-small` en 8 bits: unos 135 MB, multilingüe y derivado de un modelo con licencia MIT. Se descarga una vez en `.cache/modelos` y no envía nada afuera.
- **Híbrida (RRF):** suma 1 / (60 + posición) de cada ranking. No necesita calibrar puntajes entre métodos distintos, solo posiciones, y premia lo que ambos ponen arriba. Un empate exacto, como primero en uno y segundo en el otro, lo desempata el ranking semántico.

**El agente no necesita el modelo al decidir.** Sus consultas son un conjunto cerrado: una por tipo de hallazgo (`src/rag/queries.ts`). Sus vectores se calculan al indexar (`npm run rag:index`) y se guardan en `politica/indice.json`, junto con los de la política. Al decidir, el agente solo compara vectores ya calculados: es rápido, determinista y funciona en el CI, que nunca descarga el modelo. El índice guarda el SHA-256 de la política, de las preguntas de prueba y de las consultas del agente, y un test falla si alguno cambió sin reindexar.

### Cómo se midió la búsqueda

Dos conjuntos de consultas, con propósitos distintos:
- **Las 15 consultas del agente**, que son las que realmente usa. Se mide si la primera regla que encuentra es la que citaría una persona.
- **34 preguntas de analista**, escritas con palabras distintas a las de la política («el carnet caducó», «trabaja a honorarios», «la liquidación está inflada»). Nunca se ajustaron: miden la búsqueda en sí.

Métricas: **recall@k** (la consulta tiene el fragmento correcto entre los k primeros) y **MRR** (promedio de 1 / posición del primer fragmento correcto: encontrarlo segundo vale la mitad).

| Método | Agente: regla correcta | Preguntas: recall@1 | Preguntas: recall@3 | Preguntas: MRR |
|---|---|---|---|---|
| BM25 | 14 de 15 | 67,6% | 88,2% | 0,790 |
| Embeddings | 15 de 15 | 67,6% | 91,2% | 0,790 |
| Híbrida | 15 de 15 | 70,6% | 94,1% | 0,824 |

Reporte completo en [politica/reporte-busqueda.md](../politica/reporte-busqueda.md).

**Reglas gemelas: el problema que apareció.** En la primera medición, 2 de las 15 consultas del agente caían en una regla «gemela». «RUT ilegible con el nombre correcto» (4.4, observación) caía en «RUT ilegible con otro nombre» (6.4, escalar): la diferencia es una negación, y ni la búsqueda léxica ni la semántica distinguen bien una negación. «Liquidación de otro mes» (3.2) caía en «Documentos mínimos» (3.1). Reescribí solo esas dos consultas del agente para que describan el caso con más precisión, sin tocar la política ni las preguntas de analista, y agregué un test que exige 15 de 15 en el CI. Lo declaro: esas dos consultas se ajustaron mirando el resultado. Por eso las preguntas de analista, que no se tocaron, son la medida honesta de la búsqueda.

**Por qué la híbrida.** Con BM25 sola, «documento de otra persona» cae en la regla 6.4 («RUT ilegible con otro nombre», escalar). En la eval de punta a punta eso convierte un «pedir el certificado correcto» en «escalar a una persona» en la carpeta f09: un error de búsqueda se convierte en un error de decisión. La híbrida acierta las 15 consultas del agente y es la mejor con las preguntas de analista.

**Las preguntas abiertas no deciden.** Con preguntas libres, la primera regla es la correcta solo en un 60% de los casos aproximadamente. Por eso el agente decide con sus propias consultas, precisas y probadas, y no con texto libre. Las preguntas libres sirven para que un analista consulte la política, no para decidir.

### Resultado de punta a punta

Con la política escrita y la búsqueda híbrida, el agente toma **exactamente las mismas decisiones** que con las reglas en código de la fase 2, en las 18 carpetas y en los dos replays: el de las evals anteriores (limpio 12 de 12, difícil 4 de 6) y el de la corrida en vivo (limpio 12 de 12, difícil 5 de 6). La diferencia está en que ahora cada motivo cita la regla y su texto («Regla 4.2, Documentos de otra persona: Todos los documentos deben pertenecer al solicitante…»). Con lecturas perfectas acierta las 18 carpetas. Esta fase no hizo llamadas a docs2json: todo corre sobre respuestas grabadas.

## Fase 4: mostrarlo

- **El README es la página de presentación.** Responde en orden qué hace, qué se midió, qué encontraron las evals, cómo está hecho y cómo probarlo, y siempre lleva el aviso de que todo es sintético. Las cifras enlazan a sus reportes: ninguna cifra sin fuente.
- **El diagrama es un SVG escrito a mano y renderizado a PNG** con la misma librería del dataset. Se ve igual en GitHub, en LinkedIn y en el video, y se puede editar como texto.
- **La demo corre sobre respuestas grabadas** de la corrida en vivo: no cuesta, no depende de que docs2json esté rápido ese día y muestra siempre lo mismo. Así el video se puede grabar las veces que haga falta.
- **El video se genera, no se graba.** `npm run demo:video` toma el texto real de la demo en replay, dibuja cada cuadro del terminal como SVG con la fuente Menlo, lo renderiza con resvg y arma `docs/demo.mp4` y `docs/demo.gif` con ffmpeg (instalado en el equipo, no es dependencia del proyecto). Así el video muestra exactamente lo que hace el agente y se regenera cuando cambian las cifras. `docs/guion-video.md` queda como apoyo para una versión narrada.
- **Las cifras tienen una sola fuente.** [docs/cifras-finales.md](cifras-finales.md) reúne cada cifra con la corrida de la que sale; el README y cualquier material derivado se toman de ahí. El material personal derivado del proyecto vive fuera de este repositorio.

## RUT imposibles y nueva medición (19-11-2026, noche)

**Por qué.** Antes de abrir el repositorio, la revisión mostró que los 21 RUT de personas del dataset estaban entre 12,6 y 25,6 millones, y los 18 de empresas entre 76 y 77 millones: rangos donde casi todos los números pertenecen a personas o empresas reales. Los nombres eran inventados, pero en un repositorio público un RUT real habría quedado junto a un sueldo ficticio o a «posible alteración». Luis aprobó cambiarlos.

**Qué se hizo.** A cada RUT se le sumaron 100.000.000 y se recalculó el dígito verificador: quedan cuerpos de 9 dígitos, que ningún RUT real tiene, con dígito verificador válido. Así se conservan las relaciones del dataset (la transposición de dígitos de f08 y d04 sigue siendo una transposición). Lo mismo en los tests, salvo el ejemplo de manual 12.345.678-5, que verifica el algoritmo. Las respuestas grabadas de las corridas anteriores traían los RUT antiguos, así que sus datos crudos se retiraron del repositorio: sus cifras quedan arriba como historia y los archivos solo existen en el historial privado. Después se volvió a medir todo.

**La nueva medición** (202 llamadas):

| Corrida | Resultado |
|---|---|
| Set limpio, 2 pasadas (`evals/runs/20261119-1651`, 100 llamadas) | Calidad 100% en clasificación y campos. Disponibilidad 91,7%: el servicio estaba lento (p50 15,6 s, p95 67 s), hubo 13 intentos fallidos (11 `503 ai_timeout`, 1 `504` y 1 error de red) y el tope de llamadas cortó el final de la segunda pasada. Cero fallas silenciosas. |
| Set difícil, 1 pasada (`evals/runs/20261119-1706`, 29 llamadas) | Calidad de campos 96,8%, disponibilidad 92%, cero fallas silenciosas. Otra vez «AFP Cuprum» por «AFP Quillay»: es un error estable del modelo, no azar. |
| Agente en vivo (`evals/agente/20261119-171147-vivo-rag-hibrido`, 73 llamadas) | 16 de 18 decisiones correctas (11 de 12 limpias, 5 de 6 difíciles), **0 errores de decisión**, 12 de 12 defectos encontrados. Las dos erradas se escalaron por lecturas con confianza 0. |

**El hallazgo: un dato imposible cambia al sistema bajo prueba.** Con los RUT de 9 dígitos, docs2json devolvió **confianza 0 en los dos documentos de cada PDF con dos liquidaciones**. f03 pasó de confianza [0,99; 0,99] en todas las corridas anteriores, incluida la `20261119-1613`, posterior al arreglo, a [0; 0] en las tres lecturas nuevas. d05 pasó de [0,99; 0] a [0; 0]. Los PDF con una sola liquidación no cambiaron. Además, en 4 escaneos con ruido el modelo «corrigió» el RUT a 8 dígitos, como si supiera que un RUT real no tiene 9. La hipótesis, que no verifiqué en el código de docs2json, es que el motor valida el formato del RUT al separar documentos. El agente se comportó como debía: escaló las lecturas con confianza 0 (regla 6.3) y trató los 6 RUT mal leídos como errores de lectura, porque los 6 tienen dígito verificador inválido. El costo es medible: f03, una carpeta sana, ahora se escala. Es un falso positivo por lectura, no por lógica.

**Lección.** Los datos sintéticos tienen que ser imposibles de confundir con datos reales y, a la vez, verosímiles para el sistema que se prueba. Aquí ambas cosas chocan: la privacidad le ganó al realismo, y el costo queda declarado. Una alternativa es buscar un rango de 8 dígitos sin asignar, pero no encontré un rango oficial de prueba que pudiera verificar.

## Límites que declaro

- Es precisión sobre un dataset sintético de 48 documentos hechos con cuatro plantillas propias, no precisión en producción.
- **Techo del set limpio.** Con calidad de 100%, el set limpio solo detecta regresiones. Para medir mejoras está el subconjunto difícil, que hoy tiene 25 documentos: una sola pasada, cifras todavía gruesas.
- Con 48 documentos por pasada, un documento son unos 2 puntos de clasificación: diferencias pequeñas no son significativas.
- La disponibilidad se midió en una ventana de 11 minutos de una tarde; otra hora puede dar otra cifra.
- La política escrita es sintética y corta (23 fragmentos); con una política real y larga, la búsqueda tendrá más con qué confundirse.
- La decisión esperada de cada carpeta es del mismo autor de la política: mide coherencia interna, no acuerdo con analistas reales.
