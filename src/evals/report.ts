/** Markdown report, in Spanish, for one eval session. */
import { errorLabel } from '../docs2json/client'
import type { FolderTruth } from '../domain/truth'
import { percentile } from './stats'
import type { RunScore } from './score'
import type { SessionSummary } from './summary'

/** Responses this fast suggest the API answered from its cache, not the model. */
export const SUSPICIOUSLY_FAST_MS = 3_000

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`
const secs = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`
const show = (v: unknown) => {
  if (v === null || v === undefined) return '—'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  const clean = s.replace(/\|/g, '/').replace(/\n/g, ' ')
  return clean.length > 70 ? `${clean.slice(0, 67)}...` : clean
}

/** One line, and HTML error pages (from the CDN) reduced to a label. */
const cleanError = (e: string) => e.replace(/\s*<[\s\S]*$/, ' respuesta HTML del proxy').replace(/\s+/g, ' ').trim()

const DOCTYPE_LABELS: Record<string, string> = {
  'cedula-identidad': 'Cédula de identidad',
  'liquidaciones-sueldo': 'Liquidación de sueldo',
  'cotizaciones-afp': 'Certificado de cotizaciones AFP',
  'certificado-antiguedad': 'Certificado de antigüedad',
}
const label = (doctype: string) => DOCTYPE_LABELS[doctype] ?? doctype

const SUBSET_LABELS: Record<string, string> = { limpio: 'Limpio', dificil: 'Difícil' }

