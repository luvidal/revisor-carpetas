# Política de evaluación de carpetas de crédito de consumo

> **MUESTRA SINTÉTICA.** Política inventada para el proyecto revisor-carpetas. No corresponde a ninguna institución financiera real ni a normativa vigente.

Versión: 2026-11-19 · Uso: revisión documental previa al análisis de crédito.

## 1. Objetivo y alcance

Esta política define cómo se revisa la carpeta de documentos de una persona que solicita un crédito de consumo antes de que la vea un analista. La revisión documental no aprueba ni rechaza créditos: decide si la carpeta queda lista para el analista, si hay que pedir un documento al solicitante o si una persona debe revisarla antes de seguir.

Aplica a trabajadores dependientes con contrato vigente. Los trabajadores independientes tienen requisitos propios, descritos en la regla 3.4. La evaluación de capacidad de pago, el puntaje y el monto del crédito están fuera de esta revisión y los resuelve el analista.

## 2. Definiciones

**Carpeta:** el conjunto de archivos que entrega el solicitante. Un archivo puede contener más de un documento, por ejemplo dos liquidaciones en un mismo PDF.

**Solicitante:** la persona que pide el crédito. Su identidad declarada en la solicitud (nombre y RUT) se confirma con la cédula de identidad.

**Fecha de revisión:** el día en que se revisa la carpeta. Las vigencias y los meses exigidos se calculan respecto de ella.

**Cotización AFP:** el monto que el empleador descuenta de la remuneración y paga a la administradora de fondos de pensiones. Equivale a un porcentaje fijo de la renta imponible más la comisión de la AFP.

**Documento ilegible:** un documento del que no se pudo obtener un dato necesario para la revisión, aunque el archivo se haya recibido.

## 3. Documentos requeridos

### Regla 3.1 · Documentos mínimos de un trabajador dependiente

La carpeta debe contener la cédula de identidad del solicitante, sus liquidaciones de sueldo de los dos meses calendario anteriores al mes de la fecha de revisión y su certificado de cotizaciones previsionales de los últimos doce meses, emitido por la AFP o por Previred. Solo cuentan los documentos del propio solicitante. Si falta cualquiera de ellos, la carpeta no puede avanzar y se le pide el documento faltante, indicando cuál es y de qué mes.

**Decisión:** pedir el documento.

**Parámetros:** meses_liquidaciones = 2; meses_certificado_afp = 12

### Regla 3.2 · Liquidaciones de otros meses

Si la carpeta incluye liquidaciones de meses distintos a los exigidos, por ejemplo de meses más antiguos, se conservan como antecedente para el analista. No reemplazan a las liquidaciones de los meses exigidos ni bastan para cumplir la regla 3.1.

**Decisión:** observación para el analista.

### Regla 3.3 · Documentos que no corresponden a la revisión

Los documentos de tipos que esta revisión no usa, como cartolas bancarias, contratos de arriendo o comprobantes de pago de servicios, no se evalúan. Se informan al analista para que decida si le sirven.

**Decisión:** observación para el analista.

### Regla 3.4 · Trabajadores independientes

Cuando el solicitante emite boletas de honorarios o declara renta como independiente, en lugar de liquidaciones de sueldo debe entregar el resumen anual de boletas de honorarios del Servicio de Impuestos Internos y su última declaración anual de impuestos. Sin esos documentos no es posible acreditar sus ingresos.

**Decisión:** pedir el documento.

## 4. Identidad del solicitante

### Regla 4.1 · Cédula de identidad vigente

La cédula de identidad debe estar vigente en la fecha de revisión, es decir, su fecha de vencimiento debe ser posterior a esa fecha. Una cédula vencida no permite acreditar la identidad, aunque los datos coincidan con el resto de la carpeta. Se le pide al solicitante una cédula vigente.

**Decisión:** pedir el documento.

### Regla 4.2 · Documentos de otra persona

Todos los documentos deben pertenecer al solicitante. Si un documento muestra otro nombre y otro RUT válido, corresponde a otra persona, aunque compartan apellidos, como ocurre con familiares. Ese documento no se considera y se pide el documento equivalente del solicitante.

**Decisión:** pedir el documento.

### Regla 4.3 · Mismo nombre con otro RUT

Si un documento tiene el nombre del solicitante pero un RUT distinto al de su cédula, y ese RUT tiene un dígito verificador válido, puede tratarse de un error del emisor o de una adulteración del documento. No se resuelve automáticamente: una persona revisa la carpeta y, si corresponde, contacta al emisor.

**Decisión:** escalar a una persona.

### Regla 4.4 · RUT ilegible con el nombre correcto

Si un RUT leído en un documento tiene un dígito verificador inválido, no puede ser un RUT real y se trata de un error de lectura. Cuando el nombre del documento coincide con el del solicitante y el resto de la carpeta confirma su identidad, la revisión continúa y se deja constancia para el analista.

**Decisión:** observación para el analista.

