# Eval de punta a punta del agente · 20261119-171932-replay-rag-hibrido

> **Dataset sintético.** Decisiones del agente sobre carpetas inventadas, comparadas con la decisión esperada de cada `expected.json`. La decisión esperada es provisional y la política también: no es desempeño en producción.

- Modo: replay de respuestas grabadas (20261119-171147-vivo-rag-hibrido), sin llamadas
- Política: `politica-evaluacion · búsqueda hibrido` versión 2026-11-19
- Llamadas a la herramienta de lectura: 73 (reintentos: 2)

## Resumen por subconjunto

| Métrica | Limpio | Difícil |
|---|---|---|
| Decisión correcta | 11 de 12 (91,7%) | 5 de 6 (83,3%) |
| Escaladas solo por falla de lectura | 1 | 1 |
| Errores de decisión (lógica o política) | 0 | 0 |
| Decisión correcta sin contar las escaladas por lectura | 100,0% | 100,0% |
| Decisión correcta si todo se hubiera leído | 12 de 12 | 6 de 6 |
| Defectos plantados encontrados | 8 de 8 | 4 de 4 |
| Defectos reportados que no estaban plantados | 0 | 0 |
| Falsos positivos: carpetas sanas no marcadas como listas | 1 de 5 (lectura: 1, lógica: 0) | 0 de 2 (lectura: 0, lógica: 0) |
| Llamadas / reintentos | 47 / 0 | 26 / 2 |

Cómo leerlo: una carpeta «escalada solo por falla de lectura» terminó en una persona porque un archivo no se pudo leer o se leyó mal, no porque la lógica se equivocara. «Si todo se hubiera leído» aplica la misma política ignorando esos hallazgos de lectura.

## Carpeta por carpeta

| Carpeta | Esperada | Decisión | ¿Correcta? | Defectos plantados | Encontrados | Motivo principal | Llamadas |
|---|---|---|---|---|---|---|---|
| f01 | lista | lista | sí | — | — | Sin motivos: carpeta completa y coherente. | 4 |
| f02 | lista | lista | sí | — | — | Sin motivos: carpeta completa y coherente. | 5 |
| f03 | lista | escalar | no (lectura) | — | — | La lectura de la liquidación (liquidaciones-2026-09-y-2026-10.pdf) vino con confianza 0, bajo el mínimo de 0,8: el dato no es confiable. | 3 |
| f04 | lista | lista | sí | — | — | Sin motivos: carpeta completa y coherente. | 5 |
| f05 | pedir | pedir | sí | documento_faltante:cotizaciones-afp | documento_faltante:cotizaciones-afp | Falta certificado de cotizaciones AFP de los últimos 12 meses. | 3 |
| f06 | pedir | pedir | sí | documento_faltante:liquidaciones-sueldo | documento_faltante:liquidaciones-sueldo | Falta liquidación de octubre de 2026. | 3 |
| f07 | pedir | pedir | sí | documento_vencido:cedula-identidad | documento_vencido:cedula-identidad | La cédula venció el 2026-08-14, antes de la fecha de revisión (2026-11-16). | 4 |
| f08 | escalar | escalar | sí | rut_distinto:liquidaciones-sueldo | rut_distinto:liquidaciones-sueldo | La liquidación (liquidacion-2026-10.pdf) tiene el nombre del solicitante pero el RUT 115.983.704-8, distinto de 115.938.704-2 y con dígito verificador válido: posible error del emisor o alteración. | 4 |
| f09 | pedir | pedir | sí | rut_distinto:cotizaciones-afp | rut_distinto:cotizaciones-afp | El certificado AFP (certificado-afp.pdf) es de otra persona: Javiera Antonia Vargas Espinoza, RUT 119.871.205-8. Se pide el documento del solicitante. | 4 |
| f10 | escalar | escalar | sí | sueldo_no_cuadra:liquidaciones-sueldo | sueldo_no_cuadra:liquidaciones-sueldo | La liquidación (liquidacion-2026-09.pdf) descuenta $ 298.828 de cotización AFP en septiembre de 2026, pero el certificado registra $ 141.748 pagados ese mes (tolerancia $ 2.835). | 5 |
| f11 | escalar | escalar | sí | documento_faltante:cedula-identidad, sueldo_no_cuadra:liquidaciones-sueldo | documento_faltante:cedula-identidad, sueldo_no_cuadra:liquidaciones-sueldo | La liquidación (liquidacion-2026-09.pdf) descuenta $ 206.904 de cotización AFP en septiembre de 2026, pero el certificado registra $ 149.854 pagados ese mes (tolerancia $ 2.997). | 3 |
| f12 | lista | lista | sí | — | — | Sin motivos: carpeta completa y coherente. | 4 |
| d01 | lista | lista | sí | — | — | Sin motivos: carpeta completa y coherente. | 5 |
| d02 | lista | lista | sí | — | — | Sin motivos: carpeta completa y coherente. | 4 |
| d03 | escalar | escalar | sí | sueldo_no_cuadra:liquidaciones-sueldo | sueldo_no_cuadra:liquidaciones-sueldo | La liquidación (liquidacion-2026-09-comprimida.jpg) descuenta $ 254.781 de cotización AFP en septiembre de 2026, pero el certificado registra $ 156.433 pagados ese mes (tolerancia $ 3.129). | 4 |
| d04 | escalar | escalar | sí | rut_distinto:liquidaciones-sueldo | rut_distinto:liquidaciones-sueldo | La liquidación (liquidacion-2026-10-escaneo-girado.pdf) tiene el nombre del solicitante pero el RUT 114.978.326-8, distinto de 114.987.326-7 y con dígito verificador válido: posible error del emisor o alteración. | 5 |
| d05 | pedir | escalar | no (lectura) | documento_vencido:cedula-identidad | documento_vencido:cedula-identidad | La lectura de la liquidación (liquidaciones-2026-09-y-2026-10-escaneo.pdf) vino con confianza 0, bajo el mínimo de 0,8: el dato no es confiable. | 4 |
| d06 | pedir | pedir | sí | documento_faltante:cotizaciones-afp | documento_faltante:cotizaciones-afp | Falta certificado de cotizaciones AFP de los últimos 12 meses. | 4 |

