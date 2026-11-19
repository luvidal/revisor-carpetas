# Dataset sintético

> **MUESTRA SINTÉTICA.** Todas las personas, empresas, AFP, isapres, RUT y montos son inventados.
> Ningún archivo proviene de documentos reales. Este archivo lo genera `npm run dataset`; no lo edites a mano.

Fecha de revisión de todas las carpetas: **2026-11-16**.

Carpeta mínima según la política provisional: Cédula vigente, las dos últimas liquidaciones (septiembre y octubre de 2026) y el certificado de cotizaciones AFP de los últimos 12 meses.

## Subconjunto limpio

Documentos limpios: PDF con texto y una cédula en PNG. Sirve para detectar regresiones.

12 carpetas, 47 archivos y 48 documentos (`cedula-identidad`: 11 · `liquidaciones-sueldo`: 23 · `cotizaciones-afp`: 11 · `certificado-antiguedad`: 3).

| Carpeta | Caso | Defecto plantado | Decisión esperada (provisional) | Archivos |
|---|---|---|---|---|
| f01 | Carpeta completa, Fonasa, dos meses sin cotización | ninguno | `lista_para_analista` | `cedula.png`<br>`liquidacion-2026-09.pdf`<br>`liquidacion-2026-10.pdf`<br>`certificado-afp.pdf` |
| f02 | Carpeta completa, isapre, con certificado de antigüedad | ninguno | `lista_para_analista` | `cedula.png`<br>`liquidacion-2026-09.pdf`<br>`liquidacion-2026-10.pdf`<br>`certificado-afp.pdf`<br>`certificado-antiguedad.pdf` |
| f03 | Carpeta completa, ambas liquidaciones en un solo PDF | ninguno | `lista_para_analista` | `cedula.png`<br>`liquidaciones-2026-09-y-2026-10.pdf`<br>`certificado-afp.pdf` |
| f04 | Cambio de empleador en el año, un mes sin cotizar entre trabajos | ninguno | `lista_para_analista` | `cedula.png`<br>`liquidacion-2026-09.pdf`<br>`liquidacion-2026-10.pdf`<br>`certificado-afp.pdf`<br>`certificado-antiguedad.pdf` |
| f05 | Falta el certificado de cotizaciones AFP | Documento faltante | `pedir_documento` | `cedula.png`<br>`liquidacion-2026-09.pdf`<br>`liquidacion-2026-10.pdf` |
| f06 | Falta la liquidación de octubre | Documento faltante | `pedir_documento` | `cedula.png`<br>`liquidacion-2026-09.pdf`<br>`certificado-afp.pdf` |
| f07 | Cédula vencida, residente extranjera | Documento vencido | `pedir_documento` | `cedula.png`<br>`liquidacion-2026-09.pdf`<br>`liquidacion-2026-10.pdf`<br>`certificado-afp.pdf` |
| f08 | RUT distinto en la liquidación de octubre | RUT distinto | `escalar_a_persona` | `cedula.png`<br>`liquidacion-2026-09.pdf`<br>`liquidacion-2026-10.pdf`<br>`certificado-afp.pdf` |
| f09 | Certificado AFP de otra persona | RUT distinto | `pedir_documento` | `cedula.png`<br>`liquidacion-2026-09.pdf`<br>`liquidacion-2026-10.pdf`<br>`certificado-afp.pdf` |
| f10 | Sueldo de las liquidaciones no cuadra con las cotizaciones | Sueldo no cuadra | `escalar_a_persona` | `cedula.png`<br>`liquidacion-2026-09.pdf`<br>`liquidacion-2026-10.pdf`<br>`certificado-afp.pdf`<br>`certificado-antiguedad.pdf` |
| f11 | Sueldo no cuadra y además falta la cédula | Sueldo no cuadra + Documento faltante | `escalar_a_persona` | `liquidacion-2026-09.pdf`<br>`liquidacion-2026-10.pdf`<br>`certificado-afp.pdf` |
| f12 | Carpeta completa, liquidación de septiembre fotografiada | ninguno | `lista_para_analista` | `cedula.png`<br>`liquidacion-2026-09-foto.png`<br>`liquidacion-2026-10.pdf`<br>`certificado-afp.pdf` |

## Subconjunto difícil

Los mismos tipos de documento, llegados como llegan los reales: fotos con perspectiva y sombra, escaneos con ruido y baja resolución, páginas giradas 90° y 180°, JPEG muy comprimidos, páginas inclinadas y liquidaciones de otro sistema de remuneraciones (plantilla B). Sirve para que la eval distinga mejoras: sus cifras se reportan aparte de las del subconjunto limpio.