export function renderReport(summary: SessionSummary, scores: RunScore[], truths: FolderTruth[] = []): string {
  const runs = summary.runs
  const multi = runs.length > 1
  const runCols = runs.map((_, i) => `Corrida ${i + 1}`)
  const header = (cols: string[]) => `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|`
  const lines: string[] = []
  const push = (...l: string[]) => lines.push(...l)

  push(
    `# Reporte de evals de extracción · ${summary.sessionId}`,
    '',
    `> **Dataset sintético.** Estas cifras miden la API de docs2json sobre ${summary.dataset.folders} carpetas inventadas ` +
      `(${summary.dataset.files} archivos, ${summary.dataset.documents} documentos) generadas por este repositorio. ` +
      'No son precisión en producción: los documentos reales son más variados, llegan escaneados o fotografiados de mil formas ' +
      'y no siguen nuestras plantillas. Sirven para comparar versiones entre sí y detectar regresiones.',
    '',
    `Subconjuntos leídos: ${Object.entries(summary.bySubset).map(([k, v]) => `**${SUBSET_LABELS[k] ?? k}** (${v.dataset.folders} carpetas, ${v.dataset.files} archivos)`).join(' y ')}. ` +
      'El limpio trae documentos generados en PDF con texto; el difícil, fotos, escaneos, páginas giradas, JPEG comprimidos y otro formato de liquidación. ' +
      'Sus cifras se informan por separado: promediarlas mezclaría dos preguntas distintas.',
    '',
    '## La corrida',
    '',
    `- Fecha: ${summary.createdAt}`,
    `- Pasadas completas sobre el dataset: ${runs.length}`,
    `- Modelos que informó la API (\`meta.models\`): ${[...new Set(runs.flatMap(r => r.models))].join(', ') || '—'}`,
    `- Versión del catálogo de docs2json: ${[...new Set(runs.flatMap(r => r.catalogVersions))].join(', ') || '—'}`,
    `- Huella del dataset (SHA-256 de \`manifest.json\`): \`${summary.datasetFingerprint}\``,
    `- Llamadas HTTP a la API de lectura: **${summary.calls.httpCalls}** (planificadas ${summary.calls.planned}; ` +
      `reintentos por 429: ${summary.calls.rateLimited}; errores 5xx: ${summary.calls.serverErrors}; errores de red: ${summary.calls.networkErrors})`,
    '',
  )

  const h = summary.headline
  const avgCol = multi ? ['Promedio'] : []
  const row = (name: string, values: string[], avg?: string) => `| ${name} | ${values.join(' | ')} |${multi && avg !== undefined ? ` ${avg} |` : ''}`
  const avgOf = (pick: (r: (typeof runs)[number]) => number) => pct(runs.reduce((s, r) => s + pick(r), 0) / runs.length)
  push(
    '## Resultados principales',
    '',
    'Se separan dos preguntas distintas. **Disponibilidad**: ¿la API devolvió datos? **Calidad**: cuando devolvió datos, ¿eran correctos? ' +
      'Mezclarlas haría pasar una caída del servicio por un error del modelo, o al revés.',
    '',
    header(['Métrica', ...runCols, ...avgCol]),
    row('**Disponibilidad**: documentos que volvieron con tipo y datos', runs.map(r => `${pct(r.availability.rate)} (${r.availability.correct}/${r.availability.total})`), pct(h.availability)),
    row('Fallas explícitas: lecturas que terminaron en error HTTP (tras reintentar)', runs.map(r => `${r.failures.explicitFiles} de ${r.calls.files}`), ''),
    row('Fallas silenciosas: HTTP 200 sin tipo o sin campos', runs.map(r => String(r.failures.silentDocuments)), ''),
    row('Intentos fallidos, incluidos los que un reintento recuperó', runs.map(r => `${r.failures.failedAttempts} (${r.failures.recoveredByRetry} recuperadas)`), ''),
    row('**Calidad**: exactitud de clasificación', runs.map(r => `${pct(r.classification.rate)} (${r.classification.correct}/${r.classification.total})`), pct(h.classificationAccuracy)),
    row('Archivos separados en el número correcto de documentos', runs.map(r => `${pct(r.split.rate)} (${r.split.correct}/${r.split.total})`), pct(h.splitRate)),
    row('Exactitud de campos', runs.map(r => `${pct(r.fields.overall.accuracy)} (${r.fields.overall.correct}/${r.fields.overall.total})`), pct(h.fieldAccuracy)),
    row('Precisión de campos (de lo que devolvió con valor, cuánto estaba bien)', runs.map(r => pct(r.fields.overall.precision)), avgOf(r => r.fields.overall.precision)),
    row('Cobertura de campos (de lo esperado, cuánto volvió bien)', runs.map(r => pct(r.fields.overall.recall)), avgOf(r => r.fields.overall.recall)),
    row('**De punta a punta**: documentos bien clasificados, contando fallas', runs.map(r => `${pct(r.endToEnd.classification.rate)} (${r.endToEnd.classification.correct}/${r.endToEnd.classification.total})`), pct(h.endToEndClassification)),
    row('De punta a punta: campos que llegaron correctos', runs.map(r => `${pct(r.endToEnd.fields.rate)} (${r.endToEnd.fields.correct}/${r.endToEnd.fields.total})`), pct(h.endToEndFieldAccuracy)),
    row('Latencia p50 por archivo', runs.map(r => secs(r.latency.p50)), secs(h.latencyP50Ms)),
    row('Latencia p95 por archivo', runs.map(r => secs(r.latency.p95)), secs(h.latencyP95Ms)),
    '',
  )
  if (summary.consistency) {
    const c = summary.consistency
    push(
      `**Consistencia entre corridas:** entre los documentos que volvieron con datos en ambas pasadas, ${pct(c.fields.rate)} de los valores ` +
        `salieron idénticos (${c.fields.same} de ${c.fields.total}) y la clasificación coincidió en ${pct(c.classification.rate)}. ` +
        `${c.availabilityMismatch} documentos volvieron con datos en una pasada y fallaron en la otra.`,
      '',
    )
  }
  push(
    'Cómo leer las métricas de campos: **exactitud** es aciertos sobre campos evaluados; un campo cuenta como acierto si, ' +
      'después de normalizar formato, es igual al esperado. **Precisión** mira solo lo que la API devolvió con valor. ' +
      '**Cobertura** mira solo lo que debía venir con valor. Las métricas de calidad se calculan sobre documentos que volvieron con datos ' +
      'y, en el caso de los campos, bien clasificados; las fallas cuentan en disponibilidad y en las métricas de punta a punta.',
    '',
  )

  // Per subset
  const subsetEntries = Object.entries(summary.bySubset)
  if (subsetEntries.length > 1) {
    push('## Por subconjunto', '', 'Promedio de las pasadas. Las secciones siguientes suman ambos subconjuntos; para el detalle de uno, mira la carpeta (f = limpio, d = difícil).', '')
    push(header(['Subconjunto', 'Documentos', 'Disponibilidad', 'Clasificación', 'Campos (calidad)', 'Campos de punta a punta', 'Latencia p50 / p95']))
    for (const [k, v] of subsetEntries) {
      const x = v.headline
      push(`| ${SUBSET_LABELS[k] ?? k} | ${v.dataset.documents} | ${pct(x.availability)} | ${pct(x.classificationAccuracy)} | ${pct(x.fieldAccuracy)} | ${pct(x.endToEndFieldAccuracy)} | ${secs(x.latencyP50Ms)} / ${secs(x.latencyP95Ms)} |`)
    }
    push('')
  }

  // Per rendering (how the file arrived)
  const renderingOf = new Map(truths.flatMap(t => t.files.map(f => [`${t.id}/${f.file}`, f.rendering] as const)))
  if (renderingOf.size) {
    type Acc = { files: number; docs: number; usable: number; correct: number; fieldsOk: number; fieldsScored: number; fieldsExpected: number }
    const groups = new Map<string, Acc>()
    const kindOf = (label: string) => {
      const base = /^PDF vectorial/.test(label) ? 'PDF vectorial' : /^PDF escaneado/.test(label) ? 'PDF escaneado' : label.split(' a ')[0]!.split(',')[0]!
      const parts = [base]
      const rot = /girado (\d+)°/.exec(label)?.[1]
      if (rot) parts.push(`girado ${rot}°`)
      if (/muy comprimido/.test(label)) parts.push('muy comprimido')
      if (/plantilla B/.test(label)) parts.push('plantilla B')
      return parts.join(', ')
    }
    for (const sc of scores) {
      for (const f of sc.files) {
        const g = groups.get(kindOf(renderingOf.get(`${f.folder}/${f.file}`) ?? '?')) ?? { files: 0, docs: 0, usable: 0, correct: 0, fieldsOk: 0, fieldsScored: 0, fieldsExpected: 0 }
        g.files += 1
        groups.set(kindOf(renderingOf.get(`${f.folder}/${f.file}`) ?? '?'), g)
      }
      for (const d of sc.docs) {
        const g = groups.get(kindOf(renderingOf.get(`${d.folder}/${d.file}`) ?? '?'))!
        g.docs += 1
        g.fieldsExpected += d.fieldCount
        if (d.status === 'usable') g.usable += 1
        if (d.status === 'usable' && d.correct) g.correct += 1
      }
      for (const f of sc.fields) {
        if (!f.docUsable) continue
        const g = groups.get(kindOf(renderingOf.get(`${f.folder}/${f.file}`) ?? '?'))!
        g.fieldsScored += 1
        if (f.outcome === 'correct') g.fieldsOk += 1
      }
    }
    push(
      '## Por forma de llegada',
      '',
      'Sumando las pasadas. «Con datos» es disponibilidad; «Campos (calidad)» mide solo documentos que volvieron con datos y bien clasificados; ' +
        '«De punta a punta» cuenta las fallas. La descripción exacta de cada archivo está en su `expected.json`.',
      '',
      header(['Forma', 'Archivos', 'Documentos', 'Con datos', 'Bien clasificados', 'Campos (calidad)', 'Campos de punta a punta']),
    )
    for (const [k, g] of [...groups.entries()].sort()) {
      push(
        `| ${k} | ${g.files} | ${g.docs} | ${pct(g.docs ? g.usable / g.docs : 0)} | ${pct(g.usable ? g.correct / g.usable : 0)} | ${pct(g.fieldsScored ? g.fieldsOk / g.fieldsScored : 0)} | ${pct(g.fieldsExpected ? g.fieldsOk / g.fieldsExpected : 0)} |`,
      )
    }
    push('')
  }

  // Per doctype
  const doctypes = [...new Set(runs.flatMap(r => Object.keys(r.fields.byDoctype)))].sort()
  push('## Campos por tipo de documento', '', header(['Tipo', 'Campos por corrida', ...runCols.map(c => `Exactitud ${c.toLowerCase()}`), 'Precisión', 'Cobertura']))
  for (const d of doctypes) {
    const aggs = runs.map(r => r.fields.byDoctype[d])
    const first = aggs.find(Boolean)
    const precision = aggs.reduce((s, a) => s + (a?.precision ?? 0), 0) / aggs.length
    const recall = aggs.reduce((s, a) => s + (a?.recall ?? 0), 0) / aggs.length
    push(`| ${label(d)} | ${first?.total ?? 0} | ${aggs.map(a => (a ? pct(a.accuracy) : '—')).join(' | ')} | ${pct(precision)} | ${pct(recall)} |`)
  }
  push('')

  // Per field
  push('## Detalle por campo', '', 'Errores sumados en todas las corridas: incorrecto (valor distinto), omitido (vino vacío) e inventado (vino un valor donde no debía haber).', '')
  for (const d of doctypes) {
    push(`### ${label(d)}`, '', header(['Campo', ...runCols.map(c => `Exactitud ${c.toLowerCase()}`), 'Incorrectos', 'Omitidos', 'Inventados']))
    const keys = [...new Set(runs.flatMap(r => Object.keys(r.fields.byField)))].filter(k => k.startsWith(`${d}.`))
    for (const key of keys) {
      const aggs = runs.map(r => r.fields.byField[key])
      const sum = (k: 'wrong' | 'missing' | 'spurious') => aggs.reduce((s, a) => s + (a?.[k] ?? 0), 0)
      push(`| \`${key.slice(d.length + 1)}\` | ${aggs.map(a => (a ? `${pct(a.accuracy)} (${a.correct}/${a.total})` : '—')).join(' | ')} | ${sum('wrong')} | ${sum('missing')} | ${sum('spurious')} |`)
    }
    push('')
  }

  // Rows
  const rowKeys = [...new Set(runs.flatMap(r => Object.keys(r.rows)))].sort()
  if (rowKeys.length) {
    push('## Tablas: fila por fila', '', 'Las listas (haberes, descuentos y la tabla de cotizaciones) se comparan también por fila, sumando las corridas. Una lista cuenta como campo correcto solo si todas sus filas coinciden.', '')
    push(header(['Lista', 'Filas esperadas', 'Filas devueltas', 'Coinciden', 'Precisión', 'Cobertura']))
    for (const k of rowKeys) {
      const t = runs.reduce(
        (acc, r) => {
          const x = r.rows[k]
          return x ? { e: acc.e + x.expected, p: acc.p + x.predicted, m: acc.m + x.matched } : acc
        },
        { e: 0, p: 0, m: 0 },
      )
      push(`| \`${k}\` | ${t.e} | ${t.p} | ${t.m} | ${pct(t.p ? t.m / t.p : 0)} | ${pct(t.e ? t.m / t.e : 0)} |`)
    }
    push('')
  }

  // Confusion
  push('## Clasificación', '', 'Tipo esperado contra tipo devuelto, sumando las corridas. Las fallas aparecen como su propia categoría.', '')
  const confusion: Record<string, Record<string, number>> = {}
  for (const r of runs) {
    for (const [e, preds] of Object.entries(r.classification.confusion)) {
      for (const [p, n] of Object.entries(preds)) {
        const rowMap = (confusion[e] ??= {})
        rowMap[p] = (rowMap[p] ?? 0) + n
      }
    }
  }
  push(header(['Esperado', 'Devuelto', 'Documentos']))
  for (const [e, preds] of Object.entries(confusion).sort()) {
    for (const [p, n] of Object.entries(preds).sort()) push(`| ${label(e)} | ${p === e ? 'igual' : p.startsWith('(') ? p : `**${p}**`} | ${n} |`)
  }
  push('')

  // Consistency
  if (summary.consistency) {
    const c = summary.consistency
    push(
      '## Consistencia entre corridas',
      '',
      'La API no permite elegir el modelo (`meta.models` solo informa cuál corrió), así que no se pueden comparar dos modelos. ' +
        'En su lugar, el mismo dataset se lee dos veces con el mismo modelo y se mide cuánto cambia la respuesta.',
      '',
      `- Valores idénticos: ${c.fields.same} de ${c.fields.total} (${pct(c.fields.rate)}).`,
      ...Object.entries(c.fields.byDoctype).map(([d, v]) => `  - ${label(d)}: ${pct(v.rate)} (${v.same}/${v.total})`),
      `- Correctos en ambas: ${c.correctness.bothCorrect}. Incorrectos en ambas (error estable): ${c.correctness.bothWrong}. ` +
        `Correctos en una sola (inestables): ${c.correctness.flaky}.`,
      '',
    )
    if (c.unstable.length) {
      push(header(['Carpeta/archivo', 'Campo', 'Esperado', 'Corrida 1', 'Corrida 2']))
      for (const u of c.unstable.slice(0, 40)) {
        push(`| ${u.folder}/${u.file} | \`${u.field}\` | ${show(u.expected)} | ${show(u.a)} | ${show(u.b)} |`)
      }
      if (c.unstable.length > 40) push(`| … | ${c.unstable.length - 40} más | | | |`)
      push('')
    }
  }

  // Errors
  const errors = new Map<string, { folder: string; file: string; field: string; expected: unknown; got: string[]; runs: number[] }>()
  scores.forEach((s, i) => {
    for (const f of s.fields) {
      if (f.outcome === 'correct' || !f.docUsable) continue // empty documents are listed under silent failures
      const k = `${f.folder}/${f.file}#${f.index}.${f.field}`
      const e = errors.get(k) ?? { folder: f.folder, file: f.file, field: f.field, expected: f.expectedNorm, got: [], runs: [] }
      e.got.push(`${show(f.predictedNorm)} (${f.outcome === 'missing' ? 'omitido' : f.outcome === 'spurious' ? 'inventado' : 'incorrecto'})`)
      e.runs.push(i + 1)
      errors.set(k, e)
    }
  })
  push('## Errores de extracción observados', '')
  if (errors.size === 0) push('Ningún campo con error en los documentos que volvieron con datos.', '')
  else {
    push('Valores normalizados. Para las listas se muestra la clave de cada fila.', '', header(['Carpeta/archivo', 'Campo', 'Esperado', 'Obtenido', 'Corridas']))
    for (const e of [...errors.values()].slice(0, 80)) {
      push(`| ${e.folder}/${e.file} | \`${e.field}\` | ${show(e.expected)} | ${[...new Set(e.got)].join('; ')} | ${e.runs.join(', ')} |`)
    }
    if (errors.size > 80) push(`| … | ${errors.size - 80} más | | | |`)
    push('')
  }

  // Failures by cause
  const causes = new Map<string, number[]>()
  runs.forEach((r, i) => {
    for (const [k, n] of Object.entries(r.failures.failedAttemptsByCause)) {
      const arr = causes.get(k) ?? runs.map(() => 0)
      arr[i] = n
      causes.set(k, arr)
    }
  })
  if (causes.size) {
    push(
      '## Fallas por causa',
      '',
      'Intentos que fallaron, agrupados por causa. Un código entre corchetes (`503 ai_timeout`, `503 ai_unavailable`) es una falla explícita y tipada de docs2json; ' +
        '`504 del proxy` es CloudFront cortando la espera. Las sesiones anteriores a `20261119-1246` no guardaban el motivo de los reintentos, solo el de la falla final.',
      '',
      header(['Causa', ...runCols]),
      ...[...causes.entries()].sort().map(([k, ns]) => `| ${k} | ${ns.join(' | ')} |`),
      '',
    )
  }

  // Incomplete HTTP 200 answers, by kind
  {
    type Kind = 'sin_tipo' | 'sin_campos' | 'confianza_cero'
    const kinds: Record<Kind, string> = {
      sin_tipo: 'Sin tipo (doctype null): no clasificado',
      sin_campos: 'Con tipo pero sin ningún campo',
      confianza_cero: 'Con tipo y campos, pero confianza 0',
    }
    const rows = scores.flatMap((sc, i) =>
      sc.docs.flatMap(d => {
        const kind: Kind | null =
          d.status === 'empty' ? (d.predictedDoctype ? 'sin_campos' : 'sin_tipo') : d.status === 'usable' && d.confidence === 0 ? 'confianza_cero' : null
        return kind ? [{ run: i + 1, kind, d }] : []
      }),
    )
    push(
      '## Respuestas HTTP 200 incompletas',
      '',
      'Respuestas exitosas que no traen un documento completo. Las dos primeras filas son las fallas silenciosas que cuentan en la disponibilidad. ' +
        'Un documento sin tipo puede ser un no clasificado genuino (el clasificador corrió y no reconoció nada) o una falla del modelo; en este dataset todos los documentos son clasificables, así que cualquier «sin tipo» es un error. ' +
        'La última fila sí trae datos y cuenta como lectura, pero con confianza 0.',
      '',
      header(['Tipo de respuesta', ...runCols]),
      ...(Object.keys(kinds) as Kind[]).map(k => `| ${kinds[k]} | ${runs.map((_, i) => rows.filter(r => r.run === i + 1 && r.kind === k).length).join(' | ')} |`),
      '',
    )
    if (rows.length) {
      for (const r of rows) push(`- Corrida ${r.run}: ${r.d.folder}/${r.d.file} (documento ${r.d.index + 1}): ${kinds[r.kind].toLowerCase()}, confianza ${r.d.confidence ?? '—'}.`)
      push('')
    }
  }

  // Silent failures: HTTP 200 without a type or without fields
  const silent = runs.flatMap((r, i) => r.silentFailures.map(e => ({ ...e, run: i + 1 })))
  if (silent.length) {
    const byFile = new Map(scores.flatMap((sc, i) => sc.files.map(f => [`${i + 1}/${f.folder}/${f.file}`, f] as const)))
    push(
      '## Fallas silenciosas',
      '',
      'Documentos que la API devolvió con HTTP 200 pero sin tipo o sin ningún campo, con confianza 0 o sin confianza. No es un error HTTP: ' +
        'quien consuma la API tiene que detectarlo y tratarlo como lectura fallida (reintentar o escalar).',
      '',
      header(['Corrida', 'Carpeta/archivo', 'Tipo devuelto', 'Confianza', 'Latencia']),
      ...silent.map(e => {
        const f = byFile.get(`${e.run}/${e.folder}/${e.file}`)
        return `| ${e.run} | ${e.folder}/${e.file} | ${e.doctype ?? '—'} | ${e.confidence ?? '—'} | ${f ? secs(f.latencyMs) : '—'} |`
      }),
      '',
    )
  }

  // Classification errors and API failures
  const misses = scores.flatMap((s, i) => s.docs.filter(d => d.status === 'usable' && !d.correct).map(d => ({ ...d, run: i + 1 })))
  const failures = scores.flatMap((s, i) => s.files.filter(f => !f.ok).map(f => ({ ...f, run: i + 1 })))
  if (misses.length || failures.length) {
    push('## Errores de clasificación y fallas HTTP', '')
    for (const m of misses) push(`- Corrida ${m.run}: ${m.folder}/${m.file} (documento ${m.index + 1}) esperado \`${m.expectedDoctype}\`, devuelto \`${m.predictedDoctype ?? 'ninguno'}\`.`)
    for (const f of failures) push(`- Corrida ${f.run}: ${f.folder}/${f.file} falló tras ${f.attempts} intentos: ${cleanError(f.error ?? `HTTP ${f.status}`)}.`)
    push('')
  }

  // Latency
  push('## Latencia', '', 'Tiempo de pared medido desde este cliente para cada archivo: incluye red, cola del servidor y todas las llamadas al modelo que haga docs2json.', '')
  push(header(['Tipo de archivo', ...runCols.map(c => `p50 / p95 ${c.toLowerCase()}`), 'Archivos']))
  const mimes = [...new Set(runs.flatMap(r => Object.keys(r.latency.byMimeType)))].sort()
  for (const m of mimes) {
    const cells = runs.map(r => {
      const x = r.latency.byMimeType[m]
      return x ? `${secs(x.p50)} / ${secs(x.p95)}` : '—'
    })
    push(`| ${m} | ${cells.join(' | ')} | ${runs[0]?.latency.byMimeType[m]?.n ?? 0} |`)
  }
  const doctypeOf = new Map(truths.flatMap(t => t.files.map(f => [`${t.id}/${f.file}`, f.documents[0]?.doctype ?? '?'] as const)))
  if (doctypeOf.size) {
    push('', '**Por tipo de documento** (lecturas exitosas; el PDF con dos liquidaciones cuenta como liquidación):', '')
    push(header(['Tipo de documento', ...runCols.map(c => `p50 / p95 / máx. ${c.toLowerCase()}`)]))
    const doctypes = [...new Set(doctypeOf.values())].sort()
    for (const d of doctypes) {
      const cells = scores.map(sc => {
        const l = sc.files.filter(f => f.ok && doctypeOf.get(`${f.folder}/${f.file}`) === d).map(f => f.latencyMs)
        return l.length ? `${secs(percentile(l, 50))} / ${secs(percentile(l, 95))} / ${secs(Math.max(...l))}` : '—'
      })
      push(`| ${label(d)} | ${cells.join(' | ')} |`)
    }
    const cedulas = [...doctypeOf.entries()].filter(([, d]) => d === 'cedula-identidad').map(([k]) => k).sort()
    if (cedulas.length) {
      push('', '**Cada cédula** (latencia del último intento, intentos y resultado):', '')
      push(header(['Archivo', ...runCols]))
      for (const k of cedulas) {
        const cells = scores.map(sc => {
          const f = sc.files.find(x => `${x.folder}/${x.file}` === k)
          if (!f) return '—'
          const outcome = f.ok ? 'ok' : cleanError(f.error ?? `HTTP ${f.status}`)
          return `${secs(f.latencyMs)} · ${f.attempts} intento(s) · ${outcome}${f.retries?.length ? ` (antes: ${f.retries.map(errorLabel).join(', ')})` : ''}`
        })
        push(`| ${k} | ${cells.join(' | ')} |`)
      }
    }
  }
  const fast = scores.flatMap((s, i) =>
    s.files
      .filter(f => f.ok && f.latencyMs < SUSPICIOUSLY_FAST_MS)
      .map(f => `${f.folder}/${f.file} (corrida ${i + 1}, ${secs(f.latencyMs)}${f.attempts > 1 ? `, en el intento ${f.attempts}: el servidor pudo reutilizar el trabajo del intento anterior` : ''})`),
  )
  push('', fast.length ? `**Respuestas sospechosamente rápidas (posible caché):** ${fast.join(', ')}.` : `Ninguna respuesta bajó de ${secs(SUSPICIOUSLY_FAST_MS)}: no hay señales de lecturas servidas desde caché.`, '')

  push(
    '## Límites de esta medición',
    '',
    `- **Sintético.** ${summary.dataset.documents} documentos hechos con plantillas propias. Incluso el subconjunto difícil degrada documentos generados; no predice el desempeño con documentos reales.`,
    '- **Techo.** Si la calidad sale cerca de 100%, el dataset es demasiado fácil para distinguir una mejora: solo sirve para detectar regresiones. Para medir mejoras hacen falta documentos más difíciles (escaneos malos, fotos oscuras, formatos de otros empleadores).',
    '- **Disponibilidad de un momento.** Las fallas dependen de la carga del servidor y de Vertex en la ventana de la corrida; otra hora puede dar otra cifra.',
    `- **Muestra chica.** Con ${summary.dataset.documents} documentos por pasada, un documento son ${pct(1 / Math.max(1, summary.dataset.documents))} de exactitud de clasificación. Las diferencias pequeñas entre corridas no son significativas.`,
    '- **Sin comparación de modelos.** La API no expone selección de modelo. Se mide consistencia entre dos lecturas del mismo modelo; comparar modelos requeriría que docs2json lo permitiera.',
    '- **Caché.** docs2json guarda resultados por contenido. Cada pasada sella los archivos con su etiqueta (texto al pie en PDF, metadato en PNG) para obligar una lectura nueva; las respuestas de menos de 3 s se marcan como sospechosas.',
    '- **Costo.** La API no informa tokens ni costo. Se informa el número de llamadas; el costo real está en la facturación de Vertex de docs2json.',
    '- **Latencia.** Medida desde el cliente; depende de la red y de la carga del servidor en ese momento.',
    '- **Normalización.** RUT, montos, fechas, meses, nombres (mismas palabras en cualquier orden), instituciones (sin «AFP» ni «Isapre») y textos (sin tildes, mayúsculas ni puntuación) se comparan normalizados. Un error de tildes no cuenta como error.',
    '',
  )
  return lines.join('\n')
}