## Detalle de cada decisión

### f01 · Carpeta completa, Fonasa, dos meses sin cotización

**lista_para_analista** (esperada: lista_para_analista)

- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### f02 · Carpeta completa, isapre, con certificado de antigüedad

**lista_para_analista** (esperada: lista_para_analista)

- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### f03 · Carpeta completa, ambas liquidaciones en un solo PDF

**escalar_a_persona** (esperada: lista_para_analista)

- [Regla 6.3 · escalar] La lectura de la liquidación (liquidaciones-2026-09-y-2026-10.pdf) vino con confianza 0, bajo el mínimo de 0,8: el dato no es confiable. _Evidencia: liquidaciones-2026-09-y-2026-10.pdf · confidence = 0_
  > Regla 6.3, «Lectura con baja confianza»: Si el servicio de lectura informa una confianza menor a 0,8 para un documento, sus datos no se consideran confiables para decidir. Una persona revisa el documento.
- [Regla 6.3 · escalar] La lectura de la liquidación (liquidaciones-2026-09-y-2026-10.pdf) vino con confianza 0, bajo el mínimo de 0,8: el dato no es confiable. _Evidencia: liquidaciones-2026-09-y-2026-10.pdf · confidence = 0_
  > Regla 6.3, «Lectura con baja confianza»: Si el servicio de lectura informa una confianza menor a 0,8 para un documento, sus datos no se consideran confiables para decidir. Una persona revisa el documento.
- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### f04 · Cambio de empleador en el año, un mes sin cotizar entre trabajos

**lista_para_analista** (esperada: lista_para_analista)

- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### f05 · Falta el certificado de cotizaciones AFP

**pedir_documento** (esperada: pedir_documento)

- [Regla 3.1 · pedir] Falta certificado de cotizaciones AFP de los últimos 12 meses. _Evidencia: (carpeta)_
  > Regla 3.1, «Documentos mínimos de un trabajador dependiente»: La carpeta debe contener la cédula de identidad del solicitante, sus liquidaciones de sueldo de los dos meses calendario anteriores al mes de la fecha de revisión y su certificado de cotizaciones previsionales de los últimos doce meses, emitido por la AFP o…
- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### f06 · Falta la liquidación de octubre

**pedir_documento** (esperada: pedir_documento)

- [Regla 3.1 · pedir] Falta liquidación de octubre de 2026. _Evidencia: (carpeta) · periodo_
  > Regla 3.1, «Documentos mínimos de un trabajador dependiente»: La carpeta debe contener la cédula de identidad del solicitante, sus liquidaciones de sueldo de los dos meses calendario anteriores al mes de la fecha de revisión y su certificado de cotizaciones previsionales de los últimos doce meses, emitido por la AFP o…
- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### f07 · Cédula vencida, residente extranjera

**pedir_documento** (esperada: pedir_documento)

- [Regla 4.1 · pedir] La cédula venció el 2026-08-14, antes de la fecha de revisión (2026-11-16). _Evidencia: cedula.png · fecha_vencimiento = "2026-08-14"_
  > Regla 4.1, «Cédula de identidad vigente»: La cédula de identidad debe estar vigente en la fecha de revisión, es decir, su fecha de vencimiento debe ser posterior a esa fecha. Una cédula vencida no permite acreditar la identidad, aunque los datos coincidan con el resto de la carpeta. Se le pide al…
- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### f08 · RUT distinto en la liquidación de octubre

**escalar_a_persona** (esperada: escalar_a_persona)

- [Regla 4.3 · escalar] La liquidación (liquidacion-2026-10.pdf) tiene el nombre del solicitante pero el RUT 115.983.704-8, distinto de 115.938.704-2 y con dígito verificador válido: posible error del emisor o alteración. _Evidencia: liquidacion-2026-10.pdf · rut = "115.983.704-8"_
  > Regla 4.3, «Mismo nombre con otro RUT»: Si un documento tiene el nombre del solicitante pero un RUT distinto al de su cédula, y ese RUT tiene un dígito verificador válido, puede tratarse de un error del emisor o de una adulteración del documento. No se resuelve automáticamente: una persona revisa la…
- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### f09 · Certificado AFP de otra persona

**pedir_documento** (esperada: pedir_documento)

- [Regla 4.2 · pedir] El certificado AFP (certificado-afp.pdf) es de otra persona: Javiera Antonia Vargas Espinoza, RUT 119.871.205-8. Se pide el documento del solicitante. _Evidencia: certificado-afp.pdf · rut = "119.871.205-8"; certificado-afp.pdf · nombre = "Javiera Antonia Vargas Espinoza"_
  > Regla 4.2, «Documentos de otra persona»: Todos los documentos deben pertenecer al solicitante. Si un documento muestra otro nombre y otro RUT válido, corresponde a otra persona, aunque compartan apellidos, como ocurre con familiares. Ese documento no se considera y se pide el documento equivalente…
- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### f10 · Sueldo de las liquidaciones no cuadra con las cotizaciones

**escalar_a_persona** (esperada: escalar_a_persona)

- [Regla 5.1 · escalar] La liquidación (liquidacion-2026-09.pdf) descuenta $ 298.828 de cotización AFP en septiembre de 2026, pero el certificado registra $ 141.748 pagados ese mes (tolerancia $ 2.835). _Evidencia: liquidacion-2026-09.pdf · descuento_afp = 298828; certificado-afp.pdf · cotizaciones[2026-09] = 141748_
  > Regla 5.1, «Liquidaciones respaldadas por las cotizaciones»: Los ingresos declarados en las liquidaciones deben estar respaldados por las cotizaciones pagadas. Para cada mes exigido, la cotización AFP descontada en la liquidación debe coincidir con la cotización que el certificado registra como pagada ese mismo mes. Se…
- [Regla 5.1 · escalar] La liquidación (liquidacion-2026-10.pdf) descuenta $ 298.828 de cotización AFP en octubre de 2026, pero el certificado registra $ 141.748 pagados ese mes (tolerancia $ 2.835). _Evidencia: liquidacion-2026-10.pdf · descuento_afp = 298828; certificado-afp.pdf · cotizaciones[2026-10] = 141748_
  > Regla 5.1, «Liquidaciones respaldadas por las cotizaciones»: Los ingresos declarados en las liquidaciones deben estar respaldados por las cotizaciones pagadas. Para cada mes exigido, la cotización AFP descontada en la liquidación debe coincidir con la cotización que el certificado registra como pagada ese mismo mes. Se…
- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### f11 · Sueldo no cuadra y además falta la cédula

**escalar_a_persona** (esperada: escalar_a_persona)