6 carpetas, 24 archivos y 25 documentos (`cedula-identidad`: 6 · `liquidaciones-sueldo`: 12 · `cotizaciones-afp`: 5 · `certificado-antiguedad`: 2).

| Carpeta | Caso | Defecto plantado | Decisión esperada (provisional) | Archivos |
|---|---|---|---|---|
| d01 | Carpeta completa, todo fotografiado o escaneado | ninguno | `lista_para_analista` | `cedula-foto.jpg` (foto JPEG a 80 ppp, con perspectiva, con sombra, calidad 70)<br>`liquidacion-2026-09-foto.jpg` (foto JPEG a 110 ppp, con perspectiva, con sombra, calidad 60)<br>`liquidacion-2026-10-escaneo.pdf` (PDF escaneado a 80 ppp, con ruido)<br>`certificado-afp-escaneo.pdf` (PDF escaneado a 100 ppp, con ruido, inclinado 4°) |
| d02 | Carpeta completa, liquidaciones de otro formato y páginas giradas | ninguno | `lista_para_analista` | `cedula-invertida.png` (imagen PNG a 72 ppp, girado 180°)<br>`liquidacion-2026-09.pdf` (PDF vectorial, liquidación de otro formato (plantilla B))<br>`liquidacion-2026-10-girada.pdf` (PDF vectorial girado 90°, liquidación de otro formato (plantilla B))<br>`certificado-afp-invertido.pdf` (PDF vectorial girado 180°) |
| d03 | Sueldo no cuadra, con imágenes muy comprimidas | Sueldo no cuadra | `escalar_a_persona` | `cedula-comprimida.jpg` (imagen JPEG a 72 ppp, muy comprimido (calidad 12))<br>`liquidacion-2026-09-comprimida.jpg` (imagen JPEG a 100 ppp, muy comprimido (calidad 12), liquidación de otro formato (plantilla B))<br>`liquidacion-2026-10-comprimida.jpg` (imagen JPEG a 100 ppp, inclinado 3°, muy comprimido (calidad 15), liquidación de otro formato (plantilla B))<br>`certificado-afp-escaneo.pdf` (PDF escaneado a 75 ppp, con ruido) |
| d04 | RUT distinto en una liquidación escaneada de lado | RUT distinto | `escalar_a_persona` | `cedula-foto.png` (foto PNG a 80 ppp, con perspectiva, con sombra)<br>`liquidacion-2026-09-escaneo.pdf` (PDF escaneado a 90 ppp, con ruido, inclinado 3°, liquidación de otro formato (plantilla B))<br>`liquidacion-2026-10-escaneo-girado.pdf` (PDF escaneado a 100 ppp, con ruido, girado 90°)<br>`certificado-afp-foto.jpg` (foto JPEG a 110 ppp, con perspectiva, con sombra, calidad 50) |
| d05 | Cédula vencida fotografiada, liquidaciones en un solo escaneo | Documento vencido | `pedir_documento` | `cedula-foto.jpg` (foto JPEG a 80 ppp, con perspectiva, con sombra, calidad 55)<br>`liquidaciones-2026-09-y-2026-10-escaneo.pdf` (PDF escaneado a 90 ppp, con ruido)<br>`certificado-afp-escaneo-invertido.pdf` (PDF escaneado a 100 ppp, con ruido, girado 180°)<br>`certificado-antiguedad-escaneo.pdf` (PDF escaneado a 100 ppp, con ruido, inclinado 5°) |
| d06 | Falta el certificado AFP, liquidaciones fotografiadas | Documento faltante | `pedir_documento` | `cedula-girada.png` (imagen PNG a 72 ppp, girado 90°)<br>`liquidacion-2026-09-foto.jpg` (foto JPEG a 100 ppp, con perspectiva, con sombra, calidad 40)<br>`liquidacion-2026-10-foto.jpg` (foto JPEG a 100 ppp, con perspectiva, calidad 35, liquidación de otro formato (plantilla B))<br>`certificado-antiguedad-foto.jpg` (foto JPEG a 100 ppp, con perspectiva, con sombra, calidad 45) |

Cada carpeta trae `expected.json` con los campos esperados de cada documento, en el formato que devuelve docs2json,
cómo se produjo cada archivo, los defectos plantados y la decisión esperada. `manifest.json` guarda el SHA-256 de cada archivo.
La decisión esperada es provisional: la confirma la política de evaluación de la fase 3.