### Regla 4.5 · Diferencias de nombre con el mismo RUT

Si un documento tiene el RUT del solicitante pero su nombre presenta diferencias, como un segundo nombre omitido o un apellido abreviado, la identidad queda acreditada por el RUT. La diferencia se informa al analista.

**Decisión:** observación para el analista.

## 5. Ingresos

### Regla 5.1 · Liquidaciones respaldadas por las cotizaciones

Los ingresos declarados en las liquidaciones deben estar respaldados por las cotizaciones pagadas. Para cada mes exigido, la cotización AFP descontada en la liquidación debe coincidir con la cotización que el certificado registra como pagada ese mismo mes. Se acepta una diferencia de hasta 2% del monto del certificado o de $ 1.000, lo que sea mayor, para absorber redondeos y ajustes menores. Una diferencia mayor indica que la renta de la liquidación no corresponde a la que se cotizó, lo que puede deberse a una liquidación adulterada; una persona debe revisarla.

**Decisión:** escalar a una persona.

**Parámetros:** tolerancia_relativa = 0,02; tolerancia_absoluta = 1000

### Regla 5.2 · Ingresos que no se pudieron verificar

Si no es posible comparar una liquidación con el certificado de cotizaciones, porque el certificado no incluye ese mes o porque no se pudo leer la cotización descontada, la comparación queda pendiente y se informa al analista para que la complete.

**Decisión:** observación para el analista.

### Regla 5.3 · AFP distinta entre liquidación y certificado

Si la administradora de fondos de pensiones que indica la liquidación no es la misma que emite el certificado de cotizaciones, puede deberse a un cambio de AFP reciente o a un error de lectura. Se informa al analista, que verifica la afiliación vigente.

**Decisión:** observación para el analista.

### Regla 5.4 · Lagunas previsionales

Los meses sin cotizaciones dentro del período del certificado se informan al analista. Más de tres meses seguidos sin cotizar en el último año pueden indicar inestabilidad laboral y el analista los considera al evaluar la capacidad de pago.

**Decisión:** observación para el analista.

### Regla 5.5 · Renta mínima

Para un crédito de consumo se exige una renta líquida mensual mínima de $ 500.000. Esta exigencia la evalúa el analista con la información de la carpeta; la revisión documental no la aplica.

**Decisión:** observación para el analista.

## 6. Calidad de la lectura

### Regla 6.1 · Archivo que no se pudo leer

Si un archivo de la carpeta no se pudo leer después de los reintentos permitidos, por ejemplo porque el servicio de lectura no respondió a tiempo, no se puede saber qué documento contenía. La carpeta no se decide a ciegas: una persona revisa el archivo. Tampoco se informa como faltante un documento que podría estar en ese archivo.

**Decisión:** escalar a una persona.

### Regla 6.2 · Dato necesario ilegible

Si un documento se recibió pero no se pudo obtener un dato necesario para la revisión, como el RUT, el período de una liquidación, la fecha de vencimiento de la cédula o la tabla de cotizaciones, el documento no permite completar la revisión. Una persona lo revisa.

**Decisión:** escalar a una persona.

### Regla 6.3 · Lectura con baja confianza

Si el servicio de lectura informa una confianza menor a 0,8 para un documento, sus datos no se consideran confiables para decidir. Una persona revisa el documento.

**Decisión:** escalar a una persona.

**Parámetros:** confianza_minima = 0,8

### Regla 6.4 · RUT ilegible con otro nombre

Si un documento trae un RUT con dígito verificador inválido y además un nombre que no es el del solicitante, no se puede saber a quién pertenece. Una persona lo revisa.

**Decisión:** escalar a una persona.

## 7. Cómo se combina la decisión

Una carpeta puede tener varios hallazgos. Si alguno requiere escalar a una persona, la carpeta se escala. Si ninguno requiere escalar pero falta algún documento, se pide. Si no hay hallazgos de esos tipos, la carpeta queda lista para el analista. En todos los casos se informan todos los hallazgos, para que quien reciba la carpeta vea el panorama completo y no solo el motivo principal. Cada hallazgo indica la regla que lo gobierna y el documento y dato que lo sustentan.

## 8. Deudas y comportamiento de pago

### Regla 8.1 · Morosidades vigentes

Si el informe de deudas o el informe comercial del solicitante muestra morosidades o protestos vigentes, la evaluación no puede continuar sin la revisión de una persona, que evalúa si corresponde pedir un certificado de pago o rechazar la solicitud.

**Decisión:** escalar a una persona.

## 9. Plazos

Los documentos de ingresos deben ser recientes: las liquidaciones son las de los meses exigidos en la regla 3.1 y el certificado de cotizaciones debe haberse emitido dentro de los 30 días anteriores a la fecha de revisión. Cuando se pide un documento, el solicitante tiene 10 días hábiles para entregarlo; vencido ese plazo, la solicitud se cierra y puede presentarse de nuevo.