- [Regla 5.1 · escalar] La liquidación (liquidacion-2026-09.pdf) descuenta $ 206.904 de cotización AFP en septiembre de 2026, pero el certificado registra $ 149.854 pagados ese mes (tolerancia $ 2.997). _Evidencia: liquidacion-2026-09.pdf · descuento_afp = 206904; certificado-afp.pdf · cotizaciones[2026-09] = 149854_
  > Regla 5.1, «Liquidaciones respaldadas por las cotizaciones»: Los ingresos declarados en las liquidaciones deben estar respaldados por las cotizaciones pagadas. Para cada mes exigido, la cotización AFP descontada en la liquidación debe coincidir con la cotización que el certificado registra como pagada ese mismo mes. Se…
- [Regla 5.1 · escalar] La liquidación (liquidacion-2026-10.pdf) descuenta $ 206.904 de cotización AFP en octubre de 2026, pero el certificado registra $ 149.854 pagados ese mes (tolerancia $ 2.997). _Evidencia: liquidacion-2026-10.pdf · descuento_afp = 206904; certificado-afp.pdf · cotizaciones[2026-10] = 149854_
  > Regla 5.1, «Liquidaciones respaldadas por las cotizaciones»: Los ingresos declarados en las liquidaciones deben estar respaldados por las cotizaciones pagadas. Para cada mes exigido, la cotización AFP descontada en la liquidación debe coincidir con la cotización que el certificado registra como pagada ese mismo mes. Se…
- [Regla 3.1 · pedir] Falta cédula de identidad. _Evidencia: (carpeta)_
  > Regla 3.1, «Documentos mínimos de un trabajador dependiente»: La carpeta debe contener la cédula de identidad del solicitante, sus liquidaciones de sueldo de los dos meses calendario anteriores al mes de la fecha de revisión y su certificado de cotizaciones previsionales de los últimos doce meses, emitido por la AFP o…
- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### f12 · Carpeta completa, liquidación de septiembre fotografiada

**lista_para_analista** (esperada: lista_para_analista)

- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### d01 · Carpeta completa, todo fotografiado o escaneado

**lista_para_analista** (esperada: lista_para_analista)

- [Regla 4.4 · observación] La liquidación (liquidacion-2026-10-escaneo.pdf) trae el RUT 11.721.524-6, con dígito verificador inválido: es un error de lectura. El nombre y el resto de la carpeta confirman al solicitante.
- [Regla 5.3 · observación] La liquidación (liquidacion-2026-10-escaneo.pdf) dice AFP Cuprum, pero el certificado es de AFP QUILLAY. Puede ser un error de lectura o un cambio de AFP.
- Lectura de liquidacion-2026-10-escaneo.pdf: 503 ai_timeout → ok
- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### d02 · Carpeta completa, liquidaciones de otro formato y páginas giradas

**lista_para_analista** (esperada: lista_para_analista)

- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### d03 · Sueldo no cuadra, con imágenes muy comprimidas

**escalar_a_persona** (esperada: escalar_a_persona)

- [Regla 5.1 · escalar] La liquidación (liquidacion-2026-09-comprimida.jpg) descuenta $ 254.781 de cotización AFP en septiembre de 2026, pero el certificado registra $ 156.433 pagados ese mes (tolerancia $ 3.129). _Evidencia: liquidacion-2026-09-comprimida.jpg · descuento_afp = 254781; certificado-afp-escaneo.pdf · cotizaciones[2026-09] = 156433_
  > Regla 5.1, «Liquidaciones respaldadas por las cotizaciones»: Los ingresos declarados en las liquidaciones deben estar respaldados por las cotizaciones pagadas. Para cada mes exigido, la cotización AFP descontada en la liquidación debe coincidir con la cotización que el certificado registra como pagada ese mismo mes. Se…
- [Regla 5.1 · escalar] La liquidación (liquidacion-2026-10-comprimida.jpg) descuenta $ 254.781 de cotización AFP en octubre de 2026, pero el certificado registra $ 156.433 pagados ese mes (tolerancia $ 3.129). _Evidencia: liquidacion-2026-10-comprimida.jpg · descuento_afp = 254781; certificado-afp-escaneo.pdf · cotizaciones[2026-10] = 156433_
  > Regla 5.1, «Liquidaciones respaldadas por las cotizaciones»: Los ingresos declarados en las liquidaciones deben estar respaldados por las cotizaciones pagadas. Para cada mes exigido, la cotización AFP descontada en la liquidación debe coincidir con la cotización que el certificado registra como pagada ese mismo mes. Se…
- [Regla 4.4 · observación] El certificado AFP (certificado-afp-escaneo.pdf) trae el RUT 12.872.691-5, con dígito verificador inválido: es un error de lectura. El nombre y el resto de la carpeta confirman al solicitante.
- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### d04 · RUT distinto en una liquidación escaneada de lado

**escalar_a_persona** (esperada: escalar_a_persona)

- [Regla 4.3 · escalar] La liquidación (liquidacion-2026-10-escaneo-girado.pdf) tiene el nombre del solicitante pero el RUT 114.978.326-8, distinto de 114.987.326-7 y con dígito verificador válido: posible error del emisor o alteración. _Evidencia: liquidacion-2026-10-escaneo-girado.pdf · rut = "114.978.326-8"_
  > Regla 4.3, «Mismo nombre con otro RUT»: Si un documento tiene el nombre del solicitante pero un RUT distinto al de su cédula, y ese RUT tiene un dígito verificador válido, puede tratarse de un error del emisor o de una adulteración del documento. No se resuelve automáticamente: una persona revisa la…
- [Regla 5.3 · observación] La liquidación (liquidacion-2026-09-escaneo.pdf) dice AFP Cuprum, pero el certificado es de AFP QUILLAY. Puede ser un error de lectura o un cambio de AFP.
- Lectura de liquidacion-2026-10-escaneo-girado.pdf: error de red → ok
- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### d05 · Cédula vencida fotografiada, liquidaciones en un solo escaneo

**escalar_a_persona** (esperada: pedir_documento)

- [Regla 6.3 · escalar] La lectura de la liquidación (liquidaciones-2026-09-y-2026-10-escaneo.pdf) vino con confianza 0, bajo el mínimo de 0,8: el dato no es confiable. _Evidencia: liquidaciones-2026-09-y-2026-10-escaneo.pdf · confidence = 0_
  > Regla 6.3, «Lectura con baja confianza»: Si el servicio de lectura informa una confianza menor a 0,8 para un documento, sus datos no se consideran confiables para decidir. Una persona revisa el documento.
- [Regla 6.3 · escalar] La lectura de la liquidación (liquidaciones-2026-09-y-2026-10-escaneo.pdf) vino con confianza 0, bajo el mínimo de 0,8: el dato no es confiable. _Evidencia: liquidaciones-2026-09-y-2026-10-escaneo.pdf · confidence = 0_
  > Regla 6.3, «Lectura con baja confianza»: Si el servicio de lectura informa una confianza menor a 0,8 para un documento, sus datos no se consideran confiables para decidir. Una persona revisa el documento.
- [Regla 4.1 · pedir] La cédula venció el 2026-05-19, antes de la fecha de revisión (2026-11-16). _Evidencia: cedula-foto.jpg · fecha_vencimiento = "2026-05-19"_
  > Regla 4.1, «Cédula de identidad vigente»: La cédula de identidad debe estar vigente en la fecha de revisión, es decir, su fecha de vencimiento debe ser posterior a esa fecha. Una cédula vencida no permite acreditar la identidad, aunque los datos coincidan con el resto de la carpeta. Se le pide al…
- [Regla 4.4 · observación] La liquidación (liquidaciones-2026-09-y-2026-10-escaneo.pdf) trae el RUT 12.674.590-3, con dígito verificador inválido: es un error de lectura. El nombre y el resto de la carpeta confirman al solicitante.
- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

### d06 · Falta el certificado AFP, liquidaciones fotografiadas

**pedir_documento** (esperada: pedir_documento)

- [Regla 3.1 · pedir] Falta certificado de cotizaciones AFP de los últimos 12 meses. _Evidencia: (carpeta)_
  > Regla 3.1, «Documentos mínimos de un trabajador dependiente»: La carpeta debe contener la cédula de identidad del solicitante, sus liquidaciones de sueldo de los dos meses calendario anteriores al mes de la fecha de revisión y su certificado de cotizaciones previsionales de los últimos doce meses, emitido por la AFP o…
- Traza: recibida → leyendo → validando → cruzando → aplicando_politica → decidida

## Límites

- Política usada: `politica-evaluacion · búsqueda hibrido` (versión 2026-11-19). La política escrita y la decisión esperada de cada carpeta son sintéticas.
- 18 carpetas: un error de decisión son 5 a 8 puntos de exactitud. Sirve para ver qué casos fallan, no para una cifra fina.
- En modo replay, el reintento n usa la n-ésima respuesta grabada de ese archivo; si no hay más, repite la última.
